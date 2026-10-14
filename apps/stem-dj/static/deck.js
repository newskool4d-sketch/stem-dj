// Deck — 덱 하나의 오디오 그래프·재생 상태·플래터/파형 뷰
import { $, log, fmtTime, playbackSupportHint, setBpmCache } from "./util.js";
import { estimateBpm, makePeaks, sliceFrames } from "./analysis.js";
import { computeStemGains, loopWrapPosition, clampSeek } from "./deck-logic.js";
import { applyAudioParamTarget, audioParamTarget } from "./audio-params.js";
import {
  loopAwareSeekTarget,
  scratchGrainMetadata,
  scratchSliceMetadata,
} from "./platter-logic.js";
import { formatStemJobStatus, stemReadinessLabel } from "./ui-state.js";
import { audioCtx, masterGain, ensureAudio } from "./audio-engine.js";
import { createImpulse, FlangerNode, PhaserNode } from "./fx.js";
import { drawWaveCanvas } from "./waveform.js";
import { refreshLibrary } from "./library.js";

export const STEMS = ["vocals", "drums", "bass", "other"];
const STEM_LABELS = { vocals: "Vocal", drums: "Drums", bass: "Bass", other: "Other" };

let bitcrusherModuleLoaded = false;

export class Deck {
  constructor(id, { onGraphReady } = {}) {
    this.id = id;
    this.onGraphReady = onGraphReady;
    this.track = null;
    this.mode = "mix";
    this.elements = {};
    this.sources = {};
    this.stemGains = {};
    this.cues = [null, null, null, null];
    this.mainCue = null;
    this.stemState = {
      volumes: Object.fromEntries(STEMS.map((name) => [name, 1])),
      mutes: {},
      solos: {},
    };
    this.vinylMode = false;
    this.zoomPeaks = [];
    this.loopBeats = 0;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.bpm = null;
    this.wavePeaks = [];
    this.zoomWindow = 24;
    this.rotation = 0;
    this.dragging = false;
    this.wasPlaying = false;
    this.audioBuffer = null;
    this.lastScratchAt = 0;
    this.lastWaveDrawAt = 0;
    this.lastPlatterDrawAt = 0;
    this.stemJobRunning = false;
    this.buildStemControls();
    this.bindControls();
    this.drawPlatter();
    this.drawWave();
    this.drawZoomWave();
  }

  async initGraph() {
    await ensureAudio();
    if (this.deckInput) return;
    this.deckInput = audioCtx.createGain();
    this.low = audioCtx.createBiquadFilter();
    this.low.type = "lowshelf";
    this.low.frequency.value = 180;
    this.mid = audioCtx.createBiquadFilter();
    this.mid.type = "peaking";
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 1;
    this.high = audioCtx.createBiquadFilter();
    this.high.type = "highshelf";
    this.high.frequency.value = 4200;
    this.filter = audioCtx.createBiquadFilter();
    this.filter.type = "allpass";
    this.filter.frequency.value = 1200;
    this.delay = audioCtx.createDelay(1.2);
    this.delay.delayTime.value = 0.28;
    this.feedback = audioCtx.createGain();
    this.feedback.gain.value = 0.28;
    this.echoWet = audioCtx.createGain();
    this.echoWet.gain.value = 0;
    this.reverb = audioCtx.createConvolver();
    this.reverb.buffer = createImpulse(audioCtx);
    this.reverbWet = audioCtx.createGain();
    this.reverbWet.gain.value = 0;
    this.deckGain = audioCtx.createGain();

    this.deckInput.connect(this.low);
    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.filter);
    this.filter.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.echoWet);
    this.echoWet.connect(this.deckGain);
    this.filter.connect(this.reverb);
    this.reverb.connect(this.reverbWet);
    this.reverbWet.connect(this.deckGain);
    // 새 FX 체인: filter → flanger → phaser → bitcrusher → deckGain
    this.flanger = new FlangerNode(audioCtx);
    this.phaser = new PhaserNode(audioCtx);
    this.bitcrusherReady = false;
    try {
      if (!bitcrusherModuleLoaded) {
        await audioCtx.audioWorklet.addModule("/bitcrusher-processor.js");
        bitcrusherModuleLoaded = true;
      }
      this.bitcrusher = new AudioWorkletNode(audioCtx, "bitcrusher");
      this.bitcrusherReady = true;
    } catch {
      this.bitcrusher = audioCtx.createGain();
    }
    this.filter.connect(this.flanger.input);
    this.flanger.output.connect(this.phaser.input);
    this.phaser.output.connect(this.bitcrusher);
    this.chanGain = audioCtx.createGain();
    this.chanGain.gain.value = 1;
    this.bitcrusher.connect(this.chanGain);
    this.chanGain.connect(this.deckGain);
    this.deckGain.connect(masterGain);
    this.onGraphReady?.();
  }

  bindControls() {
    $(`play${this.id}`).addEventListener("click", () => this.togglePlay());
    $(`cue${this.id}`).addEventListener("click", () => {
      if (this.isPlaying()) {
        this.mainCue = this.currentTime();
        this.pause();
        $(`cue${this.id}`).classList.add("active");
      } else {
        this.jumpTo(this.mainCue ?? 0);
      }
    });
    $(`stem${this.id}`).addEventListener("click", () => splitStems(this));
    $(`chanVol${this.id}`)?.addEventListener("input", (e) => {
      if (this.chanGain) this.chanGain.gain.value = Number(e.target.value) / 100;
    });
    $(`tempo${this.id}`).addEventListener("input", (e) => {
      const value = Number(e.target.value);
      $(`tempoRead${this.id}`).textContent = `${value.toFixed(1)}%`;
      this.playbackRate = 1 + value / 100;
      this.activeElements().forEach((el) => el.playbackRate = this.playbackRate);
    });
    ["low", "mid", "high"].forEach((name) => {
      const input = $(`${name}${this.id}`);
      const read = $(`${name}Read${this.id}`);
      const updateRead = (v) => { if (read) read.textContent = (v >= 0 ? "+" : "") + v; };
      updateRead(Number(input.value));
      input.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        if (this[name]) this[name].gain.value = v;
        updateRead(v);
      });
    });
    $(`filter${this.id}`).addEventListener("input", (e) => {
      if (!this.filter) return;
      const value = Number(e.target.value);
      if (value === 0) {
        this.filter.type = "allpass";
        this.filter.frequency.value = 1200;
      } else if (value < 0) {
        this.filter.type = "lowpass";
        this.filter.frequency.value = 220 + (100 + value) * 72;
      } else {
        this.filter.type = "highpass";
        this.filter.frequency.value = 80 + value * 38;
      }
    });
    $(`echo${this.id}`).addEventListener("input", (e) => {
      if (this.echoWet) this.echoWet.gain.value = Number(e.target.value) / 100;
    });
    $(`reverb${this.id}`).addEventListener("input", (e) => {
      if (this.reverbWet) this.reverbWet.gain.value = Number(e.target.value) / 100;
    });
    const vinyl = $(`vinyl${this.id}`);
    if (vinyl) {
      this.vinylMode = vinyl.checked;
      vinyl.addEventListener("change", () => { this.vinylMode = vinyl.checked; });
    }
    this.bindPlatter();
    this.buildCues();
  }

  buildCues() {
    const wrap = $(`cues${this.id}`);
    wrap.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const btn = document.createElement("button");
      btn.addEventListener("click", (event) => {
        if (event.shiftKey) this.clearHotCue(i);
        else this.hotCue(i);
      });
      wrap.appendChild(btn);
    }
    this.refreshCueButtons();
  }

  refreshCueButtons() {
    const wrap = $(`cues${this.id}`);
    if (!wrap) return;
    wrap.querySelectorAll("button").forEach((btn, i) => {
      if (this.cues[i] != null) {
        btn.textContent = fmtTime(this.cues[i]);
        btn.title = `Hot Cue ${i + 1}: ${fmtTime(this.cues[i])} — Shift+클릭으로 삭제`;
        btn.classList.add("active");
      } else {
        btn.textContent = String(i + 1);
        btn.title = `Hot Cue ${i + 1}: 클릭하여 현재 위치 저장`;
        btn.classList.remove("active");
      }
    });
  }

  hotCue(i) {
    if (this.cues[i] == null) {
      this.cues[i] = this.currentTime();
      log(`Deck ${this.id} Hot Cue ${i + 1} set at ${fmtTime(this.cues[i])}`);
    } else {
      this.jumpTo(this.cues[i]);
    }
    this.refreshCueButtons();
  }

  clearHotCue(i) {
    this.cues[i] = null;
    this.refreshCueButtons();
  }

  triggerHotCue(i) {
    this.hotCue(i);
  }

  buildStemControls() {
    const wrap = $(`stems${this.id}`);
    wrap.innerHTML = "";
    STEMS.forEach((name) => {
      const card = document.createElement("div");
      card.className = "stem-card";
      card.innerHTML = `
        <strong>${STEM_LABELS[name]}</strong>
        <input type="range" min="0" max="100" value="100" data-stem-volume="${name}">
        <div class="stem-actions">
          <button data-stem-mute="${name}">Mute</button>
          <button data-stem-solo="${name}">Solo</button>
        </div>`;
      wrap.appendChild(card);
    });
    wrap.querySelectorAll("[data-stem-volume]").forEach((input) => {
      input.addEventListener("input", () => {
        this.stemState.volumes[input.dataset.stemVolume] = Number(input.value) / 100;
        this.applyStemGains();
      });
    });
    wrap.querySelectorAll("[data-stem-mute]").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        this.stemState.mutes[btn.dataset.stemMute] = btn.classList.contains("active");
        this.applyStemGains();
      });
    });
    wrap.querySelectorAll("[data-stem-solo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        this.stemState.solos[btn.dataset.stemSolo] = btn.classList.contains("active");
        this.applyStemGains();
      });
    });
  }

  async loadMix(track) {
    await this.initGraph();
    this.stop();
    this.disconnectSources();
    this.track = track;
    this.mode = "mix";
    this.elements = { mix: this.createElement(track.url, track.filename || track.title || "") };
    this.connectElement("mix", this.elements.mix);
    this.updateTitle(track.title || track.filename || "Untitled");
    this.audioBuffer = null;
    this.wavePeaks = [];
    this.bpm = null;
    $(`bpm${this.id}`).textContent = "BPM --";
    this.clearLoop(true);
    this.elements.mix.addEventListener("loadedmetadata", () => {
      $(`duration${this.id}`).textContent = fmtTime(this.elements.mix.duration);
    }, { once: true });
    log(`Deck ${this.id} loaded: ${track.title || track.filename}`);
    this.analyze(track.url).catch((err) => log(`Deck ${this.id} waveform 분석 실패: ${err.message}`));
  }

  async loadStems(stems) {
    await this.initGraph();
    const at = this.currentTime();
    const wasPlaying = this.isPlaying();
    this.stop();
    this.disconnectSources();
    this.mode = "stems";
    this.elements = {};
    for (const name of STEMS) {
      this.elements[name] = this.createElement(stems[name], `${name}.wav`);
      this.connectElement(name, this.elements[name]);
      this.elements[name].currentTime = at;
    }
    this.applyStemGains();
    if (wasPlaying) await this.play();
    log(`Deck ${this.id} stem mode ready`);
  }

  createElement(url, filename = "") {
    const el = new Audio(url);
    el.preload = "auto";
    el.playbackRate = this.playbackRate || 1;
    el.addEventListener("error", () => {
      const reason = el.error?.message || "unsupported file";
      log(`Deck ${this.id} 재생 불가: ${filename || "audio file"} | ${reason}. ${playbackSupportHint(filename)}`);
    });
    return el;
  }

  connectElement(name, el) {
    const source = audioCtx.createMediaElementSource(el);
    const gain = audioCtx.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(this.deckInput);
    this.sources[name] = source;
    this.stemGains[name] = gain;
  }

  disconnectSources() {
    Object.values(this.elements).forEach((el) => {
      try { el.pause(); } catch {}
    });
    Object.values(this.sources).forEach((node) => {
      try { node.disconnect(); } catch {}
    });
    Object.values(this.stemGains).forEach((node) => {
      try { node.disconnect(); } catch {}
    });
    this.sources = {};
    this.stemGains = {};
  }

  activeElements() {
    return Object.values(this.elements);
  }

  primaryElement() {
    return this.elements.mix || this.elements.vocals || this.activeElements()[0] || null;
  }

  async play() {
    if (!this.activeElements().length) {
      log(`Deck ${this.id}에 로드된 곡이 없습니다.`);
      return;
    }
    await ensureAudio();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const time = this.currentTime();
    const results = await Promise.all(this.activeElements().map((el) => {
      el.currentTime = time;
      el.playbackRate = this.playbackRate || 1;
      return el.play().then(() => true).catch((err) => {
        log(`Deck ${this.id} 재생 실패: ${err.message}`);
        return false;
      });
    }));
    if (results.some(Boolean)) $(`play${this.id}`).textContent = "Pause";
  }

  pause() {
    this.activeElements().forEach((el) => el.pause());
    $(`play${this.id}`).textContent = "Play";
  }

  stop() {
    this.pause();
    this.activeElements().forEach((el) => el.currentTime = 0);
  }

  togglePlay() {
    this.isPlaying() ? this.pause() : this.play();
  }

  isPlaying() {
    const el = this.primaryElement();
    return !!el && !el.paused;
  }

  currentTime() {
    return this.primaryElement()?.currentTime || 0;
  }

  duration() {
    return this.primaryElement()?.duration || 0;
  }

  jumpTo(time) {
    const safe = clampSeek(time, this.duration());
    this.activeElements().forEach((el) => el.currentTime = safe);
  }

  updateTitle(title) {
    $(`title${this.id}`).textContent = title;
  }

  applyStemGains() {
    const gains = computeStemGains(STEMS, this.stemState);
    const now = audioCtx?.currentTime ?? 0;
    STEMS.forEach((name) => {
      const gain = this.stemGains[name];
      applyAudioParamTarget(gain?.gain, audioParamTarget(gains[name], { now }));
    });
  }

  async analyze(url) {
    try {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const audio = await audioCtx.decodeAudioData(buffer.slice(0));
      this.audioBuffer = audio;
      const samples = audio.getChannelData(0);
      this.wavePeaks = makePeaks(samples, 1200);
      this.zoomPeaks = makePeaks(samples, 6000);
      this.bpm = estimateBpm(samples, audio.sampleRate);
      $(`bpm${this.id}`).textContent = this.bpm ? `BPM ${this.bpm}` : "BPM --";
      if (this.track?.id && this.bpm) setBpmCache(this.track.id, this.bpm);
      this.drawWave();
      this.drawZoomWave();
    } catch (err) {
      this.wavePeaks = [];
      this.zoomPeaks = [];
      this.bpm = null;
      this.drawWave();
      this.drawZoomWave();
      log(`Waveform 분석 실패: ${err.message}`);
    }
  }

  setLoop(beats) {
    this.loopBeats = Number(beats);
    if (!this.loopBeats) {
      this.clearLoop();
      return;
    }
    const bpm = this.bpm || 120;
    this.loopStart = this.currentTime();
    this.loopEnd = this.loopStart + (60 / bpm) * this.loopBeats;
    this.updateLoopUi();
    this.drawWave();
    this.drawZoomWave();
    log(`Deck ${this.id} loop ${this.loopBeats} beat: ${fmtTime(this.loopStart)} - ${fmtTime(this.loopEnd)}${this.bpm ? "" : " (BPM 120 기준)"}`);
  }

  clearLoop(silent = false) {
    this.loopBeats = 0;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.updateLoopUi();
    this.drawWave();
    this.drawZoomWave();
    if (!silent) log(`Deck ${this.id} loop off`);
  }

  updateLoopUi() {
    const readout = $(`loopRead${this.id}`);
    if (readout) {
      readout.textContent = this.loopEnd
        ? `${this.loopBeats} beat | ${fmtTime(this.loopStart)} - ${fmtTime(this.loopEnd)}${this.bpm ? "" : " | 120 BPM"}`
        : "Loop off";
    }
    document.querySelectorAll(`[data-deck="${this.id}"][data-loop]`).forEach((btn) => {
      btn.classList.toggle("active", this.loopBeats > 0 && Number(btn.dataset.loop) === this.loopBeats);
    });
  }

  tick(now = performance.now()) {
    const el = this.primaryElement();
    if (!el) return;
    const wrapped = loopWrapPosition(el.currentTime, this.loopStart, this.loopEnd);
    if (wrapped !== null) this.jumpTo(wrapped);
    $(`time${this.id}`).textContent = fmtTime(el.currentTime);
    $(`duration${this.id}`).textContent = fmtTime(el.duration);
    this.rotation += this.isPlaying() ? 0.03 * (this.playbackRate || 1) : 0;
    if (this.isPlaying() || this.dragging || now - this.lastPlatterDrawAt > 500) {
      this.drawPlatter();
      this.lastPlatterDrawAt = now;
    }
    const waveInterval = this.dragging ? 24 : 80;
    if (this.dragging || now - this.lastWaveDrawAt > (this.isPlaying() ? waveInterval : 500)) {
      this.drawWave();
      this.drawZoomWave();
      this.lastWaveDrawAt = now;
    }
  }

  drawWave() {
    const canvas = $(`wave${this.id}`);
    drawWaveCanvas(canvas, {
      peaks: this.wavePeaks,
      duration: this.duration(),
      currentTime: this.currentTime(),
      loopStart: this.loopStart,
      loopEnd: this.loopEnd,
      color: this.id === "A" ? "#31c4a8" : "#55b8ff",
    });
  }

  drawZoomWave() {
    const canvas = $(`zoom${this.id}`);
    if (!canvas) return;
    const duration = this.duration();
    const current = this.currentTime();
    const half = this.zoomWindow / 2;
    let start = Math.max(0, current - half);
    let end = Math.min(duration || this.zoomWindow, start + this.zoomWindow);
    start = Math.max(0, end - this.zoomWindow);
    drawWaveCanvas(canvas, {
      peaks: this.zoomPeaks.length ? this.zoomPeaks : this.wavePeaks,
      duration,
      currentTime: current,
      loopStart: this.loopStart,
      loopEnd: this.loopEnd,
      startTime: start,
      endTime: end,
      color: this.id === "A" ? "#31c4a8" : "#55b8ff",
      gridSeconds: 2,
    });
    const label = $(`zoomLabel${this.id}`);
    if (label) {
      label.textContent = duration
        ? `${fmtTime(start)} - ${fmtTime(end)} | now ${fmtTime(current)}`
        : "No track loaded";
    }
  }

  drawPlatter() {
    const canvas = $(`platter${this.id}`);
    const ctx = canvas.getContext("2d");
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const s = cx / 90;  // 기준 반지름 90 대비 스케일
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0a0b0e";
    ctx.beginPath();
    ctx.arc(cx, cy, 98 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#343844";
    ctx.lineWidth = 10 * s;
    ctx.stroke();
    for (let i = 0; i < 36; i++) {
      const a = this.rotation + (i / 36) * Math.PI * 2;
      const inner = (i % 3 === 0 ? 70 : 82) * s;
      ctx.strokeStyle = i % 3 === 0 ? "#31c4a8" : "#59606e";
      ctx.lineWidth = i % 3 === 0 ? 3 * s : 1 * s;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * 92 * s, cy + Math.sin(a) * 92 * s);
      ctx.stroke();
    }
    ctx.fillStyle = "#181a20";
    ctx.beginPath();
    ctx.arc(cx, cy, 28 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f1f4f8";
    ctx.font = `700 ${Math.round(18 * s)}px Segoe UI`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.id, cx, cy);
  }

  bindPlatter() {
    const canvas = $(`platter${this.id}`);
    let lastX = 0;
    let lastAt = 0;
    const move = (event) => {
      if (!this.dragging) return;
      const x = event.clientX ?? event.touches?.[0]?.clientX;
      const dx = x - lastX;
      const now = performance.now();
      const dt = Math.max(12, now - lastAt);
      lastX = x;
      lastAt = now;
      this.jumpTo(loopAwareSeekTarget({
        currentTime: this.currentTime(),
        pixelDelta: dx,
        duration: this.duration(),
        loopStart: this.loopStart,
        loopEnd: this.loopEnd,
      }));
      this.rotation += dx * 0.022;
      if (this.vinylMode) this.playScratchGrain(dx, dt);
    };
    const up = () => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.wasPlaying && this.vinylMode) this.play();
    };
    canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.wasPlaying = this.isPlaying();
      lastX = event.clientX;
      lastAt = performance.now();
      if (this.vinylMode) this.pause();
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  playScratchGrain(dx, dt) {
    if (!this.audioBuffer || !this.deckInput || Math.abs(dx) < 1) return;
    const now = audioCtx.currentTime;
    if (now - this.lastScratchAt < 0.010) return;
    this.lastScratchAt = now;
    const grain = scratchGrainMetadata({
      pixelDelta: dx,
      elapsedMs: dt,
      currentTime: this.currentTime(),
      bufferDuration: this.audioBuffer.duration,
    });
    if (!grain) return;
    const slice = makeScratchSlice(this.audioBuffer, grain.start, grain.duration, grain.reverse);
    const source = audioCtx.createBufferSource();
    const env = audioCtx.createGain();
    source.buffer = slice;
    source.playbackRate.value = grain.playbackRate;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.85, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + grain.duration * 0.9);
    source.connect(env);
    env.connect(this.deckInput);
    source.start(now);
    source.stop(now + grain.duration + 0.02);
  }
}

function makeScratchSlice(buffer, start, duration, reverse) {
  const { startFrame, frameCount, reverse: shouldReverse } = scratchSliceMetadata({
    start,
    duration,
    sampleRate: buffer.sampleRate,
    bufferLength: buffer.length,
    reverse,
  });
  const out = audioCtx.createBuffer(buffer.numberOfChannels, frameCount, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.getChannelData(ch).set(sliceFrames(buffer.getChannelData(ch), startFrame, frameCount, shouldReverse));
  }
  return out;
}

export async function splitStems(deck) {
  if (!deck.track?.id) {
    log("Stem Split은 라이브러리 폴더의 곡에서만 실행됩니다.");
    return;
  }
  if (deck.stemJobRunning) {
    log(`Deck ${deck.id}: stem split is already running.`);
    return;
  }
  deck.stemJobRunning = true;
  try {
    const check = await fetch(`/api/stems?id=${deck.track.id}`).then((r) => r.json());
    log(`Deck ${deck.id}: ${stemReadinessLabel(check)}`);
    if (check.ready) {
      await deck.loadStems(check.stems);
      deck.stemJobRunning = false;
      return;
    }
    const started = await fetch("/api/stems/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deck.track.id }),
    }).then((r) => r.json());
    if (started.status === "error") {
      log(started.message);
      deck.stemJobRunning = false;
      return;
    }
    log(`Deck ${deck.id} stem job queued`);
    pollStemJob(deck, started.job);
  } catch (err) {
    deck.stemJobRunning = false;
    log(`Deck ${deck.id} stem split failed: ${err.message}`);
  }
}

async function pollStemJob(deck, job) {
  const timer = setInterval(async () => {
    const state = await fetch(`/api/stems/job?job=${encodeURIComponent(job)}`).then((r) => r.json());
    log(formatStemJobStatus(state));
    if (state.status === "done") {
      clearInterval(timer);
      deck.stemJobRunning = false;
      await deck.loadStems(state.stems);
      await refreshLibrary();
    }
    if (state.status === "error" || state.status === "missing") {
      clearInterval(timer);
      deck.stemJobRunning = false;
    }
  }, 2500);
}

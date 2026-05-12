const STEMS = ["vocals", "drums", "bass", "other"];
const STEM_LABELS = { vocals: "Vocal", drums: "Drums", bass: "Bass", other: "Other" };

let audioCtx;
let masterGain;
let recorderDestination;
let mediaRecorder;
let recordedChunks = [];
let libraryTracks = [];
let selectedTrack = null;
let lastClockAt = 0;
let recTimerInterval = null;
let recStartTime = null;
let recLevelRaf = null;
let recAnalyser = null;

function getBpmCache(tid) {
  if (!tid) return null;
  const v = localStorage.getItem(`stemDJ_bpm_${tid}`);
  return v ? Number(v) : null;
}

function setBpmCache(tid, bpm) {
  if (tid && bpm) localStorage.setItem(`stemDJ_bpm_${tid}`, String(bpm));
}

const $ = (id) => document.getElementById(id);

function log(message) {
  const box = $("statusLog");
  const now = new Date().toLocaleTimeString();
  box.textContent = `[${now}] ${message}\n` + box.textContent;
}

function fmtTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function playbackSupportHint(filename = "") {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "m4a" || ext === "aac") {
    return "Apple Music 보호/무손실 파일이면 브라우저가 못 읽을 수 있습니다. MP3, WAV 또는 일반 AAC/M4A 파일을 사용하세요.";
  }
  if (ext === "flac") {
    return "브라우저 FLAC 지원이 환경마다 다릅니다. 재생이 안 되면 MP3 또는 WAV로 변환해 주세요.";
  }
  return "브라우저 재생은 MP3, WAV, 일반 AAC/M4A가 가장 안정적입니다.";
}

async function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain();
  recorderDestination = audioCtx.createMediaStreamDestination();
  masterGain.connect(audioCtx.destination);
  masterGain.connect(recorderDestination);
  $("masterVolume").dispatchEvent(new Event("input"));
}

function createImpulse(seconds = 1.4, decay = 2.2) {
  const rate = audioCtx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = audioCtx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

class Deck {
  constructor(id) {
    this.id = id;
    this.track = null;
    this.mode = "mix";
    this.elements = {};
    this.sources = {};
    this.stemGains = {};
    this.cues = [null, null, null, null];
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
    this.reverb.buffer = createImpulse();
    this.reverbWet = audioCtx.createGain();
    this.reverbWet.gain.value = 0;
    this.deckGain = audioCtx.createGain();

    this.deckInput.connect(this.low);
    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.filter);
    this.filter.connect(this.deckGain);
    this.filter.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.echoWet);
    this.echoWet.connect(this.deckGain);
    this.filter.connect(this.reverb);
    this.reverb.connect(this.reverbWet);
    this.reverbWet.connect(this.deckGain);
    this.deckGain.connect(masterGain);
    updateCrossfader();
  }

  bindControls() {
    $(`play${this.id}`).addEventListener("click", () => this.togglePlay());
    $(`cue${this.id}`).addEventListener("click", () => this.jumpTo(this.cues[0] ?? 0));
    $(`stem${this.id}`).addEventListener("click", () => splitStems(this));
    $(`tempo${this.id}`).addEventListener("input", (e) => {
      const value = Number(e.target.value);
      $(`tempoRead${this.id}`).textContent = `${value.toFixed(1)}%`;
      this.playbackRate = 1 + value / 100;
      this.activeElements().forEach((el) => el.playbackRate = this.playbackRate);
    });
    ["low", "mid", "high"].forEach((name) => {
      $(`${name}${this.id}`).addEventListener("input", (e) => {
        if (this[name]) this[name].gain.value = Number(e.target.value);
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
    this.bindPlatter();
    this.buildCues();
  }

  buildCues() {
    const wrap = $(`cues${this.id}`);
    wrap.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const btn = document.createElement("button");
      btn.textContent = `Cue ${i + 1}`;
      btn.addEventListener("click", (event) => {
        if (event.shiftKey) {
          this.cues[i] = null;
          btn.classList.remove("active");
          return;
        }
        if (this.cues[i] == null) {
          this.cues[i] = this.currentTime();
          btn.classList.add("active");
          log(`Deck ${this.id} Cue ${i + 1} set at ${fmtTime(this.cues[i])}`);
        } else {
          this.jumpTo(this.cues[i]);
        }
      });
      wrap.appendChild(btn);
    }
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
      input.addEventListener("input", () => this.updateStemGains());
    });
    wrap.querySelectorAll("[data-stem-mute]").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        this.updateStemGains();
      });
    });
    wrap.querySelectorAll("[data-stem-solo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        this.updateStemGains();
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
    this.updateStemGains();
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
    const safe = Math.max(0, Math.min(time, this.duration() || time));
    this.activeElements().forEach((el) => el.currentTime = safe);
  }

  updateTitle(title) {
    $(`title${this.id}`).textContent = title;
  }

  updateStemGains() {
    const wrap = $(`stems${this.id}`);
    const soloed = [...wrap.querySelectorAll("[data-stem-solo].active")].map((b) => b.dataset.stemSolo);
    STEMS.forEach((name) => {
      const gain = this.stemGains[name];
      if (!gain) return;
      const vol = Number(wrap.querySelector(`[data-stem-volume="${name}"]`)?.value || 100) / 100;
      const muted = wrap.querySelector(`[data-stem-mute="${name}"]`)?.classList.contains("active");
      gain.gain.value = muted || (soloed.length && !soloed.includes(name)) ? 0 : vol;
    });
  }

  async analyze(url) {
    try {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const audio = await audioCtx.decodeAudioData(buffer.slice(0));
      this.audioBuffer = audio;
      this.wavePeaks = makePeaks(audio, 1200);
      this.bpm = estimateBpm(audio);
      $(`bpm${this.id}`).textContent = this.bpm ? `BPM ${this.bpm}` : "BPM --";
      if (this.track?.id && this.bpm) setBpmCache(this.track.id, this.bpm);
      this.drawWave();
      this.drawZoomWave();
    } catch (err) {
      this.wavePeaks = [];
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
    if (this.loopEnd && el.currentTime >= this.loopEnd) this.jumpTo(this.loopStart);
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
      peaks: this.wavePeaks,
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0a0b0e";
    ctx.beginPath();
    ctx.arc(cx, cy, 98, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#343844";
    ctx.lineWidth = 10;
    ctx.stroke();
    for (let i = 0; i < 36; i++) {
      const a = this.rotation + (i / 36) * Math.PI * 2;
      const inner = i % 3 === 0 ? 70 : 82;
      ctx.strokeStyle = i % 3 === 0 ? "#31c4a8" : "#59606e";
      ctx.lineWidth = i % 3 === 0 ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * 92, cy + Math.sin(a) * 92);
      ctx.stroke();
    }
    ctx.fillStyle = "#181a20";
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f1f4f8";
    ctx.font = "700 18px Segoe UI";
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
      const seconds = dx * 0.035 * (this.duration() ? Math.min(4, this.duration() / 180) : 1);
      this.jumpTo(this.currentTime() + seconds);
      this.rotation += dx * 0.03;
      if ($(`vinyl${this.id}`).checked) this.playScratchGrain(dx, dt);
    };
    const up = () => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.wasPlaying && $(`vinyl${this.id}`).checked) this.play();
    };
    canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.wasPlaying = this.isPlaying();
      lastX = event.clientX;
      lastAt = performance.now();
      if ($(`vinyl${this.id}`).checked) this.pause();
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  playScratchGrain(dx, dt) {
    if (!this.audioBuffer || !this.deckInput || Math.abs(dx) < 1) return;
    const now = audioCtx.currentTime;
    if (now - this.lastScratchAt < 0.018) return;
    this.lastScratchAt = now;
    const duration = Math.min(0.12, Math.max(0.035, Math.abs(dx) / 260));
    const start = Math.max(0, Math.min(this.currentTime(), this.audioBuffer.duration - duration));
    const reverse = dx < 0;
    const slice = makeScratchSlice(this.audioBuffer, start, duration, reverse);
    const source = audioCtx.createBufferSource();
    const env = audioCtx.createGain();
    const rate = Math.min(3.2, Math.max(0.35, Math.abs(dx) / dt * 12));
    source.buffer = slice;
    source.playbackRate.value = rate;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.75, now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(env);
    env.connect(this.deckInput);
    source.start(now);
    source.stop(now + duration + 0.025);
  }
}

function drawWaveCanvas(canvas, options = {}) {
  if (!canvas) return;
  const {
    peaks = [],
    duration = 0,
    currentTime = 0,
    loopStart = 0,
    loopEnd = 0,
    startTime = 0,
    endTime = duration || 1,
    color = "#31c4a8",
    gridSeconds = 0,
  } = options;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const visibleStart = Math.max(0, startTime);
  const visibleEnd = Math.max(visibleStart + 0.001, endTime);
  const visibleDuration = visibleEnd - visibleStart;
  const sourceDuration = Math.max(duration || visibleDuration, 0.001);
  const data = peaks.length ? peaks : new Array(Math.max(80, Math.floor(w / 5))).fill(0.12);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b0c10";
  ctx.fillRect(0, 0, w, h);

  if (gridSeconds) {
    ctx.strokeStyle = "#1f2835";
    ctx.lineWidth = 1;
    const first = Math.ceil(visibleStart / gridSeconds) * gridSeconds;
    for (let t = first; t < visibleEnd; t += gridSeconds) {
      const x = ((t - visibleStart) / visibleDuration) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }

  if (loopEnd > visibleStart && loopStart < visibleEnd) {
    const x1 = Math.max(0, ((loopStart - visibleStart) / visibleDuration) * w);
    const x2 = Math.min(w, ((loopEnd - visibleStart) / visibleDuration) * w);
    ctx.fillStyle = "rgba(176, 76, 255, .18)";
    ctx.fillRect(x1, 0, Math.max(2, x2 - x1), h);
    ctx.strokeStyle = "#f4c8ff";
    ctx.lineWidth = 2;
    [x1, x2].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += 2) {
    const t = visibleStart + (x / w) * visibleDuration;
    const index = Math.max(0, Math.min(data.length - 1, Math.floor((t / sourceDuration) * data.length)));
    const peak = data[index] || 0.04;
    const y = Math.max(2, peak * h * 0.47);
    ctx.beginPath();
    ctx.moveTo(x, h / 2 - y);
    ctx.lineTo(x, h / 2 + y);
    ctx.stroke();
  }

  if (duration) {
    const pos = ((currentTime - visibleStart) / visibleDuration) * w;
    if (pos >= 0 && pos <= w) {
      ctx.strokeStyle = "#e0bc5b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, h);
      ctx.stroke();
    }
  }
}

function makeScratchSlice(buffer, start, duration, reverse) {
  const rate = buffer.sampleRate;
  const frameCount = Math.max(1, Math.floor(duration * rate));
  const startFrame = Math.max(0, Math.min(Math.floor(start * rate), buffer.length - frameCount));
  const out = audioCtx.createBuffer(buffer.numberOfChannels, frameCount, rate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) {
      const srcIndex = reverse ? startFrame + frameCount - 1 - i : startFrame + i;
      dst[i] = src[srcIndex] || 0;
    }
  }
  return out;
}

function makePeaks(buffer, count) {
  const data = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / count));
  const peaks = [];
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = 0; j < block; j++) sum += Math.abs(data[i * block + j] || 0);
    peaks.push(Math.min(1, (sum / block) * 3.4));
  }
  return peaks;
}

function estimateBpm(buffer) {
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;
  const step = Math.floor(rate * 0.05);
  const energies = [];
  for (let i = 0; i < data.length; i += step) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += Math.abs(data[i + j] || 0);
    energies.push(sum / step);
  }
  const avg = energies.reduce((a, b) => a + b, 0) / energies.length;
  const peaks = energies.map((v, i) => v > avg * 1.45 && v > (energies[i - 1] || 0) && v > (energies[i + 1] || 0) ? i * 0.05 : null).filter(Boolean);
  if (peaks.length < 4) return null;
  const intervals = [];
  for (let i = 1; i < peaks.length; i++) {
    const diff = peaks[i] - peaks[i - 1];
    if (diff > 0.25 && diff < 2) intervals.push(diff);
  }
  if (!intervals.length) return null;
  intervals.sort((a, b) => a - b);
  let bpm = Math.round(60 / intervals[Math.floor(intervals.length / 2)]);
  while (bpm < 80) bpm *= 2;
  while (bpm > 180) bpm = Math.round(bpm / 2);
  return bpm;
}

const OVERLAY_TABS = new Set(["REC", "FX"]);

function activateTab(name) {
  if (OVERLAY_TABS.has(name)) {
    toggleOverlay(name);
    return;
  }
  document.getElementById("performView").hidden = name !== "PERFORM";
  document.getElementById("libraryView").hidden = name !== "LIBRARY";
  document.getElementById("browseView").hidden = name !== "BROWSE";
  document.querySelectorAll(".nav-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
  if (name === "LIBRARY") renderLibraryTab();
  if (name === "BROWSE") renderBrowseTab();
}

function renderLibraryTab() {
  const q = ($("libSearch")?.value || "").trim().toLowerCase();
  const filter = $("libFilter")?.value || "all";
  const sort = $("libSort")?.value || "title";

  let tracks = libraryTracks.filter((t) => {
    const matchQ = !q || t.title.toLowerCase().includes(q) || t.filename.toLowerCase().includes(q);
    const matchF =
      filter === "all" ||
      (filter === "stems" && t.stemReady) ||
      (filter === "nostems" && !t.stemReady);
    return matchQ && matchF;
  });

  tracks = [...tracks].sort((a, b) => {
    if (sort === "bpm") return (a.bpm ?? 9999) - (b.bpm ?? 9999);
    if (sort === "size") return (b.size ?? 0) - (a.size ?? 0);
    if (sort === "modified") return (b.modified ?? 0) - (a.modified ?? 0);
    return a.title.localeCompare(b.title);
  });

  const rows = $("libRows");
  rows.innerHTML = "";

  tracks.forEach((track, i) => {
    const row = document.createElement("div");
    row.className = "lib-row" + (selectedTrack?.id === track.id ? " selected" : "");

    const cells = [
      { text: String(i + 1), tag: "span" },
      { text: track.title, tag: "strong" },
      { text: track.filename, tag: "span" },
      { text: track.bpm ?? "—", tag: "span", cls: track.bpm ? "bpm-val" : "bpm-na" },
      { text: track.size ? `${Math.round(Number(track.size) / 1024 / 1024)} MB` : "local", tag: "span" },
      { text: track.stemReady ? "✓" : "—", tag: "span", cls: track.stemReady ? "stems-ready" : "" },
    ];

    cells.forEach(({ text, tag, cls }) => {
      const el = document.createElement(tag);
      el.textContent = text;
      if (cls) el.className = cls;
      row.appendChild(el);
    });

    const actions = document.createElement("div");
    actions.className = "lib-actions";
    ["A", "B"].forEach((deckId) => {
      const btn = document.createElement("button");
      btn.textContent = deckId;
      btn.className = `load-btn load-btn-${deckId.toLowerCase()}`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedTrack = track;
        decks[deckId].loadMix(track).catch((err) => log(`Deck ${deckId} 로드 실패: ${err.message}`));
        renderTracks();
        renderSelectedPreview();
      });
      actions.appendChild(btn);
    });
    row.appendChild(actions);

    row.addEventListener("click", () => {
      selectedTrack = track;
      renderTracks();
      renderSelectedPreview();
      rows.querySelectorAll(".lib-row").forEach((r) => r.classList.remove("selected"));
      row.classList.add("selected");
    });

    rows.appendChild(row);
  });

  const status = $("libStatus");
  if (status && $("libraryPath")) {
    status.textContent = `${tracks.length}개 트랙 · ${$("libraryPath").textContent}`;
  }
}

function renderBrowseTab() {
  const bpmMin = Number($("bpmMin")?.value ?? 40);
  const bpmMax = Number($("bpmMax")?.value ?? 220);
  const stemsReady = $("fStemsReady")?.checked ?? false;
  const stemsNo = $("fStemsNo")?.checked ?? false;
  const extChecks = ["mp3", "wav", "flac", "m4a"];
  const exts = extChecks.filter((e) => $(`fExt_${e}`)?.checked ?? false);

  const results = libraryTracks.filter((t) => {
    const bpm = t.bpm;
    const bpmOk = !bpm || (bpm >= bpmMin && bpm <= bpmMax);
    const stemsOk = (stemsReady && t.stemReady) || (stemsNo && !t.stemReady);
    const ext = t.filename.split(".").pop().toLowerCase();
    const extOk = exts.length === 0 || exts.includes(ext);
    return bpmOk && stemsOk && extOk;
  });

  const count = $("browseCount");
  if (count) count.textContent = `${results.length}개 결과`;

  const container = $("browseRows");
  if (!container) return;
  container.innerHTML = "";

  results.forEach((track) => {
    const row = document.createElement("div");
    row.className = "browse-row";

    const info = document.createElement("div");
    info.className = "browse-info";

    const title = document.createElement("strong");
    title.textContent = track.title;

    const meta = document.createElement("span");
    meta.className = "browse-meta";
    const ext = track.filename.split(".").pop().toLowerCase();
    const sizeStr = track.size ? `${Math.round(Number(track.size) / 1024 / 1024)} MB` : "local";
    meta.textContent = [track.bpm ? `${track.bpm} BPM` : null, ext, sizeStr].filter(Boolean).join(" · ");

    const badge = document.createElement("span");
    badge.className = track.stemReady ? "badge-stems" : "badge-no-stems";
    badge.textContent = track.stemReady ? "stems ✓" : "no stems";

    info.appendChild(title);
    info.appendChild(meta);
    info.appendChild(badge);

    const actions = document.createElement("div");
    actions.className = "browse-actions";
    ["A", "B"].forEach((deckId) => {
      const btn = document.createElement("button");
      btn.textContent = deckId;
      btn.className = `load-btn load-btn-${deckId.toLowerCase()}`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedTrack = track;
        decks[deckId].loadMix(track).catch((err) => log(`Deck ${deckId} 로드 실패: ${err.message}`));
      });
      actions.appendChild(btn);
    });

    row.appendChild(info);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

function toggleOverlay(name) {
  const id = name === "REC" ? "recOverlay" : "fxOverlay";
  const el = document.getElementById(id);
  el.hidden = !el.hidden;
  if (!el.hidden && name === "FX") syncFxOverlaySliders();
}

function syncFxOverlaySliders() {
  ["A", "B"].forEach((id) => {
    ["Filter", "Echo", "Reverb"].forEach((fx) => {
      const overlay = $(`fx${fx}${id}`);
      const util = $(`${fx.toLowerCase()}${id}`);
      if (overlay && util) overlay.value = util.value;
    });
  });
}

const decks = { A: new Deck("A"), B: new Deck("B") };

async function refreshLibrary() {
  const res = await fetch("/api/library");
  const data = await res.json();
  libraryTracks = data.tracks;
  libraryTracks.forEach(t => { if (!t.bpm) t.bpm = getBpmCache(t.id); });
  $("libraryPath").textContent = data.library;
  $("libraryInput").value = data.library;
  const demucsText = data.demucs ? "Demucs detected. Stem Split is available." : "Demucs not detected. Playback works; stem split needs Demucs.";
  $("demucsState").textContent = data.scanMessage ? `${demucsText} ${data.scanMessage}` : demucsText;
  renderTracks();
}

function renderTracks() {
  const q = $("search").value.trim().toLowerCase();
  const list = $("trackList");
  list.innerHTML = "";
  libraryTracks.filter((t) => t.title.toLowerCase().includes(q) || t.filename.toLowerCase().includes(q)).forEach((track) => {
    const row = document.createElement("div");
    row.className = "track" + (selectedTrack?.id === track.id ? " selected" : "");
    const size = track.size ? `${Math.round(track.size / 1024 / 1024)} MB` : "local";
    row.innerHTML = `
      <strong>${track.title}</strong>
      <span>${track.filename}</span>
      <span>${track.stemReady ? "stems ready" : "original"}</span>
      <span>${size}</span>`;
    row.addEventListener("click", () => {
      selectedTrack = track;
      renderTracks();
      renderSelectedPreview();
    });
    row.addEventListener("dblclick", () => decks.A.loadMix(track));
    list.appendChild(row);
  });
}

function renderSelectedPreview() {
  const box = $("selectedPreview");
  if (!selectedTrack) {
    box.textContent = "No track selected";
    return;
  }
  box.innerHTML = `
    <strong>${selectedTrack.title}</strong><br>
    <span>${selectedTrack.filename}</span><br>
    <span>${selectedTrack.stemReady ? "Stem cache ready" : "Original track"}</span>`;
}

function localFileTrack(file) {
  return {
    id: null,
    title: file.name.replace(/\.[^.]+$/, ""),
    filename: file.name,
    url: URL.createObjectURL(file),
  };
}

async function splitStems(deck) {
  if (!deck.track?.id) {
    log("Stem Split은 라이브러리 폴더의 곡에서만 실행됩니다.");
    return;
  }
  const check = await fetch(`/api/stems?id=${deck.track.id}`).then((r) => r.json());
  if (check.ready) {
    await deck.loadStems(check.stems);
    return;
  }
  const started = await fetch("/api/stems/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: deck.track.id }),
  }).then((r) => r.json());
  if (started.status === "error") {
    log(started.message);
    return;
  }
  log(`Deck ${deck.id} stem job queued`);
  pollStemJob(deck, started.job);
}

async function pollStemJob(deck, job) {
  const timer = setInterval(async () => {
    const state = await fetch(`/api/stems/job?job=${encodeURIComponent(job)}`).then((r) => r.json());
    log(state.message || state.status);
    if (state.status === "done") {
      clearInterval(timer);
      await deck.loadStems(state.stems);
      await refreshLibrary();
    }
    if (state.status === "error" || state.status === "missing") clearInterval(timer);
  }, 2500);
}

function updateCrossfader() {
  if (!masterGain) return;
  const x = Number($("crossfader").value) / 100;
  const a = Math.cos((x + 1) * Math.PI / 4);
  const b = Math.sin((x + 1) * Math.PI / 4);
  if (decks.A.deckGain) decks.A.deckGain.gain.value = a;
  if (decks.B.deckGain) decks.B.deckGain.gain.value = b;
}

function startRecTimer() {
  recStartTime = Date.now();
  clearInterval(recTimerInterval);
  recTimerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - recStartTime) / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    const el = $("recTimer");
    if (el) el.textContent = `${h}:${m}:${sec}`;
  }, 1000);
}

function stopRecTimer() {
  clearInterval(recTimerInterval);
  const el = $("recTimer");
  if (el) el.textContent = "00:00:00";
}

function startLevelMeter() {
  if (!audioCtx || !masterGain) return;
  if (!recAnalyser) {
    recAnalyser = audioCtx.createAnalyser();
    recAnalyser.fftSize = 256;
  }
  masterGain.connect(recAnalyser);
  const canvas = $("recLevel");
  if (!canvas) return;
  const ctx2d = canvas.getContext("2d");
  const buf = new Float32Array(recAnalyser.frequencyBinCount);

  function frame() {
    recAnalyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const w = canvas.width;
    const h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);
    ctx2d.fillStyle = "#080b10";
    ctx2d.fillRect(0, 0, w, h);
    const barW = Math.min(w, Math.round(rms * w * 8));
    if (barW > 0) {
      const grad = ctx2d.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#31c4a8");
      grad.addColorStop(0.65, "#e0bc5b");
      grad.addColorStop(1, "#ff5757");
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, 4, barW, h - 8);
    }
    recLevelRaf = requestAnimationFrame(frame);
  }
  frame();
}

function stopLevelMeter() {
  cancelAnimationFrame(recLevelRaf);
  recLevelRaf = null;
}

function setupRecording() {
  async function doRecord() {
    await ensureAudio();
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      $("recordBtn").textContent = "Record";
      $("recToggle").textContent = "Record";
      stopRecTimer();
      stopLevelMeter();
      return;
    }
    if (!recorderDestination?.stream) {
      log("오디오 스트림을 초기화할 수 없습니다.");
      return;
    }
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(recorderDestination.stream);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) recordedChunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      // topbar 링크
      const topLink = $("downloadMix");
      topLink.href = url;
      topLink.download = `stem-dj-mix-${Date.now()}.webm`;
      topLink.hidden = false;
      topLink.textContent = "Download mix";
      // REC 오버레이 링크
      const recLink = $("recDownload");
      if (recLink) {
        recLink.href = url;
        recLink.download = topLink.download;
        recLink.hidden = false;
        recLink.textContent = "Download .webm";
      }
      log("녹음 완료");
    };
    mediaRecorder.start();
    $("recordBtn").textContent = "Stop";
    $("recToggle").textContent = "Stop";
    startRecTimer();
    startLevelMeter();
    log("녹음 시작");
  }

  $("recordBtn").addEventListener("click", doRecord);
  $("recToggle").addEventListener("click", doRecord);
}

function bindGlobalControls() {
  document.querySelectorAll(".nav-tabs button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
  document.querySelectorAll(".overlay-close[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.close).hidden = true;
    });
  });
  $("refreshLibrary").addEventListener("click", refreshLibrary);
  $("saveLibrary").addEventListener("click", async () => {
    const library = $("libraryInput").value.trim();
    if (!library) {
      log("라이브러리 경로가 비어 있습니다.");
      return;
    }
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ library }),
    });
    const data = await response.json();
    if (!response.ok || data.status === "error") {
      log(data.message || "라이브러리 설정 실패");
      return;
    }
    selectedTrack = null;
    await refreshLibrary();
    renderSelectedPreview();
    log(`Library set: ${data.library}`);
  });
  $("search").addEventListener("input", renderTracks);
  // LIBRARY 탭 컨트롤
  $("libSearch")?.addEventListener("input", renderLibraryTab);
  $("libFilter")?.addEventListener("change", renderLibraryTab);
  $("libSort")?.addEventListener("change", renderLibraryTab);
  $("libRefresh")?.addEventListener("click", () => refreshLibrary().then(renderLibraryTab));
  // BROWSE 탭 컨트롤
  $("browseApply")?.addEventListener("click", renderBrowseTab);
  $("browseReset")?.addEventListener("click", () => {
    $("bpmMin").value = 60;
    $("bpmMax").value = 200;
    ["fStemsReady", "fStemsNo"].forEach((id) => { $(id).checked = true; });
    ["mp3", "wav", "flac", "m4a"].forEach((e) => { $(`fExt_${e}`).checked = true; });
    renderBrowseTab();
  });
  $("loadToA").addEventListener("click", () => loadSelectedTo("A"));
  $("loadToB").addEventListener("click", () => loadSelectedTo("B"));
  $("filePicker").addEventListener("change", (event) => {
    const files = [...event.target.files];
    const localTracks = files.map(localFileTrack);
    libraryTracks = [...localTracks, ...libraryTracks];
    selectedTrack = localTracks[0] || selectedTrack;
    renderTracks();
    renderSelectedPreview();
    log(`${localTracks.length} local file(s) added`);
  });
  $("crossfader").addEventListener("input", updateCrossfader);
  $("masterVolume").addEventListener("input", (event) => {
    if (masterGain) masterGain.gain.value = Number(event.target.value) / 100;
  });
  $("syncBtn").addEventListener("click", () => {
    if (!decks.A.bpm || !decks.B.bpm) {
      log("Sync requires detected BPM on both decks.");
      return;
    }
    const rate = decks.A.bpm / decks.B.bpm;
    const pct = Math.max(-16, Math.min(16, (rate - 1) * 100));
    $("tempoB").value = pct;
    $("tempoB").dispatchEvent(new Event("input"));
    log(`Deck B synced to Deck A: ${pct.toFixed(1)}%`);
  });
  document.querySelectorAll("[data-loop]").forEach((btn) => {
    btn.addEventListener("click", () => decks[btn.dataset.deck].setLoop(Number(btn.dataset.loop)));
  });
}

function loadSelectedTo(deckId) {
  if (!selectedTrack) {
    log("먼저 라이브러리에서 곡을 선택하세요.");
    return;
  }
  decks[deckId].loadMix(selectedTrack).catch((err) => log(`Deck ${deckId} 로드 실패: ${err.message}`));
}

function tick(now = performance.now()) {
  decks.A.tick(now);
  decks.B.tick(now);
  if (now - lastClockAt > 1000) {
    $("clock").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    lastClockAt = now;
  }
  requestAnimationFrame(tick);
}

bindGlobalControls();
setupRecording();
refreshLibrary().catch((err) => log(err.message));
tick();

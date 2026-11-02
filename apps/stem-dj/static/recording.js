// 마스터 녹음 — MediaRecorder + 타이머 + 레벨미터
import { $, log } from "./util.js";
import { audioCtx, masterOutput, recorderDestination, ensureAudio } from "./audio-engine.js";

let mediaRecorder;
let recordedChunks = [];
let recTimerInterval = null;
let recStartTime = null;
let recLevelRaf = null;
let recAnalyser = null;

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
  if (!audioCtx || !masterOutput) return;
  if (!recAnalyser) {
    recAnalyser = audioCtx.createAnalyser();
    recAnalyser.fftSize = 256;
    masterOutput.connect(recAnalyser);
  }
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

export function setupRecording() {
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
    const recLink = $("recDownload");
    if (recLink) {
      recLink.hidden = true;
      recLink.removeAttribute("href");
      recLink.textContent = "Download .webm";
    }
    mediaRecorder = new MediaRecorder(recorderDestination.stream);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) recordedChunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
      const topLink = $("downloadMix");
      if (topLink.href && topLink.href.startsWith("blob:")) {
        URL.revokeObjectURL(topLink.href);
      }
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      // topbar 링크
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

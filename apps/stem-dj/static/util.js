// 공용 유틸 — DOM 의존은 함수 내부로 한정 (fmtTime·playbackSupportHint는 순수)

export const $ = (id) => document.getElementById(id);

export function log(message) {
  const box = $("statusLog");
  const now = new Date().toLocaleTimeString();
  box.textContent = `[${now}] ${message}\n` + box.textContent;
}

export function fmtTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function playbackSupportHint(filename = "") {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "m4a" || ext === "aac") {
    return "Apple Music 보호/무손실 파일이면 브라우저가 못 읽을 수 있습니다. MP3, WAV 또는 일반 AAC/M4A 파일을 사용하세요.";
  }
  if (ext === "flac") {
    return "브라우저 FLAC 지원이 환경마다 다릅니다. 재생이 안 되면 MP3 또는 WAV로 변환해 주세요.";
  }
  return "브라우저 재생은 MP3, WAV, 일반 AAC/M4A가 가장 안정적입니다.";
}

export function getBpmCache(tid) {
  if (!tid) return null;
  const v = localStorage.getItem(`stemDJ_bpm_${tid}`);
  return v ? Number(v) : null;
}

export function setBpmCache(tid, bpm) {
  if (tid && bpm) localStorage.setItem(`stemDJ_bpm_${tid}`, String(bpm));
}

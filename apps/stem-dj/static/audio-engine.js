// 공유 오디오 컨텍스트 — live binding으로 export (ensureAudio 후 갱신값이 import 측에 반영)
import { $ } from "./util.js";

export let audioCtx;
export let masterGain;
export let recorderDestination;

export async function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain();
  recorderDestination = audioCtx.createMediaStreamDestination();
  masterGain.connect(audioCtx.destination);
  masterGain.connect(recorderDestination);
  $("masterVolume").dispatchEvent(new Event("input"));
}

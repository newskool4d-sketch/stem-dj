// 공유 오디오 컨텍스트 — live binding으로 export (ensureAudio 후 갱신값이 import 측에 반영)
import { $ } from "./util.js";

export let audioCtx;
export let masterGain;
export let recorderDestination;
export let masterOutput; // 리미터 이후 최종 버스 — 스피커·녹음·레벨 미터가 같은 신호를 공유

export async function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain();
  // 두 덱 합산 + EQ 부스트로 0dBFS를 넘는 피크를 잡는 리미터
  masterOutput = audioCtx.createDynamicsCompressor();
  masterOutput.threshold.value = -1;
  masterOutput.knee.value = 0;
  masterOutput.ratio.value = 20;
  masterOutput.attack.value = 0.003;
  masterOutput.release.value = 0.1;
  recorderDestination = audioCtx.createMediaStreamDestination();
  masterGain.connect(masterOutput);
  masterOutput.connect(audioCtx.destination);
  masterOutput.connect(recorderDestination);
  $("masterVolume").dispatchEvent(new Event("input"));
}

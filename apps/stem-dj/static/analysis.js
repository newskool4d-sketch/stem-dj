// DSP 분석 모듈 — DOM·AudioContext 의존 없음 (Node 테스트 가능)

export function makePeaks(samples, count) {
  const block = Math.max(1, Math.floor(samples.length / count));
  const peaks = [];
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = 0; j < block; j++) sum += Math.abs(samples[i * block + j] || 0);
    peaks.push(Math.min(1, (sum / block) * 3.4));
  }
  return peaks;
}

export function estimateBpm(samples, sampleRate) {
  // 최대 90초만 사용 (속도 최적화)
  const limit = Math.min(samples.length, sampleRate * 90);
  // 11ms 블록 에너지로 onset strength 계산
  const blockSize = Math.max(1, Math.floor(sampleRate * 0.011));
  const onset = [];
  let prevEnergy = 0;
  for (let i = 0; i + blockSize <= limit; i += blockSize) {
    let energy = 0;
    for (let j = 0; j < blockSize; j++) energy += samples[i + j] ** 2;
    energy /= blockSize;
    onset.push(Math.max(0, energy - prevEnergy));
    prevEnergy = energy;
  }
  if (onset.length < 40) return null;
  // 자기상관으로 dominant period 탐색 (60–200 BPM 범위)
  const sr = 1 / 0.011;
  const minLag = Math.max(1, Math.round(sr * 60 / 200));
  const maxLag = Math.round(sr * 60 / 60);
  let best = -1, bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const n = onset.length - lag;
    if (n < 20) continue;
    let corr = 0;
    for (let i = 0; i < n; i++) corr += onset[i] * onset[i + lag];
    corr /= n;
    if (corr > best) { best = corr; bestLag = lag; }
  }
  if (bestLag < 1) return null;
  let bpm = Math.round(60 / (bestLag / sr));
  while (bpm < 80) bpm *= 2;
  while (bpm > 180) bpm = Math.round(bpm / 2);
  return bpm;
}

export function sliceFrames(src, startFrame, frameCount, reverse) {
  const out = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const srcIndex = reverse ? startFrame + frameCount - 1 - i : startFrame + i;
    out[i] = src[srcIndex] || 0;
  }
  return out;
}

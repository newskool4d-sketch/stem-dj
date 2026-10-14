import test from "node:test";
import assert from "node:assert/strict";
import { estimateBpm, makePeaks, sliceFrames } from "../static/analysis.js";

const SAMPLE_RATE = 44100;

// bpm 간격으로 80ms 사인 버스트가 반복되는 합성 클릭 트랙
function clickTrack(bpm, seconds, rate = SAMPLE_RATE) {
  const samples = new Float32Array(Math.floor(seconds * rate));
  const interval = (60 / bpm) * rate;
  const burstLen = Math.floor(rate * 0.08);
  for (let beat = 0; beat * interval < samples.length; beat++) {
    const start = Math.floor(beat * interval);
    for (let i = 0; i < burstLen && start + i < samples.length; i++) {
      const decay = 1 - i / burstLen;
      samples[start + i] += Math.sin((2 * Math.PI * 800 * i) / rate) * 0.9 * decay;
    }
  }
  return samples;
}

test("estimateBpm detects 120 BPM click track within ±3", () => {
  const bpm = estimateBpm(clickTrack(120, 30), SAMPLE_RATE);
  assert.ok(bpm !== null, "bpm should not be null");
  assert.ok(Math.abs(bpm - 120) <= 3, `expected ~120, got ${bpm}`);
});

test("estimateBpm detects 100 BPM click track within ±3", () => {
  const bpm = estimateBpm(clickTrack(100, 30), SAMPLE_RATE);
  assert.ok(bpm !== null, "bpm should not be null");
  assert.ok(Math.abs(bpm - 100) <= 3, `expected ~100, got ${bpm}`);
});

test("estimateBpm folds sub-80 tempo up one octave (60 → ~120)", () => {
  const bpm = estimateBpm(clickTrack(60, 40), SAMPLE_RATE);
  assert.ok(bpm !== null, "bpm should not be null");
  assert.ok(Math.abs(bpm - 120) <= 4, `expected ~120 (folded), got ${bpm}`);
});

test("estimateBpm returns null for input too short to analyze", () => {
  const bpm = estimateBpm(new Float32Array(SAMPLE_RATE * 0.2), SAMPLE_RATE);
  assert.equal(bpm, null);
});

test("makePeaks returns exactly count values in [0, 1]", () => {
  const peaks = makePeaks(clickTrack(120, 10), 500);
  assert.equal(peaks.length, 500);
  for (const p of peaks) {
    assert.ok(p >= 0 && p <= 1, `peak out of range: ${p}`);
  }
});

test("makePeaks returns zeros for silence", () => {
  const peaks = makePeaks(new Float32Array(SAMPLE_RATE), 100);
  assert.ok(peaks.every((p) => p === 0));
});

test("sliceFrames copies forward slice verbatim", () => {
  const src = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
  const out = sliceFrames(src, 2, 3, false);
  assert.deepEqual(Array.from(out), [2, 3, 4]);
});

test("sliceFrames reverses the slice when reverse=true", () => {
  const src = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
  const out = sliceFrames(src, 2, 3, true);
  assert.deepEqual(Array.from(out), [4, 3, 2]);
});

test("sliceFrames pads with zeros past the end of source", () => {
  const src = Float32Array.from([1, 2, 3]);
  const out = sliceFrames(src, 1, 4, false);
  assert.deepEqual(Array.from(out), [2, 3, 0, 0]);
});

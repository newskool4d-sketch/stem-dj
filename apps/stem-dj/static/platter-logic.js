import { clampSeek, loopWrapPosition } from "./deck-logic.js";

const BASE_SEEK_SECONDS_PER_PIXEL = 0.018;
const REFERENCE_TRACK_SECONDS = 180;
const MAX_SEEK_SCALE = 3;
const MIN_SCRATCH_GRAIN_SECONDS = 0.05;
const MAX_SCRATCH_GRAIN_SECONDS = 0.22;
const MIN_SCRATCH_RATE = 0.25;
const MAX_SCRATCH_RATE = 4;
const MIN_SCRATCH_ELAPSED_MS = 12;

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cleanFloat(value) {
  return Number(value.toFixed(12));
}

export function durationAwareSeekDelta(pixelDelta, duration) {
  const safeDelta = finiteOr(Number(pixelDelta), 0);
  const safeDuration = finiteOr(Number(duration), 0);
  const scale = safeDuration > 0
    ? Math.min(MAX_SEEK_SCALE, safeDuration / REFERENCE_TRACK_SECONDS)
    : 1;
  return cleanFloat(safeDelta * BASE_SEEK_SECONDS_PER_PIXEL * scale);
}

export function loopAwareSeekTarget({
  currentTime,
  pixelDelta,
  duration,
  loopStart = 0,
  loopEnd = 0,
}) {
  const target = clampSeek(
    finiteOr(Number(currentTime), 0) + durationAwareSeekDelta(pixelDelta, duration),
    finiteOr(Number(duration), 0),
  );
  const wrapped = loopWrapPosition(target, finiteOr(Number(loopStart), 0), finiteOr(Number(loopEnd), 0));
  return cleanFloat(wrapped ?? target);
}

export function scratchGrainMetadata({
  pixelDelta,
  elapsedMs,
  currentTime,
  bufferDuration,
}) {
  const distance = Math.abs(finiteOr(Number(pixelDelta), 0));
  const safeDuration = finiteOr(Number(bufferDuration), 0);
  if (distance < 1 || safeDuration <= 0) return null;

  const duration = cleanFloat(clamp(distance / 160, MIN_SCRATCH_GRAIN_SECONDS, MAX_SCRATCH_GRAIN_SECONDS));
  const startMax = Math.max(0, safeDuration - duration);
  const start = cleanFloat(clamp(finiteOr(Number(currentTime), 0), 0, startMax));
  const elapsed = Math.max(MIN_SCRATCH_ELAPSED_MS, finiteOr(Number(elapsedMs), MIN_SCRATCH_ELAPSED_MS));
  const playbackRate = cleanFloat(clamp((distance / elapsed) * 8, MIN_SCRATCH_RATE, MAX_SCRATCH_RATE));

  return {
    start,
    duration,
    reverse: pixelDelta < 0,
    playbackRate,
  };
}

export function scratchSliceMetadata({
  start,
  duration,
  sampleRate,
  bufferLength,
  reverse = false,
}) {
  const rate = Math.max(1, Math.floor(finiteOr(Number(sampleRate), 1)));
  const length = Math.max(1, Math.floor(finiteOr(Number(bufferLength), 1)));
  const frameCount = Math.max(1, Math.min(length, Math.floor(finiteOr(Number(duration), 0) * rate)));
  const requestedStart = Math.floor(Math.max(0, finiteOr(Number(start), 0)) * rate);
  const startFrame = Math.max(0, Math.min(requestedStart, length - frameCount));
  return { startFrame, frameCount, reverse: Boolean(reverse) };
}

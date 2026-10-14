import test from "node:test";
import assert from "node:assert/strict";
import {
  durationAwareSeekDelta,
  loopAwareSeekTarget,
  scratchGrainMetadata,
  scratchSliceMetadata,
} from "../static/platter-logic.js";

test("durationAwareSeekDelta: normal duration scales platter movement", () => {
  // Given
  const pixelDelta = 20;

  // When
  const seconds = durationAwareSeekDelta(pixelDelta, 90);

  // Then
  assert.equal(seconds, 0.18);
});

test("durationAwareSeekDelta: long duration caps platter seek scale", () => {
  // Given
  const pixelDelta = 20;

  // When
  const seconds = durationAwareSeekDelta(pixelDelta, 720);

  // Then
  assert.equal(seconds, 1.08);
});

test("durationAwareSeekDelta: unknown duration uses the default scale", () => {
  // Given
  const pixelDelta = 20;

  // When
  const seconds = durationAwareSeekDelta(pixelDelta, 0);

  // Then
  assert.equal(seconds, 0.36);
});

test("loopAwareSeekTarget: wraps a drag past the loop end", () => {
  // Given
  const state = { currentTime: 4.9, pixelDelta: 20, duration: 120, loopStart: 4, loopEnd: 5 };

  // When
  const target = loopAwareSeekTarget(state);

  // Then
  assert.ok(Math.abs(target - 4.14) < 1e-9, `expected 4.14, got ${target}`);
});

test("loopAwareSeekTarget: zero-length loop lands on loop start", () => {
  // Given
  const state = { currentTime: 5, pixelDelta: 20, duration: 120, loopStart: 5, loopEnd: 5 };

  // When
  const target = loopAwareSeekTarget(state);

  // Then
  assert.equal(target, 5);
});

test("loopAwareSeekTarget: negative seek clamps to zero", () => {
  // Given
  const state = { currentTime: 0.1, pixelDelta: -100, duration: 120, loopStart: 0, loopEnd: 0 };

  // When
  const target = loopAwareSeekTarget(state);

  // Then
  assert.equal(target, 0);
});

test("scratchGrainMetadata: derives forward grain timing from drag speed", () => {
  // Given
  const drag = { pixelDelta: 16, elapsedMs: 32, currentTime: 10, bufferDuration: 180 };

  // When
  const grain = scratchGrainMetadata(drag);

  // Then
  assert.deepEqual(grain, { start: 10, duration: 0.1, reverse: false, playbackRate: 4 });
});

test("scratchGrainMetadata: derives reverse grain and clamps start near the end", () => {
  // Given
  const drag = { pixelDelta: -64, elapsedMs: 64, currentTime: 9.95, bufferDuration: 10 };

  // When
  const grain = scratchGrainMetadata(drag);

  // Then
  assert.deepEqual(grain, { start: 9.78, duration: 0.22, reverse: true, playbackRate: 4 });
});

test("scratchSliceMetadata: clamps frame window inside the buffer", () => {
  // Given
  const slice = { start: 9.9, duration: 0.5, sampleRate: 100, bufferLength: 1000, reverse: true };

  // When
  const metadata = scratchSliceMetadata(slice);

  // Then
  assert.deepEqual(metadata, { startFrame: 950, frameCount: 50, reverse: true });
});

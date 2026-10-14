import test from "node:test";
import assert from "node:assert/strict";
import {
  computeStemGains,
  loopWrapPosition,
  crossfadeGains,
  clampSeek,
} from "../static/deck-logic.js";

const STEMS = ["vocals", "drums", "bass", "other"];

function state(overrides = {}) {
  return {
    volumes: { vocals: 1, drums: 1, bass: 1, other: 1 },
    mutes: {},
    solos: {},
    ...overrides,
  };
}

test("computeStemGains: no mute/solo → each stem at its volume", () => {
  const gains = computeStemGains(STEMS, state({ volumes: { vocals: 0.5, drums: 1, bass: 0.2, other: 0 } }));
  assert.deepEqual(gains, { vocals: 0.5, drums: 1, bass: 0.2, other: 0 });
});

test("computeStemGains: muted stem is 0 regardless of volume", () => {
  const gains = computeStemGains(STEMS, state({ mutes: { drums: true } }));
  assert.equal(gains.drums, 0);
  assert.equal(gains.vocals, 1);
});

test("computeStemGains: solo silences all non-soloed stems", () => {
  const gains = computeStemGains(STEMS, state({ solos: { vocals: true } }));
  assert.deepEqual(gains, { vocals: 1, drums: 0, bass: 0, other: 0 });
});

test("computeStemGains: mute wins over solo on the same stem", () => {
  const gains = computeStemGains(STEMS, state({ solos: { vocals: true }, mutes: { vocals: true } }));
  assert.equal(gains.vocals, 0);
});

test("loopWrapPosition: returns null when loop is off", () => {
  assert.equal(loopWrapPosition(10, 0, 0), null);
});

test("loopWrapPosition: returns null while inside the loop", () => {
  assert.equal(loopWrapPosition(4.5, 4, 5), null);
});

test("loopWrapPosition: wraps overshoot back into the loop", () => {
  // 루프 4–5초, 현재 5.3초 → overshoot 0.3 → 4.3초로 점프
  const pos = loopWrapPosition(5.3, 4, 5);
  assert.ok(Math.abs(pos - 4.3) < 1e-9, `expected 4.3, got ${pos}`);
});

test("loopWrapPosition: overshoot beyond one loop length wraps modulo", () => {
  // 루프 길이 1초, overshoot 2.4 → 0.4
  const pos = loopWrapPosition(7.4, 4, 5);
  assert.ok(Math.abs(pos - 4.4) < 1e-9, `expected 4.4, got ${pos}`);
});

test("loopWrapPosition: zero-length loop jumps to loop start", () => {
  assert.equal(loopWrapPosition(5.2, 5, 5), 5);
});

test("crossfadeGains: full left → deck A only", () => {
  const { a, b } = crossfadeGains(-100);
  assert.ok(Math.abs(a - 1) < 1e-9);
  assert.ok(Math.abs(b) < 1e-9);
});

test("crossfadeGains: full right → deck B only", () => {
  const { a, b } = crossfadeGains(100);
  assert.ok(Math.abs(a) < 1e-9);
  assert.ok(Math.abs(b - 1) < 1e-9);
});

test("crossfadeGains: center is equal-power (≈0.707 each)", () => {
  const { a, b } = crossfadeGains(0);
  assert.ok(Math.abs(a - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(b - Math.SQRT1_2) < 1e-9);
});

test("clampSeek: negative time clamps to 0", () => {
  assert.equal(clampSeek(-3, 100), 0);
});

test("clampSeek: time beyond duration clamps to duration", () => {
  assert.equal(clampSeek(150, 100), 100);
});

test("clampSeek: unknown duration (0) passes time through", () => {
  assert.equal(clampSeek(42, 0), 42);
});

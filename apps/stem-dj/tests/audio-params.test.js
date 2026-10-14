import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAudioParamTarget,
  audioParamTarget,
  formatMeterPeak,
  formatPeakDb,
  percentToUnitTarget,
} from "../static/audio-params.js";
import { crossfadeGains } from "../static/deck-logic.js";

test("crossfadeGains: center crossfader remains equal-power", () => {
  // Given
  const x = 0;

  // When
  const gains = crossfadeGains(x);

  // Then
  assert.ok(Math.abs(gains.a - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(gains.b - Math.SQRT1_2) < 1e-9);
});

test("audioParamTarget: clamps out-of-range wet values", () => {
  // Given
  const rawWet = 1.7;

  // When
  const target = audioParamTarget(rawWet, { now: 12 });

  // Then
  assert.deepEqual(target, { value: 1, startTime: 12, timeConstant: 0.015 });
});

test("percentToUnitTarget: clamps out-of-range gain percentages", () => {
  // Given
  const rawGain = -20;

  // When
  const target = percentToUnitTarget(rawGain, { now: 2.5 });

  // Then
  assert.deepEqual(target, { value: 0, startTime: 2.5, timeConstant: 0.015 });
});

test("applyAudioParamTarget: schedules smoothing when AudioParam exists", () => {
  // Given
  const calls = [];
  const param = {
    setTargetAtTime(value, startTime, timeConstant) {
      calls.push({ value, startTime, timeConstant });
    },
  };

  // When
  const applied = applyAudioParamTarget(param, audioParamTarget(0.5, { now: 3 }));

  // Then
  assert.equal(applied, true);
  assert.deepEqual(calls, [{ value: 0.5, startTime: 3, timeConstant: 0.015 }]);
});

test("applyAudioParamTarget: reports false for missing AudioParam", () => {
  // Given
  const target = audioParamTarget(0.5);

  // When
  const applied = applyAudioParamTarget(null, target);

  // Then
  assert.equal(applied, false);
});

test("formatPeakDb: formats silence and finite peaks", () => {
  // Given
  const silent = 0;
  const halfScale = 0.5;

  // When
  const silentLabel = formatPeakDb(silent);
  const halfScaleLabel = formatPeakDb(halfScale);

  // Then
  assert.equal(silentLabel, "-∞ dB");
  assert.equal(halfScaleLabel, "-6.0 dB");
});

test("formatMeterPeak: formats peak percentage and dB together", () => {
  // Given
  const peak = 0.25;

  // When
  const label = formatMeterPeak(peak);

  // Then
  assert.equal(label, "25% | -12.0 dB");
});

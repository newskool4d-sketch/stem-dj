const DEFAULT_TIME_CONSTANT = 0.015;
const SILENCE_DB = "-∞ dB";

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function audioParamTarget(value, {
  min = 0,
  max = 1,
  scale = 1,
  now = 0,
  timeConstant = DEFAULT_TIME_CONSTANT,
} = {}) {
  const target = clamp(finiteOr(Number(value), min) * scale, min, max);
  return {
    value: target,
    startTime: finiteOr(Number(now), 0),
    timeConstant: Math.max(0, finiteOr(Number(timeConstant), DEFAULT_TIME_CONSTANT)),
  };
}

export function percentToUnitTarget(value, options = {}) {
  return audioParamTarget(value, { ...options, scale: 0.01 });
}

export function applyAudioParamTarget(param, target) {
  if (!param || !target) return false;
  if (typeof param.setTargetAtTime === "function") {
    param.setTargetAtTime(target.value, target.startTime, target.timeConstant);
  } else {
    param.value = target.value;
  }
  return true;
}

export function formatPeakDb(peak) {
  const safePeak = clamp(finiteOr(Number(peak), 0), 0, 1);
  if (safePeak <= 0) return SILENCE_DB;
  return `${(20 * Math.log10(safePeak)).toFixed(1)} dB`;
}

export function formatMeterPeak(peak) {
  const safePeak = clamp(finiteOr(Number(peak), 0), 0, 1);
  return `${Math.round(safePeak * 100)}% | ${formatPeakDb(safePeak)}`;
}

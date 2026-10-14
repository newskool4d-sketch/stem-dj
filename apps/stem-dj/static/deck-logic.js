// Deck 상태 계산 순수 함수 — DOM·AudioContext 의존 없음 (Node 테스트 가능)

export function computeStemGains(stems, { volumes = {}, mutes = {}, solos = {} }) {
  const soloed = stems.filter((name) => solos[name]);
  const gains = {};
  for (const name of stems) {
    const vol = volumes[name] ?? 1;
    const silenced = mutes[name] || (soloed.length && !soloed.includes(name));
    gains[name] = silenced ? 0 : vol;
  }
  return gains;
}

// 루프 끝을 넘었을 때 점프할 위치. 루프 미적용/루프 안이면 null.
export function loopWrapPosition(currentTime, loopStart, loopEnd) {
  if (!loopEnd || currentTime < loopEnd) return null;
  const loopLen = loopEnd - loopStart;
  const overshoot = currentTime - loopEnd;
  return loopStart + (loopLen > 0 ? overshoot % loopLen : 0);
}

// equal-power 크로스페이드. x: -100(A만) ~ 100(B만)
export function crossfadeGains(x) {
  const t = x / 100;
  return {
    a: Math.cos((t + 1) * Math.PI / 4),
    b: Math.sin((t + 1) * Math.PI / 4),
  };
}

export function clampSeek(time, duration) {
  return Math.max(0, Math.min(time, duration || time));
}

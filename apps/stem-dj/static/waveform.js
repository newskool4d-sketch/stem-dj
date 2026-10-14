// 파형 캔버스 렌더 — canvas 외 의존 없음

export function drawWaveCanvas(canvas, options = {}) {
  if (!canvas) return;
  const {
    peaks = [],
    duration = 0,
    currentTime = 0,
    loopStart = 0,
    loopEnd = 0,
    startTime = 0,
    endTime = duration || 1,
    color = "#31c4a8",
    gridSeconds = 0,
  } = options;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const visibleStart = Math.max(0, startTime);
  const visibleEnd = Math.max(visibleStart + 0.001, endTime);
  const visibleDuration = visibleEnd - visibleStart;
  const sourceDuration = Math.max(duration || visibleDuration, 0.001);
  const data = peaks.length ? peaks : new Array(Math.max(80, Math.floor(w / 5))).fill(0.12);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b0c10";
  ctx.fillRect(0, 0, w, h);

  if (gridSeconds) {
    ctx.strokeStyle = "#1f2835";
    ctx.lineWidth = 1;
    const first = Math.ceil(visibleStart / gridSeconds) * gridSeconds;
    for (let t = first; t < visibleEnd; t += gridSeconds) {
      const x = ((t - visibleStart) / visibleDuration) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }

  if (loopEnd > visibleStart && loopStart < visibleEnd) {
    const x1 = Math.max(0, ((loopStart - visibleStart) / visibleDuration) * w);
    const x2 = Math.min(w, ((loopEnd - visibleStart) / visibleDuration) * w);
    ctx.fillStyle = "rgba(176, 76, 255, .18)";
    ctx.fillRect(x1, 0, Math.max(2, x2 - x1), h);
    ctx.strokeStyle = "#f4c8ff";
    ctx.lineWidth = 2;
    [x1, x2].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += 2) {
    const t = visibleStart + (x / w) * visibleDuration;
    const index = Math.max(0, Math.min(data.length - 1, Math.floor((t / sourceDuration) * data.length)));
    const peak = data[index] || 0.04;
    const y = Math.max(2, peak * h * 0.47);
    ctx.beginPath();
    ctx.moveTo(x, h / 2 - y);
    ctx.lineTo(x, h / 2 + y);
    ctx.stroke();
  }

  if (duration) {
    const pos = ((currentTime - visibleStart) / visibleDuration) * w;
    if (pos >= 0 && pos <= w) {
      ctx.strokeStyle = "#e0bc5b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, h);
      ctx.stroke();
    }
  }
}

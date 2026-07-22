// Minimal canvas line chart — no dependency needed for this.

export function drawLineChart(canvas, values, opts = {}) {
  const {
    color = '#ff7a18',
    fill = 'rgba(255, 122, 24, 0.12)',
    gridColor = 'rgba(255,255,255,0.06)',
    labelColor = '#8b95a5',
    highlightLast = true,
  } = opts;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 400;
  const cssH = canvas.getAttribute('height') ? parseInt(canvas.getAttribute('height')) : 200;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!values || values.length === 0) {
    ctx.fillStyle = labelColor;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No runs yet — play this scenario to see your progress', cssW / 2, cssH / 2);
    return;
  }

  const pad = { l: 46, r: 14, t: 12, b: 22 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  min -= range * 0.1;
  max += range * 0.1;

  const x = (i) => pad.l + (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
  const y = (v) => pad.t + h - ((v - min) / (max - min)) * h;

  // grid + y labels
  ctx.strokeStyle = gridColor;
  ctx.fillStyle = labelColor;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const v = min + ((max - min) * i) / gridLines;
    const yy = y(v);
    ctx.beginPath();
    ctx.moveTo(pad.l, yy);
    ctx.lineTo(pad.l + w, yy);
    ctx.stroke();
    ctx.fillText(Math.round(v).toLocaleString(), pad.l - 8, yy + 4);
  }

  // area fill
  ctx.beginPath();
  values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
  ctx.lineTo(x(values.length - 1), pad.t + h);
  ctx.lineTo(x(0), pad.t + h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  // line
  ctx.beginPath();
  values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // points
  values.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(v), i === values.length - 1 && highlightLast ? 4.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (i === values.length - 1 && highlightLast) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  // x labels: first and last run number
  ctx.fillStyle = labelColor;
  ctx.textAlign = 'left';
  ctx.fillText('run 1', pad.l, cssH - 6);
  ctx.textAlign = 'right';
  ctx.fillText(`run ${values.length}`, pad.l + w, cssH - 6);
}

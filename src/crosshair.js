// Renders the crosshair as inline SVG from settings. Used in-game and in the settings preview.

export function crosshairSVG(ch) {
  const { style, color, size, thickness, gap, outline } = ch;
  const pad = 4;
  const total = (size + gap + pad) * 2;
  const c = total / 2;
  const stroke = outline
    ? `stroke="black" stroke-width="${thickness + 2}" `
    : '';

  let inner = '';
  const line = (x1, y1, x2, y2) => {
    let s = '';
    if (outline) s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="${thickness + 2}" stroke-linecap="square"/>`;
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="square"/>`;
    return s;
  };
  const dot = (r) => {
    let s = '';
    if (outline) s += `<circle cx="${c}" cy="${c}" r="${r + 1}" fill="black"/>`;
    s += `<circle cx="${c}" cy="${c}" r="${r}" fill="${color}"/>`;
    return s;
  };

  if (style === 'cross' || style === 'crossdot') {
    inner += line(c, c - gap - size, c, c - gap);       // top
    inner += line(c, c + gap, c, c + gap + size);       // bottom
    inner += line(c - gap - size, c, c - gap, c);       // left
    inner += line(c + gap, c, c + gap + size, c);       // right
  }
  if (style === 'dot' || style === 'crossdot') {
    inner += dot(Math.max(1.2, thickness * 0.9));
  }
  if (style === 'circle') {
    if (outline) inner += `<circle cx="${c}" cy="${c}" r="${size}" fill="none" stroke="black" stroke-width="${thickness + 2}"/>`;
    inner += `<circle cx="${c}" cy="${c}" r="${size}" fill="none" ${stroke ? '' : ''}stroke="${color}" stroke-width="${thickness}"/>`;
    inner += dot(Math.max(1.2, thickness * 0.8));
  }

  return `<svg width="${total}" height="${total}" viewBox="0 0 ${total} ${total}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

export function applyCrosshair(el, ch) {
  el.innerHTML = crosshairSVG(ch);
}

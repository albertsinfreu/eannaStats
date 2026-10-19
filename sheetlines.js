// Localiza el running score de un acta (filas de 40, como el impreso irlandés)
// y dice qué recuadro de la foto corresponde a cada marcador. No usa la red.

const ROWS = 40;

function linspace(a, b, n) {
  if (n <= 1) return [a];
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + (b - a) * i / (n - 1));
  return out;
}

function integral(gray, width, height) {
  const ii = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += 255 - gray[y * width + x];
      ii[(y + 1) * (width + 1) + (x + 1)] = ii[y * (width + 1) + (x + 1)] + row;
    }
  }
  return ii;
}

function rectMean(ii, width, y0, y1, x0, x1) {
  const stride = width + 1;
  y0 = Math.max(0, y0 | 0);
  x0 = Math.max(0, x0 | 0);
  y1 = Math.min((ii.length / stride) - 1, y1 | 0);
  x1 = Math.min(width, x1 | 0);
  if (y1 <= y0 || x1 <= x0) return 0;
  const sum = ii[y1 * stride + x1] - ii[y0 * stride + x1] - ii[y1 * stride + x0] + ii[y0 * stride + x0];
  return sum / ((y1 - y0) * (x1 - x0));
}

function cellDarkness(ii, width, height, top, pitch, x, bw, row, block, a0, a1) {
  const y0 = top + row * pitch + 1;
  const y1 = y0 + pitch - 2;
  const x0 = x + block * bw + bw * a0;
  const x1 = x + block * bw + bw * a1;
  if (y0 < 0 || x0 < 0 || y1 >= height || x1 > width) return null;
  return rectMean(ii, width, y0, y1, x0, x1);
}

function jerseyDarkness(ii, width, height, top, pitch, x, bw, row, block, side) {
  if (side === 'either') {
    const a = cellDarkness(ii, width, height, top, pitch, x, bw, row, block, 0.04, 0.36);
    const b = cellDarkness(ii, width, height, top, pitch, x, bw, row, block, 0.62, 0.98);
    if (a === null || b === null) return null;
    return Math.max(a, b);
  }
  const a0 = side === 'B' ? 0.62 : 0.04;
  const a1 = side === 'B' ? 0.98 : 0.36;
  return cellDarkness(ii, width, height, top, pitch, x, bw, row, block, a0, a1);
}

// La fila anotada tiene que estar más oscura que una fila vacía del mismo bloque.
// Así no se engancha a un bloque de texto denso (la lista de jugadores).
function contrast(ii, width, height, marks, markSet, top, pitch, x, bw, side) {
  if (pitch < 4 || bw < 8) return -1e9;
  let total = 0;
  let n = 0;
  for (const t of marks) {
    const row = (t - 1) % ROWS;
    const block = Math.floor((t - 1) / ROWS);
    const marked = jerseyDarkness(ii, width, height, top, pitch, x, bw, row, block, side);
    if (marked === null) return -1e9;
    let blank = null;
    for (let d = 1; d < 10 && blank === null; d++) {
      const r = row + d;
      if (r < ROWS && !markSet.has(r + 1 + block * ROWS)) blank = r;
    }
    if (blank === null) continue;
    const empty = jerseyDarkness(ii, width, height, top, pitch, x, bw, blank, block, side);
    if (empty === null) return -1e9;
    total += marked - empty;
    n += 1;
  }
  return n ? total / n : -1e9;
}

// Las rayas horizontales del impreso son más oscuras que el centro de la fila.
// Sirve para corregir el medio renglón que a veces se come el contraste de la tinta.
function ruleAlign(ii, width, height, top, pitch, x, bw) {
  const x1 = x + bw * 3;
  if (pitch < 5 || bw < 8 || x < 0 || x1 > width + 2) return -1e9;
  let acc = 0;
  let n = 0;
  for (let row = 0; row <= ROWS; row++) {
    const y = top + row * pitch;
    if (y < 2 || y + pitch >= height - 2) return -1e9;
    const mid0 = y + pitch * 0.36;
    const mid1 = y + pitch * 0.64;
    if (mid1 - mid0 < 2) return -1e9;
    const rule = rectMean(ii, width, y - 1, y + 1, x, x1);
    const mid = rectMean(ii, width, mid0, mid1, x, x1);
    acc += rule - mid;
    n += 1;
  }
  return n ? acc / n : -1e9;
}

function snapToRules(ii, width, height, top, pitch, x, bw) {
  let best = null;
  for (const p of linspace(pitch * 0.96, pitch * 1.04, 9)) {
    for (const t of linspace(top - pitch * 0.45, top + pitch * 0.45, 13)) {
      const v = ruleAlign(ii, width, height, t, p, x, bw);
      if (!best || v > best.v) best = { v, top: t, pitch: p };
    }
  }
  const base = ruleAlign(ii, width, height, top, pitch, x, bw);
  if (!best || best.v < 8 || best.v < base + 4) return null;
  return best;
}

function bestOf(sample, pitches, tops, xs, bws) {
  let best = null;
  for (const pitch of pitches) {
    for (const top of tops) {
      for (const x of xs) {
        for (const bw of bws) {
          const v = sample(top, pitch, x, bw);
          if (!best || v > best.v) best = { v, pitch, top, x, bw };
        }
      }
    }
  }
  return best;
}

function refine(sample, width, height, coarse, topSpan, pitchSpan) {
  if (!coarse) return null;
  const around = (center, span, n) => linspace(center - span, center + span, n);
  return bestOf(
    sample,
    around(coarse.pitch, pitchSpan, 7),
    around(coarse.top, topSpan, 9),
    around(coarse.x, width * 0.03, 7),
    around(coarse.bw, width * 0.022, 7),
  );
}

// Acta entera (marcador a la derecha), más abajo, recorte, apaisada o el marcador en medio.
const WINDOWS = [
  { pitch: [0.0072, 0.0128], top: [0.28, 0.42], x: [0.42, 0.62], bw: [0.10, 0.17] },
  { pitch: [0.0060, 0.0140], top: [0.40, 0.62], x: [0.35, 0.70], bw: [0.08, 0.20] },
  { pitch: [0.0060, 0.0140], top: [0.12, 0.32], x: [0.25, 0.58], bw: [0.08, 0.22] },
  { pitch: [0.0140, 0.0400], top: [0.00, 0.28], x: [0.00, 0.42], bw: [0.16, 0.42] },
  { pitch: [0.0120, 0.0380], top: [0.00, 0.35], x: [0.35, 0.75], bw: [0.08, 0.24] },
  { pitch: [0.0045, 0.0130], top: [0.08, 0.55], x: [0.18, 0.70], bw: [0.08, 0.26] },
];

function searchWindows(sample, width, height, minV) {
  let best = null;
  for (const win of WINDOWS) {
    const coarse = bestOf(
      sample,
      linspace(height * win.pitch[0], height * win.pitch[1], 10),
      linspace(height * win.top[0], height * win.top[1], 12),
      linspace(width * win.x[0], width * win.x[1], 9),
      linspace(width * win.bw[0], width * win.bw[1], 7),
    );
    const fine = refine(sample, width, height, coarse, height * 0.02, height * 0.0012);
    const hit = fine && fine.v >= (coarse?.v || -1e9) ? fine : coarse;
    if (!accept(sample, hit, minV)) continue;
    if (!best || hit.v > best.v) best = hit;
  }
  return best;
}

function accept(sample, hit, min = 8) {
  if (!hit || hit.v < min || hit.pitch < 4.5) return false;
  const shifted = sample(hit.top + hit.pitch * 0.5, hit.pitch, hit.x, hit.bw);
  return hit.v >= shifted + 2.5;
}

function locateAnywhere(sample, width, height, minV) {
  const pitchMin = Math.max(5, height / 90);
  const pitchMax = Math.max(pitchMin + 0.5, height / 42);
  const coarse = bestOf(
    sample,
    linspace(pitchMin, pitchMax, 14),
    linspace(1, Math.max(2, height * 0.58), 16),
    linspace(0, width * 0.74, 14),
    linspace(Math.max(8, width * 0.07), width * 0.34, 10),
  );
  const fine = refine(sample, width, height, coarse, height * 0.03, (pitchMax - pitchMin) * 0.08);
  const hit = fine && fine.v >= (coarse?.v || -1e9) ? fine : coarse;
  return accept(sample, hit, minV) ? hit : null;
}

function pack(hit, ii, width, height, sample) {
  const snapped = snapToRules(ii, width, height, hit.top, hit.pitch, hit.x, hit.bw);
  if (snapped && sample(snapped.top, snapped.pitch, hit.x, hit.bw) > hit.v * 0.55) {
    hit = { ...hit, top: snapped.top, pitch: snapped.pitch };
  }
  return { top: hit.top, pitch: hit.pitch, x: hit.x, blockWidth: hit.bw, rows: ROWS, score: hit.v };
}

/**
 * gray: luminancia 0–255, fila a fila.
 * totals: marcadores acumulados que tienen tinta (el dorsal escrito).
 * Devuelve el recuadro de cada fila, o null si la foto no encaja con esta plantilla.
 */
export function locateRunningScore(gray, width, height, totals, { side = 'A' } = {}) {
  if (width < 40 || height < 80) return null;
  const marks = [...new Set((totals || []).map((t) => parseInt(t, 10)).filter((t) => t > 0 && t <= ROWS * 4))];
  const ii = integral(gray, width, height);
  const markSet = new Set(marks);
  const sides = side === 'B' ? ['B', 'either', 'A'] : ['A', 'either', 'B'];

  if (marks.length >= 3) {
    for (const inkSide of sides) {
      const sample = (top, pitch, x, bw) => contrast(ii, width, height, marks, markSet, top, pitch, x, bw, inkSide);
      const hit = searchWindows(sample, width, height, 3.5)
        || (width >= 260 && height >= 340 ? locateAnywhere(sample, width, height, 3.5) : null);
      if (hit) return pack(hit, ii, width, height, sample);
    }
  }

  const byRule = (top, pitch, x, bw) => ruleAlign(ii, width, height, top, pitch, x, bw);
  const ruled = searchWindows(byRule, width, height, 14)
    || (width >= 260 && height >= 340 ? locateAnywhere(byRule, width, height, 14) : null);
  if (ruled) return pack(ruled, ii, width, height, byRule);
  return null;
}

const INK = 76;

function inkMean(ii, width, grid, total, side) {
  const t = parseInt(total, 10);
  if (!Number.isFinite(t) || t < 1) return 0;
  const row = (t - 1) % grid.rows;
  const block = Math.floor((t - 1) / grid.rows);
  const a0 = side === 'B' ? 0.66 : 0.02;
  const a1 = side === 'B' ? 0.92 : 0.34;
  const yBase = grid.top + row * grid.pitch;
  const xBase = grid.x + block * grid.blockWidth;
  return rectMean(
    ii, width,
    yBase + grid.pitch * 0.35, yBase + grid.pitch * 0.75,
    xBase + grid.blockWidth * a0, xBase + grid.blockWidth * a1,
  );
}

/**
 * Totales que tienen tinta y la lectura se ha saltado: antes del primer
 * marcador, en un salto de 4 o más, o entre el último y el resultado final.
 */
export function missingInkedTotals(gray, width, height, grid, existing, side = 'A', upTo = null) {
  if (!grid) return [];
  const have = [...new Set(existing.map((t) => parseInt(t, 10)).filter((t) => t > 0))].sort((a, b) => a - b);
  const candidates = [];
  const first = have[0] ?? 0;
  for (let t = 1; t < first; t++) candidates.push(t);
  for (let i = 0; i < have.length - 1; i++) {
    if (have[i + 1] - have[i] >= 4) {
      for (let t = have[i] + 1; t < have[i + 1]; t++) candidates.push(t);
    }
  }
  const last = have.at(-1) ?? 0;
  const end = parseInt(upTo, 10);
  if (Number.isFinite(end) && end > last) {
    for (let t = last + 1; t <= Math.min(end, grid.rows * 4); t++) candidates.push(t);
  }
  const ii = integral(gray, width, height);
  return candidates.filter((t) => inkMean(ii, width, grid, t, side) >= INK);
}

/** Recuadro, en píxeles de `gray`, de la línea real que contiene ese marcador. */
export function lineBox(grid, total) {
  const t = parseInt(total, 10);
  if (!grid || !Number.isFinite(t) || t < 1) return null;
  const row = (t - 1) % grid.rows;
  const block = Math.floor((t - 1) / grid.rows);
  const padX = grid.blockWidth * 0.2;
  const padY = grid.pitch * 0.12;
  return {
    x: grid.x + block * grid.blockWidth - padX,
    y: grid.top + row * grid.pitch - padY,
    w: grid.blockWidth + padX * 1.35,
    h: grid.pitch + padY * 2,
    row,
    block,
  };
}

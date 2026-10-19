import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseScoreGrid, gridFromAiMarks, lineBox, locateRunningScore, missingInkedTotals } from '../sheetlines.js';

function paintSheet({
  width = 320, height = 640, top = 200, pitch = 7, x = 160, bw = 42,
  totals = [2, 6, 15, 36, 42, 86, 100], side = 'A', rules = false,
} = {}) {
  const gray = new Uint8Array(width * height).fill(238);
  if (rules) {
    for (let row = 0; row <= 40; row++) {
      const y = Math.round(top + row * pitch);
      for (let xx = x; xx < x + bw * 3 && xx < width; xx++) {
        if (y >= 0 && y < height) gray[y * width + xx] = 40;
      }
    }
  }
  const inkX = (block) => Math.round(x + block * bw + (side === 'B' ? bw * 0.72 : 3));
  for (const t of totals) {
    const row = (t - 1) % 40;
    const block = Math.floor((t - 1) / 40);
    const y0 = Math.round(top + row * pitch + 1);
    const x0 = inkX(block);
    for (let yy = y0; yy < y0 + pitch - 2; yy++) {
      for (let xx = x0; xx < x0 + 12; xx++) {
        if (yy >= 0 && yy < height && xx >= 0 && xx < width) gray[yy * width + xx] = 25;
      }
    }
  }
  return { gray, width, height, top, pitch, x, bw, totals };
}

test('encuentra la fila real de cada marcador en una plantilla de 40', () => {
  const sheet = paintSheet();
  const grid = locateRunningScore(sheet.gray, sheet.width, sheet.height, sheet.totals, { side: 'A' });
  assert.ok(grid, 'no localizó el running score');
  assert.ok(Math.abs(grid.top - sheet.top) < 2, `top ${grid.top}`);
  assert.ok(Math.abs(grid.pitch - sheet.pitch) < 0.6, `pitch ${grid.pitch}`);
  assert.ok(Math.abs(grid.x - sheet.x) < 8, `x ${grid.x}`);
  const box15 = lineBox(grid, 15);
  const box86 = lineBox(grid, 86);
  assert.equal(box15.row, 14);
  assert.equal(box15.block, 0);
  assert.equal(box86.row, 5);
  assert.equal(box86.block, 2);
  assert.ok(box86.x > box15.x);
  assert.ok(Math.abs((box15.y + box15.h / 2) - (sheet.top + 14.5 * sheet.pitch)) < 3);
});

test('recupera la línea del 2 si la lectura empieza más tarde', () => {
  const sheet = paintSheet();
  const grid = locateRunningScore(sheet.gray, sheet.width, sheet.height, sheet.totals, { side: 'A' });
  const missing = missingInkedTotals(sheet.gray, sheet.width, sheet.height, grid, [6, 15, 36], 'A');
  assert.deepEqual(missing, [2]);
});

test('una foto en blanco no inventa líneas', () => {
  const gray = new Uint8Array(200 * 300).fill(240);
  assert.equal(locateRunningScore(gray, 200, 300, [2, 4, 6, 8, 10, 12]), null);
});

test('localiza un recorte que solo tiene el marcador', () => {
  const sheet = paintSheet({
    width: 220, height: 340, top: 12, pitch: 7.4, x: 8, bw: 68,
    totals: [2, 4, 8, 11, 13, 18, 28], rules: true,
  });
  const grid = locateRunningScore(sheet.gray, sheet.width, sheet.height, sheet.totals, { side: 'A' });
  assert.ok(grid, 'no localizó el recorte');
  assert.ok(Math.abs(grid.top - sheet.top) < 4, `top ${grid.top}`);
  assert.ok(Math.abs(grid.pitch - sheet.pitch) < 0.8, `pitch ${grid.pitch}`);
  assert.ok(Math.abs(grid.x - sheet.x) < 14, `x ${grid.x}`);
});

test('localiza el marcador en una foto apaisada con el bloque a la derecha', () => {
  const sheet = paintSheet({
    width: 480, height: 360, top: 28, pitch: 7.2, x: 270, bw: 52,
    totals: [2, 4, 6, 8, 11, 13, 18], side: 'B', rules: true,
  });
  const grid = locateRunningScore(sheet.gray, sheet.width, sheet.height, sheet.totals, { side: 'B' });
  assert.ok(grid, 'no localizó la foto apaisada');
  assert.ok(grid.x > sheet.width * 0.4, `x ${grid.x}`);
  assert.ok(Math.abs(grid.pitch - sheet.pitch) < 1.6, `pitch ${grid.pitch}`);
});

test('el recorte de cada fila sale de las cajas de esta foto, no de una plantilla', () => {
  const marksClose = {
    runningScore: { left: 20 / 280, top: 20 / 360, right: 100 / 280, bottom: 340 / 360 },
    scoreRows: [
      { total: 1, left: 20 / 280, top: 20 / 360, right: 100 / 280, bottom: 28 / 360 },
      { total: 40, left: 20 / 280, top: 332 / 360, right: 100 / 280, bottom: 340 / 360 },
    ],
  };
  const marksWide = {
    runningScore: { left: 520 / 900, top: 40 / 500, right: 850 / 900, bottom: 440 / 500 },
    scoreRows: [
      { total: 1, left: 520 / 900, top: 40 / 500, right: 630 / 900, bottom: 50 / 500 },
      { total: 40, left: 520 / 900, top: 430 / 500, right: 630 / 900, bottom: 440 / 500 },
      { total: 41, left: 630 / 900, top: 40 / 500, right: 740 / 900, bottom: 50 / 500 },
      { total: 80, left: 630 / 900, top: 430 / 500, right: 740 / 900, bottom: 440 / 500 },
      { total: 81, left: 740 / 900, top: 40 / 500, right: 850 / 900, bottom: 50 / 500 },
      { total: 120, left: 740 / 900, top: 430 / 500, right: 850 / 900, bottom: 440 / 500 },
    ],
  };
  const gridClose = gridFromAiMarks(marksClose, 280, 360);
  const gridWide = gridFromAiMarks(marksWide, 900, 500);
  const boxClose = lineBox(gridClose, 15);
  const boxWide15 = lineBox(gridWide, 15);
  const boxWide86 = lineBox(gridWide, 86);
  assert.ok(gridClose && gridWide);
  assert.ok(boxClose.x < 56, `close x ${boxClose.x}`);
  assert.ok(boxWide15.x > 450, `wide x ${boxWide15.x}`);
  assert.ok(boxWide86.x > boxWide15.x);
  assert.ok(Math.abs(boxClose.y - (20 + 14 * 8)) < 6, `close y ${boxClose.y}`);
  assert.equal(gridFromAiMarks({}, 400, 400), null);
});

test('el recorte del 3 es el marcador, no la lista ni Period 2', () => {
  const sheet = paintSheet({
    width: 400, height: 640, top: 200, pitch: 7, x: 210, bw: 48,
    totals: [2, 3, 6, 8, 11, 13, 15], rules: true,
  });
  for (let row = 0; row < 16; row++) {
    const y = 24 + row * 14;
    for (let x = 6; x < 150; x++) {
      if (y >= 0 && y < sheet.height) sheet.gray[y * sheet.width + x] = 35;
    }
    for (let v = 0; v < 8; v++) {
      const vx = 6 + v * 18;
      for (let yy = y; yy < y + 14 && yy < sheet.height; yy++) {
        if (vx < sheet.width) sheet.gray[yy * sheet.width + vx] = 35;
      }
    }
  }
  const marks = {
    scoreRows: [
      { total: 1, left: 0, top: 0.05, right: 1, bottom: 0.07 },
      { total: 40, left: 0, top: 0.70, right: 1, bottom: 0.72 },
    ],
  };
  const grid = chooseScoreGrid(sheet.gray, sheet.width, sheet.height, sheet.totals, 'A', marks);
  const box = lineBox(grid, 3);
  assert.ok(grid && box, 'sin recorte');
  assert.ok(grid.source !== 'ai', 'tenía que usar el marcador de 40 filas, no la caja ancha');
  assert.ok(box.x > 160, `x ${box.x} sigue en la lista`);
  assert.equal(box.row, 2);
});

test('entiende el nombre de texto 15.png si no viene total', () => {
  const grid = gridFromAiMarks({
    scoreRows: [
      { file: '1.png', left: 0.2, top: 0.1, right: 0.4, bottom: 0.12 },
      { file: 'row_40.png', left: 0.2, top: 0.88, right: 0.4, bottom: 0.90 },
    ],
  }, 500, 500);
  const box = lineBox(grid, 15);
  assert.ok(box);
  assert.ok(box.x > 90 && box.x < 120);
  assert.ok(box.y > 80 && box.y < 200);
});

test('si solo marca el marcador, parte esa caja de esta foto en filas', () => {
  const grid = gridFromAiMarks({
    runningScore: { left: 0.1, top: 0.2, right: 0.7, bottom: 0.8 },
  }, 1000, 800);
  const box1 = lineBox(grid, 1);
  const box41 = lineBox(grid, 41);
  const box81 = lineBox(grid, 81);
  assert.ok(box1 && box41 && box81);
  assert.ok(Math.abs(box1.x - 100) < 16);
  assert.ok(box41.x > box1.x);
  assert.ok(box81.x > box41.x);
  assert.ok(Math.abs(box1.y - 160) < 16);
});

test('localiza el marcador cuando Éanna anota a la derecha', () => {
  const sheet = paintSheet({
    width: 320, height: 640, top: 200, pitch: 7, x: 160, bw: 42,
    totals: [2, 4, 6, 8, 11, 13, 14], side: 'B', rules: true,
  });
  const grid = locateRunningScore(sheet.gray, sheet.width, sheet.height, sheet.totals, { side: 'B' });
  assert.ok(grid, 'no localizó el lado B');
  assert.ok(Math.abs(grid.top - sheet.top) < 3, `top ${grid.top}`);
  const box = lineBox(grid, 11);
  assert.equal(box.row, 10);
  assert.equal(box.block, 0);
});

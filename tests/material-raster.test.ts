import assert from "node:assert/strict";
import test from "node:test";
import {
  cellCorners,
  rasterCellQuads,
} from "../src/simulation/material-raster";
import type { Point } from "../src/simulation/model";

test("rotating a grown tissue surface preserves its filled interior instead of perforating it", () => {
  const material = Array.from({ length: 14 * 8 }, (_, i) => {
    const cell = {
      x: 24 + (i % 14),
      y: 25 + Math.floor(i / 14),
      color: "#FFFFFF",
    };
    return { cell, quad: cellCorners(cell), center: cell };
  });
  for (const angle of [0.15, 0.4, 0.65, 0.9, 1.3]) {
    const c = Math.cos(angle),
      s = Math.sin(angle),
      origin = { x: 30.5, y: 28.5 };
    const transform = (p: Point) => ({
      x: origin.x + (p.x - origin.x) * c - (p.y - origin.y) * s,
      y: origin.y + (p.x - origin.x) * s + (p.y - origin.y) * c,
    });
    const cells = new Set(
      rasterCellQuads(material, transform).map((p) => `${p.x},${p.y}`),
    );
    for (let y = 15; y < 44; y++)
      for (let x = 15; x < 48; x++) {
        const dx = x - origin.x,
          dy = y - origin.y,
          source = {
            x: origin.x + dx * c + dy * s,
            y: origin.y - dx * s + dy * c,
          };
        if (source.x > 24 && source.x < 37 && source.y > 25 && source.y < 32)
          assert.ok(
            cells.has(`${x},${y}`),
            `missing interior pixel at${angle}/${x},${y}`,
          );
      }
  }
});

test("subpixel tissue keeps a deliberate pixel and exact identity transport retains pigment and depth", () => {
  const cell = { x: 7, y: 9, color: "#AA3344", z: 5 },
    quad = { cell, quad: cellCorners(cell), center: cell };
  assert.deepEqual(rasterCellQuads([quad]), [cell]);
  const tiny = rasterCellQuads([quad], (p) => ({
    x: 3.1 + (p.x - 7) * 0.1,
    y: 4.1 + (p.y - 9) * 0.1,
  }));
  assert.deepEqual(tiny, [{ ...cell, x: 3, y: 4 }]);
});

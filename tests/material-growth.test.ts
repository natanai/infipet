import assert from "node:assert/strict";
import test from "node:test";
import { grownMaterialCells } from "../src/simulation/material-growth";
import type { Tissue } from "../src/simulation/material";
import type { Pixel } from "../src/simulation/model";

const tissue = (cells: Pixel[]) => ({ cells }) as Tissue;
const cell = (x: number, y: number, color = "#fff") => ({ x, y, color });
const contains = (cells: Pixel[], x: number, y: number) =>
  cells.some((p) => p.x === x && p.y === y);

test("new tissue starts at zero and expands the actual source contour", () => {
  const t = tissue([cell(5, 5), cell(6, 5), cell(5, 6)]);
  assert.equal(grownMaterialCells(t, 0), t.cells);
  assert.equal(grownMaterialCells(t, 0.49).length, 3);
  const grown = grownMaterialCells(t, 1);
  assert.ok(contains(grown, 4, 5));
  assert.ok(contains(grown, 7, 5));
  assert.ok(!contains(grown, 7, 7));
  for (const p of t.cells) assert.ok(contains(grown, p.x, p.y));
});

test("distance-band growth preserves authored cavities and detached gaps", () => {
  const outline: Pixel[] = [];
  for (let y = 5; y <= 11; y++)
    for (let x = 5; x <= 11; x++)
      if (x === 5 || x === 11 || y === 5 || y === 11) outline.push(cell(x, y));
  const grown = grownMaterialCells(tissue(outline), 4);
  for (let y = 6; y <= 10; y++)
    for (let x = 6; x <= 10; x++) assert.ok(!contains(grown, x, y));
  const islands = grownMaterialCells(tissue([cell(4, 8), cell(8, 8)]), 5);
  for (let y = 3; y <= 13; y++) assert.ok(!contains(islands, 6, y));
});

test("new pixels inherit local pigment, remain bounded, and ignore source ordering", () => {
  const cells = [cell(8, 8, "#f00"), cell(9, 8, "#00f")];
  const a = grownMaterialCells(tissue(cells), 2);
  const b = grownMaterialCells(tissue([...cells].reverse()), 2);
  assert.deepEqual(a.slice(0, -2), b.slice(0, -2));
  assert.equal(a.find((p) => p.x === 7 && p.y === 8)?.color, "#f00");
  assert.equal(a.find((p) => p.x === 10 && p.y === 8)?.color, "#00f");
  assert.deepEqual(
    grownMaterialCells(tissue(cells), 100),
    grownMaterialCells(tissue(cells), 8),
  );
});

test("partitioned material retains cavities belonging to the complete authored mask", () => {
  const outline: Pixel[] = [];
  for (let y = 5; y <= 11; y++)
    for (let x = 5; x <= 11; x++)
      if (x === 5 || x === 11 || y === 5 || y === 11) outline.push(cell(x, y));
  const source = tissue(outline),
    domain = tissue(outline.filter((p) => p.y < 9));
  const grown = grownMaterialCells(domain, 3, 8, source);
  for (let y = 6; y <= 10; y++)
    for (let x = 6; x <= 10; x++) assert.ok(!contains(grown, x, y));
  assert.ok(contains(grown, 4, 6));
});

import test from "node:test";
import assert from "node:assert/strict";
import { drawingFromMonochromeRows } from "../src/drawing-features";
import { drawingPixels } from "../src/drawing";

test("generic visible hints distinguish bright facial islands inside a drawn hollow body", () => {
  const rows = [
    ".........",
    ".#######.",
    ".#.....#.",
    ".#.#.#.#.",
    ".#.....#.",
    ".#..#..#.",
    ".#.....#.",
    ".#######.",
    ".........",
  ];
  const parts = drawingFromMonochromeRows(rows);
  assert.equal(parts.filter((p) => p.kind === "eye").length, 2);
  assert.equal(parts.filter((p) => p.kind === "mouth").length, 1);
  assert.ok(
    parts
      .slice(1)
      .every((p) => p.pixels.every((pixel) => pixel.color === "#FFFFFF")),
  );
  const offset = Math.floor((32 - rows.length) / 2);
  const expected = rows
    .flatMap((row, y) =>
      [...row].flatMap((ink, x) =>
        ink === "#" ? [`${x + offset},${y + offset}`] : [],
      ),
    )
    .sort();
  const actual = drawingPixels(parts)
    .filter((p) => p.color === "#FFFFFF")
    .map((p) => `${p.x},${p.y}`)
    .sort();
  assert.deepEqual(
    actual,
    expected,
    "hints cannot add hidden source cells or change visible starting ink",
  );
  assert.deepEqual(drawingFromMonochromeRows(rows), parts);
});

test("uncontained fragments remain ordinary body ink without invented facial features", () => {
  const parts = drawingFromMonochromeRows(["#...#", ".....", "..#.."]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].pixels.length, 3);
});

test("filled drawings retain their visible negative-pigment feature hints", () => {
  const parts = drawingFromMonochromeRows([
    ".#####.",
    "##.#.##",
    "#######",
    ".##.##.",
    ".#####.",
  ]);
  assert.equal(parts.filter((p) => p.kind === "eye").length, 2);
  assert.ok(
    parts
      .slice(1)
      .every((p) => p.pixels.every((pixel) => pixel.color === "#000000")),
  );
});

test("empty border padding does not change which visible features receive hints", () => {
  const rows = [".#####.", "##.#.##", "#######", ".##.##.", ".#####."];
  const padded = [
    ".........",
    ".........",
    ".........",
    ...rows.map((row) => `.${row}.`),
    ".........",
  ];
  const types = (value: readonly string[]) =>
    drawingFromMonochromeRows(value)
      .slice(1)
      .map((part) => [part.kind, part.pixels.length]);
  assert.deepEqual(types(padded), types(rows));
});

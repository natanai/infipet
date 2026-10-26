import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RETRO_PRESETS,
  RETRO_ROSTER,
  cloneRetroPreset,
  drawingFromRows,
} from "../src/retro";
import { drawingPixels, paintStroke } from "../src/drawing";
import { createSimulation, flattenAnatomy } from "../src/simulation";

test("every observed retro source is ordinary editable ink and retains the exact observed birth drawing", () => {
  assert.equal(RETRO_ROSTER.length, 36);
  assert.ok(RETRO_PRESETS.length >= 25);
  assert.equal(
    RETRO_PRESETS.filter((p) => p.root && p.deviceId !== "p2").length,
    2,
  );
  for (const preset of RETRO_PRESETS) {
    const parts = cloneRetroPreset(preset.id),
      clone = cloneRetroPreset(preset.referenceId);
    assert.deepEqual(parts, clone);
    assert.ok(
      parts.every(
        (p) => p.id === "body" || /^eye-\d+$/.test(p.id) || p.id === "mouth",
      ),
    );
    assert.ok(
      parts.every(
        (p) =>
          !p.id.includes(preset.referenceId) && !p.name.includes(preset.name),
      ),
    );
    const ink = drawingPixels(parts).filter((p) => p.color === "#FFFFFF");
    assert.equal(ink.length, preset.rows.join("").split("#").length - 1);
    const frame = createSimulation(parts, "reference-birth").frameAt(0, {
      time: 0,
    });
    assert.deepEqual(
      frame.pixels,
      flattenAnatomy(parts).map((p) => ({ ...p, x: p.x + 16, y: p.y + 16 })),
    );
    const altered = paintStroke(parts, "decoration", "#18D7E8", [
      { x: 0, y: 0 },
    ]);
    assert.ok(drawingPixels(altered).some((p) => p.color === "#18D7E8"));
    assert.deepEqual(
      parts,
      clone,
      "editing the copy must not alter a preset or sibling copy",
    );
    parts[0].pixels[0].color = "#112233";
    assert.notDeepEqual(parts, clone);
  }
});

test("drawing hints are derived from enclosed ink holes without adding unseen source data", () => {
  const rows = [".#####.", "##.#.##", "#######", ".#####."];
  const source = drawingFromRows(rows);
  assert.equal(source.filter((p) => p.kind === "eye").length, 2);
  assert.ok(source.every((p) => p.pixels.length > 0));
  assert.deepEqual(drawingFromRows(rows), source);
  assert.throws(() => drawingFromRows(["#", "##"]));
  assert.throws(() => drawingFromRows(["x"]));
  assert.throws(() => drawingFromRows([".".repeat(33)]));
});

test("the normal renderer has no reference-catalog or future-pose dependency", () => {
  const files = [
    "growth",
    "genome",
    "development",
    "regional-layout",
    "morphogenesis",
  ];
  for (const file of files) {
    const text = readFileSync(`src/simulation/${file}.ts`, "utf8");
    assert.ok(
      !/from\s+["'][^"']*(?:retro|reference-catalog|preset-data)/.test(text),
      file,
    );
    assert.ok(
      !/(?:Botamon|Koromon|Greymon|Mametchi|Mimitchi)/i.test(text),
      file,
    );
  }
});

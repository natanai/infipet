import assert from "node:assert/strict";
import test from "node:test";
import { STARTER_PRESETS, clonePreset } from "../src/presets";
import { drawingPixels, paintStroke } from "../src/drawing";
import { createSimulation, flattenAnatomy } from "../src/simulation";
import { PROTOTYPE_REVISION } from "../src/pet-format";

test("six original LCD infants have bounded, independent shared-canvas sources", () => {
  assert.equal(PROTOTYPE_REVISION, "life-v10");
  assert.deepEqual(
    STARTER_PRESETS.map((pet) => pet.id),
    ["bean", "sprout", "canine-cub", "ribbon", "beetle", "wisp"],
  );
  for (const preset of STARTER_PRESETS) {
    const byId = new Map(preset.parts.map((part) => [part.id, part]));
    assert.equal(byId.size, preset.parts.length);
    assert.ok(Object.isFrozen(preset) && Object.isFrozen(preset.parts));
    for (const part of preset.parts) {
      assert.ok(
        part.parentId === null || byId.has(part.parentId),
        `${preset.id}/${part.id}: valid host`,
      );
      assert.ok(part.pixels.length > 0);
      assert.equal(
        new Set(part.pixels.map((pixel) => `${pixel.x},${pixel.y}`)).size,
        part.pixels.length,
      );
      for (const pixel of part.pixels) {
        assert.ok(Number.isInteger(pixel.x) && Number.isInteger(pixel.y));
        assert.ok(
          pixel.x + part.position.x >= 0 && pixel.x + part.position.x < 32,
        );
        assert.ok(
          pixel.y + part.position.y >= 0 && pixel.y + part.position.y < 32,
        );
        assert.ok(pixel.color === "#FFFFFF" || pixel.color === "#000000");
      }
    }
    const first = clonePreset(preset.id),
      second = clonePreset(preset.id);
    first[0].pixels[0].color = "#123456";
    first[0].position.x += 1;
    assert.notDeepEqual(first, second);
    assert.deepEqual(second, preset.parts);
    assert.notEqual(first[0].pixels[0], second[0].pixels[0]);
  }
  assert.throws(() => clonePreset("missing"), /Unknown starter preset/);
});

test("all starters remain editable on the one source canvas and preserve exact birth artwork", () => {
  for (const preset of STARTER_PRESETS) {
    const parts = clonePreset(preset.id),
      before = drawingPixels(parts);
    const next = paintStroke(parts, "decoration", "#18D7E8", [{ x: 0, y: 0 }]);
    assert.equal(drawingPixels(next).length, before.length + 1);
    assert.ok(
      drawingPixels(next).some(
        (pixel) => pixel.x === 0 && pixel.y === 0 && pixel.color === "#18D7E8",
      ),
    );
    assert.deepEqual(parts, preset.parts);
    assert.deepEqual(
      createSimulation(parts, "starter-birth").frameAt(0, { time: 0 }).pixels,
      flattenAnatomy(parts).map((pixel) => ({
        ...pixel,
        x: pixel.x + 16,
        y: pixel.y + 16,
      })),
    );
  }
});

test("starter hints describe functional anatomy without treating ornaments as wings or eggs", () => {
  const cub = clonePreset("canine-cub");
  for (const role of ["fore-left", "fore-right", "hind-left", "hind-right"]) {
    assert.equal(cub.find((part) => part.id === `leg-${role}`)?.kind, "leg");
    assert.equal(
      cub.find((part) => part.id === `foot-${role}`)?.parentId,
      `leg-${role}`,
    );
  }
  assert.equal(cub.filter((part) => part.kind === "leg").length, 4);
  for (const id of ["bean", "ribbon", "wisp"]) {
    assert.equal(
      clonePreset(id).filter((part) =>
        ["arm", "leg", "foot"].includes(part.kind),
      ).length,
      0,
    );
  }
  assert.ok(
    !STARTER_PRESETS.flatMap((preset) => preset.parts).some(
      (part) => part.kind === "egg" || part.kind === "wing",
    ),
  );
});

test("wisp authored features are visible in the hollow interior and detached hands retain ownership", () => {
  const parts = clonePreset("wisp"),
    flat = flattenAnatomy(parts);
  for (const part of parts.filter((part) =>
    ["eye", "mouth", "hand"].includes(part.kind),
  )) {
    assert.equal(part.parentId, "body");
    for (const pixel of part.pixels) {
      assert.ok(
        flat.some(
          (value) =>
            value.x === pixel.x + part.position.x &&
            value.y === pixel.y + part.position.y &&
            value.color === pixel.color,
        ),
      );
    }
  }
  const body = parts.find((part) => part.id === "body")!;
  assert.ok(
    !body.pixels.some(
      (pixel) =>
        pixel.x + body.position.x === 16 && pixel.y + body.position.y === 14,
    ),
  );
  const hands = parts.filter((part) => part.kind === "hand");
  for (const hand of hands) {
    const separation = Math.min(
      ...hand.pixels.flatMap((a) =>
        body.pixels.map((b) =>
          Math.hypot(
            a.x + hand.position.x - b.x - body.position.x,
            a.y + hand.position.y - b.y - body.position.y,
          ),
        ),
      ),
    );
    assert.ok(separation > 2, `${hand.id} remains visibly detached`);
  }
});

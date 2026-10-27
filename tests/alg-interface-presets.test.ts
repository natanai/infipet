import test from "node:test";
import assert from "node:assert/strict";
import { STARTER_PRESETS, clonePreset } from "../src/presets";
import { PRESET_COLORS } from "../src/palette";
import { PART_KINDS, DRAW_SIZE } from "../src/simulation";
import { birthPlayerLife } from "../src/integration/player-lifecycle";
import { decodePet, encodePet, PROTOTYPE_REVISION } from "../src/pet-format";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION } from "../src/needs";

test("[UI-001/A1] exactly 12 editable source drawings have stable unique identities, fixed seeds and existing swatches", () => {
  assert.equal(STARTER_PRESETS.length, 12);
  assert.deepEqual(
    STARTER_PRESETS.map((p) => [p.id, p.seed]),
    [
      ["bean", "BEAN-87320104"],
      ["sprout", "SPROUT-39481726"],
      ["canine-cub", "CUB-72018439"],
      ["ribbon", "RIBBON-51820476"],
      ["beetle", "BEETLE-26091384"],
      ["wisp", "WISP-63817205"],
      ["coral", "CORAL-28174690"],
      ["stilt", "STILT-48193062"],
      ["kite", "KITE-93716284"],
      ["lantern", "LANTERN-16284039"],
      ["drift", "DRIFT-59271048"],
      ["crown", "CROWN-74920163"],
    ],
  );
  assert.deepEqual(PRESET_COLORS, [
    "#000000",
    "#444444",
    "#777777",
    "#AAAAAA",
    "#DDDDDD",
    "#FFFFFF",
    "#18D7E8",
    "#FF2B1C",
    "#A378C8",
    "#86AC6B",
    "#E8B56C",
    "#DA8E9F",
  ]);
  for (const preset of STARTER_PRESETS) {
    const parts = clonePreset(preset.id),
      ids = new Set(parts.map((p) => p.id));
    assert.equal(ids.size, parts.length);
    assert.ok(parts.some((p) => p.parentId === null));
    assert.ok(parts.length > 0);
    for (const part of parts) {
      assert.ok(PART_KINDS.includes(part.kind));
      assert.ok(part.pixels.length > 0);
      const ancestors = new Set([part.id]);
      let parent = part.parentId;
      while (parent !== null) {
        assert.ok(ids.has(parent), `${preset.id}: dangling parent ${parent}`);
        assert.ok(!ancestors.has(parent), `${preset.id}: parent cycle`);
        ancestors.add(parent);
        parent = parts.find((p) => p.id === parent)!.parentId;
      }
      const positions = new Set<string>();
      for (const cell of part.pixels) {
        assert.ok((PRESET_COLORS as readonly string[]).includes(cell.color));
        const x = cell.x + part.position.x,
          y = cell.y + part.position.y;
        assert.ok(
          Number.isInteger(x) &&
            Number.isInteger(y) &&
            x >= 0 &&
            y >= 0 &&
            x < DRAW_SIZE &&
            y < DRAW_SIZE,
        );
        assert.ok(!positions.has(`${x},${y}`));
        positions.add(`${x},${y}`);
      }
    }
    const life = birthPlayerLife(
      { parts, mode: "infant", name: preset.name, seed: preset.seed },
      1_000_000,
    );
    const doc = {
      version: 8 as const,
      algorithmVersion: 7 as const,
      revision: PROTOTYPE_REVISION,
      parts,
      mode: "infant" as const,
      name: preset.name,
      seed: preset.seed,
      bornAt: 1_000_000,
      age: 0,
      needTimeline: [],
      groomingTimeline: [],
      catalogVersion: NEEDS_CATALOG_VERSION,
      needsRulesVersion: NEEDS_RULES_VERSION,
      life,
    };
    assert.deepEqual(
      decodePet(encodePet(doc)).life,
      life,
      `${preset.id}: native birth/save roundtrip`,
    );
    const original = JSON.stringify(preset);
    parts[0].pixels[0].color = "#123456";
    parts[0].position.x++;
    assert.equal(
      JSON.stringify(preset),
      original,
      "editing a clone must not alter the curated source",
    );
  }
});

import "./alg-interface-morphology-workbench.test";
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
      ["pippo", "STARTER-PIPPO-2026"],
      ["brumby", "STARTER-BRUMBY-2026"],
      ["glim", "STARTER-GLIM-2026"],
      ["thimbleaf", "STARTER-THIMBLEAF-2026"],
      ["vellune", "STARTER-VELLUNE-2026"],
      ["craggle", "STARTER-CRAGGLE-2026"],
      ["nibblet", "STARTER-NIBBLET-2026"],
      ["orbini", "STARTER-ORBINI-2026"],
      ["spoori", "STARTER-SPOORI-2026"],
      ["tukkin", "STARTER-TUKKIN-2026"],
      ["flinta", "STARTER-FLINTA-2026"],
      ["vespri", "STARTER-VESPRI-2026"],
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
  const drawnSignatures = new Set<string>();
  const dimensions = new Set<string>();
  const allKinds = new Set<string>();
  for (const preset of STARTER_PRESETS) {
    assert.ok(preset.description.length >= 20, "explain the source anatomy without promising evolution");
    assert.equal("name" in preset,false,"starters are unnamed original drawings, not named species");
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
    const sourcePixels=parts.flatMap(p=>p.pixels.map(c=>({x:c.x+p.position.x,y:c.y+p.position.y})));
    assert.ok(sourcePixels.length >= 15, "starter silhouette must read at small scale");
    const x0=Math.min(...sourcePixels.map(p=>p.x)),x1=Math.max(...sourcePixels.map(p=>p.x));
    const y0=Math.min(...sourcePixels.map(p=>p.y)),y1=Math.max(...sourcePixels.map(p=>p.y));
    dimensions.add((x1-x0+1)+"x"+(y1-y0+1));
    drawnSignatures.add([...new Set(sourcePixels.map(p=>p.x+","+p.y))].sort().join(";"));
    for(const part of parts)allKinds.add(part.kind);
    const life = birthPlayerLife(
      { parts, mode: "infant", name: "Little one", seed: preset.seed },
      1_000_000,
    );
    const doc = {
      version: 8 as const,
      algorithmVersion: 7 as const,
      revision: PROTOTYPE_REVISION,
      parts,
      mode: "infant" as const,
      name: "Little one",
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
  assert.equal(drawnSignatures.size,12,"starter designs must have distinct authored shapes");
  assert.ok(dimensions.size>=6,"starters must sample contrasting bodily proportions");
  assert.ok(allKinds.size>=7,"starters should demonstrate meaningful editable anatomy roles");
});

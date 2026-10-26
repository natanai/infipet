import assert from "node:assert/strict";
import test from "node:test";
import type { FrameDescriptor } from "../audit/metrics";
import {
  MODERATE_HISTORIES,
  VARIANCE_HISTORIES,
  variancePlan,
  panelFor,
} from "./variance";
test("moderate and severe panels remain distinct while shared neutral observations are evaluated once", () => {
  assert.equal(MODERATE_HISTORIES.length, 13);
  assert.equal(VARIANCE_HISTORIES.length, 16);
  assert.equal(MODERATE_HISTORIES.filter((h) => h.id === "neutral").length, 1);
  assert.ok(
    MODERATE_HISTORIES.every((h) =>
      h.keyframes.every(
        (k) => k.tick === 0 && [0.5, 1].includes(k.fulfillment),
      ),
    ),
  );
  assert.equal(variancePlan().length, 384);
  assert.equal(new Set(variancePlan().map((p) => p.id)).size, 384);
  assert.equal(
    variancePlan().filter((p) => p.historyId === "neutral").length * 2,
    48,
  );
});
function descriptor(proportion = 0): FrameDescriptor {
  return {
    cells: 4,
    components: 1,
    holes: 0,
    size: { width: 2, height: 2, area: 4, diameter: 2 },
    posture: { angle: 0, anisotropy: 1 },
    movement: "drift",
    pace: 1,
    normalized16: Array.from({ length: 16 }, (_, i) =>
      i === 7 || i === 8 ? 3 << 7 : 0,
    ),
    normalized32: Array.from({ length: 32 }, (_, i) =>
      i === 15 || i === 16 ? 3 << 15 : 0,
    ),
    proportions: Array.from({ length: 18 }, (_, i) =>
      i === 0 ? proportion : 0,
    ),
    visible: { fullyOccludedParts: 0, ambiguousPixels: 0, testedParts: 0 },
  };
}
function fixture(
  seed: string,
  historyId: string,
  proportion = 0,
): Parameters<typeof panelFor>[3][number] {
  return {
    plan: {
      id: seed + historyId,
      sourceId: "fixture",
      seed,
      seedIndex: seed === "a" ? 0 : 1,
      historyId,
      keyframes: [],
    },
    genomeHash: "g",
    inheritedHash: "g",
    frames: [
      {
        age: 75,
        hash: "synthetic",
        descriptor: descriptor(proportion),
        elapsedMs: 0,
        valid: true,
      },
    ],
  };
}
test("an incomplete balanced panel cannot emit seed-dominance percentages", () => {
  const results = [
    fixture("a", "neutral"),
    fixture("a", "care"),
    fixture("b", "neutral"),
  ];
  const cell = panelFor("fixture", 75, ["neutral", "care"], results, [
    "a",
    "b",
  ]);
  assert.equal(cell.available, false);
  assert.equal(cell.expected, 4);
  assert.equal(cell.actual, 3);
  assert.equal("seedLargest" in cell, false);
});
test("zero diversity cannot pass the genetic-dominance check; genuine seed variation is separated from history", () => {
  const flat = [
    fixture("a", "neutral"),
    fixture("a", "care"),
    fixture("b", "neutral"),
    fixture("b", "care"),
  ];
  const zero = panelFor("fixture", 75, ["neutral", "care"], flat, ["a", "b"]);
  assert.ok(zero.available);
  assert.equal(zero.seedLargest, null);
  assert.equal(zero.informative, false);
  const changed = [
    fixture("a", "neutral"),
    fixture("a", "care"),
    fixture("b", "neutral", 2),
    fixture("b", "care", 2),
  ];
  const genetic = panelFor("fixture", 75, ["neutral", "care"], changed, [
    "a",
    "b",
  ]);
  assert.ok(genetic.available);
  assert.equal(genetic.seedLargest, true);
  assert.ok(genetic.proportions.seed! > 0.999);
  assert.equal(genetic.proportions.history, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  CHRONOLOGICAL_LIMITS,
  CHRONOLOGICAL_UPSTREAM_BLOCKERS,
  compareChronologicalEvents,
  evaluateChronologicalMaterial,
  validateChronologicalGraph,
  type ChronologicalProposal,
} from "../src/integration/chronological-material";
import { iterativeGrowthAt } from "../src/development/iterative-growth";
import { lifetimeRemodelingAt } from "../src/development/lifetime-remodeling";
import type { MaterialGraph, MaterialCell, MaterialDevelopmentProgram } from "../src/development";
import type { LifetimeRemodelingProgram } from "../src/development/lifetime-remodeling";

type State = Readonly<{ resourceCredits: number; genome: string }>;
const source = (id: string, x: number, y: number): MaterialCell => ({
  id, tissueId: "tissue", x, y, color: "#99bbdd",
  provenance: "authored", sourceIds: [id], parentCellIds: [],
  operationId: null,
});
function fixture(): MaterialGraph {
  const sourceCells = [
    source("ink/0", 8, 10), source("ink/1", 9, 10),
    source("ink/2", 10, 10),
  ];
  return {
    version: 1, sourceFingerprint: "unchanged-ink",
    sourceCells, cells: [...sourceCells],
    tissues: [{ id: "tissue", sourcePartId: "ink", parentId: null,
      relationship: "root", sourceCellIds: sourceCells.map(c => c.id),
      growthSiteIds: ["site"], rigidity: 0 }],
    sites: [{ id: "site", tissueId: "tissue", rootCellId: "ink/2",
      direction: { x: 1, y: 0 } }],
    links: [], events: [], protectedVoids: ["15,15"],
  };
}
const originalState: State = { resourceCredits: 0, genome: "PERMANENT" };
function translate(atHour: number, dy: number): ChronologicalProposal<State> {
  return {
    id: "move-tissue", kind: "remodel-transition", atHour,
    apply(graph, context) {
      const cells = graph.cells.map(c => ({ ...c, y: c.y + dy }));
      return { accepted: true, graph: { ...graph, cells }, context };
    },
  };
}
function grow(atHour: number, id = "grown"): ChronologicalProposal<State> {
  return {
    id, kind: "iterative-interval", atHour,
    apply(graph, context) {
      if (!context.resourceCredits)
        return { accepted: false, reason: "no-resource",
          graph, context };
      const tip = [...graph.cells].sort((a, b) => b.x - a.x)[0];
      const p = { x: tip.x + 1, y: tip.y };
      if (graph.cells.some(c => c.x === p.x && c.y === p.y) ||
          graph.protectedVoids.includes(p.x + "," + p.y))
        return { accepted: false, reason: "occupied-or-protected",
          graph, context };
      const newCell: MaterialCell = {
        id, tissueId: tip.tissueId, ...p, color: tip.color,
        provenance: "generated", sourceIds: [...tip.sourceIds],
        parentCellIds: [tip.id], operationId: id,
      };
      return { accepted: true, context: {
        ...context, resourceCredits: context.resourceCredits - 1,
      }, graph: { ...graph, cells: [...graph.cells, newCell],
        events: [...graph.events, { id, kind: "elongate",
          atHour, createdCellIds: [id], removedCellIds: [],
          sourceCellIds: [...tip.sourceIds] }] } };
    },
  };
}
const credit = (hour: number, value: number, id: string): ChronologicalProposal<State> =>
  ({ id, kind: "care-boundary", atHour: hour,
    apply(graph, context) {
      return { accepted: true, graph,
        context: { ...context, resourceCredits: value } };
    } });

test("[INT-001/A1] fractional remodeling precedes the next completed hourly growth step", () => {
  const born = fixture();
  const events: ChronologicalProposal<State>[] = [
    grow(1), translate(0.5, 1), credit(0, 1, "start-resource"),
  ];
  const atHalf = evaluateChronologicalMaterial(born, originalState, events, 0.5);
  assert.deepEqual(atHalf.graph.cells.map(c => c.y), [11, 11, 11]);
  assert.equal(atHalf.graph.cells.length, 3);
  const atOne = evaluateChronologicalMaterial(born, originalState, events, 1);
  assert.equal(atOne.graph.cells.length, 4);
  const extended = atOne.graph.cells.find(c => c.id === "grown")!;
  assert.deepEqual([extended.x, extended.y], [11, 11],
    "growth tip follows its current relocated source, not the birth snapshot");
  assert.deepEqual(extended.sourceIds, ["ink/2"]);
  assert.deepEqual(extended.parentCellIds, ["ink/2"]);
  assert.deepEqual(atOne.graph.sourceCells, born.sourceCells);
  assert.deepEqual(atOne.outcomes.map(o => o.id),
    ["start-resource", "move-tissue", "grown"]);
  assert.deepEqual(atOne.outcomes.find(o => o.id === "move-tissue")?.delta.relocatedCellIds,
    ["ink/0", "ink/1", "ink/2"]);
  assert.deepEqual(atOne.outcomes.find(o => o.id === "grown")?.delta.createdCellIds,
    ["grown"]);
  assert.deepEqual(validateChronologicalGraph(born, atOne.graph), []);
});

test("[INT-001/A1] exact ties respect interval completion, remodeling, then next-interval care", () => {
  const proposed = [
    credit(1, 0, "care-c"),
    grow(1, "grow-b"),
    { ...translate(1, 1), id: "remodel-z" },
    grow(1, "grow-a"),
    credit(0, 2, "initial"),
  ];
  const ordered = [...proposed].sort(compareChronologicalEvents);
  assert.deepEqual(ordered.map(x => x.id),
    ["initial", "grow-a", "grow-b", "remodel-z", "care-c"]);
  const frame = evaluateChronologicalMaterial(fixture(), originalState,
    proposed, 1);
  assert.deepEqual(frame.graph.cells.filter(c => c.provenance === "generated")
    .map(c => [c.x, c.y]), [[11, 11], [12, 11]]);
  assert.equal(frame.context.resourceCredits, 0,
    "care at completed hour governs future growth, not earlier interval");
  assert.deepEqual(frame.graph.sourceCells, fixture().sourceCells);
});

test("[INT-001/A1] conflicts defer atomically with a stable unchanged material state", () => {
  const collision: ChronologicalProposal<State> = {
    id: "collide", kind: "remodel-transition", atHour: 1,
    apply(graph, context) {
      if (graph.cells.some(c => c.x === 11 && c.y === 10))
        return { accepted: false, reason: "occupied", graph, context };
      return { accepted: true, graph: { ...graph, cells: [...graph.cells,
        { ...source("collider", 11, 10), provenance: "generated",
          sourceIds: ["ink/2"], parentCellIds: ["ink/2"], operationId: "collide" }] },
        context };
    },
  };
  const events = [credit(0, 1, "resources"), grow(1), collision];
  const frame = evaluateChronologicalMaterial(fixture(), originalState,
    events, 1);
  assert.equal(frame.graph.cells.length, 4);
  const deferred = frame.outcomes.find(o => o.id === "collide")!;
  assert.equal(deferred.accepted, false);
  assert.equal(deferred.reason, "occupied");
  assert.deepEqual(deferred.delta.createdCellIds, []);
  assert.deepEqual(validateChronologicalGraph(fixture(), frame.graph), []);
});

test("[INT-001/A3] chronological care prefix changes geometry, never genotype or earlier material", () => {
  const born = fixture();
  const nourished = [credit(0, 1, "care-start"), grow(1),
    credit(2, 4, "future-feed"), grow(3, "later-growth")];
  const deprived = [credit(0, 0, "care-start"), grow(1),
    credit(2, 4, "future-feed"), grow(3, "later-growth")];
  const good = evaluateChronologicalMaterial(born, originalState, nourished, 1);
  const bad = evaluateChronologicalMaterial(born, originalState, deprived, 1);
  assert.equal(good.graph.cells.length, 4);
  assert.equal(bad.graph.cells.length, 3);
  assert.deepEqual(good.graph.sourceCells, bad.graph.sourceCells);
  assert.equal(good.context.genome, bad.context.genome);
  assert.deepEqual(evaluateChronologicalMaterial(born, originalState,
    nourished.slice(0, 2), 1), good,
    "a future command must not influence an earlier frame");
  const shuffled = [3, 0, 1, 2, 1].map(hour =>
    evaluateChronologicalMaterial(born, originalState, nourished, hour));
  assert.deepEqual(shuffled[2], shuffled[4]);
  assert.deepEqual(shuffled[2], good);
});

test("[INT-001/A2] invalid attachments, void growth, unrecorded matter and age overflow are rejected", () => {
  const born = fixture();
  assert.deepEqual(validateChronologicalGraph(born, {
    ...born, cells: [...born.cells, { ...source("generated", 15, 15),
      provenance: "generated", operationId: "fake", sourceIds: ["ink/2"] }],
  }).filter(s => s.includes("protected-void")), ["protected-void:generated"]);
  assert.deepEqual(validateChronologicalGraph(born, {
    ...born, links: [{ id: "orphan", fromTissueId: "tissue",
      toTissueId: "tissue", kind: "attachment",
      fromCellId: "missing", toCellId: "ink/0" }],
  }).filter(s => s.includes("stale-link")), ["stale-link-source:orphan"]);
  assert.throws(() => evaluateChronologicalMaterial(born, originalState,
    [], CHRONOLOGICAL_LIMITS.maxHour + 1), /outside supported/);
  assert.throws(() => evaluateChronologicalMaterial(born, originalState,
    [{ ...grow(513), id: "beyond-iterative" }], 513),
    /exceeds DEV-003/);
});

test("[INT-001/A1/A2/A3] merged from-birth APIs cannot compose a relocated growth site", () => {
  const birth = fixture();
  const stubSignals = { channels: {
    maturation: { plasticity: 1 },
    support: { rigidity: 0, membrane: 0 },
    growth: { rate: 0.4 },
    branching: { initiation: 0, divergence: 0.2 },
    appendages: { extension: 0 },
  } } as unknown as MaterialDevelopmentProgram["signals"];
  const compiled = {
    version: 1, source: birth, genomeFingerprint: "genome",
    signals: stubSignals, operators: [], fingerprint: "from-birth",
  } as MaterialDevelopmentProgram;
  const remodel: LifetimeRemodelingProgram = {
    version: 1, birth, seed: "TEST", genomeFingerprint: "genome",
    signals: stubSignals, operations: [{
      id: "relocate", kind: "translate", tissueId: "tissue",
      direction: { x: 0, y: 1 }, atHour: 0,
      durationHours: 1, units: 2, strength: 1,
    }],
  };
  const remodeled = lifetimeRemodelingAt(remodel, 0.5);
  assert.ok(remodeled.transitions.length >= 1);
  assert.equal(remodeled.graph.cells.find(c => c.id === "ink/2")!.y, 11);
  const grown = iterativeGrowthAt(compiled, [
    { atHour: 0, resources: 1, light: null },
  ], 1);
  assert.equal(grown.graph.sourceFingerprint, remodeled.graph.sourceFingerprint);
  assert.equal(grown.graph.cells.find(c => c.id === "ink/2")!.y, 10,
    "iterative solver independently reconstructs its birth");
  assert.equal(grown.graph.cells.some(c => c.x === 11 && c.y === 11), false,
    "no development API can step iterative growth on the relocated graph with persistent age/orbit");
  assert.ok(CHRONOLOGICAL_UPSTREAM_BLOCKERS.length >= 3);
});

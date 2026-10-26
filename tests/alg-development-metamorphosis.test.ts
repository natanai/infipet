import test from "node:test";
import assert from "node:assert/strict";
import {
  compileLifetimeRemodeling, lifetimeRemodelingAt, auditRemodelLegibility,
  REMODEL_LIMITS, type RemodelOperation,
} from "../src/development/lifetime-remodeling";
import { compileMaterialDevelopment } from "../src/development/operators";
import { materialSourceAncestry } from "../src/development/material-graph";
import { drawing, fixtures, materialInputs } from "./alg-development-fixtures";

const operation = (
  id: string, kind: RemodelOperation["kind"], tissueId: string,
  options: Partial<RemodelOperation> = {},
): RemodelOperation => ({
  id, kind, tissueId, atHour: 10, durationHours: 12,
  units: 12, strength: 1, ...options,
});
const programFor = (
  shape: ReturnType<typeof drawing>, seed = "SOURCE-REM-1",
  make?: (tissueId: string) => readonly RemodelOperation[],
) => {
  const { atlas, genome } = materialInputs(shape, seed);
  const material = compileMaterialDevelopment(atlas, genome);
  const tissue = material.source.tissues[0]?.id ?? "";
  return compileLifetimeRemodeling(material, genome,
    make ? make(tissue) : undefined);
};
const key = (c: {x: number; y: number}) => c.x + "," + c.y;
const distance = (a: {x: number; y: number},
  b: {x: number; y: number}) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
function connected(cells: readonly {id: string; x: number; y: number}[]): boolean {
  if (!cells.length) return true;
  const visited = new Set([cells[0].id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of cells)
      if (!visited.has(c.id) && cells.some(p => visited.has(p.id) &&
        distance(c, p) <= 1)) { visited.add(c.id); changed = true; }
  }
  return visited.size === cells.length;
}

test("[DEV-004/A1] independently predicted linear extension, seed replay, and ancestry", () => {
  const p = programFor(drawing(["###"]), "EXTENSION-FIXTURE", tissueId => [
    operation("axis", "extend", tissueId, {
      direction: {x: 1, y: 0},
    }),
  ]);
  const origin = p.birth.cells.slice().sort((a, b) =>
    b.x - a.x || a.y - b.y)[0];
  const geneticRate = p.signals.channels.growth.elongation;
  const expectedCount = Math.floor(12 * geneticRate + 1e-10);
  const mature = lifetimeRemodelingAt(p, 100);
  const grown = mature.graph.cells.filter(c => c.provenance === "generated");
  assert.equal(grown.length, expectedCount);
  // This oracle is derived from the lattice recurrence x_k=x_0+k,
  // y_k=y_0, rather than from a snapshot or exported geometry helper.
  assert.deepEqual(grown.map(c => key(c)),
    Array.from({length: expectedCount},
      (_, i) => (origin.x + i + 1) + "," + origin.y));
  assert.ok(grown.every(c => c.operationId === "axis"));
  assert.ok(grown.every(c => materialSourceAncestry(mature.graph, c.id).length));
  assert.deepEqual(mature.graph.sourceCells, p.birth.sourceCells);
  assert.deepEqual(lifetimeRemodelingAt(p, 100), mature);
  assert.deepEqual(lifetimeRemodelingAt(p, 0).graph.cells, p.birth.cells);
  assert.deepEqual(auditRemodelLegibility(mature), []);
  assert.ok(connected(mature.graph.cells));
  const half = lifetimeRemodelingAt(p, 16);
  const expectedHalf = Math.min(expectedCount, 6);
  assert.equal(half.transitions.length, expectedHalf);
  assert.ok(half.transitions.every((event, i) =>
    event.atHour === 10 + i + 1 &&
    event.createdCellIds.length === 1));
});

test("[DEV-004/A1] randomized unfamiliar silhouettes preserve local topology, no overlap and protected cavities", () => {
  let rng = 0x3abca63;
  const rand = () => ((rng = (Math.imul(1664525, rng) + 1013904223) >>> 0) /
    4294967296);
  const shapes = [fixtures.empty, fixtures.disconnected, fixtures.blob,
    fixtures.fantasy, fixtures.cavity];
  // Generate assorted self-avoiding paths with branch remnants, holes and
  // independent marks; no drawn anatomy labels or reference creature species.
  for (let i = 0; i < 36; i++) {
    const map = Array.from({length: 16}, () => Array(16).fill("."));
    let x = 7, y = 7;
    for (let j = 0; j < 9 + i % 12; j++) {
      map[y][x] = "#";
      const step = Math.floor(rand() * 4);
      x = Math.max(1, Math.min(14, x + [1, 0, -1, 0][step]));
      y = Math.max(1, Math.min(14, y + [0, 1, 0, -1][step]));
    }
    if (i % 3 === 0) map[1][14] = "#";
    shapes.push(drawing(map.map(line => line.join(""))));
  }
  for (let i = 0; i < shapes.length; i++) {
    for (const seed of ["C-", "D-"]) {
      const p = programFor(shapes[i], seed + i);
      const replay = lifetimeRemodelingAt(p, 400);
      assert.deepEqual(auditRemodelLegibility(replay), [], "silhouette " + i);
      assert.deepEqual(p.birth.sourceCells, replay.graph.sourceCells);
      for (const tissue of replay.graph.tissues) {
        const active = replay.graph.cells.filter(c => c.tissueId === tissue.id);
        assert.ok(connected(active), "unexpected tissue disconnection");
      }
      assert.ok(replay.graph.cells.length <= p.birth.sourceCells.length +
        REMODEL_LIMITS.maxAdded);
      assert.ok(replay.graph.cells.every(c => c.x >= 0 && c.x < 64 &&
        c.y >= 0 && c.y < 64));
      assert.ok(replay.graph.cells.every(c => c.sourceIds.every(id =>
        p.birth.sourceCells.some(s => s.id === id))));
      assert.ok(replay.graph.cells.every(c =>
        !replay.graph.protectedVoids.includes(key(c))));
      assert.deepEqual(lifetimeRemodelingAt(p, 400), replay);
    }
  }
});

test("[DEV-004/A1] different birth seeds yield different valid source-continuous remodeling", () => {
  const structures = new Set<string>();
  const identicalDrawing = drawing(["....#....", "...###...", "....#...."]);
  for (let i = 0; i < 24; i++) {
    const p = programFor(identicalDrawing, "METAMORPH-SEED-" + i);
    const later = lifetimeRemodelingAt(p, 260);
    assert.deepEqual(auditRemodelLegibility(later), []);
    structures.add(later.graph.cells.map(c => key(c)).sort().join(";"));
    assert.ok(later.transitions.every(e => e.sourceCellIds.every(s =>
      p.birth.sourceCells.some(c => c.id === s))));
  }
  assert.ok(structures.size >= 3,
    "seed must alter physical structure, not only color or metadata");
});

test("[DEV-004/A2] recorded reinforcement, reabsorption and mechanical potential follow real material", () => {
  const p = programFor(drawing([".###.", "#####", ".###."]),
    "MATERIAL-TEST", tissueId => [
      operation("grow", "extend", tissueId, {
        atHour: 10, durationHours: 12, direction: {x: 1, y: 0},
      }),
      operation("add-wall", "reinforce", tissueId, {
        atHour: 30, durationHours: 12,
      }),
      operation("joint", "articulate", tissueId, {
        atHour: 60, durationHours: 12,
      }),
      operation("prune", "resorb", tissueId, {
        atHour: 90, durationHours: 12,
      }),
    ]);
  const young = lifetimeRemodelingAt(p, 25);
  const mature = lifetimeRemodelingAt(p, 160);
  assert.ok(young.transitions.some(e => e.kind === "extend"));
  assert.ok(mature.transitions.some(e => e.kind === "reinforce" &&
    e.createdCellIds.length === 1 && e.rigidityAfter! > e.rigidityBefore!));
  assert.ok(mature.transitions.some(e => e.kind === "resorb" &&
    e.removedCellIds.length === 1));
  assert.ok(mature.capabilities.some(c => c.kind === "support" &&
    c.cellIds.every(id => mature.graph.cells.some(cell => cell.id === id))));
  assert.ok(mature.capabilities.every(c => c.cellIds.every(id =>
    mature.graph.cells.some(cell => cell.id === id))));
  assert.deepEqual(mature.graph.sourceCells, p.birth.sourceCells);
  assert.deepEqual(auditRemodelLegibility(mature), []);
  const oldTransitions = young.transitions;
  assert.deepEqual(mature.transitions.slice(0, oldTransitions.length), oldTransitions);
  assert.deepEqual(lifetimeRemodelingAt(p, 160), mature);
  assert.deepEqual(lifetimeRemodelingAt(p, 25), young);
});

test("[DEV-004/A2] persistent authored identity under translation; chronology and reattachment are explicit", () => {
  const first = {...drawing(["##"])[0], id: "alpha"};
  const second = {...drawing(["##"])[0], id: "beta",
    position: {x: 5, y: 0}};
  const p = programFor([first, second], "REASSIGN", tissueId => [
    operation("shift", "translate", tissueId, {
      direction: {x: 1, y: 0}, atHour: 10, durationHours: 12,
    }),
  ]);
  const young = lifetimeRemodelingAt(p, 0);
  const adult = lifetimeRemodelingAt(p, 100);
  const moved = adult.transitions.filter(e => e.kind === "translate");
  assert.ok(moved.length >= 1);
  for (const e of moved) for (const m of e.relocated) {
    assert.equal(m.to.x, m.from.x + 1);
    assert.equal(m.to.y, m.from.y);
    assert.ok(p.birth.sourceCells.some(c => c.id === m.cellId));
  }
  assert.deepEqual(young.graph.sourceCells, adult.graph.sourceCells);
  assert.deepEqual(auditRemodelLegibility(adult), []);
  assert.ok(adult.graph.cells.filter(c =>
    c.tissueId === p.birth.tissues[0].id).every(c =>
    p.birth.sourceCells.some(source => source.id === c.id)));
  const partial = lifetimeRemodelingAt(p, 15);
  assert.deepEqual(adult.transitions.slice(0, partial.transitions.length),
    partial.transitions);
  assert.deepEqual(lifetimeRemodelingAt(p, 15), partial);

  // Adjacent parts start distinct. Their association must be an actual link.
  const touching = programFor([
    {...first, position: {x: 0, y: 0}},
    {...second, position: {x: 2, y: 0}},
  ], "LINKER");
  const [a, b] = touching.birth.tissues;
  assert.ok(a && b);
  const manual = programFor([
    {...first, position: {x: 0, y: 0}},
    {...second, position: {x: 2, y: 0}},
  ], "LINKER", () => [
    operation("real-attach", "reattach", a.id, {targetTissueId: b.id}),
  ]);
  const linked = lifetimeRemodelingAt(manual, 100);
  assert.ok(linked.transitions.some(e => e.kind === "reattach" &&
    e.newLinks.length === 1));
  assert.ok(linked.graph.links.some(e => e.toTissueId === b.id &&
    e.fromTissueId === a.id &&
    linked.graph.cells.some(c => c.id === e.toCellId)));
  assert.deepEqual(auditRemodelLegibility(linked), []);
});


test("[DEV-004/A2] structural regions exist only where authored tissue supports a real hinge", () => {
  let witness: ReturnType<typeof lifetimeRemodelingAt> | undefined;
  for (let i = 0; i < 20; i++) {
    const p = programFor(drawing(["#####"]), "HINGE-SEED-" + i, tissueId => [
      operation("bend", "articulate", tissueId),
    ]);
    const frame = lifetimeRemodelingAt(p, 100);
    if (frame.capabilities.some(c => c.kind === "joint")) {
      witness = frame; break;
    }
  }
  assert.ok(witness, "some permanent genotypes should allow articulation");
  const joint = witness.capabilities.find(c => c.kind === "joint")!;
  const spans = witness.regions.filter(r => r.hingeCellId !== null);
  assert.equal(spans.length, 2,
    "removing one source-derived cut vertex gives exactly two spans in a line");
  const spanIds = spans.flatMap(r => r.cellIds);
  assert.equal(spanIds.length, new Set(spanIds).size,
    "material ownership of regions cannot overlap");
  assert.ok(spans.every(r => r.hingeCellId &&
    joint.cellIds.includes(r.hingeCellId) &&
    r.sourceCellIds.every(id =>
      witness!.graph.sourceCells.some(source => source.id === id))));
  assert.deepEqual(auditRemodelLegibility(witness), []);

  const bulk = programFor(drawing(["###", "###", "###"]),
    "NO-INVENTED-JOINT", tissueId => [operation("bend", "articulate", tissueId)]);
  const filled = lifetimeRemodelingAt(bulk, 100);
  assert.equal(filled.capabilities.some(c => c.kind === "joint"), false,
    "a solid block contains no graph articulation, regardless of labels");
  assert.equal(filled.regions.length, 1);
  assert.deepEqual(auditRemodelLegibility(filled), []);
});

test("[DEV-004/A2] impossible geometry is deferred; voids, endpoints and the time domain cannot be bypassed", () => {
  const hole = programFor(fixtures.cavity, "CAVITY-GUARD", tissueId => [
    operation("shift-hole", "translate", tissueId, {
      direction: {x: 1, y: 0},
    }),
  ]);
  const late = lifetimeRemodelingAt(hole, 200);
  assert.ok(late.deferred.some(e => e.reason === "translation-collision-or-void"));
  assert.deepEqual(late.graph.cells, hole.birth.cells);
  assert.deepEqual(auditRemodelLegibility(late), []);
  const empty = programFor(fixtures.empty);
  assert.equal(lifetimeRemodelingAt(empty, 999).graph.cells.length, 0);
  assert.throws(() => lifetimeRemodelingAt(empty, Infinity), /Invalid remodeling age/);
  assert.throws(() => lifetimeRemodelingAt(empty, -1), /Invalid remodeling age/);
  assert.throws(() => programFor(fixtures.blob, "BAD", t => [
    operation("invalid", "extend", t, {durationHours: 0}),
  ]), /Invalid remodeling/);
  assert.throws(() => programFor(fixtures.blob, "BAD", t => [
    operation("duplicate", "resorb", t),
    operation("duplicate", "resorb", t),
  ]), /Repeated/);
  const same = programFor(fixtures.blob, "PERMUTE", t => [
    operation("B", "reinforce", t, {atHour: 20}),
    operation("A", "extend", t, {atHour: 20}),
  ]);
  const reverse = programFor(fixtures.blob, "PERMUTE", t => [
    operation("A", "extend", t, {atHour: 20}),
    operation("B", "reinforce", t, {atHour: 20}),
  ]);
  assert.deepEqual(lifetimeRemodelingAt(same, 100),
    lifetimeRemodelingAt(reverse, 100));
  assert.deepEqual(auditRemodelLegibility(lifetimeRemodelingAt(same, 100)), []);
});

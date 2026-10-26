import test from "node:test";
import assert from "node:assert/strict";
import {
  assessIterativePlacement, allocateGrowthCredits, createIterativeGrowth,
  iterativeGrowthAt, ITERATIVE_LIMITS, type IterativeExposure,
} from "../src/development/iterative-growth";
import { compileMaterialDevelopment, type MaterialDevelopmentProgram } from "../src/development/operators";
import { materialSourceAncestry, type MaterialCell, type MaterialGraph } from "../src/development/material-graph";
import { drawing, fixtures, materialInputs } from "./alg-development-fixtures";

const zero = (resources = 1): IterativeExposure[] =>
  [{ atHour: 0, resources, light: null }];
const inline = (x: number, y: number, tissueId: string, sourceIds: string[] = ["ink/0"]): MaterialCell =>
  ({ id: tissueId + "/" + x + "," + y, tissueId, x, y, color: "#000",
    provenance: "authored", sourceIds, parentCellIds: [], operationId: null });

/**
 * One explicit source-derived site is used only for controlled equation tests.
 * The graph and its authored cells are produced by the REAL SourceAtlas API.
 * Its sole direction is chosen as the independent mathematical fixture.
 */
function controlled(
  rows: readonly string[], seed = "iterative-test",
  anchor: (cells: readonly MaterialCell[]) => MaterialCell =
    cells => cells[0],
  direction: { x: number; y: number } = { x: 0, y: -1 },
): MaterialDevelopmentProgram {
  const { atlas, genome } = materialInputs(drawing(rows), seed);
  const compiled = compileMaterialDevelopment(atlas, genome);
  const cell = anchor(compiled.source.sourceCells);
  if (!cell) throw new Error("Fixture requires source ink");
  const siteId = cell.tissueId + "/test-tip";
  const source: MaterialGraph = {
    ...compiled.source,
    sites: [{ id: siteId, tissueId: cell.tissueId,
      rootCellId: cell.id, direction }],
    tissues: compiled.source.tissues.map(t => ({
      ...t, growthSiteIds: t.id === cell.tissueId ? [siteId] : [],
    })),
  };
  return { ...compiled, source };
}
function noForks(p: MaterialDevelopmentProgram): MaterialDevelopmentProgram {
  return { ...p, signals: {
    ...p.signals, channels: {
      ...p.signals.channels,
      branching: { ...p.signals.channels.branching, initiation: 0 },
    },
  } };
}
const pt = (c: { x: number; y: number }) => c.x + "," + c.y;
const geometry = (g: MaterialGraph) =>
  g.cells.map(c => pt(c) + ":" + c.tissueId).sort();
function validMaterial(frame: ReturnType<typeof iterativeGrowthAt>, birth: MaterialDevelopmentProgram) {
  const g = frame.graph, byId = new Map(g.cells.map(c => [c.id, c]));
  assert.deepEqual(g.sourceCells, birth.source.sourceCells, "birth ink is immutable");
  assert.ok(g.cells.length - g.sourceCells.length <= ITERATIVE_LIMITS.addedCells);
  assert.ok(g.cells.every(c => c.x >= 0 && c.x < 64 && c.y >= 0 && c.y < 64));
  assert.equal(new Set(g.cells.map(pt)).size, g.cells.length, "no overlapping material occupancy");
  assert.ok(g.cells.every(c => !g.protectedVoids.includes(pt(c))),
    "protected negative space remains empty");
  for (const cell of g.cells) {
    assert.ok(materialSourceAncestry(g, cell.id).length > 0, "every cell retains source ancestry");
    if (cell.provenance === "authored") continue;
    assert.ok(cell.operationId?.startsWith("iterative/"));
    assert.equal(cell.parentCellIds.length, 1);
    const parent = byId.get(cell.parentCellIds[0]);
    assert.ok(parent, "growth never disconnects from its physical predecessor");
    assert.ok(Math.max(Math.abs(cell.x - parent!.x), Math.abs(cell.y - parent!.y)) === 1);
    assert.deepEqual(cell.sourceIds, parent!.sourceIds);
    assert.ok(g.events.some(e => e.createdCellIds.includes(cell.id) &&
      e.id === cell.operationId && e.sourceCellIds.includes(cell.sourceIds[0])));
  }
  for (const link of g.links) {
    if (!link.id.includes("iterative/")) continue;
    assert.ok(link.fromCellId && link.toCellId);
    const from = byId.get(link.fromCellId!);
    const to = byId.get(link.toCellId!);
    assert.ok(from && to, "each generated attachment has living cells on both sides");
    assert.ok(Math.max(Math.abs(from!.x - to!.x), Math.abs(from!.y - to!.y)) === 1);
    assert.notEqual(from!.tissueId, to!.tissueId);
    const child = g.tissues.find(t => t.id === link.fromTissueId);
    assert.equal(child?.parentId, link.toTissueId, "attachment mirrors tissue genealogy");
  }
  for (const hour of frame.ledger) {
    assert.ok(Number.isInteger(hour.available) && hour.available >= 0 && hour.available <= 4);
    assert.ok(Number.isInteger(hour.unassigned) && hour.unassigned >= 0);
    assert.ok(Number.isInteger(hour.spent) && hour.spent >= 0);
    assert.equal(hour.spent + hour.unspent, hour.available, "physical budget conservation");
    assert.equal(hour.bySite.reduce((sum, x) => sum + x.allocated, 0) + hour.unassigned,
      hour.available, "allocation conservation");
    assert.equal(hour.bySite.reduce((sum, x) => sum + x.spent, 0), hour.spent);
    assert.ok(hour.bySite.every(x =>
      Number.isFinite(x.weight) && x.weight >= 0 &&
      Number.isInteger(x.allocated) && x.allocated >= 0 &&
      Number.isInteger(x.spent) && x.spent >= 0 && x.spent <= x.allocated));
  }
  assert.equal(frame.ledger.reduce((s, l) => s + l.spent, 0),
    g.cells.filter(c => c.provenance === "generated").length,
    "one credited growth operation corresponds to one generated cell");
  assert.ok(frame.suppressions.every(s =>
    Number.isInteger(s.hour) && s.hour >= 0 &&
    Number.isInteger(s.attempted.x) && Number.isInteger(s.attempted.y)));
}

/** Independently derived exact integer Hamilton apportionment (no FP quotas). */
function integerOracle(budget: number, input: readonly { id: string; weight: number }[]) {
  const sum = input.reduce((s, i) => s + BigInt(i.weight), 0n);
  if (sum === 0n) return Object.fromEntries(input.map(i => [i.id, 0]));
  const rows = input.map(i => {
    const numerator = BigInt(budget) * BigInt(i.weight);
    return { id: i.id, count: Number(numerator / sum), remainder: numerator % sum };
  });
  let left = budget - rows.reduce((s, i) => s + i.count, 0);
  rows.sort((a, b) => a.remainder === b.remainder
    ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    : a.remainder > b.remainder ? -1 : 1);
  for (const row of rows) { if (left-- <= 0) break; row.count++; }
  return Object.fromEntries(rows.map(row => [row.id, row.count]));
}

test("[DEV-003/A1] exact integer resource partition, conservation and permutation symmetry", () => {
  const symmetric = allocateGrowthCredits(4,
    [{ id: "c", weight: 1 }, { id: "a", weight: 1 }, { id: "b", weight: 1 }]);
  assert.deepEqual(Object.fromEntries(symmetric.bySite.map(s => [s.siteId, s.allocated])),
    { a: 2, b: 1, c: 1 });
  assert.equal(symmetric.unassigned, 0);
  assert.equal(allocateGrowthCredits(4, [{ id: "a", weight: 0 }]).unassigned, 4);
  assert.deepEqual(allocateGrowthCredits(4, [{ id: "a", weight: 1 },
    { id: "b", weight: 2 }, { id: "c", weight: 1 }]).bySite.map(s => s.allocated),
    [1, 2, 1]);
  for (let v = 0; v < 151; v++) {
    const count = v % 8 + 1, budget = v % 5;
    const candidates = Array.from({ length: count }, (_, i) => ({
      id: "s/" + i, weight: (v * 29 + i * 17 + i * i) % 23,
    }));
    const expected = integerOracle(budget, candidates);
    for (const input of [candidates, [...candidates].reverse(),
      [...candidates.slice(2), ...candidates.slice(0, 2)]]) {
      const result = allocateGrowthCredits(budget, input);
      assert.deepEqual(Object.fromEntries(result.bySite.map(s =>
        [s.siteId, s.allocated])), expected);
      assert.equal(result.bySite.reduce((s, a) => s + a.allocated, 0) +
        result.unassigned, budget);
      assert.ok(result.bySite.every(s => s.allocated >= 0));
    }
  }
  assert.throws(() => allocateGrowthCredits(5, []), RangeError);
  assert.throws(() => allocateGrowthCredits(1, [{ id: "a", weight: Infinity }]), RangeError);
  assert.throws(() => allocateGrowthCredits(1, [{ id: "a", weight: 1 },
    { id: "a", weight: 2 }]), RangeError);
});

test("[DEV-003/A1] exact authored-tip positions at a one-credit and four-credit boundary", () => {
  const rows = [...Array(16).fill("................"), "........#......."];
  const birth = noForks(controlled(rows, "exact-axis"));
  const tip = birth.source.sourceCells[0];
  assert.ok(tip.x > 4 && tip.y > 4);
  const one = iterativeGrowthAt(birth, zero(0.25), 1);
  const oneGenerated = one.graph.cells.filter(c => c.provenance === "generated");
  assert.deepEqual(oneGenerated.map(c => [c.x, c.y]), [[tip.x, tip.y - 1]]);
  assert.deepEqual(one.ledger.map(l => [l.available, l.spent, l.unspent]), [[1, 1, 0]]);
  const four = iterativeGrowthAt(birth, zero(1), 1);
  assert.deepEqual(four.graph.cells.filter(c => c.provenance === "generated")
    .map(c => [c.x, c.y]), Array.from({ length: 4 }, (_, i) =>
    [tip.x, tip.y - (i + 1)]));
  validMaterial(one, birth);
  validMaterial(four, birth);
});

test("[DEV-003/A2] directional light and recorded resources alter actual geometry causally", () => {
  const rows = [...Array(15).fill("................"), "........#......."];
  const birth = noForks(controlled(rows, "controlled-light"));
  const tip = birth.source.sourceCells[0];
  const right = [{ atHour: 0, resources: 0.25,
    light: { x: 1, y: 0, intensity: 1 } }] satisfies IterativeExposure[];
  const left = [{ atHour: 0, resources: 0.25,
    light: { x: -1, y: 0, intensity: 1 } }] satisfies IterativeExposure[];
  const dark = iterativeGrowthAt(birth, zero(0.25), 1);
  const litRight = iterativeGrowthAt(birth, right, 1);
  const litLeft = iterativeGrowthAt(birth, left, 1);
  assert.deepEqual(litRight.graph.cells.filter(c => c.provenance === "generated")
    .map(c => [c.x, c.y]), [[tip.x + 1, tip.y - 1]]);
  assert.deepEqual(litLeft.graph.cells.filter(c => c.provenance === "generated")
    .map(c => [c.x, c.y]), [[tip.x - 1, tip.y - 1]]);
  assert.notDeepEqual(geometry(dark.graph), geometry(litRight.graph));
  const future = [{ atHour: 0, resources: 0.25, light: null },
    { atHour: 2, resources: 1, light: { x: 1, y: 0, intensity: 1 } }];
  const late = createIterativeGrowth(birth, future);
  const prior = createIterativeGrowth(birth, zero(0.25));
  assert.deepEqual(late.at(2), prior.at(2), "future sample cannot rewrite earlier anatomy");
  assert.notDeepEqual(geometry(late.at(5).graph), geometry(prior.at(5).graph));
  assert.deepEqual(late.at(3), late.at(3), "same birth and history replay identically");
  assert.deepEqual(late.at(2), iterativeGrowthAt(birth, future, 2));
  assert.deepEqual(late.at(1), prior.at(1));
  assert.throws(() => createIterativeGrowth(birth,
    [{ atHour: 1, resources: 1, light: null }]), RangeError);
  assert.throws(() => createIterativeGrowth(birth,
    [{ atHour: 0, resources: 1, light: null },
      { atHour: 0, resources: 0, light: null }]), RangeError);
  validMaterial(late.at(5), birth);
});

test("[DEV-003/A1] exact legibility counterexamples: occupancy, branch clearance and protected voids", () => {
  const tip = inline(5, 5, "same");
  const own = new Map([[pt(tip), tip]]);
  const roots = new Map([["same", "same"], ["branch", "same"], ["unrelated", "unrelated"]]);
  assert.equal(assessIterativePlacement(own, new Set(), tip,
    "same", { x: 6, y: 5 }, 0, roots), null);
  assert.equal(assessIterativePlacement(own, new Set(), tip,
    "same", { x: 5, y: 5 }, 0, roots), "occupied");
  assert.equal(assessIterativePlacement(own, new Set(["6,5"]), tip,
    "same", { x: 6, y: 5 }, 0, roots), "protected-void");
  assert.equal(assessIterativePlacement(own, new Set(), tip,
    "same", { x: -1, y: 5 }, 0, roots), "outside-world");
  assert.equal(assessIterativePlacement(own, new Set(), tip,
    "same", { x: 6, y: 5 }, ITERATIVE_LIMITS.addedCells, roots), "material-cap");
  const unrelated = inline(7, 5, "unrelated", ["ink/unrelated"]);
  const crowded = new Map([...own, [pt(unrelated), unrelated]]);
  assert.equal(assessIterativePlacement(crowded, new Set(), tip,
    "same", { x: 6, y: 5 }, 0, roots), "unrelated-source-proximity");
  const parallel = inline(7, 5, "branch");
  const twin = new Map([...own, [pt(parallel), parallel]]);
  assert.equal(assessIterativePlacement(twin, new Set(), tip,
    "same", { x: 6, y: 5 }, 0, roots), "independent-branch-proximity");
  const first = inline(6, 5, "same");
  twin.set(pt(first), first);
  assert.equal(assessIterativePlacement(twin, new Set(), parallel,
    "branch", { x: 6, y: 5 }, 0, roots), "occupied",
    "second site cannot occupy the first site's cell");
});

test("[DEV-003/A1] forbidden cavity and unrelated-island approaches have recorded causes", () => {
  const cavity = controlled(["#####", "#...#", "#...#", "#...#", "#####"],
    "hole-directed", cells => {
      const x = Math.min(...cells.map(c => c.x));
      const y = Math.min(...cells.map(c => c.y)) + 1;
      return cells.find(c => c.x === x && c.y === y)!;
    }, { x: 1, y: 0 });
  const hole = iterativeGrowthAt(cavity, zero(1), 1);
  assert.equal(hole.graph.cells.length, cavity.source.cells.length);
  assert.ok(hole.suppressions.some(s => s.reason === "protected-void"));
  validMaterial(hole, cavity);
  const separate = controlled(["...........", ".....#.#..."],
    "two-islands", cells => [...cells].sort((a, b) => a.x - b.x)[0],
    { x: 1, y: 0 });
  const blocked = iterativeGrowthAt(separate, zero(1), 1);
  assert.ok(blocked.suppressions.some(s =>
    s.reason === "unrelated-source-proximity"));
  assert.ok(blocked.graph.links.every(l => l.kind !== "fusion"));
  assert.deepEqual(blocked.graph.cells, separate.source.cells);
  validMaterial(blocked, separate);
});

test("[DEV-003/A1] growth-bearing branches recursively produce attached growth sites", () => {
  const rows = [...Array(23).fill("................................"),
    "................#..............."];
  const birth = controlled(rows, "recursive-branch-a");
  assert.ok(birth.signals.channels.branching.initiation >= 0.2,
    "genetic test seed has enough inherited branching potential");
  const graph = createIterativeGrowth(birth, zero(1));
  const after = graph.at(30);
  validMaterial(after, birth);
  const generations = after.sites.filter(s => s.depth >= 2);
  assert.ok(generations.length > 0, "a generated branch becomes a grandparent");
  for (const site of generations) {
    const parent = after.sites.find(p => p.id === site.parentSiteId);
    assert.ok(parent && parent.depth === site.depth - 1);
    const anchor = after.graph.sites.find(s => s.id === site.id);
    assert.ok(anchor && after.graph.cells.some(c => c.id === anchor.rootCellId));
    const child = after.graph.tissues.find(t => t.id === site.tissueId);
    assert.equal(child?.parentId, parent.tissueId);
    assert.ok(after.graph.links.some(link =>
      link.fromTissueId === child?.id && link.toTissueId === parent.tissueId));
  }
  const firstHour = graph.at(1);
  const secondHour = graph.at(2);
  assert.ok(firstHour.ledger[0].bySite.every(a =>
    firstHour.sites.some(s => s.id === a.siteId && s.activationHour === 0)),
    "newborn sites cannot draw resources from the interval of their creation");
  assert.ok(secondHour.ledger[1].bySite.every(a =>
    firstHour.sites.some(s => s.id === a.siteId && s.activationHour <= 1)),
    "next-hour candidates must already have existed at that interval's start");
  assert.ok(secondHour.sites.every(s => s.activationHour <= 2));
  const replay = graph.at(30);
  graph.at(0); graph.at(20); graph.at(2); graph.at(15);
  assert.deepEqual(graph.at(30), replay, "render/query order has no effect");
});

test("[DEV-003/A2] competing real growth sites exchange priority when light reverses", () => {
  const row = Array.from({ length: 32 }, (_, x) =>
    x === 8 || x === 24 ? "#" : ".").join("");
  const { atlas, genome } = materialInputs(drawing([
    ...Array(14).fill("................................"), row,
  ]), "two-site-competition");
  const compiled = compileMaterialDevelopment(atlas, genome);
  const [left, right] = [...compiled.source.sourceCells].sort((a, b) => a.x - b.x);
  assert.equal(compiled.source.tissues.length, 2,
    "the separate authored islands remain independently valid material");
  const leftId = "competition/left", rightId = "competition/right";
  const birth: MaterialDevelopmentProgram = {
    ...compiled, source: {
      ...compiled.source,
      sites: [
        { id: leftId, tissueId: left.tissueId,
          rootCellId: left.id, direction: { x: 1, y: 0 } },
        { id: rightId, tissueId: right.tissueId,
          rootCellId: right.id, direction: { x: -1, y: 0 } },
      ],
      tissues: compiled.source.tissues.map(t => ({
        ...t, growthSiteIds: t.id === left.tissueId ? [leftId] : [rightId],
      })),
    },
  };
  const toRight = { x: 1, y: 0, intensity: 1 };
  const toLeft = { x: -1, y: 0, intensity: 1 };
  const history: IterativeExposure[] = [
    { atHour: 0, resources: 0.25, light: toRight },
    { atHour: 1, resources: 0.25, light: toLeft },
  ];
  const reversed = createIterativeGrowth(birth, history);
  const steady = createIterativeGrowth(birth,
    [{ atHour: 0, resources: 0.25, light: toRight }]);
  const frame = reversed.at(2);
  validMaterial(frame, birth);
  assert.equal(frame.ledger.length, 2);
  assert.deepEqual(frame.ledger.map(x => x.available), [1, 1]);
  assert.deepEqual(frame.ledger.map(x => x.spent), [1, 1]);
  assert.deepEqual(frame.ledger.map(x =>
    x.bySite.find(y => y.allocated === 1)?.siteId), [leftId, rightId],
    "independent 1.75x illumination exceeds worst-case 1.5x chaos weight ratio");
  assert.deepEqual(reversed.at(1), steady.at(1), "later light cannot change the first hour");
  assert.notDeepEqual(geometry(frame.graph), geometry(steady.at(2).graph));
  assert.equal(frame.graph.links.length, 0, "no implicit joining between islands");
  assert.ok(frame.graph.cells.filter(c => c.provenance === "generated").every(c =>
    c.sourceIds.length === 1), "new material never combines distinct birth islands");
});

test("[DEV-003/A2] sparse, disconnected, dense, fantasy and empty authored ink stay valid", () => {
  const shapes = [fixtures.blob, fixtures.branching, fixtures.disconnected,
    fixtures.cavity, fixtures.fantasy, fixtures.empty,
    drawing(["#"]), drawing(Array(32).fill("#".repeat(32)))];
  for (let i = 0; i < shapes.length; i++) {
    const { atlas, genome } = materialInputs(shapes[i], "broad-" + i);
    const birth = compileMaterialDevelopment(atlas, genome);
    const history = [{ atHour: 0, resources: 0.5, light: null },
      { atHour: 6, resources: 1, light: { x: 1, y: -1, intensity: 0.8 } }];
    const program = createIterativeGrowth(birth, history);
    const late = program.at(12);
    validMaterial(late, birth);
    assert.deepEqual(program.at(0).graph.cells, birth.source.cells);
    assert.deepEqual(program.at(12), late);
    if (!birth.source.sourceCells.length) {
      assert.equal(late.graph.cells.length, 0);
      assert.equal(late.sites.length, 0);
      assert.ok(late.ledger.every(l => l.spent === 0));
    }
    // Distinct originally disconnected ink sources can only have their own
    // ancestry; no proposed fusion operator exists in this module.
    assert.ok(late.graph.cells.every(c => c.sourceIds.every(id =>
      birth.source.sourceCells.some(b => b.id === id))));
    assert.ok(late.graph.links.every(l => l.kind !== "fusion"));
  }
});

test("[DEV-003/A2] light/history permutations cannot leak future into past", () => {
  const rows = [...Array(16).fill("................"), "........#......."];
  const birth = noForks(controlled(rows, "history-prefix"));
  const baseline = createIterativeGrowth(birth, [
    { atHour: 0, resources: 0.25, light: null },
    { atHour: 4, resources: 0.5, light: null },
  ]);
  for (let futureHour = 6; futureHour < 15; futureHour++) {
    const altered = createIterativeGrowth(birth, [
      { atHour: 0, resources: 0.25, light: null },
      { atHour: 4, resources: 0.5, light: null },
      { atHour: futureHour, resources: 1,
        light: { x: -1, y: 0, intensity: 1 } },
    ]);
    assert.deepEqual(altered.at(4), baseline.at(4));
    assert.deepEqual(altered.at(futureHour), baseline.at(futureHour));
  }
  assert.equal(iterativeGrowthAt(birth, zero(0), 5).graph.cells.length,
    birth.source.cells.length, "zero resources never creates hidden material");
});

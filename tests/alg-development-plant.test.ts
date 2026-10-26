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

test("[DEV-003/A1] the same source-derived growth grammar supports opposite axial polarity", () => {
  const rows = [...Array(16).fill("................"), "........#......."];
  const up = noForks(controlled(rows, "opposite-axes",
    cells => cells[0], { x: 0, y: -1 }));
  const down = noForks(controlled(rows, "opposite-axes",
    cells => cells[0], { x: 0, y: 1 }));
  const source = up.source.sourceCells[0];
  const cellUp = iterativeGrowthAt(up, zero(0.25), 1).graph.cells
    .find(c => c.provenance === "generated");
  const cellDown = iterativeGrowthAt(down, zero(0.25), 1).graph.cells
    .find(c => c.provenance === "generated");
  assert.deepEqual([cellUp?.x, cellUp?.y], [source.x, source.y - 1]);
  assert.deepEqual([cellDown?.x, cellDown?.y], [source.x, source.y + 1]);
  assert.deepEqual(cellUp?.sourceIds, cellDown?.sourceIds,
    "axial polarity does not change the authored material identity");
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
  assert.ok(after.graph.events.some(e => e.kind === "expand"),
    "generated axes can specialize by growing laterally under the same material budget");
  assert.ok(after.sites.some(s => s.lateralCells > 0),
    "lateral material accumulation is recorded in a growth-bearing site");
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


/* INT-001 integration contract tests. The original DEV-003 tests above are
 * intentionally unchanged: these independently exercise the new stateful,
 * chronology-composable interface rather than re-baselining old results. */
import {
  createIterativeChronologyState, replayIterativeChronology,
  stepIterativeChronology, type IterativeChronologyState,
} from "../src/development/iterative-chronology";
import { applyMaterialOperators } from "../src/development/operators";
import { chaosAt, seedChaos } from "../src/development/chaos";

const chronoExposure = (atHour: number, resources = 0.25,
  light: IterativeExposure["light"] = null): IterativeExposure =>
  ({ atHour, resources, light });
function checkChronologicalTransaction(
  before: MaterialGraph,
  birth: MaterialDevelopmentProgram,
  result: ReturnType<typeof stepIterativeChronology>,
) {
  const { graph: after, ledger, state } = result;
  assert.deepEqual(after.sourceCells, birth.source.sourceCells);
  assert.equal(after.sourceFingerprint, before.sourceFingerprint);
  assert.equal(after.cells.length - before.cells.length, ledger.spent);
  assert.equal(ledger.spent + ledger.unspent, ledger.available);
  assert.equal(ledger.bySite.reduce((sum, a) => sum + a.allocated, 0) +
    ledger.unassigned, ledger.available);
  assert.equal(ledger.bySite.reduce((sum, a) => sum + a.spent, 0), ledger.spent);
  assert.ok(ledger.bySite.every(a =>
    a.allocated >= a.spent && a.spent >= 0 && Number.isFinite(a.weight)));
  assert.equal(result.events.length, ledger.spent);
  assert.deepEqual(after.events.slice(before.events.length), result.events);
  assert.deepEqual(after.links.slice(0, before.links.length), before.links);
  assert.deepEqual(after.tissues.slice(0, before.tissues.length), before.tissues);
  assert.ok(state.sites.every(s => s.depth <= ITERATIVE_LIMITS.depth &&
    s.forks <= ITERATIVE_LIMITS.forksPerSite));
  assert.equal(new Set(after.cells.map(c => c.id)).size, after.cells.length);
  assert.equal(new Set(after.cells.map(pt)).size, after.cells.length);
  const sourceIds = new Set(birth.source.sourceCells.map(c => c.id));
  const all = new Map(after.cells.map(c => [c.id, c]));
  for (const cell of after.cells) {
    assert.ok(cell.sourceIds.every(id => sourceIds.has(id)));
    if (result.events.some(e => e.createdCellIds.includes(cell.id))) {
      const parent = all.get(cell.parentCellIds[0]);
      assert.ok(parent && parent.sourceIds.every(id => cell.sourceIds.includes(id)));
      assert.ok(Math.max(Math.abs(cell.x - parent.x), Math.abs(cell.y - parent.y)) === 1);
      assert.equal(cell.provenance, "generated");
      assert.ok(!after.protectedVoids.includes(pt(cell)));
    }
  }
}

test("[INT-001] exact independent hourly oracle and pure time-state continuity", () => {
  const rows = [...Array(15).fill("................"), "........#......."];
  const birth = noForks(controlled(rows, "composed-exact-points"));
  const tip = birth.source.sourceCells[0];
  let graph = birth.source;
  let state = createIterativeChronologyState(birth);
  const birthCopy = JSON.stringify(graph), stateCopy = JSON.stringify(state);
  const first = stepIterativeChronology(birth, graph, state, chronoExposure(0));
  assert.equal(JSON.stringify(graph), birthCopy, "step never mutates external graph");
  assert.equal(JSON.stringify(state), stateCopy, "step never mutates its saved state");
  const firstAgain = stepIterativeChronology(birth, graph, state, chronoExposure(0));
  assert.deepEqual(first, firstAgain);
  for (let n = 0; n < 4; n++) {
    const next = stepIterativeChronology(birth, graph, state, chronoExposure(n));
    checkChronologicalTransaction(graph, birth, next);
    graph = next.graph; state = next.state;
    // Independent integer-lattice oracle: one credit/hour, source tip
    // progresses north one physical unit per completed discrete interval.
    assert.deepEqual(graph.cells.filter(c => c.provenance === "generated")
      .map(c => [c.x, c.y]), Array.from({ length: n + 1 }, (_, k) =>
      [tip.x, tip.y - k - 1]));
    assert.equal(state.nextHour, n + 1);
    assert.deepEqual(state.sites[0].orbit,
      chaosAt(seedChaos(birth.fingerprint + "|" + state.sites[0].id), n + 1),
      "exact integer-torus recurrence is independent of rendering and steps");
  }
  const replay = replayIterativeChronology(birth,
    [chronoExposure(0)], 4);
  assert.deepEqual(replay, { graph, state },
    "reconstruction from immutable birth equals sequential stepping");
  assert.throws(() => stepIterativeChronology(birth, graph, state,
    chronoExposure(0)), /exact hour/);
});

test("[INT-001] child activation is strictly chronological and all forks retain tissue ancestry", () => {
  const rows = [...Array(24).fill("................................"),
    "................#..............."];
  const birth = controlled(rows, "recursive-branch-a");
  let graph = birth.source, state = createIterativeChronologyState(birth);
  for (let n = 0; n < 22; n++) {
    const beforeSites = new Set(state.sites.filter(s => s.activationHour <= n)
      .map(s => s.id));
    const next = stepIterativeChronology(birth, graph, state,
      chronoExposure(n, 1));
    checkChronologicalTransaction(graph, birth, next);
    assert.ok(next.ledger.bySite.every(a => beforeSites.has(a.siteId)),
      "new children cannot consume growth credits before their birth hour");
    assert.ok(next.changes.filter(c => c.reason === "branch-born")
      .every(c => c.atHour === n + 1));
    graph = next.graph; state = next.state;
  }
  assert.ok(state.sites.some(s => s.depth >= 2),
    "branches become growth-bearing descendants, not one-time decoration");
  for (const child of state.sites.filter(s => s.parentSiteId)) {
    const parent = state.sites.find(s => s.id === child.parentSiteId);
    assert.ok(parent);
    assert.equal(child.depth, parent.depth + 1);
    assert.equal(graph.tissues.find(t => t.id === child.tissueId)?.parentId,
      parent.tissueId);
    assert.ok(graph.links.some(l =>
      l.fromTissueId === child.tissueId && l.toTissueId === parent.tissueId));
  }
});

test("[INT-001] genuine existing material operators contribute tissues without resetting old site history", () => {
  const { atlas, genome } = materialInputs(fixtures.blob, "external-tissue-injection");
  const birth = compileMaterialDevelopment(atlas, genome);
  const first = stepIterativeChronology(birth, birth.source,
    createIterativeChronologyState(birth), chronoExposure(0, 0));
  const existing = first.state.sites.map(s => ({ ...s }));
  const origin = birth.source.sites[0];
  assert.ok(origin);
  const external = applyMaterialOperators(first.graph, [{
    id: "external-structural-fork", kind: "branch",
    tissueId: origin.tissueId, siteId: origin.id,
    atHour: 0, durationHours: 1, strength: 1,
  }], 10, birth.signals);
  assert.ok(external.sites.length > first.graph.sites.length,
    "the real merged operator must add active anatomical structures");
  const integrated = stepIterativeChronology(birth, external, first.state,
    chronoExposure(1, 0));
  checkChronologicalTransaction(external, birth, integrated);
  assert.deepEqual(integrated.state.sites.slice(0, existing.length)
    .map(({ orbit, ...other }) => other),
    existing.map(({ orbit, ...other }) => other),
    "prior sites retain their identity, age, and cumulative extension state");
  assert.ok(integrated.changes.some(c => c.reason === "external-site"));
  const arrivals = integrated.state.sites.filter(s =>
    s.activationHour === 2);
  assert.ok(arrivals.length > 0);
  assert.ok(integrated.ledger.bySite.every(a =>
    !arrivals.some(s => s.id === a.siteId)));
  const next = stepIterativeChronology(birth, integrated.graph,
    integrated.state, chronoExposure(2, 1));
  assert.ok(next.ledger.bySite.some(a => arrivals.some(s => s.id === a.siteId)));
  assert.ok(next.graph.events.some(e => e.id === "external-structural-fork"));
  assert.ok(next.graph.cells.some(c =>
    c.operationId === "external-structural-fork"));
});

test("[INT-001] removed tips invalidate rather than teleport; persistent relocation follows the identical cell ID", () => {
  const rows = [...Array(15).fill("................"), "........#......."];
  const birth = noForks(controlled(rows, "removal-vs-relocation"));
  const one = stepIterativeChronology(birth, birth.source,
    createIterativeChronologyState(birth), chronoExposure(0));
  const grownTipId = one.state.sites[0].tipCellId;
  const grownTip = one.graph.cells.find(c => c.id === grownTipId)!;
  const resorbed: MaterialGraph = {
    ...one.graph,
    cells: one.graph.cells.filter(c => c.id !== grownTipId),
    events: [...one.graph.events, {
      id: "external-resorb", kind: "resorb", atHour: 1,
      removedCellIds: [grownTipId], createdCellIds: [],
      sourceCellIds: [...grownTip.sourceIds],
    }],
  };
  const invalidated = stepIterativeChronology(birth, resorbed, one.state,
    chronoExposure(1, 1));
  assert.ok(invalidated.changes.some(c =>
    c.siteId === one.state.sites[0].id &&
    c.reason === "tip-removed"));
  assert.equal(invalidated.ledger.spent, 0);
  assert.equal(invalidated.state.sites[0].status, "invalidated");
  const irreversible = stepIterativeChronology(birth,
    invalidated.graph, invalidated.state, chronoExposure(2, 1));
  assert.equal(irreversible.ledger.spent, 0);

  // Real relocation semantics: preserve every existing cell ID, and translate
  // the entire connected tissue including its live tip before advancing.
  const translated: MaterialGraph = {
    ...one.graph, cells: one.graph.cells.map(c =>
      ({ ...c, x: c.x + 2 })),
    events: [...one.graph.events, {
      id: "external-translate", kind: "translate", atHour: 1,
      createdCellIds: [], removedCellIds: [],
      sourceCellIds: [...grownTip.sourceIds],
    }],
  };
  const moved = stepIterativeChronology(birth, translated, one.state,
    chronoExposure(1));
  checkChronologicalTransaction(translated, birth, moved);
  assert.equal(moved.state.sites[0].status, "active");
  assert.equal(moved.ledger.spent, 1);
  const child = moved.graph.cells.find(c => c.id === moved.events[0].createdCellIds[0])!;
  assert.deepEqual(child.parentCellIds, [grownTipId]);
  assert.deepEqual([child.x, child.y], [grownTip.x + 2, grownTip.y - 1]);
  assert.deepEqual(moved.graph.sourceCells, birth.source.sourceCells);
});

test("[INT-001] late care and genuine recorded changes cannot affect earlier anatomy", () => {
  const rows = [...Array(15).fill("................"), "........#......."];
  const birth = noForks(controlled(rows, "replay-prefix"));
  const before = replayIterativeChronology(birth, [
    chronoExposure(0, 0.25), chronoExposure(4, 0.5),
  ], 5);
  const later = replayIterativeChronology(birth, [
    chronoExposure(0, 0.25), chronoExposure(4, 0.5),
    chronoExposure(5, 1, { x: 1, y: 0, intensity: 1 }),
  ], 5);
  assert.deepEqual(before, later);
  const full = replayIterativeChronology(birth, [
    chronoExposure(0, 0.25), chronoExposure(4, 0.5),
    chronoExposure(5, 1, { x: 1, y: 0, intensity: 1 }),
  ], 8);
  assert.notDeepEqual(geometry(full.graph), geometry(before.graph));
  // External remodeling is applied at its own chronological boundary, never
  // by substituting its eventual age-T graph as the organism's birth.
  const external = (graph: MaterialGraph, n: number): MaterialGraph =>
    n !== 3 ? graph : ({
      ...graph, cells: graph.cells.map(c => ({ ...c, x: c.x + 1 })),
      events: [...graph.events, {
        id: "late-translation", kind: "translate", atHour: 3,
        createdCellIds: [], removedCellIds: [], sourceCellIds: [],
      }],
    });
  const early = replayIterativeChronology(birth, zero(0.25), 3, external);
  const withEvent = replayIterativeChronology(birth, zero(0.25), 5, external);
  assert.deepEqual(early.graph,
    replayIterativeChronology(birth, zero(0.25), 3).graph);
  assert.ok(withEvent.graph.events.some(e => e.id === "late-translation"));
  assert.notDeepEqual(withEvent.graph.cells, early.graph.cells);
});

test("[INT-001] long physical resource accounting, arbitrary material and immutable seed identity", () => {
  const cases = [fixtures.empty, fixtures.disconnected, fixtures.cavity,
    fixtures.fantasy, drawing(Array(32).fill("#".repeat(32)))];
  for (let c = 0; c < cases.length; c++) {
    const { atlas, genome } = materialInputs(cases[c], "chronology-shape-" + c);
    const birth = compileMaterialDevelopment(atlas, genome);
    let graph = birth.source, state = createIterativeChronologyState(birth);
    for (let n = 0; n < 36; n++) {
      const value = n % 5 === 0 ? 0 : n % 3 === 0 ? 0.25 : 1;
      const result = stepIterativeChronology(birth, graph, state,
        chronoExposure(n, value));
      checkChronologicalTransaction(graph, birth, result);
      graph = result.graph; state = result.state;
    }
    assert.equal(state.ledger.reduce((x, a) => x + a.spent, 0),
      graph.cells.length - birth.source.cells.length);
    assert.equal(state.ledger.length, 36);
    if (!birth.source.sourceCells.length) {
      assert.equal(graph.cells.length, 0);
      assert.equal(state.sites.length, 0);
      assert.ok(state.ledger.every(l => l.spent === 0));
    }
    assert.deepEqual(
      replayIterativeChronology(birth,
        Array.from({ length: 36 }, (_, n) =>
          chronoExposure(n, n % 5 === 0 ? 0 : n % 3 === 0 ? 0.25 : 1)), 36),
      { graph, state });
    const altered = { ...birth, genomeFingerprint: "different-individual" };
    assert.throws(() => stepIterativeChronology(altered,
      graph, state, chronoExposure(36)), /identity/);
    assert.deepEqual(graph.sourceCells, birth.source.sourceCells);
  }
});

test("[INT-001] future-dated external operations are refused, not back-propagated", () => {
  const rows = [...Array(16).fill("................"), "........#......."];
  const birth = noForks(controlled(rows, "future-event-guard"));
  const future: MaterialGraph = { ...birth.source,
    events: [{ id: "tomorrow", kind: "reinforce", atHour: 5,
      createdCellIds: [], removedCellIds: [], sourceCellIds: [] }] };
  const initial = createIterativeChronologyState(birth);
  assert.throws(() => stepIterativeChronology(birth, future, initial,
    chronoExposure(0)), /future/);
  assert.deepEqual(stepIterativeChronology(birth, birth.source, initial,
    chronoExposure(0)).graph.sourceCells, birth.source.sourceCells);
  assert.throws(() => replayIterativeChronology(birth, [
    chronoExposure(1), chronoExposure(0)], 2), /strictly increasing/);
  assert.throws(() => replayIterativeChronology(birth, [
    chronoExposure(1)], 2), /hour-zero/);
  assert.throws(() => replayIterativeChronology(birth, [
    chronoExposure(0, Number.NaN)], 2), /resource input/);
});

test("[INT-001] invalid external site is tombstoned exactly once and cannot resurrect", () => {
  const rows = [...Array(16).fill("................"), "........#......."];
  const birth = noForks(controlled(rows, "invalid-site-tombstone"));
  const ghostSite = {
    id: "ghost/port", tissueId: birth.source.tissues[0].id,
    rootCellId: "missing-source-cell",
    direction: { x: 1, y: 0 },
  };
  const graph: MaterialGraph = {
    ...birth.source, sites: [...birth.source.sites, ghostSite],
  };
  const initial = createIterativeChronologyState(birth);
  const first = stepIterativeChronology(birth, graph, initial,
    chronoExposure(0, 0));
  assert.ok(first.changes.some(c =>
    c.siteId === ghostSite.id && c.reason === "source-invalid"));
  assert.equal(first.state.sites.find(s => s.id === ghostSite.id)?.status,
    "invalidated");
  const second = stepIterativeChronology(birth, first.graph, first.state,
    chronoExposure(1, 1));
  assert.equal(second.changes.filter(c => c.siteId === ghostSite.id).length, 0);
  assert.ok(second.ledger.bySite.every(a => a.siteId !== ghostSite.id));
  assert.equal(second.state.sites.find(s => s.id === ghostSite.id)?.status,
    "invalidated");
});

test("[INT-001] removal of an external site registry entry permanently closes its history", () => {
  const rows = [...Array(16).fill("................"), "........#......."];
  const birth = noForks(controlled(rows, "site-registry-loss"));
  const initial = createIterativeChronologyState(birth);
  const one = stepIterativeChronology(birth, birth.source, initial,
    chronoExposure(0, 0.25));
  const missing: MaterialGraph = { ...one.graph, sites: [] };
  const removed = stepIterativeChronology(birth, missing, one.state,
    chronoExposure(1, 1));
  assert.equal(removed.state.sites[0].status, "invalidated");
  assert.ok(removed.changes.some(c => c.reason === "site-removed"));
  assert.equal(removed.ledger.spent, 0);
  const returned: MaterialGraph = { ...removed.graph, sites: one.graph.sites };
  const stillClosed = stepIterativeChronology(birth, returned, removed.state,
    chronoExposure(2, 1));
  assert.equal(stillClosed.ledger.spent, 0);
  assert.equal(stillClosed.state.sites[0].status, "invalidated");
});

test("[INT-001] native per-unit remodeling event provenance is recognized as a genuine operation", () => {
  const rows = [...Array(15).fill("................"), "........#......."];
  const birth = noForks(controlled(rows, "per-unit-provenance"));
  const root = birth.source.cells[0];
  const origin = { x: root.x + 1, y: root.y };
  const id = "wall-remodel/unit/1/cell";
  const remodeled: MaterialGraph = {
    ...birth.source,
    cells: [...birth.source.cells, {
      ...root, id, ...origin, provenance: "generated",
      sourceIds: [...root.sourceIds], parentCellIds: [root.id],
      operationId: "wall-remodel",
    }],
    events: [{
      id: "wall-remodel/unit/1", kind: "reinforce", atHour: 0,
      sourceCellIds: [...root.sourceIds], createdCellIds: [id],
      removedCellIds: [],
    }],
  };
  const first = stepIterativeChronology(birth, remodeled,
    createIterativeChronologyState(birth), chronoExposure(0, 0));
  assert.deepEqual(first.graph.cells.slice(0, remodeled.cells.length),
    remodeled.cells, "actual remodel material must not be erased");
  assert.deepEqual(first.graph.events, remodeled.events);
  assert.equal(first.ledger.spent, 0);
  const invented = { ...remodeled, events: [] };
  assert.throws(() => stepIterativeChronology(birth, invented,
    createIterativeChronologyState(birth), chronoExposure(0, 0)),
  /creation event/);
});


/**
 * Iterative-boundary-lifetime counterexamples: these exercise the LIVE merged
 * remodeling transaction API against the composable growth API. No fabricated
 * translation events or manually mutated material coordinates are involved.
 */
import {
  compileLifetimeRemodeling, remodelingProposalsBetween,
  applyRemodelingInterval, EMPTY_REMODELING_CHRONOLOGY,
  type RemodelOperation,
} from "../src/development/lifetime-remodeling";
import { ITERATIVE_CHRONOLOGY_MAX_HOURS } from "../src/development/iterative-chronology";
import { CHAOS_MAX_TICK } from "../src/development/chaos";

function exactBoundaryInputs() {
  // The actual SourceAtlas compilation applies +16 to local source pixels:
  // authored part at (-6,-6), with its (0,0) pixel, is world point (10,10).
  const parts = drawing(["#"]).map(part =>
    ({ ...part, position: { x: -6, y: -6 } }));
  const { atlas, genome } = materialInputs(parts, "fractional-actual-remodel");
  const compiled = compileMaterialDevelopment(atlas, genome);
  const original = compiled.source.sourceCells[0];
  assert.deepEqual({ x: original.x, y: original.y }, { x: 10, y: 10 });
  const source: MaterialGraph = {
    ...compiled.source,
    // Set a source-retained rightward growth-site axis in this mathematical
    // fixture, so chaotic turns (<0.12 radians) discretize to exact (+1,0).
    sites: compiled.source.sites.map(site =>
      ({ ...site, direction: { x: 1, y: 0 } })),
  };
  const birth: MaterialDevelopmentProgram = { ...compiled, source };
  return { birth, genome, original, growthSite: source.sites[0] };
}

test("[INT-001] fractional remodeling at 0.5 precedes growth completion at 1", () => {
  const { birth, genome, original, growthSite } = exactBoundaryInputs();
  const translate: RemodelOperation = {
    id: "fractional-translate-down", kind: "translate",
    tissueId: growthSite.tissueId, sourceSiteId: growthSite.id,
    direction: { x: 0, y: 1 }, atHour: 0,
    durationHours: 6, units: 12, strength: 1,
  };
  const remodeling = compileLifetimeRemodeling(birth, genome, [translate]);
  const due = remodelingProposalsBetween(remodeling, 0, 0.5);
  assert.deepEqual(due.map(p => p.atHour), [0.5],
    "the real remodeling scheduler must propose one transition at 0.5");
  const resolved = applyRemodelingInterval(
    birth.source, remodeling, due, EMPTY_REMODELING_CHRONOLOGY);
  assert.deepEqual(resolved.transactions.map(t => t.attempt.status), ["accepted"]);
  assert.deepEqual(resolved.graph.events.map(e => e.atHour), [0.5]);
  const translated = resolved.graph.cells.find(c => c.id === original.id)!;
  assert.deepEqual([translated.x, translated.y], [10, 11]);
  assert.deepEqual(resolved.graph.sourceCells, birth.source.sourceCells);

  const grown = stepIterativeChronology(birth, resolved.graph,
    createIterativeChronologyState(birth), chronoExposure(0, 0.25));
  assert.deepEqual([grown.ledger.available, grown.ledger.spent,
    grown.ledger.unspent], [1, 1, 0]);
  assert.deepEqual(grown.events.map(e => e.atHour), [1]);
  const extension = grown.graph.cells.find(c =>
    c.id === grown.events[0].createdCellIds[0])!;
  assert.deepEqual([extension.x, extension.y], [11, 11],
    "extension observes ACTUAL translated world-space tip, not birth position");
  assert.deepEqual(extension.parentCellIds, [original.id]);
  assert.deepEqual(extension.sourceIds, original.sourceIds);
  assert.deepEqual(grown.graph.events.map(e => e.atHour), [0.5, 1]);
  assert.deepEqual(grown.graph.sourceCells, birth.source.sourceCells);
  assert.equal(grown.graph.cells.some(c => c.provenance === "generated" &&
    c.x === 11 && c.y === 10), false);
  assert.equal(grown.state.sites[0].tipCellId, extension.id);

  const replay = replayIterativeChronology(birth, [chronoExposure(0, 0.25)], 1,
    (graph, n) => n === 0
      ? applyRemodelingInterval(graph, remodeling, due).graph
      : graph);
  assert.deepEqual(replay, { graph: grown.graph, state: grown.state },
    "pure replay over the real fractional proposal gives the same frame");
});

test("[INT-001] exactly-on-boundary remodeling wins tie; genuinely future proposals are rejected", () => {
  const { birth, genome, original, growthSite } = exactBoundaryInputs();
  const operation = (durationHours: number): RemodelOperation => ({
    id: "boundary-translate/" + durationHours, kind: "translate",
    tissueId: growthSite.tissueId, sourceSiteId: growthSite.id,
    direction: { x: 0, y: 1 },
    atHour: 0, durationHours, units: 12, strength: 1,
  });
  for (const [duration, eventTime] of [[12, 1], [18, 1.5]]) {
    const remod = compileLifetimeRemodeling(birth, genome, [operation(duration)]);
    const proposals = remodelingProposalsBetween(remod, 0, eventTime);
    assert.equal(proposals[0].atHour, eventTime);
    const transformed = applyRemodelingInterval(
      birth.source, remod, proposals).graph;
    assert.deepEqual(transformed.events.map(e => e.atHour), [eventTime]);
    if (eventTime === 1) {
      const output = stepIterativeChronology(birth, transformed,
        createIterativeChronologyState(birth), chronoExposure(0, 0.25));
      const newCell = output.graph.cells.find(c =>
        c.id === output.events[0].createdCellIds[0])!;
      assert.deepEqual([newCell.x, newCell.y], [11, 11]);
      assert.deepEqual(newCell.parentCellIds, [original.id]);
      assert.deepEqual(output.graph.events.map(e => e.atHour), [1, 1],
        "equal-time external operation is applied before iterative completion");
    } else {
      assert.throws(() => stepIterativeChronology(birth, transformed,
        createIterativeChronologyState(birth), chronoExposure(0, 0.25)),
      /future or invalid material event/,
      "1.5 is genuinely beyond the completion at hour 1");
    }
  }
});

test("[INT-001] lifespan 511,512,513,720,2048,8192 remains chronological and finite", () => {
  const { birth, original } = exactBoundaryInputs();
  assert.equal(ITERATIVE_CHRONOLOGY_MAX_HOURS, 8192);
  assert.equal(ITERATIVE_CHRONOLOGY_MAX_HOURS, CHAOS_MAX_TICK);
  // No resources until hour 719: the site ages and its exact torus orbit
  // advances, without any speculative anatomy or suppressed growth.
  const exposures = [
    chronoExposure(0, 0),
    chronoExposure(719, 0.25),
    chronoExposure(720, 0),
    chronoExposure(8191, 0.25),
  ];
  const checkpoint = new Map<number, ReturnType<typeof replayIterativeChronology>>();
  for (const age of [511, 512, 513, 719, 720, 721, 2048, 8191, 8192]) {
    const result = replayIterativeChronology(birth, exposures, age);
    checkpoint.set(age, result);
    assert.equal(result.state.nextHour, age,
      "no clock wrap, reset, timestamp clamp, or discontinuity");
    assert.equal(result.state.ledger.length, age);
    assert.equal(result.state.ledger.reduce((v, l) => v + l.spent + l.unspent, 0),
      result.state.ledger.reduce((v, l) => v + l.available, 0));
    assert.deepEqual(result.state.sites[0].orbit,
      chaosAt(seedChaos(birth.fingerprint + "|" + result.state.sites[0].id), age),
      "dormant and active sites continue the exact finite cat-map orbit");
    assert.deepEqual(result.graph.sourceCells, birth.source.sourceCells);
    assert.ok(result.graph.cells.every(c =>
      c.sourceIds.every(id => birth.source.sourceCells.some(s => s.id === id))));
  }
  for (const age of [511, 512, 513, 719]) {
    assert.equal(checkpoint.get(age)!.graph.cells.length, 1,
      "resources absent: no anatomical invention at the old 512-hour boundary");
  }
  assert.equal(checkpoint.get(720)!.graph.cells.length, 2,
    "recorded resource at 719 generates one actual cell after hour 512");
  const lateCell = checkpoint.get(720)!.graph.cells.find(c =>
    c.provenance === "generated")!;
  assert.deepEqual([lateCell.x, lateCell.y], [11, 10]);
  assert.deepEqual(lateCell.parentCellIds, [original.id]);
  assert.equal(checkpoint.get(8191)!.graph.cells.length, 2);
  assert.equal(checkpoint.get(8192)!.graph.cells.length, 3,
    "hour 8191 exposure ledger: " +
      JSON.stringify(checkpoint.get(8192)!.state.ledger.at(-1)) +
      "; suppression: " + JSON.stringify(checkpoint.get(8192)!.state.suppressions.slice(-4)) +
      "; cells: " + JSON.stringify(checkpoint.get(8192)!.graph.cells.map(c => [c.id, c.x, c.y])));
  const last = checkpoint.get(8192)!;
  assert.deepEqual(last.state.ledger.filter(l => l.spent).map(l => l.hour),
    [719, 8191]);
  assert.equal(last.state.sites[0].extensions, 2);
  assert.throws(() => replayIterativeChronology(birth, exposures, 8193),
    /bounded integer age/);
  assert.throws(() => stepIterativeChronology(birth, last.graph, last.state,
    chronoExposure(8192, 1)), /bounded interval/);
  assert.deepEqual(
    replayIterativeChronology(birth, exposures, 513),
    checkpoint.get(513), "seeking earlier age after 8192 has no history effect");
});

test("[INT-001] empty organism is valid through the last hour; resource ledgers conserve credits", () => {
  const { atlas, genome } = materialInputs(fixtures.empty, "empty-long-lived");
  const birth = compileMaterialDevelopment(atlas, genome);
  const completed = replayIterativeChronology(birth, [
    chronoExposure(0, 1), chronoExposure(513, 0.5),
    chronoExposure(720, 1), chronoExposure(8191, 0),
  ], ITERATIVE_CHRONOLOGY_MAX_HOURS);
  assert.deepEqual(completed.graph.cells, []);
  assert.deepEqual(completed.state.sites, []);
  assert.equal(completed.state.nextHour, 8192);
  assert.equal(completed.state.ledger.length, 8192);
  assert.equal(completed.state.ledger.reduce((total, ledger) =>
    total + ledger.spent, 0), 0);
  for (const ledger of completed.state.ledger) {
    assert.equal(ledger.spent, 0);
    assert.equal(ledger.unassigned, ledger.available);
    assert.equal(ledger.unspent, ledger.available);
    assert.deepEqual(ledger.bySite, []);
  }
});

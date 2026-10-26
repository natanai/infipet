import test from "node:test";
import assert from "node:assert/strict";
import { createPhylogenyView } from "../src/phylogeny";
import { createMaterialGraph, materialSourceAncestry } from "../src/development/material-graph";
import {
  applyMaterialOperators, compileMaterialDevelopment,
  materialDevelopmentAt, type MaterialOperator, MATERIAL_LIMITS,
} from "../src/development/operators";
import { drawing, fixtures, materialInputs } from "./alg-development-fixtures";

const manual = (id: string, kind: MaterialOperator["kind"],
  tissueId: string, atHour = 0): MaterialOperator =>
  ({ id, kind, tissueId, atHour, durationHours: 10, strength: 1 });
const coords = (cells: readonly { x: number; y: number; tissueId: string }[]) =>
  cells.map(c => [c.x, c.y, c.tissueId]).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)));

test("[DEV-002/A1] source-derived operators change anatomy, not just pigment", () => {
  const { atlas, genome } = materialInputs(fixtures.blob);
  const program = compileMaterialDevelopment(atlas, genome);
  const tissue = program.source.tissues[0];
  const birth = program.source;
  for (const kind of ["elongate", "expand", "branch", "bud", "reinforce"] as const) {
    const outcome = applyMaterialOperators(birth,
      [manual(kind, kind, tissue.id)], 100, program.signals);
    assert.ok(outcome.events.some(event => event.kind === kind), kind);
    if (kind !== "reinforce") assert.notDeepEqual(coords(outcome.cells), coords(birth.cells), kind);
    else assert.ok(outcome.tissues.some(t => t.rigidity > 0), kind);
    assert.deepEqual(outcome.sourceCells, birth.sourceCells);
    assert.ok(outcome.cells.every(c => materialSourceAncestry(outcome, c.id).length));
  }
  const long = applyMaterialOperators(birth, [
    manual("grow", "elongate", tissue.id),
    manual("shorten", "resorb", tissue.id, 20),
    manual("turn", "remodel", tissue.id, 40),
  ], 100, program.signals);
  assert.ok(long.events.some(e => e.kind === "resorb" && e.removedCellIds.length > 0));
  assert.ok(long.events.some(e => e.kind === "remodel"));
  assert.deepEqual(long.sourceCells, birth.sourceCells);

  const splitInk = materialInputs(drawing(["#...#"]));
  const separated = compileMaterialDevelopment(splitInk.atlas, splitInk.genome);
  assert.equal(separated.source.tissues.length, 2);
  assert.equal(separated.source.links.length, 0);
  const [left, right] = separated.source.tissues;
  const connected = applyMaterialOperators(separated.source, [{
    ...manual("join", "fuse", left.id), targetTissueId: right.id,
  }], 100, separated.signals);
  assert.ok(connected.links.some(link => link.kind === "fusion"));
  assert.ok(connected.cells.length > separated.source.cells.length);
  assert.ok(connected.cells.some(cell => cell.sourceIds.length === 2));
  assert.deepEqual(connected.sourceCells, separated.source.sourceCells);
});

test("[DEV-002/A2] composition, reconstruction, seeded signals and scientific hints are deterministic", () => {
  const view = createPhylogenyView();
  const plant = view.resolveBiologicalConstraints("ncbi:3193");
  const unspecific = view.resolveBiologicalConstraints("ncbi:2759");
  assert.ok(plant && unspecific);
  const { atlas, genome } = materialInputs(fixtures.branching, "branch-genome");
  const program = compileMaterialDevelopment(atlas, genome, plant);
  const replay = compileMaterialDevelopment(atlas, genome, plant);
  assert.deepEqual(program, replay);
  assert.equal(program.signals.operators["branch-axis"].evidence.status, "supported");
  const unknown = compileMaterialDevelopment(atlas, genome, unspecific);
  assert.equal(unknown.signals.operators["branch-axis"].evidence.status, "unknown");
  const mainTissue = [...program.source.tissues]
    .sort((a, b) => b.sourceCellIds.length - a.sourceCellIds.length)[0];
  const branchOp = manual("source-directed", "branch", mainTissue.id);
  const supported = applyMaterialOperators(program.source, [branchOp], 100, program.signals);
  const unhinted = applyMaterialOperators(unknown.source, [branchOp], 100, unknown.signals);
  // Biological reference hints change the number/shape of formed cells, not labels.
  assert.notDeepEqual(coords(supported.cells), coords(unhinted.cells));
  for (const hour of [0, 10, 45, 100, 220]) {
    const first = materialDevelopmentAt(program, hour);
    const otherOrder = materialDevelopmentAt(program, 220);
    assert.deepEqual(materialDevelopmentAt(program, hour), first);
    assert.deepEqual(materialDevelopmentAt(replay, hour), first);
    assert.deepEqual(materialDevelopmentAt(program, 220), otherOrder);
    assert.ok(first.cells.every(c => c.sourceIds.every(id =>
      first.sourceCells.some(source => source.id === id))));
    assert.ok(first.cells.length - first.sourceCells.length <= MATERIAL_LIMITS.addedCells);
  }
  const composite: MaterialOperator[] = [
    manual("stretch", "elongate", mainTissue.id),
    manual("skin", "expand", mainTissue.id, 20),
    manual("offshoots", "branch", mainTissue.id, 40),
    manual("strengthen", "reinforce", mainTissue.id, 60),
    manual("prune", "resorb", mainTissue.id, 80),
  ];
  const composed = applyMaterialOperators(program.source, composite, 200, program.signals);
  assert.deepEqual(
    applyMaterialOperators(program.source, composite, 200, program.signals), composed);
  assert.notDeepEqual(coords(composed.cells), coords(program.source.cells));
  assert.ok(composed.events.every(e => !/animal|species|sprite|tree/.test(e.id)));
  assert.throws(() => applyMaterialOperators(program.source,
    [composite[0], composite[0]], 200, program.signals), /repeated/);
  assert.deepEqual(applyMaterialOperators(program.source, composite, 0,
    program.signals).cells, program.source.cells);
});

test("arbitrary 32x32 ink stays bounded and does not create anatomy from empty ink", () => {
  const full = materialInputs(drawing(Array(32).fill("#".repeat(32))));
  const dense = compileMaterialDevelopment(full.atlas, full.genome);
  const late = materialDevelopmentAt(dense, 300);
  assert.equal(dense.source.cells.length, 1024);
  assert.ok(late.cells.length <= 1024 + MATERIAL_LIMITS.addedCells);
  assert.ok(late.cells.every(c => c.x >= 0 && c.x < 64 && c.y >= 0 && c.y < 64));
  const empty = materialInputs(fixtures.empty);
  const emptyProgram = compileMaterialDevelopment(empty.atlas, empty.genome);
  assert.equal(emptyProgram.operators.length, 0);
  assert.equal(materialDevelopmentAt(emptyProgram, 300).cells.length, 0);
});

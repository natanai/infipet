import test from "node:test";
import assert from "node:assert/strict";
import {
  compileMaterialDevelopment,
  createDailyMaterialState,
  applyDailyMaterialStep,
  verifyDailyMaterialInventory,
  type MaterialGraph,
  type DailyCareWindowV1,
} from "../src/development";
import { reconstructDailyPhysicalState } from "../src/development/spatial-inventory";
import { compileLifetimeRemodeling } from "../src/development/lifetime-remodeling";
import { materialInputs, fixtures, drawing } from "./alg-development-fixtures";
const T = 1800000123456,
  D = 86400000;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const window = (k: number): DailyCareWindowV1 => ({
  version: 1,
  hatchAtMs: T,
  checkIndex: k,
  startMs: T + (k - 1) * D,
  endMs: T + k * D,
  forcing: {
    nutrition: 1,
    security: 1,
    rest: 1,
    activity: 1,
    threat: 0,
    observedFraction: 1,
  },
  acceptedCommands: 0,
  rejectedCommands: 0,
  observations: 1,
  activeMs: D,
  absentMs: 0,
  unknownMs: 0,
  unknown: [],
  provenanceDigest: "spatial/" + k,
});
function inputs() {
  const { atlas, genome } = materialInputs(
    drawing(["###", "###", "###"]),
    "MOVE-CORRECTION",
  );
  const base = compileMaterialDevelopment(atlas, genome);
  const signals = {
    ...base.signals,
    channels: {
      ...base.signals.channels,
      maturation: { ...base.signals.channels.maturation, plasticity: 1 },
    },
  };
  return { genome, program: { ...base, signals, operators: [] } };
}
test("[DEV-008/A1] original counterexample and equivalent unrecorded physical mutations fail independent reconstruction", () => {
  // Observed on 3695203: an ink/original/18,16 surviving cell moved x18->19
  // with unchanged IDs, ancestry and zero events was ACCEPTED by the old audit.
  const { program } = inputs(),
    source = program.source;
  verifyDailyMaterialInventory(source, T, 0, source);
  for (const mutate of [
    (g: MaterialGraph) => ({
      ...g,
      cells: g.cells.map((c, i) => (i ? c : { ...c, x: c.x + 1 })),
    }),
    (g: MaterialGraph) => ({
      ...g,
      cells: g.cells.map((c, i) => (i ? c : { ...c, color: "#ffffff" })),
    }),
    (g: MaterialGraph) => ({
      ...g,
      tissues: g.tissues.map((t, i) => (i ? t : { ...t, rigidity: 0.5 })),
    }),
    (g: MaterialGraph) => ({
      ...g,
      sites: g.sites.map((s, i) =>
        i ? s : { ...s, direction: { x: 9, y: 9 } },
      ),
    }),
    (g: MaterialGraph) => ({
      ...g,
      cells: [g.cells[0], ...g.cells.slice(0, -1)],
    }),
  ]) {
    assert.throws(() =>
      verifyDailyMaterialInventory(mutate(clone(source)), T, 0, source),
    );
  }
  const swapped = clone(source),
    [a, b] = swapped.cells;
  (swapped.cells[0] as any).x = b.x;
  (swapped.cells[0] as any).y = b.y;
  (swapped.cells[1] as any).x = source.cells[0].x;
  (swapped.cells[1] as any).y = source.cells[0].y;
  assert.deepEqual(
    swapped.cells.map((c) => c.x + "," + c.y).sort(),
    source.cells.map((c) => c.x + "," + c.y).sort(),
    "forged movement can preserve the exact silhouette",
  );
  assert.throws(
    () => verifyDailyMaterialInventory(swapped, T, 0, source),
    /spatial|inventory/,
  );
});
test("[DEV-008/A2] authentic daily translation and all 365 spatial inventories replay from original coordinates, including JSON restoration", () => {
  const { program, genome } = inputs();
  const remodeling = compileLifetimeRemodeling(program, genome, [
    {
      id: "actual-move",
      kind: "translate",
      tissueId: program.source.tissues[0].id,
      direction: { x: 1, y: 0 },
      atHour: 0,
      durationHours: 1,
      units: 1,
      strength: 1,
    },
  ]);
  let state = createDailyMaterialState(program, T);
  const first = applyDailyMaterialStep(
    program,
    genome,
    state,
    window(1),
    remodeling,
  );
  const event = first.graph.events.find((e) => e.kind === "translate")!;
  assert.ok(event);
  assert.equal(event.physical!.relocations.length, program.source.cells.length);
  for (const move of event.physical!.relocations) {
    assert.equal(move.to.x, move.from.x + 1);
    assert.equal(move.to.y, move.from.y);
    assert.equal(move.operationId, "actual-move");
    assert.equal(move.checkIndex, 1);
    assert.equal(move.atMs, T + D);
  }
  const forged = clone(first.graph);
  (forged.cells[0] as any).x++;
  assert.throws(
    () => verifyDailyMaterialInventory(forged, T, 1, program.source),
    /spatial|inventory/,
  );
  for (const mutation of [
    (g: any) => {
      delete g.events[0].physical;
    },
    (g: any) => {
      g.events[0].physical.relocations[0].from.x++;
    },
    (g: any) => {
      g.events[0].physical.relocations[0].operationId = "forged";
    },
    (g: any) => {
      g.events[0].physical.relocations[0].atMs++;
    },
    (g: any) => {
      g.events[0].physical.relocations[0].to.x += 9;
    },
    (g: any) => {
      g.cells[0].tissueId = "forged-tissue";
    },
    (g: any) => {
      g.tissues[0].parentId = g.tissues[0].id;
    },
  ]) {
    const invalid = clone(first.graph);
    mutation(invalid);
    assert.throws(() =>
      verifyDailyMaterialInventory(invalid, T, 1, program.source),
    );
  }
  const wrongDirection = clone(first.graph) as any;
  for (const m of wrongDirection.events[0].physical.relocations) {
    m.to.x = m.from.x - 1;
  }
  for (const c of wrongDirection.cells) c.x -= 2;
  assert.throws(
    () => verifyDailyMaterialInventory(wrongDirection, T, 1, program.source),
    /direction/,
  );
  wrongDirection.events[0].physical.operation.direction = { x: -1, y: 0 };
  assert.throws(
    () =>
      verifyDailyMaterialInventory(wrongDirection, T, 1, program.source, {
        material: program.operators,
        remodeling: remodeling.operations,
      }),
    /authorization/,
  );
  state = first;
  for (let k = 2; k <= 365; k++) {
    state = applyDailyMaterialStep(
      program,
      genome,
      state,
      window(k),
      remodeling,
    );
    const submitted = k % 17 === 0 ? clone(state.graph) : state.graph;
    // Independent integer expectation, not the producer's movement diff.
    const reconstructed = reconstructDailyPhysicalState(
      submitted,
      T,
      k,
      program.source,
    );
    for (const original of program.source.cells) {
      const actual = reconstructed.cells.get(original.id)!;
      assert.deepEqual([actual.x, actual.y], [original.x + 1, original.y]);
    }
  }
  assert.equal(state.completedChecks, 365);
  assert.deepEqual(state.graph.sourceCells, program.source.sourceCells);
});
test("[DEV-008/A2] unfamiliar shapes preserve spatial, attachment and protected-void evidence through a full replay", () => {
  for (const [name, parts] of Object.entries(fixtures)) {
    const { atlas, genome } = materialInputs(parts, "JOURNAL-" + name),
      program = compileMaterialDevelopment(atlas, genome);
    let state = createDailyMaterialState(program, T);
    for (let k = 1; k <= 365; k++)
      state = applyDailyMaterialStep(program, genome, state, window(k));
    verifyDailyMaterialInventory(clone(state.graph), T, 365, program.source);
    const bad = clone(state.graph);
    (bad.protectedVoids as string[]).push("63,63");
    assert.throws(
      () => verifyDailyMaterialInventory(bad, T, 365, program.source),
      /void/,
    );
  }
});

test("[DEV-008/A1] preserved silhouettes cannot hide cell tissue swaps or unaudited attachments; real reattachment remains executable", () => {
  const disconnected = materialInputs(fixtures.disconnected, "TISSUE-IDENTITY");
  const original = compileMaterialDevelopment(
    disconnected.atlas,
    disconnected.genome,
  ).source;
  const forged = clone(original),
    other = forged.tissues.find((t) => t.id !== forged.cells[0].tissueId)!;
  assert.ok(other);
  (forged.cells[0] as any).tissueId = other.id;
  assert.throws(
    () => verifyDailyMaterialInventory(forged, T, 0, original),
    /spatial|inventory/,
  );
  const connectedParts = [
    {
      id: "a",
      kind: "body" as const,
      name: "a",
      position: { x: 0, y: 0 },
      parentId: null,
      pixels: [0, 1, 2].map((x) => ({ x, y: 0, color: "#506040" })),
    },
    {
      id: "arm",
      kind: "arm" as const,
      name: "arm",
      position: { x: 0, y: 0 },
      parentId: "a",
      pixels: [{ x: 3, y: 1, color: "#506040" }],
    },
    {
      id: "b",
      kind: "body" as const,
      name: "b",
      position: { x: 0, y: 0 },
      parentId: null,
      pixels: [{ x: 4, y: 1, color: "#506040" }],
    },
  ];
  const { atlas, genome } = materialInputs(connectedParts, "REATTACH-REAL"),
    base = compileMaterialDevelopment(atlas, genome);
  const program = {
    ...base,
    operators: [],
    signals: {
      ...base.signals,
      channels: {
        ...base.signals.channels,
        segmentation: { ...base.signals.channels.segmentation, boundaries: 1 },
      },
    },
  };
  const arm = program.source.tissues.find((t) => t.sourcePartId === "arm")!,
    target = program.source.tissues.find((t) => t.sourcePartId === "b")!;
  assert.ok(program.source.links.length);
  const bad = clone(program.source);
  (bad.links[0] as any).toCellId = program.source.cells.find(
    (c) => c.tissueId === target.id,
  )!.id;
  assert.throws(
    () => verifyDailyMaterialInventory(bad, T, 0, program.source),
    /topology/,
  );
  const remodeling = compileLifetimeRemodeling(program, genome, [
    {
      id: "real-reattach",
      kind: "reattach",
      tissueId: arm.id,
      targetTissueId: target.id,
      atHour: 0,
      durationHours: 1,
      units: 1,
      strength: 1,
    },
  ]);
  const state = applyDailyMaterialStep(
    program,
    genome,
    createDailyMaterialState(program, T),
    window(1),
    remodeling,
  );
  const event = state.graph.events.find((e) => e.kind === "reattach");
  assert.ok(event, "actual legal reattachment must execute");
  assert.equal(
    state.graph.tissues.find((t) => t.id === arm.id)!.parentId,
    target.id,
  );
  assert.ok(
    event.physical!.links.some(
      (change) =>
        change.before &&
        change.after &&
        change.before.toTissueId !== change.after.toTissueId,
    ),
  );
  verifyDailyMaterialInventory(clone(state.graph), T, 1, program.source, {
    material: program.operators,
    remodeling: remodeling.operations,
  });
});

test("[DEV-008/A1] internally consistent forged movement still cannot enter protected voids or occupied independent tissue", () => {
  const { program, genome } = inputs();
  const remodeling = compileLifetimeRemodeling(program, genome, [
    {
      id: "actual-move",
      kind: "translate",
      tissueId: program.source.tissues[0].id,
      direction: { x: 1, y: 0 },
      atHour: 0,
      durationHours: 1,
      units: 1,
      strength: 1,
    },
  ]);
  const event = applyDailyMaterialStep(
    program,
    genome,
    createDailyMaterialState(program, T),
    window(1),
    remodeling,
  ).graph.events[0];
  const { atlas, genome: ringGenome } = materialInputs(
      fixtures.cavity,
      "VOID-FORGERY",
    ),
    ring = compileMaterialDevelopment(atlas, ringGenome).source;
  assert.ok(ring.protectedVoids.length);
  const tissue = ring.tissues[0].id;
  const forgedMove = {
    ...event,
    physical: {
      ...event.physical!,
      operation: { ...event.physical!.operation, tissueId: tissue },
      relocations: ring.cells
        .filter((c) => c.tissueId === tissue)
        .map((c) => ({
          cellId: c.id,
          from: { x: c.x, y: c.y },
          to: { x: c.x + 1, y: c.y },
          operationId: "actual-move",
          checkIndex: 1,
          atMs: T + D,
        })),
      tissues: [],
      sites: [],
      links: [],
    },
  };
  const forged = {
    ...clone(ring),
    cells: ring.cells.map((c) =>
      c.tissueId === tissue ? { ...c, x: c.x + 1 } : c,
    ),
    events: [forgedMove],
  };
  assert.throws(
    () => verifyDailyMaterialInventory(forged, T, 1, ring),
    /protected void/,
  );
  const parts = [
    {
      id: "left",
      name: "left",
      kind: "body" as const,
      parentId: null,
      position: { x: 0, y: 0 },
      pixels: [{ x: 10, y: 10, color: "#123456" }],
    },
    {
      id: "right",
      name: "right",
      kind: "body" as const,
      parentId: null,
      position: { x: 0, y: 0 },
      pixels: [{ x: 11, y: 10, color: "#123456" }],
    },
  ];
  const separate = materialInputs(parts, "OVERLAP-FORGERY"),
    source = compileMaterialDevelopment(separate.atlas, separate.genome).source;
  const left = source.cells.reduce((a, b) => (a.x < b.x ? a : b));
  const overlap = {
    ...event,
    physical: {
      ...event.physical!,
      operation: { ...event.physical!.operation, tissueId: left.tissueId },
      relocations: [
        {
          cellId: left.id,
          from: { x: left.x, y: left.y },
          to: { x: left.x + 1, y: left.y },
          operationId: "actual-move",
          checkIndex: 1,
          atMs: T + D,
        },
      ],
      tissues: [],
      sites: [],
      links: [],
    },
  };
  assert.throws(
    () =>
      verifyDailyMaterialInventory(
        {
          ...source,
          cells: source.cells.map((c) =>
            c.id === left.id ? { ...c, x: left.x + 1 } : c,
          ),
          events: [overlap],
        },
        T,
        1,
        source,
      ),
    /occupied material/,
  );
});

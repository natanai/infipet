import {
  sourceFeatures,
  enclosedSites,
} from "../src/development/anatomical-features";
import {
  growthSupportDistance,
  materialSupportLimit,
} from "../src/development/material-support";
import { regionalSourceScale } from "../src/development/regional-regulation";
import { verifyAxialSupport } from "../src/development/anatomical-audit";
import test from "node:test";
import assert from "node:assert/strict";
import {
  anatomicalContinuityFailure,
  sourceNeighborhood,
  sourceOverlay,
  anatomicalEditGuard,
} from "../src/development/anatomical-continuity";
import {
  createAnatomicalAudit,
  verifyAnatomicalContinuity,
} from "../src/development/anatomical-audit";
import {
  proposeDevelopmentalStrain,
  strainPoint,
  strainVoids,
  type DevelopmentalStrain,
} from "../src/development/developmental-strain";
import {
  sourcePigmentSupport,
  advancingInteriorParent,
} from "../src/development/material-front";
import { materialInputs, drawing } from "./alg-development-fixtures";
import { compileMaterialDevelopment } from "../src/development/operators";
import { compileLifetimeRemodeling } from "../src/development/lifetime-remodeling";
import {
  createDailyMaterialState,
  applyDailyMaterialStep,
  type DailyCareWindowV1,
} from "../src/development/daily-step";
import { reconstructDailyPhysicalState } from "../src/development/spatial-inventory";
import type {
  MaterialCell,
  MaterialGraph,
} from "../src/development/material-graph";
import {
  createSimulation,
  flattenAnatomy,
  type PetPart,
} from "../src/simulation";
import { STARTER_PRESETS } from "../src/presets";
import { morphologySources } from "../src/evaluation/morphology-cohort";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const key = (p: { x: number; y: number }) => p.x + "," + p.y;
const care = {
  kind: "synthetic-needs-lab-v1" as const,
  nutrition: 0.9,
  timeline: [],
};
const TIME = 1800000123456,
  DAY = 86400000;
function window(k: number, n = 1): DailyCareWindowV1 {
  return {
    version: 1,
    hatchAtMs: TIME,
    checkIndex: k,
    startMs: TIME + (k - 1) * DAY,
    endMs: TIME + k * DAY,
    forcing: {
      nutrition: n,
      rest: n,
      security: n,
      activity: n,
      threat: 0,
      observedFraction: n,
    },
    acceptedCommands: 0,
    rejectedCommands: 0,
    observations: 0,
    activeMs: DAY,
    absentMs: 0,
    unknownMs: 0,
    unknown: [],
    provenanceDigest: "continuity/" + k + "/" + n,
  };
}
function input(rows: readonly string[]) {
  const i = materialInputs(drawing(rows), "COHERENT-SOURCE");
  return { ...i, graph: compileMaterialDevelopment(i.atlas, i.genome).source };
}
// Distances between birth identities, independent of deposited area, color,
// translation or metadata. A rigid shift and any amount of bulk both score 0.
function sourceStrainFraction(birth: MaterialGraph, adult: MaterialGraph) {
  const live = new Map(adult.cells.map((c) => [c.id, c]));
  let changed = 0,
    total = 0;
  const source = birth.sourceCells.filter((c) => live.has(c.id));
  for (let i = 0; i < source.length; i++)
    for (let j = 0; j < i; j++) {
      const a = source[i],
        b = source[j],
        p = live.get(a.id)!,
        q = live.get(b.id)!;
      const d0 = Math.hypot(a.x - b.x, a.y - b.y),
        d1 = Math.hypot(p.x - q.x, p.y - q.y);
      if (Math.abs(d1 - d0) >= 0.75) changed++;
      total++;
    }
  return total ? changed / total : 0;
}

test("[MORPH-007/A1] anatomical features persist while individual cells retire; independent feature and containment oracles", () => {
  const { graph: body } = input(["###", "###", "###"]);
  assert.equal(
    anatomicalContinuityFailure(body.sourceCells, body.cells.slice(1)),
    null,
    "one body cell may retire without erasing a part",
  );
  verifyAnatomicalContinuity(body.sourceCells, body.cells.slice(1));
  assert.ok(
    anatomicalContinuityFailure(body.sourceCells, []),
    "an authored body cannot lose all source-supported material",
  );
  const parts = drawing([
    "#######",
    "#######",
    "#######",
    "#######",
    "#######",
    "#######",
    "#######",
  ]);
  // Eye identity exists ONLY because the player explicitly selected Eye.
  const eyePixel = parts[0].pixels.find(p => p.x === 3 && p.y === 3)!;
  parts[0].pixels = parts[0].pixels.filter(p => p !== eyePixel);
  parts.push({
    id: "player-selected-eye", kind: "eye", name: "Eye",
    parentId: null, position: { x: 0, y: 0 },
    pixels: [{ ...eyePixel, color: "#000000" }],
  });
  const value = materialInputs(parts, "SELECTED-EYE"),
    eyeGraph = compileMaterialDevelopment(value.atlas, value.genome).source;
  const eye = eyeGraph.cells.find((c) => c.color === "#000000")!;
  for (const cells of [
    eyeGraph.cells.filter((c) => c.id !== eye.id),
    eyeGraph.cells.map((c) =>
      c.id === eye.id ? { ...c, color: "#FF00FF" } : c,
    ),
    eyeGraph.cells.map((c) => (c.id === eye.id ? { ...c, x: 63, y: 63 } : c)),
  ]) {
    assert.ok(anatomicalContinuityFailure(eyeGraph.sourceCells, cells));
    assert.throws(() =>
      verifyAnatomicalContinuity(eyeGraph.sourceCells, cells),
    );
  }
  const daughter: MaterialCell = {
    ...eye,
    id: "real-eye-daughter",
    provenance: "generated",
    parentCellIds: [eye.id],
    operationId: "division",
  };
  const replaced = eyeGraph.cells.map((c) => (c.id === eye.id ? daughter : c));
  assert.equal(
    anatomicalContinuityFailure(eyeGraph.sourceCells, replaced),
    null,
  );
  verifyAnatomicalContinuity(eyeGraph.sourceCells, replaced);
  const preparedAudit = createAnatomicalAudit(eyeGraph.sourceCells);
  preparedAudit(replaced);
  assert.throws(() => preparedAudit(replaced.filter((c) => c.id !== daughter.id)));
  assert.throws(() =>
    preparedAudit(replaced, { protectedVoids: ["63,63"] }),
  );
  preparedAudit(replaced);
  for (const shallowFreeze of [false, true]) {
    const source = clone(eyeGraph.sourceCells);
    if (shallowFreeze) Object.freeze(source);
    assert.equal(anatomicalContinuityFailure(source, eyeGraph.cells), null);
    createAnatomicalAudit(source)(eyeGraph.cells);
    const changed = source.find((c) => c.id === eye.id)!;
    (changed as { color: string }).color = "#123456";
    assert.ok(
      anatomicalContinuityFailure(source, eyeGraph.cells),
      "mutable birth cells cannot reuse stale prepared feature ownership",
    );
    assert.throws(() => createAnatomicalAudit(source)(eyeGraph.cells));
  }
  const shifted = eyeGraph.cells.map((c) => ({ ...c, x: c.x + 1, y: c.y + 1 }));
  assert.equal(
    anatomicalContinuityFailure(eyeGraph.sourceCells, shifted),
    null,
  );
  verifyAnatomicalContinuity(eyeGraph.sourceCells, shifted);
  const armInk = drawing([
    "....###....",
    "....###....",
    "###########",
    "....###....",
    "....###....",
  ], "body");
  const selectedArm = armInk[0].pixels.filter(p => p.y === 2 && p.x < 4);
  armInk[0].pixels = armInk[0].pixels.filter(p => !selectedArm.includes(p));
  armInk.push({
    id: "player-selected-arm", kind: "arm", name: "Arm",
    parentId: null, position: { x: 0, y: 0 }, pixels: selectedArm,
  });
  const arm = compileMaterialDevelopment(
    materialInputs(armInk, "SELECTED-ARM").atlas,
    materialInputs(armInk, "SELECTED-ARM").genome,
  ).source;
  const left = Math.min(...arm.cells.map((c) => c.x));
  const erased = arm.cells.filter(c => c.sourcePartId !== "player-selected-arm");
  assert.ok(
    anatomicalContinuityFailure(arm.sourceCells, erased),
    "player-selected Arm cannot disappear into the Body",
  );
  assert.throws(() => verifyAnatomicalContinuity(arm.sourceCells, erased));
  const parent = arm.cells.find((c) => c.x === left + 5 && c.y === 18)!;
  const occupied = new Set(arm.cells.map(key));
  const padding: MaterialCell[] = [];
  for (let y = 16; y <= 20; y++)
    for (let x = left - 1; x <= left + 4; x++)
      if (!occupied.has(x + "," + y))
        padding.push({
          ...parent,
          x,
          y,
          id: "padding/" + x + "," + y,
          provenance: "generated",
          parentCellIds: [parent.id],
          operationId: "padding",
        });
  assert.ok(
    anatomicalContinuityFailure(arm.sourceCells, [...arm.cells, ...padding]),
    "bulk that buries a specifically selected arm is not part continuity",
  );
  assert.throws(() =>
    verifyAnatomicalContinuity(arm.sourceCells, [...arm.cells, ...padding]),
  );
  for (const graph of [body, eyeGraph, arm]) {
    // Pigment components remain physical color-island constraints, never
    // sources of eye/arm labels. Independently derive their sets.
    const unseen = new Set(graph.sourceCells.map((c) => c.id)),
      islands: string[][] = [];
    while (unseen.size) {
      const first = graph.sourceCells.find((c) => unseen.has(c.id))!,
        q = [first];
      unseen.delete(first.id);
      for (let i = 0; i < q.length; i++)
        for (const c of graph.sourceCells)
          if (
            c.color === first.color &&
            unseen.has(c.id) &&
            Math.max(Math.abs(c.x - q[i].x), Math.abs(c.y - q[i].y)) <= 1
          ) {
            unseen.delete(c.id);
            q.push(c);
          }
      islands.push(q.map((c) => c.id).sort());
    }
    assert.deepEqual(
      sourceFeatures(graph.sourceCells)
        .features.filter((f) => f.pigment !== null)
        .map((f) => [...f.sourceIds])
        .sort(),
      islands.sort(),
    );
    const edit = anatomicalEditGuard(graph.sourceCells, graph.cells);
    for (const old of graph.cells)
      for (const d of [null, { x: 1, y: 0 }, { x: 7, y: 5 }]) {
        const next = d ? { ...old, x: old.x + d.x, y: old.y + d.y } : null,
          cells = graph.cells.flatMap((c) =>
            c.id !== old.id ? [c] : next ? [next] : [],
          );
        assert.equal(
          edit(old, next),
          anatomicalContinuityFailure(graph.sourceCells, cells) === null,
        );
        let independent = true;
        try {
          verifyAnatomicalContinuity(graph.sourceCells, cells);
        } catch {
          independent = false;
        }
        assert.equal(
          edit(old, next),
          independent,
          "producer and independent union/flood oracle agree",
        );
      }
  }
  const mutable = [...clone(body.sourceCells)],
    old = sourceNeighborhood(mutable);
  mutable[0] = { ...mutable[0], x: 63, y: 63 };
  assert.notDeepEqual(sourceNeighborhood(mutable), old);
  const blueprint = sourceFeatures(body.sourceCells);
  (blueprint.membership as Map<string, readonly number[]>).clear();
  assert.ok(
    sourceFeatures(body.sourceCells).membership.size,
    "private birth inference cannot be poisoned",
  );
  const source = new Map(body.sourceCells.map((c) => [c.id, c]));
  assert.equal(
    sourceOverlay(body.cells[0], { ...body.cells[0], id: "duplicate" }, source),
    false,
  );
});

test("[MORPH-007/A2] coordinated strain and advancing pigment fronts have independent coordinate, mass and parent oracles", () => {
  for (const own of [1, 4, 16, 100])
    for (const origin of [1, 9, 144, 1024]) {
      assert.equal(regionalSourceScale(own, origin, false), own);
      assert.equal(
        regionalSourceScale(own, origin, true),
        Math.max(own, Math.ceil(Math.sqrt(origin))),
      );
    }
  const base: MaterialCell = {
    id: "chain/0",
    x: 20,
    y: 20,
    tissueId: "chain",
    color: "#222222",
    provenance: "authored",
    sourceIds: ["chain/0"],
    parentCellIds: [],
    operationId: null,
  };
  for (const r of [0, 0.25, 0.5, 1])
    for (let length = 1; length <= 10; length++) {
      const chain = Array.from({ length }, (_, i): MaterialCell => ({
        ...base,
        id: "chain/" + i,
        x: 20 + i,
        provenance: i ? "generated" : "authored",
        parentCellIds: i ? ["chain/" + (i - 1)] : [],
        operationId: i ? "growth" : null,
      }));
      const target = { x: 20 + length, y: 20 },
        allowed = length <= 2 + Math.floor(6 * r);
      assert.equal(materialSupportLimit(r), 2 + Math.floor(6 * r));
      assert.equal(
        growthSupportDistance(chain, [], "chain", target, r),
        allowed ? length : null,
      );
      const child: MaterialCell = {
        ...base,
        ...target,
        id: "new",
        provenance: "generated",
        parentCellIds: [chain.at(-1)!.id],
        operationId: "division",
      };
      if (allowed) verifyAxialSupport(chain, [], [child], r);
      else assert.throws(() => verifyAxialSupport(chain, [], [child], r));
    }
  const chain = Array.from({ length: 8 }, (_, i): MaterialCell => ({
    ...base,
    id: "chain/" + i,
    x: 20 + i,
    provenance: i ? "generated" : "authored",
  }));
  assert.equal(
    growthSupportDistance(chain, [], "chain", { x: 28, y: 20 }, 0),
    null,
  );
  const reinforced = [
    ...chain,
    ...[26, 27].map((x): MaterialCell => ({
      ...base,
      x,
      y: 21,
      id: "support/" + x,
      provenance: "generated",
    })),
  ];
  assert.equal(
    growthSupportDistance(reinforced, [], "chain", { x: 28, y: 20 }, 0),
    1,
    "surface support enables further axial growth",
  );
  const { graph: g } = input(["#####", "#####", "#####", "#####", "#####"]);
  const minX = Math.min(...g.cells.map((c) => c.x)),
    minY = Math.min(...g.cells.map((c) => c.y));
  for (const axis of ["x", "y"] as const)
    for (const side of [-1, 1] as const)
      for (const mode of ["expand", "shear"] as const) {
        const s: DevelopmentalStrain = {
          axis,
          side,
          mode,
          cut: (axis === "x" ? minX : minY) + 2,
          low: 0,
          high: 63,
        };
        const p = proposeDevelopmentalStrain(g, s, "physical-cut", 64);
        assert.ok(p);
        const live = new Map(p.cells.map((c) => [c.id, c]));
        for (const c of g.cells) {
          const expected = { x: c.x, y: c.y };
          if (mode === "shear" || side * (c[axis] - s.cut) > 0)
            expected[axis] += side;
          assert.equal(key(live.get(c.id)!), key(expected));
          assert.deepEqual(strainPoint(c, s), { ...c, [axis]: expected[axis] });
          assert.equal(live.get(c.id)!.color, c.color);
        }
        assert.equal(p.cells.length, g.cells.length + p.createdCells.length);
        for (const c of p.createdCells) {
          const parent = g.cells.find((p) => p.id === c.parentCellIds[0])!;
          assert.equal(key(parent), key(c));
          assert.equal(c.color, parent.color);
          assert.deepEqual(c.sourceIds, parent.sourceIds);
        }
        assert.equal(anatomicalContinuityFailure(g.sourceCells, p.cells), null);
        verifyAnatomicalContinuity(g.sourceCells, p.cells);
        assert.equal(proposeDevelopmentalStrain(g, s, "physical-cut", 0), null);
      }
  const square = {
    axis: "x",
    side: 1,
    mode: "expand",
    cut: minX + 2,
    low: 0,
    high: 63,
  } as const;
  assert.equal(
    proposeDevelopmentalStrain(g, square, "too-little-material", 5),
    null,
    "five seam daughters plus ten one-edge moves require six work credits",
  );
  assert.ok(proposeDevelopmentalStrain(g, square, "enough-material", 6));
  assert.throws(() => proposeDevelopmentalStrain(g, square, "invalid", 65));
  const hollow = input(["#####", "#...#", "#...#", "#...#", "#####"]).graph;
  const voids = strainVoids(hollow.protectedVoids, square);
  const expected = new Set<string>();
  for (let y = minY + 1; y < minY + 4; y++)
    for (let x = minX + 1; x <= minX + 4; x++) expected.add(x + "," + y);
  assert.deepEqual(new Set(voids), expected);
  const ink = g.sourceCells.map((c) => ({
    ...c,
    color:
      c.x === minX || c.x === minX + 4 || c.y === minY || c.y === minY + 4
        ? "#111111"
        : "#DDDDDD",
  }));
  const support = sourcePigmentSupport(ink);
  for (const color of ["#111111", "#DDDDDD"]) {
    const pigment = ink.filter((c) => c.color === color),
      mean =
        pigment.reduce(
          (n, a) =>
            n +
            ink.filter(
              (b) =>
                a.id !== b.id &&
                Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1,
            ).length,
          0,
        ) / Math.sqrt(pigment.length);
    assert.equal(support.get(ink[0].tissueId + "|" + color), mean);
  }
  const surface = ink.find((c) => c.x === minX + 2 && c.y === minY)!;
  const parent = advancingInteriorParent(
    ink,
    ink,
    surface,
    { x: surface.x, y: surface.y - 1 },
    support,
  );
  assert.ok(parent);
  assert.equal(parent.color, "#DDDDDD");
  assert.equal(parent.y, minY + 1);
  (support as Map<string, number>).clear();
  assert.ok(
    sourcePigmentSupport(ink).size,
    "returned maps cannot poison the proof",
  );
});

test("[MORPH-007/A3] every starter and unlabeled drawing retains visible features while actual birth geometry develops", () => {
  const unchanged = JSON.stringify(STARTER_PRESETS);
  let nonrigid = 0,
    fronts = 0;
  for (const preset of STARTER_PRESETS) {
    const flattened: PetPart[] = [
      {
        id: "player-ink",
        kind: "decoration",
        name: "Drawing",
        parentId: null,
        position: { x: 0, y: 0 },
        pixels: flattenAnatomy(preset.parts),
      },
    ];
    for (const [kind, parts] of [
      ["starter", preset.parts],
      ["freehand", flattened],
    ] as const) {
      const sim = createSimulation(parts, preset.seed, "infant", {
        previewCare: care,
        reuseLivingMaterial: false,
      });
      const birth = sim.materialStateAt(0).graph;
      const birthPixels = sim.frameAt(0, { time: 0, action: "idle" }).pixels;
      // Independently segment VISIBLE pigment islands. This includes unlabeled
      // eyes/details; source parts/roles cannot substitute for their visibility.
      const groups: (typeof birthPixels)[] = [],
        seen = new Set<string>();
      for (const pixel of birthPixels) {
        const k = key(pixel);
        if (seen.has(k)) continue;
        const group = [pixel];
        seen.add(k);
        for (let i = 0; i < group.length; i++)
          for (const q of birthPixels)
            if (
              !seen.has(key(q)) &&
              q.color === pixel.color &&
              Math.max(
                Math.abs(q.x - group[i].x),
                Math.abs(q.y - group[i].y),
              ) <= 1
            ) {
              seen.add(key(q));
              group.push(q);
            }
        groups.push(group);
      }
      for (const day of [60, 120, 220, 365]) {
        const graph = sim.materialStateAt(day).graph;
        verifyAnatomicalContinuity(graph.sourceCells, graph.cells, graph);
        const pixels = sim.frameAt(day, { time: 0, action: "idle" }).pixels;
        for (const feature of groups) {
          const ids = new Set(
            feature.flatMap((p) => p.materialSourceIds ?? []),
          );
          assert.ok(
            pixels.some(
              (p) =>
                p.color === feature[0].color &&
                p.materialSourceIds?.some((id) => ids.has(id)),
            ),
            preset.id + " " + kind + " visible pigment island at " + day,
          );
        }
      }
      const adult = sim.materialStateAt(365).graph,
        amount = sourceStrainFraction(birth, adult);
      if (amount >= 0.15) nonrigid++;
      assert.ok(
        amount >= 0.15,
        preset.id + " " + kind + " real source geometry changes: " + amount,
      );
      assert.deepEqual(adult.sourceCells, birth.sourceCells);
      const proof = reconstructDailyPhysicalState(clone(adult), 0, 365, birth);
      assert.deepEqual(proof.cells, new Map(adult.cells.map((c) => [c.id, c])));
      fronts += adult.events.filter(
        (e) => e.kind === "expand" && e.physical!.relocations.length,
      ).length;
      assert.strictEqual(sim.materialStateAt(365.99).graph, adult);
      assert.strictEqual(sim.materialStateAt(900).graph, adult);
      console.info(
        "COHERENT_STARTER",
        JSON.stringify({
          id: preset.id,
          kind,
          sourceDistanceChange: amount,
          strainEvents: adult.events.filter((e) => e.physical?.strain).length,
          sourceCells: birth.cells.length,
          adultCells: adult.cells.length,
        }),
      );
    }
  }
  assert.equal(JSON.stringify(STARTER_PRESETS), unchanged);
  assert.ok(nonrigid >= 18);
  assert.ok(
    fronts > 0,
    "ordinary growth transports outlines as well as developing interiors",
  );
});

test("[MORPH-007/A4] independent negative journals, causal care, saved continuation, exact daily boundaries and nulls", () => {
  const { atlas, genome } = materialInputs(
    drawing([".###.", "#####", "##.##", "#####", ".###."]),
    "COHERENT-CAUSAL",
  );
  const program = compileMaterialDevelopment(atlas, genome),
    remodel = compileLifetimeRemodeling(program, genome),
    auth = {
      material: program.operators,
      remodeling: remodel.operations,
      structuralRigidity: program.signals.channels.support.rigidity,
      repatterning: {
        seed: remodel.seed,
        elongation: program.signals.channels.growth.elongation,
        expansion: program.signals.channels.growth.expansion,
        membrane: program.signals.channels.support.membrane,
      },
    };
  let state = createDailyMaterialState(program, TIME),
    mid = state;
  for (let k = 1; k <= 365; k++) {
    state = applyDailyMaterialStep(program, genome, state, window(k), remodel);
    if (k === 90) mid = state;
  }
  assert.deepEqual(
    applyDailyMaterialStep(program, genome, clone(mid), window(91), remodel),
    applyDailyMaterialStep(program, genome, mid, window(91), remodel),
  );
  const graph = state.graph,
    event = graph.events.find((e) => e.physical?.strain)!;
  assert.ok(event);
  assert.throws(
    () =>
      reconstructDailyPhysicalState(clone(graph), TIME, 365, program.source, {
        ...auth,
        repatterning: {
          ...auth.repatterning,
          seed: auth.repatterning.seed + "/forged",
        },
      }),
    "a different genetic organizer cannot authorize the recorded deformation",
  );
  for (const forged of [
    { ...graph, cells: graph.cells.slice(1) },
    {
      ...graph,
      events: graph.events.map((e) =>
        e !== event
          ? e
          : {
              ...e,
              physical: {
                ...e.physical!,
                relocations: e.physical!.relocations.slice(1),
              },
            },
      ),
    },
    {
      ...graph,
      events: graph.events.map((e) =>
        e !== event
          ? e
          : {
              ...e,
              physical: {
                ...e.physical!,
                strain: {
                  ...e.physical!.strain!,
                  side: -e.physical!.strain!.side as -1 | 1,
                },
              },
            },
      ),
    },
    {
      ...graph,
      events: graph.events.map((e) =>
        e !== event
          ? e
          : {
              ...e,
              createdCells: e.createdCells!.map((c, i) =>
                i ? c : { ...c, color: "#F000F0" },
              ),
            },
      ),
    },
  ])
    assert.throws(() =>
      reconstructDailyPhysicalState(
        clone(forged),
        TIME,
        365,
        program.source,
        auth,
      ),
    );
  let empty = createDailyMaterialState(program, TIME);
  for (let k = 1; k <= 365; k++)
    empty = applyDailyMaterialStep(
      program,
      genome,
      empty,
      window(k, 0),
      remodel,
    );
  assert.equal(empty.checks.length, 365);
  assert.equal(empty.graph.events.length, 0);
  assert.deepEqual(empty.graph.cells, program.source.cells);
  let seedChanges = 0,
    careChanges = 0;
  for (const source of morphologySources().slice(0, 6)) {
    const a = createSimulation(source.parts, "COHERENT-A", "infant", {
      previewCare: care,
      reuseLivingMaterial: false,
    });
    const b = createSimulation(source.parts, "COHERENT-B", "infant", {
      previewCare: care,
      reuseLivingMaterial: false,
    });
    const c = createSimulation(source.parts, "COHERENT-A", "infant", {
      previewCare: {
        ...care,
        timeline: [
          { needId: "rest", tick: 90 * 24, fulfillment: 0.1 },
          { needId: "security", tick: 90 * 24, fulfillment: 0.1 },
        ],
      },
      reuseLivingMaterial: false,
    });
    for (const day of [0, 30, 90])
      assert.deepEqual(a.materialStateAt(day), c.materialStateAt(day));
    const signature = (g: MaterialGraph) =>
      g.cells
        .map((p) => p.tissueId + ":" + key(p))
        .sort()
        .join(";");
    const adult = a.materialStateAt(365).graph;
    if (signature(adult) !== signature(b.materialStateAt(365).graph))
      seedChanges++;
    if (signature(adult) !== signature(c.materialStateAt(365).graph))
      careChanges++;
    verifyAnatomicalContinuity(adult.sourceCells, adult.cells, adult);
  }
  assert.ok(seedChanges >= 4);
  assert.ok(careChanges >= 4);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation, type PetPart } from "../src/simulation";
import { compileSources } from "../src/simulation/material";
import {
  describeSource,
  compileGenome,
  compileDevelopment,
  resolveDevelopment,
  mapSourcePoint,
  groomingBindings,
} from "../src/simulation/development";
import {
  createGroomingSimulation,
  normalizeGroomTimeline,
  type GroomStroke,
} from "../src/simulation/grooming";
import {
  createNeedsSimulation,
  NEEDS_CATALOG_VERSION,
  NEEDS_RULES_VERSION,
} from "../src/needs";
import { STARTER_PRESETS } from "../src/presets";
import {
  encodePet,
  decodePet,
  PROTOTYPE_REVISION,
  type PetDocument,
} from "../src/pet-format";

function rect(
  id: string,
  kind: PetPart["kind"],
  x: number,
  y: number,
  w: number,
  h: number,
  parentId: string | null = null,
): PetPart {
  return {
    id,
    kind,
    name: id,
    position: { x, y },
    parentId,
    pixels: Array.from({ length: w * h }, (_, n) => ({
      x: n % w,
      y: Math.floor(n / w),
      color: kind === "eye" || kind === "mouth" ? "#112233" : "#cc7744",
    })),
  };
}
const source = () => [
  rect("body", "body", 10, 14, 10, 8),
  rect("head", "head", 10, 7, 10, 8, "body"),
  rect("hair", "hair", 14, 2, 2, 6, "head"),
  rect("eye-left", "eye", 12, 10, 1, 2, "head"),
  rect("eye-right", "eye", 17, 10, 1, 2, "head"),
  rect("mouth", "mouth", 14, 13, 3, 1, "head"),
];
const neutral = createNeedsSimulation("groom-integration", []).stateAt(0),
  readNeutral = () => neutral;
function backend(parts = source(), seed = "groom-integration") {
  const tissues = compileSources(parts, 1),
    program = compileDevelopment(describeSource(tissues), compileGenome(seed));
  return {
    tissues,
    program,
    at(age: number, strokes?: GroomStroke[]) {
      const grooming =
        strokes === undefined ? undefined : createGroomingSimulation(strokes);
      return resolveDevelopment(
        program,
        tissues,
        age,
        readNeutral,
        undefined,
        grooming?.stateAt,
      );
    },
  };
}
function groomingCommands(
  direction: "out" | "in" | "side",
  tick = 0,
): GroomStroke[] {
  const vector =
    direction === "out"
      ? { x: 0, y: -1 }
      : direction === "in"
        ? { x: 0, y: 1 }
        : { x: 1, y: 0 };
  return normalizeGroomTimeline(
    [0, 24, 48].map((offset) => ({
      tick: tick + offset,
      sourceId: "hair",
      materialAnchor: { x: 30, y: 18 },
      direction: vector,
      strength: 1,
    })),
  );
}
const pixelKey = (
  frame: ReturnType<ReturnType<typeof createSimulation>["frameAt"]>,
) => JSON.stringify(frame.pixels);
const materialLength = (
  r: ReturnType<typeof resolveDevelopment>["regions"][number],
) => {
  const a = mapSourcePoint(r, r.source!.pivot),
    b = mapSourcePoint(r, r.source!.tip);
  return Math.hypot(b.x - a.x, b.y - a.y);
};

test("an empty grooming timeline creates exactly the same regions and warp stacks as no callback", () => {
  for (const preset of STARTER_PRESETS)
    for (const age of [0, 14, 30, 75, 120, 365]) {
      const c = backend(preset.parts),
        old = c.at(age),
        empty = c.at(age, []);
      assert.deepEqual(empty.regions, old.regions, `${preset.id}/${age}`);
      assert.deepEqual(empty.aging, old.aging);
      assert.deepEqual(empty.state.commitments, old.state.commitments);
    }
});

test("outward and inward grooming create opposite inherited hair growth after fourteen days", () => {
  const c = backend(),
    outward = c.at(14, groomingCommands("out")),
    inward = c.at(14, groomingCommands("in"));
  const outHair = outward.regions.find((r) => r.id === "hair")!,
    inHair = inward.regions.find((r) => r.id === "hair")!;
  assert.ok(materialLength(outHair) > materialLength(inHair) + 0.5);
  assert.ok(outHair.sourceWarp!.steps.some((step) => step.grooming));
  assert.ok(inHair.sourceWarp!.steps.some((step) => step.grooming));
  const diagnostics = outward.state.diagnostics as any;
  assert.ok(diagnostics.grooming.regions.hair.lengthDelta > 0);
  assert.ok(diagnostics.grooming.regions.hair.influenceCount >= 3);
  assert.ok(
    diagnostics.regionalAllocation.regions.find((r: any) => r.id === "hair")
      .priority >
      (c.at(14).state.diagnostics as any).regionalAllocation.regions.find(
        (r: any) => r.id === "hair",
      ).priority,
  );
});

test("the integrated renderer shows outward, inward and side grooming as different fourteen-day frames", () => {
  const a = createSimulation(source(), "groom-integration", "infant", {
    groomingTimeline: groomingCommands("out"),
  });
  const b = createSimulation(source(), "groom-integration", "infant", {
    groomingTimeline: groomingCommands("in"),
  });
  const side = createSimulation(source(), "groom-integration", "infant", {
    groomingTimeline: groomingCommands("side"),
  });
  assert.notEqual(pixelKey(a.frameAt(14)), pixelKey(b.frameAt(14)));
  assert.notEqual(pixelKey(a.frameAt(14)), pixelKey(side.frameAt(14)));
  const colors = new Set(source().flatMap((p) => p.pixels.map((c) => c.color)));
  assert.ok(
    a.frameAt(14).pixels.every((p) => colors.has(p.color)),
    "grooming changes no pigment",
  );
});

test("grooming the body bends source material and carries protected facial footprints through the same host map", () => {
  const c = backend(),
    body = c.tissues.find((t) => t.id === "body")!,
    axis = { x: body.tip.x - body.pivot.x, y: body.tip.y - body.pivot.y };
  const strokes = normalizeGroomTimeline(
    [0, 24, 48].map((tick) => ({
      tick,
      sourceId: "body",
      materialAnchor: { x: 35, y: 34 },
      direction: { x: -axis.y, y: axis.x },
      strength: 1,
    })),
  );
  const r = c.at(14, strokes),
    ordinary = c.at(14);
  assert.ok((r.state.diagnostics as any).grooming.regions.body.bendRadians > 0);
  assert.notDeepEqual(
    r.regions.find((p) => p.id === "body")!.sourceWarp,
    ordinary.regions.find((p) => p.id === "body")!.sourceWarp,
  );
  for (const feature of r.regions.filter(
    (p) => p.kind === "eye" || p.kind === "mouth",
  )) {
    const host = r.regions.find((p) => p.id === feature.parentId)!;
    for (const cell of feature.source!.cells)
      assert.deepEqual(
        mapSourcePoint(feature, cell),
        mapSourcePoint(host, cell),
      );
    assert.equal(
      (r.state.diagnostics as any).grooming.regions[feature.id],
      undefined,
    );
  }
  const a = createSimulation(source(), "groom-integration", "infant", {
    groomingTimeline: strokes,
  });
  const b = createSimulation(source(), "groom-integration");
  assert.notEqual(pixelKey(a.frameAt(14)), pixelKey(b.frameAt(14)));
});

test("grooming leaves source, genes, inherited program, needs and developmental commitments unchanged", () => {
  const parts = source(),
    original = structuredClone(parts),
    timeline = groomingCommands("out");
  const base = createSimulation(parts, "groom-integration"),
    groomed = createSimulation(parts, "groom-integration", "infant", {
      groomingTimeline: timeline,
    });
  assert.deepEqual(parts, original);
  assert.deepEqual(groomed.genome, base.genome);
  assert.deepEqual(groomed.program, base.program);
  for (const age of [0, 14, 30, 75, 120, 365]) {
    assert.deepEqual(groomed.stateAt(age), base.stateAt(age));
    assert.deepEqual(
      groomed.developmentAt(age).commitments,
      base.developmentAt(age).commitments,
    );
  }
  assert.deepEqual(groomed.frameAt(0).pixels, base.frameAt(0).pixels);
});

test("future grooming cannot affect earlier frames and late commands survive arbitrary rewind seeks", () => {
  const timeline = groomingCommands("out", 20 * 24),
    empty = createSimulation(source(), "groom-integration");
  const groomed = createSimulation(source(), "groom-integration", "infant", {
    groomingTimeline: timeline,
  });
  for (const age of [0, 14, 19.5, 20 - 1e-8])
    assert.deepEqual(groomed.frameAt(age), empty.frameAt(age));
  const expected = groomed.frameAt(34);
  for (const age of [120, 0.5, 365, 20, 5, 100]) groomed.frameAt(age);
  assert.deepEqual(groomed.frameAt(34), expected);
  // This genotype is sheltered at day34: the coating can hide groomed hair,
  // while its source material and experience continue changing underneath it.
  assert.ok(
    (groomed.developmentAt(34).diagnostics as any).grooming.regions.hair
      .lengthDelta > 0,
  );
  const material = backend();
  const groomedHair = material
    .at(34, timeline)
    .regions.find((r) => r.id === "hair")!;
  const plainHair = material.at(34).regions.find((r) => r.id === "hair")!;
  assert.ok(materialLength(groomedHair) > materialLength(plainHair));
});

test("saved and reloaded grooming histories reproduce the same generated pixels and material modifiers", () => {
  const pet: PetDocument = {
    version: 8,
    algorithmVersion: 7,
    revision: PROTOTYPE_REVISION,
    mode: "infant",
    name: "Groom replay",
    seed: "groom-integration",
    parts: source(),
    needTimeline: [],
    groomingTimeline: groomingCommands("side"),
    catalogVersion: NEEDS_CATALOG_VERSION,
    needsRulesVersion: NEEDS_RULES_VERSION,
    bornAt: 0,
    age: 14,
  };
  const loaded = decodePet(encodePet(pet));
  const a = createSimulation(pet.parts, pet.seed, pet.mode, {
    groomingTimeline: pet.groomingTimeline,
  });
  const b = createSimulation(loaded.parts, loaded.seed, loaded.mode, {
    groomingTimeline: loaded.groomingTimeline,
  });
  for (const age of [0, 1.5, 14, 30, 120, 1000])
    assert.deepEqual(a.frameAt(age), b.frameAt(age));
});

test("source grooming bindings preserve opportunities and generated structures inherit rooted parent history", () => {
  const c = backend([rect("body", "body", 10, 10, 10, 8)], "life-v7-genome-03");
  const bindings = groomingBindings(c.program);
  assert.ok(
    bindings.every(
      (b) =>
        b.geneticOpportunity.length >= 0 && b.geneticOpportunity.length <= 1,
    ),
  );
  const b = bindings.find((b) => b.id === "body")!;
  const strokes = normalizeGroomTimeline(
    [0, 24, 48].map((tick) => ({
      tick,
      sourceId: "body",
      materialAnchor: b.materialAnchor,
      direction: b.growthAxis,
      strength: 1,
    })),
  );
  const groomed = c.at(30, strokes),
    original = c.at(30);
  assert.deepEqual(
    groomed.regions.map((r) => r.id),
    original.regions.map((r) => r.id),
    "grooming adds no anatomy",
  );
  const inheritance = (groomed.state.diagnostics as any).grooming
    .generatedInheritance;
  assert.ok(inheritance.length > 0);
  assert.ok(
    inheritance.every(
      (r: any) => r.sourceIds.includes("body") && r.parentStrength === 0.55,
    ),
  );
});

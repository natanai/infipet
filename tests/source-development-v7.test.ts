import test from "node:test";
import assert from "node:assert/strict";
import { compileSources } from "../src/simulation/material";
import { STARTER_PRESETS, clonePreset } from "../src/presets";
import { createSimulation, type PetPart } from "../src/simulation";
import { createNeedsSimulation, type WellbeingState } from "../src/needs";
import {
  describeSource,
  compileGenome,
  compileDevelopment,
  resolveDevelopment,
  mapSourcePoint,
  materialGene,
  getDevelopmentCacheStats,
  developmentClock,
} from "../src/simulation/development";
import { sourceDomainAt } from "../src/simulation/regional-layout";

const neutral = createNeedsSimulation("source-tests", []).stateAt(0);
const readNeutral = () => neutral;
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
      color: "#aabbcc",
    })),
  };
}
function compile(parts: PetPart[], seed = "material-tests") {
  const tissues = compileSources(parts, 1),
    atlas = describeSource(tissues),
    genome = compileGenome(seed);
  const program = compileDevelopment(atlas, genome);
  return {
    tissues,
    atlas,
    genome,
    program,
    at: (age: number, reader: (age: number) => WellbeingState = readNeutral) =>
      resolveDevelopment(program, tissues, age, reader),
  };
}
function geometry(c: ReturnType<typeof compile>, age: number) {
  return c
    .at(age)
    .regions.map((r) => ({
      kind: r.kind,
      role: r.role,
      center: r.center,
      anchor: r.anchor,
      tip: r.tip,
      cells: r.source?.cells
        .map((p) => mapSourcePoint(r, p))
        .sort((a, b) => a.y - b.y || a.x - b.x),
      clip: r.sourceClip,
      readiness: r.readiness,
    }))
    .sort(
      (a, b) =>
        a.center.x - b.center.x ||
        a.center.y - b.center.y ||
        a.kind.localeCompare(b.kind),
    );
}

test("v7 inherited potential is independent of drawing, pigment, identifiers and need history", () => {
  const seed = "one-potential",
    a = createSimulation(clonePreset("bean"), seed),
    b = createSimulation(clonePreset("canine-cub"), seed);
  assert.deepEqual(a.genome, b.genome);
  const cared = createSimulation(clonePreset("bean"), seed, "infant", {
    needTimeline: [{ needId: "safety", tick: 0, fulfillment: 0 }],
  });
  assert.deepEqual(cared.genome, a.genome);
  assert.notDeepEqual(compileGenome("another-potential"), compileGenome(seed));
});

test("source descriptors contain geometry rather than random or palette-dependent classification", () => {
  const parts = clonePreset("canine-cub"),
    a = compile(parts);
  const edited = parts
    .map((p) => ({
      ...p,
      name: "renamed",
      pixels: [...p.pixels].reverse().map((c) => ({ ...c, color: "#ee1133" })),
    }))
    .reverse();
  const b = compile(edited, "a-different-seed");
  assert.deepEqual(a.atlas.descriptors, b.atlas.descriptors);
  assert.equal(a.atlas.geometryHash, b.atlas.geometryHash);
  assert.deepEqual(
    a.atlas.patches.map((p) => p.widthProfile),
    b.atlas.patches.map((p) => p.widthProfile),
  );
});

test("identifiers, names and insertion order do not select different equal-area material hosts", () => {
  const a = [
    rect("z", "body", 5, 13, 5, 5),
    rect("a", "body", 15, 13, 5, 5),
    rect("eye", "eye", 7, 14, 1, 1, "z"),
  ];
  const b = a
    .map((p) => ({
      ...p,
      id: p.id === "z" ? "a" : p.id === "a" ? "z" : p.id,
      parentId:
        p.parentId === "z" ? "a" : p.parentId === "a" ? "z" : p.parentId,
    }))
    .reverse();
  for (const age of [15, 30, 75, 120])
    assert.deepEqual(geometry(compile(a), age), geometry(compile(b), age));
});

test("palette edits cannot break geometry-only ties between competing material operation hosts", () => {
  const outline = rect("outline", "body", 9, 9, 9, 9),
    cross = rect("cross", "body", 9, 9, 9, 9);
  outline.pixels = outline.pixels.filter(
    (p) => p.x === 0 || p.x === 8 || p.y === 0 || p.y === 8,
  );
  cross.pixels = cross.pixels.filter(
    (p) =>
      (p.x !== 4 || p.y !== 4) &&
      (p.x === 4 || p.y === 4 || p.x === p.y || p.x + p.y === 8),
  );
  // Both symmetric masks have identical area, center and bounds, but different contours.
  assert.equal(outline.pixels.length, cross.pixels.length);
  const a = compile(
    [
      {
        ...outline,
        pixels: outline.pixels.map((p) => ({ ...p, color: "#000000" })),
      },
      {
        ...cross,
        pixels: cross.pixels.map((p) => ({ ...p, color: "#ffffff" })),
      },
    ],
    "palette-tie",
  );
  const b = compile(
    [
      {
        ...outline,
        pixels: outline.pixels.map((p) => ({ ...p, color: "#ffffff" })),
      },
      {
        ...cross,
        pixels: cross.pixels.map((p) => ({ ...p, color: "#000000" })),
      },
    ],
    "palette-tie",
  );
  for (const age of [15, 30, 75, 120])
    assert.deepEqual(geometry(a, age), geometry(b, age));
});

test("all source material begins exactly at authored coordinates, including sparse fragments", () => {
  const parts = [
    rect("bulk", "body", 5, 5, 1, 1),
    rect("mark", "decoration", 24, 24, 2, 1, "bulk"),
  ];
  const c = compile(parts),
    r = c.at(0);
  assert.equal(r.regions.length, c.tissues.length);
  for (const region of r.regions)
    for (const cell of region.source!.cells)
      assert.deepEqual(mapSourcePoint(region, cell), { x: cell.x, y: cell.y });
});

test("authored masks never become generic family ellipses and keep every material domain", () => {
  const p = rect("ring", "body", 9, 9, 10, 10);
  p.pixels = p.pixels.filter(
    (c) => c.x === 0 || c.y === 0 || c.x === 9 || c.y === 9,
  );
  const c = compile([p]);
  assert.equal(c.atlas.descriptors.holes, 1);
  for (const age of [12.5, 30, 75, 120]) {
    const regions = c.at(age).regions.filter((r) => r.source);
    assert.ok(regions.length);
    assert.ok(
      regions.every(
        (r) => r.material === 0 && r.shape === "mask" && r.sourceWarp,
      ),
    );
    const retained = new Set<number>();
    for (const r of regions)
      for (const cell of r.source!.cells) {
        const value = r.sourceClip?.axis === "x" ? cell.x : cell.y;
        if (
          r.sourceClip &&
          (value < r.sourceClip.min || value >= r.sourceClip.max)
        )
          continue;
        retained.add(cell.y * 64 + cell.x);
      }
    assert.equal(retained.size, c.tissues[0].cells.length);
  }
});

test("surface marks inherit the full nonlinear host map at every stage", () => {
  const c = compile(clonePreset("canine-cub"), "surface-tracking");
  for (const age of [4.5, 19, 30, 75, 120]) {
    const r = c.at(age).regions;
    for (const feature of r.filter((r) =>
      ["eye", "mouth", "decoration"].includes(r.kind),
    )) {
      const logicalHost = r.find((h) => h.id === feature.parentId);
      assert.ok(logicalHost, `${feature.id} has a live host`);
      for (const cell of feature.source!.cells) {
        const owner = logicalHost!.sourceDomain
          ? sourceDomainAt(c.program.regionalLayout, cell)?.id
          : undefined;
        const host = owner
          ? r.find((h) => h.sourceDomain?.id === owner)!
          : logicalHost!;
        const a = mapSourcePoint(feature, cell),
          b = mapSourcePoint(host!, cell);
        assert.ok(
          Math.hypot(a.x - b.x, a.y - b.y) < 0.025,
          `${feature.id} footprint follows ${host!.id}`,
        );
      }
    }
  }
});

test("regional source domains reuse immutable masks and retain every original pigment and cavity cell exactly once", () => {
  const body = rect("body", "body", 8, 9, 14, 12);
  body.pixels = body.pixels
    .filter((p) => p.x < 3 || p.x > 10 || p.y < 3 || p.y > 8)
    .map((p, i) => ({ ...p, color: i % 2 ? "#112233" : "#ddaabb" }));
  const c = compile([body], "domain-masks"),
    a = c.at(15),
    b = c.at(75),
    original = c.tissues[0];
  const domains = a.regions.filter((r) => r.sourceDomain);
  assert.equal(domains.length, 3);
  const cells = domains.flatMap((r) => r.source!.cells),
    keys = cells.map((p) => `${p.x},${p.y}`);
  assert.equal(new Set(keys).size, original.cells.length);
  assert.deepEqual(
    cells.sort((a, b) => a.y - b.y || a.x - b.x),
    [...original.cells].sort((a, b) => a.y - b.y || a.x - b.x),
  );
  for (const r of domains) {
    assert.strictEqual(r.source, b.regions.find((x) => x.id === r.id)!.source);
    assert.strictEqual(r.materialGrowth!.cavitySource, original);
    assert.ok(r.sourceIds.includes(original.id));
    assert.equal(r.source!.sourcePartId, original.sourcePartId);
    assert.equal(
      r.sourceWarp!.steps.find((s) => s.regional)!.regional!.fixedDomainId,
      r.sourceDomain!.id,
    );
  }
});

test("regional waists do not invent a bridge across disconnected authored body fragments", () => {
  const body = rect("body", "body", 5, 10, 20, 8);
  body.pixels = body.pixels.filter((p) => p.x < 4 || p.x > 15);
  const c = compile([body], "disconnected-domain-masks");
  for (const age of [15, 30, 75, 120]) {
    const result = c.at(age);
    const bridges = result.regions.filter((r) => r.id.includes("/waist/"));
    for (const bridge of bridges) {
      const link = (
        result.state.diagnostics as any
      ).regionalAnatomy.connections.find((x: any) => x.id === bridge.id);
      const a = result.regions.find((r) => r.id === link.from)!,
        b = result.regions.find((r) => r.id === link.to)!;
      assert.ok(
        a.source!.cells.some((p) =>
          b.source!.cells.some(
            (q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) <= 1,
          ),
        ),
        "only original occupied material adjacency permits a waist",
      );
    }
  }
});

test("floating authored hands retain a carrier and gap through material division", () => {
  const c = compile(
    [
      rect("body", "body", 8, 10, 9, 9),
      rect("hand", "hand", 25, 15, 2, 2, "body"),
    ],
    "floating-carrier",
  );
  const tissue = c.tissues.find((t) => t.id === "hand")!;
  assert.equal(tissue.relationship, "floating");
  const expected = Math.hypot(tissue.carrierOffset!.x, tissue.carrierOffset!.y);
  for (const age of [0, 18, 30, 75, 120]) {
    const r = c.at(age).regions,
      hand = r.find((r) => r.id === "hand")!,
      host = r.find((r) => r.id === hand.parentId)!;
    const anchor = mapSourcePoint(host, tissue.carrierPoint!);
    assert.ok(
      Math.abs(
        Math.hypot(hand.center.x - anchor.x, hand.center.y - anchor.y) -
          expected,
      ) < 0.04,
    );
  }
});

test("small near-round body edits perturb material fields without rotating a global agenda", () => {
  const parts = [rect("body", "body", 10, 10, 8, 7)],
    edited = structuredClone(parts);
  edited[0].pixels.push({ x: 8, y: 3, color: "#aabbcc" });
  const a = compile(parts, "local-edit"),
    b = compile(edited, "local-edit");
  assert.deepEqual(a.genome, b.genome);
  for (const channel of ["growth/0", "growth/1", "absorption"])
    assert.equal(
      materialGene(a.genome, channel, 0.25, -0.3),
      materialGene(b.genome, channel, 0.25, -0.3),
    );
  for (const age of [30, 75, 120]) {
    const aa = a.at(age).regions.find((r) => r.id === "body")!,
      bb = b.at(age).regions.find((r) => r.id === "body")!;
    const pa = mapSourcePoint(aa, { x: 30, y: 29 }),
      pb = mapSourcePoint(bb, { x: 30, y: 29 });
    assert.ok(
      Math.hypot(pa.x - pb.x, pa.y - pb.y) < 8,
      "one pixel does not produce a wholesale source reroll",
    );
  }
});

test("compound source cages stay finite and bounded across the four unfiltered proof seeds", () => {
  for (const preset of STARTER_PRESETS)
    for (let seed = 1; seed <= 4; seed++) {
      const c = compile(preset.parts, `life-v7-genome-0${seed}`);
      for (const age of [30, 75, 120, 240]) {
        const r = c.at(age);
        assert.ok(r.regions.filter((r) => !r.source).length <= 32);
        assert.ok(r.state.operations.length <= 8);
        for (const region of r.regions.filter((r) => r.source))
          for (const cell of region.source!.cells) {
            const p = mapSourcePoint(region, cell);
            assert.ok(
              Number.isFinite(p.x) &&
                Number.isFinite(p.y) &&
                Math.abs(p.x) < 224 &&
                Math.abs(p.y) < 224,
              `${preset.id}/${seed}/${age}/${region.id}`,
            );
          }
      }
    }
});

test("single-cell material develops seed variety while empty art stays empty", () => {
  const samples = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const c = compile([rect("dot", "body", 15, 15, 1, 1)], `dot-${i}`);
    const r = c.at(120).regions.find((r) => r.id === "dot")!;
    samples.add(JSON.stringify([r.rx, r.ry, r.angle]));
    assert.ok(r.rx + r.ry > 3);
  }
  assert.equal(samples.size, 4);
  assert.deepEqual(compile([]).at(120).regions, []);
});

test("planned material splitting is disjoint and fusion carries both source identities", () => {
  let split = false,
    fuse = false;
  for (let n = 0; n < 24 && (!split || !fuse); n++) {
    const c = compile(
        [
          rect("left", "body", 6, 11, 6, 8),
          rect("right", "body", 14, 11, 6, 8),
        ],
        `rewrite-${n}`,
      ),
      r = c.at(75);
    split ||= r.regions.some((r) => r.sourceClip && r.id.endsWith("/division"));
    fuse ||= r.regions.some(
      (r) =>
        r.role === "bridge" &&
        r.sourceIds.includes("left") &&
        r.sourceIds.includes("right"),
    );
  }
  assert.ok(split, "a source-material partition is expressed");
  assert.ok(fuse, "a real connecting bridge carries both domains");
});

test("resorption transfers lost material identity to an explicit surviving carrier", () => {
  let found = false;
  const source = [
    rect("body", "body", 10, 10, 8, 8),
    rect("tail", "tail", 4, 13, 6, 2, "body"),
  ];
  for (let n = 0; n < 32 && !found; n++) {
    const c = compile(source, `resorption-${n}`),
      adult = c.at(75),
      elder = c.at(120);
    const records = (elder.state.diagnostics as any).resorptions as {
      sourceId: string;
      successorId: string;
      committedBy: string;
    }[];
    const tail = records.find((r) => r.sourceId === "tail");
    if (!tail) continue;
    assert.ok(adult.regions.some((r) => r.id === "tail"));
    assert.ok(!elder.regions.some((r) => r.id === "tail"));
    assert.ok(
      elder.regions
        .find((r) => r.id === tail.successorId)
        ?.sourceIds.includes("tail"),
    );
    assert.ok(
      elder.state.commitments.some(
        (c) => c.id === tail.committedBy && c.option === "absorb",
      ),
    );
    found = true;
  }
  assert.ok(found);
});

test("resource allocations are finite, conserved, shared and used in regional expression", () => {
  const c = compile(clonePreset("canine-cub"));
  const needs = createNeedsSimulation("poor-resources", [
    { needId: "rest", tick: 0, fulfillment: 0 },
  ]);
  const poor = c.at(75, (a) => needs.stateAt(a)),
    ordinary = c.at(75);
  const allocation = (poor.state.diagnostics as any).regionalAllocation;
  assert.ok(allocation.spent <= allocation.budget + 1e-9);
  assert.ok(allocation.requested > allocation.budget);
  assert.ok(
    allocation.regions.some(
      (r: any) => r.allocated < r.requested && r.expression < 1,
    ),
  );
  assert.ok(
    allocation.regions.every(
      (r: any) => Number.isFinite(r.allocated) && r.expression >= 0.62,
    ),
  );
  assert.notDeepEqual(
    poor.regions.map((r) => [r.rx, r.ry, r.center]),
    ordinary.regions.map((r) => [r.rx, r.ry, r.center]),
  );
});

test("hourly replay caches stay bounded and their contents never affect seek results", () => {
  const c = compile(clonePreset("bean")),
    reader = () => neutral;
  const past = c.at(17.25, reader);
  c.at(240, reader);
  assert.ok(getDevelopmentCacheStats(c.program, reader).dailyCheckpoints <= 33);
  assert.deepEqual(c.at(17.25, reader), past);
  const requests: number[] = [],
    watched = (a: number) => {
      requests.push(a);
      return neutral;
    };
  c.at(17.125, watched);
  assert.ok(
    requests.every((age) => age <= 17.125),
    "no future endpoint is sampled",
  );
});

test("regional waists touch occupied material in both independently transported source domains", () => {
  const c = compile(clonePreset("canine-cub"), "life-v7-genome-03");
  let examined = 0;
  for (const age of [12, 15, 18, 20, 25, 30]) {
    const result = c.at(age),
      regions = result.regions;
    for (const connection of (result.state.diagnostics as any).regionalAnatomy
      .connections) {
      const bridge = regions.find((r) => r.id === connection.id)!,
        left = regions.find((r) => r.id === connection.from)!,
        right = regions.find((r) => r.id === connection.to)!;
      const nearest = (r: typeof left, point: { x: number; y: number }) =>
        Math.min(
          ...r.source!.cells.map((p) => {
            const q = mapSourcePoint(r, p);
            return Math.hypot(q.x - point.x, q.y - point.y);
          }),
        );
      assert.ok(nearest(left, bridge.anchor) < 0.01);
      assert.ok(nearest(right, bridge.tip) < 0.01);
      assert.ok(bridge.rx > 0);
      examined++;
    }
  }
  assert.ok(examined >= 3);
});

test("finite open-ended ages retain causal commitments and continue bounded source-material change", () => {
  const c = compile(clonePreset("bean"), "lifelong-material");
  const a = c.at(240),
    b = c.at(1200),
    distant = c.at(1_000_000);
  assert.notDeepEqual(
    a.regions.map((r) => [r.rx, r.ry, r.center]),
    b.regions.map((r) => [r.rx, r.ry, r.center]),
  );
  assert.deepEqual(a.state.commitments, distant.state.commitments);
  assert.deepEqual(
    a.regions.map((r) => r.id),
    distant.regions.map((r) => r.id),
  );
  assert.equal(distant.state.developmentalAge, 1_000_000);
  for (const r of distant.regions.filter((r) => r.source))
    for (const p of r.source!.cells) {
      const point = mapSourcePoint(r, p);
      assert.ok(
        Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          Math.abs(point.x) < 224 &&
          Math.abs(point.y) < 224,
      );
    }
  const clock = developmentClock(1_000_000);
  assert.equal(clock.maturationAge, 120);
  assert.ok(
    clock.senescence > developmentClock(1200).senescence &&
      clock.senescence < 1,
  );
  assert.ok(clock.remodelingPhase > developmentClock(1200).remodelingPhase);
  assert.ok(
    distant.aging.paceFactor < b.aging.paceFactor &&
      distant.aging.paceFactor >= 0.28,
  );
  assert.ok(
    distant.aging.motionFactor < b.aging.motionFactor &&
      distant.aging.motionFactor >= 0.38,
  );
  assert.ok(
    distant.aging.remodelingRate > 0 &&
      distant.aging.remodelingRate < b.aging.remodelingRate,
  );
});

test("exact supplied long-life need mediators bypass an unbounded hourly engine replay", () => {
  const c = compile(clonePreset("bean"));
  let reads = 0,
    mediatorReads = 0;
  const reader = () => {
    reads++;
    return neutral;
  };
  const mediator = () => {
    mediatorReads++;
    return Object.fromEntries(
      [
        "safety",
        "security",
        "trust",
        "rest",
        "relaxation",
        "physical-fitness",
      ].map((id) => [id, { load: 0, opportunity: 0 }]),
    ) as any;
  };
  resolveDevelopment(c.program, c.tissues, 1_000_000, reader, mediator);
  assert.equal(mediatorReads, 1);
  assert.ok(
    reads < 30,
    "only finite inherited commitment boundaries are sampled",
  );
});

test("inherited fusion can repurpose a source-leading support pair while retaining its material", () => {
  const c = compile(clonePreset("canine-cub"), "life-v7-genome-02");
  assert.ok(!c.at(75).regions.some((r) => r.repurpose));
  const elder = c.at(120),
    converted = elder.regions.filter((r) => r.repurpose);
  assert.equal(
    converted.filter((r) => r.repurpose!.targetKind === "arm").length,
    2,
  );
  assert.equal(
    converted.filter((r) => r.repurpose!.targetKind === "hand").length,
    2,
  );
  assert.equal(
    elder.regions.filter((r) => r.kind === "leg" && !r.repurpose).length,
    2,
  );
  for (const region of converted) {
    assert.ok(region.source && region.sourceWarp && region.material === 0);
    assert.ok(region.sourceIds.includes(region.repurpose!.sourceId));
    assert.equal(region.repurpose!.progress, 1);
    if (region.repurpose!.targetKind === "arm") {
      const face = elder.regions.find((r) => r.kind === "head")!;
      assert.ok(
        (region.tip.x - region.anchor.x) * (face.center.x - region.anchor.x) +
          (region.tip.y - region.anchor.y) * (face.center.y - region.anchor.y) >
          1,
        "the source forelimb reaches toward the relocated face-facing side",
      );
      assert.ok(region.repurpose!.materialRoot);
    }
  }
  assert.ok(elder.state.commitments.some((c) => c.option === "repurpose"));
  assert.ok(
    (elder.state.diagnostics as any).functionalConversions.length === 4,
  );
});

test("later source-support operations release prior arm conversion and reproduce on rewind", () => {
  for (const seed of ["life-v7-genome-01", "life-v7-genome-04"]) {
    const c = compile(clonePreset("canine-cub"), seed),
      conversionStage = seed.endsWith("01") ? 0 : 1,
      restoreStage = conversionStage + 1;
    assert.equal(
      c.program.regionalLayout.stages[conversionStage].functionalStrategy,
      "rear-support",
    );
    assert.notEqual(
      c.program.regionalLayout.stages[restoreStage].functionalStrategy,
      "rear-support",
    );
    const adultArms = c.at(c.program.stages[conversionStage].end);
    assert.equal(
      adultArms.regions.filter((r) => r.repurpose?.targetKind === "arm").length,
      2,
    );
    const op = c.program.stages[restoreStage].operations[1],
      before = c.at(op.start),
      middle = c.at((op.start + op.end) / 2),
      after = c.at(op.end);
    const amount = (r: ReturnType<typeof c.at>) =>
      (r.state.diagnostics as any).regionalAnatomy.functionalRoleSuccession
        .manipulation;
    assert.equal(amount(before), 1);
    assert.ok(amount(middle) > 0 && amount(middle) < 1);
    assert.equal(amount(after), 0);
    assert.ok(!after.regions.some((r) => r.repurpose));
    assert.equal(after.regions.filter((r) => r.kind === "leg").length, 4);
    assert.ok(
      after.state.commitments.some(
        (commitment) =>
          commitment.id === op.id && commitment.option === "restore-support",
      ),
    );
    assert.deepEqual(c.at(op.start), before);
    const simulation = createSimulation(clonePreset("canine-cub"), seed),
      final = simulation.frameAt(op.end);
    assert.equal(
      final.parts.filter((p) => p.kind === "leg" && p.id.startsWith("leg-"))
        .length,
      4,
    );
    assert.ok(final.capabilities.canMove);
    assert.deepEqual(
      simulation.frameAt(c.program.stages[conversionStage].end),
      createSimulation(clonePreset("canine-cub"), seed).frameAt(
        c.program.stages[conversionStage].end,
      ),
    );
  }
});

test("head clearance exposes the cranial material without scaling facial glyphs separately", () => {
  for (let i = 1; i <= 4; i++) {
    const seed = `life-v7-genome-0${i}`,
      simulation = createSimulation(clonePreset("canine-cub"), seed),
      c = compile(clonePreset("canine-cub"), seed);
    for (const age of [30, 75, 120]) {
      const frame = simulation.frameAt(age),
        head = frame.parts.find((p) => p.id === "head")!;
      const body = new Set(
        frame.parts
          .filter((p) => p.kind === "body")
          .flatMap((p) => p.pixels.map((q) => q.y * 64 + q.x)),
      );
      assert.ok(
        head.pixels.filter((p) => !body.has(p.y * 64 + p.x)).length /
          head.pixels.length >
          0.35,
        `${seed}/${age}: head has exposed material outside torso`,
      );
      const state = c.at(age),
        r = state.regions.find((p) => p.id === "head")!;
      assert.ok(Math.abs(r.angle) <= Math.PI / 6 + 0.015);
      for (const feature of state.regions.filter(
        (r) =>
          ["eye", "mouth"].includes(r.kind) && r.source?.parentId === "head",
      ))
        for (const point of feature.source!.cells)
          assert.ok(
            Math.hypot(
              mapSourcePoint(feature, point).x - mapSourcePoint(r, point).x,
              mapSourcePoint(feature, point).y - mapSourcePoint(r, point).y,
            ) < 0.025,
          );
    }
  }
});

test("physical head clearance can pull inward while authored floating heads remain exempt", () => {
  const parts = [
    rect("main", "body", 1, 17, 12, 12),
    rect("chest", "body", 21, 12, 5, 5),
    rect("head", "head", 21, 7, 5, 5, "chest"),
    rect("eye", "eye", 23, 8, 1, 1, "head"),
  ];
  const c = compile(parts, "head-pullback");
  let inward = false;
  for (const age of [30, 75, 120]) {
    const result = c.at(age),
      clearance = (
        result.state.diagnostics as any
      ).regionalAnatomy.headClearances.find((x: any) => x.sourceId === "head");
    inward ||= clearance.amount < -0.2;
    assert.equal(clearance.authoredGap, 0);
    const head = result.regions.find((r) => r.id === "head")!,
      eye = result.regions.find((r) => r.id === "eye")!;
    for (const point of eye.source!.cells)
      assert.deepEqual(mapSourcePoint(eye, point), mapSourcePoint(head, point));
    const neck = result.regions.find((r) => r.id === "head/neck");
    if (neck) assert.ok(neck.rx >= Math.min(head.rx, head.ry) * 0.4 - 1e-6);
  }
  assert.ok(
    inward,
    "an overextended physical head can be pulled toward its occupied host surface",
  );
  const floating = compile(
    [
      rect("body", "body", 8, 16, 8, 8),
      rect("head", "head", 9, 3, 5, 5, "body"),
    ],
    "floating-head",
  );
  assert.equal(
    floating.tissues.find((t) => t.id === "head")!.relationship,
    "floating",
  );
  assert.ok(
    !(
      floating.at(120).state.diagnostics as any
    ).regionalAnatomy.headClearances.some((x: any) => x.sourceId === "head"),
  );
  assert.ok(!floating.at(120).regions.some((r) => r.id === "head/neck"));
});

test("authored long neck material remains intact while physical head clearance uses its occupied tip", () => {
  const parts = [
    rect("body", "body", 7, 21, 16, 7),
    rect("neck", "body", 14, 9, 2, 12, "body"),
    rect("head", "head", 12, 4, 6, 5, "neck"),
  ];
  const c = compile(parts, "authored-long-neck"),
    original = c.tissues.find((t) => t.id === "neck")!;
  for (const age of [30, 75, 120]) {
    const result = c.at(age),
      neck = result.regions.find((r) => r.id === "neck")!;
    assert.deepEqual(neck.source!.cells, original.cells);
    const rows = Array.from({ length: original.bounds.height }, (_, i) =>
      mapSourcePoint(neck, { x: original.center.x, y: original.bounds.y + i }),
    );
    const arc = rows
      .slice(1)
      .reduce(
        (sum, p, i) => sum + Math.hypot(p.x - rows[i].x, p.y - rows[i].y),
        0,
      );
    assert.ok(
      arc > original.bounds.height * 0.5,
      "the explicit neck shaft retains substantial material length even when it folds",
    );
    assert.ok(
      (result.state.diagnostics as any).regionalAnatomy.headClearances.some(
        (x: any) => x.sourceId === "head" && x.hostId === "neck",
      ),
    );
  }
});

test("spring-support drives real hopping and allocates existing haunch material without inventing supports", () => {
  const seed = "life-v7-genome-02",
    c = compile(clonePreset("canine-cub"), seed),
    r = c.at(30),
    sim = createSimulation(clonePreset("canine-cub"), seed);
  assert.equal(
    c.program.regionalLayout.stages[0].functionalStrategy,
    "spring-support",
  );
  assert.equal(r.preferred, "hop");
  assert.equal(
    sim.frameAt(30, { action: "move", time: 0.25 }).movementMode,
    "hop",
  );
  const hind = r.regions.filter((part) => part.id.startsWith("leg-hind"));
  assert.equal(hind.length, 2);
  assert.ok(
    hind.every((part) =>
      part.sourceWarp!.steps.some(
        (step) => step.supportWidth && step.supportWidth.factor > 1,
      ),
    ),
  );
  assert.equal(
    r.regions.filter((part) => part.id.startsWith("leg-") && part.source)
      .length,
    4,
  );
  assert.ok(
    (r.state.diagnostics as any).regionalAnatomy.springSupport.allocation > 0,
  );
  const empty = compile(
      [rect("body", "body", 14, 14, 1, 1)],
      "unsupported-hop",
    ),
    program = {
      ...empty.program,
      regionalLayout: {
        ...empty.program.regionalLayout,
        stages: empty.program.regionalLayout.stages.map((stage) => ({
          ...stage,
          functionalStrategy: "spring-support" as const,
        })),
      },
    };
  assert.notEqual(
    resolveDevelopment(program, empty.tissues, 30, readNeutral).preferred,
    "hop",
    "a strategy label without usable physical supports grants no hop controller",
  );
});

test("new tissue inherits its local mapped root pigment without palette or input order selecting different anatomy", () => {
  const body = rect("body", "body", 8, 10, 16, 10);
  body.pixels = body.pixels.map((p) => ({
    ...p,
    color: (p.x + p.y) % 2 ? "#3355DD" : "#DD3344",
  }));
  const mark = {
    ...rect("mark", "decoration", 12, 14, 1, 1, "body"),
    pixels: [{ x: 0, y: 0, color: "#222222" }],
  };
  const parts = [body, mark],
    seed = "local-root-pigment",
    c = compile(parts, seed),
    result = c.at(30),
    waist = result.regions.find((r) => r.id === "body/waist/0")!;
  const parent = result.regions.find((r) => r.id === waist.parentId)!;
  assert.equal(
    parent.color,
    "#DD3344",
    "the first source pixel is a different color from this material root",
  );
  assert.equal(waist.color, "#3355DD");
  assert.ok(
    parent.source!.cells.some(
      (p) =>
        p.color === "#3355DD" &&
        Math.hypot(
          mapSourcePoint(parent, p).x - waist.anchor.x,
          mapSourcePoint(parent, p).y - waist.anchor.y,
        ) < 1e-8,
    ),
    "the chosen blue pigment occupies the exact transformed growth root",
  );
  const leg = result.regions.find((r) => r.id === "support/left")!,
    foot = result.regions.find((r) => r.id === "support/left/foot")!;
  assert.ok(!leg.source && !foot.source);
  assert.equal(
    foot.color,
    leg.color,
    "generated descendants retain their already inherited root pigment",
  );
  const recolor = (color: string) =>
    color.toUpperCase() === "#3355DD"
      ? "#27AA8F"
      : color.toUpperCase() === "#DD3344"
        ? "#F1B230"
        : color;
  const palette = parts.map((p) => ({
    ...p,
    pixels: p.pixels.map((pixel) => ({
      ...pixel,
      color: recolor(pixel.color),
    })),
  }));
  const changed = compile(palette, seed);
  for (const age of [30, 75, 120]) {
    assert.deepEqual(geometry(c, age), geometry(changed, age));
    assert.deepEqual(
      c.at(age).state.commitments,
      changed.at(age).state.commitments,
    );
  }
  assert.deepEqual(c.genome, changed.genome);
  const original = createSimulation(parts, seed),
    reordered = createSimulation(
      [...parts]
        .reverse()
        .map((p) => ({ ...p, pixels: [...p.pixels].reverse() })),
      seed,
    ),
    painted = createSimulation(palette, seed);
  for (const age of [0, 30, 75, 120]) {
    assert.deepEqual(
      reordered.frameAt(age).pixels,
      original.frameAt(age).pixels,
    );
    const expected = original
      .frameAt(age)
      .pixels.map((p) => ({ ...p, color: recolor(p.color).toLowerCase() }));
    assert.deepEqual(
      painted
        .frameAt(age)
        .pixels.map((p) => ({ ...p, color: p.color.toLowerCase() })),
      expected,
    );
  }
});

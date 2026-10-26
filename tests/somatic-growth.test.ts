import test from "node:test";
import assert from "node:assert/strict";
import {
  createSimulation,
  flattenAnatomy,
  type PetPart,
} from "../src/simulation";
import {
  compileGenome,
  SOMATIC_GROWTH_VERSION,
} from "../src/simulation/genome";
import {
  compileSomaticGrowth,
  somaticSource,
  somaticGrowthAt,
  somaticTransport,
  transportSomaticPoint,
  fitSomaticCarrier,
  getSomaticProfileCacheStats,
} from "../src/simulation/somatic-growth";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import {
  createGame,
  advanceGame,
  deriveDevelopmentContext,
  HOUR,
} from "../src/gameplay";
import type { LiveDevelopmentContext } from "../src/lineage/types";

function source(
  shape: "solid" | "corner-cut" | "hollow" = "solid",
  color = "#FFFFFF",
): PetPart[] {
  const pixels = Array.from({ length: 9 * 9 }, (_, index) => ({
    x: 11 + (index % 9),
    y: 11 + Math.floor(index / 9),
    color,
  })).filter((pixel) =>
    shape === "corner-cut"
      ? pixel.x + pixel.y < 36
      : shape === "hollow"
        ? pixel.x === 11 || pixel.x === 19 || pixel.y === 11 || pixel.y === 19
        : true,
  );
  return [
    {
      id: "body-ink",
      kind: "body",
      name: "Unseen compact ink",
      parentId: null,
      position: { x: 0, y: 0 },
      layer: 0,
      pixels,
    },
    ...[0, 1].map((index): PetPart => ({
      id: `eye-${index}`,
      kind: "eye",
      name: "Eye",
      parentId: "body-ink",
      position: { x: 0, y: 0 },
      layer: 3,
      pixels: [
        {
          x: 13 + index * 3,
          y: 14,
          color: shape === "hollow" ? "#FFFFFF" : "#000000",
        },
      ],
    })),
    {
      id: "mouth",
      kind: "mouth",
      name: "Mouth",
      parentId: "body-ink",
      position: { x: 0, y: 0 },
      layer: 4,
      pixels: [
        { x: 14, y: 17, color: shape === "hollow" ? "#FFFFFF" : "#000000" },
        { x: 15, y: 17, color: shape === "hollow" ? "#FFFFFF" : "#000000" },
      ],
    },
  ];
}
function sample(
  predicate: (genes: ReturnType<typeof compileSomaticGrowth>) => boolean = () =>
    true,
) {
  for (let index = 0; index < 2048; index++) {
    const seed = `somatic-cohort-${index}`,
      genome = compileGenome(seed),
      genes = compileSomaticGrowth(genome);
    if (
      genome.lifeProgram.kind === "direct" &&
      genes.enabled &&
      predicate(genes)
    )
      return { seed, genome, genes };
  }
  throw new Error(
    "Ordinary cohort did not contain the requested inherited potential.",
  );
}
const point = (id: string, atHour: number, care = 0.5) => ({
  id,
  atHour,
  care,
  training: 0,
  battle: 0,
});
const context: LiveDevelopmentContext = {
  hatchAtHours: 0,
  stageEndHours: [1, 49, 121, 193],
  stagePoints: [
    point("birth", 0),
    point("one", 1),
    point("two", 49),
    point("three", 121),
    point("four", 193),
  ],
};

test("compact potential is versioned and inherited independently of visible ink and chronological care", () => {
  const selected = sample(),
    a = createSimulation(source(), selected.seed),
    b = createSimulation(
      source("corner-cut", "#9FAE72"),
      selected.seed,
      "infant",
      { needTimeline: [{ needId: "rest", tick: 0, fulfillment: 0 }] },
    );
  assert.deepEqual(a.genome, b.genome);
  assert.deepEqual(a.program.somaticGrowthGenes, b.program.somaticGrowthGenes);
  assert.equal(a.genome.somaticGrowthVersion, SOMATIC_GROWTH_VERSION);
  assert.equal(a.program.somaticGrowthVersion, SOMATIC_GROWTH_VERSION);
  const directFamily = Array.from({ length: 512 }, (_, index) =>
    compileGenome(`somatic-population-${index}`),
  ).filter(
    (genome) =>
      genome.lifeProgram.kind === "direct" &&
      compileSomaticGrowth(genome).enabled,
  );
  assert.ok(directFamily.length > 25 && directFamily.length < 110);
  const atlas = describeSource(compileSources(source(), 1));
  assert.ok(somaticSource(atlas, selected.genome));
  assert.equal(
    somaticSource(atlas, {
      ...selected.genome,
      lifeProgram: { ...selected.genome.lifeProgram, kind: "sheltered" },
    }),
    null,
    "compact growth cannot bypass declared sheltered development",
  );
  const authored = source();
  authored.push({
    ...authored[0],
    id: "head",
    kind: "head",
    parentId: "body-ink",
  });
  assert.equal(
    somaticSource(describeSource(compileSources(authored, 1)), selected.genome),
    null,
  );
  const fragments = source();
  fragments[0].pixels = fragments[0].pixels.filter(
    (pixel) => pixel.x < 14 || pixel.x > 17,
  );
  assert.equal(
    somaticSource(
      describeSource(compileSources(fragments, 1)),
      selected.genome,
    ),
    null,
  );
});

test("four committed growth goals interpolate for one hour, can shrink later, and ignore unreached care", () => {
  const { genes } = sample(
    (genes) =>
      genes.stages[0].size > 1.6 &&
      genes.stages[1].size < genes.stages[0].size * 0.8,
  );
  const first = somaticGrowthAt(genes, 12, 2, context);
  const second = somaticGrowthAt(genes, 31, 50, context);
  assert.ok(second.goal.size < first.goal.size * 0.8);
  assert.equal(somaticGrowthAt(genes, 10, 1, context).goal.size, 1);
  assert.equal(
    somaticGrowthAt(genes, 11, 1.5, context).goal.size,
    (1 + first.goal.size) / 2,
  );
  const future = {
    ...context,
    stagePoints: context.stagePoints.map((entry) =>
      entry.atHour > 2 ? { ...entry, care: 0, training: 1, battle: 1 } : entry,
    ),
  };
  assert.deepEqual(first, somaticGrowthAt(genes, 12, 2, future));
  const poor = {
      ...context,
      stagePoints: [point("birth", 0), point("one", 1, 0)],
    },
    cared = {
      ...context,
      stagePoints: [point("birth", 0), point("one", 1, 1)],
    };
  assert.ok(
    somaticGrowthAt(genes, 12, 2, cared).goal.size >
      somaticGrowthAt(genes, 12, 2, poor).goal.size,
  );
  assert.equal(somaticGrowthAt(genes, 121, 194, context).progress.length, 4);
  assert.deepEqual(
    somaticGrowthAt(genes, 121, 194, context).progress,
    [1, 1, 1, 1],
  );
});

test("radial rounding transports actual source points non-affinely, remains continuous and retains hollow material gaps", () => {
  const selected = sample(),
    shape = source("corner-cut"),
    tissue = compileSources(shape, 1).find((part) => part.id === "body-ink")!;
  const goal = { ...selected.genes.stages[0], rounding: 0.9, curvature: 0.03 };
  const map = somaticTransport(tissue, goal),
    center = map.center;
  const alongX = transportSomaticPoint(map, { x: center.x + 2, y: center.y }),
    alongY = transportSomaticPoint(map, { x: center.x, y: center.y + 2 }),
    corner = transportSomaticPoint(map, { x: center.x + 2, y: center.y + 2 });
  assert.ok(
    Math.hypot(
      corner.x - (alongX.x + alongY.x - center.x),
      corner.y - (alongX.y + alongY.y - center.y),
    ) > 0.05,
    "source angular extents drive a nonlinear material map",
  );
  const near = somaticTransport(tissue, {
    ...goal,
    rounding: goal.rounding - 0.0001,
  });
  for (const pixel of tissue.cells) {
    const a = transportSomaticPoint(map, pixel),
      b = transportSomaticPoint(near, pixel);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.005);
  }
  const hollow = createSimulation(source("hollow"), selected.seed, "infant", {
    liveContext: context,
  }).frameAt(2 / 24);
  const body = hollow.parts.find((part) => part.id === "body-ink")!,
    box = body.bounds;
  const cx = Math.round(box.x + (box.width - 1) / 2),
    cy = Math.round(box.y + (box.height - 1) / 2);
  assert.ok(
    !body.pixels.some(
      (pixel) => Math.abs(pixel.x - cx) < 1 && Math.abs(pixel.y - cy) < 1,
    ),
    "a source void does not become filled material",
  );
  assert.ok(
    (hollow.evolution!.diagnostics!.somaticGrowth as { eligible: boolean })
      .eligible,
  );
});

test("exact occupied-cell ray intersections support smooth circles and general rounded boxes without a contour template", () => {
  const selected = sample(),
    tissue = compileSources(source(), 1).find(
      (part) => part.id === "body-ink",
    )!;
  const goal = {
    ...selected.genes.stages[0],
    size: 1,
    aspect: 1,
    rounding: 1,
    curvature: 0,
    superellipsePower: 2,
  };
  const circle = somaticTransport(tissue, goal);
  assert.equal(circle.profile.length, 128);
  assert.ok(Math.abs(circle.profile[0] - 4.5) < 1e-12);
  assert.ok(Math.abs(circle.profile[16] - 4.5 * Math.sqrt(2)) < 1e-12);
  for (let index = 0; index < 128; index++) {
    const angle = (index / 128) * Math.PI * 2,
      radius = circle.profile[index];
    const boundary = transportSomaticPoint(circle, {
      x: circle.center.x + Math.cos(angle) * radius,
      y: circle.center.y + Math.sin(angle) * radius,
    });
    assert.ok(
      Math.abs(
        Math.hypot(boundary.x - circle.center.x, boundary.y - circle.center.y) -
          circle.radius,
      ) < 1e-8,
    );
  }
  const original = somaticTransport(tissue, { ...goal, rounding: 0 });
  for (const pixel of tissue.cells)
    assert.deepEqual(transportSomaticPoint(original, pixel), {
      x: pixel.x,
      y: pixel.y,
    });
  const box = somaticTransport(tissue, { ...goal, superellipsePower: 4 });
  const radii = [0.1, 0.4, 0.7, 1].map((fraction) => {
    const point = transportSomaticPoint(box, {
      x: box.center.x + (fraction * box.profile[16]) / Math.sqrt(2),
      y: box.center.y + (fraction * box.profile[16]) / Math.sqrt(2),
    });
    return Math.hypot(point.x - box.center.x, point.y - box.center.y);
  });
  assert.ok(
    radii.every((radius, index) => !index || radius > radii[index - 1]),
  );
  const axis = transportSomaticPoint(box, {
    x: box.center.x + box.profile[0],
    y: box.center.y,
  });
  assert.ok(
    radii[3] > Math.hypot(axis.x - box.center.x, axis.y - box.center.y) * 1.1,
  );
  const fitted = fitSomaticCarrier(
    circle,
    { x: circle.center.x + 100, y: circle.center.y },
    1.5,
  );
  assert.ok(
    Math.abs(
      Math.hypot(fitted.x - circle.center.x, fitted.y - circle.center.y) -
        (circle.radius - 1.5),
    ) < 1e-8,
  );
});

test("real gameplay grows compact source material without a camera substitute and keeps every source face visible", () => {
  const selected = sample(
    (genes) =>
      genes.stages[0].size > 1.5 &&
      genes.stages[0].aspect > 0.85 &&
      genes.stages[0].aspect < 1.15,
  );
  const game = advanceGame(
      createGame(selected.seed, "infant", 0),
      2 * HOUR,
      "active",
    ),
    reached = deriveDevelopmentContext(game);
  const ink = source(),
    sim = createSimulation(ink, selected.seed, "infant", {
      liveContext: reached,
    });
  const born = sim.frameAt(0),
    future = sim.frameAt(2 / 24);
  assert.deepEqual(
    born.pixels,
    flattenAnatomy(ink).map((pixel) => ({
      ...pixel,
      x: pixel.x + 16,
      y: pixel.y + 16,
    })),
  );
  const body = future.parts.find((part) => part.id === "body-ink")!;
  assert.ok(
    body.pixels.length >
      born.parts.find((part) => part.id === "body-ink")!.pixels.length * 1.5,
  );
  const diagnostics = future.interaction.diagnostics as {
    camera: { scale: number };
  };
  assert.equal(diagnostics.camera.scale, 1);
  const visible = new Map(
    future.pixels.map((pixel) => [`${pixel.x},${pixel.y}`, pixel.color]),
  );
  for (const original of ink)
    assert.ok(
      future.parts.some(
        (part) =>
          part.sourcePartId === original.id ||
          part.sourcePartIds?.includes(original.id),
      ),
    );
  for (const feature of future.parts.filter(
    (part) => part.kind === "eye" || part.kind === "mouth",
  )) {
    assert.ok(feature.pixels.length > 0);
    assert.ok(
      feature.pixels.every(
        (pixel) => visible.get(`${pixel.x},${pixel.y}`) === pixel.color,
      ),
    );
  }
  sim.frameAt(1.5 / 24, { time: 0.75 });
  sim.frameAt(0);
  assert.deepEqual(sim.frameAt(2 / 24), future);
  assert.deepEqual(
    createSimulation(ink, selected.seed, "infant", {
      liveContext: reached,
    }).frameAt(2 / 24),
    future,
  );
  const changed = createSimulation(
    source("corner-cut"),
    selected.seed,
    "infant",
    { liveContext: reached },
  ).frameAt(2 / 24);
  assert.notDeepEqual(
    changed.pixels,
    future.pixels,
    "an unseen source edit remains causally observable",
  );
  const earlier = sim.frameAt(1.5 / 24).pixels;
  assert.deepEqual(
    createSimulation(ink, selected.seed, "infant", {
      liveContext: {
        ...reached,
        stagePoints: [...reached.stagePoints, point("later", 49, 0)],
      },
    }).frameAt(1.5 / 24).pixels,
    earlier,
  );
});

test("compact care retains chronological six-hour and seven-day readers instead of speeding them to stage time", () => {
  const selected = sample(),
    history = [{ needId: "rest" as const, tick: 0, fulfillment: 0 }];
  const lab = createSimulation(source(), selected.seed, "infant", {
    needTimeline: history,
  });
  const live = createSimulation(source(), selected.seed, "infant", {
    needTimeline: history,
    liveContext: context,
  });
  for (const hours of [1, 6, 24, 168])
    assert.deepEqual(live.stateAt(hours / 24), lab.stateAt(hours / 24));
  assert.ok(
    live.stateAt(6 / 24).needs.rest.shortTerm <
      live.stateAt(1 / 24).needs.rest.shortTerm,
  );
  assert.ok(
    live.stateAt(168 / 24).needs.rest.memory >
      live.stateAt(6 / 24).needs.rest.memory,
  );
  const neutral = createSimulation(source(), selected.seed, "infant", {
    liveContext: context,
  });
  assert.notDeepEqual(
    live.frameAt(168 / 24).pixels,
    neutral.frameAt(168 / 24).pixels,
  );
  assert.deepEqual(live.genome, neutral.genome);
});

test("bounded geometry-keyed profile caching shares seeds and palettes, invalidates edits and reproduces cold output", () => {
  const selected = sample(),
    ink = source();
  ink[0].pixels = Array.from({ length: 8 * 11 }, (_, index) => ({
    x: 8 + (index % 8),
    y: 9 + Math.floor(index / 8),
    color: "#FFFFFF",
  }));
  const tissue = compileSources(ink, 1).find((part) => part.id === "body-ink")!;
  const before = getSomaticProfileCacheStats();
  const cold = somaticTransport(tissue, selected.genes.stages[0]);
  assert.equal(
    getSomaticProfileCacheStats().compilations,
    before.compilations + 1,
  );
  const warm = somaticTransport(
    {
      ...tissue,
      id: "another-seed-source",
      cells: [...tissue.cells]
        .reverse()
        .map((pixel) => ({ ...pixel, color: "#1378AD" })),
    },
    selected.genes.stages[0],
  );
  assert.equal(
    getSomaticProfileCacheStats().compilations,
    before.compilations + 1,
  );
  assert.equal(
    warm.profile,
    cold.profile,
    "equal coordinate sets share immutable profile geometry across source objects",
  );
  assert.ok(Object.isFrozen(warm.profile));
  assert.deepEqual(
    transportSomaticPoint(warm, tissue.center),
    transportSomaticPoint(cold, tissue.center),
  );
  const changed = somaticTransport(
    { ...tissue, cells: tissue.cells.filter((_, index) => index !== 0) },
    selected.genes.stages[0],
  );
  assert.equal(
    getSomaticProfileCacheStats().compilations,
    before.compilations + 2,
  );
  assert.notDeepEqual(
    changed.profile,
    cold.profile,
    "an occupied-corner edit changes its ray intersections",
  );
  for (let index = 1; index <= 66; index++)
    somaticTransport(
      { ...tissue, cells: tissue.cells.filter((_, at) => at !== index) },
      selected.genes.stages[0],
    );
  assert.ok(getSomaticProfileCacheStats().size <= 64);
  const afterEviction = getSomaticProfileCacheStats();
  const reproduced = somaticTransport(tissue, selected.genes.stages[0]);
  assert.equal(
    getSomaticProfileCacheStats().compilations,
    afterEviction.compilations + 1,
  );
  assert.deepEqual(reproduced, cold);
});

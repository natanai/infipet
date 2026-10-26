import test from "node:test";
import assert from "node:assert/strict";
import {
  createSimulation,
  flattenAnatomy,
  type PetPart,
} from "../src/simulation";
import {
  compileGenome,
  SURFACE_EXPRESSION_VERSION,
} from "../src/simulation/genome";
import {
  compileSurfaceExpression,
  applySurfaceExpression,
  surfaceExpressionAt,
  pigmentLuminance,
} from "../src/simulation/surface-expression";
import {
  createGame,
  advanceGame,
  deriveDevelopmentContext,
  HOUR,
} from "../src/gameplay";
import type { LiveDevelopmentContext } from "../src/lineage/types";

function drawing(
  shape: "round" | "asymmetric" = "round",
  color = "#FFFFFF",
): PetPart[] {
  const pixels = Array.from({ length: 20 * 18 }, (_, index) => ({
    x: 6 + (index % 20),
    y: 7 + Math.floor(index / 20),
    color,
  })).filter((pixel) =>
    shape === "round"
      ? ((pixel.x - 15.5) / 10) ** 2 + ((pixel.y - 15.5) / 9) ** 2 <= 1
      : pixel.x < 22 && pixel.y < 23 && pixel.x + pixel.y < 42,
  );
  return [
    {
      id: "source-ink",
      name: "Unseen ink",
      kind: "body",
      parentId: null,
      position: { x: 0, y: 0 },
      layer: 0,
      pixels,
    },
    ...[0, 1].map((index): PetPart => ({
      id: `feature-${index}`,
      name: "Eye",
      kind: "eye",
      parentId: "source-ink",
      position: { x: 0, y: 0 },
      layer: 5,
      pixels: [0, 1].map((dy) => ({
        x: 12 + index * 6,
        y: 12 + dy,
        color: "#000000",
      })),
    })),
    {
      id: "feature-mouth",
      name: "Mouth",
      kind: "mouth",
      parentId: "source-ink",
      position: { x: 0, y: 0 },
      layer: 6,
      pixels: [0, 1, 2].map((dx) => ({ x: 14 + dx, y: 18, color: "#000000" })),
    },
  ];
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
  stagePoints: [point("birth", 0), point("first", 1), point("second", 49)],
};
function inheritedSample(
  predicate: (genes: ReturnType<typeof compileSurfaceExpression>) => boolean,
) {
  for (let index = 0; index < 512; index++) {
    const seed = `surface-cohort-${index}`,
      genome = compileGenome(seed),
      genes = compileSurfaceExpression(genome);
    if (predicate(genes)) return { seed, genome, genes };
  }
  throw new Error(
    "The ordinary cohort did not contain the expected general phenotype.",
  );
}

test("surface potentials are inherited, versioned and include expressive and unchanged populations", () => {
  const cohort = Array.from({ length: 128 }, (_, index) =>
    compileSurfaceExpression(compileGenome(`surface-population-${index}`)),
  );
  const enabled = cohort.filter((genes) => genes.enabled);
  assert.ok(enabled.length >= 20 && enabled.length <= 80);
  assert.ok(cohort.some((genes) => !genes.enabled));
  assert.ok(
    enabled.some(
      (genes) =>
        genes.stageRanks.some((rank) => rank < 0.4) &&
        genes.stageRanks.some((rank) => rank > 0.4),
    ),
  );
  const { seed } = inheritedSample((genes) => genes.enabled);
  const one = createSimulation(drawing(), seed);
  const two = createSimulation(
    drawing("asymmetric", "#7DAB71"),
    seed,
    "infant",
    {
      needTimeline: [{ needId: "rest", tick: 0, fulfillment: 0 }],
    },
  );
  assert.deepEqual(one.genome, two.genome);
  assert.equal(one.genome.surfaceExpressionVersion, SURFACE_EXPRESSION_VERSION);
  assert.equal(
    one.program.surfaceExpressionVersion,
    SURFACE_EXPRESSION_VERSION,
  );
  assert.deepEqual(
    one.program.surfaceExpressionGenes,
    two.program.surfaceExpressionGenes,
  );
});

test("only reached care commitments select pigment outcomes, with smooth one-hour windows and reversibility", () => {
  const { genes } = inheritedSample(
    (genes) =>
      genes.enabled && genes.stageRanks[0] >= 0.4 && genes.stageRanks[1] < 0.4,
  );
  assert.equal(surfaceExpressionAt(genes, 0, 0, context).expression, 0);
  assert.equal(surfaceExpressionAt(genes, 10, 1, context).expression, 0);
  const half = surfaceExpressionAt(genes, 11, 1.5, context);
  assert.equal(half.expression, 0.5);
  assert.equal(surfaceExpressionAt(genes, 12, 2, context).expression, 1);
  assert.equal(surfaceExpressionAt(genes, 30, 49, context).expression, 1);
  assert.equal(surfaceExpressionAt(genes, 31, 49.5, context).expression, 0.5);
  assert.equal(surfaceExpressionAt(genes, 32, 50, context).expression, 0);
  assert.deepEqual(
    surfaceExpressionAt(genes, 12, 2, context),
    surfaceExpressionAt(genes, 12, 2, {
      ...context,
      stagePoints: context.stagePoints.slice(0, 2),
    }),
    "later care and commitments cannot rewrite an earlier surface",
  );
  const sensitive = inheritedSample(
    (genes) =>
      genes.enabled && genes.stageRanks[0] > 0.26 && genes.stageRanks[0] < 0.54,
  ).genes;
  const cared = {
    ...context,
    stagePoints: [point("birth", 0), point("first", 1, 1)],
  };
  const neglected = {
    ...context,
    stagePoints: [point("birth", 0), point("first", 1, 0)],
  };
  assert.equal(surfaceExpressionAt(sensitive, 12, 2, cared).expression, 1);
  assert.equal(surfaceExpressionAt(sensitive, 12, 2, neglected).expression, 0);
});

test("ordinary gameplay can produce a source-derived outline with visible contrasting facial ink on unseen drawings", () => {
  let candidate: { seed: string; context: LiveDevelopmentContext } | undefined;
  for (let index = 0; index < 128; index++) {
    const seed = `surface-playable-${index}`,
      genes = compileSurfaceExpression(compileGenome(seed));
    if (!genes.enabled) continue;
    const game = advanceGame(createGame(seed, "infant", 0), 2 * HOUR, "active");
    const reached = deriveDevelopmentContext(game);
    if (surfaceExpressionAt(genes, 12, 2, reached).expression === 1) {
      candidate = { seed, context: reached };
      break;
    }
  }
  assert.ok(candidate);
  const produced: string[] = [];
  for (const shape of ["round", "asymmetric"] as const) {
    const source = drawing(shape),
      sim = createSimulation(source, candidate.seed, "infant", {
        liveContext: candidate.context,
      });
    const expected = flattenAnatomy(source).map((pixel) => ({
      ...pixel,
      x: pixel.x + 16,
      y: pixel.y + 16,
    }));
    assert.deepEqual(
      sim.frameAt(0, { time: 0 }).pixels,
      expected,
      "birth remains exact full-color source material",
    );
    const frame = sim.frameAt(2 / 24, { time: 0 });
    const changedCarriers = frame.parts.filter(
      (part) =>
        part.surfaceExpression?.operation === "interior-pigment" &&
        part.surfaceExpression.changedPixelCount > 0,
    );
    assert.ok(changedCarriers.length > 0);
    const body = frame.parts.find((part) => part.id === "source-ink")!;
    assert.ok(
      body.pixels.some((pixel) => pigmentLuminance(pixel.color) >= 0.99),
      "the actual exterior rim retains source pigment",
    );
    assert.ok(
      body.pixels.some((pixel) => pigmentLuminance(pixel.color) <= 0.01),
      "existing interior carrier material expresses dark pigment",
    );
    const visible = new Map(
      frame.pixels.map((pixel) => [`${pixel.x},${pixel.y}`, pixel.color]),
    );
    for (const feature of frame.parts.filter(
      (part) => part.kind === "eye" || part.kind === "mouth",
    )) {
      assert.ok(feature.pixels.length > 0);
      assert.equal(
        new Set(feature.pixels.map((pixel) => pixel.color)).size,
        1,
        "one-color facial ink retains a coherent pigment palette",
      );
      assert.ok(feature.surfaceExpression?.sourcePartIds.includes(feature.id));
      assert.equal(feature.surfaceExpression?.operation, "facial-contrast");
      assert.ok((feature.surfaceExpression?.contrastAfter ?? 0) >= 0.5 - 1e-12);
      assert.ok(
        feature.pixels.every(
          (pixel) => visible.get(`${pixel.x},${pixel.y}`) === pixel.color,
        ),
      );
    }
    sim.frameAt(0.5 / 24, { time: 1 });
    sim.frameAt(1.5 / 24, { time: 0.5 });
    assert.deepEqual(sim.frameAt(2 / 24, { time: 0 }), frame);
    assert.deepEqual(
      createSimulation(source, candidate.seed, "infant", {
        liveContext: candidate.context,
      }).frameAt(2 / 24, { time: 0 }),
      frame,
    );
    produced.push(JSON.stringify(frame.pixels));
  }
  assert.notEqual(
    produced[0],
    produced[1],
    "unseen source shape remains causally observable with the same seed and care",
  );
});

test("nonexpressive inherited families keep their authored pigments, while expressive colored faces remain legible", () => {
  const nonexpressive = inheritedSample((genes) => !genes.enabled);
  const unchanged = createSimulation(drawing(), nonexpressive.seed).frameAt(
    30,
    { time: 0 },
  );
  assert.ok(unchanged.parts.every((part) => !part.surfaceExpression));
  assert.ok(
    unchanged.parts
      .filter((part) => part.kind === "eye" || part.kind === "mouth")
      .every((part) => part.pixels.every((pixel) => pixel.color === "#000000")),
  );
  const expressive = inheritedSample(
    (genes) => genes.enabled && genes.stageRanks[0] >= 0.4,
  );
  const source = drawing("asymmetric", "#7DAB71");
  source[1].pixels.forEach((pixel) => {
    pixel.color = "#D76192";
  });
  const sim = createSimulation(source, expressive.seed, "infant", {
    liveContext: context,
  });
  assert.deepEqual(
    sim.frameAt(0).pixels,
    flattenAnatomy(source).map((pixel) => ({
      ...pixel,
      x: pixel.x + 16,
      y: pixel.y + 16,
    })),
  );
  for (const hour of [1, 1.25, 1.5, 1.75, 2]) {
    const frame = sim.frameAt(hour / 24, { time: 0 });
    for (const part of frame.parts.filter(
      (part) => part.surfaceExpression?.operation === "facial-contrast",
    ))
      assert.ok((part.surfaceExpression!.contrastAfter ?? 0) >= 0.5 - 1e-12);
  }
});

test("surface measurement never paints missing material or turns a hollow source's empty face carrier into imaginary skin", () => {
  const sample = inheritedSample((genes) => genes.enabled);
  const source = drawing();
  source[0].pixels = source[0].pixels.filter(
    (pixel) => pixel.x < 10 || pixel.x > 20 || pixel.y < 10 || pixel.y > 20,
  );
  for (const feature of source.slice(1))
    for (const pixel of feature.pixels) pixel.color = "#FFFFFF";
  const born = createSimulation(source, sample.seed).frameAt(0);
  const geometry = (parts: typeof born.parts) =>
    parts.map((part) => ({
      id: part.id,
      parentId: part.parentId,
      sourcePartId: part.sourcePartId,
      sourcePartIds: part.sourcePartIds,
      kind: part.kind,
      pixels: part.pixels.map(({ x, y }) => ({ x, y })),
    }));
  for (const expression of [0.1, 0.5, 1]) {
    const parts = structuredClone(born.parts);
    applySurfaceExpression(parts, sample.genes, {
      version: SURFACE_EXPRESSION_VERSION,
      expression,
      committedStages: 1,
      transitionHours: 1,
    });
    assert.deepEqual(geometry(parts), geometry(born.parts));
    for (const feature of parts.filter(
      (part) => part.kind === "eye" || part.kind === "mouth",
    )) {
      assert.ok(feature.pixels.every((pixel) => pixel.color === "#FFFFFF"));
      assert.ok((feature.surfaceExpression?.contrastAfter ?? 0) >= 1 - 1e-12);
    }
  }
});

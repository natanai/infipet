/** Bounded real timings; this is a report, not a machine-dependent pass/fail gate. */
import { performance } from "node:perf_hooks";
import {
  createSimulation,
  PART_KINDS,
  PART_LABELS,
  type PetAction,
  type PetPart,
} from "../src/simulation";
import {
  CARE_CONDITIONS,
  GALLERY_FIXTURES,
  type GalleryFixture,
} from "./gallery";

function measure(
  operation: (index: number) => void,
  samples = 30,
  warmups = 4,
) {
  for (let index = 0; index < warmups; index += 1) operation(index);
  const timings: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const start = performance.now();
    operation(index + warmups);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  const rounded = (value: number) => Math.round(value * 1000) / 1000;
  return {
    samples,
    warmups,
    medianMs: rounded(timings[Math.floor(samples / 2)]),
    p95Ms: rounded(timings[Math.floor(samples * 0.95)]),
    minMs: rounded(timings[0]),
    maxMs: rounded(timings.at(-1)!),
  };
}

export function stressFixtures(): GalleryFixture[] {
  const parentFor = (kind: (typeof PART_KINDS)[number]) =>
    ["body", "egg"].includes(kind)
      ? null
      : kind === "head"
        ? "dense-body"
        : kind === "hand"
          ? "dense-arm"
          : kind === "foot"
            ? "dense-leg"
            : ["eye", "mouth", "hair", "ear", "horn", "decoration"].includes(
                  kind,
                )
              ? "dense-head"
              : "dense-body";
  const dense: PetPart[] = PART_KINDS.map((kind) => ({
    id: `dense-${kind}`,
    kind,
    name: PART_LABELS[kind],
    position: { x: 0, y: 0 },
    parentId: parentFor(kind),
    pixels: Array.from({ length: 1024 }, (_, index) => ({
      x: index % 32,
      y: Math.floor(index / 32),
      color: "#AAAAAA",
    })),
  }));
  const sparse: PetPart = {
    id: "sparse-body",
    kind: "body",
    name: "Sparse body",
    position: { x: 0, y: 0 },
    parentId: null,
    pixels: Array.from({ length: 256 }, (_, index) => ({
      x: (index % 16) * 2,
      y: Math.floor(index / 16) * 2,
      color: "#AAAAAA",
    })),
  };
  return [
    {
      name: "Stress / 15 full overlapping typed masks",
      seed: "dense-valid-canvas",
      mode: "infant",
      parts: dense,
    },
    {
      name: "Stress / 256 isolated body cells",
      seed: "sparse-valid-canvas",
      mode: "infant",
      parts: [sparse],
    },
  ];
}

function benchmarkFixture(fixture: GalleryFixture, stress = false) {
  const simulation = createSimulation(
    fixture.parts,
    fixture.seed,
    fixture.mode,
    { needTimeline: fixture.needTimeline ?? [] },
  );
  const adult = simulation.milestones.find(
    (milestone) => milestone.stage === "adult",
  )!.age;
  const teen = simulation.milestones.find(
    (milestone) => milestone.stage === "teen",
  )!.age;
  simulation.frameAt(adult);
  const actions: PetAction[] = ["idle", "move", "play", "greet"];
  const samples = stress ? 3 : 30;
  const warmups = stress ? 0 : 4;
  const measurements = {
    compile: measure(
      (index) => {
        createSimulation(
          fixture.parts,
          `${fixture.seed}-compile-${index}`,
          fixture.mode,
          { needTimeline: fixture.needTimeline ?? [] },
        );
      },
      stress ? 3 : 16,
      warmups,
    ),
    distinctStructuralAges: measure(
      (index) => {
        simulation.frameAt(teen + ((adult - teen) * (index + 1)) / 40);
      },
      samples,
      warmups,
    ),
    repeatedNeutralFrame: measure(
      () => {
        simulation.frameAt(adult);
      },
      samples,
      warmups,
    ),
    sameAgePoseTimes: measure(
      (index) => {
        simulation.frameAt(adult, {
          time: (index + 1) * 0.137,
          action: actions[index % actions.length],
          target: { x: 44, y: 31 },
        });
      },
      samples,
      warmups,
    ),
  };
  const frame = simulation.frameAt(adult);
  const finalFrame = simulation.frameAt(simulation.hatchAt + 240);
  if (finalFrame.developmentalAge !== 240)
    throw new Error(
      `${fixture.name}: benchmark did not reach developmental day 240.`,
    );
  return {
    category: stress ? "stress" : "typical",
    specimen: fixture.name,
    seed: fixture.seed,
    mode: fixture.mode,
    fingerprint: simulation.genome.fingerprint,
    algorithmVersion: simulation.program.version,
    sourcePixels: fixture.parts.reduce(
      (sum, part) => sum + part.pixels.length,
      0,
    ),
    sourceParts: fixture.parts.length,
    needTimeline: fixture.needTimeline ?? [],
    adultCells: frame.cellCount,
    adultParts: frame.parts.length,
    operators: simulation.program.operators.length,
    adultCareState: {
      tick: frame.wellbeing.tick,
      development: frame.wellbeing.development,
    },
    endpoint: {
      developmentalAge: finalFrame.developmentalAge,
      cells: finalFrame.cellCount,
      development: finalFrame.wellbeing.development,
    },
    limits: simulation.program.limits,
    measurements,
  };
}

export function runBenchmark() {
  const fixtures = [
    GALLERY_FIXTURES[0],
    GALLERY_FIXTURES[1],
    GALLERY_FIXTURES[2],
    GALLERY_FIXTURES[4],
  ];
  const controlledHistoryResults = CARE_CONDITIONS.map((condition) =>
    benchmarkFixture({
      ...GALLERY_FIXTURES[0],
      name: condition.name,
      needTimeline: condition.timeline,
    }),
  );
  const careFingerprints = new Set(
    controlledHistoryResults.map((result) => result.fingerprint),
  );
  if (careFingerprints.size !== 1)
    throw new Error(
      "Care history changed the genome fingerprint in the benchmark.",
    );
  return {
    runtime: process.version,
    platform: `${process.platform}/${process.arch}`,
    scope:
      "Node development engine API on this machine; excludes React rendering, native UI and phone/widget scheduling overhead.",
    note: "Compile includes the seeded development program. Structural misses use distinct ages; pose reuse keeps age fixed and changes animation time. Timings include public-frame copying and raster work. Typical specimens and extreme valid stress inputs are reported separately. Stress uses only three samples without warmup; its p95 is the observed maximum, not a stable percentile estimate. No cache-hit claim is inferred from a speed ratio.",
    results: fixtures.map((fixture) => benchmarkFixture(fixture)),
    stressResults: stressFixtures().map((fixture) =>
      benchmarkFixture(fixture, true),
    ),
    controlledHistoryResults,
    controlledHistoryGenomeEquality: true,
  };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/benchmark.ts")) {
  process.stdout.write(`${JSON.stringify(runBenchmark(), null, 2)}\n`);
}

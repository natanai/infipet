/** Node API profiling; deliberately separate from visual-audit collection and device claims. */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  createSimulation,
  getBlueprintCacheStats,
  PART_KINDS,
  type PetPart,
} from "../../src/simulation";
import { STARTER_PRESETS, clonePreset } from "../../src/presets";
import { PROTOTYPE_REVISION } from "../../src/pet-format";

const PROTOCOL = "source-profile-v7-2";
const STRUCTURAL_AGES = [
  5, 10, 15, 20, 25, 30, 35, 45, 60, 75, 90, 105, 120, 143, 180, 240,
];
const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(join(directory, entry.name))
          : Promise.resolve([join(directory, entry.name)]),
      ),
    )
  )
    .flat()
    .filter((file) => /\.(ts|tsx|json)$/.test(file))
    .sort();
}
async function hashes() {
  const files = [
    ...(await walk("src/simulation")),
    ...(await walk("src/needs")),
    "src/presets.ts",
    "src/pet-format.ts",
    "tools/source-audit/profile.ts",
  ].sort();
  return Object.fromEntries(
    await Promise.all(
      files.map(
        async (file) =>
          [
            relative(process.cwd(), resolve(file)).replaceAll("\\", "/"),
            sha(await readFile(file)),
          ] as const,
      ),
    ),
  );
}
function stats(samples: number[], condition: string) {
  const sorted = [...samples].sort((a, b) => a - b);
  const quantile = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  const rate = (limit: number) => {
    const numerator = samples.filter((value) => value < limit).length;
    return {
      numerator,
      denominator: samples.length,
      percent: (numerator / samples.length) * 100,
      condition: `${condition}; measured Node public API call under${limit}ms`,
    };
  };
  return {
    samples: samples.length,
    medianMs: quantile(0.5),
    p95Ms: quantile(0.95),
    maximumMs: sorted.at(-1),
    within16ms: rate(16),
    within50ms: rate(50),
    condition,
  };
}
function timed<T>(evaluate: () => T): { value: T; ms: number } {
  const start = performance.now(),
    value = evaluate();
  return { value, ms: performance.now() - start };
}
function sparse(): PetPart[] {
  return [
    {
      id: "sparse",
      name: "256 isolated cells",
      kind: "body",
      parentId: null,
      position: { x: 0, y: 0 },
      pixels: Array.from({ length: 256 }, (_, i) => ({
        x: (i % 16) * 2,
        y: Math.floor(i / 16) * 2,
        color: "#FFFFFF",
      })),
    },
  ];
}
function dense(): PetPart[] {
  return PART_KINDS.map((kind, layer) => ({
    id: `dense-${kind}`,
    name: kind,
    kind,
    parentId: null,
    position: { x: 0, y: 0 },
    layer,
    pixels: Array.from({ length: 1024 }, (_, i) => ({
      x: i % 32,
      y: Math.floor(i / 32),
      color: "#FFFFFF",
      z: layer,
    })),
  }));
}
async function main() {
  const outputIndex = process.argv.indexOf("--output");
  const output = resolve(
    outputIndex >= 0
      ? process.argv[outputIndex + 1]
      : "docs/audits/life-v7/performance.json",
  );
  const before = await hashes();
  const fixtures = [
    ...STARTER_PRESETS.map((preset) => ({
      id: preset.id,
      parts: clonePreset(preset.id),
    })),
    { id: "sparse-256", parts: sparse() },
    { id: "dense-15360", parts: dense() },
  ];
  const results: unknown[] = [],
    failures: { fixtureId: string; error: string }[] = [];
  for (const fixture of fixtures) {
    try {
      const compileTimes: number[] = [];
      const compileBefore = getBlueprintCacheStats().compilations;
      for (let i = 0; i < 4; i++) {
        const result = timed(() =>
          createSimulation(
            fixture.parts,
            `v7-profile/${fixture.id}/compile/${i}`,
          ),
        );
        if (result.value.program.version !== 7)
          throw new Error("Profiling requires algorithm7.");
        if (i > 0) compileTimes.push(result.ms);
      }
      const simulation = createSimulation(
        fixture.parts,
        `v7-profile/${fixture.id}/structure`,
      );
      simulation.frameAt(1);
      simulation.frameAt(2);
      const structural = STRUCTURAL_AGES.map(
        (age) => timed(() => simulation.frameAt(age)).ms,
      );
      const rest = simulation.frameAt(75);
      const poseTimes = Array.from(
        { length: 8 },
        (_, phase) => (phase + 0.001) / (8 * rest.motionPace),
      );
      const firstPose = poseTimes.map(
        (time) =>
          timed(() => simulation.frameAt(75, { action: "move", time })).ms,
      );
      const warmPose: number[] = [];
      for (let i = 0; i < 128; i++)
        warmPose.push(
          timed(() =>
            simulation.frameAt(75, { action: "move", time: poseTimes[i % 8] }),
          ).ms,
        );
      const beforePlayback = simulation.getRenderCacheStats?.();
      const advancingPlayback: number[] = [];
      for (let i = 0; i < 128; i++)
        advancingPlayback.push(
          timed(() =>
            simulation.frameAt(75, {
              action: "move",
              time: (8 + (i + 0.001) / 8) / rest.motionPace,
            }),
          ).ms,
        );
      const afterPlayback = simulation.getRenderCacheStats?.();
      const record = {
        fixtureId: fixture.id,
        sourceHash: sha(JSON.stringify(fixture.parts)),
        authoredParts: fixture.parts.length,
        authoredCells: fixture.parts.reduce(
          (sum, part) => sum + part.pixels.length,
          0,
        ),
        compile: stats(
          compileTimes,
          "Distinct deterministic seeds force blueprint misses; three samples after one separate warmup",
        ),
        observedCompilationsDuringCompile:
          getBlueprintCacheStats().compilations - compileBefore - 1,
        structure: stats(
          structural,
          "Distinct structural ages; idle, animation time0; two warmup ages; one simulation",
        ),
        structuralAges: STRUCTURAL_AGES,
        firstEightPoses: stats(
          firstPose,
          "Initial eight held motion phases at day75; structural frame already prepared",
        ),
        warmEightPoseCache: stats(
          warmPose,
          "128 calls cycling the same eight already rendered held phases at day75; includes returned-frame copying",
        ),
        advancingClockPlayback: stats(
          advancingPlayback,
          "128 increasing absolute-clock calls over16 cycles; fresh frame/world-contact diagnostics, with recurring held-pose material reuse; excludes UI and device rendering",
        ),
        observedPosePixelBank: {
          before: beforePlayback,
          after: afterPlayback,
          additionalHits:
            afterPlayback && beforePlayback
              ? afterPlayback.hits - beforePlayback.hits
              : null,
          additionalMisses:
            afterPlayback && beforePlayback
              ? afterPlayback.misses - beforePlayback.misses
              : null,
          withinObservedBounds: afterPlayback
            ? afterPlayback.pixels <= afterPlayback.pixelLimit &&
              afterPlayback.entries <= afterPlayback.entryLimit &&
              afterPlayback.maximumObservedPixels <= afterPlayback.pixelLimit
            : null,
        },
        poseTimes,
        declaredLimits: simulation.program.limits,
        cacheObservation: getBlueprintCacheStats(),
      };
      results.push(record);
      process.stdout.write(
        `${fixture.id}: structure p95${record.structure.p95Ms.toFixed(2)}ms; warm poses p95${record.warmEightPoseCache.p95Ms.toFixed(2)}ms\n`,
      );
    } catch (error) {
      failures.push({
        fixtureId: fixture.id,
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
      });
    }
  }
  const cacheProbes: {
    seed: string;
    size: number;
    compilations: number;
    withinDeclaredBound: boolean;
  }[] = [];
  for (let i = 0; i < 16; i++) {
    const seed = `v7-profile/cache/${i}`;
    createSimulation(fixtures[0].parts, seed);
    const observation = getBlueprintCacheStats();
    cacheProbes.push({
      seed,
      ...observation,
      withinDeclaredBound: observation.size <= 8,
    });
  }
  const after = await hashes(),
    unchanged = JSON.stringify(before) === JSON.stringify(after);
  const cachePasses = cacheProbes.filter(
    (probe) => probe.withinDeclaredBound,
  ).length;
  const result = {
    protocol: PROTOCOL,
    revision: PROTOTYPE_REVISION,
    createdAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? "unknown",
    },
    sourceHashes: before,
    captureHash: sha(JSON.stringify(before)),
    sourceUnchangedDuringCapture: unchanged,
    status:
      unchanged && failures.length === 0 ? "complete" : "invalid-or-incomplete",
    accounting: {
      plannedFixtures: fixtures.length,
      completedFixtures: results.length,
      failures: failures.length,
    },
    fixtures: results,
    failures,
    observedBlueprintBound: {
      numerator: cachePasses,
      denominator: cacheProbes.length,
      percent: (cachePasses / cacheProbes.length) * 100,
      maximumObservedSize: Math.max(...cacheProbes.map((probe) => probe.size)),
      condition:
        "Global blueprint occupancy<=8 after each of16 distinct-seed compilations",
      probes: cacheProbes,
    },
    limits: [
      "Node API timings exclude React/SVG, native rendering, physical iPhone hardware and widget scheduling.",
      "Warm pose results are cache-hit calls, not eight fresh rasterizations per screen refresh.",
      "Timing samples are repeated evaluations of fixed fixtures, not independent players or a population confidence interval.",
      "Blueprint occupancy and current-pose pixel/entry bounds are observed; structural-frame and needs replay bounds also have separate regression tests.",
    ],
  };
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(`Saved ${output}; ${result.status}\n`);
  if (!unchanged || failures.length) process.exitCode = 1;
}
main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});

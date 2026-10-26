/** Small independent performance probe; does not select genomes or change care. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  createSimulation,
  getBlueprintCacheStats,
  type PetPart,
} from "../../src/simulation";
import { STARTER_PRESETS } from "../../src/presets";
import { digest } from "./protocol";

function statistics(values: number[], condition: string) {
  const sorted = [...values].sort((a, b) => a - b);
  const rate = (budget: number) => ({
    numerator: values.filter((v) => v <= budget).length,
    denominator: values.length,
    percent: values.length
      ? (100 * values.filter((v) => v <= budget).length) / values.length
      : null,
    condition,
    budgetMs: budget,
  });
  return {
    samples: values.length,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)] ?? null,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? null,
    maxMs: sorted.at(-1) ?? null,
    within8Ms: rate(8),
    within16Ms: rate(16),
    within50Ms: rate(50),
  };
}
const dense: PetPart[] = Array.from({ length: 15 }, (_, layer) => ({
  id: `dense-${layer}`,
  kind: "body",
  name: "Dense source",
  position: { x: 0, y: 0 },
  parentId: null,
  layer,
  pixels: Array.from({ length: 1024 }, (_, i) => ({
    x: i % 32,
    y: Math.floor(i / 32),
    color: layer % 2 ? "#FFFFFF" : "#BBBBBB",
  })),
}));
const single: PetPart[] = [
  {
    id: "single",
    kind: "body",
    name: "Single source cell",
    position: { x: 0, y: 0 },
    parentId: null,
    pixels: [{ x: 15, y: 15, color: "#FFFFFF" }],
  },
];

async function main() {
  const args = process.argv.slice(2),
    index = args.indexOf("--out");
  const output = resolve(
    index >= 0
      ? args[index + 1]
      : "docs/audits/life-v6/profiling/runtime-profile.json",
  );
  const engineFiles = [
    "src/simulation/model.ts",
    "src/simulation/growth.ts",
    "src/simulation/development.ts",
    "src/simulation/material.ts",
    "src/simulation/locomotion.ts",
    "src/needs/simulation.ts",
    "src/needs/timeline.ts",
    "src/presets.ts",
  ];
  const hashes = Object.fromEntries(
    await Promise.all(
      engineFiles.map(async (path) => [path, digest(await readFile(path))]),
    ),
  );
  const fixtures = [
    ...STARTER_PRESETS.map((p) => ({ id: p.id, parts: p.parts })),
    { id: "single-pixel", parts: single },
    { id: "dense-15360-source-cells", parts: dense },
  ];
  const results = [];
  for (const fixture of fixtures) {
    const sim = createSimulation(fixture.parts, "life-v6-performance-01");
    const structural: number[] = [],
      poses: number[] = [];
    // Unique ages cannot hit the exact-frame cache. Includes needs replay and raster work.
    for (let sample = 0; sample < 32; sample++) {
      const age = (240 * (sample + 0.37)) / 32,
        begin = performance.now();
      sim.frameAt(age, { time: 0, action: "idle" });
      structural.push(performance.now() - begin);
    }
    const frame = sim.frameAt(75, { time: 0, action: "move" });
    const pace = Math.max(0.01, frame.motionPace);
    // More than12 nonrepeating phase/blink combinations avoid exact-frame-cache hits.
    // Age stays fixed, exercising the reused structural state and rest-pixel masks.
    for (let sample = 0; sample < 128; sample++) {
      const begin = performance.now();
      sim.frameAt(75, { time: (sample + 0.1) / (8 * pace), action: "move" });
      poses.push(performance.now() - begin);
    }
    results.push({
      fixture: fixture.id,
      sourceParts: fixture.parts.length,
      sourceCells: fixture.parts.reduce((n, p) => n + p.pixels.length, 0),
      structural: statistics(
        structural,
        "Node frame generation at32 unique ages; idle t0; includes needs replay; excludes UI/native",
      ),
      pose: statistics(
        poses,
        "Node pose generation at day75 with reused structure;128 distinct explicit phase/blink times; excludes UI/native",
      ),
      declaredLimits: sim.program.limits,
    });
  }
  const cacheSamples = [];
  for (let i = 0; i < 13; i++) {
    createSimulation(STARTER_PRESETS[0].parts, `life-v6-cache-${i}`);
    cacheSamples.push(getBlueprintCacheStats());
  }
  const beforeHit = getBlueprintCacheStats();
  createSimulation(STARTER_PRESETS[0].parts, "life-v6-cache-12");
  const afterHit = getBlueprintCacheStats();
  const finalHashes = Object.fromEntries(
    await Promise.all(
      engineFiles.map(async (path) => [path, digest(await readFile(path))]),
    ),
  );
  if (digest(finalHashes) !== digest(hashes))
    throw new Error(
      "Engine changed during profiling; rerun after edits finish.",
    );
  const result = {
    version: "life-v6-profile1",
    createdAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform },
    engineHashes: hashes,
    engineHash: digest(hashes),
    fixtures: results,
    observedBlueprintCache: {
      samples: cacheSamples,
      maximumSize: Math.max(...cacheSamples.map((s) => s.size)),
      bound: 8,
      withinBound: {
        numerator: cacheSamples.filter((s) => s.size <= 8).length,
        denominator: cacheSamples.length,
        percent:
          (100 * cacheSamples.filter((s) => s.size <= 8).length) /
          cacheSamples.length,
        condition:
          "After13 distinct additional genotypes in this profiling process",
      },
      mostRecentBlueprintReused:
        beforeHit.compilations === afterHit.compilations,
    },
    limitations: [
      "Node process measurements are not iPhone frame-rate measurements.",
      "Private per-simulation caches have no public occupancy counters; their declared limits are reported separately, not presented as measured occupancy.",
      "Source/mask WeakMap residency depends on garbage collection; no heap-residency claim is made.",
      "This fixed-seed performance probe is separate from genetic-diversity evaluation.",
    ],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify(
      {
        output,
        fixtures: results.map((r) => ({
          fixture: r.fixture,
          structuralP50: r.structural.p50Ms,
          structuralP95: r.structural.p95Ms,
          poseP50: r.pose.p50Ms,
          poseP95: r.pose.p95Ms,
        })),
        blueprintCache: result.observedBlueprintCache,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

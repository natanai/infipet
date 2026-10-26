/** Exploratory first-transition diagnosis. This never certifies a whole life. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { RETRO_PRESETS } from "../src/retro";
import { createSimulation } from "../src/simulation";
import { compileGenome } from "../src/simulation/genome";
import { compileSomaticGrowth } from "../src/simulation/somatic-growth";
import { compileSurfaceExpression } from "../src/simulation/surface-expression";
import {
  createGame,
  advanceGame,
  deriveCareTimeline,
  deriveDevelopmentContext,
  HOUR,
} from "../src/gameplay";
import { PROTOTYPE_REVISION } from "../src/pet-format";
import { cohortSeed } from "./retro-audit/search";
import {
  currentVersions,
  engineSourceHash,
  digest,
} from "./retro-audit/engine";
import {
  compareBitmaps,
  pixelsToBitmap,
  meetsNearExactGate,
  compareRelativeDimensions,
  METRIC_VERSION,
} from "./retro-audit/metrics";
import type { RetroCatalog } from "./retro-audit/types";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : (args[i + 1] ?? fallback);
};
const count = Number(option("--seed-count", "100000"));
const start = Number(option("--seed-start", "0"));
if (
  !Number.isSafeInteger(count) ||
  count < 1 ||
  count > 1_000_000 ||
  !Number.isSafeInteger(start) ||
  start < 0
)
  throw new Error("Specify an explicit bounded neutral seed interval.");
const raw = readFileSync("data/retro-reference/catalog.json", "utf8");
const catalog = JSON.parse(raw) as RetroCatalog;
const device = catalog.devices.find((d) => d.id === option("--device", "p1"));
if (!device) throw new Error("Unknown reference device.");
const source = RETRO_PRESETS.find(
  (p) => p.referenceId === device.rootCharacterId,
)!;
const childId = catalog.edges.find(
  (edge) => edge.from === source.referenceId,
)!.to;
const child = catalog.characters.find((c) => c.id === childId)!;
const birth = catalog.characters.find((c) => c.id === source.referenceId)!;
if (!source || !child.target || !birth.target)
  throw new Error("Missing visible source or comparison artwork.");
const sourceHash = engineSourceHash();
let rendered = 0,
  visualPasses = 0,
  sizePasses = 0;
let best: Record<string, unknown> | null = null;
let bestIoU = -1;
let bestSizeEligible: Record<string, unknown> | null = null;
let bestSizeIoU = -1;
let sizeEligible = 0;
const started = Date.now();
for (let index = start; index < start + count; index++) {
  const seed = cohortSeed(index),
    genome = compileGenome(seed);
  if (
    genome.lifeProgram.kind !== "direct" ||
    !compileSomaticGrowth(genome).enabled ||
    !compileSurfaceExpression(genome).enabled
  )
    continue;
  const game = advanceGame(createGame(seed, "infant", 9 * HOUR), 11 * HOUR);
  const simulation = createSimulation(source.parts, seed, "infant", {
    needTimeline: deriveCareTimeline(game),
    liveContext: deriveDevelopmentContext(game),
  });
  const frame = simulation.frameAt(2 / 24, { time: 0, action: "idle" });
  const metrics = compareBitmaps(pixelsToBitmap(frame.pixels), child.target);
  const dimensions = compareRelativeDimensions(
    pixelsToBitmap(frame.pixels),
    pixelsToBitmap(simulation.frameAt(0, { time: 0 }).pixels),
    child.target,
    birth.target,
  );
  rendered++;
  if (dimensions.passed) sizeEligible++;
  if (meetsNearExactGate(metrics)) {
    visualPasses++;
    if (dimensions.passed) sizePasses++;
  }
  if (metrics.silhouetteIoU > bestIoU) {
    bestIoU = metrics.silhouetteIoU;
    best = {
      index,
      seed,
      metrics,
      relativeDimensions: dimensions,
      world: frame.pixels,
      parts: frame.parts,
    };
  }
  if (dimensions.passed && metrics.silhouetteIoU > bestSizeIoU) {
    bestSizeIoU = metrics.silhouetteIoU;
    bestSizeEligible = {
      index,
      seed,
      metrics,
      relativeDimensions: dimensions,
      world: frame.pixels,
      parts: frame.parts,
    };
  }
  if (rendered % 1000 === 0)
    console.log(
      JSON.stringify({
        examined: index - start + 1,
        rendered,
        visualPasses,
        sizePasses,
        bestIoU,
        elapsedSeconds: (Date.now() - started) / 1000,
      }),
    );
}
if (engineSourceHash() !== sourceHash)
  throw new Error(
    "Core changed during the exploratory probe; no report published.",
  );
const directory = `docs/audits/${PROTOTYPE_REVISION}/probes`;
mkdirSync(directory, { recursive: true });
const report = {
  scope:
    "First combined-game child transition only; not a full-life or native-reference witness",
  generatedAt: new Date().toISOString(),
  versions: currentVersions(),
  metric: METRIC_VERSION,
  engineSourceHash: sourceHash,
  catalogByteHash: createHash("sha256").update(raw).digest("hex"),
  sourceId: source.referenceId,
  sourceHash: digest(source.parts),
  targetId: childId,
  targetStatus: child.targetStatus,
  fixedHour: 2,
  animationTime: 0,
  carePattern:
    "No commands before two chronological hours; ordinary active simulation",
  seeds: {
    start,
    count,
    algorithm: "shared infipet-retro-cohort-v1 enumeration",
  },
  inheritedFilter:
    "direct kind plus enabled somatic and surface potentials; no target data in runtime",
  rendered,
  visualPasses,
  visualAndRelativeSizePasses: sizePasses,
  sizeEligible,
  bestSizeEligible,
  fullLifeAcceptance: false,
  independentVisualAcceptance: false,
  best,
};
const file = `${directory}/${device.id}-first-child-${start}-${count}.json`;
writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    file,
    rendered,
    visualPasses,
    sizePasses,
    bestIoU,
    elapsedSeconds: (Date.now() - started) / 1000,
  }),
);

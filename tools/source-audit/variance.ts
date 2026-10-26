/** A balanced machine-only panel. It does not grant a visual evolution/descent pass. */
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { createSimulation } from "../../src/simulation";
import type { NeedKeyframe } from "../../src/needs";
import {
  describeFrame,
  frameHash,
  varianceAttribution,
  type FrameDescriptor,
} from "../audit/metrics";
import { primarySources } from "./fixtures";
import { inheritedIdentity } from "./metrics";
import {
  HISTORIES,
  METRIC_VERSION,
  NEEDS,
  SEEDS,
  digest,
  textOrder,
} from "./protocol";

export const VARIANCE_PROTOCOL = "source-variance-v7-panel1";
export const VARIANCE_AGES = [75, 120];
export const MODERATE_HISTORIES: typeof HISTORIES = [
  HISTORIES[0],
  ...NEEDS.flatMap((needId) =>
    [0.5, 1].map((fulfillment) => ({
      id: `${needId}-${Math.round(fulfillment * 100)}`,
      label: `${needId} ${Math.round(fulfillment * 100)}%; other needs75%`,
      keyframes: [{ needId, tick: 0, fulfillment }],
    })),
  ),
];
/** Neutral appears in both panel definitions but is evaluated only once. */
export const VARIANCE_HISTORIES = [
  ...MODERATE_HISTORIES,
  ...HISTORIES.filter((h) => h.id !== "neutral"),
];
type Plan = {
  id: string;
  sourceId: string;
  seed: string;
  seedIndex: number;
  historyId: string;
  keyframes: NeedKeyframe[];
};
type Result = {
  plan: Plan;
  genomeHash: string;
  inheritedHash: string | null;
  frames: {
    age: number;
    hash: string;
    descriptor: FrameDescriptor;
    elapsedMs: number;
    valid: boolean;
  }[];
  error?: string;
};
type Manifest = {
  protocolVersion: string;
  metricVersion: string;
  runId: string;
  createdAt: string;
  sourceHashes: Record<string, string>;
  captureHash: string;
  sources: ReturnType<typeof primarySources>;
  seeds: string[];
  histories: typeof HISTORIES;
  panels: { id: string; historyIds: string[]; conditions: string }[];
  ages: number[];
  plans: Plan[];
  expected: {
    cases: number;
    uniqueFrames: number;
    moderatePanelObservations: number;
    severePanelObservations: number;
    sharedNeutralFrames: number;
  };
  runtime: { node: string; platform: string };
};
const exists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};
async function save(path: string, value: unknown) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const bytes = Buffer.from(
    JSON.stringify(value, null, path.endsWith(".gz") ? 0 : 2),
  );
  await writeFile(
    path + ".tmp",
    path.endsWith(".gz") ? gzipSync(bytes) : bytes,
  );
  await rename(path + ".tmp", path);
}
async function load<T>(path: string): Promise<T> {
  const b = await readFile(path);
  return JSON.parse(
    (path.endsWith(".gz") ? gunzipSync(b) : b).toString("utf8"),
  );
}
async function walk(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? walk(join(path, e.name))
          : Promise.resolve([join(path, e.name)]),
      ),
    )
  )
    .flat()
    .filter((p) => /\.(ts|tsx|json)$/.test(p))
    .sort(textOrder);
}
async function hashes() {
  const files = [
    ...(await walk("src/simulation")),
    ...(await walk("src/needs")),
    "src/presets.ts",
    "tools/audit/metrics.ts",
    "tools/source-audit/metrics.ts",
    "tools/source-audit/protocol.ts",
    "tools/source-audit/fixtures.ts",
    "tools/source-audit/variance.ts",
  ];
  return Object.fromEntries(
    await Promise.all(
      files
        .sort(textOrder)
        .map(async (file) => [
          file.replaceAll("\\", "/"),
          digest(await readFile(file)),
        ]),
    ),
  );
}
export function variancePlan() {
  const sources = primarySources("full"),
    seeds = SEEDS.slice(0, 4);
  return sources.flatMap((source) =>
    seeds.flatMap((seed, seedIndex) =>
      VARIANCE_HISTORIES.map((history) => ({
        id: `${source.id}__s${String(seedIndex + 1).padStart(2, "0")}__${history.id}`,
        sourceId: source.id,
        seed,
        seedIndex,
        historyId: history.id,
        keyframes: history.keyframes,
      })),
    ),
  );
}
export function fraction(ss: ReturnType<typeof varianceAttribution>) {
  return {
    seed: ss.total ? ss.seed / ss.total : null,
    history: ss.total ? ss.history / ss.total : null,
    interaction: ss.total ? ss.interaction / ss.total : null,
  };
}
export function panelFor(
  sourceId: string,
  age: number,
  historyIds: string[],
  results: Result[],
  seeds = SEEDS.slice(0, 4),
) {
  const grid = seeds.map((seed) =>
    historyIds.map(
      (history) =>
        results
          .find(
            (r) =>
              r.plan.sourceId === sourceId &&
              r.plan.seed === seed &&
              r.plan.historyId === history,
          )
          ?.frames.find((f) => f.age === age)?.descriptor,
    ),
  );
  const expected = seeds.length * historyIds.length,
    actual = grid.flat().filter(Boolean).length;
  if (actual !== expected)
    return {
      sourceId,
      age,
      expected,
      actual,
      available: false as const,
      reason:
        "Incomplete balanced panel; no imputation or seed-dominance classification",
    };
  const sumsOfSquares = varianceAttribution(grid as FrameDescriptor[][]),
    proportions = fraction(sumsOfSquares);
  return {
    sourceId,
    age,
    expected,
    actual,
    available: true as const,
    sumsOfSquares,
    proportions,
    informative: sumsOfSquares.total > 1e-12,
    seedLargest:
      sumsOfSquares.total > 1e-12
        ? sumsOfSquares.seed >= sumsOfSquares.history &&
          sumsOfSquares.seed >= sumsOfSquares.interaction
        : null,
    seedExceedsAllCare:
      sumsOfSquares.total > 1e-12
        ? sumsOfSquares.seed > sumsOfSquares.history + sumsOfSquares.interaction
        : null,
  };
}
function summary(manifest: Manifest, results: Result[]) {
  const panels = manifest.panels.map((panel) => {
    const cells = manifest.sources.flatMap((source) =>
      manifest.ages.map((age) =>
        panelFor(source.id, age, panel.historyIds, results, manifest.seeds),
      ),
    );
    const informative = cells.filter((c) => c.available && c.informative);
    const denominator = manifest.sources.length * manifest.ages.length;
    const largest = informative.filter(
      (c) => c.available && c.seedLargest,
    ).length;
    return {
      ...panel,
      cells,
      seedLargest: {
        numerator: largest,
        denominator,
        percent: denominator ? (100 * largest) / denominator : null,
        condition: `within-source ${panel.id} balanced4-seed panel`,
        age: "day75 and120, equally weighted source/age cells",
      },
      informativeCells: informative.length,
      equallyWeightedProportions: informative.length
        ? {
            seed:
              informative.reduce(
                (n, c) => n + (c.available ? (c.proportions.seed ?? 0) : 0),
                0,
              ) / informative.length,
            history:
              informative.reduce(
                (n, c) => n + (c.available ? (c.proportions.history ?? 0) : 0),
                0,
              ) / informative.length,
            interaction:
              informative.reduce(
                (n, c) =>
                  n + (c.available ? (c.proportions.interaction ?? 0) : 0),
                0,
              ) / informative.length,
          }
        : null,
    };
  });
  const frames = results.flatMap((r) => r.frames);
  return {
    protocolVersion: manifest.protocolVersion,
    metricVersion: manifest.metricVersion,
    captureHash: manifest.captureHash,
    expected: manifest.expected,
    actual: {
      cases: results.length,
      uniqueFrames: frames.length,
      failures: results.filter((r) => r.error).length,
      validFrames: frames.filter((f) => f.valid).length,
    },
    panels,
    geneticAgreement: manifest.sources.flatMap((source) =>
      manifest.seeds.map((seed) => {
        const cohort = results.filter(
          (r) =>
            r.plan.sourceId === source.id && r.plan.seed === seed && !r.error,
        );
        return {
          sourceId: source.id,
          seed,
          expectedHistories: manifest.histories.length,
          actualHistories: cohort.length,
          genomeHashes: [...new Set(cohort.map((r) => r.genomeHash))],
          inheritedHashes: [...new Set(cohort.map((r) => r.inheritedHash))],
          unchanged:
            cohort.length === manifest.histories.length &&
            new Set(cohort.map((r) => r.genomeHash)).size === 1,
        };
      }),
    ),
    failures: results
      .filter((r) => r.error)
      .map((r) => ({ caseId: r.plan.id, error: r.error })),
    limitations: [
      "Four fixed raw seeds per source are an exploratory cohort, not a population genetic-variance estimate.",
      "Sums of squares use normalized regional proportions plus rotation-invariant radial occupancy, excluding size, pigments, movement and whole-creature pose.",
      "History values50%/100% are the requested moderate comparison panel; Safety0% and recovery appear only in the separately reported severe panel.",
      "Neutral observations are shared between panels and counted once in unique-frame accounting.",
      "No rendered image, actual-image review, or perceived-distinctiveness score is produced by this machine-only runner.",
      "Descriptor variance is conditional on the selected history levels, ages and four seeds. Largest component is not proof that any particular player will find a pet distinctive.",
    ],
  };
}
function report(
  manifest: Manifest,
  s: ReturnType<typeof summary>,
  unchanged: boolean,
) {
  const number = (v: number | null | undefined) =>
    v === null || v === undefined ? "unavailable" : `${(v * 100).toFixed(1)}%`;
  return `# Moderate-care genetic influence — ${manifest.runId}\n\n**Capture source verification: ${unchanged ? "unchanged across capture" : "INVALID frozen baseline: source files changed during capture"}.**\n\nMachine-only protocol ${manifest.protocolVersion}, metrics ${manifest.metricVersion}; capture hash \`${manifest.captureHash}\`. No visual gate is passed by this report.\n\n[Manifest](manifest.json) · [Metrics and raw sums of squares](metrics.json) · [CSV](variance.csv) · [Verification](capture-source-verification.json)\n\n${s.actual.cases}/${manifest.expected.cases} cases, ${s.actual.uniqueFrames}/${manifest.expected.uniqueFrames} unique frames, ${s.actual.failures} retained failures. Moderate panel: ${manifest.expected.moderatePanelObservations} planned observations. Separate severe panel: ${manifest.expected.severePanelObservations}. Exactly ${manifest.expected.sharedNeutralFrames} neutral observations are shared; they are not independently evaluated or double-counted as unique evidence.\n\n| Panel | Source / age | Seed SS / total | History SS / total | Interaction SS / total | Seed largest? | Panel observations |\n|---|---|---:|---:|---:|---|---:|\n${s.panels.flatMap((p) => p.cells.map((c) => `| ${p.id} | ${c.sourceId} / ${c.age} | ${c.available ? number(c.proportions.seed) : "unavailable"} | ${c.available ? number(c.proportions.history) : "unavailable"} | ${c.available ? number(c.proportions.interaction) : "unavailable"} | ${c.available && c.seedLargest !== null ? (c.seedLargest ? "Yes" : "No") : "Unavailable"} | ${c.actual}/${c.expected} |`)).join("\n")}\n\n${s.panels.map((p) => `${p.id}: seed is the largest component in ${p.seedLargest.numerator}/${p.seedLargest.denominator} planned within-source/age cells (${p.seedLargest.percent?.toFixed(1)}%). Equally weighted component fractions: seed ${number(p.equallyWeightedProportions?.seed)}, history ${number(p.equallyWeightedProportions?.history)}, interaction ${number(p.equallyWeightedProportions?.interaction)}. Conditions: ${p.conditions}.`).join("\n\n")}\n\nComponent percentages divide raw SS by total SS; all numerator/denominator SS values are in JSON/CSV. The equally weighted summary averages within-source/age fractions rather than mixing species differences. Missing or uninformative cells remain visible and do not become successes. This descriptive four-seed test does not supply population confidence intervals.\n\n${s.limitations.map((l) => `- ${l}`).join("\n")}\n\nRetained failures: ${s.failures.length ? JSON.stringify(s.failures) : "none"}.\n`;
}
async function main() {
  const args = process.argv.slice(2),
    at = args.indexOf("--run"),
    runId = at >= 0 ? args[at + 1] : "v7-variance-001";
  if (!/^[a-z\d][a-z\d-]{0,70}$/.test(runId)) throw new Error("Unsafe run ID");
  const dir = resolve("docs/audits/life-v7/variance", runId),
    sourceHashes = await hashes();
  let manifest: Manifest = {
    protocolVersion: VARIANCE_PROTOCOL,
    metricVersion: METRIC_VERSION,
    runId,
    createdAt: new Date().toISOString(),
    sourceHashes,
    captureHash: digest(sourceHashes),
    sources: primarySources("full"),
    seeds: SEEDS.slice(0, 4),
    histories: VARIANCE_HISTORIES,
    panels: [
      {
        id: "moderate",
        historyIds: MODERATE_HISTORIES.map((h) => h.id),
        conditions:
          "Neutral75%; six needs individually50% and100%, other needs unchanged",
      },
      {
        id: "severe",
        historyIds: HISTORIES.map((h) => h.id),
        conditions:
          "Neutral; Safety0%; Safety0→100 day75; Rest/Fitness jointly100%",
      },
    ],
    ages: VARIANCE_AGES,
    plans: variancePlan(),
    expected: {
      cases: 384,
      uniqueFrames: 768,
      moderatePanelObservations: 624,
      severePanelObservations: 192,
      sharedNeutralFrames: 48,
    },
    runtime: { node: process.version, platform: process.platform },
  };
  if (await exists(join(dir, "manifest.json"))) {
    const prior = await load<Manifest>(join(dir, "manifest.json"));
    if (
      digest({ ...prior, createdAt: "" }) !==
      digest({ ...manifest, createdAt: "" })
    )
      throw new Error("Frozen variance manifest differs; select a new --run");
    manifest = prior;
  } else await save(join(dir, "manifest.json"), manifest);
  if (args.includes("--prepare")) {
    console.log(
      JSON.stringify({
        preparedOnly: true,
        runId,
        expected: manifest.expected,
      }),
    );
    return;
  }
  const results: Result[] = [];
  for (const plan of manifest.plans) {
    const path = join(dir, "data", plan.id + ".json.gz");
    let result: Result;
    if (await exists(path)) {
      result = await load<Result>(path);
      if (digest(result.plan) !== digest(plan))
        throw new Error(`Case provenance mismatch ${plan.id}`);
    } else {
      result = { plan, genomeHash: "", inheritedHash: null, frames: [] };
      try {
        const source = manifest.sources.find((s) => s.id === plan.sourceId)!,
          sim = createSimulation(source.parts, plan.seed, "infant", {
            needTimeline: plan.keyframes,
          });
        if (Number(sim.program.version) !== 7)
          throw new Error("Variance runner requires algorithm7");
        result.genomeHash = digest(sim.genome);
        result.inheritedHash = inheritedIdentity(sim.genome, sim.program).hash;
        for (const age of VARIANCE_AGES) {
          const begin = performance.now(),
            frame = sim.frameAt(age, { action: "idle", time: 0 }),
            elapsedMs = performance.now() - begin;
          result.frames.push({
            age,
            hash: frameHash(frame),
            descriptor: describeFrame(frame),
            elapsedMs,
            valid: frame.pixels.every(
              (p) =>
                Number.isInteger(p.x) &&
                Number.isInteger(p.y) &&
                p.x >= 0 &&
                p.y >= 0 &&
                p.x < 64 &&
                p.y < 64,
            ),
          });
        }
      } catch (error) {
        result.error =
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error);
      }
      await save(path, result);
    }
    results.push(result);
    await save(join(dir, "checkpoint.json"), {
      captureHash: manifest.captureHash,
      completed: results.length,
      expectedCases: manifest.expected.cases,
      frames: results.reduce((n, r) => n + r.frames.length, 0),
      failures: results.filter((r) => r.error).length,
    });
    if (results.length % 16 === 0 || result.error)
      console.log(`${results.length}/${manifest.plans.length} cases`);
  }
  const after = await hashes(),
    unchanged = digest(after) === manifest.captureHash,
    s = summary(manifest, results);
  await save(join(dir, "capture-source-verification.json"), {
    captureHash: manifest.captureHash,
    currentHash: digest(after),
    unchanged,
  });
  await save(join(dir, "metrics.json"), s);
  await writeFile(join(dir, "REPORT.md"), report(manifest, s, unchanged));
  await writeFile(
    join(dir, "variance.csv"),
    [
      "panel,source,age,expected,actual,seedSS,historySS,interactionSS,totalSS,seedFraction,historyFraction,interactionFraction,seedLargest",
      ...s.panels.flatMap((p) =>
        p.cells.map((c) =>
          [
            p.id,
            c.sourceId,
            c.age,
            c.expected,
            c.actual,
            c.available ? c.sumsOfSquares.seed : "",
            c.available ? c.sumsOfSquares.history : "",
            c.available ? c.sumsOfSquares.interaction : "",
            c.available ? c.sumsOfSquares.total : "",
            c.available ? c.proportions.seed : "",
            c.available ? c.proportions.history : "",
            c.available ? c.proportions.interaction : "",
            c.available ? c.seedLargest : "",
          ].join(","),
        ),
      ),
    ].join("\n"),
  );
  console.log(
    JSON.stringify(
      {
        runId,
        actual: s.actual,
        panels: s.panels.map((p) => ({
          id: p.id,
          seedLargest: p.seedLargest,
          proportions: p.equallyWeightedProportions,
        })),
        captureSourceUnchanged: unchanged,
        report: join(dir, "REPORT.md"),
      },
      null,
      2,
    ),
  );
  if (
    !unchanged ||
    s.actual.failures ||
    s.actual.uniqueFrames !== manifest.expected.uniqueFrames
  )
    process.exitCode = 1;
}
if (
  process.argv[1]?.replaceAll("\\", "/").endsWith("/source-audit/variance.ts")
)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

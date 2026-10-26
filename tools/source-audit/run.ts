/** V7 evidence is separate from the immutable v6 audit. Default: only 204 proof images. */
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
import { createSimulation, flattenAnatomy } from "../../src/simulation";
import { frameHash } from "../audit/metrics";
import {
  rasterPixels,
  writePng,
  readPng,
  blitRgba,
  scaleRgba,
  drawBitmapText,
} from "../audit/presentation";
import {
  AGES,
  CARE_OFFSETS,
  CARE_ONSETS,
  HISTORIES,
  INTERIOR_FRACTIONS,
  METRIC_VERSION,
  NEEDS,
  PROTOCOL_VERSION,
  SEEDS,
  digest,
  parseCareSeeds,
  stageCounts,
  textOrder,
  type AuditStage,
  type CareSeedCount,
  type ProbeSet,
} from "./protocol";
import {
  counterfactualSources,
  primarySources,
  PROOF_SOURCE_ID,
} from "./fixtures";
import {
  canonicalPixels,
  inheritedIdentity,
  sample,
  summarize,
} from "./metrics";
import { reviewSummary, reviewTemplates, validateReviews } from "./reviews";
import { gallery } from "./gallery";
import type { CasePlan, CaseResult, Manifest, Review, Tile } from "./types";
import { report, compareRuns } from "./report";
import {
  authoredCore,
  authoredRegions,
  coreDiagnosticId,
  regionalDiagnosticId,
} from "./core";
import {
  acceptanceBanner,
  acceptanceStatus,
  type HumanFeedback,
} from "./acceptance";

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
    path.endsWith(".gz") ? gzipSync(bytes, { level: 6 }) : bytes,
  );
  await rename(path + ".tmp", path);
}
async function load<T>(path: string): Promise<T> {
  const bytes = await readFile(path);
  return JSON.parse(
    (path.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8"),
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
    ...(await walk("tools/source-audit")),
    "src/presets.ts",
    "src/pet-format.ts",
    "tools/audit/metrics.ts",
    "tools/audit/presentation.ts",
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
export function plans(
  stage: AuditStage,
  probes: ProbeSet,
  sources: Manifest["sources"],
  careSeedCount: CareSeedCount = 2,
): CasePlan[] {
  const counts = stageCounts(stage, probes, careSeedCount),
    rows: CasePlan[] = [];
  for (const source of sources.filter((s) => !s.variant))
    for (let seedIndex = 0; seedIndex < counts.seeds; seedIndex++)
      for (const h of HISTORIES.slice(0, counts.histories))
        rows.push({
          id: `${source.id}__s${String(seedIndex + 1).padStart(2, "0")}__${h.id}`,
          group: "primary",
          sourceId: source.id,
          seed: SEEDS[seedIndex],
          seedIndex,
          historyId: h.id,
          keyframes: h.keyframes,
          ages: [...AGES],
        });
  for (const source of sources.filter((s) => s.variant))
    for (let seedIndex = 0; seedIndex < 2; seedIndex++)
      rows.push({
        id: `${source.id}__s${String(seedIndex + 1).padStart(2, "0")}`,
        group: "source",
        sourceId: source.id,
        seed: SEEDS[seedIndex],
        seedIndex,
        historyId: "neutral",
        keyframes: [],
        ages: [...AGES],
        expectation: source.expectations[0],
      });
  if (["care", "all"].includes(probes))
    for (let seedIndex = 0; seedIndex < careSeedCount; seedIndex++)
      for (const onset of CARE_ONSETS) {
        const root = `care__s${String(seedIndex + 1).padStart(2, "0")}__onset${onset}`;
        rows.push({
          id: root + "__control",
          group: "care",
          sourceId: PROOF_SOURCE_ID,
          seed: SEEDS[seedIndex],
          seedIndex,
          historyId: "neutral",
          keyframes: [],
          ages: CARE_OFFSETS.map((d) => onset + d),
          onset,
        });
        for (const needId of NEEDS)
          for (const fulfillment of [0, 1])
            rows.push({
              id: `${root}__${needId}__${fulfillment}`,
              group: "care",
              sourceId: PROOF_SOURCE_ID,
              seed: SEEDS[seedIndex],
              seedIndex,
              historyId: `${needId}-${fulfillment}-at-${onset}`,
              keyframes: [{ needId, tick: onset * 24, fulfillment }],
              ages: CARE_OFFSETS.map((d) => onset + d),
              needId,
              onset,
              fulfillment,
              expectation:
                "Recorded mediator changes and actual pixels are separate evidence; no visual response claimed before review.",
            });
      }
  return rows;
}
async function prepare(
  dir: string,
  runId: string,
  stage: AuditStage,
  probes: ProbeSet,
  careSeedCount: CareSeedCount = 2,
) {
  const sources = primarySources(stage);
  if (["source", "all"].includes(probes))
    sources.push(
      ...counterfactualSources(sources.find((s) => s.id === PROOF_SOURCE_ID)!),
    );
  const sourceHashes = await hashes(),
    manifest: Manifest = {
      protocolVersion: PROTOCOL_VERSION,
      metricVersion: METRIC_VERSION,
      runId,
      stage,
      probes,
      careSeedCount,
      createdAt: new Date().toISOString(),
      sourceHashes,
      captureHash: digest(sourceHashes),
      sources,
      seeds: SEEDS.slice(0, stageCounts(stage).seeds),
      histories: HISTORIES.slice(0, stageCounts(stage).histories),
      cases: plans(stage, probes, sources, careSeedCount),
      expected: stageCounts(stage, probes, careSeedCount),
      runtime: { node: process.version, platform: process.platform },
    };
  if (manifest.cases.length !== manifest.expected.cases)
    throw new Error("Protocol case count mismatch");
  if (await exists(join(dir, "manifest.json"))) {
    const prior = await load<Manifest>(join(dir, "manifest.json"));
    for (const key of [
      "protocolVersion",
      "metricVersion",
      "stage",
      "probes",
      "careSeedCount",
      "captureHash",
      "sources",
      "cases",
    ] as const)
      if (JSON.stringify(prior[key]) !== JSON.stringify(manifest[key]))
        throw new Error(
          `Frozen manifest differs at ${key}; choose a new --run. Existing evidence is untouched.`,
        );
    return prior;
  }
  await save(join(dir, "manifest.json"), manifest);
  await save(join(dir, "sources.json"), sources);
  await save(join(dir, "case-plan.json"), manifest.cases);
  return manifest;
}
function caseViewCount(plan: CasePlan, stage: AuditStage) {
  return plan.group === "primary" && stage !== "full" ? 51 : plan.ages.length;
}
async function sources(dir: string, manifest: Manifest) {
  for (const source of manifest.sources) {
    await mkdir(join(dir, "sources"), { recursive: true });
    await writePng(
      join(dir, "sources", source.id + ".png"),
      64,
      64,
      rasterPixels(
        flattenAnatomy(source.parts).map((p) => ({
          ...p,
          x: p.x + 16,
          y: p.y + 16,
        })),
      ),
    );
    await writePng(
      join(dir, "sources", source.id + "-core.png"),
      64,
      64,
      rasterPixels(authoredCore(source.parts)),
    );
    await writePng(
      join(dir, "sources", source.id + "-regions.png"),
      64,
      64,
      rasterPixels(authoredRegions(source.parts)),
    );
  }
}
async function collect(dir: string, manifest: Manifest, reportOnly: boolean) {
  if (reportOnly) return readFrozenCases(dir, manifest);
  const results: CaseResult[] = [];
  let scheduledIndex = 0;
  for (const plan of manifest.cases) {
    const file = join(dir, "data", plan.id + ".json.gz");
    let result: CaseResult;
    if (await exists(file)) {
      result = await load<CaseResult>(file);
      if (digest(result.plan) !== digest(plan))
        throw new Error(`Case provenance mismatch ${plan.id}`);
    } else {
      if (reportOnly)
        throw new Error(
          `Missing frozen case ${plan.id}; report-only never collects`,
        );
      result = {
        plan,
        genome: null,
        program: null,
        genomeHash: "",
        inheritedHash: null,
        inheritedPath: null,
        birthFidelity: false,
        seekAgreement: false,
        futureEventCausality: false,
        views: [],
      };
      try {
        const source = manifest.sources.find((s) => s.id === plan.sourceId)!;
        const sim = createSimulation(source.parts, plan.seed, "infant", {
          needTimeline: plan.keyframes,
        });
        if (Number(sim.program.version) !== 7)
          throw new Error(
            `V7 engine not ready: public program.version=${sim.program.version}. No v6 frames accepted as v7 evidence.`,
          );
        result.genome = sim.genome;
        result.program = sim.program;
        result.genomeHash = digest(sim.genome);
        const identity = inheritedIdentity(sim.genome, sim.program);
        result.inheritedHash = identity.hash;
        result.inheritedPath = identity.path;
        result.birthFidelity =
          digest(canonicalPixels(sim.frameAt(0).pixels)) ===
          digest(
            canonicalPixels(
              flattenAnatomy(source.parts).map((p) => ({
                ...p,
                x: p.x + 16,
                y: p.y + 16,
              })),
            ),
          );
        let offset = 0;
        for (const age of plan.ages)
          result.views.push(
            sample(
              sim,
              source.parts,
              `${plan.id}__d${age}`,
              plan.group === "primary" ? "endpoint" : plan.group,
              age,
              0,
              scheduledIndex + ++offset,
            ),
          );
        if (plan.group === "primary" && manifest.stage !== "full") {
          for (let i = 0; i < 3; i++)
            for (let j = 0; j < INTERIOR_FRACTIONS.length; j++) {
              const age =
                AGES[i] + (AGES[i + 1] - AGES[i]) * INTERIOR_FRACTIONS[j];
              result.views.push(
                sample(
                  sim,
                  source.parts,
                  `${plan.id}__t${i}-${j}`,
                  "interior",
                  age,
                  0,
                  scheduledIndex + ++offset,
                  { fromAge: AGES[i], toAge: AGES[i + 1] },
                ),
              );
            }
          for (const age of AGES) {
            const pace = Math.max(
              0.01,
              sim.frameAt(age, { time: 0, action: "move" }).motionPace,
            );
            for (let phase = 0; phase < 8; phase++)
              result.views.push(
                sample(
                  sim,
                  source.parts,
                  `${plan.id}__d${age}__p${phase}`,
                  "pose",
                  age,
                  phase / (8 * pace) + 1e-8,
                  scheduledIndex + ++offset,
                  { phase },
                ),
              );
          }
        }
        const early = frameHash(
          sim.frameAt(17.375, { time: 0, action: "idle" }),
        );
        for (const age of [240, 0, 75, 2, 120])
          sim.frameAt(age, { time: 0, action: "idle" });
        result.seekAgreement =
          early === frameHash(sim.frameAt(17.375, { time: 0, action: "idle" }));
        const future = createSimulation(source.parts, plan.seed, "infant", {
          needTimeline: [
            ...plan.keyframes,
            { needId: "security", tick: 200 * 24, fulfillment: 0 },
          ],
        });
        result.futureEventCausality =
          early ===
          frameHash(future.frameAt(17.375, { time: 0, action: "idle" }));
        if (plan.onset && plan.needId) {
          const before = plan.onset - 1 / 48,
            control = createSimulation(source.parts, plan.seed, "infant");
          result.futureEventCausality &&=
            frameHash(sim.frameAt(before)) ===
            frameHash(control.frameAt(before));
        }
      } catch (error) {
        result.error =
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error);
      }
      await save(file, result);
    }
    await persist(dir, result);
    results.push(result);
    scheduledIndex += caseViewCount(plan, manifest.stage);
    console.log(
      `${results.length}/${manifest.cases.length} ${plan.id}: ${result.error ? "FAILED (retained)" : result.views.length + " views"}`,
    );
    await save(join(dir, "checkpoint.json"), {
      captureHash: manifest.captureHash,
      completedCases: results.length,
      expectedCases: manifest.expected.cases,
      capturedViews: results.reduce((n, c) => n + c.views.length, 0),
      failures: results.filter((c) => c.error).map((c) => c.plan.id),
    });
  }
  return results;
}
/** Frozen evidence is read without any image, diagnostics, checkpoint or engine writes. */
export async function readFrozenCases(dir: string, manifest: Manifest) {
  const results: CaseResult[] = [];
  for (const plan of manifest.cases) {
    const file = join(dir, "data", plan.id + ".json.gz");
    if (!(await exists(file)))
      throw new Error(
        `Missing frozen case ${plan.id}; report-only never collects`,
      );
    const result = await load<CaseResult>(file);
    if (digest(result.plan) !== digest(plan))
      throw new Error(`Case provenance mismatch ${plan.id}`);
    // Raw tissue arrays are unnecessary for reporting. Do not rewrite their frozen files.
    for (const view of result.views) {
      view.pixels = [];
      view.corePixels = undefined;
      view.regionalPixels = undefined;
    }
    results.push(result);
  }
  return results;
}
async function persist(dir: string, result: CaseResult) {
  await mkdir(join(dir, "images"), { recursive: true });
  await mkdir(join(dir, "diagnostics"), { recursive: true });
  await mkdir(join(dir, "core-diagnostics"), { recursive: true });
  for (const view of result.views) {
    if (!(await exists(join(dir, "images", view.id + ".png"))))
      await writePng(
        join(dir, "images", view.id + ".png"),
        64,
        64,
        rasterPixels(view.pixels),
      );
    if (
      result.plan.group === "primary" &&
      view.kind === "endpoint" &&
      view.corePixels !== undefined
    ) {
      const id = coreDiagnosticId(view.id);
      await writePng(
        join(dir, "core-diagnostics", id + ".png"),
        64,
        64,
        rasterPixels(view.corePixels),
      );
      await save(join(dir, "diagnostics", id + ".json"), {
        id,
        sourceViewId: view.id,
        caseId: result.plan.id,
        kind: "core-diagnostic",
        age: view.age,
        hash: view.coreHash,
        descriptor: view.coreDescriptor,
        method:
          "White occupied actual body/head/enclosure parts; no hull/filling/smoothing; excludes appendage/face-mark pixels",
      });
    }
    if (
      result.plan.group === "primary" &&
      view.kind === "endpoint" &&
      view.regionalPixels !== undefined
    ) {
      const id = regionalDiagnosticId(view.id);
      await writePng(
        join(dir, "core-diagnostics", id + ".png"),
        64,
        64,
        rasterPixels(view.regionalPixels),
      );
      await save(join(dir, "diagnostics", id + ".json"), {
        id,
        sourceViewId: view.id,
        age: view.age,
        hash: view.regionalHash,
        regionalOccupancy: view.regionalOccupancy,
        legend: {
          trunk: "#FFFFFF",
          head: "#99DDFF",
          enclosure: "#C5A5FF",
          headTrunkOverlap: "#FFE08A",
        },
        method:
          "Actual occupied part masks; projected area, not physical mass; fractions overlap and are not additive",
      });
    }
    const { pixels, descriptor, corePixels, regionalPixels, ...diagnostics } =
      view;
    await save(join(dir, "diagnostics", view.id + ".json"), {
      caseId: result.plan.id,
      sourceId: result.plan.sourceId,
      genomeHash: result.genomeHash,
      inheritedHash: result.inheritedHash,
      ...diagnostics,
    });
    view.pixels = [];
    view.corePixels = undefined;
    view.regionalPixels = undefined;
  }
}
async function atlases(dir: string, cases: CaseResult[]) {
  await mkdir(join(dir, "atlases"), { recursive: true });
  const tiles: Tile[] = [];
  for (const kind of [
    "endpoint",
    "interior",
    "pose",
    "source",
    "care",
    "core",
    "regions",
  ]) {
    const selected =
      kind === "core" || kind === "regions"
        ? cases
            .filter((c) => c.plan.group === "primary")
            .flatMap((c) =>
              c.views
                .filter(
                  (v) =>
                    v.kind === "endpoint" &&
                    (kind === "core"
                      ? v.coreHash !== undefined
                      : v.regionalHash !== undefined),
                )
                .map((v) => ({
                  c,
                  v: {
                    ...v,
                    id:
                      kind === "core"
                        ? coreDiagnosticId(v.id)
                        : regionalDiagnosticId(v.id),
                  },
                })),
            )
        : cases.flatMap((c) =>
            c.views.filter((v) => v.kind === kind).map((v) => ({ c, v })),
          );
    for (let start = 0; start < selected.length; start += 64) {
      const batch = selected.slice(start, start + 64),
        width = 8 * 144,
        height = Math.ceil(batch.length / 8) * 154,
        rgba = new Uint8Array(width * height * 4);
      for (let i = 0; i < rgba.length; i += 4) rgba.set([12, 12, 12, 255], i);
      const page = `atlases/${kind}-${String(start / 64 + 1).padStart(3, "0")}.png`;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0c0c0c"/>`;
      for (let i = 0; i < batch.length; i++) {
        const { c, v } = batch[i],
          x = (i % 8) * 144 + 8,
          y = Math.floor(i / 8) * 154 + 4,
          path = join(
            dir,
            kind === "core" || kind === "regions"
              ? "core-diagnostics"
              : "images",
            v.id + ".png",
          ),
          image = await readPng(path),
          scaled = scaleRgba(image.rgba, 64, 64, 2);
        blitRgba(rgba, width, height, scaled.rgba, 128, 128, x, y);
        drawBitmapText(
          rgba,
          width,
          height,
          `${v.blindLabel} D${v.age.toFixed(1)}`,
          x,
          y + 132,
          { color: "#DDDDDD", scale: 1 },
        );
        svg += `<image x="${x}" y="${y}" width="128" height="128" style="image-rendering:pixelated" href="data:image/png;base64,${(await readFile(path)).toString("base64")}"/><text x="${x}" y="${y + 143}" fill="#ddd" font-family="monospace" font-size="10">${v.blindLabel} D${v.age.toFixed(1)}</text>`;
        tiles.push({
          id: v.id,
          caseId: c.plan.id,
          sourceId: c.plan.sourceId,
          historyId: c.plan.historyId,
          group: c.plan.group,
          blindLabel: v.blindLabel,
          kind: kind === "core" || kind === "regions" ? kind : v.kind,
          age: v.age,
          time: v.time,
          phase: v.phase,
          page,
          x,
          y,
          development: v.development,
        });
      }
      await writePng(join(dir, page), width, height, rgba);
      await writeFile(join(dir, page.replace(".png", ".svg")), svg + "</svg>");
    }
  }
  return tiles;
}
async function present(
  dir: string,
  manifest: Manifest,
  cases: CaseResult[],
  reportOnly = false,
) {
  const metrics = summarize(manifest, cases),
    templates = reviewTemplates(cases),
    reviewPath = join(dir, "visual-reviews.json"),
    rows = (await exists(reviewPath))
      ? await load<Review[]>(reviewPath)
      : templates;
  validateReviews(rows, templates, cases);
  const coverage = reviewSummary(
    rows,
    templates,
    metrics.actual.views,
    metrics.actual.coreDiagnosticViews,
  );
  const feedbackPath = resolve(dir, "..", "human-feedback.json"),
    feedback = (await exists(feedbackPath))
      ? await load<HumanFeedback>(feedbackPath)
      : null;
  const acceptance = acceptanceStatus(coverage.gatePassed, feedback, manifest);
  await save(join(dir, "metrics.json"), metrics);
  await save(join(dir, "lineage-audits.json"), {
    warning:
      "Source identity/host bookkeeping is automated evidence, not a claim of visually coherent descent.",
    frames: metrics.lineage,
  });
  if (!reportOnly) {
    await save(join(dir, "review-template.json"), templates);
    await save(reviewPath, rows);
  }
  await save(join(dir, "review-coverage.json"), coverage);
  await save(join(dir, "acceptance-status.json"), {
    ...acceptance,
    humanFeedback: feedback,
  });
  const tiles = reportOnly
    ? await load<Tile[]>(join(dir, "view-index.json"))
    : await atlases(dir, cases);
  if (!reportOnly) await save(join(dir, "view-index.json"), tiles);
  await writeFile(join(dir, "index.html"), gallery(manifest, tiles, feedback));
  const verification = (await exists(
    join(dir, "capture-source-verification.json"),
  ))
    ? await load<{ unchanged: boolean }>(
        join(dir, "capture-source-verification.json"),
      )
    : undefined;
  await writeFile(
    join(dir, "REPORT.md"),
    report(manifest, metrics, coverage, rows, verification, feedback),
  );
  const csv = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  await writeFile(
    join(dir, "frames.csv"),
    [
      [
        "caseId",
        "group",
        "sourceId",
        "seed",
        "history",
        "viewId",
        "kind",
        "age",
        "time",
        "phase",
        "actualPhase",
        "frameHash",
        "valid",
        "elapsedMs",
        "representedSources",
        "contributingSources",
        "expectedSources",
      ],
      ...cases.flatMap((c) =>
        c.views.map((v) => [
          c.plan.id,
          c.plan.group,
          c.plan.sourceId,
          c.plan.seed,
          c.plan.historyId,
          v.id,
          v.kind,
          v.age,
          v.time,
          v.phase,
          v.actualPhase,
          v.hash,
          v.valid,
          v.elapsedMs,
          v.sourceTracking.represented,
          v.sourceTracking.contributing,
          v.sourceTracking.expected,
        ]),
      ),
    ]
      .map((row) => row.map(csv).join(","))
      .join("\n"),
  );
  await save(join(dir, "accounting.json"), {
    expected: manifest.expected,
    actual: metrics.actual,
    allPlannedCasesAccounted: cases.length === manifest.expected.cases,
    allViewsCaptured: metrics.actual.views === manifest.expected.views,
    coreDiagnostics: {
      captured: metrics.actual.coreDiagnosticViews,
      expected: manifest.expected.coreDiagnosticViews,
      countedAsPrimaryViews: false,
    },
    regionalMasks: {
      captured: metrics.actual.regionalMaskArtifacts,
      expected: manifest.expected.regionalMaskArtifacts,
      derivedFromSameEndpointEvaluations: true,
      countedAsPrimaryViews: false,
    },
    failures: metrics.failures,
    acceptance,
    visualGate: acceptance.humanGateFailed
      ? "FAILED HUMAN VISUAL GATE: historical agent scores do not authorize expansion"
      : coverage.gatePassed
        ? "passed recorded independent axes"
        : "unreviewed or failed: do not infer acceptance from shape metrics",
  });
  return metrics;
}
export async function refreshFrozenReport(dir: string, manifest: Manifest) {
  const cases = await readFrozenCases(dir, manifest);
  return present(dir, manifest, cases, true);
}
async function index(root: string) {
  const entries = await readdir(root, { withFileTypes: true }),
    rows: string[] = [];
  const feedback = (await exists(join(root, "human-feedback.json")))
    ? await load<HumanFeedback>(join(root, "human-feedback.json"))
    : null;
  for (const e of entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => textOrder(a.name, b.name))) {
    const dir = join(root, e.name);
    if (!(await exists(join(dir, "manifest.json")))) continue;
    const m = await load<Manifest>(join(dir, "manifest.json")),
      coverage = (await exists(join(dir, "review-coverage.json")))
        ? await load<ReturnType<typeof reviewSummary>>(
            join(dir, "review-coverage.json"),
          )
        : null,
      verification = (await exists(
        join(dir, "capture-source-verification.json"),
      ))
        ? await load<{ unchanged: boolean }>(
            join(dir, "capture-source-verification.json"),
          )
        : null;
    rows.push(
      `| [${e.name}](${e.name}/REPORT.md) · [gallery](${e.name}/index.html) | ${m.stage} / ${m.probes} | ${verification?.unchanged === true ? "Verified unchanged" : verification?.unchanged === false ? "INVALID frozen baseline; candidate" : "Not verified"} | ${m.expected.views} | ${coverage?.primaryComparisonCoverage.numerator ?? 0}/${coverage?.primaryComparisonCoverage.denominator ?? "?"} | ${coverage?.primaryJointGate.numerator ?? 0}/${coverage?.primaryJointGate.denominator ?? 0} | ${m.protocolVersion !== PROTOCOL_VERSION || m.metricVersion !== METRIC_VERSION ? "Historical/incomparable rubric; not an audit3 pass" : acceptanceStatus(coverage?.gatePassed ?? false, feedback, m).status} |`,
    );
  }
  await writeFile(
    join(root, "INDEX.md"),
    `# Source-driven development audits\n\n${acceptanceBanner(feedback)}Audit3 requires core organization plus a second independent anatomical change; it does not require a new function every stage. Audits1/2 are historical and incomparable unless recomputed with matching definitions. Review counts below describe recorded inspections, not acceptance by the user. The global human-feedback metadata is loaded automatically on regeneration. Use an explicit --compare command for a matching complete cohort; partial review sets cannot produce percentage-point comparisons.\n\n| Run | Stage / probes | Capture source status | Planned primary/probe images | Primary transition coverage | Historical/current all-axis primary scores | Visual acceptance |\n|---|---|---|---:|---:|---:|---|\n${rows.join("\n")}\n`,
  );
}
async function main() {
  const args = process.argv.slice(2),
    value = (name: string, fallback: string) => {
      const i = args.indexOf(name);
      return i < 0 ? fallback : (args[i + 1] ?? fallback);
    };
  const stage = value("--stage", "proof") as AuditStage,
    probes = value("--probes", "none") as ProbeSet,
    careSeedCount = parseCareSeeds(value("--care-seeds", "2")),
    runId = value("--run", `v7-audit3-${stage}-001`);
  if (
    !["proof", "three", "full"].includes(stage) ||
    !["none", "source", "care", "all"].includes(probes) ||
    !/^[a-z\d][a-z\d-]{0,70}$/.test(runId)
  )
    throw new Error("Invalid --stage, --probes, or safe --run identifier");
  const root = resolve("docs/audits/life-v7"),
    dir = join(root, runId);
  await mkdir(root, { recursive: true });
  if (args.includes("--index-only")) {
    await index(root);
    return;
  }
  const reportOnly = args.includes("--report-only");
  let manifest: Manifest;
  if (reportOnly) {
    manifest = await load<Manifest>(join(dir, "manifest.json"));
    const current = await hashes();
    for (const file of [
      "tools/source-audit/metrics.ts",
      "tools/source-audit/protocol.ts",
      "tools/audit/metrics.ts",
    ])
      if (current[file] !== manifest.sourceHashes[file])
        throw new Error(
          `Frozen metric source changed: ${file}; preserve the old result and use a new run/metric version.`,
        );
  } else manifest = await prepare(dir, runId, stage, probes, careSeedCount);
  if (args.includes("--prepare")) {
    console.log(
      JSON.stringify({
        runId,
        stage,
        probes,
        careSeedCount: manifest.careSeedCount ?? 2,
        expected: manifest.expected,
        captureHash: manifest.captureHash,
        preparedOnly: true,
      }),
    );
    await index(root);
    return;
  }
  if (!reportOnly) {
    const before = await hashes();
    if (digest(before) !== manifest.captureHash)
      throw new Error("Source files changed after preparation");
  }
  if (!reportOnly) await sources(dir, manifest);
  const cases = reportOnly ? null : await collect(dir, manifest, false);
  let captureUnchanged = true;
  if (!reportOnly) {
    const after = await hashes();
    captureUnchanged = digest(after) === manifest.captureHash;
    await save(join(dir, "capture-source-verification.json"), {
      captureHash: manifest.captureHash,
      currentHash: digest(after),
      unchanged: captureUnchanged,
    });
  }
  const metrics = reportOnly
    ? await refreshFrozenReport(dir, manifest)
    : await present(dir, manifest, cases!);
  if (!captureUnchanged) {
    await index(root);
    throw new Error(
      "Sources changed during capture; evidence retained as mixed-source candidate, not final",
    );
  }
  const comparison = value("--compare", "");
  if (comparison) {
    if (!/^[a-z\d][a-z\d-]{0,70}$/.test(comparison))
      throw new Error("Invalid comparison run ID");
    const priorDir = join(root, comparison),
      prior = await load<Manifest>(join(priorDir, "manifest.json")),
      priorMetrics = await load<ReturnType<typeof summarize>>(
        join(priorDir, "metrics.json"),
      ),
      priorReviews = await load<Review[]>(
        join(priorDir, "visual-reviews.json"),
      ),
      currentReviews = await load<Review[]>(join(dir, "visual-reviews.json"));
    await save(
      join(dir, `comparison-${comparison}.json`),
      compareRuns(
        prior,
        manifest,
        priorMetrics,
        metrics,
        priorReviews,
        currentReviews,
      ),
    );
  }
  await index(root);
  console.log(
    JSON.stringify(
      {
        runId,
        stage: manifest.stage,
        probes: manifest.probes,
        actual: metrics.actual,
        report: join(dir, "REPORT.md"),
        visualStatus: "See explicit visual records: no automatic visual scores",
      },
      null,
      2,
    ),
  );
  if (
    metrics.actual.failures ||
    metrics.actual.views !== manifest.expected.views
  )
    process.exitCode = 1;
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/source-audit/run.ts"))
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

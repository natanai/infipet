/** White-box branch coverage, never an attractive-seed or population-diversity panel. */
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { gzipSync } from "node:zlib";
import { createSimulation, flattenAnatomy } from "../../src/simulation";
import {
  writePng,
  rasterPixels,
  readPng,
  scaleRgba,
  blitRgba,
  drawBitmapText,
} from "../audit/presentation";
import { sample } from "./metrics";
import { primarySources, PROOF_SOURCE_ID } from "./fixtures";
import { SEEDS, digest, METRIC_VERSION, textOrder } from "./protocol";
import { authoredCore, coreOccupancy, coreHash } from "./core";
import { acceptanceBanner, type HumanFeedback } from "./acceptance";

export const LIFECYCLE_AGES = [0, 12, 18, 24, 30, 36, 45, 60, 70, 75, 120];
export type GenotypeRow = {
  seed: string;
  seedIndex: number;
  kind: string | null;
  genomeHash: string;
};
export const firstSheltered = (rows: GenotypeRow[]) =>
  rows.find((r) => r.kind === "sheltered") ?? null;
const exists = async (p: string) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};
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
    "tools/audit/presentation.ts",
    "tools/audit/metrics.ts",
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
const save = async (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value, null, 2));
async function main() {
  const args = process.argv.slice(2),
    index = args.indexOf("--run"),
    runId = index >= 0 ? args[index + 1] : "v7-lifecycle-audit3-001";
  if (!/^[a-z\d][a-z\d-]{0,70}$/.test(runId)) throw new Error("Unsafe run ID");
  const dir = resolve("docs/audits/life-v7/lifecycle", runId);
  if (await exists(join(dir, "manifest.json")))
    throw new Error(
      "Lifecycle evidence is frozen; choose a new --run identifier",
    );
  await mkdir(join(dir, "images"), { recursive: true });
  const before = await hashes(),
    source = primarySources("proof").find((s) => s.id === PROOF_SOURCE_ID)!,
    selectionLog: GenotypeRow[] = [];
  // No frameAt/developmentAt call occurs until the genotype-only selection is recorded.
  for (let seedIndex = 0; seedIndex < SEEDS.length; seedIndex++) {
    const sim = createSimulation(source.parts, SEEDS[seedIndex], "infant"),
      genome = sim.genome as unknown as { lifeProgram?: { kind?: string } };
    selectionLog.push({
      seed: SEEDS[seedIndex],
      seedIndex,
      kind: genome.lifeProgram?.kind ?? null,
      genomeHash: digest(sim.genome),
    });
  }
  const selected = firstSheltered(selectionLog),
    manifest = {
      protocolVersion: "source-lifecycle-coverage-v7-audit3",
      metricVersion: METRIC_VERSION,
      runId,
      createdAt: new Date().toISOString(),
      sourceHashes: before,
      captureHash: digest(before),
      source,
      selection: {
        method:
          "First sheltered kind in the published16 seeds, selected from inherited genotype metadata before any rendered frame was evaluated",
        publishedSeeds: SEEDS,
        log: selectionLog,
        selected,
        attractivenessFiltering: false,
      },
      ages: LIFECYCLE_AGES,
      conditions: { needTimeline: [], action: "idle", time: 0 },
      expected: {
        actualFrames: selected ? 11 : 0,
        coreDiagnostics: selected ? 11 : 0,
      },
      excludedFromPopulationDiversity: true,
      primary204Unchanged: true,
    };
  await save(join(dir, "manifest.json"), manifest);
  if (!selected) {
    await save(join(dir, "status.json"), {
      available: false,
      reason:
        "No sheltered genotype in published16; no seed search outside the published list and no images rendered",
    });
    throw new Error("Sheltered branch unavailable in published16");
  }
  await writePng(
    join(dir, "source.png"),
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
    join(dir, "source-core.png"),
    64,
    64,
    rasterPixels(authoredCore(source.parts)),
  );
  const sim = createSimulation(source.parts, selected.seed, "infant"),
    frames: ReturnType<typeof sample>[] = [],
    unwrapped: {
      id: string;
      age: number;
      pixels: ReturnType<typeof coreOccupancy>;
      hash: string;
    }[] = [],
    failures: string[] = [];
  for (const age of LIFECYCLE_AGES)
    try {
      const view = sample(
        sim,
        source.parts,
        `sheltered__d${age}`,
        "endpoint",
        age,
        0,
        frames.length + 1,
      );
      frames.push(view);
      const noEnclosure = coreOccupancy(
        sim
          .frameAt(age, { time: 0, action: "idle" })
          .parts.filter((p) => p.role !== "enclosure"),
      );
      unwrapped.push({
        id: view.id + "__unwrapped",
        age,
        pixels: noEnclosure,
        hash: coreHash(noEnclosure),
      });
      await writePng(
        join(dir, "images", view.id + "__unwrapped.png"),
        64,
        64,
        rasterPixels(noEnclosure),
      );
      await writePng(
        join(dir, "images", view.id + ".png"),
        64,
        64,
        rasterPixels(view.pixels),
      );
      await writePng(
        join(dir, "images", view.id + "__core.png"),
        64,
        64,
        rasterPixels(view.corePixels ?? []),
      );
    } catch (error) {
      failures.push(`${age}: ${String(error)}`);
    }
  const noHoodChecks: unknown[] = [];
  for (const kind of ["direct", "metamorphic"]) {
    const control = selectionLog.find((r) => r.kind === kind);
    if (!control) {
      noHoodChecks.push({ kind, available: false });
      continue;
    }
    const controlSim = createSimulation(source.parts, control.seed, "infant");
    for (const age of LIFECYCLE_AGES) {
      const development = controlSim.developmentAt(age) as unknown as {
        lifecycle?: { enclosure?: number };
        anatomy?: { role?: string }[];
      };
      const enclosure = development.lifecycle?.enclosure ?? null;
      noHoodChecks.push({
        kind,
        seed: control.seed,
        age,
        enclosure,
        enclosureRegions:
          development.anatomy?.filter((r) => r.role === "enclosure").length ??
          null,
        passed:
          enclosure === 0 &&
          !development.anatomy?.some((r) => r.role === "enclosure"),
      });
    }
  }
  await writeFile(
    join(dir, "frames.json.gz"),
    gzipSync(
      Buffer.from(
        JSON.stringify({
          genome: sim.genome,
          program: sim.program,
          frames,
          unwrapped,
        }),
      ),
    ),
  );
  const review = frames.map((v) => ({
    viewId: v.id,
    age: v.age,
    frameHash: v.hash,
    coreHash: v.coreHash,
    status: "unreviewed",
    reviewer: null,
    faceVisibility: null,
    enclosureContinuity: null,
    emergenceCoherence: null,
    notes:
      "Actual-image inspection required; contributor counts and lifecycle labels do not establish visible face/coherence.",
  }));
  const columns = 6,
    width = columns * 144,
    height = Math.ceil((frames.length * 3) / columns) * 154,
    rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([12, 12, 12, 255], i);
  const tiles = frames.flatMap((v) => [
    { v, id: v.id, kind: "actual" },
    { v, id: v.id + "__core", kind: "core" },
    { v, id: v.id + "__unwrapped", kind: "no hood" },
  ]);
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i],
      png = await readPng(join(dir, "images", t.id + ".png")),
      scaled = scaleRgba(png.rgba, 64, 64, 2),
      x = (i % columns) * 144 + 8,
      y = Math.floor(i / columns) * 154 + 4;
    blitRgba(rgba, width, height, scaled.rgba, 128, 128, x, y);
    drawBitmapText(rgba, width, height, `D${t.v.age} ${t.kind}`, x, y + 132, {
      color: "#DDDDDD",
      scale: 1,
    });
  }
  await writePng(join(dir, "contact-sheet.png"), width, height, rgba);
  await save(join(dir, "visual-reviews.json"), review);
  await save(join(dir, "no-hood-structural-checks.json"), {
    conditions:
      "Neutral care; direct/metamorphic controls selected by genotype metadata, not appearance",
    checks: noHoodChecks,
    renderedControlImages: 0,
  });
  const after = await hashes(),
    unchanged = digest(after) === manifest.captureHash;
  await save(join(dir, "capture-source-verification.json"), {
    captureHash: manifest.captureHash,
    currentHash: digest(after),
    unchanged,
  });
  const feedbackPath = resolve(dir, "..", "..", "human-feedback.json"),
    feedback = (await exists(feedbackPath))
      ? (JSON.parse(await readFile(feedbackPath, "utf8")) as HumanFeedback)
      : null;
  await save(join(dir, "accounting.json"), {
    plannedActualFrames: 11,
    capturedActualFrames: frames.length,
    coreDiagnostics: frames.length,
    noEnclosureCoreVariants: unwrapped.length,
    primaryFramesAdded: 0,
    populationFramesAdded: 0,
    noHoodStructuralChecks: noHoodChecks.length,
    failures,
    visualReviewsCompleted: 0,
  });
  await writeFile(
    join(dir, "REPORT.md"),
    `# Sheltered lifecycle branch coverage — ${runId}\n\n${acceptanceBanner(feedback, manifest)}**White-box branch coverage, excluded from population/diversity summaries.** First sheltered genotype in the published16: ${selected.seed} (slot${selected.seedIndex + 1}). Selected from inherited metadata before rendering; no attractiveness search or replacement of the primary four seeds.\n\n${frames.length}/11 actual idle/time-zero frames; ${frames.length} additional white core diagnostics; primary proof remains204. Ages: ${LIFECYCLE_AGES.join(", ")}. Frozen source verification: ${unchanged ? "unchanged" : "FAILED; source changed during capture"}. Failures: ${failures.length}.\n\n[Original source](source.png) · [Source core](source-core.png) · [Actual/core contact sheet](contact-sheet.png) · [Manifest and selection log](manifest.json) · [Raw frames](frames.json.gz) · [Unreviewed visual records](visual-reviews.json) · [Non-sheltered structural checks](no-hood-structural-checks.json)\n\nInspect face visibility through enclosure, the12–36-day closure window,45–70-day emergence, and the relationship of the emerged core to infant material. Record actual visual evidence rather than assigning a pass from lifecycle labels. Direct/metamorphic controls have separately counted structural enclosure checks; no control-image visual claim is made. No scores are filled automatically.\n`,
  );
  console.log(
    JSON.stringify(
      {
        runId,
        selected,
        actualFrames: frames.length,
        coreDiagnostics: frames.length,
        failures,
        sourceUnchanged: unchanged,
        populationInclusion: false,
        report: join(dir, "REPORT.md"),
      },
      null,
      2,
    ),
  );
  if (!unchanged || failures.length || frames.length !== 11)
    process.exitCode = 1;
}
if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("/source-audit/lifecycle-proof.ts")
)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

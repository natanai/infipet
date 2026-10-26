/** Bounded visual evidence. Default invocation collects ONLY the small proof. */
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import {
  createSimulation,
  flattenAnatomy,
  type PetFrame,
  type PetPart,
} from "../../src/simulation";
import { STARTER_PRESETS } from "../../src/presets";
import {
  describeFrame,
  frameHash,
  shapeDistance,
  semanticDistance,
  visibleContributions,
  varianceAttribution,
} from "../audit/metrics";
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
  SEEDS,
  HISTORIES,
  INTERIOR_FRACTIONS,
  PROTOCOL_VERSION,
  METRIC_VERSION,
  digest,
  stageCounts,
  type AuditStage,
} from "./protocol";
import type {
  AuditCase,
  AuditManifest,
  AuditView,
  Rate,
  VisualReview,
} from "./types";
import { gallery } from "./gallery";
import { compareReviewRuns } from "./comparison";

const exists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
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
  const files = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? walk(join(path, e.name))
        : Promise.resolve([join(path, e.name)]),
    ),
  );
  return files
    .flat()
    .filter((p) => /\.(?:ts|tsx|json)$/.test(p))
    .sort();
}
async function engineHashes() {
  const files = [
    ...(await walk("src/simulation")),
    ...(await walk("src/needs")),
    ...(await walk("tools/evolution-audit")),
    "src/presets.ts",
    "src/pet-format.ts",
    "tools/audit/metrics.ts",
    "tools/audit/presentation.ts",
  ];
  return Object.fromEntries(
    await Promise.all(
      files
        .sort()
        .map(async (file) => [
          file.replaceAll("\\", "/"),
          digest(await readFile(file)),
        ]),
    ),
  );
}
function rate(
  numerator: number,
  denominator: number,
  condition: string,
  age: number | string,
): Rate {
  return {
    numerator,
    denominator,
    percent: denominator ? (100 * numerator) / denominator : null,
    condition,
    age,
  };
}
function percent(r: Rate) {
  return r.percent === null
    ? `not available (0/${r.denominator})`
    : `${r.percent.toFixed(1)}% (${r.numerator}/${r.denominator})`;
}
const csvCell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
function canonicalPixels(pixels: { x: number; y: number; color: string }[]) {
  return pixels
    .map((p) => [p.x, p.y, p.color.toLowerCase()])
    .sort(
      (a, b) =>
        Number(a[1]) - Number(b[1]) ||
        Number(a[0]) - Number(b[0]) ||
        String(a[2]).localeCompare(String(b[2])),
    );
}

async function prepare(runDir: string, runId: string, stage: AuditStage) {
  const counts = stageCounts(stage);
  const selectedIds =
    stage === "proof"
      ? ["bean"]
      : stage === "three"
        ? ["bean", "sprout", "canine-cub"]
        : STARTER_PRESETS.map((p) => p.id);
  const presets = selectedIds
    .map((id) => STARTER_PRESETS.find((p) => p.id === id))
    .filter((p): p is (typeof STARTER_PRESETS)[number] => Boolean(p));
  if (presets.length !== counts.presets)
    throw new Error(
      `Expected ${counts.presets} v6 starters; catalog is not ready.`,
    );
  const hashes = await engineHashes();
  const manifest: AuditManifest = {
    protocolVersion: PROTOCOL_VERSION,
    metricVersion: METRIC_VERSION,
    runId,
    stage,
    createdAt: new Date().toISOString(),
    engineHashes: hashes,
    engineHash: digest(hashes),
    expected: counts,
    presets: presets.map((p) => ({ ...p, sourceHash: digest(p.parts) })),
    seeds: SEEDS.slice(0, counts.seeds),
    histories: HISTORIES.slice(0, counts.histories),
    ages: AGES,
    runtime: { node: process.version, platform: process.platform },
  };
  if (await exists(join(runDir, "manifest.json"))) {
    const previous = await load<AuditManifest>(join(runDir, "manifest.json"));
    for (const field of [
      "protocolVersion",
      "metricVersion",
      "stage",
      "engineHash",
      "presets",
      "seeds",
      "histories",
    ] as const)
      if (JSON.stringify(previous[field]) !== JSON.stringify(manifest[field]))
        throw new Error(
          `Frozen manifest differs at ${field}; choose a new --run ID. Existing evidence was not overwritten.`,
        );
    return previous;
  }
  await mkdir(join(runDir, "data"), { recursive: true });
  await save(join(runDir, "manifest.json"), manifest);
  await save(join(runDir, "sources.json"), manifest.presets);
  return manifest;
}

async function sourceImages(runDir: string, manifest: AuditManifest) {
  await mkdir(join(runDir, "sources"), { recursive: true });
  for (const preset of manifest.presets) {
    const pixels = flattenAnatomy(preset.parts).map((p) => ({
      ...p,
      x: p.x + 16,
      y: p.y + 16,
    }));
    await writePng(
      join(runDir, "sources", preset.id + ".png"),
      64,
      64,
      rasterPixels(pixels),
    );
  }
}

function sample(
  sim: ReturnType<typeof createSimulation>,
  parts: PetPart[],
  id: string,
  kind: AuditView["kind"],
  age: number,
  time: number,
  blindIndex: number,
  extra: Partial<AuditView> = {},
): AuditView {
  const begin = performance.now();
  const frame = sim.frameAt(age, {
    time,
    action: kind === "pose" ? "move" : "idle",
  });
  const elapsedMs = performance.now() - begin;
  const bornFloating = new Set(
    sim
      .frameAt(0)
      .parts.filter((p) => p.relationship === "floating")
      .flatMap((p) => p.sourcePartIds ?? [p.sourcePartId ?? p.id]),
  );
  const protectedParts = parts.filter(
    (p) =>
      ["eye", "mouth", "decoration"].includes(p.kind) || bornFloating.has(p.id),
  );
  const visibility = visibleContributions(frame);
  const matches = (sourceId: string) =>
    frame.parts.filter(
      (part) =>
        part.id === sourceId ||
        part.sourcePartId === sourceId ||
        (
          part as unknown as { sourcePartIds?: string[] }
        ).sourcePartIds?.includes(sourceId),
    );
  const retained = protectedParts.filter((part) =>
    matches(part.id).some((p) => p.pixels.length > 0),
  ).length;
  const rasterContributors = protectedParts.filter((part) =>
    matches(part.id).some(
      (p) => visibility.parts.find((v) => v.id === p.id)?.winningPixels,
    ),
  ).length;
  const evolution = (frame as PetFrame & { evolution?: unknown }).evolution;
  const poseDiagnostics = frame.interaction.diagnostics as
    { phase?: number } | undefined;
  return {
    id,
    blindLabel: `B${String(blindIndex).padStart(5, "0")}`,
    kind,
    age,
    time,
    action: kind === "pose" ? "move" : "idle",
    descriptor: describeFrame(frame),
    hash: frameHash(frame),
    pixels: frame.pixels,
    evolution,
    movement: frame.movementMode,
    feelings: frame.wellbeing.feelings,
    actualPhase:
      typeof poseDiagnostics?.phase === "number" ? poseDiagnostics.phase : null,
    poseDiagnostics: kind === "pose" ? poseDiagnostics : undefined,
    protectedFeatures: {
      tested: protectedParts.length,
      retained,
      rasterContributors,
    },
    valid: frame.pixels.every(
      (p) =>
        Number.isInteger(p.x) &&
        Number.isInteger(p.y) &&
        p.x >= 0 &&
        p.y >= 0 &&
        p.x < 64 &&
        p.y < 64 &&
        /^#[\da-f]{6}$/i.test(p.color),
    ),
    elapsedMs,
    ...extra,
  };
}

async function collect(manifest: AuditManifest, runDir: string) {
  const cases: AuditCase[] = [];
  let viewIndex = 0;
  for (const preset of manifest.presets)
    for (let seedIndex = 0; seedIndex < manifest.seeds.length; seedIndex++)
      for (const history of manifest.histories) {
        const seed = manifest.seeds[seedIndex],
          id = `${preset.id}__s${String(seedIndex + 1).padStart(2, "0")}__${history.id}`;
        const file = join(runDir, "data", id + ".json.gz");
        if (await exists(file)) {
          const prior = await load<AuditCase>(file);
          if (prior.id !== id || prior.seed !== seed)
            throw new Error(`Case provenance mismatch: ${id}`);
          await persistSprites(runDir, prior);
          cases.push(prior);
          viewIndex += prior.views.length;
          console.log(
            `resume ${id}: ${prior.error ? "retained failure" : prior.views.length + " views"}`,
          );
          continue;
        }
        const result: AuditCase = {
          id,
          presetId: preset.id,
          seed,
          seedIndex,
          historyId: history.id,
          geneticHash: "",
          birthFidelity: false,
          seekAgreement: false,
          views: [],
        };
        try {
          const timeline = HISTORIES.find(
            (h) => h.id === history.id,
          )!.keyframes;
          const sim = createSimulation(preset.parts, seed, "infant", {
            needTimeline: timeline,
          });
          result.geneticHash = digest(sim.genome);
          result.birthFidelity =
            JSON.stringify(canonicalPixels(sim.frameAt(0).pixels)) ===
            JSON.stringify(
              canonicalPixels(
                flattenAnatomy(preset.parts).map((p) => ({
                  ...p,
                  x: p.x + 16,
                  y: p.y + 16,
                })),
              ),
            );
          for (const age of AGES)
            result.views.push(
              sample(
                sim,
                preset.parts,
                `${id}__d${age}`,
                "endpoint",
                age,
                0,
                ++viewIndex,
              ),
            );
          const early = frameHash(
            sim.frameAt(17.375, { time: 0, action: "idle" }),
          );
          for (const age of [240, 0, 75, 2, 120])
            sim.frameAt(age, { time: 0, action: "idle" });
          result.seekAgreement =
            early ===
            frameHash(sim.frameAt(17.375, { time: 0, action: "idle" }));
          if (manifest.stage !== "full") {
            for (let stage = 0; stage < 3; stage++)
              for (
                let interior = 0;
                interior < INTERIOR_FRACTIONS.length;
                interior++
              ) {
                const fromAge = AGES[stage],
                  toAge = AGES[stage + 1],
                  age =
                    fromAge + (toAge - fromAge) * INTERIOR_FRACTIONS[interior];
                result.views.push(
                  sample(
                    sim,
                    preset.parts,
                    `${id}__t${stage}-${interior}`,
                    "interior",
                    age,
                    0,
                    ++viewIndex,
                    { fromAge, toAge },
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
                    preset.parts,
                    `${id}__d${age}__p${phase}`,
                    "pose",
                    age,
                    phase / (8 * pace) + 1e-8,
                    ++viewIndex,
                    { phase },
                  ),
                );
            }
          }
        } catch (error) {
          result.error =
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error);
        }
        await save(file, result);
        await persistSprites(runDir, result);
        cases.push(result);
        console.log(
          `${id}: ${result.error ? "FAILED" : result.views.length + " views"}`,
        );
      }
  return cases;
}

/** Retain at most one case's pixel arrays; population summaries keep descriptors. */
async function persistSprites(runDir: string, result: AuditCase) {
  await mkdir(join(runDir, "images"), { recursive: true });
  await mkdir(join(runDir, "differences"), { recursive: true });
  const endpoints = result.views
    .filter((v) => v.kind === "endpoint")
    .sort((a, b) => a.age - b.age);
  for (let i = 1; i < endpoints.length; i++) {
    const a = endpoints[i - 1],
      b = endpoints[i];
    const left = new Set(a.pixels.map((p) => p.y * 64 + p.x)),
      right = new Set(b.pixels.map((p) => p.y * 64 + p.x));
    const pixels = [...new Set([...left, ...right])]
      .map((key) => ({
        x: key % 64,
        y: Math.floor(key / 64),
        color:
          left.has(key) && right.has(key)
            ? "#EEEEEE"
            : right.has(key)
              ? "#58E58A"
              : "#EB5D9E",
      }))
      .filter((p) => p.x >= 0 && p.y >= 0 && p.x < 64 && p.y < 64);
    await writePng(
      join(runDir, "differences", `${result.id}__${a.age}-${b.age}.png`),
      64,
      64,
      rasterPixels(pixels),
    );
  }
  for (const view of result.views) {
    const visible = view.pixels.filter(
      (p) =>
        Number.isInteger(p.x) &&
        Number.isInteger(p.y) &&
        p.x >= 0 &&
        p.y >= 0 &&
        p.x < 64 &&
        p.y < 64,
    );
    await writePng(
      join(runDir, "images", view.id + ".png"),
      64,
      64,
      rasterPixels(visible),
    );
    view.pixels = [];
  }
}

type Tile = {
  view: AuditView;
  case: AuditCase;
  page: string;
  x: number;
  y: number;
};
async function atlases(runDir: string, cases: AuditCase[]) {
  const tiles: Tile[] = [],
    width = 8 * 144,
    tileHeight = 154;
  await mkdir(join(runDir, "atlases"), { recursive: true });
  for (const kind of ["endpoint", "interior", "pose"] as const) {
    const selected = cases.flatMap((c) =>
      c.views.filter((v) => v.kind === kind).map((view) => ({ view, case: c })),
    );
    for (let start = 0; start < selected.length; start += 64) {
      const batch = selected.slice(start, start + 64),
        height = Math.ceil(batch.length / 8) * tileHeight;
      const rgba = new Uint8Array(width * height * 4);
      for (let offset = 0; offset < rgba.length; offset += 4)
        rgba.set([12, 12, 12, 255], offset);
      const page = `atlases/${kind}-${String(start / 64 + 1).padStart(3, "0")}.png`;
      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#0c0c0c"/>`;
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i],
          x = (i % 8) * 144 + 8,
          y = Math.floor(i / 8) * tileHeight + 4;
        const spritePath = join(runDir, "images", item.view.id + ".png");
        const source = await readPng(spritePath);
        const raster = scaleRgba(source.rgba, 64, 64, 2);
        blitRgba(
          rgba,
          width,
          height,
          raster.rgba,
          raster.width,
          raster.height,
          x,
          y,
        );
        drawBitmapText(
          rgba,
          width,
          height,
          `${item.view.blindLabel} D${item.view.age.toFixed(1)}`,
          x,
          y + 132,
          { color: "#DDDDDD", scale: 1 },
        );
        svg += `<image x="${x}" y="${y}" width="128" height="128" style="image-rendering:pixelated" href="data:image/png;base64,${(await readFile(spritePath)).toString("base64")}"/><text x="${x}" y="${y + 143}" fill="#ddd" font-family="monospace" font-size="10">${escape(item.view.blindLabel)} D${item.view.age.toFixed(1)}</text>`;
        tiles.push({ ...item, page, x, y });
      }
      await writePng(join(runDir, page), width, height, rgba);
      await writeFile(
        join(runDir, page.replace(".png", ".svg")),
        svg + "</svg>",
      );
    }
  }
  return tiles;
}

function summarize(manifest: AuditManifest, cases: AuditCase[]) {
  const views = cases.flatMap((c) => c.views),
    endpoints = views.filter((v) => v.kind === "endpoint");
  const transitions = cases.flatMap((c) =>
    AGES.slice(1).flatMap((toAge, i) => {
      const from = c.views.find(
          (v) => v.kind === "endpoint" && v.age === AGES[i],
        ),
        to = c.views.find((v) => v.kind === "endpoint" && v.age === toAge);
      return from && to
        ? [
            {
              caseId: c.id,
              presetId: c.presetId,
              historyId: c.historyId,
              fromAge: from.age,
              toAge,
              shapeDistance: shapeDistance(from.descriptor, to.descriptor),
              semantic: semanticDistance(from.descriptor, to.descriptor),
            },
          ]
        : [];
    }),
  );
  const genetics = manifest.presets.flatMap((preset) =>
    AGES.slice(1).map((age) => {
      const selected = cases
        .filter((c) => c.presetId === preset.id && c.historyId === "neutral")
        .flatMap((c) => {
          const frame = c.views.find(
            (v) => v.kind === "endpoint" && v.age === age,
          );
          return frame ? [{ case: c, frame }] : [];
        });
      const pairs = selected.flatMap((a, i) =>
        selected.slice(i + 1).map((b) => ({
          a: a.case.seed,
          b: b.case.seed,
          distance: shapeDistance(a.frame.descriptor, b.frame.descriptor),
          semantic: semanticDistance(a.frame.descriptor, b.frame.descriptor),
          collision: a.frame.hash === b.frame.hash,
        })),
      );
      return {
        presetId: preset.id,
        age,
        thresholds: [0.05, 0.1, 0.2].map((threshold) => ({
          threshold,
          separated: rate(
            pairs.filter((p) => p.distance >= threshold).length,
            pairs.length,
            `${preset.id}; neutral; raw seed pairs; shape>=${threshold}`,
            age,
          ),
        })),
        semanticSeparated: rate(
          pairs.filter((p) => p.semantic.changed >= 2).length,
          pairs.length,
          `${preset.id}; neutral; >=2 proportion differences>=20%`,
          age,
        ),
        nearTwins: rate(
          selected.filter((a) =>
            pairs.some(
              (p) =>
                (p.a === a.case.seed || p.b === a.case.seed) &&
                p.distance < 0.1,
            ),
          ).length,
          selected.length,
          `${preset.id}; neutral; seed has another seed at shape<10%`,
          age,
        ),
        collisions: rate(
          pairs.filter((p) => p.collision).length,
          pairs.length,
          `${preset.id}; neutral; exact rendered frame collision`,
          age,
        ),
        pairs,
      };
    }),
  );
  const lifecycles = manifest.presets.map((preset) => {
    const seeds = manifest.seeds,
      pairs = seeds.flatMap((a, i) =>
        seeds.slice(i + 1).map((b) => ({
          a,
          b,
          separatedAges: genetics
            .filter((g) => g.presetId === preset.id)
            .filter(
              (g) =>
                g.pairs.find((p) => p.a === a && p.b === b)?.distance! >= 0.1,
            ).length,
        })),
      );
    return {
      presetId: preset.id,
      separated: rate(
        pairs.filter((p) => p.separatedAges >= 2).length,
        pairs.length,
        `${preset.id}; neutral; shape>=10% at >=2 grown ages`,
        "30,75,120",
      ),
      pairs,
    };
  });
  const care = manifest.presets.flatMap((preset) =>
    manifest.histories
      .filter((h) => h.id !== "neutral")
      .flatMap((history) =>
        AGES.slice(1).map((age) => {
          const changes = manifest.seeds.flatMap((seed) => {
            const a = cases.find(
                (c) =>
                  c.presetId === preset.id &&
                  c.seed === seed &&
                  c.historyId === "neutral",
              ),
              b = cases.find(
                (c) =>
                  c.presetId === preset.id &&
                  c.seed === seed &&
                  c.historyId === history.id,
              );
            const av = a?.views.find(
                (v) => v.kind === "endpoint" && v.age === age,
              ),
              bv = b?.views.find((v) => v.kind === "endpoint" && v.age === age);
            return av && bv
              ? [
                  {
                    seed,
                    distance: shapeDistance(av.descriptor, bv.descriptor),
                    geneticAgreement: a!.geneticHash === b!.geneticHash,
                    feelingsDiffer:
                      JSON.stringify(av.feelings) !==
                      JSON.stringify(bv.feelings),
                  },
                ]
              : [];
          });
          return {
            presetId: preset.id,
            historyId: history.id,
            age,
            response: rate(
              changes.filter((c) => c.distance >= 0.05).length,
              changes.length,
              `${preset.id}; ${history.id} vs neutral; shape>=5%`,
              age,
            ),
            geneticAgreement: rate(
              changes.filter((c) => c.geneticAgreement).length,
              changes.length,
              `${preset.id}; same seed across ${history.id} and neutral`,
              age,
            ),
            changes,
          };
        }),
      ),
  );
  const variance =
    manifest.stage === "full"
      ? manifest.presets.flatMap((preset) =>
          AGES.slice(1).map((age) => {
            const grid = manifest.seeds.map((seed) =>
              manifest.histories.map(
                (history) =>
                  cases
                    .find(
                      (c) =>
                        c.presetId === preset.id &&
                        c.seed === seed &&
                        c.historyId === history.id,
                    )
                    ?.views.find((v) => v.kind === "endpoint" && v.age === age)
                    ?.descriptor,
              ),
            );
            return {
              presetId: preset.id,
              age,
              panel:
                "four selected histories, including severe Safety; descriptive only",
              value: grid.every((row) => row.every(Boolean))
                ? varianceAttribution(
                    grid as NonNullable<(typeof grid)[0][0]>[][],
                  )
                : null,
            };
          }),
        )
      : [];
  const elapsed = views.map((v) => v.elapsedMs).sort((a, b) => a - b);
  return {
    protocolVersion: manifest.protocolVersion,
    metricVersion: manifest.metricVersion,
    engineHash: manifest.engineHash,
    accounting: {
      expected: manifest.expected,
      cases: cases.length,
      failures: cases.filter((c) => c.error).length,
      endpoints: endpoints.length,
      interiors: views.filter((v) => v.kind === "interior").length,
      poses: views.filter((v) => v.kind === "pose").length,
      views: views.length,
    },
    reliability: {
      completion: rate(
        cases.filter((c) => !c.error).length,
        manifest.expected.cases,
        "planned cases, failures retained",
        "all",
      ),
      validFrames: rate(
        views.filter((v) => v.valid).length,
        views.length,
        "all evaluated views",
        "all",
      ),
      birthFidelity: rate(
        cases.filter((c) => c.birthFidelity).length,
        cases.length,
        "raw seed/history cases; exact pixel coordinates and colors",
        0,
      ),
      seekAgreement: rate(
        cases.filter((c) => c.seekAgreement).length,
        cases.length,
        "17.375 before/after reverse seeks",
        17.375,
      ),
      within16ms: rate(
        views.filter((v) => v.elapsedMs <= 16).length,
        views.length,
        "Node frame generation; excludes UI/native overhead",
        "all",
      ),
      within50ms: rate(
        views.filter((v) => v.elapsedMs <= 50).length,
        views.length,
        "Node frame generation; excludes UI/native overhead",
        "all",
      ),
      p50Ms: elapsed[Math.floor(elapsed.length * 0.5)] ?? null,
      p95Ms: elapsed[Math.floor(elapsed.length * 0.95)] ?? null,
    },
    genetics,
    lifecycles,
    transitions,
    care,
    variance,
    protectedFeatures: AGES.map((age) => {
      const selected = endpoints.filter((v) => v.age === age),
        total = selected.reduce((n, v) => n + v.protectedFeatures.tested, 0);
      return {
        age,
        retained: rate(
          selected.reduce((n, v) => n + v.protectedFeatures.retained, 0),
          total,
          "authored face/marking/floating identities retain visible part pixels; not visual readability",
          age,
        ),
        rasterContribution: rate(
          selected.reduce(
            (n, v) => n + v.protectedFeatures.rasterContributors,
            0,
          ),
          total,
          "protected identities with at least one winning composite pixel; not visual readability",
          age,
        ),
      };
    }),
    phaseCoverage: cases.flatMap((c) =>
      AGES.map((age) => {
        const poses = c.views.filter((v) => v.kind === "pose" && v.age === age),
          intended = new Set(poses.map((v) => v.phase)),
          actual = new Set(
            poses.flatMap((v) =>
              typeof v.actualPhase === "number" ? [v.actualPhase] : [],
            ),
          );
        return {
          caseId: c.id,
          age,
          scheduled: poses.length,
          intendedPhases: [...intended],
          actualPhases: [...actual],
          actualPhaseStatus: actual.size
            ? "measured from controller diagnostics"
            : "unavailable in this capture",
          completeIntendedCycle: intended.size === 8,
          completeActualCycle: actual.size === 8,
        };
      }),
    ),
    movement: manifest.presets.flatMap((preset) =>
      AGES.map((age) => {
        const selected = cases
          .filter((c) => c.presetId === preset.id && c.historyId === "neutral")
          .flatMap((c) =>
            c.views.filter((v) => v.kind === "endpoint" && v.age === age),
          );
        return {
          presetId: preset.id,
          age,
          modes: [...new Set(selected.map((v) => v.movement))].map((mode) => ({
            mode,
            frequency: rate(
              selected.filter((v) => v.movement === mode).length,
              selected.length,
              `${preset.id}; neutral raw seeds; controller selection only`,
              age,
            ),
          })),
          minPace: Math.min(...selected.map((v) => v.descriptor.pace)),
          maxPace: Math.max(...selected.map((v) => v.descriptor.pace)),
        };
      }),
    ),
    limitations: [
      "Numerical separation is not perceived distinctiveness.",
      "Raster topology counts do not prove anatomical transformation.",
      "Protected raster contribution is not visually confirmed feature readability.",
      "Current frame part identity must be reviewed through deformation and ownership transitions.",
      "Four-history variance panel includes severe care and is not comparable to a moderate-care population estimate.",
      "Physical iPhone, signed widget and human review are separate checks.",
      "Metric definitions differ from the provisional household baseline; percentage-point comparisons are not valid.",
    ],
  };
}

async function present(
  runDir: string,
  manifest: AuditManifest,
  cases: AuditCase[],
) {
  await sourceImages(runDir, manifest);
  const summary = summarize(manifest, cases),
    tiles = await atlases(runDir, cases);
  await save(join(runDir, "metrics.json"), summary);
  const records = cases.flatMap((c) =>
    c.views.map((v) => ({
      id: v.id,
      blindLabel: v.blindLabel,
      caseId: c.id,
      presetId: c.presetId,
      seed: c.seed,
      historyId: c.historyId,
      age: v.age,
      kind: v.kind,
      action: v.action,
      time: v.time,
      hash: v.hash,
      cells: v.descriptor.cells,
      movement: v.movement,
      elapsedMs: v.elapsedMs,
      valid: v.valid,
    })),
  );
  await save(join(runDir, "view-index.json"), records);
  await writeFile(
    join(runDir, "frames.csv"),
    [
      Object.keys(records[0] ?? {})
        .map(csvCell)
        .join(","),
      ...records.map((r) => Object.values(r).map(csvCell).join(",")),
    ].join("\n"),
  );
  const reviewPath = join(runDir, "visual-reviews.json");
  const reviews = (await exists(reviewPath))
    ? await load<VisualReview[]>(reviewPath)
    : summary.transitions.map(
        (t) =>
          ({
            caseId: t.caseId,
            fromAge: t.fromAge,
            toAge: t.toAge,
            reviewer: null,
            reviewerKind: null,
            status: "unreviewed",
            distinctiveness: null,
            featureCoherence: null,
            transformationRichness: null,
            continuity: null,
            notes: "",
          }) satisfies VisualReview,
      );
  if (!Array.isArray(reviews))
    throw new Error("Visual review records must be an array.");
  for (const review of reviews) {
    if (
      !summary.transitions.some(
        (t) =>
          t.caseId === review.caseId &&
          t.fromAge === review.fromAge &&
          t.toAge === review.toAge,
      )
    )
      throw new Error(
        `Unknown visual comparison: ${review.caseId} ${review.fromAge}→${review.toAge}`,
      );
    if (!["unreviewed", "reviewed"].includes(review.status))
      throw new Error(
        "Visual reviews need an explicit reviewed/unreviewed status.",
      );
    if (
      review.status === "reviewed" &&
      (!review.reviewer?.trim() ||
        !["agent", "human"].includes(review.reviewerKind ?? "") ||
        [
          review.distinctiveness,
          review.featureCoherence,
          review.transformationRichness,
          review.continuity,
        ].some(
          (score) =>
            score === null ||
            !Number.isInteger(score) ||
            score < 0 ||
            score > 3,
        ))
    )
      throw new Error(
        `Reviewed comparison needs reviewer identity/kind and all four0–3 scores: ${review.caseId}`,
      );
  }
  await save(reviewPath, reviews);
  const completeReviews = reviews.filter((r) => r.status === "reviewed"),
    passReviews = completeReviews.filter((r) => (r.distinctiveness ?? -1) >= 2);
  const reviewCoverage = rate(
    new Set(completeReviews.map((r) => `${r.caseId}/${r.fromAge}/${r.toAge}`))
      .size,
    summary.transitions.length,
    "adjacent-stage comparisons with recorded visual review",
    "0→30,30→75,75→120",
  );
  const secondReviews = summary.transitions.filter(
    (t) =>
      new Set(
        completeReviews
          .filter(
            (r) =>
              r.caseId === t.caseId &&
              r.fromAge === t.fromAge &&
              r.toAge === t.toAge,
          )
          .map((r) => r.reviewer),
      ).size >= 2,
  );
  const disagreements = summary.transitions.flatMap((t) => {
    const selected = completeReviews.filter(
      (r) =>
        r.caseId === t.caseId && r.fromAge === t.fromAge && r.toAge === t.toAge,
    );
    return new Set(selected.map((r) => r.reviewer)).size >= 2 &&
      new Set(selected.map((r) => r.distinctiveness)).size >= 2
      ? [
          {
            caseId: t.caseId,
            fromAge: t.fromAge,
            toAge: t.toAge,
            scores: selected.map((r) => ({
              reviewer: r.reviewer,
              distinctiveness: r.distinctiveness,
            })),
          },
        ]
      : [];
  });
  const capturedCycles = summary.phaseCoverage.filter((c) => c.scheduled > 0);
  const actualCycles = rate(
    capturedCycles.filter((c) => c.completeActualCycle).length,
    capturedCycles.length,
    "endpoints with actual controller phases0–7 captured; missing diagnostics remain unavailable",
    "0,30,75,120",
  );
  await save(join(runDir, "review-coverage.json"), {
    comparisonCoverage: reviewCoverage,
    secondReviewCoverage: rate(
      secondReviews.length,
      summary.transitions.length,
      "adjacent-stage comparisons with >=2 reviewer identities",
      "0→30,30→75,75→120",
    ),
    distinctivenessDisagreement: rate(
      disagreements.length,
      secondReviews.length,
      "independently reviewed comparisons with differing distinctiveness scores",
      "0→30,30→75,75→120",
    ),
    disagreements,
    humanReviewRecords: completeReviews.filter(
      (r) => r.reviewerKind === "human",
    ).length,
  });
  const report = [
    `# Procedural evolution ${manifest.runId}`,
    ``,
    `Protocol **${manifest.protocolVersion}**, metrics **${manifest.metricVersion}**, stage **${manifest.stage}**. Engine hash \`${manifest.engineHash}\`.`,
    ``,
    `## Accounting and visual gate`,
    ``,
    `Collected ${summary.accounting.views}/${manifest.expected.views} scheduled views: ${summary.accounting.endpoints}/${manifest.expected.endpoints} endpoints, ${summary.accounting.interiors}/${manifest.expected.interiors} intermediate views, ${summary.accounting.poses}/${manifest.expected.poses} motion poses. Failures: ${summary.accounting.failures}/${manifest.expected.cases} planned cases. Overlapping endpoint/pose selections remain separately scheduled views, not unique frames.`,
    ``,
    `Visual coverage: **${percent(reviewCoverage)}** of adjacent-stage comparisons. ${secondReviews.length}/${summary.transitions.length} have two independent reviewer identities. Clear evolved forms (score≥2): ${passReviews.length}/${completeReviews.length} review records. Unreviewed comparisons remain unreviewed and do not pass the gate.`,
    ``,
    `[Blind-first gallery and motion loops](index.html) · [Frozen manifest](manifest.json) · [Source drawings](sources.json) · [Metrics](metrics.json) · [CSV](frames.csv) · [Visual review records](visual-reviews.json)`,
    ``,
    `## Reliability`,
    ``,
    `| Measure | Result | Condition / age |`,
    `|---|---:|---|`,
    ...Object.entries(summary.reliability)
      .filter(([, value]) => typeof value === "object" && value !== null)
      .map(([label, value]) => {
        const r = value as Rate;
        return `| ${label} | ${percent(r)} | ${r.condition}; age ${r.age} |`;
      }),
    ``,
    `Frame-generation timing (Node, excludes rendering): median ${summary.reliability.p50Ms?.toFixed(2) ?? "n/a"}ms; p95 ${summary.reliability.p95Ms?.toFixed(2) ?? "n/a"}ms.`,
    ``,
    `## Protected feature accounting`,
    ``,
    `| Age | Retained identity pixels | Winning composite pixels |`,
    `|---|---:|---:|`,
    ...summary.protectedFeatures.map(
      (p) =>
        `| ${p.age} | ${percent(p.retained)} | ${percent(p.rasterContribution)} |`,
    ),
    ``,
    `These are automated identity/compositing checks across selected histories, not proof that a player can recognize the face or markings. Floating source identities are included.`,
    ``,
    `## Genetic separation within each starter`,
    ``,
    `| Starter | Age | Shape≥5% | Shape≥10% | Shape≥20% | ≥2 semantic proportions differ20% | Seeds with a near-twin |`,
    `|---|---:|---:|---:|---:|---:|---:|`,
    ...summary.genetics.map(
      (g) =>
        `| ${g.presetId} | ${g.age} | ${g.thresholds.map((t) => percent(t.separated)).join(" | ")} | ${percent(g.semanticSeparated)} | ${percent(g.nearTwins)} |`,
    ),
    ``,
    `All genetic comparisons use neutral care and the same published, unfiltered raw seeds. Each cell includes its numerator/denominator. Near-twins use shape distance<10%.`,
    ``,
    `| Starter | Distinct lifecycle: ≥10% separation at two grown ages |`,
    `|---|---:|`,
    ...summary.lifecycles.map(
      (l) => `| ${l.presetId} | ${percent(l.separated)} |`,
    ),
    ``,
    `## Adjacent milestones`,
    ``,
    `| Comparison | Shape≥20% alert | ≥2 changed semantic proportions | Visual status |`,
    `|---|---:|---:|---|`,
    ...manifest.presets.flatMap((p) =>
      AGES.slice(1).map((age, i) => {
        const selected = summary.transitions.filter(
          (t) =>
            t.presetId === p.id && t.fromAge === AGES[i] && t.toAge === age,
        );
        return `| ${p.id}: ${AGES[i]}→${age} | ${percent(rate(selected.filter((t) => t.shapeDistance >= 0.2).length, selected.length, "all selected histories", age))} | ${percent(rate(selected.filter((t) => t.semantic.changed >= 2).length, selected.length, "all selected histories", age))} | See recorded reviews; numerical alerts do not pass gate |`;
      }),
    ),
    ``,
    `## Care influence`,
    ``,
    `| Starter / history | Age | Shape response≥5% vs matching neutral seed | Genetics unchanged |`,
    `|---|---:|---:|---:|`,
    ...summary.care.map(
      (c) =>
        `| ${c.presetId} / ${c.historyId} | ${c.age} | ${percent(c.response)} | ${percent(c.geneticAgreement)} |`,
    ),
    ``,
    `## Movement selection`,
    ``,
    `| Starter | Age | Mode frequency, neutral seeds | Pace range |`,
    `|---|---:|---|---:|`,
    ...summary.movement.map(
      (m) =>
        `| ${m.presetId} | ${m.age} | ${m.modes.map((v) => `${v.mode}: ${percent(v.frequency)}`).join("; ")} | ${m.minPace.toFixed(3)}–${m.maxPace.toFixed(3)} |`,
    ),
    ``,
    `Mode selection and pace variation are separate from visually correct gait. Inspect full saved motion sequences. Independent visual score disagreements: ${disagreements.length}/${secondReviews.length} comparisons with two reviewer identities. [Coverage details](review-coverage.json).`,
    ``,
    `Complete actual controller-phase cycles: ${percent(actualCycles)}. Exact phase sets and explicit times are in [metrics](metrics.json) and compressed case records. Earlier captures without diagnostics remain unavailable.`,
    ``,
    `## Limitations and next decisions`,
    ``,
    ...summary.limitations.map((l) => `- ${l}`),
    `- Expansion requires inspection of actual stage and intermediate images. Scaling, recoloring, posture and appendage count alone are insufficient.`,
    `- Record defects with case ID and ages. Keep the first16 endpoint views and all12 stage comparisons independently reviewed before expanding.`,
    ``,
    `## Recorded visual findings`,
    ``,
    `These are agent/human assessments of actual images, distinct from automated metrics. Scores use0 unchanged/broken,1 minor/weak,2 clear/adequate,3 major/strong.`,
    ``,
    `| Case / ages | Reviewer | Distinctiveness / coherence / richness / continuity | Observation |`,
    `|---|---|---|---|`,
    ...completeReviews.map(
      (r) =>
        `| ${r.caseId}: ${r.fromAge}→${r.toAge} | ${r.reviewerKind}: ${r.reviewer} | ${r.distinctiveness} / ${r.featureCoherence} / ${r.transformationRichness} / ${r.continuity} | ${r.notes.replaceAll("|", "\\|").replaceAll("\n", " ")} |`,
    ),
    ``,
    `## Failures`,
    ``,
    ...cases
      .filter((c) => c.error)
      .map((c) => `- **${c.id}**: ${c.error!.split("\n")[0]}`),
    ...(summary.accounting.failures ? [] : ["No case evaluation failures."]),
    ``,
  ].join("\n");
  await writeFile(join(runDir, "REPORT.md"), report);
  const tileData = tiles.map((t) => ({
    ...records.find((r) => r.id === t.view.id),
    page: t.page,
    x: t.x,
    y: t.y,
    evolution: t.view.evolution,
    feelings: t.view.feelings,
  }));
  const html = gallery(manifest, tileData);
  await writeFile(join(runDir, "index.html"), html);
  return summary;
}

async function index(root: string) {
  const entries = await readdir(root, { withFileTypes: true }),
    runs: {
      id: string;
      manifest: AuditManifest;
      primaryReview: VisualReview[];
    }[] = [];
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const path = join(root, entry.name, "manifest.json");
    if (await exists(path)) {
      const reviewPath = join(root, entry.name, "visual-reviews.json"),
        reviews = (await exists(reviewPath))
          ? await load<VisualReview[]>(reviewPath)
          : [];
      runs.push({
        id: entry.name,
        manifest: await load<AuditManifest>(path),
        primaryReview: reviews.filter(
          (r) => r.status === "reviewed" && r.reviewer === "/root/audit_v6",
        ),
      });
    }
  }
  runs.sort((a, b) => a.id.localeCompare(b.id));
  const rows = compareReviewRuns(runs).map(
    ({ run: r, panel, baselineId, percentagePointChange }) => {
      const score =
        panel.percent === null
          ? "unreviewed"
          : `${panel.percent.toFixed(1)}% (${panel.numerator}/${panel.denominator})`;
      const coverage = `${panel.expectedPairs ? ((100 * panel.reviewedPairs) / panel.expectedPairs).toFixed(1) : "0.0"}% (${panel.reviewedPairs}/${panel.expectedPairs})`;
      const change =
        panel.percent === null
          ? "unreviewed"
          : !panel.complete
            ? "partial or invalid panel; no pp comparison"
            : baselineId === r.id
              ? "baseline: first complete comparable panel"
              : percentagePointChange === null
                ? "incomparable"
                : `${percentagePointChange >= 0 ? "+" : ""}${percentagePointChange.toFixed(1)}pp vs ${baselineId}`;
      return `| [${r.id}](${r.id}/REPORT.md) · [gallery](${r.id}/index.html) | ${r.manifest.stage} | ${r.manifest.expected.views} | ${score} | ${coverage} | ${change} | ${r.manifest.protocolVersion} / ${r.manifest.metricVersion} |`;
    },
  );
  await writeFile(
    join(root, "INDEX.md"),
    [
      "# Evolution audit runs",
      "",
      "The household-v1 baseline remains provisional. V6 metric definitions are separately versioned; do not report percentage-point changes across incompatible definitions.",
      "",
      "Visual rates below use the same named primary agent reviewer and fixed0–3 anchors, with score≥2 over reviewed adjacent milestone comparisons at0→30,30→75,75→120. They are descriptive rates in finite cohorts, not population confidence estimates. A100% distinctiveness rate does not itself establish continuity, feature integrity, or agreement with a second reviewer.",
      "",
      "Percentage-point changes require complete panels with matching source drawings, seeds, histories, ages, protocol/metric versions, and the exact reviewed-comparison set. Partial panels remain visibly partial and cannot supply a complete-panel baseline. The baseline is the earliest captured comparable complete run.",
      "",
      "| Run | Stage | Expected views | Primary visual clear-form rate | Primary comparison coverage | Change vs first compatible complete run | Protocol / metrics |",
      "|---|---|---:|---:|---:|---|---|",
      ...rows,
      "",
    ].join("\n"),
  );
}

async function main() {
  const args = process.argv.slice(2),
    value = (flag: string, fallback: string) =>
      args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const stage = value("--stage", "proof") as AuditStage,
    runId = value("--run", `v6-${stage}-001`);
  if (!["proof", "three", "full"].includes(stage))
    throw new Error("--stage must be proof, three or full");
  if (!/^[a-z\d][a-z\d-]{0,63}$/.test(runId))
    throw new Error(
      "--run must be a short lowercase letters/digits/hyphens ID",
    );
  const root = resolve("docs/audits/life-v6"),
    runDir = join(root, runId);
  if (args.includes("--index-only")) {
    await index(root);
    console.log(
      "Regenerated INDEX.md from frozen manifests and review records; no collection, rendering, or metric reanalysis.",
    );
    return;
  }
  let manifest: AuditManifest, cases: AuditCase[];
  if (args.includes("--report-only")) {
    manifest = await load<AuditManifest>(join(runDir, "manifest.json"));
    for (const helper of [
      "tools/audit/metrics.ts",
      "tools/audit/presentation.ts",
    ])
      if (digest(await readFile(helper)) !== manifest.engineHashes[helper])
        throw new Error(
          `Frozen evidence uses a different ${helper}; do not silently recompute it with changed metric helpers.`,
        );
    const files = (await readdir(join(runDir, "data")))
      .filter((f) => f.endsWith(".json.gz"))
      .sort();
    cases = [];
    for (const file of files) {
      const value = await load<AuditCase>(join(runDir, "data", file));
      await persistSprites(runDir, value);
      cases.push(value);
    }
  } else {
    throw new Error("The life-v6 audit is frozen. Use tools/source-audit/run.ts for life-v7 collection; --report-only and --index-only remain available for archived evidence.");
    /* Historical capture implementation retained for reading frozen evidence.
    manifest = await prepare(runDir, runId, stage);
    if (args.includes("--prepare")) {
      await index(root);
      console.log(
        `Prepared ${manifest.expected.cases} cases / ${manifest.expected.views} views; no evaluations run.`,
      );
      return;
    }
    cases = await collect(manifest, runDir);
    if (digest(await engineHashes()) !== manifest.engineHash)
      throw new Error(
        "Source changed during collection. Saved cases retained; do not treat this run as a complete frozen result.",
      );
    */
  }
  const summary = await present(runDir, manifest, cases);
  await index(root);
  console.log(
    JSON.stringify(
      {
        runDir: relative(process.cwd(), runDir),
        accounting: summary.accounting,
        reviewStatus: "see visual-reviews.json; unreviewed is not passed",
      },
      null,
      2,
    ),
  );
  if (
    summary.accounting.failures ||
    summary.accounting.views !== manifest.expected.views
  )
    process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

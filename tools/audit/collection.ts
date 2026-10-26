import { readFile, writeFile, mkdir, rename, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { platform, release, cpus } from "node:os";
import { createSimulation, flattenAnatomy, type PetFrame, type PetPart, type Pixel } from "../../src/simulation";
import { HOUSEHOLD_PRESETS } from "./frozen-sources";
import { PRESET_EXPECTATIONS } from "./preset-expectations";
import { PROTOTYPE_REVISION } from "../../src/pet-format";
import { describeFrame, frameHash } from "./metrics";
import { writePng, rasterPixels, blitRgba, drawBitmapText, scaleRgba } from "./presentation";
import { AGES, SEEDS, HISTORIES, PROTOCOL_VERSION, METRIC_VERSION, VERSIONS, digest } from "./protocol";
import type { Manifest, CaseResult, FrameResult, Integrity, History } from "./types";

const ENGINE_FILES = ["src/simulation/index.ts", "src/simulation/model.ts", "src/simulation/growth.ts", "src/needs/index.ts", "src/needs/types.ts", "src/needs/catalog.ts", "src/needs/catalog-data.json", "src/needs/timeline.ts", "src/needs/simulation.ts"];
export const exists = async (path: string) => { try { await access(path); return true; } catch { return false; } };
export async function saveJson(path: string, value: unknown) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const bytes = Buffer.from(JSON.stringify(value));
  await writeFile(path + ".tmp", path.endsWith(".gz") ? gzipSync(bytes, { level: 6 }) : bytes);
  await rename(path + ".tmp", path);
}
export async function loadJson<T>(path: string): Promise<T> {
  const bytes = await readFile(path);
  return JSON.parse((path.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8"));
}
export async function engineHashes() {
  const entries = await Promise.all(ENGINE_FILES.map(async (path) => [path, digest(await readFile(path, "utf8"))] as const));
  return Object.fromEntries(entries);
}
export async function prepare(runDir: string, runId: string): Promise<Manifest> {
  const hashes = await engineHashes();
  const candidate: Manifest = {
    protocolVersion: PROTOCOL_VERSION, metricVersion: METRIC_VERSION, runId, createdAt: new Date().toISOString(),
    seeds: SEEDS, seedCount: SEEDS.length, ages: AGES, render: { action: "idle", time: 0 },
    presets: HOUSEHOLD_PRESETS.map((preset) => ({ ...preset, sourceHash: digest(preset.parts), ...PRESET_EXPECTATIONS[preset.id] })),
    histories: HISTORIES, versions: { ...VERSIONS, prototype: PROTOTYPE_REVISION },
    engineHashes: hashes, engineHash: digest(hashes),
    runtime: { node: process.version, platform: platform(), os: release(), cpu: cpus()[0]?.model ?? "unknown" },
    expected: { cases: 10 * 128 * 28, frames: 10 * 128 * 28 * 9, scheduledReviewFrames: 4600 },
  };
  if (await exists(join(runDir, "manifest.json"))) {
    const previous = await loadJson<Manifest>(join(runDir, "manifest.json"));
    for (const key of ["protocolVersion", "metricVersion", "engineHash", "seeds", "ages", "presets", "histories"] as const)
      if (JSON.stringify(previous[key]) !== JSON.stringify(candidate[key])) throw new Error(`Frozen manifest differs at ${key}; use a new --run ID. No baseline overwritten.`);
    await sourceSheet(runDir, previous);
    return previous;
  }
  await mkdir(join(runDir, "atlases"), { recursive: true });
  await mkdir(join(runDir, "data"), { recursive: true });
  await saveJson(join(runDir, "manifest.json"), candidate);
  await saveJson(join(runDir, "sources.json"), candidate.presets);
  await sourceSheet(runDir, candidate);
  return candidate;
}
async function sourceSheet(runDir: string, manifest: Manifest) {
  const width = 1040, height = 464;
  const canvas = new Uint8Array(width * height * 4);
  const strip = new Uint8Array(640 * 64 * 4);
  for (let index = 0; index < manifest.presets.length; index++) {
    const preset = manifest.presets[index];
    const pixels = flattenAnatomy(preset.parts).map((p) => ({ ...p, x: p.x + 16, y: p.y + 16 }));
    const raw = rasterPixels(pixels);
    blitRgba(strip, 640, 64, raw, 64, 64, index * 64, 0);
    const src = scaleRgba(raw, 64, 64, 3);
    const x = (index % 5) * 208, y = Math.floor(index / 5) * 232;
    blitRgba(canvas, width, height, src.rgba, src.width, src.height, x + 8, y + 4);
    drawBitmapText(canvas, width, height, preset.id.replaceAll("-", " "), x + 4, y + 206, { color: "#DDDDDD", scale: 1 });
  }
  await writePng(join(runDir, "sources.png"), width, height, canvas);
  await writePng(join(runDir, "source.png"), 640, 64, strip);
}

function filledEnvelope(pixels: Pixel[]): Set<number> {
  if (!pixels.length) return new Set();
  const xs = pixels.map((p) => p.x), ys = pixels.map((p) => p.y);
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  const key = (x: number, y: number) => `${x},${y}`;
  const occupied = new Set(pixels.map((p) => key(p.x, p.y)));
  const exterior = new Set([key(x0, y0)]), queue = [[x0, y0]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const k = key(nx, ny);
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || occupied.has(k) || exterior.has(k)) continue;
      exterior.add(k); queue.push([nx, ny]);
    }
  }
  const inside = new Set<number>();
  for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) if (!exterior.has(key(x, y))) inside.add(y * 64 + x);
  return inside;
}
export function inspectFrame(frame: PetFrame, source: PetPart[], hosts: Record<string, string | null>): Integrity {
  const byId = new Map(frame.parts.map((p) => [p.id, p]));
  const sourceIds = new Set(source.map((p) => p.id));
  let hostsCorrect = 0, hostsTested = 0, jointsValid = 0, jointsTested = 0, facesInside = 0, facesTested = 0;
  const envelopes = new Map<string, Set<number>>();
  for (const [id, expected] of Object.entries(hosts)) {
    hostsTested++;
    if (byId.get(id)?.parentId === expected) hostsCorrect++;
  }
  for (const p of frame.parts) {
    if (p.relationship === "joint") {
      jointsTested++;
      if (p.attached && p.attachment && Math.hypot(p.anchor.x - p.attachment.x, p.anchor.y - p.attachment.y) <= 2) jointsValid++;
    }
    if ((p.kind === "eye" || p.kind === "mouth") && p.relationship !== "floating" && p.parentId) {
      const host = byId.get(p.parentId);
      if (host?.pixels.length) {
        if (!envelopes.has(host.id)) envelopes.set(host.id, filledEnvelope(host.pixels));
        const envelope = envelopes.get(host.id)!;
        facesTested += p.pixels.length;
        facesInside += p.pixels.filter((pixel) => envelope.has(pixel.y * 64 + pixel.x)).length;
      }
    }
  }
  const generated = frame.parts.filter((p) => p.provenance === "grown" && !sourceIds.has(p.id) && p.pixels.length > 0);
  const validPixel = (p: Pixel) => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < 64 && p.y < 64;
  return {
    valid: frame.pixels.every(validPixel) && new Set(frame.pixels.map((p) => p.y * 64 + p.x)).size === frame.pixels.length && frame.parts.every((p) => Number.isFinite(p.anchor.x) && Number.isFinite(p.anchor.y) && p.pixels.every(validPixel)),
    retained: source.filter((p) => byId.has(p.id) && byId.get(p.id)!.sourcePartId === p.id).length, expected: source.length,
    hostsCorrect, hostsTested, jointsValid, jointsTested, facesInside, facesTested,
    edgePixels: frame.pixels.filter((p) => p.x === 0 || p.y === 0 || p.x === 63 || p.y === 63).length,
    generatedIds: generated.map((p) => p.id), generatedKinds: generated.map((p) => p.kind),
    forbiddenGenerated: generated.filter((p) => !["body", "decoration", "horn", "hair"].includes(p.kind)).length,
  };
}
export function capture(frame: PetFrame, source: PetPart[], hosts: Record<string, string | null>, milliseconds = 0): FrameResult {
  return {
    age: frame.developmentalAge, hash: frameHash(frame),
    silhouetteHash: digest(frame.pixels.map((p) => [p.x, p.y])), descriptor: describeFrame(frame),
    integrity: inspectFrame(frame, source, hosts),
    feelings: frame.wellbeing.feelings.map(({ id, intensity }) => ({ id, intensity })),
    capabilities: digest(frame.capabilities), milliseconds,
  };
}
export function batchStem(presetId: string, historyId: string) { return `${presetId}--${historyId}`; }
export async function readBatch(runDir: string, presetId: string, historyId: string) {
  return loadJson<CaseResult[]>(join(runDir, "data", batchStem(presetId, historyId) + ".json.gz"));
}
export async function collect(runDir: string, manifest: Manifest) {
  const receipt = await loadJson<{ sourceHashes: string[]; reviewed: string[] }>(join(runDir, "source-review.json"));
  if (receipt.reviewed.length !== 10 || receipt.sourceHashes.join() !== manifest.presets.map((p) => p.sourceHash).join()) throw new Error("Source drawings must be visually reviewed and frozen before growth collection.");
  let completed = 0;
  for (const preset of manifest.presets) {
    const expectedBirth = frameHash({ pixels: flattenAnatomy(preset.parts).map((p) => ({ ...p, x: p.x + 16, y: p.y + 16 })) } as PetFrame);
    const neutralGenomes = manifest.seeds.map((seed) => digest(createSimulation(preset.parts, seed).genome));
    for (const history of manifest.histories) {
      const stem = batchStem(preset.id, history.id), dataPath = join(runDir, "data", stem + ".json.gz"), imagePath = join(runDir, "atlases", stem + ".png");
      if (await exists(dataPath) && await exists(imagePath)) {
        const saved = await readBatch(runDir, preset.id, history.id);
        if (saved.length === manifest.seedCount && saved.every((c) => c.frames.length === manifest.ages.length && !c.errors.length)) { completed += saved.length; continue; }
        await saveJson(join(runDir, "failures", `${stem}--${Date.now()}.json.gz`), { saved, reason: "Incomplete/error batch retained before retry" });
      }
      const width = manifest.ages.length * 64, height = manifest.seedCount * 64;
      const atlas = new Uint8Array(width * height * 4);
      for (let offset = 3; offset < atlas.length; offset += 4) atlas[offset] = 255;
      const cases: CaseResult[] = [];
      for (let seedIndex = 0; seedIndex < manifest.seedCount; seedIndex++) {
        const result: CaseResult = { presetId: preset.id, seedIndex, historyId: history.id, fingerprint: "", noveltyEligible: false, birthExact: false, genomeStable: false, replay: { checked: 0, matched: 0 }, frames: [], errors: [] };
        try {
          const sim = createSimulation(preset.parts, manifest.seeds[seedIndex], "infant", { needTimeline: history.timeline });
          result.fingerprint = sim.genome.fingerprint;
          result.genomeStable = digest(sim.genome) === neutralGenomes[seedIndex];
          result.noveltyEligible = Boolean(sim.program.noveltyEligible);
          for (let ageIndex = 0; ageIndex < manifest.ages.length; ageIndex++) {
            const start = performance.now();
            const frame = sim.frameAt(manifest.ages[ageIndex], manifest.render);
            const milliseconds = performance.now() - start;
            const record = capture(frame, preset.parts, preset.hosts, milliseconds);
            if (ageIndex === 0) result.birthExact = record.hash === expectedBirth;
            result.frames.push(record);
            if (record.integrity.valid) blitRgba(atlas, width, height, rasterPixels(frame.pixels), 64, 64, ageIndex * 64, seedIndex * 64);
          }
          // A fresh evaluator in nonmonotonic order; caches from the forward pass cannot satisfy this check.
          if (seedIndex < 8) {
            const replay = createSimulation(preset.parts, manifest.seeds[seedIndex], "infant", { needTimeline: history.timeline });
            for (const day of [240, 0, 75, 7, 180, 15, 120, 30, 90]) {
              const expected = result.frames.find((f) => f.age === day)!;
              result.replay.checked++;
              if (frameHash(replay.frameAt(day, manifest.render)) === expected.hash) result.replay.matched++;
            }
          }
        } catch (error) { result.errors.push(String(error instanceof Error ? error.stack : error)); }
        cases.push(result); completed++;
      }
      await writePng(imagePath, width, height, atlas);
      await saveJson(dataPath, cases);
      process.stdout.write(`${preset.id} / ${history.id}: ${completed}/${manifest.expected.cases} cases, errors ${cases.filter((c) => c.errors.length).length}\n`);
    }
  }
  const after = await engineHashes();
  if (digest(after) !== manifest.engineHash) throw new Error("Engine source changed during audit; results are not a frozen baseline.");
}


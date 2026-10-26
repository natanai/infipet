import { join } from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { loadJson, saveJson, exists, readBatch, batchStem } from "./collection";
import { readPng, writePng, blitRgba, scaleRgba, drawBitmapText, writePresentation } from "./presentation";
import { frameId, REVIEW_SEEDS, SMALL_REVIEW_SEEDS, REVIEW_AGES, scheduledHistoryIds, smallHistoryIds, digest, rate } from "./protocol";
import { shapeDistance } from "./metrics";
import type { Manifest, ReviewRow, ReviewPage, ReviewSchedule, VisualReview, Summary, Raster } from "./types";

function crop(image: Raster, x: number, y: number, width: number, height: number) {
  const output = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) output.set(image.rgba.subarray(((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4), row * width * 4);
  return output;
}
async function paintPage(runDir: string, page: ReviewPage, atlasCache: Map<string, Raster>) {
  const overview = page.rows[0]?.kind === "overview";
  const columns = overview ? 8 : 5, cellWidth = 144, cellHeight = 140, header = 28;
  const gridRows = overview ? Math.ceil(page.rows.length / columns) : page.rows.length;
  const width = columns * cellWidth, height = header + gridRows * cellHeight;
  const image = new Uint8Array(width * height * 4);
  for (let offset = 3; offset < image.length; offset += 4) image[offset] = 255;
  drawBitmapText(image, width, height, `BLIND ${page.id} / ${page.rows[0]?.kind === "flagged" ? "DIAGNOSTIC" : page.secondary ? "SECOND" : "PRIMARY"}`, 4, 4, { color: "#DDDDDD", scale: 2 });
  for (let r = 0; r < page.rows.length; r++) {
    const row = page.rows[r];
    if (!atlasCache.has(row.atlas)) atlasCache.set(row.atlas, await readPng(join(runDir, row.atlas)));
    const atlas = atlasCache.get(row.atlas)!;
    for (let c = 0; c < row.ageIndices.length; c++) {
      const x = (overview ? r % columns : c) * cellWidth, y = header + (overview ? Math.floor(r / columns) : r) * cellHeight;
      const pixel = crop(atlas, row.ageIndices[c] * 64, row.seedIndex * 64, 64, 64);
      const scaled = scaleRgba(pixel, 64, 64, 2);
      blitRgba(image, width, height, scaled.rgba, 128, 128, x + 8, y);
      drawBitmapText(image, width, height, overview ? row.id : `${row.id} ${c + 1}`, x + 3, y + 130, { color: "#AAAAAA" });
    }
    while (atlasCache.size > 3) atlasCache.delete(atlasCache.keys().next().value!);
  }
  await writePng(join(runDir, page.path), width, height, image);
}
export async function generateReviewSheets(runDir: string, manifest: Manifest) {
  await mkdir(join(runDir, "sheets"), { recursive: true });
  const schedule: ReviewSchedule = { version: "review-v1", frameCount: 0, secondaryFrameCount: 0, pages: [], frameKey: {} };
  const frameSet = new Set<string>(), secondarySet = new Set<string>();
  const atlasCache = new Map<string, Raster>();
  for (let presetIndex = 0; presetIndex < manifest.presets.length; presetIndex++) {
    const preset = manifest.presets[presetIndex], prefix = String(presetIndex).padStart(2, "0");
    if (!(await exists(join(runDir, "atlases", batchStem(preset.id, "tended-resources") + ".png")))) continue;
    const rows: ReviewRow[] = [];
    for (const historyId of [...scheduledHistoryIds, ...smallHistoryIds]) {
      const seeds = scheduledHistoryIds.includes(historyId) ? REVIEW_SEEDS : SMALL_REVIEW_SEEDS;
      for (const seedIndex of seeds) {
        const ids = REVIEW_AGES.map((age) => frameId(preset.id, seedIndex, historyId, age));
        const id = digest(ids).slice(0, 8).toUpperCase();
        rows.push({ id, kind: "lifecycle", frameIds: ids, atlas: `atlases/${batchStem(preset.id, historyId)}.png`, seedIndex, ageIndices: REVIEW_AGES.map((age) => manifest.ages.indexOf(age)) });
        ids.forEach((fid, i) => { frameSet.add(fid); schedule.frameKey[fid] = { presetId: preset.id, historyId, seedIndex, age: REVIEW_AGES[i] }; });
      }
    }
    for (let offset = 0; offset < rows.length; offset += 16) {
      const id = `P${prefix}-${String(offset / 16).padStart(2, "0")}`;
      schedule.pages.push({ id, path: `sheets/${id}.png`, secondary: false, rows: rows.slice(offset, offset + 16) });
    }
    const overview: ReviewRow[] = [];
    for (let seedIndex = 0; seedIndex < manifest.seedCount; seedIndex++) {
      if (REVIEW_SEEDS.includes(seedIndex)) continue;
      const fid = frameId(preset.id, seedIndex, "neutral", 75);
      overview.push({ id: digest(fid).slice(0, 8).toUpperCase(), frameIds: [fid], kind: "overview", atlas: `atlases/${batchStem(preset.id, "neutral")}.png`, seedIndex, ageIndices: [manifest.ages.indexOf(75)] });
      frameSet.add(fid); schedule.frameKey[fid] = { presetId: preset.id, historyId: "neutral", seedIndex, age: 75 };
    }
    const overviewId = `P${prefix}-05`;
    schedule.pages.push({ id: overviewId, path: `sheets/${overviewId}.png`, secondary: false, rows: overview });
    const secondaryRows = Array.from({ length: 15 }, (_, i) => rows[Math.floor(i * rows.length / 15)]);
    const secondaryOverview = Array.from({ length: 17 }, (_, i) => overview[Math.floor(i * overview.length / 17)]);
    for (const [suffix, selected] of [["L", secondaryRows], ["O", secondaryOverview]] as const) {
      const id = `S${prefix}-${suffix}`;
      schedule.pages.push({ id, path: `sheets/${id}.png`, secondary: true, rows: [...selected] });
      selected.forEach((r) => r.frameIds.forEach((fid) => secondarySet.add(fid)));
    }
    process.stdout.write(`Review sheets scheduled: ${preset.id}\n`);
  }
  for (const page of schedule.pages) await paintPage(runDir, page, atlasCache);
  schedule.frameCount = frameSet.size; schedule.secondaryFrameCount = secondarySet.size;
  await saveJson(join(runDir, "review-schedule.json"), schedule);
  await saveJson(join(runDir, "review-rubric.json"), {
    scale: [0, 1, 2, 3], unit: "Scoring unit is a visually inspected row: one adult or one five-age lifecycle. Frame coverage is separately deduplicated.",
    dimensions: {
      distinctiveness: ["Repeated-looking within the shown same-source cohort", "Minor changes mainly scale, color, or small posture", "Clear contour or feature differences", "Strong, varied individual silhouettes and feature combinations"],
      coherence: ["Major broken or unreadable anatomy", "Frequent displaced, merged, or unclear features", "Mostly coherent with small artifacts", "Clean feature tracking and legible anatomy throughout"],
      richness: ["No meaningful development", "Mostly size/proportion changes within one family", "Several clear, coherent developmental changes", "Striking, coherent transformations across the sequence"],
      continuity: ["Severe visual jumps or missing tissue", "Repeated abrupt changes", "Milestone sequence appears consistent with minor issues", "Smoothly related sequence with stable features"],
    },
    limitations: "Milestone sheets support sequence consistency, not proof of continuous-time smoothness. Richness and continuity are inapplicable to adult-only overview rows. Species recognition is descriptive, not a pass/fail criterion. Birth source equality across seeds is expected. Numerical pixel difference cannot supply these visual scores.",
    reviewReceipts: "Reviewers inspect blind PNG pages, record pageId+actual rowIds and scores0..3, notes and observed defect IDs; null for dimensions without context. Reviews are agent reviews unless kind=human with an actual human reviewer. No inferred or generated automatic scores.",
  });
  if (await exists(join(runDir, "summary.json"))) await generateFlaggedSheets(runDir, manifest);
  return schedule;
}

export async function generateFlaggedSheets(runDir: string, manifest: Manifest) {
  const summary = await loadJson<Summary>(join(runDir, "summary.json"));
  const pages: ReviewPage[] = [], reasons: Record<string, string> = {}, atlasCache = new Map<string, Raster>();
  const frameKey: ReviewSchedule["frameKey"] = {};
  for (let index = 0; index < summary.presets.length; index++) {
    const preset = summary.presets[index], neutral = await readBatch(runDir, preset.id, "neutral");
    const nearest = [...preset.nearest].sort((a, b) => a.distance - b.distance)[0];
    const strongest = neutral.map((c) => ({ seedIndex: c.seedIndex, distance: shapeDistance(c.frames[0].descriptor, c.frames.find((f) => f.age === 120)!.descriptor) })).sort((a, b) => b.distance - a.distance)[0];
    const combination = await readBatch(runDir, preset.id, "combined-stress");
    const care = combination.map((c) => ({ seedIndex: c.seedIndex, distance: shapeDistance(c.frames.find((f) => f.age === 120)!.descriptor, neutral[c.seedIndex].frames.find((f) => f.age === 120)!.descriptor) })).sort((a, b) => b.distance - a.distance)[0];
    const occlusion = neutral.map((c) => ({ seedIndex: c.seedIndex, count: Math.max(...c.frames.map((f) => f.descriptor.visible.fullyOccludedParts)) })).sort((a, b) => b.count - a.count)[0];
    const selections = [
      { seed: nearest.seedIndex, history: "neutral", reason: `Closest neutral pair A; mean distance ${nearest.distance}` },
      { seed: nearest.otherSeedIndex, history: "neutral", reason: "Closest neutral pair B" },
      { seed: strongest.seedIndex, history: "neutral", reason: `Largest normalized source→day120 difference ${strongest.distance}` },
      { seed: care.seedIndex, history: "neutral", reason: "Neutral counterpart of largest combined-stress shape response" },
      { seed: care.seedIndex, history: "combined-stress", reason: `Largest combined-stress response at120 ${care.distance}` },
      { seed: occlusion.seedIndex, history: "neutral", reason: `Largest nonempty-tissue occlusion alert count ${occlusion.count}; intentional underpainting possible` },
    ];
    const rows = selections.map((selection, row): ReviewRow => {
      const ids = REVIEW_AGES.map((age) => frameId(preset.id, selection.seed, selection.history, age));
      const id = `F${index}-${row}`;
      reasons[id] = selection.reason;
      ids.forEach((fid, a) => { frameKey[fid] = { presetId: preset.id, historyId: selection.history, seedIndex: selection.seed, age: REVIEW_AGES[a] }; });
      return { id, kind: "flagged", frameIds: ids, atlas: `atlases/${batchStem(preset.id, selection.history)}.png`, seedIndex: selection.seed, ageIndices: REVIEW_AGES.map((age) => manifest.ages.indexOf(age)) };
    });
    const id = `F${String(index).padStart(2, "0")}`;
    const page = { id, path: `sheets/${id}.png`, secondary: false, rows };
    pages.push(page); await paintPage(runDir, page, atlasCache);
  }
  await saveJson(join(runDir, "flagged-schedule.json"), { pages, reasons, frameKey, scheduledFrameReferences: pages.reduce((n, p) => n + p.rows.reduce((k, r) => k + r.frameIds.length, 0), 0), note: "Additional diagnostic selections are separate from the4600 primary and920 second-review samples. Repeated cases are retained for contextual comparison, never counted as new primary coverage." });
}

export async function present(runDir: string, manifest: Manifest) {
  const summary = await loadJson<Summary>(join(runDir, "summary.json"));
  const schedule = await loadJson<ReviewSchedule>(join(runDir, "review-schedule.json"));
  const reviews: VisualReview[] = [];
  const receiptDir = join(runDir, "review-receipts");
  if (await exists(receiptDir)) for (const name of (await readdir(receiptDir)).sort()) if (name.endsWith(".json")) {
    const value = await loadJson<VisualReview[] | VisualReview>(join(receiptDir, name));
    reviews.push(...(Array.isArray(value) ? value : [value]));
  }
  await writePresentation(runDir, manifest, summary, reviews, schedule);
  process.stdout.write(`Report and gallery: ${join(runDir, "REPORT.md")}\n`);
}

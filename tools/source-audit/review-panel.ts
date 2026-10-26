/** Schedule a stratified independent review from existing images. No engine replay or scores. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  readPng,
  writePng,
  scaleRgba,
  blitRgba,
  drawBitmapText,
} from "../audit/presentation";
import { digest, PROTOCOL_VERSION } from "./protocol";
import { coreDiagnosticId } from "./core";
import type { Manifest, Review, Tile } from "./types";

export const SECONDARY_SEED_SLOTS = [0, 4, 8, 12];
export function secondaryViews(manifest: Manifest, views: Tile[]) {
  if (manifest.stage !== "full")
    throw new Error(
      "The stratified secondary panel requires a full endpoint cohort.",
    );
  const plans = manifest.cases.filter(
    (c) => c.group === "primary" && SECONDARY_SEED_SLOTS.includes(c.seedIndex),
  );
  const cases = new Set(plans.map((c) => c.id));
  const selected = views.filter(
    (v) => v.kind === "endpoint" && cases.has(v.caseId),
  );
  const expected =
    manifest.expected.presets * 4 * manifest.expected.histories * 4;
  if (
    selected.length !== expected ||
    new Set(selected.map((v) => v.id)).size !== expected
  )
    throw new Error(
      `Secondary panel incomplete or duplicated: ${selected.length}/${expected} expected distinct endpoint images.`,
    );
  for (const plan of plans)
    for (const age of plan.ages)
      if (
        selected.filter((v) => v.caseId === plan.id && v.age === age).length !==
        1
      )
        throw new Error(
          `Missing or duplicate reviewed condition ${plan.id} at ${age}`,
        );
  return selected;
}
async function main() {
  const args = process.argv.slice(2),
    index = args.indexOf("--run"),
    runId = index >= 0 ? args[index + 1] : "v7-baseline";
  if (!/^[a-z\d][a-z\d-]{0,70}$/.test(runId)) throw new Error("Unsafe run ID");
  const dir = resolve("docs/audits/life-v7", runId);
  const manifest = JSON.parse(
    await readFile(join(dir, "manifest.json"), "utf8"),
  ) as Manifest;
  if (manifest.protocolVersion !== PROTOCOL_VERSION)
    throw new Error(
      "Core-diagnostic secondary review requires a current audit2 capture; old rubric scores are incomparable.",
    );
  const views = JSON.parse(
    await readFile(join(dir, "view-index.json"), "utf8"),
  ) as Tile[];
  const reviews = JSON.parse(
    await readFile(join(dir, "review-template.json"), "utf8"),
  ) as Review[];
  const selected = secondaryViews(manifest, views),
    dirOut = join(dir, "secondary");
  await mkdir(dirOut, { recursive: true });
  const images: {
      path: string;
      sha256: string;
      sourceId: string;
      viewIds: string[];
      kind: "actual" | "core";
    }[] = [],
    mapping: unknown[] = [];
  for (const source of manifest.sources.filter((s) => !s.variant)) {
    const rows = selected.filter((v) => v.sourceId === source.id),
      width = 8 * 144,
      height = Math.ceil(rows.length / 8) * 154,
      rgba = new Uint8Array(width * height * 4);
    const coreRgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([12, 12, 12, 255], i);
    for (let i = 0; i < coreRgba.length; i += 4)
      coreRgba.set([12, 12, 12, 255], i);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0c0c0c"/>`;
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i],
        path = join(dir, "images", v.id + ".png"),
        png = await readPng(path),
        scaled = scaleRgba(png.rgba, 64, 64, 2),
        x = (i % 8) * 144 + 8,
        y = Math.floor(i / 8) * 154 + 4;
      blitRgba(rgba, width, height, scaled.rgba, 128, 128, x, y);
      drawBitmapText(
        rgba,
        width,
        height,
        `${v.blindLabel} D${v.age}`,
        x,
        y + 132,
        { color: "#DDDDDD", scale: 1 },
      );
      svg += `<image x="${x}" y="${y}" width="128" height="128" style="image-rendering:pixelated" href="data:image/png;base64,${(await readFile(path)).toString("base64")}"/><text x="${x}" y="${y + 143}" fill="#ddd" font-family="monospace" font-size="10">${v.blindLabel} D${v.age}</text>`;
      const diagnostic = JSON.parse(
        await readFile(join(dir, "diagnostics", v.id + ".json"), "utf8"),
      );
      const coreId = coreDiagnosticId(v.id),
        corePng = await readPng(join(dir, "core-diagnostics", coreId + ".png")),
        coreScaled = scaleRgba(corePng.rgba, 64, 64, 2),
        coreDiagnostic = JSON.parse(
          await readFile(join(dir, "diagnostics", coreId + ".json"), "utf8"),
        );
      blitRgba(coreRgba, width, height, coreScaled.rgba, 128, 128, x, y);
      drawBitmapText(
        coreRgba,
        width,
        height,
        `${v.blindLabel} CORE D${v.age}`,
        x,
        y + 132,
        { color: "#DDDDDD", scale: 1 },
      );
      mapping.push({
        id: v.id,
        caseId: v.caseId,
        sourceId: v.sourceId,
        historyId: v.historyId,
        age: v.age,
        blindLabel: v.blindLabel,
        frameHash: diagnostic.hash,
        coreDiagnosticId: coreId,
        coreHash: coreDiagnostic.hash,
        corePage: `secondary/${source.id}-core.png`,
        page: `secondary/${source.id}.png`,
        x,
        y,
      });
    }
    const path = join(dirOut, source.id + ".png");
    await writePng(path, width, height, rgba);
    await writeFile(path.replace(".png", ".svg"), svg + "</svg>");
    images.push({
      path: `secondary/${source.id}.png`,
      sha256: digest(await readFile(path)),
      sourceId: source.id,
      viewIds: rows.map((v) => v.id),
      kind: "actual",
    });
    const corePath = join(dirOut, source.id + "-core.png");
    await writePng(corePath, width, height, coreRgba);
    images.push({
      path: `secondary/${source.id}-core.png`,
      sha256: digest(await readFile(corePath)),
      sourceId: source.id,
      viewIds: rows.map((v) => coreDiagnosticId(v.id)),
      kind: "core",
    });
  }
  const selectedCases = new Set(selected.map((v) => v.caseId)),
    templates = reviews.filter(
      (r) => r.kind === "transition" && selectedCases.has(r.caseId),
    );
  const schedule = {
    protocol: "source-independent-review-panel-v7-2",
    runId,
    captureHash: manifest.captureHash,
    selection: {
      seedSlotsOneBased: SECONDARY_SEED_SLOTS.map((i) => i + 1),
      histories: "all four",
      ages: [0, 30, 75, 120],
      withinSources: true,
    },
    scheduledViews: {
      numerator: selected.length,
      denominator: manifest.expected.endpoints,
      percent: (100 * selected.length) / manifest.expected.endpoints,
      condition:
        "planned independent endpoint review, not actual inspected coverage",
    },
    scheduledComparisons: templates.length,
    scheduledCoreDiagnostics: selected.length,
    actualReviewedByThisCommand: 0,
    images,
    mapping,
  };
  await writeFile(
    join(dirOut, "schedule.json"),
    JSON.stringify(schedule, null, 2),
  );
  await writeFile(
    join(dirOut, "review-template.json"),
    JSON.stringify(templates, null, 2),
  );
  await writeFile(
    join(dirOut, "README.md"),
    `# Scheduled independent review\n\n${selected.length}/${manifest.expected.endpoints} selected endpoint images (${schedule.scheduledViews.percent.toFixed(1)}%), ${templates.length} adjacent-stage comparisons, plus${selected.length} separately counted core diagnostics. **This is a schedule, not completed review.** Fixed seed slots1/5/9/13, every source/history/milestone; no attractive-seed filtering.\n\nInspect all six actual PNG sheets AND their six core-only companion sheets at readable pixel detail. Refer to both original source and source-core PNGs. Scaling, appendage length, global rotation or posture alone cannot score above1. Record actual coordinated core organization and functional-role/enclosure evidence rather than trusting operation labels. Endpoint-only continuity does not certify intermediate motion.\n\nCopy comparison records from review-template.json, set reviewer identity/kind and role=secondary, actual inspectedViewIds/evidenceHashes from mapping.frameHash, inspectedDiagnosticIds/diagnosticEvidenceHashes from coreDiagnosticId/coreHash, and changeInventory. Save a separate receipt with all actual/core sheet SHA256 hashes, image IDs, scores and limitations. No score is populated by this command.\n`,
  );
  const primarySchedule = manifest.sources
    .filter((s) => !s.variant)
    .map((source) => {
      const rows = views.filter(
        (v) =>
          v.kind === "endpoint" &&
          v.group === "primary" &&
          v.sourceId === source.id,
      );
      return {
        sourceId: source.id,
        plannedViews: rows.length,
        pages: [...new Set(rows.map((v) => v.page))],
        caseIds: [...new Set(rows.map((v) => v.caseId))],
        plannedComparisons: reviews.filter(
          (r) =>
            r.kind === "transition" && rows.some((v) => v.caseId === r.caseId),
        ).length,
        actualReviewClaim: false,
        plannedCoreDiagnostics: rows.length,
        corePages: [
          ...new Set(
            views
              .filter((v) => v.kind === "core" && v.sourceId === source.id)
              .map((v) => v.page),
          ),
        ],
      };
    });
  await writeFile(
    join(dir, "primary-review-schedule.json"),
    JSON.stringify(primarySchedule, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        runId,
        scheduledImages: selected.length,
        scheduledComparisons: templates.length,
        sheets: images.map((i) => i.path),
        actualReviewed: 0,
      },
      null,
      2,
    ),
  );
}
if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("/source-audit/review-panel.ts")
)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

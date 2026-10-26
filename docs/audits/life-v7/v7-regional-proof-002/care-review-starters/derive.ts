/** Post-capture comparison sheets. Reads frozen PNG pixels; never evaluates the engine. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import {
  readPng,
  writePng,
  scaleRgba,
  blitRgba,
  drawBitmapText,
} from "../../../../../tools/audit/presentation";

const run = resolve("docs/audits/life-v7/v7-regional-proof-002"),
  out = join(run, "care-review-starters");
const needs = [
  "safety",
  "security",
  "trust",
  "rest",
  "relaxation",
  "physical-fitness",
];
const onsets = [0, 7, 90, 150],
  offsets = [0, 0.25, 1, 7, 14];
const sha = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
async function main() {
  await mkdir(out, { recursive: true });
  const rawIndex = await readFile(join(run, "view-index.json"));
  const views = JSON.parse(rawIndex.toString()) as {
    id: string;
    caseId: string;
    kind: string;
    age: number;
    blindLabel: string;
  }[];
  const index = new Map(
    views.filter((v) => v.kind === "care").map((v) => [v.id, v]),
  );
  const inputHashes: Record<string, string> = {},
    pages: unknown[] = [],
    covered = new Set<string>();
  const decoded = new Map<string, Awaited<ReturnType<typeof readPng>>>();
  async function frozen(id: string) {
    if (!index.has(id)) throw new Error(`Unplanned view ${id}`);
    if (!decoded.has(id)) {
      const file = join(run, "images", `${id}.png`);
      inputHashes[id] = sha(await readFile(file));
      decoded.set(id, await readPng(file));
    }
    covered.add(id);
    return decoded.get(id)!;
  }
  for (const need of needs)
    for (const onset of onsets) {
      const width = 776,
        height = 1792,
        rgba = new Uint8Array(width * height * 4);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 9;
        rgba[i + 3] = 255;
      }
      drawBitmapText(rgba, width, height, `${need} ONSET ${onset}D`, 8, 8, {
        scale: 2,
      });
      offsets.forEach((offset, col) =>
        drawBitmapText(rgba, width, height, `+${offset}D`, 100 + col * 136, 42),
      );
      const cells: unknown[] = [];
      for (let seed = 1; seed <= 4; seed++)
        for (let condition = 0; condition < 3; condition++) {
          const slot = `s0${seed}`,
            row = (seed - 1) * 3 + condition;
          const label =
            condition === 0 ? "C75" : condition === 1 ? "T0" : "T100";
          drawBitmapText(
            rgba,
            width,
            height,
            `${slot} ${label}`,
            6,
            72 + row * 144,
          );
          for (let col = 0; col < offsets.length; col++) {
            const age = onset + offsets[col];
            const caseId = `care__${slot}__onset${onset}__${condition === 0 ? "control" : `${need}__${condition - 1}`}`;
            const id = `${caseId}__d${age}`,
              image = await frozen(id);
            if (image.width !== 64 || image.height !== 64)
              throw new Error(`Unexpected source image dimensions ${id}`);
            const scaled = scaleRgba(image.rgba, 64, 64, 2),
              x = 96 + col * 136,
              y = 64 + row * 144;
            blitRgba(
              rgba,
              width,
              height,
              scaled.rgba,
              scaled.width,
              scaled.height,
              x,
              y,
            );
            drawBitmapText(
              rgba,
              width,
              height,
              index.get(id)!.blindLabel,
              x,
              y + 130,
            );
            cells.push({
              id,
              caseId,
              seed,
              need,
              onset,
              fulfillment: condition === 0 ? 0.75 : condition - 1,
              control: condition === 0,
              age,
              offset: offsets[col],
              row,
              col,
              x,
              y,
              sourcePngSha256: inputHashes[id],
            });
          }
        }
      const file = `${need}-onset${onset}.png`;
      await writePng(join(out, file), width, height, rgba);
      pages.push({
        file,
        sha256: sha(await readFile(join(out, file))),
        need,
        onset,
        cells,
      });
    }
  const catalogBytes = await readFile(resolve("src/needs/catalog-data.json"));
  const catalog = JSON.parse(catalogBytes.toString());
  const manifest = JSON.parse(
    await readFile(join(run, "manifest.json"), "utf8"),
  );
  const result = {
    kind: "post-capture-frozen-pixel-comparison",
    engineEvaluated: false,
    runId: manifest.runId,
    captureHash: manifest.captureHash,
    sourceManifestSha256: sha(await readFile(join(run, "manifest.json"))),
    sourceViewIndexSha256: sha(rawIndex),
    derivedBy: "/root/starters_v6",
    dimensions: { width: 776, height: 1792 },
    sourcePixelScaling:
      "integer nearest-neighbor x2; no translation, recoloring, shape normalization or rerender",
    catalog: {
      needs: catalog.needs.length,
      feelings: catalog.feelings.length,
      interpretations: catalog.fauxFeelings.length,
      sha256: sha(catalogBytes),
      matchesFrozenCatalog:
        sha(catalogBytes) ===
        manifest.sourceHashes["src/needs/catalog-data.json"],
    },
    plannedCareViews: index.size,
    coveredCareViews: covered.size,
    missingIds: [...index.keys()].filter((id) => !covered.has(id)),
    inputHashes,
    pages,
  };
  await writeFile(
    join(out, "comparison-manifest.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  process.stdout.write(
    JSON.stringify({
      pages: pages.length,
      planned: index.size,
      covered: covered.size,
      catalog: result.catalog,
    }) + "\n",
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

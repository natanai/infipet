/** Post-capture frozen-pixel comparisons only; no simulation evaluation. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import {
  readPng,
  scaleRgba,
  blitRgba,
  drawBitmapText,
  writePng,
} from "../../../../../tools/audit/presentation";
const root = resolve(
  "docs/audits/life-v7/v7-regional-proof-004/care-review-starters",
);
const previous = resolve(
  "docs/audits/life-v7/v7-regional-proof-003/care-review-starters",
);
const sha = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const cases = [
  "care__s01__onset7__safety__0",
  "care__s01__onset7__relaxation__0",
  "care__s02__onset150__relaxation__0",
];
async function main() {
  await mkdir(root, { recursive: true });
  const old = JSON.parse(
    await readFile(join(previous, "review-starters.json"), "utf8"),
  );
  const index = new Map(
    (
      JSON.parse(
        await readFile(join(root, "../view-index.json"), "utf8"),
      ) as any[]
    ).map((view) => [view.id, view]),
  );
  const pages = [];
  for (const caseId of cases) {
    const comparison = old.comparisons.find((c: any) => c.caseId === caseId);
    const width = 776,
      height = 368,
      rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 9;
      rgba[i + 3] = 255;
    }
    drawBitmapText(rgba, width, height, caseId, 8, 8);
    [0, 0.25, 1, 7, 14].forEach((offset, col) =>
      drawBitmapText(rgba, width, height, `+${offset}D`, 100 + col * 136, 36),
    );
    const cells = [];
    for (let row = 0; row < 2; row++) {
      const ids = row
        ? comparison.supportingSequenceViewIds
        : comparison.controlSequenceViewIds;
      drawBitmapText(
        rgba,
        width,
        height,
        row ? "T0" : "C75",
        8,
        72 + row * 144,
      );
      for (let col = 0; col < 5; col++) {
        const id = ids[col],
          path = join(root, "../images", `${id}.png`),
          png = await readPng(path);
        const image = scaleRgba(png.rgba, png.width, png.height, 2),
          x = 96 + col * 136,
          y = 56 + row * 144;
        blitRgba(
          rgba,
          width,
          height,
          image.rgba,
          image.width,
          image.height,
          x,
          y,
        );
        drawBitmapText(
          rgba,
          width,
          height,
          index.get(id).blindLabel,
          x,
          y + 130,
        );
        cells.push({
          id,
          row,
          col,
          age: index.get(id).age,
          control: row === 0,
          pngSha256: sha(await readFile(path)),
        });
      }
    }
    const file = `${caseId}.png`;
    await writePng(join(root, file), width, height, rgba);
    pages.push({
      caseId,
      file,
      sha256: sha(await readFile(join(root, file))),
      cells,
    });
  }
  await writeFile(
    join(root, "fresh-comparison-manifest.json"),
    JSON.stringify(
      {
        method:
          "Frozen004 PNGs enlarged nearest-neighbor2x; no engine evaluation",
        pages,
      },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(
    JSON.stringify({
      pages: pages.length,
      casePositions: pages.flatMap((p) => p.cells).length,
      uniqueViews: new Set(pages.flatMap((p) => p.cells.map((c) => c.id))).size,
    }) + "\n",
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

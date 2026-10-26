/** Three fixed incubation fractions clarify emergence before the continuous hatch boundary. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createSimulation } from "../../../../../src/simulation";
import { frameHash } from "../../../../../tools/audit/metrics";
import {
  writePng,
  rasterPixels,
  scaleRgba,
  blitRgba,
  drawBitmapText,
} from "../../../../../tools/audit/presentation";
const directory = "docs/audits/life-v7/regressions/final-001";
const sha = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
async function main() {
  const base = JSON.parse(await readFile(directory + "/manifest.json", "utf8")),
    source = base.sources.find((f: any) => f.id === "egg");
  const before = Object.fromEntries(
    await Promise.all(
      Object.keys(base.sourceHashes).map(async (f) => [
        f,
        sha(await readFile(f)),
      ]),
    ),
  );
  if (JSON.stringify(before) !== JSON.stringify(base.sourceHashes))
    throw new Error("Frozen source hashes changed");
  const simulation = createSimulation(source.parts, base.seed, "egg"),
    views = [];
  for (const fraction of [0.5, 0.85, 0.95]) {
    const age = simulation.hatchAt * fraction,
      frame = simulation.frameAt(age, { time: 0, action: "idle" }),
      id = "egg__incubation" + fraction;
    views.push({
      id,
      fraction,
      age,
      time: 0,
      action: "idle",
      hash: frameHash(frame),
      pixels: frame.pixels,
      stage: frame.stage,
    });
    await writePng(
      directory + "/images/" + id + ".png",
      64,
      64,
      rasterPixels(frame.pixels),
    );
  }
  const mainRows = JSON.parse(
    await readFile(directory + "/frame-index.json", "utf8"),
  );
  const shown = [
    JSON.parse(
      await readFile(directory + "/frames/egg__egg-source.json", "utf8"),
    ),
    ...views,
    ...(await Promise.all(
      ["hatch-at", "hatch-plus"].map(async (label) =>
        JSON.parse(
          await readFile(directory + "/frames/egg__" + label + ".json", "utf8"),
        ),
      ),
    )),
  ];
  const rgba = new Uint8Array(1152 * 216 * 4);
  shown.forEach((v: any, i: number) => {
    const image = scaleRgba(rasterPixels(v.pixels), 64, 64, 3);
    blitRgba(rgba, 1152, 216, image.rgba, 192, 192, i * 192, 0);
    drawBitmapText(
      rgba,
      1152,
      216,
      v.fraction
        ? "INC " + v.fraction
        : i === 0
          ? "SOURCE"
          : v.id.replace("egg__", ""),
      i * 192,
      196,
    );
  });
  await writePng(directory + "/incubation.png", 1152, 216, rgba);
  await writeFile(
    directory + "/incubation-supplement.json",
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        reason:
          "The original ±0.01-day hatch-boundary samples are intentionally nearly continuous. Three fixed incubation fractions show cracking/emergence earlier in that same incubation; no seed or appearance selection.",
        seed: base.seed,
        sourceHashDigest: base.sourceHashDigest,
        helperSHA256: sha(
          await readFile(directory + "/incubation-supplement.ts"),
        ),
        hatchAt: simulation.hatchAt,
        views,
        accounting: {
          originalRenderedConditions: mainRows.length,
          additionalConditions: 3,
          totalRenderedConditions: mainRows.length + 3,
          sourceImages: 8,
          totalPrimaryAndSourceImages: mainRows.length + 3 + 8,
        },
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    "Three incubation fractions saved; total70 rendered conditions plus8 authored sources",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

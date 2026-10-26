/** Disposable developer preview. Overwrite freely; it is not a frozen audit or a visual pass. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createSimulation, flattenAnatomy } from "../../src/simulation";
import { STARTER_PRESETS } from "../../src/presets";
import {
  writePng,
  rasterPixels,
  scaleRgba,
  blitRgba,
  drawBitmapText,
} from "../audit/presentation";
import { AGES, SEEDS, digest } from "./protocol";
import { describeCore, authoredCore, authoredRegions } from "./core";
import { acceptanceStatus, type HumanFeedback } from "./acceptance";

export const previewSchedule = () =>
  SEEDS.slice(0, 4).flatMap((seed, seedIndex) =>
    AGES.map((age) => ({
      seed,
      seedIndex,
      age,
      id: `s${seedIndex + 1}-d${age}`,
    })),
  );
const html = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
async function main() {
  const args = process.argv.slice(2),
    value = (key: string, fallback: string) => {
      const i = args.indexOf(key);
      return i < 0 ? fallback : (args[i + 1] ?? fallback);
    },
    name = value("--name", "latest"),
    sourceId = value("--source", "canine-cub");
  if (!/^[a-z\d][a-z\d-]{0,60}$/.test(name))
    throw new Error(
      "Preview --name must be a simple directory name; frozen audit directories cannot be selected",
    );
  const source = STARTER_PRESETS.find((s) => s.id === sourceId);
  if (!source) throw new Error(`Unknown --source ${sourceId}`);
  const dir = resolve("docs/audits/life-v7/previews", name);
  await mkdir(join(dir, "images"), { recursive: true });
  const createdAt = new Date().toISOString(),
    begin = performance.now(),
    rows: unknown[] = [],
    width = 4 * 144,
    height = 4 * 154;
  await writeFile(
    join(dir, "status.json"),
    JSON.stringify({
      status: "building",
      createdAt,
      sourceId,
      disposable: true,
    }),
  );
  await writeFile(
    join(dir, "index.html"),
    `<!doctype html><meta charset="utf-8"><p>Disposable preview is rebuilding at ${html(createdAt)}. This is not a frozen audit or acceptance.</p>`,
  );
  const atlases = Object.fromEntries(
    ["endpoints", "core", "regions"].map((kind) => {
      const rgba = new Uint8Array(width * height * 4);
      for (let i = 0; i < rgba.length; i += 4) rgba.set([12, 12, 12, 255], i);
      return [kind, rgba];
    }),
  );
  for (let seedIndex = 0; seedIndex < 4; seedIndex++) {
    const sim = createSimulation(source.parts, SEEDS[seedIndex], "infant", {
      needTimeline: [],
    });
    for (let ageIndex = 0; ageIndex < AGES.length; ageIndex++) {
      const age = AGES[ageIndex],
        id = `s${seedIndex + 1}-d${age}`,
        frame = sim.frameAt(age, { action: "idle", time: 0 }),
        core = describeCore(frame);
      const layers = {
        endpoints: frame.pixels,
        core: core.pixels,
        regions: core.regionalPixels,
      };
      for (const [kind, pixels] of Object.entries(layers)) {
        const rgba = rasterPixels(pixels);
        await writePng(join(dir, "images", `${id}-${kind}.png`), 64, 64, rgba);
        const scaled = scaleRgba(rgba, 64, 64, 2),
          x = ageIndex * 144 + 8,
          y = seedIndex * 154 + 4;
        blitRgba(atlases[kind], width, height, scaled.rgba, 128, 128, x, y);
        drawBitmapText(
          atlases[kind],
          width,
          height,
          `S${seedIndex + 1} D${age}`,
          x,
          y + 132,
          { color: "#DDDDDD", scale: 1 },
        );
      }
      rows.push({
        id,
        seed: SEEDS[seedIndex],
        age,
        action: "idle",
        time: 0,
        movement: frame.movementMode,
        genomeHash: digest(sim.genome),
        genome: sim.genome,
        development: sim.developmentAt(age),
        regionalOccupancy: core.regionalOccupancy,
        pixels: frame.pixels,
        corePixels: core.pixels,
      });
    }
  }
  for (const [kind, rgba] of Object.entries(atlases))
    await writePng(join(dir, kind + ".png"), width, height, rgba);
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
  await writePng(
    join(dir, "source-regions.png"),
    64,
    64,
    rasterPixels(authoredRegions(source.parts)),
  );
  let feedback: HumanFeedback | null = null;
  try {
    feedback = JSON.parse(
      await readFile(
        resolve("docs/audits/life-v7/human-feedback.json"),
        "utf8",
      ),
    );
  } catch {}
  const status = acceptanceStatus(false, feedback, { createdAt }),
    data = {
      kind: "disposable-development-preview",
      frozen: false,
      visualAcceptance: "not assessed",
      createdAt,
      sourceId,
      sourceHash: digest(source.parts),
      rawSeeds: SEEDS.slice(0, 4),
      ages: AGES,
      conditions: "neutral75%, no grooming, idle, explicit time0",
      uniqueFrameEvaluations: 16,
      derivedCoreImages: 16,
      derivedRegionalMasks: 16,
      elapsedMs: performance.now() - begin,
      historicalHumanFeedback: feedback,
      acceptance: status,
      rows,
    };
  await writeFile(join(dir, "preview.json"), JSON.stringify(data, null, 2));
  await writeFile(
    join(dir, "status.json"),
    JSON.stringify({
      status: "complete",
      createdAt,
      sourceId,
      disposable: true,
      uniqueFrames: 16,
      visualAcceptance: false,
    }),
  );
  await writeFile(
    join(dir, "index.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Disposable regional preview</title><style>body{background:#111;color:#ddd;font:15px system-ui;margin:20px}img{image-rendering:pixelated;max-width:100%}.source{width:128px;height:128px}a{color:#bce}section{display:inline-block;vertical-align:top;margin:8px}h1{font-size:20px}</style><h1>DISPOSABLE PREVIEW — not a frozen audit or acceptance</h1><p>${html(status.status)}. ${html(feedback?.summary ?? "No human benchmark acceptance recorded.")}</p><p>${html(source.name)} · four fixed unfiltered raw seeds · columns0/30/75/120 · neutral care · idle/time0. This directory is overwritten by the next preview command. No automatic scores.</p><img class="source" src="source.png" alt="Original authored source"><img class="source" src="source-core.png" alt="Source core"><img class="source" src="source-regions.png" alt="Source head/trunk masks"><p><a href="preview.json">Actual frame/genome/development diagnostics</a></p><section><h2>Actual endpoints</h2><img src="endpoints.png" alt="Sixteen actual endpoints"></section><section><h2>Body/head core</h2><img src="core.png" alt="Sixteen core masks"></section><section><h2>Regional occupied masks</h2><p>Head blue; trunk white; enclosure purple; head/trunk overlap yellow. Projected occupancy, not physical mass.</p><img src="regions.png" alt="Sixteen regional masks"></section></html>`,
  );
  console.log(
    JSON.stringify(
      {
        disposable: true,
        frozenAudit: false,
        sourceId,
        uniqueFrames: 16,
        elapsedMs: data.elapsedMs,
        endpoints: join(dir, "endpoints.png"),
        core: join(dir, "core.png"),
        regions: join(dir, "regions.png"),
        gallery: join(dir, "index.html"),
        humanAccepted: false,
      },
      null,
      2,
    ),
  );
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/source-audit/preview.ts"))
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

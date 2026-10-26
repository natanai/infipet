/** Small, fixed-cohort directional grooming proof. Numerical checks never assign visual scores. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { clonePreset } from "../../src/presets";
import {
  createSimulation,
  type PetFrame,
  type Pixel,
} from "../../src/simulation";
import {
  GROOMING_RULES,
  type GroomStroke,
} from "../../src/simulation/grooming";
import {
  blitRgba,
  drawBitmapText,
  rasterPixels,
  scaleRgba,
  writePng,
} from "../audit/presentation";

const PROTOCOL = "directional-grooming-proof-v1";
const AGES = [7, 14, 30, 75];
const SEEDS = Array.from(
  { length: 4 },
  (_, i) => `life-v7-genome-${String(i + 1).padStart(2, "0")}`,
);
const TARGET = "leg-hind-left";
const ANCHOR = { x: 25.5, y: 38 };
const CONDITIONS = [
  { id: "neutral", label: "No grooming", direction: null },
  { id: "outward", label: "Outward / source-down", direction: { x: 0, y: 1 } },
  { id: "inward", label: "Inward / source-up", direction: { x: 0, y: -1 } },
  { id: "bend", label: "Bend / source-left", direction: { x: -1, y: 0 } },
] as const;
const hash = (value: unknown) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest("hex");
async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(join(directory, entry.name))
          : Promise.resolve([join(directory, entry.name)]),
      ),
    )
  )
    .flat()
    .filter((file) => /\.(ts|tsx|json)$/.test(file))
    .sort();
}
async function sourceHashes() {
  const files = [
    ...(await walk("src/simulation")),
    ...(await walk("src/needs")),
    "src/presets.ts",
    "src/pet-format.ts",
    "tools/source-audit/grooming-proof.ts",
    "tools/audit/presentation.ts",
  ].sort();
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file.replaceAll("\\", "/"),
        hash(await readFile(file)),
      ]),
    ),
  );
}
const rate = (
  numerator: number,
  denominator: number,
  condition: string,
  age: number | string,
) => ({
  numerator,
  denominator,
  percent: denominator ? (numerator / denominator) * 100 : null,
  condition,
  age,
});
const frameHash = (frame: PetFrame) => hash(frame.pixels);
function strokes(condition: (typeof CONDITIONS)[number]): GroomStroke[] {
  return condition.direction
    ? Array.from({ length: 6 }, (_, day) => ({
        id: `${condition.id}/day-${day}`,
        tick: day * 24,
        sourceId: TARGET,
        materialAnchor: { ...ANCHOR },
        direction: { ...condition.direction! },
        strength: 1,
      }))
    : [];
}
function targetParts(frame: PetFrame) {
  return frame.parts.filter(
    (part) =>
      part.id === TARGET ||
      part.sourcePartId === TARGET ||
      part.sourcePartIds?.includes(TARGET),
  );
}
function targetPixels(frame: PetFrame): Pixel[] {
  const pixels = new Map<number, Pixel>();
  for (const part of targetParts(frame))
    for (const pixel of part.pixels) pixels.set(pixel.y * 64 + pixel.x, pixel);
  return [...pixels.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}
function geometry(frame: PetFrame) {
  const parts = targetParts(frame),
    pixels = targetPixels(frame);
  const primary = parts.find((part) => part.id === TARGET) ?? parts[0];
  const trunk = frame.parts.find(
    (part) => part.kind === "body" && part.pixels.length,
  );
  const length = primary
    ? Math.hypot(
        primary.tip.x - primary.anchor.x,
        primary.tip.y - primary.anchor.y,
      )
    : null;
  return {
    contributorIds: parts.map((part) => part.id),
    visibleCells: pixels.length,
    width: pixels.length
      ? Math.max(...pixels.map((pixel) => pixel.x)) -
        Math.min(...pixels.map((pixel) => pixel.x)) +
        1
      : 0,
    height: pixels.length
      ? Math.max(...pixels.map((pixel) => pixel.y)) -
        Math.min(...pixels.map((pixel) => pixel.y)) +
        1
      : 0,
    anchor: primary?.anchor ?? null,
    tip: primary?.tip ?? null,
    length,
    lengthToTrunkHeight:
      length !== null && trunk
        ? length / Math.max(1, trunk.bounds.height)
        : null,
  };
}
function difference(a: readonly Pixel[], b: readonly Pixel[]) {
  const aa = new Map(a.map((pixel) => [pixel.y * 64 + pixel.x, pixel.color]));
  const bb = new Map(b.map((pixel) => [pixel.y * 64 + pixel.x, pixel.color]));
  const union = new Set([...aa.keys(), ...bb.keys()]);
  let colored = 0,
    binary = 0;
  for (const key of union) {
    if (aa.get(key) !== bb.get(key)) colored++;
    if (aa.has(key) !== bb.has(key)) binary++;
  }
  return {
    changedRgbaCells: colored,
    changedBinaryCells: binary,
    unionCells: union.size,
    rgbaFraction: union.size ? colored / union.size : 0,
    binaryFraction: union.size ? binary / union.size : 0,
  };
}
type View = {
  id: string;
  blindLabel: string;
  seed: string;
  condition: string;
  age: number;
  hash: string;
  frame: PetFrame;
  target: ReturnType<typeof geometry>;
  differenceFromNeutral: ReturnType<typeof difference>;
  targetDifferenceFromNeutral: ReturnType<typeof difference>;
};
async function sheet(path: string, views: View[], detail: boolean) {
  const columns = 8,
    tileWidth = 144,
    tileHeight = 152,
    width = columns * tileWidth,
    height = Math.ceil(views.length / columns) * tileHeight;
  const canvas = rasterPixels([], width, height, "#080808");
  for (const [index, view] of views.entries()) {
    const raw = rasterPixels(
      detail ? targetPixels(view.frame) : view.frame.pixels,
    );
    const image = scaleRgba(raw, 64, 64, 2),
      x = (index % columns) * tileWidth,
      y = Math.floor(index / columns) * tileHeight;
    blitRgba(
      canvas,
      width,
      height,
      image.rgba,
      image.width,
      image.height,
      x + 8,
      y,
    );
    drawBitmapText(
      canvas,
      width,
      height,
      `${view.blindLabel} D${view.age}`,
      x + 4,
      y + 134,
      { color: "#DDDDDD" },
    );
  }
  await writePng(path, width, height, canvas);
}
function html(views: View[]) {
  const rows = views.map(({ frame, ...row }) => row);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Directional grooming proof</title>
<style>body{background:#111;color:#ddd;font:14px system-ui;margin:20px}header{position:sticky;top:0;background:#111;padding:8px}a{color:#bed}button,select{font:inherit;background:#222;color:#eee;padding:7px;margin:3px;border:1px solid #777}.case{border:1px solid #555;margin:12px 0;padding:10px;overflow:auto}.strip{display:flex;gap:12px}figure{margin:0}img{width:192px;height:192px;image-rendering:pixelated;background:#080808}figcaption{font:12px monospace;white-space:pre-wrap}h1{font-size:21px}</style>
<header><h1>Directional grooming · 64 primary frames</h1><p>Six daily material gestures; gentle inherited biases, not direct sculpting. Numerical differences are not visual acceptance.</p><a href="REPORT.md">Report</a> · <a href="metrics.json">Metrics</a> · <a href="manifest.json">Frozen recipe</a> · <a href="visual-reviews.json">Review records</a><br><button id="reveal">Reveal identities</button><select id="seed"><option value="all">All four seeds</option>${SEEDS.map((seed) => `<option>${seed}</option>`).join("")}</select><select id="condition"><option value="all">All conditions</option>${CONDITIONS.map((condition) => `<option value="${condition.id}">${condition.label}</option>`).join("")}</select><select id="display"><option value="whole">Whole creature</option><option value="detail">Target contributors only</option></select></header><main></main>
<script>const rows=${JSON.stringify(rows).replaceAll("<", "\\u003c")};let revealed=false;const main=document.querySelector('main');function draw(){main.replaceChildren();const seed=document.getElementById('seed').value,condition=document.getElementById('condition').value,detail=document.getElementById('display').value==='detail';const selected=rows.filter(row=>(seed==='all'||row.seed===seed)&&(condition==='all'||row.condition===condition));const groups=new Map;for(const row of selected){const key=row.seed+'/'+row.condition;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}for(const [key,frames]of groups){const article=document.createElement('article');article.className='case';const title=document.createElement('p');title.textContent=revealed?key:frames[0].blindLabel+' lineage';article.append(title);const strip=document.createElement('div');strip.className='strip';for(const row of frames){const figure=document.createElement('figure'),image=new Image,caption=document.createElement('figcaption');image.src=(detail?'details/':'images/')+row.id+'.png';image.alt=row.blindLabel+' day'+row.age;caption.textContent=row.blindLabel+' D'+row.age+(revealed?'\n'+row.condition+' · changed cells '+row.differenceFromNeutral.changedRgbaCells:'');figure.append(image,caption);strip.append(figure)}article.append(strip);main.append(article)}}document.getElementById('reveal').onclick=()=>{revealed=!revealed;draw()};for(const id of ['seed','condition','display'])document.getElementById(id).onchange=draw;draw();</script></html>`;
}
async function main() {
  const runIndex = process.argv.indexOf("--run"),
    runId = runIndex < 0 ? "grooming-proof-001" : process.argv[runIndex + 1];
  if (!runId || !/^[a-zA-Z0-9_-]{1,80}$/.test(runId))
    throw new Error("Use a short alphanumeric --run ID.");
  const directory = resolve("docs/grooming-v1", runId),
    before = await sourceHashes(),
    captureHash = hash(before),
    source = clonePreset("canine-cub");
  const manifestPath = join(directory, "manifest.json");
  let exists = false;
  try {
    await access(manifestPath);
    exists = true;
  } catch {}
  if (exists) {
    const old = JSON.parse(await readFile(manifestPath, "utf8"));
    if (old.captureHash !== captureHash)
      throw new Error("Frozen grooming run differs; choose a new --run ID.");
  }
  await mkdir(join(directory, "images"), { recursive: true });
  await mkdir(join(directory, "details"), { recursive: true });
  const manifest = {
    protocolVersion: PROTOCOL,
    runId,
    createdAt: new Date().toISOString(),
    captureHash,
    sourceHashes: before,
    source: { id: "canine-cub", parts: source, hash: hash(source) },
    seeds: SEEDS,
    ages: AGES,
    render: { action: "idle", time: 0 },
    target: { sourceId: TARGET, materialAnchor: ANCHOR },
    conditions: CONDITIONS.map((condition) => ({
      ...condition,
      strokes: strokes(condition),
    })),
    groomingRules: GROOMING_RULES,
    expected: {
      cases: 16,
      primaryFrames: 64,
      birthProbes: 16,
      replayProbes: 16,
      futurePulseProbes: 96,
    },
    visualStatus: "unreviewed",
    limits:
      "Target-only images repeat the same primary frames; they add no review denominator.",
  };
  if (!exists)
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const views: View[] = [],
    failures: { caseId: string; error: string }[] = [],
    checks: {
      caseId: string;
      birth: boolean;
      genome: boolean;
      needs: boolean;
      replay: boolean;
      futurePulse: boolean;
      bounds: boolean;
    }[] = [];
  for (const [seedIndex, seed] of SEEDS.entries()) {
    const control = createSimulation(source, seed),
      neutralFrames = new Map(AGES.map((age) => [age, control.frameAt(age)]));
    for (const condition of CONDITIONS) {
      const caseId = `s${String(seedIndex + 1).padStart(2, "0")}__${condition.id}`;
      try {
        const timeline = strokes(condition),
          simulation = createSimulation(source, seed, "infant", {
            groomingTimeline: timeline,
          });
        assert.equal(simulation.program.version, 7);
        assert.deepEqual(simulation.genome, control.genome);
        assert.deepEqual(
          simulation.frameAt(0).pixels,
          control.frameAt(0).pixels,
          "a day-zero stroke cannot paint or instantaneously grow material",
        );
        for (const age of AGES) {
          const frame = simulation.frameAt(age),
            neutral = neutralFrames.get(age)!;
          assert.deepEqual(
            frame.wellbeing,
            neutral.wellbeing,
            "grooming must not change needs or feelings",
          );
          const diagnostics = simulation.developmentAt(age).diagnostics
            ?.grooming as
            | {
                input?: { appliedStrokes: number };
                regions?: Record<
                  string,
                  {
                    lengthDelta: number;
                    bendRadians: number;
                    priorityBias: number;
                  }
                >;
              }
            | undefined;
          assert.ok(
            diagnostics,
            "the current renderer must expose its integrated grooming diagnostics",
          );
          if (condition.direction) {
            assert.equal(
              diagnostics.input?.appliedStrokes,
              6,
              "all six past daily gestures reach the development engine",
            );
            assert.ok(
              Object.keys(diagnostics.regions ?? {}).length > 0,
              "authored material has active grooming bindings",
            );
          }
          for (const modifier of Object.values(diagnostics.regions ?? {})) {
            assert.ok(
              Math.abs(modifier.lengthDelta) <=
                GROOMING_RULES.maximumLengthDelta + 1e-12,
            );
            assert.ok(
              Math.abs(modifier.bendRadians) <=
                GROOMING_RULES.maximumBendRadians + 1e-12,
            );
            assert.ok(
              Math.abs(modifier.priorityBias) <=
                GROOMING_RULES.maximumPriorityBias + 1e-12,
            );
          }
          const id = `${caseId}__d${age}`,
            view: View = {
              id,
              blindLabel: `G${String(views.length + 1).padStart(4, "0")}`,
              seed,
              condition: condition.id,
              age,
              hash: frameHash(frame),
              frame,
              target: geometry(frame),
              differenceFromNeutral: difference(frame.pixels, neutral.pixels),
              targetDifferenceFromNeutral: difference(
                targetPixels(frame),
                targetPixels(neutral),
              ),
            };
          views.push(view);
          await writePng(
            join(directory, "images", id + ".png"),
            64,
            64,
            rasterPixels(frame.pixels),
          );
          await writePng(
            join(directory, "details", id + ".png"),
            64,
            64,
            rasterPixels(targetPixels(frame)),
          );
        }
        const expected = simulation.frameAt(14);
        for (const age of [
          240, 0, 157, 1, 30, 365, 7, 143, 2, 75, 9, 120, 19, 90,
        ])
          simulation.frameAt(age);
        assert.deepEqual(simulation.frameAt(14).pixels, expected.pixels);
        const future = createSimulation(source, seed, "infant", {
          groomingTimeline: [
            ...timeline,
            {
              id: "future-pulse",
              sourceId: TARGET,
              tick: 100 * 24,
              materialAnchor: { ...ANCHOR },
              direction: { x: 0, y: 1 },
              strength: 1,
            },
          ],
        });
        for (const age of [0, 7, 14, 30, 75, 100])
          assert.deepEqual(
            future.frameAt(age).pixels,
            simulation.frameAt(age).pixels,
            "future pulses cannot change preceding frames or paint instantaneously",
          );
        checks.push({
          caseId,
          birth: true,
          genome: true,
          needs: true,
          replay: true,
          futurePulse: true,
          bounds: true,
        });
      } catch (error) {
        failures.push({
          caseId,
          error:
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error),
        });
      }
    }
  }
  await sheet(join(directory, "contact.png"), views, false);
  await sheet(join(directory, "target-contributors.png"), views, true);
  await writeFile(
    join(directory, "frames.json.gz"),
    gzipSync(JSON.stringify(views), { level: 6 }),
  );
  const compact = views.map(({ frame, ...view }) => view),
    treated = views.filter((view) => view.condition !== "neutral"),
    after = await sourceHashes(),
    unchanged = hash(after) === captureHash;
  const metric = {
    protocolVersion: PROTOCOL,
    runId,
    captureHash,
    sourceUnchangedDuringCapture: unchanged,
    accounting: {
      plannedCases: 16,
      completedCases: checks.length,
      failures: failures.length,
      primaryFrames: views.length,
      plannedPrimaryFrames: 64,
    },
    birthFidelity: rate(
      checks.filter((check) => check.birth).length,
      16,
      "Exact birth pixels despite day-zero input",
      0,
    ),
    inheritedAgreement: rate(
      checks.filter((check) => check.genome).length,
      16,
      "Same inherited genome as matched neutral",
      AGES.join("/"),
    ),
    needsAgreement: rate(
      checks.filter((check) => check.needs).length,
      16,
      "Same wellbeing as matched neutral at all four ages",
      AGES.join("/"),
    ),
    replayAgreement: rate(
      checks.filter((check) => check.replay).length,
      16,
      "Day14 pixels after reordered seeks",
      14,
    ),
    futureCausality: rate(
      checks.filter((check) => check.futurePulse).length,
      16,
      "All six pre/pulse-time comparisons agree",
      "0/7/14/30/75/100",
    ),
    renderedChange: rate(
      treated.filter((view) => view.differenceFromNeutral.changedRgbaCells > 0)
        .length,
      48,
      "Treated frame differs by any rendered pixel from neutral; not a visual meaningfulness score",
      AGES.join("/"),
    ),
    views: compact,
    checks,
    failures,
    visualStatus: "unreviewed",
    notes: [
      "Raw and target-contributor differences may include common camera fitting; inspect actual images.",
      "Length relative to trunk helps distinguish a local response from uniform framing.",
      "No whole-body shape-diversity or human-review claim follows from this small grooming demonstration.",
    ],
  };
  await writeFile(
    join(directory, "metrics.json"),
    JSON.stringify(metric, null, 2) + "\n",
  );
  await writeFile(join(directory, "index.html"), html(views));
  const reviewPath = join(directory, "visual-reviews.json");
  try {
    await access(reviewPath);
  } catch {
    await writeFile(
      reviewPath,
      JSON.stringify(
        treated.map((view) => ({
          id: view.id,
          controlId: `${view.id.split("__")[0]}__neutral__d${view.age}`,
          reviewer: null,
          reviewerKind: null,
          status: "unreviewed",
          visibility: null,
          directionalCoherence: null,
          sourceContinuity: null,
          notes: "",
        })),
        null,
        2,
      ) + "\n",
    );
  }
  const report = `# Directional grooming proof: ${runId}\n\n**Automated capture only; visual acceptance remains unreviewed.**\n\nFour fixed raw genomes, Cub hind-left source leg, four conditions, ages7/14/30/75: ${views.length}/64 primary frames. Six one-strength gestures occur on days0..5, one per day. No care values change.\n\n- [Whole-creature contact sheet](contact.png)\n- [Target contributors only](target-contributors.png) — the same64 frames, not another cohort\n- [Filterable comparison gallery](index.html)\n- [Frozen source/code hashes and recipes](manifest.json)\n- [Metrics and per-frame facts](metrics.json)\n- [Unreviewed visual records](visual-reviews.json)\n\n| Automated check | Result | Condition |\n|---|---:|---|\n${[
    ["Birth fidelity", metric.birthFidelity],
    ["Inherited agreement", metric.inheritedAgreement],
    ["Needs agreement", metric.needsAgreement],
    ["Replay", metric.replayAgreement],
    ["Future pulse causality", metric.futureCausality],
    ["Any treated pixel change", metric.renderedChange],
  ]
    .map(
      ([label, r]) =>
        `| ${label} | ${(r as ReturnType<typeof rate>).numerator}/${(r as ReturnType<typeof rate>).denominator} (${(r as ReturnType<typeof rate>).percent?.toFixed(1)}%) | ${(r as ReturnType<typeof rate>).condition} |`,
    )
    .join(
      "\n",
    )}\n\nFailures retained: ${failures.length}. Source files unchanged during capture: ${unchanged}. Limits are25% inherited-opportunity-scaled length bias,20° bend bias,8% priority bias,2.5-day rise and28-day decay; these are modifier bounds, not promises of visible pixel extent. No grooming gesture directly paints the source.\n`;
  await writeFile(join(directory, "REPORT.md"), report);
  await writeFile(
    join(directory, "capture-source-verification.json"),
    JSON.stringify({ captureHash, before, after, unchanged }, null, 2) + "\n",
  );
  process.stdout.write(
    JSON.stringify({
      runId,
      directory,
      frames: views.length,
      failures: failures.length,
      sourceUnchanged: unchanged,
      renderedChange: metric.renderedChange,
    }) + "\n",
  );
  if (failures.length || views.length !== 64 || !unchanged)
    process.exitCode = 1;
}
main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});

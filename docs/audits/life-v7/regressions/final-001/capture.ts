/** Small independent edge-case gallery. Does not modify frozen audit tools or runtime. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  createSimulation,
  flattenAnatomy,
  type PetPart,
  type Pixel,
  type PetFrame,
} from "../../../../../src/simulation";
import { GALLERY_FIXTURES } from "../../../../../tools/gallery";
import { stressFixtures } from "../../../../../tools/benchmark";
import {
  frameHash,
  visibleContributions,
} from "../../../../../tools/audit/metrics";
import {
  writePng,
  rasterPixels,
  scaleRgba,
  blitRgba,
  drawBitmapText,
} from "../../../../../tools/audit/presentation";

const directory = resolve("docs/audits/life-v7/regressions/final-001"),
  seed = "life-v7-genome-01";
const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  color = "#FFFFFF",
): Pixel[] =>
  Array.from({ length: w * h }, (_, i) => ({
    x: x + (i % w),
    y: y + Math.floor(i / w),
    color,
  }));
const part = (
  id: string,
  kind: PetPart["kind"],
  pixels: Pixel[],
  parentId: string | null = null,
): PetPart => ({
  id,
  kind,
  name: id,
  pixels,
  parentId,
  position: { x: 0, y: 0 },
});
const existing = (name: string) =>
  clone(GALLERY_FIXTURES.find((f) => f.name.startsWith(name))!.parts);
type Fixture = {
  id: string;
  name: string;
  mode: "infant" | "egg";
  parts: PetPart[];
  source: string;
  expectations: string[];
};
function fixtures(): Fixture[] {
  const hollow = existing("Hollow face"),
    floating = existing("Floating eyes");
  hollow.push(...floating.filter((p) => p.kind === "hand"));
  const unlabelled = rect(8, 8, 16, 14).filter(
    (p) => p.x === 8 || p.x === 23 || p.y === 8 || p.y === 21,
  );
  unlabelled.push(...rect(3, 4, 2, 2), ...rect(27, 25, 2, 2));
  return [
    {
      id: "hollow-floating",
      name: "Hollow head with detached eyes and hands",
      mode: "infant",
      parts: hollow,
      source: "tools/gallery.ts hollow + floating hand masks",
      expectations: [
        "Interior cyan eyes remain readable and follow their hollow head.",
        "The white hand islands remain deliberately detached; no artificial arms or bridges are required.",
        "The source head cavity is real negative space, not an opaque facial decal.",
      ],
    },
    {
      id: "multiple-heads",
      name: "Two heads with distinct authored faces",
      mode: "infant",
      parts: [
        part("body", "body", rect(10, 17, 12, 8, "#AAAAAA")),
        part("head-left", "head", rect(5, 6, 8, 8, "#DDDDDD"), "body"),
        part("head-right", "head", rect(19, 6, 8, 8, "#C7AD72"), "body"),
        part("eye-left", "eye", rect(8, 9, 1, 1, "#000000"), "head-left"),
        part("eye-right", "eye", rect(23, 9, 1, 1, "#000000"), "head-right"),
      ],
      source: "Standalone two-head extension of existing rectangle fixtures",
      expectations: [
        "Both distinct facial identities remain readable; two source heads are not treated as one accidental eye group.",
        "Source gaps are exact at birth; later explicit joints may develop.",
      ],
    },
    {
      id: "unlabelled",
      name: "Only unlabelled body ink with disconnected fragments",
      mode: "infant",
      parts: [part("freeform", "body", unlabelled)],
      source:
        "Standalone optional-label fixture; every pixel is freeform body tissue",
      expectations: [
        "No facial or limb hints are supplied.",
        "All authored fragments and the central gap are preserved at birth; no arbitrary-drawing rejection.",
      ],
    },
    {
      id: "hair",
      name: "Rooted hair and bright eyes on a hollow head",
      mode: "infant",
      parts: existing("Rooted hair"),
      source: "tools/gallery.ts hair fixture",
      expectations: [
        "Gold hair remains visibly rooted to its inferred host.",
        "The two cyan eyes remain distinguishable within the hollow face.",
      ],
    },
    {
      id: "limbless",
      name: "Limbless body without authored facial features",
      mode: "infant",
      parts: existing("Limbless"),
      source: "tools/gallery.ts limbless fixture",
      expectations: [
        "No eyes or mouths are invented.",
        "The absence of authored legs must have a suitable motion fallback.",
      ],
    },
    {
      id: "single-pixel",
      name: "One authored pixel",
      mode: "infant",
      parts: [part("single", "body", [{ x: 16, y: 16, color: "#FFFFFF" }])],
      source: "Existing single-pixel regression pattern",
      expectations: [
        "Exact one-pixel birth and a nonempty, finite descendant.",
        "No semantic face is inferred from a lone pixel.",
      ],
    },
    {
      id: "dense",
      name: "Maximum overlapping typed masks",
      mode: "infant",
      parts: clone(stressFixtures()[0].parts),
      source: "tools/benchmark.ts stressFixtures()[0]",
      expectations: [
        "All 15 full overlapping typed masks are accepted within source budgets.",
        "The source deliberately has no contrasting facial artwork; visible faces cannot be demanded from this input.",
      ],
    },
    {
      id: "egg",
      name: "Drawn egg and generated hatchling",
      mode: "egg",
      parts: existing("Same drawn egg"),
      source: "tools/gallery.ts egg fixture",
      expectations: [
        "The complete authored egg is exact at time zero.",
        "Cracking, hatching and subsequent infant development are distinct; offspring need not resemble shell artwork.",
      ],
    },
  ];
}
async function save(path: string, value: unknown) {
  await writeFile(
    join(directory, path),
    JSON.stringify(value, null, 2) + "\n",
    { flag: "wx" },
  );
}
async function sourceHashes() {
  const parent = JSON.parse(
    await readFile(
      "docs/audits/life-v7/v7-regional-proof-004/manifest.json",
      "utf8",
    ),
  );
  const files = [
    ...Object.keys(parent.sourceHashes),
    "tools/gallery.ts",
    "tools/benchmark.ts",
    "docs/audits/life-v7/regressions/final-001/capture.ts",
  ];
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [file, sha(await readFile(file))]),
    ),
  );
}
function featureFacts(frame: PetFrame) {
  const visible = visibleContributions(frame);
  return frame.parts
    .filter((p) => ["eye", "mouth", "hand", "hair", "head"].includes(p.kind))
    .map((p) => ({
      id: p.id,
      kind: p.kind,
      parentId: p.parentId,
      relationship: p.relationship,
      sourcePartIds: p.sourcePartIds,
      pixelCount: p.pixels.length,
      winningPixels:
        visible.parts.find((v) => v.id === p.id)?.winningPixels ?? 0,
    }));
}
async function atlas(
  name: string,
  rows: any[],
  columns: number,
  scale: number,
) {
  const cell = 64 * scale,
    w = columns * cell,
    h = Math.ceil(rows.length / columns) * (cell + 24),
    rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i],
      x = (i % columns) * cell,
      y = Math.floor(i / columns) * (cell + 24),
      im = scaleRgba(rasterPixels(row.pixels ?? []), 64, 64, scale);
    blitRgba(rgba, w, h, im.rgba, cell, cell, x, y);
    drawBitmapText(rgba, w, h, row.label ?? row.id, x, y + cell + 4);
  }
  await writePng(join(directory, name), w, h, rgba);
}
async function main() {
  try {
    await access(join(directory, "manifest.json"));
    throw new Error(
      "Frozen regression run already exists; use a new directory",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(join(directory, "images"), { recursive: true });
  await mkdir(join(directory, "sources"), { recursive: true });
  await mkdir(join(directory, "frames"), { recursive: true });
  const sources = fixtures(),
    before = await sourceHashes(),
    plans: any[] = [],
    rows: any[] = [],
    failures: any[] = [],
    sourceRows: any[] = [];
  for (const fixture of sources) {
    const sourcePixels = flattenAnatomy(fixture.parts).map((p) => ({
      ...p,
      x: p.x + 16,
      y: p.y + 16,
    }));
    await writePng(
      join(directory, "sources", fixture.id + ".png"),
      64,
      64,
      rasterPixels(sourcePixels),
    );
    sourceRows.push({
      id: fixture.id,
      label: fixture.id,
      pixels: sourcePixels,
    });
    const sim = createSimulation(fixture.parts, seed, fixture.mode, {
      needTimeline: [],
      groomingTimeline: [],
    });
    const endpoints =
      fixture.mode === "egg"
        ? [
            { age: 0, label: "egg-source" },
            { age: sim.hatchAt - 0.01, label: "hatch-minus" },
            { age: sim.hatchAt, label: "hatch-at" },
            { age: sim.hatchAt + 0.01, label: "hatch-plus" },
            ...[30, 75, 120].map((d) => ({
              age: sim.hatchAt + d,
              label: "dev" + d,
            })),
          ]
        : [0, 30, 75, 120].map((age) => ({ age, label: "d" + age }));
    const cases = endpoints.map((e) => ({
      id: fixture.id + "__" + e.label,
      fixtureId: fixture.id,
      kind: "endpoint",
      age: e.age,
      time: 0,
      action: "idle",
      label: fixture.id + " " + e.label,
    }));
    const motionAge = (
      {
        "hollow-floating": 75,
        "multiple-heads": 75,
        hair: 120,
        limbless: 75,
      } as Record<string, number>
    )[fixture.id];
    if (motionAge !== undefined) {
      const pace = Math.max(
        0.01,
        sim.frameAt(motionAge, { time: 0, action: "move" }).motionPace,
      );
      for (let phase = 0; phase < 8; phase++)
        cases.push({
          id: fixture.id + "__motion" + phase,
          fixtureId: fixture.id,
          kind: "motion",
          age: motionAge,
          time: phase / (8 * pace) + 1e-8,
          action: "move",
          label: fixture.id + " p" + phase,
        } as any);
    }
    for (const plan of cases) {
      plans.push(plan);
      try {
        const frame = sim.frameAt(plan.age, {
            time: plan.time,
            action: plan.action as "idle" | "move",
          }),
          valid = frame.pixels.every(
            (p) =>
              Number.isInteger(p.x) &&
              Number.isInteger(p.y) &&
              p.x >= 0 &&
              p.y >= 0 &&
              p.x < 64 &&
              p.y < 64,
          );
        const row = {
          ...plan,
          hash: frameHash(frame),
          pixels: frame.pixels,
          valid,
          stage: frame.stage,
          developmentalAge: frame.developmentalAge,
          features: featureFacts(frame),
          movement: frame.movementMode,
          diagnostics: frame.interaction.diagnostics,
        };
        await writePng(
          join(directory, "images", plan.id + ".png"),
          64,
          64,
          rasterPixels(frame.pixels),
        );
        await save("frames/" + plan.id + ".json", row);
        rows.push(row);
      } catch (error) {
        const failure = {
          ...plan,
          error: error instanceof Error ? error.stack : String(error),
        };
        failures.push(failure);
        rows.push({ ...failure, pixels: [] });
      }
    }
  }
  const after = await sourceHashes(),
    unchanged = sha(JSON.stringify(before)) === sha(JSON.stringify(after));
  const manifest = {
    protocol: "edge-regression-visual-v7-1",
    createdAt: new Date().toISOString(),
    seed,
    sourceHashes: before,
    sourceHashDigest: sha(JSON.stringify(before)),
    sourceUnchanged: unchanged,
    sourceHashesAfter: after,
    sources,
    plans,
    expected: {
      fixtures: 8,
      endpoints: 35,
      motionFrames: 32,
      renderedConditions: 67,
      sourceImages: 8,
    },
    actual: {
      renderedConditions: rows.length,
      endpoints: rows.filter((r) => r.kind === "endpoint").length,
      motionFrames: rows.filter((r) => r.kind === "motion").length,
      validFrames: rows.filter((r) => r.valid).length,
      failures: failures.length,
    },
    failures,
    warning:
      "Small fixed edge cohort. Automated feature bookkeeping is not visual feature verification. Reviews remain unreviewed until actual images are inspected. Separate from population/main proof denominators.",
  };
  await save("manifest.json", manifest);
  await save("sources.json", sources);
  await save(
    "frame-index.json",
    rows.map(({ pixels, ...row }) => row),
  );
  await save(
    "visual-review-template.json",
    sources.map((s) => ({
      fixtureId: s.id,
      reviewer: null,
      status: "unreviewed",
      actualImagesInspected: [],
      featureVisibility: null,
      expectedGaps: null,
      motionContinuity: null,
      notes: "Unreviewed",
    })),
  );
  await atlas("sources.png", sourceRows, 4, 3);
  await atlas(
    "endpoints.png",
    rows.filter((r) => r.kind === "endpoint"),
    6,
    3,
  );
  await atlas(
    "motion.png",
    rows.filter((r) => r.kind === "motion"),
    8,
    2,
  );
  const safe = (value: unknown) =>
    JSON.stringify(value).replaceAll("<", "\\u003c");
  await writeFile(
    join(directory, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Small edge regression gallery</title><style>body{background:#111;color:#ddd;font:14px system-ui;margin:20px}a{color:#bcd}img{width:192px;height:192px;image-rendering:pixelated;background:#000}.strip{display:flex;gap:10px;overflow:auto}figure{margin:6px}select{font:inherit;margin:10px}article{border-top:1px solid #666;margin:16px 0}small{color:#aaa}</style><h1>Small edge regression gallery</h1><p>Eight fixed sources;67 rendered conditions plus8 source images. Fixed raw seed ${seed}; needs75%; no grooming. Actual images only. No automatic visual pass or human acceptance.</p><a href="manifest.json">Frozen recipe/hashes</a> · <a href="visual-review.json">Actual-image review (when completed)</a><select id="filter"><option value="all">All fixtures</option>${sources.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select><main></main><script>const sources=${safe(sources.map(({ parts, ...s }) => s))},rows=${safe(rows.map(({ pixels, diagnostics, ...r }) => r))};function image(path){const i=new Image;i.src=path;return i}function fig(path,label){const f=document.createElement('figure'),c=document.createElement('figcaption');c.textContent=label;f.append(image(path),c);return f}function draw(){const main=document.querySelector('main');main.replaceChildren();for(const s of sources.filter(s=>filter.value==='all'||s.id===filter.value)){const a=document.createElement('article'),h=document.createElement('h2'),p=document.createElement('p'),strip=document.createElement('div');h.textContent=s.name;p.textContent=s.expectations.join(' ');strip.className='strip';strip.append(fig('sources/'+s.id+'.png','Authored source'));for(const r of rows.filter(r=>r.fixtureId===s.id&&r.kind==='endpoint'))strip.append(fig('images/'+r.id+'.png',r.label+' · raw age '+r.age.toFixed(4)));a.append(h,p,strip);const phases=rows.filter(r=>r.fixtureId===s.id&&r.kind==='motion');if(phases.length){const f=fig('images/'+phases[0].id+'.png','Eight held motion phases, age '+phases[0].age);f._phases=phases;a.append(f)}main.append(a)}}const filter=document.getElementById('filter');filter.onchange=draw;let phase=0;setInterval(()=>{phase=(phase+1)%8;for(const f of document.querySelectorAll('figure'))if(f._phases)f.querySelector('img').src='images/'+f._phases[phase].id+'.png'},125);draw();</script>`,
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        directory,
        expected: manifest.expected,
        actual: manifest.actual,
        sourceUnchanged: unchanged,
      },
      null,
      2,
    ),
  );
  if (!unchanged || rows.length !== 67 || failures.length) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

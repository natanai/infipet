/** Generate a standalone, seeded visual audit from the actual development engine. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createSimulation,
  type PetPart,
  type Pixel,
  type Point,
  type PartKind,
  type PetFrame,
  type SourceMode,
} from "../src/simulation";
import type { NeedKeyframe } from "../src/needs";

export type GalleryFixture = {
  name: string;
  seed: string;
  mode: SourceMode;
  parts: PetPart[];
  needTimeline?: NeedKeyframe[];
};

const rect = (x: number, y: number, width: number, height: number): Point[] =>
  Array.from({ length: width * height }, (_, index) => ({
    x: x + (index % width),
    y: y + Math.floor(index / width),
  }));
const outline = (
  x: number,
  y: number,
  width: number,
  height: number,
): Point[] =>
  rect(x, y, width, height).filter(
    (p) =>
      p.x === x || p.y === y || p.x === x + width - 1 || p.y === y + height - 1,
  );
const part = (
  id: string,
  kind: PartKind,
  cells: Point[],
  color: string,
  parentId: string | null = null,
): PetPart => ({
  id,
  kind,
  name: id,
  position: { x: 0, y: 0 },
  parentId,
  pixels: cells.map((p) => ({ ...p, color })),
});

function hollow(): PetPart[] {
  return [
    part("body", "body", rect(11, 17, 10, 8), "#AAAAAA"),
    part("head", "head", outline(7, 4, 18, 15), "#DDDDDD", "body"),
    part("eye-left", "eye", [{ x: 12, y: 10 }], "#18D7E8", "head"),
    part("eye-right", "eye", [{ x: 19, y: 10 }], "#18D7E8", "head"),
    part("mouth", "mouth", rect(14, 14, 4, 1), "#C7AD72", "head"),
    part("leg-left", "leg", rect(12, 25, 2, 4), "#AAAAAA", "body"),
    part("leg-right", "leg", rect(18, 25, 2, 4), "#AAAAAA", "body"),
    part("foot-left", "foot", rect(11, 29, 4, 1), "#777777", "leg-left"),
    part("foot-right", "foot", rect(18, 29, 4, 1), "#777777", "leg-right"),
  ];
}

function limbless(): PetPart[] {
  const pixels = rect(5, 10, 23, 12).filter(
    (p) => ((p.x - 16) / 11) ** 2 + ((p.y - 16) / 5.5) ** 2 < 1,
  );
  return [part("mass", "body", pixels, "#B7C6AF")];
}

function floating(): PetPart[] {
  return [
    part("body", "body", rect(11, 12, 10, 12), "#AAAAAA"),
    part("eye-left", "eye", [{ x: 3, y: 6 }], "#18D7E8", "body"),
    part("eye-right", "eye", [{ x: 28, y: 6 }], "#18D7E8", "body"),
    part("hand-left", "hand", rect(1, 15, 3, 3), "#DDDDDD", "body"),
    part("hand-right", "hand", rect(28, 15, 3, 3), "#DDDDDD", "body"),
    part("foot-left", "foot", rect(3, 28, 4, 1), "#777777", "body"),
    part("foot-right", "foot", rect(25, 28, 4, 1), "#777777", "body"),
  ];
}

function hair(): PetPart[] {
  return [
    part("body", "body", rect(12, 16, 8, 10), "#AAAAAA"),
    part("head", "head", outline(9, 5, 14, 13), "#DDDDDD", "body"),
    part("eye-left", "eye", rect(12, 10, 1, 2), "#18D7E8", "head"),
    part("eye-right", "eye", rect(19, 10, 1, 2), "#18D7E8", "head"),
    part(
      "hair",
      "hair",
      [
        ...rect(10, 4, 12, 2),
        ...rect(10, 1, 2, 3),
        ...rect(15, 0, 2, 4),
        ...rect(20, 2, 2, 2),
      ],
      "#C7AD72",
      "head",
    ),
  ];
}

function egg(): PetPart[] {
  const pixels = rect(9, 6, 14, 20).filter(
    (p) => ((p.x - 15.5) / 6.8) ** 2 + ((p.y - 16) / 9.8) ** 2 < 1,
  );
  return [
    {
      ...part("shell", "egg", pixels, "#DDDDDD"),
      pixels: pixels.map((p) => ({
        ...p,
        color: (p.x + p.y * 3) % 13 === 0 ? "#18D7E8" : "#DDDDDD",
      })),
    },
  ];
}

/** Hand-authored test drawings; no adult sprites or generated screenshots as inputs. */
export const GALLERY_FIXTURES: GalleryFixture[] = [
  {
    name: "Hollow face / interior features",
    seed: "outline-face",
    mode: "infant",
    parts: hollow(),
  },
  {
    name: "Limbless / no invented eyes",
    seed: "soft-river",
    mode: "infant",
    parts: limbless(),
  },
  {
    name: "Floating eyes, hands and feet",
    seed: "drifting-hands",
    mode: "infant",
    parts: floating(),
  },
  {
    name: "Rooted hair on a hollow head",
    seed: "wild-fringe",
    mode: "infant",
    parts: hair(),
  },
  ...[
    "87320104",
    "velvet-orbit",
    "pond-19",
    "copper-lilt",
    "starling-6",
    "tiny-comet",
  ].map((seed) => ({
    name: `Same drawn egg / ${seed}`,
    seed,
    mode: "egg" as const,
    parts: egg(),
  })),
];

export const CARE_CONDITIONS: { name: string; timeline: NeedKeyframe[] }[] = [
  { name: "Neutral / 75% default", timeline: [] },
  {
    name: "Safety unmet from birth",
    timeline: [{ needId: "safety", tick: 0, fulfillment: 0 }],
  },
  {
    name: "Safety restored on day 75",
    timeline: [
      { needId: "safety", tick: 0, fulfillment: 0 },
      { needId: "safety", tick: 75 * 24, fulfillment: 1 },
    ],
  },
  {
    name: "Fitness and Rest fully tended",
    timeline: [
      { needId: "physical-fitness", tick: 0, fulfillment: 1 },
      { needId: "rest", tick: 0, fulfillment: 1 },
    ],
  },
];

/** Same authored drawing and genome; care histories are the only changed input. */
export function careComparisons() {
  const fixture = GALLERY_FIXTURES[0];
  const comparisons = CARE_CONDITIONS.map((condition) => {
    const simulation = createSimulation(
      fixture.parts,
      fixture.seed,
      fixture.mode,
      { needTimeline: condition.timeline },
    );
    const snapshots = [75, 120, 240].map((developmentalAge) => {
      const age = simulation.hatchAt + developmentalAge;
      const frame = simulation.frameAt(age);
      if (frame.developmentalAge !== developmentalAge || frame.age !== age)
        throw new Error(
          `${condition.name}: the ${developmentalAge}-day check was clamped or shifted.`,
        );
      const state = frame.wellbeing;
      const actualNeeds = Object.fromEntries(
        ["safety", "rest", "physical-fitness"].map((id) => [
          id,
          state.needs[id as "safety" | "rest" | "physical-fitness"],
        ]),
      );
      return {
        developmentalAge,
        age,
        frame,
        stats: frameStats(frame),
        actualNeeds,
        development: state.development,
      };
    });
    return { condition, simulation, snapshots };
  });
  const fingerprints = new Set(
    comparisons.map((item) => item.simulation.genome.fingerprint),
  );
  if (fingerprints.size !== 1)
    throw new Error(
      "Changing care history changed the fixed genome fingerprint.",
    );
  return {
    fixture,
    fingerprint: comparisons[0].simulation.genome.fingerprint,
    comparisons,
  };
}

export function topology(pixels: Pixel[]): {
  components: number;
  holes: number;
} {
  const foreground = new Set(pixels.map((p) => p.y * 64 + p.x));
  const count = (positions: Set<number>, diagonal: boolean) => {
    let components = 0;
    let enclosed = 0;
    while (positions.size) {
      components += 1;
      const queue = [positions.values().next().value!];
      positions.delete(queue[0]);
      let edge = false;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const key = queue[cursor],
          x = key % 64,
          y = Math.floor(key / 64);
        if (x === 0 || y === 0 || x === 63 || y === 63) edge = true;
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= 64 || ny >= 64) continue;
            const next = ny * 64 + nx;
            if (positions.delete(next)) queue.push(next);
          }
      }
      if (!edge) enclosed += 1;
    }
    return { components, enclosed };
  };
  const background = new Set<number>();
  for (let key = 0; key < 4096; key += 1)
    if (!foreground.has(key)) background.add(key);
  return {
    components: count(new Set(foreground), true).components,
    holes: count(background, false).enclosed,
  };
}

const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
const svg = (pixels: Pixel[]) =>
  `<svg viewBox="0 0 64 64" role="img" aria-label="64 by 64 pet snapshot" shape-rendering="crispEdges">${pixels.map((p) => `<rect x="${p.x}" y="${p.y}" width="1" height="1" fill="${escape(p.color)}"/>`).join("")}</svg>`;

function frameStats(frame: PetFrame) {
  const kinds: Record<string, number> = {};
  const provenance: Record<string, number> = {};
  const relationships: Record<string, number> = {};
  for (const part of frame.parts) {
    kinds[part.kind] = (kinds[part.kind] ?? 0) + 1;
    provenance[part.provenance] = (provenance[part.provenance] ?? 0) + 1;
    relationships[part.relationship] =
      (relationships[part.relationship] ?? 0) + 1;
  }
  return {
    cells: frame.cellCount,
    ...topology(frame.pixels),
    movement: frame.movementMode,
    kinds,
    provenance,
    relationships,
  };
}

export async function generateGallery(
  destination = resolve("docs/gallery.html"),
) {
  const results = GALLERY_FIXTURES.map((fixture) => {
    const simulation = createSimulation(
      fixture.parts,
      fixture.seed,
      fixture.mode,
      { needTimeline: fixture.needTimeline ?? [] },
    );
    const milestones = simulation.milestones.filter(
      (milestone) => milestone.stage !== "egg",
    );
    if (
      milestones.map((milestone) => milestone.stage).join(",") !==
      "infant,teen,adult,elderly"
    )
      throw new Error(
        `${fixture.name}: expected infant, teen, adult and elderly milestones.`,
      );
    const snapshots = milestones.map((milestone) => {
      const frame = simulation.frameAt(milestone.age);
      if (frame.stage !== milestone.stage)
        throw new Error(
          `${fixture.name}: milestone ${milestone.stage} renders ${frame.stage}.`,
        );
      if (
        frame.pixels.some(
          (pixel) =>
            !Number.isInteger(pixel.x) ||
            !Number.isInteger(pixel.y) ||
            pixel.x < 0 ||
            pixel.y < 0 ||
            pixel.x >= 64 ||
            pixel.y >= 64,
        )
      )
        throw new Error(
          `${fixture.name}: rendered pixels leave the 64 by 64 world.`,
        );
      return { ...milestone, frame, stats: frameStats(frame) };
    });
    const operators: Record<string, number> = {};
    for (const operator of simulation.program.operators)
      operators[operator.kind] = (operators[operator.kind] ?? 0) + 1;
    const incubation =
      fixture.mode === "egg"
        ? [
            { label: "DRAWN EGG", age: 0 },
            {
              label: "HATCHING",
              age: Math.max(0, simulation.hatchAt - 1),
            },
            { label: "HATCHED", age: simulation.hatchAt },
          ].map((sample) => ({
            ...sample,
            frame: simulation.frameAt(sample.age),
          }))
        : [];
    return { fixture, simulation, snapshots, operators, incubation };
  });
  const cards = results
    .map(
      ({ fixture, simulation, snapshots, operators, incubation }) =>
        `<article data-mode="${fixture.mode}"><header><h2>${escape(fixture.name)}</h2><p>${escape(fixture.mode.toUpperCase())} · seed ${escape(fixture.seed)} · #${escape(simulation.genome.fingerprint)}${fixture.mode === "egg" ? ` · hatch at ${simulation.hatchAt.toFixed(2)}` : ""}</p></header>${incubation.length ? `<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px">${incubation.map((sample) => `<figure style="width:128px">${svg(sample.frame.pixels)}<figcaption>${sample.label} / ${sample.age.toFixed(2)}</figcaption></figure>`).join("")}</div>` : ""}<div class="stages">${snapshots.map(({ stage, age, frame, stats }) => `<figure>${svg(frame.pixels)}<figcaption><b>${escape(stage.toUpperCase())}</b> / ${age.toFixed(2)}<br>${stats.cells} cells · ${stats.components} islands · ${stats.holes} holes<br>${escape(stats.movement)} · ${frame.parts.length} tissues</figcaption><details><summary>Frame facts</summary><pre>${escape(JSON.stringify(stats, null, 2))}</pre></details></figure>`).join("")}</div><p class="operators">Actual program: ${escape(
          Object.entries(operators)
            .map(([kind, count]) => `${kind} ×${count}`)
            .join(" / "),
        )}</p><details><summary>Development program and source drawing</summary><pre>${escape(JSON.stringify({ program: simulation.program, source: fixture.parts }, null, 2))}</pre></details></article>`,
    )
    .join("");
  const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>INFIPET.EXE / Growth gallery</title><style>@font-face{font-family:DOS;src:url('../assets/fonts/DOS.ttf')}*{box-sizing:border-box}body{margin:0;padding:24px;background:#000;color:#aaa;font:16px DOS,monospace}main{max-width:1240px;margin:auto}h1,h2,b{font-size:inherit;font-weight:400;color:#ddd}h1{font-size:24px}p{line-height:1.4}a,summary{color:#ddd}a:focus,summary:focus,button:focus{outline:1px dotted #ddd}nav{display:flex;flex-wrap:wrap;gap:12px;margin:24px 0}button{font:inherit;background:#000;border:1px solid #444;color:#aaa;padding:9px;cursor:pointer}button[aria-pressed=true]{color:#000;background:#ddd}article{border:1px solid #444;padding:16px;margin:16px 0}header p,.operators{color:#777}header h2{margin-top:0}.stages{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}figure{margin:0;min-width:0}svg{width:100%;background:#080808;aspect-ratio:1;image-rendering:pixelated}figcaption{line-height:1.4;margin-top:8px;font-size:14px}details{margin-top:12px}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px DOS,monospace;line-height:1.35;color:#777}.note{max-width:840px}.hidden{display:none}@media(max-width:700px){body{padding:12px}.stages{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(prefers-reduced-motion:no-preference){button:hover{border-color:#ddd}}</style><main><h1>INFIPET.EXE / SEEDED GROWTH GALLERY</h1><p class="note">Actual 64×64 engine output at infant, teen, adult and elderly milestones. Each specimen keeps one drawing and seed through its timeline. Egg specimens all begin with the same authored shell; their creatures develop from different seeds. Open the facts to inspect topology, provenance and the real development operators.</p><p class="note">This page is a generated audit artifact. It uses no adult sprite templates or manually edited screenshots. Regenerate with <code>tsx tools/gallery.ts</code>.</p><nav aria-label="Specimen filter"><button data-filter="all" aria-pressed="true">ALL</button><button data-filter="infant" aria-pressed="false">DRAWN INFANTS</button><button data-filter="egg" aria-pressed="false">SAME EGG / DIFFERENT SEEDS</button></nav>${cards}<p>Font by <a href="https://int10h.org/oldschool-pc-fonts/">VileR</a> / <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Generated from the local development engine.</p></main><script>document.querySelectorAll('button[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('button[data-filter]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));document.querySelectorAll('article').forEach(card=>card.classList.toggle('hidden',button.dataset.filter!=='all'&&card.dataset.mode!==button.dataset.filter));}));</script></html>`;
  const care = careComparisons();
  const careCard = `<article data-mode="care"><header><h2>NEEDS / SAME DRAWING + SEED</h2><p>${escape(care.fixture.name)} · seed ${escape(care.fixture.seed)} · shared genome #${escape(care.fingerprint)}</p></header><p>All four histories use the same authored pixels and seed. Genome fingerprint equality is checked before this artifact is generated. Open the facts to inspect fulfillment, exposure, memory and appearance signals. The last column verifies the new 240-day endpoint.</p>${care.comparisons.map(({ condition, snapshots }) => `<h2>${escape(condition.name)}</h2><div class="stages" style="grid-template-columns:repeat(3,minmax(0,1fr))">${snapshots.map(({ developmentalAge, frame, stats, actualNeeds, development }) => `<figure>${svg(frame.pixels)}<figcaption><b>${escape(frame.stage.toUpperCase())}</b> / DAY ${developmentalAge}<br>${stats.cells} cells · ${stats.components} islands · ${stats.holes} holes<br>Safety ${Math.round(actualNeeds.safety.fulfillment * 100)}% · Rest ${Math.round(actualNeeds.rest.fulfillment * 100)}% · Fitness ${Math.round(actualNeeds["physical-fitness"].fulfillment * 100)}%</figcaption><details><summary>Actual care state and appearance signals</summary><pre>${escape(JSON.stringify({ needs: actualNeeds, development, stats, feelings: frame.wellbeing.feelings }, null, 2))}</pre></details></figure>`).join("")}</div><details><summary>Recorded history</summary><pre>${escape(JSON.stringify(condition.timeline, null, 2))}</pre></details>`).join("")}</article>`;
  const auditedPage = page
    .replace(
      "</nav>",
      '<button data-filter="care" aria-pressed="false">NEEDS / SAME GENOME</button></nav>',
    )
    .replace("<p>Font by", `${careCard}<p>Font by`);
  await mkdir(resolve(destination, ".."), { recursive: true });
  await writeFile(destination, auditedPage, "utf8");
  return {
    path: destination,
    specimens: results.length,
    snapshots: results.reduce(
      (count, result) => count + result.snapshots.length,
      0,
    ),
    incubationSnapshots: results.reduce(
      (count, result) => count + result.incubation.length,
      0,
    ),
    careSnapshots: care.comparisons.reduce(
      (count, condition) => count + condition.snapshots.length,
      0,
    ),
    careGenomeFingerprint: care.fingerprint,
    operatorKinds: [
      ...new Set(results.flatMap((result) => Object.keys(result.operators))),
    ].sort(),
  };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/gallery.ts")) {
  generateGallery()
    .then((result) =>
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    )
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exitCode = 1;
    });
}

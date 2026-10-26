import assert from "node:assert/strict";
import test from "node:test";
import {
  createSimulation,
  getBlueprintCacheStats,
  createStarterAnatomy,
  flattenAnatomy,
  normalizeAnatomy,
  pixelPaintDepth,
  anatomyPaintOrder,
  compareAnatomyLayer,
  PART_KINDS,
  PART_SIZE,
  DRAW_SIZE,
  WORLD_SIZE,
  type PetPart,
  type Pixel,
  type PetAction,
  type SourceMode,
} from "../src/simulation";
import type { NeedKeyframe } from "../src/needs";
import { inferAnatomy, paintStroke } from "../src/drawing";
const offset = 16;
const actions: PetAction[] = ["idle", "move", "play", "greet"];
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
function rect(
  id: string,
  kind: PetPart["kind"],
  x: number,
  y: number,
  w: number,
  h: number,
  parentId: string | null = null,
  color = "#aaaaaa",
): PetPart {
  return {
    id,
    kind,
    name: id,
    position: { x: 0, y: 0 },
    parentId,
    pixels: Array.from({ length: w * h }, (_, i) => ({
      x: x + (i % w),
      y: y + Math.floor(i / w),
      color,
    })),
  };
}
function ring(
  id: string,
  kind: PetPart["kind"],
  x: number,
  y: number,
  w: number,
  h: number,
  parentId: string | null = null,
): PetPart {
  const p = rect(id, kind, x, y, w, h, parentId);
  p.pixels = p.pixels.filter(
    (p) => p.x === x || p.x === x + w - 1 || p.y === y || p.y === y + h - 1,
  );
  return p;
}
function components(pixels: Pixel[]): number {
  const cells = new Set(pixels.map((p) => p.y * 64 + p.x));
  let count = 0;
  while (cells.size) {
    count++;
    const queue = [cells.values().next().value!];
    cells.delete(queue[0]);
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i],
        x = k % 64,
        y = Math.floor(k / 64);
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]) {
        const xx = x + dx,
          yy = y + dy;
        if (
          xx >= 0 &&
          yy >= 0 &&
          xx < 64 &&
          yy < 64 &&
          cells.delete(yy * 64 + xx)
        )
          queue.push(yy * 64 + xx);
      }
    }
  }
  return count;
}
const authoredParts = (
  f: ReturnType<ReturnType<typeof createSimulation>["frameAt"]>,
) => f.parts.filter((p) => p.provenance === "authored");

test("infant day zero exactly preserves every starter and per-pixel painted overlap", () => {
  for (const preset of ["biped", "crawler", "winged", "egg"] as const) {
    const p = createStarterAnatomy(preset),
      s = createSimulation(p, "authored", "infant"),
      f = s.frameAt(0);
    assert.deepEqual(
      f.pixels,
      flattenAnatomy(p).map((c) => ({
        ...c,
        x: c.x + offset,
        y: c.y + offset,
      })),
    );
    assert.equal(authoredParts(f).length, p.length);
    assert.equal(f.stage, "infant");
  }
  const p = [
    rect("body", "body", 5, 5, 3, 1),
    rect("eye", "eye", 6, 5, 2, 1, "body", "#000000"),
    rect("arm", "arm", 5, 5, 1, 1, "body", "#777777"),
  ];
  p[0].pixels[1].z = 10002;
  p[2].pixels[0].z = 10001;
  const flat = flattenAnatomy(p);
  assert.deepEqual(
    flat.map((c) => c.color),
    ["#777777", "#aaaaaa", "#000000"],
  );
  const f = createSimulation(p, "depths").frameAt(0);
  assert.deepEqual(
    f.pixels,
    flat.map((c) => ({ ...c, x: c.x + 16, y: c.y + 16 })),
  );
  assert.equal(f.parts.find((p) => p.id === "eye")!.pixels.length, 2);
});

test("the four developmental milestones are exact and egg incubation precedes the same full lifetime", () => {
  for (const mode of ["infant", "egg"] as SourceMode[]) {
    const s = createSimulation(
      createStarterAnatomy(mode === "egg" ? "egg" : "biped"),
      "life",
      mode,
    );
    assert.equal(s.genome.version, 7);
    assert.equal(s.program.version, 7);
    if (mode === "egg") assert.ok(s.hatchAt >= 4 && s.hatchAt <= 10);
    else assert.equal(s.hatchAt, 0);
    assert.equal(s.maxAge, s.hatchAt + 240);
    const developmentalMilestones = s.milestones
      .filter((milestone) => milestone.stage !== "egg")
      .map((milestone) => milestone.age - s.hatchAt);
    assert.equal(developmentalMilestones.length, 4);
    for (const [index, day] of [0, 30, 75, 120].entries())
      assert.ok(Math.abs(developmentalMilestones[index] - day) < 1e-10);
    for (const m of s.milestones) assert.equal(s.frameAt(m.age).stage, m.stage);
  }
});

test("seeded recipes reproduce across reordered input, source names, seek order, and all actions", () => {
  const p = createStarterAnatomy(),
    a = createSimulation(p, "replay"),
    b = createSimulation(
      [...p].reverse().map((p) => ({ ...p, pixels: [...p.pixels].reverse() })),
      "replay",
    );
  assert.deepEqual(a.genome, b.genome);
  assert.deepEqual(a.program, b.program);
  for (const age of [0, 12.3, 30, 75, 120])
    for (const action of actions)
      assert.deepEqual(
        a.frameAt(age, { time: 1.37, action, target: { x: 42, y: 30 } }),
        b.frameAt(age, { time: 1.37, action, target: { x: 42, y: 30 } }),
      );
  const early = a.frameAt(18.375, { time: 2, action: "move" });
  for (const age of [120, 0, 77, 19])
    a.frameAt(age, { time: 3, action: "play" });
  assert.deepEqual(a.frameAt(18.375, { time: 2, action: "move" }), early);
  const renamed = createSimulation(
    p.map((p) => ({ ...p, name: "renamed" })),
    "replay",
  );
  assert.equal(a.genome.fingerprint, renamed.genome.fingerprint);
  assert.ok(renamed.frameAt(0).parts.every((part) => part.name === "renamed"));
});

test("locale settings cannot affect Unicode identities, painting order, or replay", () => {
  const p = createStarterAnatomy(),
    names = new Map(
      p.map((p, i) => [p.id, `${["ä", "Z", "Ω", "🐾"][i % 4]}${i}`]),
    ),
    parts = p.map((p) => ({
      ...p,
      id: names.get(p.id)!,
      parentId: p.parentId ? names.get(p.parentId)! : null,
    }));
  const old = String.prototype.localeCompare;
  try {
    String.prototype.localeCompare = function () {
      throw new Error("locale collation forbidden");
    };
    const a = createSimulation(parts, "unicode"),
      b = createSimulation([...parts].reverse(), "unicode");
    assert.deepEqual(
      a.frameAt(75, { time: 1, action: "play" }),
      b.frameAt(75, { time: 1, action: "play" }),
    );
    assert.deepEqual(
      anatomyPaintOrder(parts),
      anatomyPaintOrder([...parts].reverse()),
    );
  } finally {
    String.prototype.localeCompare = old;
  }
});

test("drawing, seed, and source mode jointly determine the developmental program", () => {
  const p = createStarterAnatomy(),
    a = createSimulation(p, "fern"),
    b = createSimulation(p, "moss"),
    changed = structuredClone(p);
  changed[0].pixels[0].color = "#123456";
  const c = createSimulation(changed, "fern"),
    egg = createSimulation(p, "fern", "egg");
  assert.equal(a.genome.fingerprint, c.genome.fingerprint);
  assert.notDeepEqual(a.frameAt(0).pixels, c.frameAt(0).pixels);
  for (const other of [b, egg]) {
    assert.notEqual(a.genome.fingerprint, other.genome.fingerprint);
    assert.notDeepEqual(a.frameAt(75).pixels, other.frameAt(75).pixels);
  }
});

test("material markers prove adult growth is non-affine rather than uniform stretching", () => {
  const body = rect("body", "body", 9, 10, 13, 12),
    markers = [
      [11, 15],
      [15, 15],
      [19, 15],
      [15, 11],
      [15, 19],
    ].map(([x, y], i) => rect(`mark${i}`, "decoration", x, y, 1, 1, "body"));
  const s = createSimulation([body, ...markers], "fern"),
    a = s.frameAt(0),
    b = s.frameAt(75);
  const positions = (f: typeof a) =>
    markers.map((p) => f.parts.find((q) => q.id === p.id)!.anchor);
  const [p0, p1, p2, p3, p4] = positions(a);
  assert.ok(gap(p1, { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 }) < 0.001);
  assert.ok(gap(p1, { x: (p3.x + p4.x) / 2, y: (p3.y + p4.y) / 2 }) < 0.001);
  const [q0, q1, q2, q3, q4] = positions(b);
  assert.ok(
    Math.max(
      gap(q1, { x: (q0.x + q2.x) / 2, y: (q0.y + q2.y) / 2 }),
      gap(q1, { x: (q3.x + q4.x) / 2, y: (q3.y + q4.y) / 2 }),
    ) > 0.2,
    "independent regional material cages move a material midpoint off a globally affine midpoint",
  );
  assert.ok(b.cellCount > a.cellCount * 1.5);
});

test("authored body topology starts exact and later transformations retain material lineage", () => {
  const art = [ring("body", "body", 9, 10, 13, 12)],
    s = createSimulation(art, "fern");
  const birth = s.frameAt(0),
    filled = new Set(birth.pixels.map((p) => p.y * 64 + p.x));
  assert.ok(!filled.has(31 * 64 + 31), "birth keeps the authored central hole");
  assert.deepEqual(
    birth.pixels,
    flattenAnatomy(art).map((p) => ({ ...p, x: p.x + 16, y: p.y + 16 })),
  );
  for (const age of [30, 75, 120, 240]) {
    const frame = s.frameAt(age),
      body = frame.parts.find((part) => part.id === "body");
    assert.ok(
      body && body.pixels.length > 0,
      "the authored body's material identity survives restructuring",
    );
    assert.ok(body.sourcePartIds?.includes("body"));
    const development = s.developmentAt(age);
    assert.ok(
      development.commitments.every((choice) => choice.tick <= age * 24),
    );
    assert.ok(
      development.anatomy.every((part) =>
        part.sourcePartIds.every((id) => id === "body"),
      ),
    );
  }
  assert.notDeepEqual(birth.pixels, s.frameAt(75).pixels);
  assert.ok(
    s.program.operators.some((op) => ["replace", "enclose"].includes(op.kind)),
    "topology changes are declared development operations",
  );
});

test("operator traces cover the three transitions with bounded causal windows", () => {
  const s = createSimulation(createStarterAnatomy(), "traces");
  const faceIds = new Set(
    createStarterAnatomy()
      .filter((part) => part.kind === "eye" || part.kind === "mouth")
      .map((part) => part.id),
  );
  for (const op of s.program.operators) {
    assert.ok(
      Number.isFinite(op.start) &&
        Number.isFinite(op.end) &&
        Number.isFinite(op.strength),
    );
    assert.ok(op.start >= 0 && op.end > op.start && op.end <= 120);
    assert.ok(
      !faceIds.has(op.tissueId),
      "macro operations act on hosts rather than independently warping eyes",
    );
  }
  for (const [start, end] of [
    [0, 30],
    [30, 75],
    [75, 120],
  ]) {
    const applicable = s.program.operators.filter(
      (op) => op.start >= start && op.end <= end,
    );
    assert.ok(
      applicable.length >= 2 && applicable.length <= 4,
      "each transition has two to four coordinated operations",
    );
    assert.ok(
      applicable.some(
        (op) => op.start > start && op.start < start + (end - start) * 0.2,
      ),
      "development begins early in the interval, after care has time to affect expression",
    );
  }
  for (const age of [5, 20, 45, 70, 90, 115])
    assert.ok(s.developmentAt(age).operations.length <= 8);
});

test("fractional developmental ages and explicit animation seconds vary independently", () => {
  const s = createSimulation(createStarterAnatomy(), "fractional"),
    a = s.frameAt(40.1),
    b = s.frameAt(40.2);
  assert.notDeepEqual(
    a.parts.map((p) => ({
      id: p.id,
      anchor: p.anchor,
      tip: p.tip,
      growth: p.growth,
    })),
    b.parts.map((p) => ({
      id: p.id,
      anchor: p.anchor,
      tip: p.tip,
      growth: p.growth,
    })),
  );
  assert.ok(
    gap(
      a.parts.find((p) => p.id === "head")!.anchor,
      b.parts.find((p) => p.id === "head")!.anchor,
    ) < 0.1,
  );
  const pace = s.frameAt(40).motionPace;
  const poses = Array.from({ length: 8 }, (_, i) =>
    JSON.stringify(
      s.frameAt(40, { time: (i + 0.1) / (8 * pace), action: "move" }).pixels,
    ),
  );
  assert.ok(
    new Set(poses).size > 1,
    "a complete held-phase cycle contains visible movement",
  );
  assert.deepEqual(s.frameAt(40), s.frameAt(40, { time: 0, action: "idle" }));
});

test("features inside an outlined head bind to that head even when metadata points to body", () => {
  const body = rect("body", "body", 8, 7, 16, 20),
    head = ring("head", "head", 10, 5, 12, 12, "body"),
    eye = rect("eye", "eye", 13, 9, 2, 1, "body", "#000000"),
    mouth = rect("mouth", "mouth", 14, 12, 3, 1, "body", "#333333");
  const s = createSimulation([body, head, eye, mouth], "enclosure");
  for (const age of [0, 30, 75, 120]) {
    const f = s.frameAt(age),
      h = f.parts.find((p) => p.id === "head")!;
    for (const id of ["eye", "mouth"]) {
      const p = f.parts.find((p) => p.id === id)!;
      assert.equal(p.parentId, "head");
      assert.equal(p.relationship, "surface");
      assert.ok(
        p.anchor.x >= h.bounds.x - 1 &&
          p.anchor.x < h.bounds.x + h.bounds.width + 1,
      );
      assert.ok(
        p.anchor.y >= h.bounds.y - 1 &&
          p.anchor.y < h.bounds.y + h.bounds.height + 1,
      );
    }
  }
});

test("surface eyes follow the deformed host and retain readable authored clusters", () => {
  const head = rect("head", "head", 8, 8, 16, 12),
    eye = rect("eye", "eye", 12, 11, 5, 2, "head", "#123456");
  const s = createSimulation([head, eye], "material-eyes"),
    young = s.frameAt(0).parts.find((part) => part.id === "eye")!;
  for (const age of [15, 30, 50, 75, 120]) {
    const frame = s.frameAt(age),
      grown = frame.parts.find((part) => part.id === "eye")!,
      host = frame.parts.find((part) => part.id === "head")!;
    assert.equal(grown.parentId, "head");
    assert.equal(grown.relationship, "surface");
    assert.ok(grown.pixels.length > 0);
    if (grown.surfaceExpression) {
      assert.deepEqual(grown.surfaceExpression.originalColors, ["#123456"]);
      assert.ok(grown.surfaceExpression.sourcePartIds.includes("eye"));
      assert.ok((grown.surfaceExpression.contrastAfter ?? 0) >= 0.5 - 1e-12);
      const visible = new Map(
        frame.pixels.map((pixel) => [`${pixel.x},${pixel.y}`, pixel.color]),
      );
      assert.ok(
        grown.pixels.every(
          (pixel) => visible.get(`${pixel.x},${pixel.y}`) === pixel.color,
        ),
      );
    } else {
      assert.deepEqual(
        new Set(grown.pixels.map((pixel) => pixel.color)),
        new Set(["#123456"]),
      );
    }
    assert.ok(
      grown.anchor.x >= host.bounds.x - 2 &&
        grown.anchor.x < host.bounds.x + host.bounds.width + 2,
    );
    assert.ok(
      grown.anchor.y >= host.bounds.y - 2 &&
        grown.anchor.y < host.bounds.y + host.bounds.height + 2,
    );
  }
  assert.notDeepEqual(
    s.frameAt(75).parts.find((part) => part.id === "eye")!.anchor,
    young.anchor,
  );
});

test("floating hands without arms retain a logical carrier and remain usable", () => {
  const p = [
    rect("body", "body", 13, 13, 7, 8),
    rect("hand", "hand", 2, 8, 2, 2),
    rect("eye", "eye", 26, 4, 1, 1),
  ];
  const s = createSimulation(p, "floating"),
    young = s.frameAt(0),
    adult = s.frameAt(75);
  for (const id of ["hand", "eye"]) {
    const a = young.parts.find((p) => p.id === id)!,
      b = adult.parts.find((p) => p.id === id)!;
    assert.equal(a.relationship, "floating");
    assert.equal(a.parentId, "body");
    assert.ok(
      gap(a.anchor, b.anchor) > 0.2,
      "floating feature follows material carrier growth",
    );
  }
  assert.ok(adult.capabilities.canPlay);
  assert.ok(adult.capabilities.usableHands.includes("hand"));
  const hand = young.parts.find((p) => p.id === "hand")!,
    target = { x: hand.anchor.x + 5, y: hand.anchor.y + 1 },
    playing = s.frameAt(0, { time: 2, action: "play", target });
  assert.equal(playing.interaction.mode, "hand");
  assert.equal(playing.interaction.status, "caught");
});

test("joint contacts stay shared while limbs, attached hair, and floating groups animate", () => {
  const p = createStarterAnatomy();
  p.push(rect("hair", "hair", 15, 2, 1, 4, "head", "#777777"));
  const s = createSimulation(p, "joints");
  for (const age of [0, 30, 75, 120])
    for (const action of actions) {
      const f = s.frameAt(age, { time: 1.1, action });
      for (const part of f.parts)
        if (part.relationship === "joint" && part.attachment)
          assert.ok(
            gap(part.anchor, part.attachment) < 0.025,
            `${part.id} detached under ${action}`,
          );
    }
  const only = [
    rect("eye-a", "eye", 10, 10, 1, 1),
    rect("eye-b", "eye", 20, 10, 1, 1),
  ];
  const t = createSimulation(only, "constellation");
  assert.ok(t.frameAt(0).capabilities.canGreet);
  assert.ok(
    Array.from({ length: 16 }, (_, i) => (i + 1) / 8).some(
      (time) =>
        JSON.stringify(t.frameAt(0, { time, action: "greet" }).pixels) !==
        JSON.stringify(t.frameAt(0).pixels),
    ),
    "unconventional floating features can visibly greet during a full pose cycle",
  );
});

test("tiny eyes visibly blink as protected clusters without inventing facial identities", () => {
  const p = [
      rect("body", "body", 12, 12, 7, 7),
      rect("tiny-eye", "eye", 14, 14, 1, 1, "body", "#000000"),
    ],
    s = createSimulation(p, "blink");
  const poses = new Set<string>();
  for (let time = 0; time < 8; time += 0.04) {
    const frame = s.frameAt(0, { time }),
      eye = frame.parts.find((part) => part.id === "tiny-eye")!;
    assert.ok(
      eye.pixels.length > 0,
      "even a closed one-pixel eye remains a visible deliberate cluster",
    );
    const minX = Math.min(...eye.pixels.map((pixel) => pixel.x)),
      minY = Math.min(...eye.pixels.map((pixel) => pixel.y));
    poses.add(
      JSON.stringify(
        eye.pixels.map((pixel) => [
          pixel.x - minX,
          pixel.y - minY,
          pixel.color,
        ]),
      ),
    );
    assert.equal(
      frame.parts.filter(
        (part) => part.kind === "eye" && part.provenance === "authored",
      ).length,
      1,
    );
  }
  assert.ok(
    poses.size >= 2,
    "the eye has different open and closed cluster shapes",
  );
  const blob = createSimulation(
    [rect("body", "body", 10, 10, 10, 10)],
    "faceless",
  );
  for (const age of [0, 30, 75, 120])
    assert.ok(
      !blob
        .frameAt(age)
        .parts.some((part) => part.kind === "eye" || part.kind === "mouth"),
    );
});

test("authored hair remains attached and retains material instead of automatic resorption", () => {
  const body = rect("body", "body", 10, 12, 10, 10),
    hair = rect("hair", "hair", 13, 3, 1, 10, "body", "#aaaaaa");
  const s = createSimulation([body, hair], "glow");
  for (const age of [0, 75, 120, 240]) {
    const h = s.frameAt(age).parts.find((p) => p.id === "hair")!;
    assert.equal(h.relationship, "surface");
    assert.ok(h.pixels.length >= hair.pixels.length);
    assert.equal(h.sourcePartId, "hair");
  }
  for (const age of [0, 75, 120, 240])
    assert.deepEqual(
      new Set(
        s
          .frameAt(age)
          .parts.find((part) => part.id === "hair")!
          .pixels.map((pixel) => pixel.color),
      ),
      new Set(["#aaaaaa"]),
    );
});

test("limbless inherited routes remain functional without forcing locomotor appendages", () => {
  const p = [rect("body", "body", 5, 14, 22, 3)];
  let limbless = 0;
  for (let i = 0; i < 24; i++) {
    const s = createSimulation(p, "limbless-route-" + i),
      birth = s.frameAt(0);
    assert.ok(
      birth.capabilities.canMove &&
        birth.capabilities.canPlay &&
        birth.capabilities.canGreet,
    );
    assert.equal(birth.capabilities.footCount, 0);
    assert.equal(
      s.frameAt(0, { time: 0.375, action: "play", target: birth.pixels[0] })
        .interaction.mode,
      "body",
    );
    if (s.genome.limbless !== true) continue;
    limbless++;
    for (const age of [0, 30, 75, 120]) {
      const frame = s.frameAt(age);
      assert.ok(
        !frame.parts.some(
          (part) =>
            ["leg", "foot"].includes(part.kind) && part.pixels.length > 0,
        ),
      );
      assert.ok(
        ["slither", "undulate", "hop", "roll", "drift"].includes(
          frame.movementMode,
        ),
      );
    }
  }
  assert.ok(
    limbless > 0,
    "the fixed raw cohort includes lineages that remain limbless",
  );
});

test("play contacts are occupied pixels, including hollow hands and mouth or tail effectors", () => {
  const body = rect("body", "body", 12, 12, 8, 8),
    arm = rect("arm", "arm", 20, 13, 4, 2, "body"),
    hand = ring("hand", "hand", 24, 11, 7, 7, "arm");
  const s = createSimulation([body, arm, hand], "hollow-hand");
  for (const target of [
    { x: 43, y: 30 },
    { x: 60, y: 0 },
  ]) {
    const f = s.frameAt(0, { time: 1, action: "play", target }),
      chosen = f.parts.find((p) => p.id === f.interaction.effectorId)!;
    assert.ok(
      chosen.pixels.some(
        (p) =>
          p.x === f.interaction.contactPoint?.x &&
          p.y === f.interaction.contactPoint?.y,
      ),
    );
    if (f.interaction.status === "caught")
      assert.ok(gap(f.interaction.contactPoint!, target) <= 2.5);
  }
  for (const kind of ["mouth", "tail"] as const) {
    const p = rect(kind, kind, 10, 10, 3, 1);
    const t = createSimulation([p], "solo"),
      f = t.frameAt(0, { time: 1, action: "play", target: { x: 27, y: 26 } });
    assert.equal(f.interaction.mode, kind);
    assert.equal(f.interaction.status, "caught");
  }
  const bodyPlay = createSimulation(
    [rect("body", "body", 10, 10, 5, 5)],
    "nudge",
  ).frameAt(0, { time: 1, action: "play", target: { x: 26, y: 26 } });
  assert.equal(bodyPlay.interaction.status, "nudged");
});

test("capabilities require mature functional geometry rather than wing labels alone", () => {
  const body = rect("body", "body", 10, 10, 12, 12),
    wing = rect("wing", "wing", 5, 12, 5, 5, "body");
  const source = [body, wing, rect("wing2", "wing", 22, 12, 5, 5, "body")],
    s = createSimulation(source, "wings-0");
  for (const age of [0, 15, 30, 50, 75, 100, 120, 240]) {
    const frame = s.frameAt(age);
    if (frame.capabilities.canFly) {
      assert.equal(frame.evolution?.controllerFamily, "flutter");
      assert.ok(
        frame.parts.filter(
          (part) =>
            part.kind === "wing" &&
            part.role === "membrane" &&
            (part.readiness ?? 1) > 0.55 &&
            part.pixels.length > 0,
        ).length >= 2,
      );
    }
    for (const id of frame.capabilities.effectorIds)
      assert.ok(
        frame.parts.some((part) => part.id === id && part.pixels.length > 0),
      );
    assert.ok(
      !frame.parts.some((part) => part.kind === "eye" || part.kind === "mouth"),
      "evolution does not invent missing facial identities",
    );
  }
  const labelsOnly = createSimulation(
    [
      body,
      rect("fin-left", "wing", 7, 12, 1, 1, "body"),
      rect("fin-right", "wing", 24, 12, 1, 1, "body"),
    ],
    "tiny-labelled-wings",
  ).frameAt(0);
  assert.equal(
    labelsOnly.capabilities.canFly,
    false,
    "two tiny wing hints do not establish flight",
  );
});

test("eggs preserve the exact shell, reveal a generated infant during incubation, and finish hatching on time", () => {
  const p = createStarterAnatomy("egg"),
    s = createSimulation(p, "fern", "egg");
  assert.deepEqual(
    s.frameAt(0).pixels,
    flattenAnatomy(p).map((p) => ({ ...p, x: p.x + 16, y: p.y + 16 })),
  );
  assert.equal(s.frameAt(0).capabilities.canPlay, false);
  const before = s.frameAt(s.hatchAt - 2),
    during = s.frameAt(s.hatchAt - 0.8),
    infant = s.frameAt(s.hatchAt);
  assert.equal(during.stage, "egg");
  assert.ok(during.parts.some((p) => p.provenance === "grown"));
  assert.notDeepEqual(before.pixels, during.pixels);
  assert.equal(infant.stage, "infant");
  assert.ok(
    infant.parts.some((p) => p.provenance === "grown" && p.pixels.length),
  );
  assert.equal(
    infant.parts.some((p) => p.provenance === "shell"),
    false,
  );
  assert.ok(infant.capabilities.canMove && infant.capabilities.canPlay);
  assert.equal(s.frameAt(s.maxAge).developmentalAge, 240);
});

test("same egg and seed hatch identically, different seeds generate different compositions", () => {
  const p = createStarterAnatomy("egg"),
    recipes = new Set<string>(),
    pictures = new Set<string>();
  let limbless = false;
  for (let i = 0; i < 16; i++) {
    const seed = `egg-${i}`,
      a = createSimulation(p, seed, "egg"),
      b = createSimulation([...p].reverse(), seed, "egg");
    assert.deepEqual(a.program, b.program);
    assert.deepEqual(a.frameAt(a.hatchAt), b.frameAt(b.hatchAt));
    assert.deepEqual(a.frameAt(a.maxAge), b.frameAt(b.maxAge));
    recipes.add(JSON.stringify(a.program.embryoRecipe));
    pictures.add(JSON.stringify(a.frameAt(a.hatchAt + 75).pixels));
    if (a.frameAt(a.hatchAt).capabilities.footCount === 0) limbless = true;
  }
  assert.ok(recipes.size >= 12 && pictures.size >= 12);
  assert.ok(limbless, "offspring are not always conventional legged pets");
});

test("all meaningful stages and poses remain bounded, unique integer pixels", () => {
  for (const preset of ["biped", "crawler", "winged", "egg"] as const)
    for (const mode of ["infant", "egg"] as SourceMode[]) {
      const s = createSimulation(createStarterAnatomy(preset), "bounds", mode);
      for (const age of [
        0,
        s.hatchAt,
        30 + s.hatchAt,
        75 + s.hatchAt,
        s.maxAge,
      ])
        for (const action of actions) {
          const f = s.frameAt(age, {
            time: 1.5,
            action,
            target: { x: 63, y: 0 },
          });
          assert.equal(
            new Set(f.pixels.map((p) => `${p.x},${p.y}`)).size,
            f.cellCount,
          );
          for (const p of [...f.pixels, ...f.parts.flatMap((p) => p.pixels)])
            assert.ok(
              Number.isInteger(p.x) &&
                Number.isInteger(p.y) &&
                p.x >= 0 &&
                p.y >= 0 &&
                p.x < WORLD_SIZE &&
                p.y < WORLD_SIZE,
            );
        }
    }
});

test("hundreds of scattered painted fragments remain represented without a 32-region rejection", () => {
  const parts: PetPart[] = Array.from({ length: 256 }, (_, i) =>
    rect(`body-${i}`, "body", (i % 16) * 2, Math.floor(i / 16) * 2, 1, 1),
  );
  const s = createSimulation(parts, "scattered");
  assert.equal(s.frameAt(0).cellCount, 256);
  assert.equal(authoredParts(s.frameAt(0)).length, 256);
  assert.deepEqual(
    s.frameAt(0).pixels,
    flattenAnatomy(parts).map((p) => ({ ...p, x: p.x + 16, y: p.y + 16 })),
  );
  assert.ok(s.frameAt(120).cellCount > 0);
});

test("editing a starter away from limbs preserves their separate source identities", () => {
  for (const preset of ["biped", "crawler", "winged"] as const) {
    const p = inferAnatomy(createStarterAnatomy(preset)),
      edited = paintStroke(p, "decoration", "#ffffff", [{ x: 0, y: 0 }]);
    for (const source of p.filter((p) =>
      ["arm", "hand", "leg", "foot"].includes(p.kind),
    ))
      assert.ok(
        edited.some((p) => p.id === source.id && p.kind === source.kind),
      );
  }
});

test("normalization and paint-depth helpers preserve canonical optional metadata", () => {
  assert.equal(PART_SIZE, DRAW_SIZE);
  assert.ok(PART_KINDS.includes("hair"));
  const p = rect("body", "body", 1, 1, 1, 1);
  p.layer = 12000;
  p.pixels = [
    { x: 1, y: 1, color: "#aaa" },
    { x: 1, y: 1, color: "#bbb", z: 13000 },
    { x: 31, y: 31, color: "#fff", z: 1e20 },
  ];
  const n = normalizeAnatomy([p])[0];
  assert.equal(n.layer, 12000);
  assert.equal(n.pixels[0].z, 13000);
  assert.equal(n.pixels[1].z, 1e9);
  assert.equal(pixelPaintDepth(n, n.pixels[0]), 13000);
  assert.deepEqual(
    normalizeAnatomy([{ ...p, pixels: [...p.pixels].reverse() }]),
    [n],
  );
  const eye = rect("eye", "eye", 1, 1, 1, 1);
  assert.ok(compareAnatomyLayer(p, eye) < 0);
});

test("source, program diagnostics, and returned frames cannot mutate cached replay", () => {
  const p = createStarterAnatomy(),
    s = createSimulation(p, "isolated"),
    f = s.frameAt(75, { time: 1, action: "move" }),
    expected = structuredClone(f);
  p[0].pixels.length = 0;
  f.pixels.length = 0;
  f.parts[0].pixels.length = 0;
  f.parts[0].anchor.x = -999;
  f.capabilities.effectorIds.length = 0;
  f.traits[0].value = "changed";
  s.program.operators.length = 0;
  s.milestones.length = 0;
  s.genome.seed = "changed";
  assert.deepEqual(s.frameAt(75, { time: 1, action: "move" }), expected);
  for (let a = 0; a < 50; a++) s.frameAt(a, { time: a / 3 });
  assert.deepEqual(
    s.frameAt(75, { time: 1, action: "move" }),
    expected,
    "recomputed after LRU eviction is identical",
  );
});

test("empty sources do not invent creatures and invalid ages or animation times stay finite", () => {
  for (const mode of ["infant", "egg"] as SourceMode[]) {
    const s = createSimulation([], "empty", mode);
    for (const age of [0, NaN, -Infinity, Infinity, 1e308, -100])
      for (const time of [0, NaN, Infinity, -Infinity, 1e308]) {
        const f = s.frameAt(age, { time, action: "play" });
        assert.equal(f.cellCount, 0);
        assert.equal(f.capabilities.canMove, false);
        assert.ok(f.age >= 0 && Number.isFinite(f.age));
        assert.ok(
          Number.isFinite(f.age) && Number.isFinite(f.developmentalAge),
        );
      }
    assert.equal(s.frameAt(Infinity).age, s.maxAge);
  }
});

test("elder evolution preserves player pigments while changing anatomy", () => {
  const p = [
    rect("head", "head", 11, 11, 10, 10),
    rect("hair", "hair", 14, 5, 2, 7, "head", "#dd2040"),
    rect("eye", "eye", 14, 14, 1, 1, "head", "#30aaff"),
    rect("mouth", "mouth", 15, 17, 2, 1, "head", "#ffaa30"),
  ];
  const s = createSimulation(p, "silver-years");
  assert.deepEqual(
    s.frameAt(0).pixels,
    flattenAnatomy(p).map((pixel) => ({
      ...pixel,
      x: pixel.x + 16,
      y: pixel.y + 16,
    })),
  );
  for (const age of [30, 75, 96, 108, 120, 240])
    for (const [id, color] of [
      ["hair", "#dd2040"],
      ["eye", "#30aaff"],
      ["mouth", "#ffaa30"],
    ]) {
      const part = s
        .frameAt(age)
        .parts.find((candidate) => candidate.id === id)!;
      assert.ok(part.pixels.length > 0);
      assert.deepEqual(
        new Set(part.pixels.map((pixel) => pixel.color)),
        new Set([color]),
        "authored pigments survive every metamorphosis",
      );
    }
  assert.notDeepEqual(
    s.frameAt(75).pixels,
    s.frameAt(120).pixels,
    "elder is another evolved form rather than mandatory desaturation",
  );
  assert.deepEqual(
    s.frameAt(120),
    createSimulation(p, "silver-years").frameAt(120),
  );
});

test("elder remains reproducible and functional while aging without a death state", () => {
  const p = [rect("body", "body", 10, 10, 1, 1)],
    s = createSimulation(p, "gentle-years");
  assert.notDeepEqual(s.frameAt(75).pixels, s.frameAt(120).pixels);
  for (const age of [75, 90, 108, 120, 180, 240]) {
    const frame = s.frameAt(age);
    assert.ok(Number.isFinite(frame.motionPace) && frame.motionPace > 0);
    assert.ok(
      Number.isFinite(frame.motionAmplitude) && frame.motionAmplitude > 0,
    );
    assert.ok(frame.capabilities.canMove && frame.capabilities.canGreet);
    assert.equal(frame.stage, age < 120 ? "adult" : "elderly");
  }
  for (const time of [0, 0.125, 0.375, 0.625, 0.875])
    assert.deepEqual(
      s.frameAt(120, { time, action: "move" }),
      createSimulation(p, "gentle-years").frameAt(120, {
        time,
        action: "move",
      }),
    );
  assert.notDeepEqual(
    s.frameAt(120).pixels,
    s.frameAt(240).pixels,
    "bounded mature anatomy continues remodeling beyond the elder milestone",
  );
});

test("a single authored body pixel has a seeded generative future without altering birth", () => {
  const p = [rect("body", "body", 16, 16, 1, 1)];
  const first = createSimulation(p, "tiny-dawn"),
    second = createSimulation(p, "tiny-dusk");
  const birth = flattenAnatomy(p).map((pixel) => ({
    ...pixel,
    x: pixel.x + 16,
    y: pixel.y + 16,
  }));
  assert.deepEqual(first.frameAt(0).pixels, birth);
  assert.deepEqual(second.frameAt(0).pixels, birth);
  const a = first.frameAt(75),
    b = second.frameAt(75);
  for (const f of [a, b]) {
    assert.ok(
      f.parts.some(
        (part) =>
          part.provenance === "authored" &&
          part.id === "body" &&
          part.pixels.length > 0,
      ),
      "one pixel is enough to start real generative development",
    );
    assert.ok(f.cellCount > 5, "growth is more than resizing the original dot");
  }
  assert.notDeepEqual(
    a.pixels,
    b.pixels,
    "different seeds produce different adult shapes from the same dot",
  );
  assert.ok(first.program.limits.generatedTissues <= 32);
  assert.deepEqual(
    createSimulation([], "tiny-dawn").frameAt(75).pixels,
    [],
    "an empty canvas still stays empty",
  );
});

test("disconnected pixels retain exact birth gaps and a source lineage through declared fusion", () => {
  const source = rect("two-dots", "body", 3, 15, 1, 1);
  source.pixels.push({ x: 28, y: 15, color: "#aaaaaa" });
  const s = createSimulation([source], "two-material-roots"),
    birth = s.frameAt(0);
  assert.equal(birth.cellCount, 2);
  assert.equal(components(birth.pixels), 2);
  assert.deepEqual(
    birth.pixels,
    flattenAnatomy([source]).map((pixel) => ({
      ...pixel,
      x: pixel.x + 16,
      y: pixel.y + 16,
    })),
  );
  for (const age of [7, 30, 75, 120]) {
    const body = s.frameAt(age).parts.find((part) => part.id === "two-dots");
    assert.ok(body && body.pixels.length > 0);
    assert.ok(body.sourcePartIds?.includes("two-dots"));
    assert.ok(
      body.pixels.every(
        (pixel) => Number.isInteger(pixel.x) && Number.isInteger(pixel.y),
      ),
    );
  }
  assert.ok(
    s.program.operators.some((op) => ["replace", "enclose"].includes(op.kind)),
    "body topology changes have declared program operations",
  );
});

const care = (
  needId: NeedKeyframe["needId"],
  fulfillment: number,
  day = 0,
): NeedKeyframe => ({ needId, fulfillment, tick: day * 24 });
const withCare = (timeline: NeedKeyframe[], seed = "care-history") =>
  createSimulation(createStarterAnatomy(), seed, "infant", {
    needTimeline: timeline,
  });

test("all six raw appearance profiles condition inherited growth without rerolling genetics", () => {
  const neutral = withCare([]),
    neutralFrame = neutral.frameAt(75);
  for (const id of [
    "safety",
    "security",
    "trust",
    "rest",
    "relaxation",
    "physical-fitness",
  ] as const) {
    const changed = withCare([care(id, 0)]),
      f = changed.frameAt(75);
    assert.deepEqual(changed.genome, neutral.genome);
    assert.deepEqual(changed.program, neutral.program);
    assert.notDeepEqual(
      f.pixels,
      neutralFrame.pixels,
      `${id} alone changes development`,
    );

    assert.equal(f.wellbeing.needs[id].fulfillment, 0);
    assert.deepEqual(
      changed.frameAt(0).pixels,
      neutral.frameAt(0).pixels,
      "care never rewrites the infant drawing",
    );
  }
  const thriving = withCare([
    care("physical-fitness", 1),
    care("rest", 1),
    care("relaxation", 1),
  ]);
  assert.notDeepEqual(
    thriving.frameAt(75).pixels,
    neutralFrame.pixels,
    "positive care also expresses inherited potential",
  );
});

test("equal current fulfillment retains different, softenable care histories", () => {
  const fresh = withCare([]),
    recovered = withCare([care("safety", 0), care("safety", 0.75, 60)]);
  const a = fresh.frameAt(75),
    b = recovered.frameAt(75);
  assert.equal(
    a.wellbeing.needs.safety.fulfillment,
    b.wellbeing.needs.safety.fulfillment,
  );
  assert.ok(b.wellbeing.needs.safety.memory > a.wellbeing.needs.safety.memory);
  assert.notDeepEqual(a.pixels, b.pixels);
  assert.ok(
    recovered.stateAt(180).needs.safety.memory <
      recovered.stateAt(75).needs.safety.memory,
  );
  const uninterrupted = withCare([care("safety", 0)]);
  assert.ok(
    recovered.stateAt(180).development.protection <
      uninterrupted.stateAt(180).development.protection,
  );
});

test("future care cannot alter earlier frames, and arbitrary history seeks reproduce", () => {
  const timeline = [
    care("safety", 0, 20),
    care("safety", 0.9, 65),
    care("rest", 0.2, 100),
    care("rest", 1, 155),
  ];
  const a = withCare(timeline),
    b = withCare(timeline),
    before = withCare([]).frameAt(19.99, { time: 1, action: "move" });
  assert.deepEqual(a.frameAt(19.99, { time: 1, action: "move" }), before);
  const expected = a.frameAt(87.125, { time: 2, action: "greet" });
  for (const age of [240, 0, 155.9, 20, 119.99, 75, 120])
    a.frameAt(age, { time: 3, action: "play" });
  assert.deepEqual(a.frameAt(87.125, { time: 2, action: "greet" }), expected);
  assert.deepEqual(b.frameAt(87.125, { time: 2, action: "greet" }), expected);
});

test("care event hours apply at exact requested ages, including fractional egg incubation", () => {
  const events = Array.from({ length: 24 }, (_, i) => ({
    needId: "safety" as const,
    tick: i + 1,
    fulfillment: (i + 1) / 24,
  }));
  for (const mode of ["infant", "egg"] as const) {
    const s = createSimulation(
      createStarterAnatomy(mode === "egg" ? "egg" : "biped"),
      "exact-care-hour",
      mode,
      { needTimeline: events },
    );
    for (let hour = 1; hour <= 24; hour++) {
      const age = s.hatchAt + hour / 24;
      assert.equal(s.stateAt(age).needs.safety.fulfillment, hour / 24);
      const f = s.frameAt(age);
      assert.equal(f.wellbeing.tick, hour);
      assert.equal(f.wellbeing.needs.safety.fulfillment, hour / 24);
    }
  }
});

test("care history changes reuse the inherited blueprint and expose immutable wellbeing", () => {
  const parts = createStarterAnatomy(),
    seed = "blueprint-cache-history-regression";
  const before = getBlueprintCacheStats().compilations;
  const a = createSimulation(parts, seed),
    b = createSimulation(parts, seed, "infant", {
      needTimeline: [care("safety", 0)],
    });
  assert.equal(getBlueprintCacheStats().compilations, before + 1);
  assert.deepEqual(a.genome, b.genome);
  const frame = b.frameAt(40),
    state = b.stateAt(40);
  assert.deepEqual(frame.wellbeing, state);
  assert.ok(
    Object.isFrozen(frame.wellbeing) &&
      Object.isFrozen(frame.wellbeing.needs.safety),
  );
  assert.throws(() => {
    frame.wellbeing.needs.safety.fulfillment = 0.5;
  });
  assert.equal(b.frameAt(40).wellbeing.needs.safety.fulfillment, 0);
});

test("maturation completes at120 while elder remodeling continues without a final form", () => {
  const neutral = withCare([]);
  assert.notDeepEqual(neutral.frameAt(120).pixels, neutral.frameAt(240).pixels);
  const changed = withCare([care("safety", 0, 130)]);
  assert.deepEqual(changed.frameAt(130).pixels, neutral.frameAt(130).pixels);
  assert.notDeepEqual(changed.frameAt(210).pixels, neutral.frameAt(210).pixels);
  const after = changed.frameAt(130.01),
    at = changed.frameAt(130);
  const body = (f: typeof at) => f.parts.find((p) => p.id === "body")!;
  assert.ok(
    Math.abs(body(after).growth.x - body(at).growth.x) < 0.001,
    "an adult event cannot instantaneously resculpt the body",
  );
  for (const age of [75, 120]) {
    const low = changed.frameAt(age - 0.0001),
      high = changed.frameAt(age + 0.0001);
    assert.ok(
      Math.abs(body(high).growth.x - body(low).growth.x) < 0.001,
      "stage labels do not reset developmental state",
    );
  }
});

test("inherited functional anatomy is bounded, reproducible, and independent of care history", () => {
  const parts = [rect("body", "body", 9, 10, 13, 12)];
  let developedLimbs = 0,
    retainedLimbless = 0;
  for (let i = 0; i < 24; i++) {
    const seed = "inherited-organs-" + i,
      neutral = createSimulation(parts, seed),
      pressure = createSimulation(parts, seed, "infant", {
        needTimeline: [care("safety", 0)],
      });
    assert.deepEqual(neutral.genome, pressure.genome);
    assert.deepEqual(neutral.program, pressure.program);
    assert.ok(neutral.program.limits.generatedTissues <= 32);
    let hasLimbs = false;
    for (const age of [30, 75, 120]) {
      const frame = neutral.frameAt(age),
        generated = frame.parts.filter((part) => part.provenance === "grown");
      assert.ok(generated.length <= 32);
      assert.equal(
        new Set(frame.parts.map((part) => part.id)).size,
        frame.parts.length,
      );
      assert.ok(
        frame.parts.every((part) =>
          part.sourcePartIds?.every((id) => id === "body"),
        ),
      );
      assert.ok(
        !frame.parts.some(
          (part) => part.kind === "eye" || part.kind === "mouth",
        ),
      );
      hasLimbs ||= frame.parts.some(
        (part) => part.kind === "leg" && part.pixels.length > 0,
      );
      assert.deepEqual(frame, createSimulation(parts, seed).frameAt(age));
    }
    if (hasLimbs) developedLimbs++;
    else retainedLimbless++;
  }
  assert.ok(
    developedLimbs > 0,
    "some inherited routes develop functional support anatomy",
  );
  assert.ok(retainedLimbless > 0, "other inherited routes remain limbless");
});

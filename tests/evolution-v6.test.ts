import assert from "node:assert/strict";
import test from "node:test";
import {
  createSimulation,
  flattenAnatomy,
  type PetPart,
  type Pixel,
  hash,
} from "../src/simulation";
import { STARTER_PRESETS, clonePreset } from "../src/presets";
import type { NeedKeyframe } from "../src/needs";

const seeds = ["v6-proof-000", "v6-proof-001", "v6-proof-002", "v6-proof-003"];
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
  position: { x: 0, y: 0 },
  parentId,
});
const rectangle = (
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
const ring = (x: number, y: number, w: number, h: number): Pixel[] =>
  rectangle(x, y, w, h).filter(
    (p) => p.x === x || p.x === x + w - 1 || p.y === y || p.y === y + h - 1,
  );
const pixelKey = (p: Pixel) => `${p.x},${p.y}:${p.color}`;
function difference(a: Pixel[], b: Pixel[]): number {
  const aa = new Set(a.map(pixelKey)),
    bb = new Set(b.map(pixelKey));
  let mismatches = 0;
  for (const cell of aa) if (!bb.has(cell)) mismatches++;
  for (const cell of bb) if (!aa.has(cell)) mismatches++;
  return mismatches / Math.max(1, new Set([...aa, ...bb]).size);
}
const sourceFixture = () => [
  part("body", "body", rectangle(10, 17, 12, 8)),
  part("head", "head", ring(9, 4, 14, 12), "body"),
  part("eye-left", "eye", [{ x: 13, y: 8, color: "#FFFFFF" }], "head"),
  part("eye-right", "eye", [{ x: 18, y: 8, color: "#FFFFFF" }], "head"),
  part("mouth", "mouth", [{ x: 15, y: 12, color: "#FFFFFF" }], "head"),
  part("hand-left", "hand", rectangle(2, 18, 2, 2), "body"),
  part("mark", "decoration", [{ x: 16, y: 20, color: "#AA00EE" }], "body"),
];

test("v6 exact infant birth preserves every source pixel, gap, pigment and overlap across seeds", () => {
  for (const preset of STARTER_PRESETS) {
    const expected = flattenAnatomy(preset.parts).map((p) => ({
      ...p,
      x: p.x + 16,
      y: p.y + 16,
    }));
    for (const seed of seeds)
      assert.deepEqual(
        createSimulation(preset.parts, seed).frameAt(0).pixels,
        expected,
        preset.id,
      );
  }
  const drawing = sourceFixture();
  const expected = flattenAnatomy(drawing).map((p) => ({
    ...p,
    x: p.x + 16,
    y: p.y + 16,
  }));
  assert.deepEqual(
    createSimulation(drawing, "hollow").frameAt(0).pixels,
    expected,
  );
});

test("v6 empty artwork remains empty at all milestones and actions", () => {
  for (const mode of ["infant", "egg"] as const) {
    const sim = createSimulation([], seeds[0], mode);
    for (const age of [0, sim.hatchAt, 30, 75, 120, 240])
      for (const action of ["idle", "move", "greet", "play"] as const) {
        const f = sim.frameAt(age, { time: 1.25, action });
        assert.equal(f.pixels.length, 0);
        assert.equal(f.parts.length, 0);
      }
  }
});

test("v6 milestones and seeded incubation use the same developmental clock", () => {
  for (const mode of ["infant", "egg"] as const) {
    const sim = createSimulation(clonePreset("bean"), "clock", mode);
    assert.equal(sim.genome.version, 7);
    assert.equal(sim.program.version, 7);
    assert.equal(sim.maxAge, 240 + sim.hatchAt);
    if (mode === "egg") assert.ok(sim.hatchAt >= 4 && sim.hatchAt <= 10);
    else assert.equal(sim.hatchAt, 0);
    assert.deepEqual(
      sim.milestones
        .filter((m) => m.stage !== "egg")
        .map((m) => Math.round((m.age - sim.hatchAt) * 1e9) / 1e9),
      [0, 30, 75, 120],
    );
    for (const milestone of sim.milestones)
      assert.equal(sim.frameAt(milestone.age).stage, milestone.stage);
  }
});

test("genetic programs are identical across care histories and are not changed by seeking", () => {
  const source = clonePreset("bean");
  const neutral = createSimulation(source, "inheritance");
  const care: NeedKeyframe[] = [
    { needId: "safety", tick: 0, fulfillment: 0 },
    { needId: "safety", tick: 1800, fulfillment: 1 },
  ];
  const changed = createSimulation(source, "inheritance", "infant", {
    needTimeline: care,
  });
  assert.deepEqual(changed.genome, neutral.genome);
  assert.deepEqual(changed.program, neutral.program);
  for (const age of [240, 0, 75, 11.5, 120])
    changed.frameAt(age, { time: 1.5, action: "move" });
  assert.deepEqual(changed.genome, neutral.genome);
  assert.deepEqual(changed.frameAt(0).pixels, neutral.frameAt(0).pixels);
});

test("source compilation cannot reseed inherited genetics", () => {
  for (const seed of seeds) {
    const inherited = createSimulation(clonePreset("bean"), seed).genome;
    for (const preset of STARTER_PRESETS)
      assert.deepEqual(createSimulation(preset.parts, seed).genome, inherited);
  }
});

test("future care events cannot affect any earlier state, including fractional hours", () => {
  const source = clonePreset("sprout");
  const baseline = createSimulation(source, "causality");
  const future = createSimulation(source, "causality", "infant", {
    needTimeline: [{ needId: "safety", tick: 75 * 24, fulfillment: 0 }],
  });
  for (const age of [0, 7, 29.9999, 30, 60, 75 - 1 / 48, 75 - 1e-7]) {
    assert.deepEqual(
      future.stateAt(age),
      baseline.stateAt(age),
      `needs age${age}`,
    );
    assert.deepEqual(
      future.developmentAt(age),
      baseline.developmentAt(age),
      `development age${age}`,
    );
    assert.deepEqual(
      future.frameAt(age, { time: 1.25, action: "move" }),
      baseline.frameAt(age, { time: 1.25, action: "move" }),
      `frame age${age}`,
    );
  }
  assert.equal(future.stateAt(75).needs.safety.fulfillment, 0);
});

test("arbitrary seek order reconstructs exact anatomy and frames", () => {
  const history: NeedKeyframe[] = [
    { needId: "safety", tick: 0, fulfillment: 0 },
    { needId: "safety", tick: 75 * 24, fulfillment: 1 },
    { needId: "rest", tick: 100 * 24, fulfillment: 0 },
  ];
  const source = clonePreset("ribbon"),
    a = createSimulation(source, "seek", "infant", { needTimeline: history }),
    b = createSimulation(source, "seek", "infant", { needTimeline: history });
  const ages = [12.375, 42.5, 75, 111.125, 180, 240];
  const expected = ages.map((age) =>
    a.frameAt(age, { time: 1.375, action: "move" }),
  );
  for (const age of [...ages].reverse())
    b.frameAt(age, { time: 2.25, action: "play" });
  ages.forEach((age, i) =>
    assert.deepEqual(
      b.frameAt(age, { time: 1.375, action: "move" }),
      expected[i],
    ),
  );
  const snapshot = b.developmentAt(75);
  assert.throws(() => {
    snapshot.bodyPlanId = "caller mutation";
  });
  assert.notEqual(b.developmentAt(75).bodyPlanId, "caller mutation");
});

test("blink subclock cannot make frame caching depend on query order", () => {
  const source = sourceFixture(),
    seed = "blink-cache",
    baseline = createSimulation(source, seed);
  const blink = hash(seed + "|blink") % 9;
  const start = blink === 0 ? 43 / 8 : blink / 8;
  const before = start - 0.0001,
    after = start + 0.0001;
  const a = createSimulation(source, seed),
    b = createSimulation(source, seed);
  a.frameAt(30, { time: before });
  b.frameAt(30, { time: after });
  assert.deepEqual(
    a.frameAt(30, { time: after }),
    b.frameAt(30, { time: after }),
  );
  assert.deepEqual(
    a.frameAt(30, { time: before }),
    baseline.frameAt(30, { time: before }),
  );
});

test("hollow and floating facial identities survive every evolved form and action", () => {
  const source = sourceFixture();
  for (const seed of seeds) {
    const sim = createSimulation(source, seed);
    for (const age of [0, 7, 30, 50, 75, 100, 120, 240])
      for (const action of ["idle", "move"] as const) {
        const f = sim.frameAt(age, {
          time: action === "idle" ? 0 : 0.5,
          action,
        });
        for (const id of [
          "eye-left",
          "eye-right",
          "mouth",
          "hand-left",
          "mark",
        ]) {
          const retained = f.parts.find((p) => p.id === id);
          assert.ok(retained, `${seed}/${age}/${id}`);
          assert.ok(retained.pixels.length, `${seed}/${age}/${id} invisible`);
          assert.ok(retained.sourcePartIds?.includes(id));
        }
        assert.equal(
          f.parts.find((p) => p.id === "hand-left")!.relationship,
          "floating",
        );
        assert.ok(
          f.parts
            .find((p) => p.id === "mark")!
            .pixels.every((p) => p.color === "#AA00EE"),
        );
      }
  }
});

test("feature-only artwork uses a shared reference without losing its features", () => {
  const source = [
    part("eye", "eye", [{ x: 7, y: 12, color: "#55CCEE" }]),
    part("hand", "hand", [{ x: 26, y: 18, color: "#FFFFFF" }]),
  ];
  const sim = createSimulation(source, "no-conventional-body");
  for (const age of [0, 30, 75, 120]) {
    const f = sim.frameAt(age);
    assert.ok(f.parts.find((p) => p.id === "eye")?.pixels.length);
    assert.ok(f.parts.find((p) => p.id === "hand")?.pixels.length);
  }
});

test("authored visible facial pixels retain contrasting material neighborhoods", () => {
  const color = (hex: string) =>
    [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  for (const seed of [
    ...seeds,
    ...Array.from(
      { length: 4 },
      (_, i) => `life-v6-genome-${String(i + 1).padStart(2, "0")}`,
    ),
  ]) {
    const sim = createSimulation(clonePreset("bean"), seed);
    for (const age of [0, 30, 75, 120]) {
      const f = sim.frameAt(age),
        cells = new Map(f.pixels.map((p) => [`${p.x},${p.y}`, p.color]));
      for (const feature of f.parts.filter(
        (p) => p.kind === "eye" || p.kind === "mouth",
      )) {
        const visible = feature.pixels.some((pixel) => {
          const ink = color(pixel.color);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const neighbor = color(
                cells.get(`${pixel.x + dx},${pixel.y + dy}`) ?? "#000000",
              );
              if (
                Math.max(
                  ...ink.map((value, i) => Math.abs(value - neighbor[i])),
                ) >= 96
              )
                return true;
            }
          return false;
        });
        assert.ok(
          visible,
          `${seed}/day${age}/${feature.id} has no rendered contrast against surrounding material`,
        );
      }
    }
  }
});

test("white eyes inside hollow white heads retain their authored negative-space contrast", () => {
  for (const seed of seeds) {
    const sim = createSimulation(sourceFixture(), seed);
    for (const age of [0, 30, 75, 120]) {
      const f = sim.frameAt(age),
        cells = new Map(f.pixels.map((p) => [`${p.x},${p.y}`, p.color]));
      for (const feature of f.parts.filter((p) => p.kind === "eye")) {
        const contrasting = feature.pixels.some((p) =>
          [-1, 0, 1].some((dy) =>
            [-1, 0, 1].some(
              (dx) =>
                (dx || dy) &&
                (
                  cells.get(`${p.x + dx},${p.y + dy}`) ?? "#000000"
                ).toUpperCase() !== p.color.toUpperCase(),
            ),
          ),
        );
        assert.ok(
          contrasting,
          `${seed}/day${age}/${feature.id} white feature washed out by filled host`,
        );
      }
    }
  }
});

test("single pixels and full canvases always generate finite in-bounds frames", () => {
  for (const source of [
    [part("body", "body", [{ x: 31, y: 31, color: "#66AAFF" }])],
    [part("body", "body", rectangle(0, 0, 32, 32))],
  ]) {
    const sim = createSimulation(source, "extreme-drawing");
    for (const age of [0, 0.01, 15, 30, 75, 120, 240]) {
      const f = sim.frameAt(age, { time: 0.625, action: "move" });
      assert.ok(f.pixels.length);
      assert.ok(
        f.pixels.every(
          (p) =>
            Number.isInteger(p.x) &&
            Number.isInteger(p.y) &&
            p.x >= 0 &&
            p.y >= 0 &&
            p.x < 64 &&
            p.y < 64,
        ),
      );
    }
  }
});

test("local operation activation begins from compatible geometry", () => {
  for (const seed of seeds) {
    const sim = createSimulation(clonePreset("bean"), seed);
    for (const day of [30, 75, 120]) {
      const before = sim.frameAt(day - 1e-6).pixels,
        at = sim.frameAt(day).pixels,
        after = sim.frameAt(day + 1e-6).pixels;
      assert.ok(
        difference(before, at) < 0.05,
        `${seed} day${day}: before→at=${difference(before, at)}`,
      );
      assert.ok(
        difference(at, after) < 0.05,
        `${seed} day${day}: at→after=${difference(at, after)}`,
      );
    }
  }
});

test("Safety alone causes visible adaptation and late recovery continues after elder maturity", () => {
  const source = clonePreset("bean");
  let responding = 0,
    remodeling = 0;
  for (const seed of seeds) {
    const neutral = createSimulation(source, seed),
      stress = createSimulation(source, seed, "infant", {
        needTimeline: [{ needId: "safety", tick: 0, fulfillment: 0 }],
      }),
      recovered = createSimulation(source, seed, "infant", {
        needTimeline: [
          { needId: "safety", tick: 0, fulfillment: 0 },
          { needId: "safety", tick: 150 * 24, fulfillment: 1 },
        ],
      });
    if (
      difference(neutral.frameAt(120).pixels, stress.frameAt(120).pixels) > 0.01
    )
      responding++;
    assert.ok(
      recovered.stateAt(180).needs.safety.memory <
        stress.stateAt(180).needs.safety.memory * 0.1,
    );
    if (
      difference(recovered.frameAt(150).pixels, recovered.frameAt(180).pixels) >
      0.01
    )
      remodeling++;
  }
  assert.equal(responding, seeds.length);
  assert.ok(
    remodeling >= 3,
    `only${remodeling}/${seeds.length} late recoveries visibly remodel`,
  );
});

test("actual generated regions, active operations and functional bones obey published bounds", () => {
  const fragments: PetPart[] = Array.from({ length: 90 }, (_, i) =>
    part(`fragment-${i}`, "leg", [
      { x: i % 30, y: Math.floor(i / 30) * 6 + 10, color: "#FFFFFF" },
    ]),
  );
  for (const source of [clonePreset("beetle"), fragments]) {
    const sim = createSimulation(source, "bounds");
    for (const age of [7, 15, 30, 50, 75, 100, 120]) {
      const f = sim.frameAt(age, { time: 0.375, action: "move" }),
        development = sim.developmentAt(age);
      assert.ok(f.parts.filter((p) => !p.sourcePartId).length <= 32);
      assert.ok(
        development.operations.filter((o) => o.progress > 0 && o.progress < 1)
          .length <= 8,
      );
      const diagnostics = f.interaction.diagnostics as
        { boneLengths?: unknown[] } | undefined;
      assert.ok(
        (diagnostics?.boneLengths?.length ?? 0) * 2 <= 64,
        `age${age}: ${(diagnostics?.boneLengths?.length ?? 0) * 2} bones`,
      );
    }
  }
});

test("authored Cub ears and tail remain joined to current host pixels through milestone and intermediate poses", () => {
  const failures: {
    seed: string;
    age: number;
    phase: number;
    id: string;
    host: string | null;
    gap: number;
  }[] = [];
  for (let slot = 1; slot <= 16; slot++) {
    const seed = `life-v6-genome-${String(slot).padStart(2, "0")}`,
      sim = createSimulation(clonePreset("canine-cub"), seed);
    const attachedIds = sim
      .frameAt(0)
      .parts.filter(
        (p) =>
          ["ear", "tail"].includes(p.kind) &&
          ["joint", "surface"].includes(p.relationship),
      )
      .map((p) => p.id);
    assert.deepEqual(
      new Set(attachedIds),
      new Set(["ear-left", "ear-right", "tail"]),
    );
    for (const age of [
      0, 7, 15, 22, 30, 40, 52.5, 60, 75, 85, 97.5, 110, 120,
    ]) {
      const pace = sim.frameAt(age).motionPace;
      for (let phase = 0; phase < 8; phase++) {
        const frame = sim.frameAt(age, {
          time: phase / (8 * pace) + 1e-8,
          action: "move",
        });
        for (const id of attachedIds) {
          const feature = frame.parts.find((p) => p.id === id);
          if (!feature) {
            assert.ok(
              frame.evolution?.commitments.some((c) => c.option === "absorb"),
              `${id}: loss requires committed resorption`,
            );
            assert.ok(
              frame.evolution?.anatomy.some((p) =>
                p.sourcePartIds.includes(id),
              ),
              `${id}: successor must retain material lineage`,
            );
            continue;
          }
          const host = frame.parts.find((p) => p.id === feature?.parentId);
          let gap = Infinity;
          for (const pixel of feature?.pixels ?? [])
            for (const carrier of host?.pixels ?? [])
              gap = Math.min(
                gap,
                Math.hypot(pixel.x - carrier.x, pixel.y - carrier.y),
              );
          if (gap > 3)
            failures.push({
              seed,
              age,
              phase,
              id,
              host: feature?.parentId ?? null,
              gap,
            });
        }
      }
    }
  }
  assert.equal(
    failures.length,
    0,
    `Rendered source roots separated from host pixels: ${JSON.stringify(failures.sort((a, b) => b.gap - a.gap).slice(0, 20))}`,
  );
});

test("intentional floating appendages retain floating ownership rather than becoming physical source roots", () => {
  const source = [
    part("body", "body", rectangle(11, 14, 12, 8)),
    part("tail", "tail", rectangle(3, 5, 3, 2), "body"),
  ];
  const sim = createSimulation(source, "floating-root-contract");
  assert.equal(
    sim.frameAt(0).parts.find((p) => p.id === "tail")?.relationship,
    "floating",
  );
  for (const age of [0, 30, 75, 120]) {
    const frame = sim.frameAt(age, { time: 0.375, action: "move" }),
      tail = frame.parts.find((p) => p.id === "tail");
    assert.ok(tail?.pixels.length);
    assert.equal(tail.relationship, "floating");
    assert.equal(tail.attached, false);
  }
});

test("bright facial ink without a drawn host keeps its original negative-space contrast", () => {
  const source = [part("eye", "eye", [{ x: 16, y: 15, color: "#FFFFFF" }])];
  const sim = createSimulation(source, "hostless-bright-face");
  for (const age of [30, 75, 120]) {
    const frame = sim.frameAt(age),
      eye = frame.parts.find((p) => p.id === "eye")!;
    const occupied = new Map(
      frame.pixels.map((p) => [p.y * 64 + p.x, p.color]),
    );
    assert.ok(
      eye.pixels.some((p) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(
          ([dx, dy]) =>
            (occupied.get((p.y + dy) * 64 + p.x + dx) ?? "#000000") !== p.color,
        ),
      ),
    );
  }
});

test("distant floating facial ink is fitted with its host before clipping the final grid", () => {
  const source = [
    part("body", "body", rectangle(1, 1, 1, 1)),
    part("eye", "eye", rectangle(29, 29, 1, 1), "body"),
  ];
  const sim = createSimulation(source, "far-floating-camera");
  for (const age of [30, 75, 120]) {
    const frame = sim.frameAt(age);
    const eye = frame.parts.find((p) => p.id === "eye")!;
    assert.ok(
      eye.pixels.length,
      `day${age}: far floating eye was clipped before camera fitting`,
    );
    assert.ok(
      frame.pixels.every((p) => p.x >= 0 && p.x < 64 && p.y >= 0 && p.y < 64),
    );
  }
});

test("birth honors authored semantic paint ties even when source IDs sort oppositely", () => {
  const source = [
    part("z-body", "body", [{ x: 12, y: 12, color: "#FFFFFF" }]),
    part("a-head", "head", [{ x: 12, y: 12, color: "#000000" }]),
  ].map((p) => ({ ...p, layer: 0 }));
  assert.deepEqual(createSimulation(source, "paint-ties").frameAt(0).pixels, [
    { x: 28, y: 28, color: "#000000" },
  ]);
});

test("regional palette ties and Unicode limb identities do not consult ambient locale", () => {
  const source = [
    part("body", "body", [
      { x: 14, y: 14, color: "#AA0000" },
      { x: 15, y: 14, color: "#00AA00" },
    ]),
    part("leg-ı", "leg", rectangle(14, 15, 1, 3), "body"),
    part("leg-I", "leg", rectangle(14, 15, 1, 3), "body"),
  ];
  const expected = createSimulation(source, "locale-regional").frameAt(75);
  const previous = String.prototype.localeCompare;
  let actual;
  try {
    String.prototype.localeCompare = () => {
      throw new Error("Ambient locale was consulted");
    };
    actual = createSimulation(source, "locale-regional").frameAt(75);
  } finally {
    String.prototype.localeCompare = previous;
  }
  assert.deepEqual(actual, expected);
});

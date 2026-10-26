import test from "node:test";
import assert from "node:assert/strict";
import {
  transportCenterlinePoint,
  centerlineMaterialFrame,
  resampleCenterline,
  describeSource,
  transportRegionalPoint,
  type CenterlineTransport,
  type RegionalMaterialTransport,
} from "../src/simulation/source-atlas";
import {
  mapSourcePoint,
  rigidMaterialCarrier,
  compileDevelopment,
  resolveDevelopment,
  type MaterialWarp,
  type Region,
} from "../src/simulation/development";
import { compileGenome } from "../src/simulation/genome";
import { compileSources } from "../src/simulation/material";
import { createSimulation, type PetPart, type Point } from "../src/simulation";
import { createNeedsSimulation } from "../src/needs";
import { clonePreset } from "../src/presets";

const near = (a: Point, b: Point, epsilon = 1e-7) =>
  assert.ok(
    Math.hypot(a.x - b.x, a.y - b.y) < epsilon,
    `${JSON.stringify(a)} ~= ${JSON.stringify(b)}`,
  );
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
test("regional material identity is exact and source band samples stay on their fixed cage", () => {
  const cage = (id: string, uMin: number, uMax: number, x: number) => ({
    id,
    uMin,
    uMax,
    sourceCenter: { x, y: 0 },
    sourceRadius: { x: 2.5, y: 2 },
    center: { x, y: 0 },
    radius: { x: 2.5, y: 2 },
    angle: 0,
    roundness: 0,
  });
  const kernel: RegionalMaterialTransport = {
    centerline: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    axis: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    cages: [cage("a", 0, 0.5, 2.5), cage("b", 0.5, 1, 7.5)],
  };
  for (const point of [
    { x: -2, y: 3 },
    { x: 5, y: -2 },
    { x: 12.5, y: 0.5 },
  ])
    assert.deepEqual(transportRegionalPoint(kernel, point), point);
  const moved = {
    ...kernel,
    fixedDomainId: "a",
    cages: kernel.cages.map((c) => ({
      ...c,
      center: { x: c.center.x + (c.id === "a" ? -5 : 15), y: 4 },
    })),
  };
  near(transportRegionalPoint(moved, { x: 6, y: 1 }), { x: 1, y: 5 });
  near(
    transportRegionalPoint(
      { ...moved, fixedDomainId: undefined },
      { x: 6, y: 1 },
    ),
    { x: 21, y: 5 },
  );
});
test("regional endcaps carry source material nonlinearly and face skin shares its protected glyph frame", () => {
  const kernel: RegionalMaterialTransport = {
    centerline: [
      { x: -5, y: 0 },
      { x: 5, y: 0 },
    ],
    axis: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    cages: [
      {
        id: "core",
        uMin: 0,
        uMax: 1,
        sourceCenter: { x: 0, y: 0 },
        sourceRadius: { x: 5, y: 3 },
        center: { x: 10, y: 8 },
        radius: { x: 7, y: 5 },
        angle: 2,
        roundness: 0.6,
      },
    ],
    carriers: [{ anchor: { x: 1, y: 0 }, radius: 2, maxTurn: Math.PI / 6 }],
  };
  const left = transportRegionalPoint(kernel, { x: 0, y: 0 }),
    right = transportRegionalPoint(kernel, { x: 2, y: 0 });
  assert.ok(
    Math.abs(Math.atan2(right.y - left.y, right.x - left.x)) <= Math.PI / 6,
  );
  assert.ok(
    Math.abs(distance(left, right) - 2.7) < 1e-8,
    "shared glyph/skin guard allows only bounded uniform growth",
  );
  const raw = { ...kernel, carriers: [] },
    corners = [
      transportRegionalPoint(raw, { x: -5, y: 3 }),
      transportRegionalPoint(raw, { x: 0, y: 3 }),
      transportRegionalPoint(raw, { x: 5, y: 3 }),
    ];
  assert.ok(
    distance(corners[1], {
      x: (corners[0].x + corners[2].x) / 2,
      y: (corners[0].y + corners[2].y) / 2,
    }) > 2,
  );
});
function arcKernel(radius = 12): CenterlineTransport {
  const length = (radius * Math.PI) / 2;
  return {
    source: [
      { x: 0, y: 0 },
      { x: length, y: 0 },
    ],
    target: Array.from({ length: 25 }, (_, i) => ({
      x: radius * Math.sin(((i / 24) * Math.PI) / 2),
      y: radius * (1 - Math.cos(((i / 24) * Math.PI) / 2)),
    })),
    widths: [1, 1],
  };
}
function warp(centerline: CenterlineTransport): MaterialWarp {
  return {
    origin: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    angle: 0,
    span: { x: 1, y: 1 },
    bend: 0,
    waist: 0,
    wave: 0,
    phase: 0,
    centerline,
  };
}
function rect(
  id: string,
  kind: PetPart["kind"],
  x: number,
  y: number,
  w: number,
  h: number,
  parentId: string | null = null,
): PetPart {
  return {
    id,
    kind,
    name: id,
    position: { x, y },
    parentId,
    pixels: Array.from({ length: w * h }, (_, n) => ({
      x: n % w,
      y: Math.floor(n / w),
      color:
        kind === "eye"
          ? id === "eye-left"
            ? "#ee2222"
            : "#22ee22"
          : kind === "mouth"
            ? "#2222ee"
            : "#dddddd",
    })),
  };
}

test("identity and zero-strength centerline transport preserve every coordinate exactly", () => {
  const line = [
    { x: -3, y: 2 },
    { x: 3, y: 5 },
    { x: 9, y: 4 },
  ];
  const identity = {
    source: line,
    target: line.map((p) => ({ ...p })),
    widths: [1, 1],
  };
  const zero = { ...arcKernel(), strength: 0 };
  for (const p of [
    { x: 0, y: 0 },
    { x: -44.125, y: 71.625 },
    { x: 8.25, y: -3.125 },
  ]) {
    assert.deepEqual(transportCenterlinePoint(identity, p), p);
    assert.deepEqual(transportCenterlinePoint(zero, p), p);
    assert.notEqual(transportCenterlinePoint(zero, p), p);
    const frame = centerlineMaterialFrame(zero, p);
    near(frame.targetPoint, p);
    near(frame.targetTangent, frame.sourceTangent);
    assert.ok(Math.abs(frame.width - 1) < 1e-8);
  }
});

test("arc parameter and signed normal offset rotate material with endpoint extrapolation", () => {
  const kernel: CenterlineTransport = {
    source: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    target: [
      { x: 10, y: 5 },
      { x: 10, y: 15 },
    ],
    widths: [1, 1],
  };
  near(transportCenterlinePoint(kernel, { x: 5, y: 2 }), { x: 8, y: 10 });
  near(transportCenterlinePoint(kernel, { x: -2, y: 3 }), { x: 7, y: 3 });
  near(transportCenterlinePoint(kernel, { x: 12, y: -2 }), { x: 12, y: 17 });
  near(
    transportCenterlinePoint({ ...kernel, widths: [0.5, 2] }, { x: 5, y: 2 }),
    { x: 7.5, y: 10 },
  );
});

test("a ninety-degree curved path transports a strip rather than scaling its bounding box", () => {
  const kernel = arcKernel(),
    total = kernel.source[1].x;
  near(transportCenterlinePoint(kernel, { x: 0, y: 0 }), { x: 0, y: 0 });
  near(transportCenterlinePoint(kernel, { x: total, y: 0 }), { x: 12, y: 12 });
  const a = transportCenterlinePoint(kernel, { x: 0, y: 0 }),
    b = transportCenterlinePoint(kernel, { x: total / 2, y: 0 }),
    c = transportCenterlinePoint(kernel, { x: total, y: 0 });
  const area =
    Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  assert.ok(
    area > 20,
    "three collinear material markers become genuinely curved",
  );
  for (let i = 0; i <= 20; i++) {
    const x = (total * i) / 20,
      center = transportCenterlinePoint(kernel, { x, y: 0 });
    assert.ok(
      Math.abs(
        distance(center, transportCenterlinePoint(kernel, { x, y: 2 })) - 2,
      ) < 1e-6,
    );
  }
});

test("source contour holes remain empty under an injective curved strip transport", () => {
  const kernel = arcKernel(14),
    sourceLength = kernel.source[1].x;
  const painted: Point[] = [];
  for (let y = -3; y <= 3; y++)
    for (let x = 0; x <= 14; x++)
      if (!(x >= 6 && x <= 8 && Math.abs(y) <= 1))
        painted.push({ x: (x * sourceLength) / 14, y });
  const triangle = (p: Point, a: Point, b: Point, c: Point) => {
    const side = (u: Point, v: Point) =>
      (v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x);
    const values = [side(a, b), side(b, c), side(c, a)];
    return values.every((v) => v >= -1e-8) || values.every((v) => v <= 1e-8);
  };
  const hole = transportCenterlinePoint(kernel, { x: sourceLength / 2, y: 0 });
  for (const p of painted) {
    const q = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ].map(([dx, dy]) =>
      transportCenterlinePoint(kernel, {
        x: p.x + (dx * sourceLength) / 14,
        y: p.y + dy,
      }),
    );
    assert.ok(q.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
    assert.ok(
      !triangle(hole, q[0], q[1], q[2]) && !triangle(hole, q[0], q[2], q[3]),
    );
  }
});

test("a whole face and its skin neighborhood share a rigid carrier throughout activation", () => {
  const base = arcKernel(),
    anchor = { x: base.source[1].x * 0.7, y: 0 };
  const marks = [
    { x: anchor.x - 1, y: -1 },
    { x: anchor.x + 1, y: -1 },
    { x: anchor.x, y: 1 },
  ];
  for (const strength of [0, 0.1, 0.5, 1]) {
    const kernel = { ...base, strength, carriers: [{ anchor, radius: 4 }] };
    const mapped = marks.map((p) => transportCenterlinePoint(kernel, p));
    for (let i = 0; i < marks.length; i++)
      for (let j = i + 1; j < marks.length; j++)
        assert.ok(
          Math.abs(
            distance(mapped[i], mapped[j]) - distance(marks[i], marks[j]),
          ) < 1e-8,
        );
    const skin = { x: anchor.x + 1, y: 0 },
      frame = centerlineMaterialFrame(kernel, skin);
    assert.ok(
      Math.abs(frame.width - 1) < 1e-6,
      "the same facial base material is rigid, not only the eye glyphs",
    );
  }
});

test("articulated child frames keep their root on a curved host and do not inherit distant host strain", () => {
  const kernel = arcKernel(),
    step = warp(kernel),
    sourcePivot = { x: 8, y: 0 };
  const carrier = rigidMaterialCarrier([step], sourcePivot, { x: 2, y: 5 });
  const body = { sourceWarp: { steps: [step] } } as Region,
    child = { sourceWarp: { steps: [carrier] } } as Region;
  near(
    mapSourcePoint(body, sourcePivot),
    mapSourcePoint(child, sourcePivot),
    0.001,
  );
  const a = { x: 8, y: 0 },
    b = { x: 8, y: 12 },
    c = { x: 10, y: 12 };
  assert.ok(
    Math.abs(
      distance(mapSourcePoint(child, a), mapSourcePoint(child, b)) - 12,
    ) < 0.01,
  );
  assert.ok(
    Math.abs(distance(mapSourcePoint(child, b), mapSourcePoint(child, c)) - 2) <
      0.01,
  );
});

test("degenerate paths are finite and sampling has a bounded point count", () => {
  const bad: CenterlineTransport = {
    source: [
      { x: 2, y: 2 },
      { x: 2, y: 2 },
    ],
    target: [{ x: 4, y: 4 }],
    widths: [],
  };
  near(transportCenterlinePoint(bad, { x: 7, y: 9 }), { x: 7, y: 9 });
  assert.equal(
    resampleCenterline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      1000,
    ).length,
    65,
  );
});

test("life programs are seed-only and source analysis groups a shared protected face", () => {
  const source = [
    rect("body", "body", 9, 10, 12, 10),
    rect("eye-left", "eye", 12, 12, 1, 2, "body"),
    rect("eye-right", "eye", 17, 12, 1, 2, "body"),
    rect("mouth", "mouth", 14, 16, 3, 1, "body"),
  ];
  const atlas = describeSource(compileSources(source, 1));
  assert.equal(atlas.faceIslands.length, 1);
  assert.deepEqual(
    new Set(atlas.faceIslands[0].sourceIds),
    new Set(["eye-left", "eye-right", "mouth"]),
  );
  const kinds = new Set(
    Array.from(
      { length: 32 },
      (_, i) => compileGenome(`life-program-${i}`).lifeProgram.kind,
    ),
  );
  assert.deepEqual(kinds, new Set(["direct", "sheltered", "metamorphic"]));
  const genome = compileGenome("stable-life-program"),
    program = compileDevelopment(atlas, genome);
  assert.deepEqual(program.genome, genome);
  assert.ok(program.lifeProgram.sourceCompatible);
  const recolored = source.map((p) => ({
    ...p,
    pixels: p.pixels.map((c) => ({ ...c, color: "#ff00ff" })),
  }));
  assert.deepEqual(
    describeSource(compileSources(recolored, 1)).descriptors,
    atlas.descriptors,
  );
});

test("resolved body material uses independent cages while attached limbs have local rigid incoming carriers", () => {
  const parts = [
    rect("body", "body", 6, 14, 20, 4),
    rect("leg-left", "leg", 9, 18, 2, 5, "body"),
    rect("leg-right", "leg", 21, 18, 2, 5, "body"),
  ];
  const tissues = compileSources(parts, 1),
    program = compileDevelopment(
      describeSource(tissues),
      compileGenome("material-coil"),
    );
  const neutral = createNeedsSimulation("material-coil", []).stateAt(0),
    read = () => neutral;
  for (const age of [15, 30, 50, 75, 100, 120]) {
    const result = resolveDevelopment(program, tissues, age, read),
      body = result.regions.find((r) => r.id === "body")!;
    assert.ok(body.sourceWarp!.steps.some((step) => step.regional));
    assert.ok(body.sourceWarp!.steps.every((step) => !step.centerline));
    assert.equal(result.regions.filter((r) => r.sourceDomain).length, 3);
    for (const leg of result.regions.filter(
      (r) => r.kind === "leg" && r.source,
    )) {
      assert.ok(leg.sourceWarp!.steps.every((step) => !step.centerline));
      const parent = result.regions.find((r) => r.id === leg.parentId)!;
      const materialRoot = leg.repurpose?.materialRoot;
      const oldRoot = mapSourcePoint(parent, leg.source!.pivot),
        relocated = materialRoot
          ? mapSourcePoint(parent, materialRoot)
          : oldRoot;
      const amount = leg.repurpose?.progress ?? 0;
      near(
        mapSourcePoint(leg, leg.source!.pivot),
        {
          x: oldRoot.x + (relocated.x - oldRoot.x) * amount,
          y: oldRoot.y + (relocated.y - oldRoot.y) * amount,
        },
        0.012,
      );
    }
    assert.ok(result.regions.filter((r) => !r.source).length <= 32);
    for (const region of result.regions.filter((r) => r.source))
      for (const cell of region.source!.cells) {
        const p = mapSourcePoint(region, cell);
        assert.ok(
          Number.isFinite(p.x) &&
            Number.isFinite(p.y) &&
            Math.abs(p.x) < 224 &&
            Math.abs(p.y) < 224,
        );
      }
  }
});

test("protected face pigments remain visible in composite frames during body folding", () => {
  const parts = [
    rect("body", "body", 9, 10, 12, 10),
    rect("eye-left", "eye", 12, 12, 1, 2, "body"),
    rect("eye-right", "eye", 17, 12, 1, 2, "body"),
    rect("mouth", "mouth", 14, 16, 3, 1, "body"),
  ];
  for (let seed = 0; seed < 4; seed++) {
    const simulation = createSimulation(parts, `visible-face-${seed}`);
    for (const age of [0, 15, 30, 45, 75, 120]) {
      const frame = simulation.frameAt(age);
      for (const id of ["eye-left", "eye-right", "mouth"]) {
        const part = frame.parts.find((p) => p.id === id)!;
        assert.ok(
          part && part.pixels.length,
          `${seed}/${age}/${id} remains material`,
        );
        // Facial pigment may intentionally adapt to contrast with a growing
        // carrier. Require actual feature pixels to survive compositing at
        // their rendered positions, rather than requiring their birth color.
        const composite = new Map(
          frame.pixels.map((pixel) => [
            `${pixel.x},${pixel.y}`,
            pixel.color.toUpperCase(),
          ]),
        );
        assert.ok(
          part.pixels.some(
            (pixel) =>
              composite.get(`${pixel.x},${pixel.y}`) ===
              pixel.color.toUpperCase(),
          ),
          `${seed}/${age}/${id} is visible in the composite`,
        );
      }
    }
  }
});

test("sheltered appendages physically fold and contract at their root, then release without losing source cells", () => {
  const parts = [
    rect("body", "body", 12, 14, 8, 8),
    rect("head", "head", 12, 8, 8, 6, "body"),
    rect("hair", "hair", 15, 3, 2, 5, "head"),
    rect("leg", "leg", 13, 22, 2, 5, "body"),
    rect("tail", "tail", 6, 17, 6, 2, "body"),
    rect("eye-left", "eye", 14, 10, 1, 1, "head"),
    rect("eye-right", "eye", 17, 10, 1, 1, "head"),
  ];
  const seed = Array.from(
    { length: 32 },
    (_, i) => `enclosure-source-${i}`,
  ).find((s) => compileGenome(s).lifeProgram.kind === "sheltered")!;
  const tissues = compileSources(parts, 1),
    program = compileDevelopment(describeSource(tissues), compileGenome(seed));
  const neutral = createNeedsSimulation(seed, []).stateAt(0),
    read = () => neutral;
  const wrapped = resolveDevelopment(program, tissues, 30, read),
    released = resolveDevelopment(program, tissues, 70, read);
  for (const id of ["hair", "leg", "tail"]) {
    const r = wrapped.regions.find((r) => r.id === id)!,
      c = r.source!,
      before = {
        ...r,
        sourceWarp: {
          steps: r.sourceWarp!.steps.filter((step) => !step.retraction),
        },
      };
    assert.equal(
      r.source!.cells.length,
      tissues.find((t) => t.id === id)!.cells.length,
    );
    assert.ok(r.sourceWarp!.steps.some((step) => step.retraction));
    near(mapSourcePoint(r, c.pivot), mapSourcePoint(before, c.pivot), 0.005);
    const fullLength = distance(
      mapSourcePoint(before, c.pivot),
      mapSourcePoint(before, c.tip),
    );
    const tuckedLength = distance(
      mapSourcePoint(r, c.pivot),
      mapSourcePoint(r, c.tip),
    );
    assert.ok(
      Math.abs(tuckedLength / fullLength - 0.2) < 0.02,
      `${id} has real axial contraction`,
    );
    assert.ok(
      released.regions
        .find((r) => r.id === id)!
        .sourceWarp!.steps.every((step) => !step.retraction),
    );
  }
  for (const r of wrapped.regions.filter((r) =>
    ["head", "eye", "mouth"].includes(r.kind),
  ))
    assert.ok(r.sourceWarp!.steps.every((step) => !step.retraction));
});

test("black facial glyphs retain contrasting source skin during the entire sheltered window", () => {
  const parts = [
    rect("body", "body", 9, 10, 12, 10),
    rect("eye-left", "eye", 12, 12, 1, 2, "body"),
    rect("eye-right", "eye", 17, 12, 1, 2, "body"),
    rect("mouth", "mouth", 14, 16, 3, 1, "body"),
  ];
  for (const p of parts.filter((p) => p.kind !== "body"))
    p.pixels.forEach((pixel) => {
      pixel.color = "#000000";
    });
  const seed = Array.from({ length: 32 }, (_, i) => `face-shelter-${i}`).find(
    (s) => compileGenome(s).lifeProgram.kind === "sheltered",
  )!;
  const simulation = createSimulation(parts, seed);
  for (const age of [12, 18, 24, 30, 36, 42, 55, 70]) {
    const frame = simulation.frameAt(age),
      visible = new Map(frame.pixels.map((p) => [p.y * 64 + p.x, p]));
    for (const id of ["eye-left", "eye-right", "mouth"]) {
      const face = frame.parts.find((p) => p.id === id)!;
      assert.ok(
        face.pixels.some(
          (p) =>
            visible.get(p.y * 64 + p.x)?.color === "#000000" &&
            frame.pixels.some(
              (skin) =>
                skin.color !== "#000000" &&
                Math.max(Math.abs(skin.x - p.x), Math.abs(skin.y - p.y)) <= 2,
            ),
        ),
        `${id}/${age} retains visible contrast`,
      );
    }
  }
});

test("face stabilization is bounded and does not snap when a coiling host crosses the backward axis", () => {
  const angles: number[] = [];
  for (const degrees of [170, 179, 181, 190]) {
    const angle = (degrees * Math.PI) / 180;
    const kernel: CenterlineTransport = {
      source: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      target: [
        { x: 0, y: 0 },
        { x: Math.cos(angle) * 10, y: Math.sin(angle) * 10 },
      ],
      widths: [1, 1],
      carriers: [
        {
          anchor: { x: 5, y: 0 },
          radius: 3,
          sourceAngle: 0,
          maxTurn: Math.PI / 6,
        },
      ],
    };
    const a = transportCenterlinePoint(kernel, { x: 4, y: 0 }),
      b = transportCenterlinePoint(kernel, { x: 6, y: 0 });
    const observed = Math.atan2(b.y - a.y, b.x - a.x);
    assert.ok(Math.abs(observed) <= Math.PI / 6 + 1e-8);
    assert.ok(Math.abs(distance(a, b) - 2) < 1e-8);
    angles.push(observed);
    const incoming = rigidMaterialCarrier(
      [warp({ ...kernel, carriers: [] })],
      { x: 5, y: 0 },
      { x: 2, y: 2 },
      Math.PI / 6,
    );
    assert.ok(Math.abs(incoming.angle) <= Math.PI / 6);
  }
  assert.ok(
    Math.abs(angles[2] - angles[1]) < 0.03,
    "no +/-30 degree hard-clamp flip",
  );
});

test("structural necks end on occupied current host and head material after division and coiling", () => {
  for (let seed = 1; seed <= 4; seed++) {
    const parts = clonePreset("canine-cub"),
      tissues = compileSources(parts, 1),
      program = compileDevelopment(
        describeSource(tissues),
        compileGenome(`life-v7-genome-0${seed}`),
      );
    const neutral = createNeedsSimulation("neck-anchors", []).stateAt(0),
      read = () => neutral;
    for (const age of [30, 75, 82.5, 120]) {
      const r = resolveDevelopment(program, tissues, age, read),
        head = r.regions.find((r) => r.id === "head")!;
      const parent = r.regions.find((r) => r.id === head.parentId)!,
        neck = r.regions.find((r) => r.id === "head/neck");
      assert.ok(
        head.anchorSourcePoint &&
          head.source!.cells.some(
            (p) =>
              p.x === head.anchorSourcePoint!.x &&
              p.y === head.anchorSourcePoint!.y,
          ),
      );
      near(mapSourcePoint(head, head.anchorSourcePoint!), head.anchor, 0.001);
      const host = parent
        .source!.cells.filter(
          (p) =>
            !parent.sourceClip ||
            (p[parent.sourceClip.axis] >= parent.sourceClip.min &&
              p[parent.sourceClip.axis] < parent.sourceClip.max),
        )
        .map((p) => mapSourcePoint(parent, p));
      if (neck) {
        assert.equal(neck.parentId, head.parentId);
        assert.ok(
          Math.min(...host.map((p) => distance(p, neck.anchor))) < 0.001,
        );
        near(neck.tip, head.anchor, 0.001);
        assert.ok(neck.rx >= 0.8);
      } else
        assert.ok(Math.min(...host.map((p) => distance(p, head.anchor))) <= 1);
    }
  }
});

test("sheltered quadrupeds commit an internal source-support reorganization for emergence", () => {
  const tissues = compileSources(clonePreset("canine-cub"), 1);
  const seed = Array.from(
    { length: 64 },
    (_, i) => `sheltered-emergence-${i}`,
  ).find(
    (s) =>
      compileGenome(s).lifeProgram.kind === "sheltered" &&
      compileDevelopment(describeSource(tissues), compileGenome(s))
        .regionalLayout.stages[1].functionalStrategy === "rear-support",
  )!;
  const program = compileDevelopment(
    describeSource(tissues),
    compileGenome(seed),
  );
  const neutral = createNeedsSimulation(seed, []).stateAt(0),
    read = () => neutral;
  const r = resolveDevelopment(program, tissues, 75, read);
  const conversion = r.state.commitments.find(
    (c) => c.id === "evolution.2.replace",
  );
  assert.equal(conversion?.option, "repurpose");
  assert.equal(
    r.regions.filter((p) => p.repurpose?.targetKind === "arm").length,
    2,
  );
  assert.equal(
    r.regions.filter((p) => p.repurpose?.targetKind === "hand").length,
    2,
  );
  assert.ok(
    (r.state.diagnostics as any).functionalConversions.every((c: any) =>
      c.reason.includes("support-role succession"),
    ),
  );
  const noSupports = compileSources([rect("body", "body", 8, 10, 12, 10)], 1);
  const bodyProgram = compileDevelopment(
    describeSource(noSupports),
    compileGenome(seed),
  );
  assert.ok(
    !resolveDevelopment(
      bodyProgram,
      noSupports,
      75,
      read,
    ).state.commitments.some((c) => c.option === "repurpose"),
  );
});

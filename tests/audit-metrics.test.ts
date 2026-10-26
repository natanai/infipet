import assert from "node:assert/strict";
import test from "node:test";
import {
  createSimulation,
  createStarterAnatomy,
  type PetFrame,
  type PartFrame,
  type Pixel,
} from "../src/simulation";
import {
  describeFrame,
  shapeDistance,
  semanticDistance,
  frameHash,
  topology,
  visibleContributions,
  varianceAttribution,
  PROPORTION_NAMES,
  type FrameDescriptor,
} from "../tools/audit/metrics";

const blank = createSimulation([], "metric-test").frameAt(0);
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  color = "#aaaaaa",
): Pixel[] =>
  Array.from({ length: w * h }, (_, i) => ({
    x: x + (i % w),
    y: y + Math.floor(i / w),
    color,
  }));
function frame(pixels: Pixel[], parts: PartFrame[] = []): PetFrame {
  return { ...blank, pixels, parts, cellCount: pixels.length };
}
function art(rows: string[]): Pixel[] {
  return rows.flatMap((row, y) =>
    [...row].flatMap((char, x) =>
      char === "." ? [] : [{ x: x + 24, y: y + 24, color: "#aaaaaa" }],
    ),
  );
}
function transform(
  pixels: Pixel[],
  scale = 1,
  angle = 0,
  dx = 0,
  dy = 0,
): Pixel[] {
  const source = new Map(pixels.map((p) => [p.y * 64 + p.x, p.color])),
    c = Math.cos(angle),
    s = Math.sin(angle),
    out: Pixel[] = [];
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const u = (x - 32 - dx) / scale,
        v = (y - 32 - dy) / scale,
        xx = Math.floor(32 + u * c + v * s + 0.5 + 1e-10),
        yy = Math.floor(32 - u * s + v * c + 0.5 + 1e-10),
        color = source.get(yy * 64 + xx);
      if (color && xx >= 0 && xx < 64 && yy >= 0 && yy < 64)
        out.push({ x, y, color });
    }
  return out;
}
const asym = art([
  "..##.......",
  "..###......",
  "..####.....",
  "..########.",
  "..########.",
  "..########.",
  "..######...",
  "..######...",
  "..##...##..",
  "..##...##..",
]);
const describe = (pixels: Pixel[]) => describeFrame(frame(pixels));
function part(id: string, kind: PartFrame["kind"], pixels: Pixel[]): PartFrame {
  return {
    id,
    kind,
    name: id,
    parentId: null,
    provenance: "authored",
    relationship: "root",
    pixels,
    anchor: { x: 0, y: 0 },
    tip: { x: 0, y: 0 },
    attachment: null,
    attached: false,
    scale: 1,
    growth: { x: 1, y: 1 },
    rotation: 0,
    planted: false,
    bounds: { x: 0, y: 0, width: 1, height: 1 },
  };
}

test("packed shape metrics ignore translation, color, pixel order, and overall uniform scale", () => {
  const a = describe(asym),
    shift = describe(
      asym
        .map((p) => ({ ...p, x: p.x + 7, y: p.y - 11, color: "#ff0000" }))
        .reverse(),
    ),
    scaled = describe(transform(asym, 2));
  assert.equal(shapeDistance(a, shift), 0);
  assert.equal(semanticDistance(a, shift).changed, 0);
  assert.ok(
    shapeDistance(a, scaled) < 0.05,
    `uniform scale distance ${shapeDistance(a, scaled)}`,
  );
  assert.equal(a.normalized16.length, 16);
  assert.equal(a.normalized32.length, 32);
  assert.ok(
    a.normalized32.every(
      (row) => Number.isInteger(row) && row >= 0 && row <= 0xffffffff,
    ),
  );
  assert.equal(a.proportions.length, PROPORTION_NAMES.length);
  assert.ok(
    JSON.stringify(a).length < 2200,
    "compact numeric rows, not expanded world masks",
  );
  assert.deepEqual(describeFrame(frame([...asym].reverse())), a);
});

test("global quarter, half and arbitrary rotations stay under the5%nuisance threshold", () => {
  const a = describe(asym);
  for (const degrees of [90, 180, 270, 17, 37, 61]) {
    const b = describe(transform(asym, 1, (degrees * Math.PI) / 180));
    assert.ok(
      shapeDistance(a, b) < 0.05,
      `${degrees}degree rotation distance ${shapeDistance(a, b)}`,
    );
    assert.equal(shapeDistance(a, b), shapeDistance(b, a));
  }
});

test("near-isotropic crosses and round bodies have robust rotational fallbacks", () => {
  const plus = [...rect(27, 20, 3, 17), ...rect(20, 27, 17, 3)],
    disk = rect(20, 20, 20, 20).filter(
      (p) => (p.x - 29.5) ** 2 + (p.y - 29.5) ** 2 < 90,
    );
  for (const pixels of [plus, disk]) {
    const a = describe(pixels);
    for (const angle of [Math.PI / 4, 0.37, Math.PI / 2])
      assert.ok(
        shapeDistance(a, describe(transform(pixels, 1, angle))) < 0.05,
        `isotropic rotation ${angle}`,
      );
  }
});

test("lobed near-isotropic shapes remain stable when raster rotation crosses the PCA reliability cutoff", () => {
  for (const lobes of [3, 4, 5, 6])
    for (const phase of [0, 0.3, 0.7, 1.2]) {
      const pixels = rect(12, 12, 40, 40).filter((p) => {
        const x = p.x - 32,
          y = p.y - 32,
          angle = Math.atan2(y, x);
        return (
          Math.hypot(x, y) <
          11 *
            (1 +
              0.35 * Math.cos(lobes * angle + phase) +
              0.05 * Math.sin(2 * angle + 0.3))
        );
      });
      const a = describe(pixels);
      for (const angle of [0.1, 0.3, 0.7, 1.1]) {
        const b = describe(transform(pixels, 1, angle)),
          distance = shapeDistance(a, b);
        assert.ok(
          distance < 0.05,
          `${lobes}lobes,phase${phase},angle${angle}: ${distance}`,
        );
        assert.equal(distance, shapeDistance(b, a));
        assert.equal(
          distance,
          shapeDistance(
            JSON.parse(JSON.stringify(a)),
            JSON.parse(JSON.stringify(b)),
          ),
          "saved descriptors carry every input needed by the comparison",
        );
      }
    }
});

test("derived comparison caches do not ignore edits to a caller-owned descriptor", () => {
  const a = describe(asym),
    b = structuredClone(a);
  assert.equal(shapeDistance(a, b), 0);
  b.normalized16.fill(0);
  b.normalized32.fill(0);
  assert.equal(shapeDistance(a, b), 1);
});

test("aspect changes, added anatomy and mirror chirality are not normalized away", () => {
  const round = describe(rect(24, 24, 12, 12)),
    long = describe(rect(19, 27, 26, 6));
  assert.ok(shapeDistance(round, long) > 0.2);
  const base = rect(26, 24, 8, 12),
    withTail = [...base, ...rect(34, 32, 15, 2)];
  assert.ok(shapeDistance(describe(base), describe(withTail)) > 0.1);
  const f = art([
    "##########",
    "##########",
    "##........",
    "##........",
    "########..",
    "########..",
    "##........",
    "##........",
    "##........",
    "##........",
  ]);
  assert.ok(
    shapeDistance(
      describe(f),
      describe(f.map((p) => ({ ...p, x: 63 - p.x }))),
    ) > 0.05,
    "rigid rotations must not silently permit reflections",
  );
});

test("small boundary pixel perturbations are tolerance-limited and empty shapes are finite", () => {
  const pixels = rect(20, 20, 20, 16),
    a = describe(pixels),
    b = describe([...pixels, { x: 40, y: 25, color: "#aaaaaa" }]);
  assert.ok(shapeDistance(a, b) < 0.05);
  const empty = describe([]);
  assert.equal(shapeDistance(empty, empty), 0);
  assert.equal(shapeDistance(a, empty), 1);
  assert.equal(semanticDistance(empty, empty).distance, 0);
  assert.ok(Object.values(empty.size).every(Number.isFinite));
});

test("foreground uses8connectivity and holes use complementary4connectivity", () => {
  assert.deepEqual(
    topology([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]),
    { components: 1, holes: 0 },
  );
  assert.deepEqual(
    topology(
      rect(3, 3, 7, 7).filter(
        (p) => p.x === 3 || p.x === 9 || p.y === 3 || p.y === 9,
      ),
    ),
    { components: 1, holes: 1 },
  );
  assert.deepEqual(
    topology(
      rect(0, 0, 5, 5).filter(
        (p) => p.x === 0 || p.x === 4 || p.y === 0 || p.y === 4,
      ),
    ),
    { components: 1, holes: 1 },
  );
  assert.deepEqual(topology([]), { components: 0, holes: 0 });
});

test("semantic changes use20%symmetric ratios and ignore missing dimensions", () => {
  const a = describe(asym),
    b = structuredClone(a);
  a.proportions.fill(0);
  b.proportions.fill(0);
  a.proportions[0] = 1;
  b.proportions[0] = 1.2;
  a.proportions[1] = 2;
  b.proportions[1] = 2.1;
  assert.equal(semanticDistance(a, b).changed, 1);
  assert.deepEqual(semanticDistance(a, b), semanticDistance(b, a));
  b.proportions[2] = 0.01;
  assert.equal(semanticDistance(a, b).changed, 2);
});

test("visibility reconstructs top paint and distinguishes same-color ambiguity from evidence", () => {
  const body = part("body", "body", rect(24, 24, 4, 4)),
    eye = part("eye", "eye", rect(25, 25, 1, 1, "#000000"));
  const image = body.pixels.map((p) =>
    p.x === 25 && p.y === 25 ? eye.pixels[0] : p,
  );
  const f = frame(image, [body, eye]),
    report = visibleContributions(f);
  assert.equal(report.fullyOccludedParts, 0);
  assert.equal(report.parts.find((p) => p.id === "eye")!.unambiguousPixels, 1);
  const overpaint = part("overpaint", "body", [
    { x: 25, y: 25, color: "#aaaaaa", z: 10000 },
  ]);
  const covered = visibleContributions(
    frame(body.pixels, [body, eye, overpaint]),
  );
  assert.equal(covered.parts.find((p) => p.id === "eye")!.winningPixels, 0);
  assert.equal(covered.fullyOccludedParts, 1);
  assert.ok(
    covered.ambiguousPixels > 0,
    "same-color ownership is not proof of a distinct visible mark",
  );
  const duplicate = part("body2", "body", body.pixels),
    overlap = visibleContributions(frame(body.pixels, [body, duplicate]));
  assert.equal(overlap.ambiguousPixels, 16);
  assert.equal(overlap.fullyOccludedParts, 1);
});

test("exact image hashes include color while ignoring ordering, age, wellbeing and source depth", () => {
  const a = frame(asym),
    b = frame(
      asym
        .map((p) => ({ ...p, z: 99999, color: p.color.toUpperCase() }))
        .reverse(),
    );
  b.age = 75;
  assert.equal(frameHash(a), frameHash(b));
  assert.equal(frameHash(a).length, 64);
  b.pixels[0].color = "#ff0000";
  assert.notEqual(frameHash(a), frameHash(b));
  assert.equal(shapeDistance(describeFrame(a), describeFrame(b)), 0);
});

function only(value: number): FrameDescriptor {
  const d = describe([]);
  d.proportions.fill(0);
  d.proportions[0] = value;
  return d;
}
test("balanced variance decomposes seed, history, interaction and total raw sums of squares", () => {
  const a = only(1),
    b = only(2),
    zero = varianceAttribution([
      [a, a],
      [a, a],
    ]);
  assert.ok(zero.total < 1e-20);
  const seed = varianceAttribution([
    [a, a],
    [b, b],
  ]);
  assert.ok(seed.seed > 0);
  assert.ok(seed.history < 1e-20 && seed.interaction < 1e-20);
  const history = varianceAttribution([
    [a, b],
    [a, b],
  ]);
  assert.ok(history.history > 0);
  assert.ok(history.seed < 1e-20 && history.interaction < 1e-20);
  const interaction = varianceAttribution([
    [a, b],
    [b, a],
  ]);
  assert.ok(interaction.interaction > 0);
  assert.ok(interaction.seed < 1e-20 && interaction.history < 1e-20);
  for (const result of [
    seed,
    history,
    interaction,
    varianceAttribution([
      [only(1), only(3)],
      [only(4), only(8)],
    ]),
  ])
    assert.ok(
      Math.abs(
        result.total - result.seed - result.history - result.interaction,
      ) < 1e-12,
    );
  assert.throws(() => varianceAttribution([[a], [a, b]]));
});

test("real engine frames serialize and compare without mutating the frozen baseline engine", () => {
  const s = createSimulation(createStarterAnatomy(), "audit-metrics"),
    a = s.frameAt(75),
    b = s.frameAt(120);
  const before = frameHash(a),
    d = describeFrame(a),
    e = describeFrame(b);
  assert.ok(Number.isFinite(shapeDistance(d, e)));
  assert.ok(Number.isFinite(semanticDistance(d, e).distance));
  assert.equal(frameHash(a), before);
  assert.deepEqual(s.frameAt(75), a);
});

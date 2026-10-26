import assert from "node:assert/strict";
import test from "node:test";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION } from "../src/needs";
import { drawingPixels, inferAnatomy, paintStroke } from "../src/drawing";
import {
  PART_KINDS,
  createStarterAnatomy,
  getCapabilities,
  type PartKind,
  type PetPart,
} from "../src/simulation";
import {
  decodePet,
  encodePet,
  PROTOTYPE_REVISION,
  type PetDocument,
} from "../src/pet-format";

const ink = "#ffffff";
const dot = (
  id: string,
  kind: PartKind,
  x: number,
  y: number,
  z?: number,
): PetPart => ({
  id,
  kind,
  name: id,
  position: { x: 0, y: 0 },
  parentId: null,
  pixels: [{ x, y, color: ink, ...(z === undefined ? {} : { z }) }],
});
const tap = (
  parts: PetPart[],
  kind: PartKind,
  x: number,
  y: number,
  color = ink,
) => paintStroke(parts, kind, color, [{ x, y }]);
const at = (parts: PetPart[], x: number, y: number) =>
  drawingPixels(parts).find((pixel) => pixel.x === x && pixel.y === y);

test("the selected type labels a stroke without moving previous art or losing hidden anatomy", () => {
  let parts = tap([], "eye", 8, 8, "#ff0000");
  const eyeId = parts[0].id;
  const before = structuredClone(parts);
  assert.equal(paintStroke(parts, "body", "#0000ff", []), parts);
  parts = tap(parts, "body", 8, 8, "#0000ff");
  assert.deepEqual(
    before[0].pixels,
    parts.find((part) => part.id === eyeId)!.pixels,
  );
  assert.equal(parts.length, 2);
  assert.equal(
    at(parts, 8, 8)?.color,
    "#0000ff",
    "new body paint appears above an earlier eye",
  );
  assert.ok(at(parts, 8, 8)!.z! > 9000);
  assert.ok(
    parts.every((part) => part.position.x === 0 && part.position.y === 0),
  );
});

test("eraser removes just the visible pixel once per stroke and reveals the organ underneath", () => {
  const eye = tap([], "eye", 8, 8, "#ff0000");
  const painted = tap(eye, "body", 8, 8, "#0000ff");
  const erased = paintStroke(
    painted,
    "leg",
    ink,
    [
      { x: 8, y: 8 },
      { x: 8, y: 8 },
    ],
    "erase",
  );
  assert.equal(at(erased, 8, 8)?.color, "#ff0000");
  assert.equal(erased.length, 1);
  assert.equal(erased[0].kind, "eye");
  assert.deepEqual(
    paintStroke(erased, "body", ink, [{ x: 8, y: 8 }], "erase"),
    [],
  );
  assert.equal(painted.length, 2, "input anatomy is immutable");
});

test("eraser and canvas agree on equal-depth imported pixels and explicit part layers", () => {
  const parts = [
    dot("z-body", "body", 7, 7, 42),
    dot("a-eye", "eye", 7, 7, 42),
  ];
  parts[0].layer = 900;
  parts[1].layer = 2;
  assert.equal(at(parts, 7, 7)?.color, ink);
  const erased = paintStroke(parts, "tail", ink, [{ x: 7, y: 7 }], "erase");
  assert.equal(erased.length, 1);
  assert.equal(
    erased[0].kind,
    "body",
    "semantic feature wins the same-z tie, even if its part layer differs",
  );
  const repainted = tap(
    [{ ...dot("body", "body", 7, 7), layer: 50000 }],
    "tail",
    7,
    7,
    "#cc33ff",
  );
  assert.equal(at(repainted, 7, 7)?.z, 50001);
});

test("separate hands retain stable identities when another hand is painted", () => {
  const left = tap([], "hand", 3, 12);
  const both = tap(left, "hand", 25, 12);
  assert.equal(both.length, 2);
  assert.equal(
    both.find((part) => part.pixels.some((pixel) => pixel.x === 3))!.id,
    left[0].id,
  );
  assert.notEqual(both[0].id, both[1].id);
  const edited = tap(both, "hand", 25, 12, "#22ee33");
  assert.deepEqual(
    edited.map((part) => part.id),
    both.map((part) => part.id),
  );
  assert.equal(at(edited, 3, 12)?.color, ink);
  assert.equal(at(edited, 25, 12)?.color, "#22ee33");
});

test("logical anatomy inference supports touching and floating limb drawings", () => {
  let parts = paintStroke([], "body", ink, [
    { x: 10, y: 10 },
    { x: 12, y: 10 },
  ]);
  parts = paintStroke(parts, "arm", ink, [
    { x: 8, y: 10 },
    { x: 9, y: 10 },
  ]);
  parts = tap(parts, "hand", 7, 10);
  const body = parts.find((part) => part.kind === "body")!;
  const arm = parts.find((part) => part.kind === "arm")!;
  const hand = parts.find((part) => part.kind === "hand")!;
  assert.equal(arm.parentId, body.id);
  assert.equal(hand.parentId, arm.id);
  assert.equal(getCapabilities(parts).canPlay, true);
  const distant = tap(
    parts.filter((part) => part.kind !== "hand"),
    "hand",
    0,
    0,
  );
  assert.equal(distant.find((part) => part.kind === "hand")!.parentId, arm.id);
  assert.equal(
    getCapabilities(distant).canPlay,
    true,
    "floating hands retain logical arm anatomy",
  );
});

test("splits and merges assign deterministic IDs while preserving the surviving region", () => {
  const line = paintStroke([], "body", ink, [
    { x: 3, y: 5 },
    { x: 7, y: 5 },
  ]);
  const split = paintStroke(line, "eye", ink, [{ x: 5, y: 5 }], "erase");
  assert.equal(split.length, 2);
  assert.equal(split[0].id, line[0].id);
  assert.deepEqual(
    split.map((part) => part.pixels.length),
    [2, 2],
  );
  assert.deepEqual(
    paintStroke([...line].reverse(), "body", ink, [{ x: 5, y: 5 }], "erase"),
    split,
  );
  const merged = tap(split, "body", 5, 5);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, line[0].id);
  assert.equal(merged[0].pixels.length, 5);
  assert.deepEqual(tap([...split].reverse(), "body", 5, 5), merged);
});

test("inference preserves starter identities, source positions and an acyclic semantic graph", () => {
  const starter = createStarterAnatomy();
  const before = drawingPixels(starter).map(({ x, y, color }) => ({
    x,
    y,
    color,
  }));
  const inferred = inferAnatomy(
    starter.map((part, index) => ({
      ...part,
      parentId: starter[(index + 1) % starter.length].id,
    })),
  );
  assert.deepEqual(
    inferred.map((part) => part.id),
    starter.map((part) => part.id),
  );
  assert.deepEqual(
    drawingPixels(inferred).map(({ x, y, color }) => ({ x, y, color })),
    before,
  );
  assert.deepEqual(inferAnatomy(inferred), inferred);
  const byId = new Map(inferred.map((part) => [part.id, part]));
  for (const part of inferred) {
    const visited = new Set([part.id]);
    let parent = part.parentId;
    while (parent) {
      assert.ok(!visited.has(parent));
      assert.ok(byId.has(parent));
      visited.add(parent);
      parent = byId.get(parent)!.parentId;
    }
  }
});

test("out-of-canvas samples stay bounded and pointer gaps form continuous pixel strokes", () => {
  const parts = paintStroke([], "tail", ink, [
    { x: -100000, y: 0 },
    { x: NaN, y: 0 },
    { x: 0, y: 0 },
    { x: 4, y: 4 },
    { x: Infinity, y: 31 },
    { x: 31, y: 31 },
    { x: 32, y: 31 },
  ]);
  assert.equal(parts.length, 2);
  assert.equal(
    parts.reduce((sum, part) => sum + part.pixels.length, 0),
    6,
  );
  for (const pixel of drawingPixels(parts))
    assert.ok(
      Number.isInteger(pixel.x) &&
        Number.isInteger(pixel.y) &&
        pixel.x >= 0 &&
        pixel.y >= 0 &&
        pixel.x < 32 &&
        pixel.y < 32,
    );
});

test("fragmented sparse art is grouped without losing typed pixels or underpaint", () => {
  const points = Array.from({ length: 256 }, (_, i) => ({
    x: (i % 16) * 2,
    y: Math.floor(i / 16) * 2,
  }));
  const samples = points.flatMap((point) => [point, { x: -1, y: -1 }]);
  let parts = paintStroke([], "hair", ink, samples);
  assert.equal(
    parts.reduce((sum, part) => sum + part.pixels.length, 0),
    256,
  );
  assert.ok(parts.length <= 64);
  assert.ok(parts.every((part) => part.kind === "hair"));
  parts = paintStroke(parts, "eye", "#cc0000", samples);
  assert.equal(
    parts.reduce((sum, part) => sum + part.pixels.length, 0),
    512,
  );
  assert.equal(drawingPixels(parts).length, 256);
  const hair = parts
    .filter((part) => part.kind === "hair")
    .flatMap((part) => part.pixels);
  assert.deepEqual(
    hair.map(({ x, y }) => ({ x, y })),
    points,
  );
  const erased = paintStroke(parts, "body", ink, samples, "erase");
  assert.equal(
    erased.reduce((sum, part) => sum + part.pixels.length, 0),
    256,
  );
  assert.ok(erased.every((part) => part.kind === "hair"));
  assert.throws(
    () => tap([dot("body", "body", 1, 1, 1_000_000_000)], "eye", 2, 2),
    /paint history limit/,
  );
});

test("a mirrored tap paints two isolated dots without connecting the space between them", () => {
  const parts = paintStroke([], "hand", ink, [{ x: 4, y: 8 }], "paint", {
    mirror: true,
  });
  assert.equal(parts.length, 2);
  assert.deepEqual(
    drawingPixels(parts).map(({ x, y }) => ({ x, y })),
    [
      { x: 4, y: 8 },
      { x: 27, y: 8 },
    ],
  );
  assert.equal(at(parts, 15, 8), undefined);
  assert.equal(
    at(parts, 4, 8)!.z,
    at(parts, 27, 8)!.z,
    "both reflected branches belong to the same stroke",
  );
});

test("mirrored erasing affects only the two reflected dots and preserves pixels between them", () => {
  const center = tap([], "body", 15, 8, "#33bb66");
  const painted = paintStroke(center, "hand", ink, [{ x: 4, y: 8 }], "paint", {
    mirror: true,
  });
  const erased = paintStroke(
    painted,
    "eye",
    ink,
    [
      { x: 4, y: 8 },
      { x: 4, y: 8 },
    ],
    "erase",
    { mirror: true },
  );
  assert.deepEqual(drawingPixels(erased), drawingPixels(center));
  assert.equal(at(painted, 4, 8)?.color, ink, "input anatomy is unchanged");
});

test("leaving and reentering the canvas does not interpolate across the out-of-bounds sentinel", () => {
  const parts = paintStroke([], "tail", ink, [
    { x: 1, y: 6 },
    { x: 2, y: 6 },
    { x: -1, y: -1 },
    { x: 29, y: 6 },
    { x: 30, y: 6 },
  ]);
  assert.deepEqual(
    drawingPixels(parts).map(({ x, y }) => ({ x, y })),
    [
      { x: 1, y: 6 },
      { x: 2, y: 6 },
      { x: 29, y: 6 },
      { x: 30, y: 6 },
    ],
  );
  assert.equal(at(parts, 15, 6), undefined);
});

test("mirroring reflects each completed path independently and deduplicates overlapping branches", () => {
  const mirrored = paintStroke(
    [],
    "arm",
    ink,
    [
      { x: 4, y: 3 },
      { x: 6, y: 5 },
    ],
    "paint",
    { mirror: true },
  );
  assert.deepEqual(
    drawingPixels(mirrored).map(({ x, y }) => ({ x, y })),
    [
      { x: 4, y: 3 },
      { x: 27, y: 3 },
      { x: 5, y: 4 },
      { x: 26, y: 4 },
      { x: 6, y: 5 },
      { x: 25, y: 5 },
    ],
  );
  const center = paintStroke(
    [],
    "body",
    ink,
    [
      { x: 15, y: 9 },
      { x: 16, y: 9 },
    ],
    "paint",
    { mirror: true },
  );
  assert.equal(drawingPixels(center).length, 2);
});

test("a shared drawing round trip preserves hidden masks, depths, identities and inferred parents", () => {
  let parts = tap([], "body", 10, 10, "#cc3300");
  parts = tap(parts, "arm", 9, 10);
  parts = tap(parts, "hand", 8, 10);
  parts = tap(parts, "eye", 10, 10, "#0000ff");
  const document: PetDocument = {
    version: 8,
    algorithmVersion: 7,
    revision: PROTOTYPE_REVISION,
    mode: "infant",
    name: "DRAWN.EXE",
    seed: "drawing-roundtrip",
    bornAt: 1,
    age: 12,
    parts,
    needTimeline: [],
    catalogVersion: NEEDS_CATALOG_VERSION,
    needsRulesVersion: NEEDS_RULES_VERSION,
  };
  const decoded = decodePet(encodePet(document));
  assert.deepEqual(decoded, document);
  assert.deepEqual(drawingPixels(decoded.parts), drawingPixels(parts));
  assert.equal(
    decoded.parts.filter((part) =>
      part.pixels.some((pixel) => pixel.x === 10 && pixel.y === 10),
    ).length,
    2,
  );
});

test("all fifteen full-canvas masks survive repeated painting and round trip", () => {
  const points = Array.from({ length: 1024 }, (_, i) => ({
    x: i % 32,
    y: Math.floor(i / 32),
  }));
  let parts: PetPart[] = [];
  for (const kind of PART_KINDS)
    parts = paintStroke(parts, kind, "#aBcDeF", points);
  assert.equal(parts.length, 15);
  assert.equal(
    parts.reduce((sum, part) => sum + part.pixels.length, 0),
    15 * 1024,
  );
  assert.deepEqual(
    new Set(parts.map((part) => part.kind)),
    new Set(PART_KINDS),
  );
  assert.ok(parts.every((part) => part.pixels.length === 1024));
  const document: PetDocument = {
    version: 8,
    algorithmVersion: 7,
    revision: PROTOTYPE_REVISION,
    mode: "infant",
    name: "Masks",
    seed: "all",
    parts,
    bornAt: 0,
    age: 0,
    needTimeline: [],
    catalogVersion: NEEDS_CATALOG_VERSION,
    needsRulesVersion: NEEDS_RULES_VERSION,
  };
  assert.deepEqual(decodePet(encodePet(document)), document);
});

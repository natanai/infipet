import test from "node:test";
import assert from "node:assert/strict";
import { clonePreset } from "../src/presets";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { compileGenome } from "../src/simulation/genome";
import {
  compileRegionalLayout,
  regionalLayoutAt,
  type RegionalCareSignals,
} from "../src/simulation/regional-layout";

function fixture() {
  const atlas = structuredClone(
    describeSource(compileSources(clonePreset("bean"), 1)),
  );
  const body = atlas.patches.find((p) => p.kind === "body")!;
  const face = atlas.faceIslands.find((f) => f.hostId === body.id)!;
  assert(face);
  // Isolate planner behavior from the source-atlas extraction algorithm: this
  // fixture supplies a real subset of authored body skin around the actual face.
  const cells = body.source.cells
    .filter((p) => Math.hypot(p.x - face.center.x, p.y - face.center.y) <= 3.5)
    .map(({ x, y }) => ({ x, y }));
  assert(cells.length > 3);
  const center = {
    x: cells.reduce((n, p) => n + p.x, 0) / cells.length,
    y: cells.reduce((n, p) => n + p.y, 0) / cells.length,
  };
  face.material = {
    cells,
    center,
    bounds: {
      x: Math.min(...cells.map((p) => p.x)),
      y: Math.min(...cells.map((p) => p.y)),
      width:
        Math.max(...cells.map((p) => p.x)) -
        Math.min(...cells.map((p) => p.x)) +
        1,
      height:
        Math.max(...cells.map((p) => p.y)) -
        Math.min(...cells.map((p) => p.y)) +
        1,
    },
    outward: { x: 0, y: -1 },
  };
  return { atlas, face, body };
}

test("integrated cranial skin retains exact authored coordinates until the first anatomical operation", () => {
  const { atlas, face } = fixture();
  const sourceBefore = JSON.stringify(atlas);
  const program = compileRegionalLayout(
    atlas,
    compileGenome("life-v7-genome-01"),
  );
  const source = program.source!.cranium!;
  assert(source);
  assert.equal(source.faceId, face.id);
  assert.deepEqual(source.sourceCenter, face.material!.center);
  assert(program.source!.domains.some((d) => d.id === source.hostDomainId));
  for (const age of [0, 0.5, 1, program.stages[0].operationStarts[0]]) {
    const frame = regionalLayoutAt(program, age).cranium!;
    assert.equal(frame.activation, 0);
    assert.deepEqual(frame.center, source.sourceCenter);
    assert.deepEqual(frame.radius, source.sourceRadius);
    assert.deepEqual(frame.sourceAnchor, frame.targetAnchor);
    assert.equal(frame.angle, 0);
  }
  assert.equal(JSON.stringify(atlas), sourceBefore);
});

test("a cranial mass follows a source-derived exterior port with bounded readable size and broad overlap", () => {
  const { atlas } = fixture();
  for (const seed of [1, 2, 3, 4]) {
    const program = compileRegionalLayout(
      atlas,
      compileGenome(`life-v7-genome-0${seed}`),
    );
    for (const age of [30, 75, 120, 3650]) {
      const layout = regionalLayoutAt(program, age);
      const cranium = layout.cranium!;
      const host = layout.domains.find((d) => d.id === cranium.hostDomainId)!;
      assert.equal(cranium.activation, 1);
      assert(Math.abs(cranium.angle) <= Math.PI / 6);
      const sx = cranium.radius.x / cranium.sourceRadius.x;
      const sy = cranium.radius.y / cranium.sourceRadius.y;
      assert(
        Math.abs(sx - sy) < 1e-12,
        "the protected face keeps uniform proportions",
      );
      assert(sx >= 1 && sx <= 1.3);
      const d = Math.hypot(
        cranium.center.x - host.center.x,
        cranium.center.y - host.center.y,
      );
      const direction = {
        x: (cranium.center.x - host.center.x) / d,
        y: (cranium.center.y - host.center.y) / d,
      };
      const radiusOnRay = (angle: number, rx: number, ry: number) => {
        const sourceAxis = program.source!.frame.axis,
          c = Math.cos(angle),
          s = Math.sin(angle);
        const axis = {
          x: sourceAxis.x * c - sourceAxis.y * s,
          y: sourceAxis.x * s + sourceAxis.y * c,
        };
        return (
          1 /
          Math.hypot(
            (direction.x * axis.x + direction.y * axis.y) / rx,
            (-direction.x * axis.y + direction.y * axis.x) / ry,
          )
        );
      };
      const x = Math.min(1, age / 120),
        band = x * x * (3 - 2 * x);
      const bodyRay = radiusOnRay(
        host.angle,
        host.radius.x * (1 + band / host.sourceRadius.x),
        host.radius.y * (1 + band / host.sourceRadius.y),
      );
      const headRay = radiusOnRay(
        cranium.angle,
        cranium.radius.x,
        cranium.radius.y,
      );
      assert(
        d > Math.min(host.radius.x, host.radius.y),
        "cranial skin must not stay buried at the mass center",
      );
      assert(
        d < bodyRay + headRay * 0.8,
        "the body and cranial envelopes must overlap substantially on their connecting ray",
      );
      assert.deepEqual(cranium.targetAnchor, cranium.center);
      assert(
        [
          cranium.center.x,
          cranium.center.y,
          cranium.radius.x,
          cranium.radius.y,
        ].every(Number.isFinite),
      );
    }
  }
});

test("adding a cranial material binding preserves every existing body cage, connection and functional port", () => {
  const { atlas } = fixture();
  const without = structuredClone(atlas);
  without.faceIslands.forEach((face) => delete face.material);
  const genome = compileGenome("life-v7-genome-03");
  const bound = compileRegionalLayout(atlas, genome);
  const unbound = compileRegionalLayout(without, genome);
  const slow: RegionalCareSignals = {
    rest: { load: 0.6, opportunity: 0 },
    security: { load: 0.4, opportunity: 0 },
  };
  const current: RegionalCareSignals = {
    trust: { load: 0.7, opportunity: 0 },
    relaxation: { load: 0.3, opportunity: 0 },
  };
  for (const age of [0, 7, 15, 30, 55, 75, 90, 120, 240]) {
    const a = regionalLayoutAt(bound, age, slow, current);
    const b = regionalLayoutAt(unbound, age, slow, current);
    delete a.cranium;
    assert.deepEqual(a, b);
  }
});

test("head-hosted faces and unsupported floating faces receive no invented cranial material", () => {
  for (const preset of ["canine-cub", "wisp"] as const) {
    const atlas = describeSource(compileSources(clonePreset(preset), 1));
    const program = compileRegionalLayout(
      atlas,
      compileGenome("life-v7-genome-01"),
    );
    assert.equal(program.source?.cranium, undefined);
    assert.equal(regionalLayoutAt(program, 75).cranium, undefined);
  }
});

test("cranial deployment is continuous at operation activation and milestones and is seek-order independent", () => {
  const { atlas } = fixture();
  const program = compileRegionalLayout(
    atlas,
    compileGenome("life-v7-genome-02"),
  );
  const samples = [program.stages[0].operationStarts[0], 30, 75, 120];
  for (const age of samples) {
    const a = regionalLayoutAt(program, age - 1e-6).cranium!;
    const b = regionalLayoutAt(program, age + 1e-6).cranium!;
    assert(Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) < 1e-4);
    assert(Math.hypot(a.radius.x - b.radius.x, a.radius.y - b.radius.y) < 1e-4);
  }
  const ages = [0, 7, 15, 30, 75, 120, 240];
  const forward = ages.map((age) => regionalLayoutAt(program, age).cranium);
  const reverse = [...ages]
    .reverse()
    .map((age) => regionalLayoutAt(program, age).cranium)
    .reverse();
  assert.deepEqual(forward, reverse);
});

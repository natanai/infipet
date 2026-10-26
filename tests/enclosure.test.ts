import test from "node:test";
import assert from "node:assert/strict";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { compileGenome } from "../src/simulation/genome";
import {
  mapSourcePoint,
  type MaterialWarp,
  type Region,
} from "../src/simulation/development";
import type { PetPart, Point } from "../src/simulation/model";
import {
  buildEnclosure,
  getEnclosureEnvelope,
  ENCLOSURE_LAYER,
} from "../src/simulation/enclosure";

function rectangle(
  width = 12,
  height = 8,
  hollow = false,
  kind: PetPart["kind"] = "body",
): PetPart {
  return {
    id: "material-body",
    kind,
    name: "Authored material",
    parentId: null,
    position: { x: 8, y: 9 },
    pixels: Array.from({ length: width * height }, (_, i) => ({
      x: i % width,
      y: Math.floor(i / width),
      color: i % width < width / 2 ? "#113355" : "#ddaa66",
    })).filter(
      (p) =>
        !hollow ||
        p.x === 0 ||
        p.y === 0 ||
        p.x === width - 1 ||
        p.y === height - 1,
    ),
  };
}

function fixture(part = rectangle(), warp?: Partial<MaterialWarp>) {
  const source = compileSources([part], 1)[0];
  const atlas = describeSource([source]);
  const steps: MaterialWarp[] = warp
    ? [
        {
          origin: { ...source.center },
          target: { ...source.center },
          scale: { x: 1, y: 1 },
          angle: 0,
          span: { x: source.bounds.width / 2, y: source.bounds.height / 2 },
          bend: 0,
          waist: 0,
          wave: 0,
          phase: 0,
          ...warp,
        },
      ]
    : [];
  const region: Region = {
    id: source.id,
    kind: source.kind,
    role: "trunk",
    parentId: null,
    sourceIds: [source.id],
    center: { ...source.center },
    anchor: { ...source.pivot },
    tip: { ...source.tip },
    rx: source.bounds.width / 2,
    ry: source.bounds.height / 2,
    angle: 0,
    readiness: 1,
    material: 0,
    shape: "mask",
    color: source.cells[0].color,
    layer: 100,
    source,
    sourceWarp: { steps },
  };
  region.center = mapSourcePoint(region, source.center);
  region.anchor = mapSourcePoint(region, source.pivot);
  region.tip = mapSourcePoint(region, source.tip);
  return { source, atlas, region };
}

function genome(kind: "direct" | "sheltered" | "metamorphic" = "sheltered") {
  const g = compileGenome("enclosure-test-genome");
  return { ...g, lifeProgram: { ...g.lifeProgram, kind } };
}

function ellipseDistance(region: Region, p: Point) {
  const dx = p.x - region.center.x,
    dy = p.y - region.center.y;
  const c = Math.cos(region.angle),
    s = Math.sin(region.angle);
  return Math.hypot(
    (dx * c + dy * s) / region.rx,
    (-dx * s + dy * c) / region.ry,
  );
}

test("only sheltered source-compatible lineages develop an enclosure in the declared phase", () => {
  const f = fixture();
  for (const kind of ["direct", "metamorphic"] as const)
    for (const age of [0, 12, 15, 30, 36, 50, 75, 120])
      assert.deepEqual(
        buildEnclosure([f.region], f.atlas, genome(kind), age),
        [],
      );
  for (const age of [0, 12, 70, 75, 120, 240, 1e6, Infinity, NaN])
    assert.deepEqual(buildEnclosure([f.region], f.atlas, genome(), age), []);
  for (const age of [13, 20, 30, 36, 50, 69])
    assert.equal(buildEnclosure([f.region], f.atlas, genome(), age).length, 2);
  assert.deepEqual(buildEnclosure([], f.atlas, genome(), 30), []);
  const optional = fixture(rectangle(3, 3, false, "eye"));
  assert.equal(getEnclosureEnvelope([optional.region], optional.atlas), null);
  assert.deepEqual(
    buildEnclosure([optional.region], optional.atlas, genome(), 30),
    [],
  );
});

test("growth starts with vanishing area at an occupied root and stays attached while wrapping hollow artwork", () => {
  const f = fixture(rectangle(12, 10, true));
  const envelope = getEnclosureEnvelope([f.region], f.atlas)!;
  assert(envelope);
  assert(
    envelope.occupied.some(
      (p) => p.x === envelope.root.x && p.y === envelope.root.y,
    ),
  );
  assert(
    !envelope.occupied.some(
      (p) => p.x === envelope.center.x && p.y === envelope.center.y,
    ),
  );
  const early = buildEnclosure([f.region], f.atlas, genome(), 12.0001);
  const next = buildEnclosure([f.region], f.atlas, genome(), 12.01);
  assert.equal(early.length, 2);
  assert(early[0].rx * early[0].ry < 1e-6);
  assert(early[0].rx * early[0].ry < next[0].rx * next[0].ry);
  for (const age of [12.0001, 13, 15, 20, 25, 30, 36]) {
    const panels = buildEnclosure([f.region], f.atlas, genome(), age);
    assert(
      panels.some((panel) => ellipseDistance(panel, envelope.root) <= 1 + 1e-8),
      `root detached at ${age}`,
    );
  }
});

test("the complete envelope contains irregular current material rather than just birth bounds", () => {
  const f = fixture(rectangle(15, 6), {
    target: { x: 43, y: 23 },
    scale: { x: 1.4, y: 0.7 },
    angle: 0.58,
    bend: 0.45,
    waist: 0.2,
    wave: 0.12,
    phase: 0.6,
  });
  const envelope = getEnclosureEnvelope([f.region], f.atlas)!;
  assert(envelope.center.x > 39);
  assert(envelope.center.y < 28);
  const original = fixture(rectangle(15, 6));
  const originalEnvelope = getEnclosureEnvelope(
    [original.region],
    original.atlas,
  )!;
  assert(
    Math.hypot(
      envelope.axis.x - originalEnvelope.axis.x,
      envelope.axis.y - originalEnvelope.axis.y,
    ) > 0.3,
  );
  assert(envelope.axialHalf > originalEnvelope.axialHalf * 1.2);
  const panels = buildEnclosure([f.region], f.atlas, genome(), 30);
  for (const cell of envelope.occupied)
    assert(
      panels.some((panel) => ellipseDistance(panel, cell) <= 1 + 1e-8),
      `uncovered ${JSON.stringify(cell)}`,
    );
});

test("material clipping limits the envelope and current intrinsic axes distinguish body plans", () => {
  const horizontal = fixture(rectangle(18, 4));
  const vertical = fixture(rectangle(4, 18));
  const h = getEnclosureEnvelope([horizontal.region], horizontal.atlas)!;
  const v = getEnclosureEnvelope([vertical.region], vertical.atlas)!;
  assert(Math.abs(h.axis.x) > 0.99);
  assert(Math.abs(v.axis.y) > 0.99);
  const cut: Region = {
    ...horizontal.region,
    sourceClip: { axis: "x", min: 24, max: 29 },
  };
  const clipped = getEnclosureEnvelope([cut], horizontal.atlas)!;
  assert.equal(clipped.occupied.length, 5 * 4);
  assert(clipped.axialHalf < h.axialHalf / 2);
});

test("opening panels separate and resorb; identity, local pigments and provenance remain stable", () => {
  const f = fixture();
  const wrapped = buildEnclosure([f.region], f.atlas, genome(), 30);
  const opening = buildEnclosure([f.region], f.atlas, genome(), 50);
  const distance = (panels: Region[]) =>
    Math.hypot(
      panels[0].center.x - panels[1].center.x,
      panels[0].center.y - panels[1].center.y,
    );
  assert(distance(opening) > distance(wrapped) * 2);
  assert(opening[0].rx * opening[0].ry < wrapped[0].rx * wrapped[0].ry);
  assert.deepEqual(
    opening.map((p) => p.id),
    wrapped.map((p) => p.id),
  );
  for (const panel of [...wrapped, ...opening]) {
    assert.equal(panel.kind, "body");
    assert.equal(panel.role, "enclosure");
    assert.equal(panel.layer, ENCLOSURE_LAYER);
    assert.equal(panel.parentId, f.region.id);
    assert.deepEqual(panel.sourceIds, [f.region.id]);
    assert(panel.lineage?.includes(f.region.id));
    assert(["#113355", "#ddaa66"].includes(panel.color));
    assert.equal(panel.source, undefined);
    assert.equal(panel.operationId, "lifecycle/enclosure");
  }
});

test("seeking and re-evaluation are deterministic and never mutate source or current material", () => {
  const f = fixture(rectangle(11, 7, true));
  const before = JSON.stringify(f);
  const ages = [12.001, 17, 30, 35, 49, 69, 75];
  const expected = ages.map((age) =>
    buildEnclosure([f.region], f.atlas, genome(), age),
  );
  for (const age of [75, 35, 12.001, 69, 17, 49, 30]) {
    const i = ages.indexOf(age);
    assert.deepEqual(
      buildEnclosure([f.region], f.atlas, genome(), age),
      expected[i],
    );
  }
  assert.equal(JSON.stringify(f), before);
});

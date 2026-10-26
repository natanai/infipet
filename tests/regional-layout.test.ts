import test from "node:test";
import assert from "node:assert/strict";
import { STARTER_PRESETS, clonePreset } from "../src/presets";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import { compileGenome } from "../src/simulation/genome";
import type { PetPart } from "../src/simulation/model";
import {
  compileRegionalLayout,
  regionalLayoutAt,
  sourceDomainAt,
  sourceUAt,
  mapRegionalPoint,
} from "../src/simulation/regional-layout";

function compile(parts = clonePreset("canine-cub"), seed = "regional-01") {
  const source = compileSources(parts, 1),
    atlas = describeSource(source);
  return {
    source,
    atlas,
    program: compileRegionalLayout(atlas, compileGenome(seed)),
  };
}
function shares(layout: ReturnType<typeof regionalLayoutAt>) {
  const sum = layout.domains.reduce((n, d) => n + d.massShare, 0);
  return layout.domains.map((d) => d.massShare / sum);
}

test("regional source cages preserve every original point through day one and partition material exactly once", () => {
  const f = compile();
  const body = f.source.find((s) => s.id === f.program.source!.id)!;
  for (const age of [0, 0.5, 1]) {
    const layout = regionalLayoutAt(f.program, age);
    assert.equal(layout.expression, 0);
    for (const domain of layout.domains) {
      assert.deepEqual(domain.center, domain.sourceCenter);
      assert.deepEqual(domain.radius, domain.sourceRadius);
      assert.equal(domain.angle, 0);
      assert.equal(domain.roundness, 0);
    }
    for (const p of body.cells) {
      const owner = sourceDomainAt(f.program, p)!;
      const u = sourceUAt(f.program, p);
      assert(u >= owner.uMin && (u < owner.uMax || owner.uMax === 1));
      const q = mapRegionalPoint(f.program, layout, p);
      assert(Math.hypot(q.x - p.x, q.y - p.y) < 1e-10);
    }
    assert(layout.connections.every((c) => c.expression === 0));
  }
  assert.equal(
    f.program.source!.domains.reduce((n, d) => n + d.sourceArea, 0),
    body.cells.length,
  );
});

test("twelve raw genomes reorganize at least two relative regional allocations between each milestone", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { program } = compile(undefined, `regional-raw-${seed}`);
    const layouts = [0, 30, 75, 120].map((age) =>
      regionalLayoutAt(program, age),
    );
    for (let i = 1; i < layouts.length; i++) {
      const a = shares(layouts[i - 1]),
        b = shares(layouts[i]);
      const changed = a.filter(
        (value, j) => Math.abs(b[j] / value - 1) >= 0.2,
      ).length;
      assert(
        changed >= 2,
        `seed ${seed}, ${[0, 30, 75][i - 1]}→${[30, 75, 120][i - 1]} changed ${changed}`,
      );
      if (i > 1)
        assert.notEqual(
          layouts[i - 1].axisConfiguration,
          layouts[i].axisConfiguration,
        );
    }
  }
});

test("joined regional masses use broad waists and retain explicit authored void preservation", () => {
  const { program } = compile();
  for (const age of [1.01, 7, 15, 30, 45, 75, 90, 120, 240]) {
    const layout = regionalLayoutAt(program, age);
    assert.equal(layout.connections.length, layout.domains.length - 1);
    for (const link of layout.connections) {
      const a = layout.domains.find((d) => d.id === link.fromDomainId)!;
      const b = layout.domains.find((d) => d.id === link.toDomainId)!;
      assert.deepEqual(link.from, a.center);
      assert.deepEqual(link.to, b.center);
      assert(
        link.radius >=
          Math.min(a.radius.x, a.radius.y, b.radius.x, b.radius.y) * 0.75,
      );
    }
    assert.equal(layout.negativeSpace.preserveAuthored, true);
    if (age >= 30)
      assert(
        layout.domains.every(
          (d) => d.roundness! >= 0.45 && d.roundness! <= 0.65,
        ),
      );
    assert(
      layout.domains.every(
        (d) => Number.isFinite(d.angle) && d.radius.x > 0 && d.radius.y > 0,
      ),
    );
  }
});

test("head and support ports retain source ownership and shift functional responsibility continuously", () => {
  const { program } = compile(undefined, "regional-raw-1");
  const source = program.source!;
  const atBirth = regionalLayoutAt(program, 0);
  const heads = Object.values(atBirth.ports).filter((p) => p.kind === "head");
  assert(heads.length > 0);
  for (const head of heads) {
    assert.deepEqual(head.targetPoint, head.sourcePoint);
    assert(head.minimumRadius! >= source.size * 0.48);
    assert(head.maximumNeckLength! <= head.minimumRadius! * 1.1);
  }
  const stand = program.stages.find(
    (s) => s.functionalStrategy === "rear-support",
  );
  assert(stand, "fixed seed must exercise an inherited upright strategy");
  const upright = regionalLayoutAt(program, stand.age);
  const front = Object.values(upright.ports).filter(
    (p) => p.kind === "support" && p.role === "fore",
  );
  const hind = Object.values(upright.ports).filter(
    (p) => p.kind === "support" && p.role === "hind",
  );
  assert(front.length && hind.length);
  assert(
    front.every(
      (p) => p.supportWeight <= 0.051 && p.manipulationWeight >= 0.949,
    ),
  );
  assert(hind.every((p) => p.supportWeight === 1));
  assert(
    Object.values(upright.ports).every((p) =>
      upright.domains.some((d) => d.id === p.domainId),
    ),
  );
});

test("limbless, long and hollow sources constrain grammar while head-only and single pixels stay conservative", () => {
  const ribbon = compile(clonePreset("ribbon"));
  assert.equal(ribbon.program.eligibility.limbless, true);
  for (const age of [30, 75, 120]) {
    const layout = regionalLayoutAt(ribbon.program, age);
    assert(!Object.values(layout.ports).some((p) => p.kind === "support"));
    assert(["coil", "drift"].includes(layout.functionalStrategy));
  }
  const pixel: PetPart = {
    id: "dot",
    name: "dot",
    kind: "body",
    parentId: null,
    position: { x: 15, y: 15 },
    pixels: [{ x: 0, y: 0, color: "#ffffff" }],
  };
  const one = compile([pixel]);
  const birth = regionalLayoutAt(one.program, 0);
  for (const age of [30, 75, 120]) {
    const layout = regionalLayoutAt(one.program, age);
    assert.equal(layout.domains.length, 1);
    assert.deepEqual(layout.domains[0].center, birth.domains[0].center);
    assert.equal(layout.connections.length, 0);
    assert.equal(Object.keys(layout.ports).length, 0);
  }
  const mature = regionalLayoutAt(one.program, 75).domains[0];
  assert(mature.radius.x + mature.radius.y > 3);
  assert.equal(compile([{ ...pixel, kind: "head" }]).program.source, null);
  const long: PetPart = {
    ...pixel,
    pixels: Array.from({ length: 24 }, (_, x) => ({
      x,
      y: 0,
      color: "#ffffff",
    })),
    position: { x: 2, y: 15 },
  };
  const elongated = compile([long]);
  const square = compile([
    {
      ...pixel,
      pixels: Array.from({ length: 25 }, (_, i) => ({
        x: i % 5,
        y: Math.floor(i / 5),
        color: "#ffffff",
      })),
    },
  ]);
  const a = regionalLayoutAt(elongated.program, 30).domains[0];
  const b = regionalLayoutAt(square.program, 30).domains[0];
  assert(Math.abs(a.radius.x / a.radius.y - b.radius.x / b.radius.y) > 0.5);
});

test("genes ignore source and care; stage geometry is continuous, replayable and immutable", () => {
  const f = compile();
  const other = compile(clonePreset("bean"));
  assert.deepEqual(f.program.genes, other.program.genes);
  const before = JSON.stringify(f.program);
  const expected = [7, 30, 75, 120].map((age) =>
    regionalLayoutAt(f.program, age),
  );
  for (const age of [120, 7, 75, 30])
    assert.deepEqual(
      regionalLayoutAt(f.program, age),
      expected[[7, 30, 75, 120].indexOf(age)],
    );
  for (const boundary of [1, 30, 75, 120]) {
    const a = regionalLayoutAt(f.program, boundary - 1e-5),
      b = regionalLayoutAt(f.program, boundary + 1e-5);
    for (let i = 0; i < a.domains.length; i++) {
      assert(
        Math.hypot(
          a.domains[i].center.x - b.domains[i].center.x,
          a.domains[i].center.y - b.domains[i].center.y,
        ) < 1e-4,
      );
      assert(
        Math.hypot(
          a.domains[i].radius.x - b.domains[i].radius.x,
          a.domains[i].radius.y - b.domains[i].radius.y,
        ) < 1e-4,
      );
    }
    const body = f.source.find((s) => s.id === f.program.source!.id)!;
    for (const cell of body.cells) {
      const p = mapRegionalPoint(f.program, a, cell),
        q = mapRegionalPoint(f.program, b, cell);
      assert(
        Math.hypot(p.x - q.x, p.y - q.y) < 1e-4,
        `material discontinuity at day ${boundary}`,
      );
    }
  }
  const stressed = regionalLayoutAt(f.program, 75, {
    safety: { load: 1, opportunity: 0 },
  });
  assert.notDeepEqual(
    stressed.domains,
    regionalLayoutAt(f.program, 75).domains,
  );
  assert.equal(
    stressed.axisConfiguration,
    regionalLayoutAt(f.program, 75).axisConfiguration,
  );
  assert.equal(JSON.stringify(f.program), before);
});

test("each of the six need signals independently changes current cages without selecting a new genotype", () => {
  const { program } = compile();
  const neutral = regionalLayoutAt(program, 90);
  const shapes = new Set<string>();
  for (const id of [
    "safety",
    "security",
    "trust",
    "rest",
    "relaxation",
    "physical-fitness",
  ] as const) {
    const layout = regionalLayoutAt(program, 90, {
      [id]: { load: 1, opportunity: 0 },
    });
    assert.notDeepEqual(
      layout.domains,
      neutral.domains,
      `${id} has no current structural response`,
    );
    assert.equal(layout.axisConfiguration, neutral.axisConfiguration);
    shapes.add(JSON.stringify(layout.domains));
  }
  assert.equal(
    shapes.size,
    6,
    "independent signals must not collapse to one averaged fulfillment response",
  );
});

test("axis, mass, contour and support handoffs wait for their declared hourly activation windows", () => {
  const { program } = compile(undefined, "regional-raw-1");
  const genome = compileGenome("regional-raw-1");
  for (let stage = 0; stage < 3; stage++) {
    const plan = program.stages[stage],
      start = [0, 30, 75][stage];
    assert.deepEqual(plan.windows, genome.stages[stage].windows);
    assert.deepEqual(
      plan.operationStarts,
      plan.windows.map(
        (window) => Math.round((start + (plan.age - start) * window) * 24) / 24,
      ),
    );
    const baseline = regionalLayoutAt(program, start);
    const first = regionalLayoutAt(program, plan.operationStarts[0]);
    assert.deepEqual(
      first.domains,
      baseline.domains,
      `stage ${stage}: geometry moved before activation`,
    );
    const betweenAxisAndMass = regionalLayoutAt(
      program,
      (plan.operationStarts[0] + plan.operationStarts[1]) / 2,
    );
    assert(betweenAxisAndMass.axisProgress > 0);
    assert.equal(betweenAxisAndMass.massProgress, 0);
    assert.equal(betweenAxisAndMass.contourProgress, 0);
    assert.notDeepEqual(
      betweenAxisAndMass.domains.map((d) => [d.center, d.angle]),
      baseline.domains.map((d) => [d.center, d.angle]),
    );
    assert.deepEqual(
      betweenAxisAndMass.domains.map((d) => d.radius),
      baseline.domains.map((d) => d.radius),
    );
    assert.deepEqual(
      betweenAxisAndMass.domains.map((d) => d.roundness),
      baseline.domains.map((d) => d.roundness),
    );
    assert.deepEqual(
      Object.values(betweenAxisAndMass.ports).map((p) => p.supportWeight),
      Object.values(baseline.ports).map((p) => p.supportWeight),
    );
    const betweenMassAndContour = regionalLayoutAt(
      program,
      (plan.operationStarts[1] + plan.operationStarts[2]) / 2,
    );
    assert(betweenMassAndContour.massProgress > 0);
    assert.equal(betweenMassAndContour.contourProgress, 0);
    assert.notDeepEqual(
      betweenMassAndContour.domains.map((d) => d.radius),
      baseline.domains.map((d) => d.radius),
    );
    assert.deepEqual(
      betweenMassAndContour.domains.map((d) => d.roundness),
      baseline.domains.map((d) => d.roundness),
    );
    const contour = regionalLayoutAt(
      program,
      (plan.operationStarts[2] + plan.age) / 2,
    );
    assert(contour.contourProgress > 0);
    assert.notDeepEqual(
      contour.domains.map((d) => d.roundness),
      baseline.domains.map((d) => d.roundness),
    );
  }
});

test("changing activation windows retains milestone cages, ports and connector geometry", () => {
  const { program } = compile(undefined, "regional-raw-1");
  const shifted = {
    ...program,
    stages: program.stages.map((stage, i) => {
      const start = [0, 30, 75][i],
        windows: [number, number, number] = [0.18, 0.38, 0.62];
      return {
        ...stage,
        windows,
        operationStarts: windows.map(
          (window) =>
            Math.round((start + (stage.age - start) * window) * 24) / 24,
        ) as [number, number, number],
      };
    }),
  };
  const geometry = (x: ReturnType<typeof regionalLayoutAt>) => ({
    domains: x.domains,
    ports: x.ports,
    connections: x.connections,
    axisConfiguration: x.axisConfiguration,
    functionalStrategy: x.functionalStrategy,
  });
  for (const age of [0, 30, 75, 120])
    assert.deepEqual(
      geometry(regionalLayoutAt(program, age)),
      geometry(regionalLayoutAt(shifted, age)),
    );
});

test("substantial regional cages protrude beyond neighbors and folded masses form a visible arch", () => {
  const seeds = [
    ...Array.from({ length: 12 }, (_, i) => `regional-raw-${i + 1}`),
    ...[1, 2, 3, 4].map((i) => `life-v7-genome0${i}`),
  ];
  for (const seed of seeds) {
    const { program } = compile(undefined, seed),
      axis = program.source!.frame.axis;
    for (const age of [30, 75, 120]) {
      const layout = regionalLayoutAt(program, age);
      const projection = (
        mass: (typeof layout.domains)[number],
        direction: { x: number; y: number },
      ) => {
        const angle = Math.atan2(axis.y, axis.x) + mass.angle,
          c = Math.cos(angle),
          s = Math.sin(angle);
        return Math.hypot(
          (direction.x * c + direction.y * s) * mass.radius.x,
          (-direction.x * s + direction.y * c) * mass.radius.y,
        );
      };
      for (let i = 0; i < layout.domains.length; i++)
        for (let j = i + 1; j < layout.domains.length; j++) {
          const a = layout.domains[i],
            b = layout.domains[j];
          const distance = Math.hypot(
            b.center.x - a.center.x,
            b.center.y - a.center.y,
          );
          const direction = {
            x: (b.center.x - a.center.x) / distance,
            y: (b.center.y - a.center.y) / distance,
          };
          const ra = projection(a, direction),
            rb = projection(b, direction);
          assert(
            distance >=
              (layout.axisConfiguration === "axial" ? 0.9 : 0.8) * (ra + rb),
            `${seed} day ${age}: cages swallow neighboring mass`,
          );
          assert(
            distance + Math.min(ra, rb) - Math.max(ra, rb) >=
              0.85 * Math.min(ra, rb),
            `${seed} day ${age}: smaller region has no visible protrusion`,
          );
        }
      if (layout.axisConfiguration === "folded") {
        const [a, middle, b] = layout.domains,
          normal = program.source!.frame.normal;
        const rise =
          ((a.center.x + b.center.x) / 2 - middle.center.x) * normal.x +
          ((a.center.y + b.center.y) / 2 - middle.center.y) * normal.y;
        assert(
          rise >= projection(middle, normal) * 0.55,
          `${seed} day ${age}: folded arrangement is merely a straight lump`,
        );
      }
    }
  }
});

test("decisive mature layouts and their neutral material bands stay bounded and plateau", () => {
  const dense: PetPart = {
    id: "body",
    kind: "body",
    name: "dense",
    parentId: null,
    position: { x: 0, y: 0 },
    pixels: Array.from({ length: 1024 }, (_, i) => ({
      x: i % 32,
      y: Math.floor(i / 32),
      color: "#ffffff",
    })),
  };
  const fixtures = [
    ...STARTER_PRESETS.map((preset) => ({
      id: preset.id,
      parts: clonePreset(preset.id),
    })),
    { id: "dense", parts: [dense] },
  ];
  for (const fixture of fixtures)
    for (let seed = 1; seed <= 16; seed++) {
      const { program } = compile(
        fixture.parts,
        `life-v7-genome${String(seed).padStart(2, "0")}`,
      );
      for (const age of [30, 75, 120]) {
        const layout = regionalLayoutAt(program, age),
          frame = program.source!.frame;
        const t = Math.min(1, age / 120),
          band = 1.3 * t * t * (3 - 2 * t);
        const extents = layout.domains.map((d) => {
          const angle = Math.atan2(frame.axis.y, frame.axis.x) + d.angle,
            c = Math.cos(angle),
            s = Math.sin(angle);
          const x = d.radius.x * (1 + band / d.sourceRadius.x),
            y = d.radius.y * (1 + band / d.sourceRadius.y);
          return {
            left: d.center.x - Math.hypot(c * x, s * y),
            right: d.center.x + Math.hypot(c * x, s * y),
            top: d.center.y - Math.hypot(s * x, c * y),
            bottom: d.center.y + Math.hypot(s * x, c * y),
          };
        });
        const width =
          Math.max(...extents.map((e) => e.right)) -
          Math.min(...extents.map((e) => e.left));
        const height =
          Math.max(...extents.map((e) => e.bottom)) -
          Math.min(...extents.map((e) => e.top));
        assert(
          Math.max(width, height) <= 48,
          `${fixture.id} seed ${seed} age ${age}: body exceeds 48px`,
        );
      }
      assert.deepEqual(
        regionalLayoutAt(program, 120).domains,
        regionalLayoutAt(program, 1e6).domains,
      );
    }
});

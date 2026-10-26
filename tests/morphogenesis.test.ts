import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation, type PetPart } from "../src/simulation";
import {
  compileGenome,
  PROCEDURAL_GRAMMAR_VERSION,
} from "../src/simulation/genome";
import { getMetamorphosisPhase } from "../src/simulation/metamorphosis";
import { compileMorphogenesis } from "../src/simulation/morphogenesis";
import { compileSources } from "../src/simulation/material";
import { describeSource } from "../src/simulation/source-atlas";
import {
  compileRegionalLayout,
  regionalLayoutAt,
} from "../src/simulation/regional-layout";

function root(): PetPart[] {
  const body: PetPart = {
    id: "ink",
    name: "Ink",
    kind: "body",
    position: { x: 0, y: 0 },
    parentId: null,
    layer: 0,
    pixels: Array.from({ length: 20 * 16 }, (_, i) => ({
      x: (i % 20) + 6,
      y: Math.floor(i / 20) + 8,
      color: "#FFFFFF",
    })).filter((p) => ((p.x - 15.5) / 10) ** 2 + ((p.y - 15.5) / 8) ** 2 <= 1),
  };
  const mark = (
    id: string,
    kind: "eye" | "mouth",
    x: number,
    y: number,
    length: number,
  ): PetPart => ({
    id,
    name: id,
    kind,
    position: { x: 0, y: 0 },
    parentId: "ink",
    layer: 3,
    pixels: Array.from({ length }, (_, i) => ({
      x: x + (kind === "mouth" ? i : 0),
      y: y + (kind === "eye" ? i : 0),
      color: "#000000",
    })),
  });
  return [
    body,
    mark("eye-a", "eye", 12, 13, 2),
    mark("eye-b", "eye", 20, 13, 2),
    mark("mouth", "mouth", 15, 19, 3),
  ];
}

test("developmental grammar is inherited and explicitly versioned without depending on care or source names", () => {
  const source = root();
  const first = createSimulation(source, "grammar-purity");
  const changed = createSimulation(
    source.map((p) => ({ ...p, name: "renamed" })),
    "grammar-purity",
    "infant",
    {
      needTimeline: [{ needId: "rest", tick: 0, fulfillment: 0 }],
    },
  );
  assert.equal(
    first.genome.proceduralGrammarVersion,
    PROCEDURAL_GRAMMAR_VERSION,
  );
  assert.equal(
    first.program.proceduralGrammarVersion,
    PROCEDURAL_GRAMMAR_VERSION,
  );
  assert.deepEqual(first.genome, changed.genome);
  assert.deepEqual(
    compileMorphogenesis(compileGenome("grammar-purity")),
    compileMorphogenesis(compileGenome("grammar-purity")),
  );
});

test("independent seed channels include both conservative and dramatic body envelopes", () => {
  const genomes = Array.from({ length: 128 }, (_, i) =>
    compileGenome(`grammar-cohort-${i}`),
  );
  const conservative = genomes.filter(
    (g) => compileMorphogenesis(g).sourceRetention > 0.8,
  );
  assert.ok(conservative.length >= 8 && conservative.length <= 48);
  assert.ok(genomes.some((g) => compileMorphogenesis(g).sourceRetention === 0));
  const genome = conservative[0];
  const atlas = describeSource(compileSources(root(), 1));
  const program = compileRegionalLayout(atlas, genome);
  const kept = regionalLayoutAt(program, 120);
  const expressive = regionalLayoutAt({ ...program, sourceRetention: 0 }, 120);
  const displacement = (layout: typeof kept) =>
    layout.domains.reduce(
      (sum, d) =>
        sum +
        Math.hypot(
          d.center.x - d.sourceCenter.x,
          d.center.y - d.sourceCenter.y,
        ),
      0,
    );
  assert.ok(displacement(kept) < displacement(expressive) * 0.2);
});

test("conservative body retention does not weaken a declared complete sheltered enclosure", () => {
  let checked = 0;
  for (let i = 0; i < 64; i++) {
    const genome = compileGenome(`grammar-envelope-${i}`);
    if (compileMorphogenesis(genome).sourceRetention === 0) continue;
    const sheltered = {
      ...genome,
      lifeProgram: { ...genome.lifeProgram, kind: "sheltered" as const },
    };
    assert.equal(getMetamorphosisPhase(sheltered, 30).enclosure, 1);
    assert.equal(getMetamorphosisPhase(sheltered, 36).enclosure, 1);
    checked++;
  }
  assert.ok(checked > 0);
});

test("a body-and-face drawing can develop supported limbs, manipulators and terminal anatomy", () => {
  const source = root();
  const covered = new Set<string>();
  let checked = 0;
  for (let i = 0; i < 64 && covered.size < 7; i++) {
    const sim = createSimulation(source, `grammar-buds-${i}`);
    const frame = sim.frameAt(120, { time: 0, action: "idle" });
    for (const part of frame.parts.filter((p) => p.id.startsWith("bud/"))) {
      checked++;
      covered.add(part.kind);
      assert.ok(
        part.sourcePartIds?.includes("ink") || part.sourcePartId === "ink",
        "buds retain actual source-material ancestry",
      );
      assert.ok(
        part.pixels.every((p) => p.x >= 0 && p.y >= 0 && p.x < 64 && p.y < 64),
      );
      assert.ok(part.parentId);
    }
  }
  assert.ok(checked > 0);
  for (const kind of ["leg", "foot", "arm", "hand", "tail", "horn", "ear"])
    assert.ok(covered.has(kind), `missing general anatomical family ${kind}`);
});

test("buds and facial envelopes preserve birth, causal face ink and arbitrary seeking", () => {
  const source = root();
  let resizedEyes = 0;
  for (let i = 0; i < 18; i++) {
    const sim = createSimulation(source, `grammar-face-${i}`);
    const born = sim.frameAt(0, { time: 0 });
    const future = sim.frameAt(120, { time: 0.5 });
    const finalPixels = new Map(
      future.pixels.map((p) => [`${p.x},${p.y}`, p.color.toUpperCase()]),
    );
    const facial = future.parts.filter(
      (p) => p.kind === "eye" || p.kind === "mouth",
    );
    assert.equal(facial.length, 3);
    for (const part of facial) {
      assert.ok(part.pixels.length > 0);
      if (part.surfaceExpression) {
        assert.deepEqual(part.surfaceExpression.originalColors, ["#000000"]);
        assert.equal(part.surfaceExpression.operation, "facial-contrast");
        assert.ok((part.surfaceExpression.contrastAfter ?? 0) >= 0.5 - 1e-12);
      } else assert.ok(part.pixels.every((p) => p.color === "#000000"));
      assert.ok(
        part.pixels.every(
          (p) => finalPixels.get(`${p.x},${p.y}`) === p.color.toUpperCase(),
        ),
        "a generated bud cannot paint over the protected face",
      );
    }
    if (
      future.parts
        .filter((p) => p.kind === "eye")
        .reduce((n, p) => n + p.pixels.length, 0) !==
      born.parts
        .filter((p) => p.kind === "eye")
        .reduce((n, p) => n + p.pixels.length, 0)
    )
      resizedEyes++;
    sim.frameAt(49, { time: 2 });
    assert.deepEqual(sim.frameAt(120, { time: 0.5 }).pixels, future.pixels);
    assert.deepEqual(sim.frameAt(0, { time: 0 }).pixels, born.pixels);
    assert.ok(!born.parts.some((p) => p.id.startsWith("bud/")));
  }
  assert.ok(
    resizedEyes > 0,
    "seeded source-ink carriers must allow genuine eye-size variation",
  );
});

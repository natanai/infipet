import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation, type PetFrame } from "../src/simulation";
import {
  counterfactualSources,
  primarySources,
} from "../tools/source-audit/fixtures";

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
function physicalCarrierCore(frame: PetFrame) {
  // Pigment can darken an interior without removing its physical source-derived material.
  // Only this body's/head's occupied carriers and physical neck count; a parent label is insufficient.
  const material = new Map(
    frame.parts
      .filter(
        (part) =>
          part.kind === "body" || part.kind === "head" || part.role === "neck",
      )
      .filter((part) => part.sourcePartId || part.sourcePartIds?.length)
      .flatMap((part) => part.pixels)
      .map((p) => [key(p), p]),
  );
  const body = frame.parts.find((p) => p.id === "body")!;
  const start = body.pixels.find((p) => material.has(key(p)));
  assert.ok(start, "physical body has occupied source-derived material");
  const reached = new Set([key(start)]),
    queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) {
        const next = material.get(`${p.x + x},${p.y + y}`);
        if (next && !reached.has(key(next))) {
          reached.add(key(next));
          queue.push(next);
        }
      }
  }
  return { material, reached };
}

test("physical neck joins source-derived head material while final facial pigment remains visible", () => {
  const base = primarySources("proof")[0],
    bent = counterfactualSources(base).find((s) => s.id.endsWith("body-bend"))!;
  const sim = createSimulation(bent.parts, "life-v7-genome-02");
  // At day 120 the former closest source cell (44,32) has nose above it and
  // mouth to its left. A PartFrame union incorrectly hid the composited gap.
  for (const age of [0, 30, 75, 120]) {
    for (const time of age === 120
      ? [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]
      : [0]) {
      const frame = sim.frameAt(age, { time, action: "idle" }),
        { material, reached } = physicalCarrierCore(frame),
        head = frame.parts.find((p) => p.id === "head")!,
        physicalHead = head.pixels.filter((p) => material.has(key(p)));
      assert.ok(physicalHead.length > 10);
      assert.ok(
        physicalHead.filter((p) => reached.has(key(p))).length /
          physicalHead.length >
          0.9,
        `day ${age}, time ${time}: occupied head material must physically join the body`,
      );
      const final = new Map(
        frame.pixels.map((p) => [key(p), p.color.toUpperCase()]),
      );
      for (const id of ["nose", "mouth"]) {
        const glyph = frame.parts.find((p) => p.id === id)!;
        assert.ok(glyph.pixels.length > 0);
        for (const pixel of glyph.pixels)
          assert.equal(
            final.get(key(pixel)),
            pixel.color.toUpperCase(),
            `${id} is preserved rather than painted over by a neck`,
          );
        if (glyph.surfaceExpression) {
          assert.ok(glyph.surfaceExpression.sourcePartIds.includes(id));
          assert.ok(
            (glyph.surfaceExpression.contrastAfter ?? 0) >= 0.5 - 1e-12,
          );
        }
      }
    }
  }
});

test("physical connectivity rejects a detached head despite an asserted logical parent", () => {
  const born = createSimulation(
    primarySources("proof")[0].parts,
    "life-v7-genome-02",
  ).frameAt(0);
  const disconnected: PetFrame = {
    ...born,
    parts: born.parts
      .filter((part) => part.id === "body" || part.id === "head")
      .map((part) => ({
        ...part,
        parentId: part.id === "head" ? "body" : null,
        pixels: Array.from({ length: 9 }, (_, index) => ({
          x: (part.id === "body" ? 10 : 30) + (index % 3),
          y: 10 + Math.floor(index / 3),
          color: "#000000",
        })),
      })),
  };
  const { reached } = physicalCarrierCore(disconnected);
  const head = disconnected.parts.find((part) => part.id === "head")!;
  assert.equal(
    head.pixels.filter((pixel) => reached.has(key(pixel))).length,
    0,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation } from "../src/simulation";
import { clonePreset } from "../src/presets";

test("new moving tissue cannot overpaint authored facial landmarks or markings", () => {
  let intersections = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const sim = createSimulation(
      clonePreset("canine-cub"),
      `life-v7-genome-0${seed}`,
    );
    for (const age of [30, 75, 120])
      for (let phase = 0; phase < 8; phase++) {
        const frame = sim.frameAt(age, { time: phase / 8, action: "move" }),
          final = new Map(frame.pixels.map((p) => [`${p.x},${p.y}`, p.color])),
          generated = new Set(
            frame.parts
              .filter((p) => !p.sourcePartId)
              .flatMap((p) => p.pixels.map((c) => `${c.x},${c.y}`)),
          );
        for (const feature of frame.parts.filter(
          (p) =>
            p.sourcePartId && ["eye", "mouth", "decoration"].includes(p.kind),
        ))
          for (const pixel of feature.pixels) {
            const key = `${pixel.x},${pixel.y}`;
            if (generated.has(key)) intersections++;
            assert.equal(
              final.get(key),
              pixel.color,
              `seed${seed} day${age} phase${phase} ${feature.id} was overpainted`,
            );
          }
      }
  }
  assert.ok(
    intersections > 0,
    "cohort must actually exercise new tissue crossing protected ink",
  );
});

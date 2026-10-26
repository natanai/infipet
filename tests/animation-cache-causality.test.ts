import assert from "node:assert/strict";
import test from "node:test";
import { createSimulation } from "../src/simulation";
import { clonePreset } from "../src/presets";

test("zero-time birth and open eyes cannot occupy a later blink frame's cache entry", () => {
  for (let slot = 1; slot <= 4; slot++) {
    const parts = clonePreset("canine-cub"),
      seed = `life-v7-genome-0${slot}`;
    for (const age of [0, 7, 30, 75, 120]) {
      for (const action of ["idle", "move"] as const) {
        for (const first of [0, 1e-8]) {
          const sim = createSimulation(parts, seed);
          sim.frameAt(age, { action, time: first });
          for (const time of [1e-8, 0, -1]) {
            assert.deepEqual(
              sim.frameAt(age, { action, time }),
              createSimulation(parts, seed).frameAt(age, { action, time }),
              `seed${slot}/day${age}/${action}/first${first}/time${time}`,
            );
          }
        }
      }
    }
  }
});

test("arbitrary seek order agrees with cold rendering on both sides of held-pose boundaries", () => {
  const parts = clonePreset("canine-cub");
  for (const seed of ["life-v7-genome-01", "life-v7-genome-03"]) {
    for (const age of [0, 30, 75, 120]) {
      const sim = createSimulation(parts, seed),
        pace = sim.frameAt(age).motionPace;
      const times = [
        (1 - 5e-9) / (8 * pace),
        (1 + 2e-9) / (8 * pace),
        1 / (8 * pace),
        (2 - 5e-9) / (8 * pace),
        (2 + 2e-9) / (8 * pace),
      ];
      const expected = times.map((time) =>
        createSimulation(parts, seed).frameAt(age, { action: "move", time }),
      );
      for (const index of [4, 0, 3, 1, 2, 0, 4]) {
        assert.deepEqual(
          sim.frameAt(age, { action: "move", time: times[index] }),
          expected[index],
          `${seed}/day${age}/boundary${index}`,
        );
      }
    }
  }
});

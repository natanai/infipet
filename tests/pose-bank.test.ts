import assert from "node:assert/strict";
import test from "node:test";
import { createSimulation } from "../src/simulation";
import { clonePreset } from "../src/presets";

test("new animation cycles reuse pixels while preserving fresh deterministic world contacts", () => {
  const parts = clonePreset("canine-cub"),
    seed = "pose-bank-v7",
    sim = createSimulation(parts, seed);
  const pace = sim.frameAt(75).motionPace;
  for (let phase = 0; phase < 8; phase++)
    sim.frameAt(75, { action: "move", time: (phase + 0.2) / (8 * pace) });
  const warm = sim.getRenderCacheStats!();
  for (let cycle = 1; cycle < 4; cycle++)
    for (let phase = 0; phase < 8; phase++)
      sim.frameAt(75, {
        action: "move",
        time: (cycle + (phase + 0.2) / 8) / pace,
      });
  const played = sim.getRenderCacheStats!();
  assert.ok(
    played.hits > warm.hits,
    "increasing absolute time must reuse held-pose material, not only identical frame calls",
  );
  assert.ok(
    played.pixels <= played.pixelLimit && played.entries <= played.entryLimit,
  );
  assert.ok(played.maximumObservedPixels <= played.pixelLimit);
  const options = { action: "move" as const, time: 8.3 / pace };
  const fresh = createSimulation(parts, seed).frameAt(75, options),
    cached = sim.frameAt(75, options);
  assert.deepEqual(
    cached,
    fresh,
    "cache history must not alter world-space diagnostics or pixels",
  );
  assert.ok(Number((cached.interaction.diagnostics as any).worldAdvance) > 0);
  sim.frameAt(120, { action: "move", time: 0 });
  assert.equal(sim.getRenderCacheStats!().age, 120);
});

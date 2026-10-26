import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation } from "../src/simulation";
import { clonePreset } from "../src/presets";

test("generated membrane tips survive off-grid tissue growth and one stable camera fit", () => {
  let membranes = 0;
  for (let seed = 1; seed <= 4; seed++)
    for (const condition of ["neutral", "rest", "physical-fitness"]) {
      const sim = createSimulation(
        clonePreset("canine-cub"),
        `life-v7-genome-0${seed}`,
        "infant",
        {
          needTimeline:
            condition === "neutral"
              ? []
              : [
                  {
                    needId: condition as "rest" | "physical-fitness",
                    tick: 150 * 24,
                    fulfillment: 1,
                  },
                ],
        },
      );
      for (const age of [75, 120, 164]) {
        let camera: string | undefined;
        for (let phase = 0; phase < 8; phase++) {
          const frame = sim.frameAt(age, { action: "move", time: phase / 8 }),
            diagnostics = frame.interaction.diagnostics as any;
          assert.equal(
            diagnostics.viewportClipping.outsidePixelCount,
            0,
            `seed${seed}/${condition}/day${age}/phase${phase}`,
          );
          const view = JSON.stringify(diagnostics.camera);
          if (camera)
            assert.equal(view, camera, "camera must not zoom with the pose");
          camera = view;
          for (const part of frame.parts.filter(
            (p) =>
              p.role === "membrane" && p.readiness! > 0.8 && p.pixels.length,
          )) {
            membranes++;
            const nearest = Math.min(
              ...part.pixels.map((p) =>
                Math.hypot(p.x - part.tip.x, p.y - part.tip.y),
              ),
            );
            assert.ok(
              nearest <= 1.6,
              `painted membrane misses its geometric tip by${nearest}px at seed${seed}/${condition}/${age}/${phase}`,
            );
          }
        }
      }
    }
  assert.ok(membranes > 0, "regression must exercise actual generated wings");
});

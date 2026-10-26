import assert from "node:assert/strict";
import test from "node:test";
import { previewSchedule } from "./preview";
import { SEEDS } from "./protocol";
test("disposable preview keeps the four published raw seeds and all16 milestone conditions", () => {
  const schedule = previewSchedule();
  assert.equal(schedule.length, 16);
  assert.deepEqual(
    [...new Set(schedule.map((r) => r.seed))],
    SEEDS.slice(0, 4),
  );
  assert.equal(new Set(schedule.map((r) => r.id)).size, 16);
  assert.deepEqual(
    schedule.filter((r) => r.seedIndex === 3).map((r) => r.age),
    [0, 30, 75, 120],
  );
});

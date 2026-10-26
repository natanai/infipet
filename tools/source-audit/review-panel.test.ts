import assert from "node:assert/strict";
import test from "node:test";
import { secondaryViews } from "./review-panel";
import type { Manifest, Tile } from "./types";
function fixture() {
  const cases = Array.from({ length: 16 }, (_, seedIndex) =>
    Array.from({ length: 4 }, (_, history) => ({
      id: `s${seedIndex}h${history}`,
      group: "primary",
      seedIndex,
      ages: [0, 30, 75, 120],
    })),
  ).flat();
  const manifest = {
    stage: "full",
    expected: { presets: 1, histories: 4 },
    cases,
  } as Manifest;
  const views = cases.flatMap((c) =>
    c.ages.map(
      (age) =>
        ({ id: `${c.id}-${age}`, kind: "endpoint", caseId: c.id, age }) as Tile,
    ),
  );
  return { manifest, views };
}
test("independent panel schedules exactly the fixed25% across histories and ages, not the first convenient images", () => {
  const { manifest, views } = fixture();
  const selected = secondaryViews(manifest, views);
  assert.equal(selected.length, 64);
  assert.ok(selected.some((v) => v.caseId === "s12h3" && v.age === 120));
  assert.ok(!selected.some((v) => v.caseId === "s1h0"));
  assert.equal(new Set(selected.map((v) => v.caseId)).size, 16);
});
test("missing selected frames and duplicate replacements cannot masquerade as complete secondary coverage", () => {
  const { manifest, views } = fixture(),
    missing = views.filter((v) => v.id !== "s0h0-0");
  assert.throws(() => secondaryViews(manifest, missing), /incomplete/);
  assert.throws(
    () => secondaryViews(manifest, [...missing, views[1]]),
    /duplicated/,
  );
  assert.throws(
    () => secondaryViews({ ...manifest, stage: "proof" }, views),
    /full endpoint/,
  );
});

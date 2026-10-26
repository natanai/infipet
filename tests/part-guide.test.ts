import assert from "node:assert/strict";
import test from "node:test";
import { PART_GUIDE } from "../src/part-guide";
import { PART_KINDS } from "../src/simulation";

test("every brush type has a small complete help sheet, including hair", () => {
  assert.deepEqual(Object.keys(PART_GUIDE).sort(), [...PART_KINDS].sort());
  assert.ok("hair" in PART_GUIDE);
  for (const guide of Object.values(PART_GUIDE)) {
    for (const key of [
      "title",
      "purpose",
      "placement",
      "floating",
      "growth",
      "activity",
    ] as const) {
      assert.ok(guide[key].trim().length > 0);
      assert.ok(
        guide[key].length <= 150,
        `${guide.title}: ${key} must remain concise`,
      );
    }
    assert.equal(guide.example.length, 8);
    assert.ok(
      guide.example.every((row) => row.length === 8 && /^[.#+]+$/.test(row)),
    );
    assert.ok(
      guide.example.some((row) => row.includes("#")),
      `${guide.title} needs a visible pixel example`,
    );
  }
});

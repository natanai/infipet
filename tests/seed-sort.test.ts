import assert from "node:assert/strict";
import test from "node:test";
import {
  createSeedSortTimeline,
  createSeedSortValues,
  hashSortSeed,
  seedRadixSortEvents,
} from "../src/seed-sort";

test("the entire seed, including character order and Unicode, determines the replay", () => {
  assert.deepEqual(
    createSeedSortTimeline("egg-\u{1f423}"),
    createSeedSortTimeline("egg-\u{1f423}"),
  );
  assert.notDeepEqual(
    createSeedSortValues("1234"),
    createSeedSortValues("4321"),
  );
  assert.notEqual(hashSortSeed("a b"), hashSortSeed("ab "));
  for (const seed of ["abc", "\u{1f423}", "\ud800", "\u00e9"]) {
    let expected = 2166136261;
    for (const byte of new TextEncoder().encode(seed))
      expected = Math.imul(expected ^ byte, 16777619) >>> 0;
    assert.equal(hashSortSeed(seed), expected || 1);
  }
});

test("radix passes preserve bucket order and record real accesses", () => {
  const sorted = seedRadixSortEvents([15, 1, 4, 0, 4, 2], 4);
  assert.deepEqual(sorted.values, [0, 1, 2, 4, 4, 15]);
  assert.deepEqual(
    sorted.events
      .filter((event) => event.type === "write")
      .slice(0, 6)
      .map((event) => event.value),
    [4, 0, 4, 1, 2, 15],
  );
  assert.equal(sorted.events.at(-1)?.accesses, 6 * 2 * 2);
  assert.equal(
    sorted.events.filter((event) => event.type === "pass").length,
    2,
  );
});

test("each playback frame reconstructs the writes and finishes with every seeded bar", () => {
  const timeline = createSeedSortTimeline("pet-seed");
  const working = [...timeline.initial];
  assert.deepEqual(
    [...working].sort((a, b) => a - b),
    Array.from({ length: 64 }, (_, index) => index + 1),
  );
  timeline.events.forEach((event, index) => {
    if (event.type === "write") working[event.index] = event.value;
    assert.deepEqual(timeline.frames[index + 1].values, working);
    assert.equal(timeline.frames[index + 1].accesses, event.accesses);
  });
  assert.deepEqual(timeline.frames.at(-1)?.values, timeline.sorted);
  assert.deepEqual(
    timeline.sorted,
    Array.from({ length: 64 }, (_, index) => index + 1),
  );
  assert.equal(timeline.frames.at(-1)?.complete, true);
  assert.equal(timeline.frames.at(-1)?.pass, 4);
});

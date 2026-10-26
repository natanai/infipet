import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  advanceGame,
  commandGame,
  deriveCareTimeline,
  deriveDevelopmentContext,
  HOUR,
} from "../src/gameplay";
import {
  encodePet,
  decodePet,
  PROTOTYPE_REVISION,
  LINEAGE_RECIPE_VERSION,
  type PetDocument,
} from "../src/pet-format";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION } from "../src/needs";
import { clonePreset } from "../src/presets";
import { createSimulation } from "../src/simulation";

function document(): PetDocument {
  return {
    version: 8,
    algorithmVersion: 7,
    revision: PROTOTYPE_REVISION,
    mode: "infant",
    name: "A lab possibility",
    seed: "lab-seed",
    parts: clonePreset("bean"),
    bornAt: 0,
    age: 90,
    needTimeline: [{ needId: "rest", tick: 9000, fulfillment: 0.2 }],
    groomingTimeline: [],
    catalogVersion: NEEDS_CATALOG_VERSION,
    needsRulesVersion: NEEDS_RULES_VERSION,
    life: {
      lineageVersion: LINEAGE_RECIPE_VERSION,
      parts: clonePreset("canine-cub"),
      name: "Living cub",
      seed: "living-seed",
      mode: "infant",
      game: createGame("living-seed", "infant", 9 * HOUR),
      groomingTimeline: [],
    },
  };
}

test("the live source and authoritative recipe survive independent Lab edits and reload", () => {
  const original = document();
  const liveBefore = structuredClone(original.life);
  const live = original.life!;
  const source = createSimulation(live.parts, live.seed, live.mode, {
    needTimeline: deriveCareTimeline(live.game),
    liveContext: deriveDevelopmentContext(live.game),
  });
  const pixels = source.frameAt(0, { time: 0.5 }).pixels;
  const edited = {
    ...original,
    parts: [],
    seed: "another-lab-seed",
    age: 0,
    needTimeline: [{ needId: "rest" as const, tick: 10000, fulfillment: 1 }],
  };
  const reloaded = decodePet(encodePet(edited));
  assert.deepEqual(reloaded.life, liveBefore);
  const replay = createSimulation(
    reloaded.life!.parts,
    reloaded.life!.seed,
    reloaded.life!.mode,
    {
      needTimeline: deriveCareTimeline(reloaded.life!.game),
      liveContext: deriveDevelopmentContext(reloaded.life!.game),
    },
  );
  assert.deepEqual(replay.frameAt(0, { time: 0.5 }).pixels, pixels);
  assert.deepEqual(reloaded.needTimeline, edited.needTimeline);
});

test("portable lives retain return grace and committed battle/game state", () => {
  const doc = document();
  doc.life!.game = advanceGame(doc.life!.game, 9 * HOUR + 24 * HOUR, "absent");
  assert.ok(doc.life!.game.grace);
  const loaded = decodePet(encodePet(doc));
  const originalBudget = loaded.life!.game.grace!.remainingActiveMs;
  loaded.life!.game = advanceGame(
    loaded.life!.game,
    loaded.life!.game.clock.nowMs + 5 * 60000,
    "active",
  );
  const again = decodePet(encodePet(loaded));
  assert.equal(
    again.life!.game.grace!.remainingActiveMs,
    originalBudget - 5 * 60000,
  );
  assert.equal(again.life!.game.dead, false);
});

test("live import rejects mismatched immutable source identity and malformed nested state", () => {
  for (const patch of [
    { seed: "other-seed" },
    { mode: "egg" },
    { extra: true },
    { lineageVersion: "unavailable-catalog" },
    { game: { ...document().life!.game, meters: { hunger: -1 } } },
  ]) {
    const doc = document();
    assert.throws(
      () =>
        decodePet(JSON.stringify({ ...doc, life: { ...doc.life, ...patch } })),
      /Cannot open this pet/,
    );
  }
  const draft = document();
  delete draft.life;
  assert.equal(decodePet(encodePet(draft)).life, undefined);
});

test("maximum-length source seeds can perform and serialize real care commands", () => {
  const doc = document();
  const seed = "x".repeat(128);
  doc.life!.seed = seed;
  doc.life!.game = commandGame(
    createGame(seed, "infant", 9 * HOUR),
    { type: "feed", food: "snack" },
    9 * HOUR,
    "command:1:0:0",
  );
  assert.equal(decodePet(encodePet(doc)).life!.game.stats.snacks, 1);
});

/** Reproducible software fixtures for browser import, not vintage-device evidence. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  advanceGame,
  commandGame,
  createGame,
  DAY,
  deriveCareTimeline,
  deriveDevelopmentContext,
  HOUR,
  MINUTE,
  validateGameState,
  type GameCommand,
  type GameState,
} from "../src/gameplay";
import {
  decodePet,
  encodePet,
  LINEAGE_RECIPE_VERSION,
  PROTOTYPE_REVISION,
  type PetDocument,
} from "../src/pet-format";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION } from "../src/needs";
import { clonePreset } from "../src/presets";
import { createSimulation } from "../src/simulation";

const generatedAtMs = Date.now();
const utcOffsetMinutes = -300;
const directory = path.resolve(`docs/audits/${PROTOTYPE_REVISION}`);
const trace: {
  id: string;
  atMs: number;
  command: GameCommand;
  result: string;
}[] = [];
let sequence = 0;
function act(
  state: GameState,
  command: GameCommand,
  record = false,
): GameState {
  const id = `gameplay-proof-${++sequence}`;
  const next = commandGame(state, command, state.clock.nowMs, id);
  if (record)
    trace.push({ id, atMs: state.clock.nowMs, command, result: next.message });
  return next;
}
function careUntil(
  state: GameState,
  untilMs: number,
  record = false,
): GameState {
  let s = state;
  while (s.clock.nowMs < untilMs) {
    s = advanceGame(
      s,
      Math.min(untilMs, s.clock.nowMs + 10 * MINUTE),
      "active",
    );
    assert.equal(
      s.dead,
      false,
      "the software caretaker must keep this fixture alive",
    );
    if (s.attention.discipline) s = act(s, { type: "discipline" }, record);
    if (s.waste) s = act(s, { type: "clean" }, record);
    while (s.health.sickness || s.health.injury)
      s = act(s, { type: "medicine" }, record);
    if (s.sleeping) {
      if (s.lightsOn) s = act(s, { type: "lights", on: false }, record);
    } else {
      if (!s.lightsOn) s = act(s, { type: "lights", on: true }, record);
      while (s.meters.hunger < 4)
        s = act(s, { type: "feed", food: "meal" }, record);
      while (s.meters.happiness < 4)
        s = act(s, { type: "feed", food: "snack" }, record);
      while (s.meters.strength < 4)
        s = act(s, { type: "feed", food: "protein" }, record);
    }
  }
  return s;
}
function documentFor(game: GameState, name: string): PetDocument {
  const parts = clonePreset("canine-cub");
  return {
    version: 8,
    algorithmVersion: 7,
    revision: PROTOTYPE_REVISION,
    mode: "infant",
    name,
    seed: game.seed,
    parts: structuredClone(parts),
    bornAt: game.clock.startedAtMs,
    age: 0,
    needTimeline: [],
    groomingTimeline: [],
    catalogVersion: NEEDS_CATALOG_VERSION,
    needsRulesVersion: NEEDS_RULES_VERSION,
    life: {
      lineageVersion: LINEAGE_RECIPE_VERSION,
      parts,
      mode: "infant",
      seed: game.seed,
      name,
      game,
      groomingTimeline: [],
    },
  };
}

async function main() {
  let juvenile = createGame(
    "life-v8-gameplay-proof",
    "infant",
    generatedAtMs - 50 * HOUR,
    { utcOffsetMinutes },
  );
  const gameAssertions: {
    game: string;
    score: number;
    rounds: number;
    won: boolean;
  }[] = [];
  for (const kind of ["training", "direction", "numbers"] as const) {
    juvenile = act(juvenile, { type: "start-game", game: kind }, true);
    for (let i = 0; i < 5; i++) {
      const activity = juvenile.activity;
      assert.ok(activity && "targets" in activity);
      juvenile = act(
        juvenile,
        {
          type: "choose",
          choice: activity.choices[activity.targets[activity.round]],
        },
        true,
      );
    }
    const result = juvenile.activity;
    assert.ok(result?.kind === "result");
    assert.equal(result.score, 5);
    gameAssertions.push({
      game: kind,
      score: result.score,
      rounds: result.rounds,
      won: result.won,
    });
    juvenile = act(juvenile, { type: "dismiss" }, true);
  }
  juvenile = careUntil(juvenile, generatedAtMs, true);
  assert.equal(juvenile.stage, "juvenile");
  assert.equal(juvenile.stats.gamesWon, 3);
  assert.equal(juvenile.stats.training, 1);
  assert.equal(
    juvenile.stats.battles,
    0,
    "this fixture is ready for its first browser CPU battle",
  );
  assert.equal(juvenile.grace, null);

  const recovery = advanceGame(
    createGame("life-v8-recovery-proof", "infant", generatedAtMs - DAY, {
      utcOffsetMinutes,
    }),
    generatedAtMs,
    "absent",
  );
  assert.equal(recovery.dead, false);
  assert.equal(recovery.grace?.remainingActiveMs, 30 * MINUTE);

  let oldage = createGame(
    "life-v8-oldage-proof",
    "infant",
    generatedAtMs - 31 * DAY,
    { utcOffsetMinutes },
  );
  oldage = careUntil(oldage, oldage.clock.hatchAtMs + 30 * DAY - HOUR);
  oldage = advanceGame(oldage, generatedAtMs, "absent");
  assert.equal(oldage.dead, false);
  assert.equal(oldage.grace?.cause, "old age");
  assert.equal(oldage.grace?.remainingActiveMs, 30 * MINUTE);

  await mkdir(directory, { recursive: true });
  const summaries: Record<string, unknown>[] = [];
  for (const [id, state, name] of [
    ["juvenile", juvenile, "Cub — juvenile proof"],
    ["recovery", recovery, "Cub — recovery proof"],
    ["oldage", oldage, "Cub — old-age proof"],
  ] as const) {
    validateGameState(state);
    const document = documentFor(state, name);
    const raw = encodePet(document);
    const file = path.join(directory, `${id}.infipet.json`);
    await writeFile(file, raw + "\n", "utf8");
    const reread = decodePet(await readFile(file, "utf8"));
    assert.deepEqual(reread, document);
    assert.equal(encodePet(reread), raw);
    summaries.push({
      id,
      file: path.basename(file),
      bytes: Buffer.byteLength(raw),
      sha256: createHash("sha256").update(raw).digest("hex"),
      stage: state.stage,
      stats: state.stats,
      grace: state.grace,
      clock: state.clock,
      careSamples: state.careSamples.length,
    });
  }
  const simulation = createSimulation(
    clonePreset("canine-cub"),
    juvenile.seed,
    "infant",
    {
      needTimeline: deriveCareTimeline(juvenile),
      liveContext: deriveDevelopmentContext(juvenile),
    },
  );
  const frame = simulation.frameAt(
    (juvenile.clock.nowMs - juvenile.clock.startedAtMs) / DAY,
    { time: 0 },
  );
  const composite = new Map(
    frame.pixels.map((pixel) => [
      `${pixel.x},${pixel.y}`,
      pixel.color.toLowerCase(),
    ]),
  );
  const face = ["eye", "mouth"].map((kind) => ({
    kind,
    parts: frame.parts.filter((part) => part.kind === kind).length,
    visiblePixels: frame.parts
      .filter((part) => part.kind === kind)
      .flatMap((part) => part.pixels)
      .filter(
        (pixel) =>
          composite.get(`${pixel.x},${pixel.y}`) === pixel.color.toLowerCase(),
      ).length,
  }));
  for (const feature of face)
    assert.ok(
      feature.visiblePixels > 0,
      `juvenile frame has visible ${feature.kind} pixels`,
    );
  const proof = {
    kind: "software-gameplay-fixtures",
    claim:
      "Current-code functional regression fixtures; not original-device traces, vintage parity evidence, human visual approval, or physical iOS/widget testing.",
    generatedAt: new Date(generatedAtMs).toISOString(),
    generatedAtMs,
    utcOffsetMinutes,
    lineageRecipeVersion: LINEAGE_RECIPE_VERSION,
    assertions: {
      allThreeGamesCompleted: gameAssertions,
      juvenileBeforeFirstBattle: true,
      allDocumentsRoundTrip: true,
      recoveryGraceMinutes: 30,
      oldAgeGraceMinutes: 30,
      juvenileVisibleFace: face,
    },
    fixtures: summaries,
    juvenileCommandTrace: trace,
  };
  await writeFile(
    path.join(directory, "proof.json"),
    JSON.stringify(proof, null, 2) + "\n",
    "utf8",
  );
  console.log(
    JSON.stringify({
      directory,
      fixtures: summaries.map((s) => ({
        id: s.id,
        bytes: s.bytes,
        stage: s.stage,
      })),
      juvenileVisibleFace: face,
      commandTraceLength: trace.length,
    }),
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

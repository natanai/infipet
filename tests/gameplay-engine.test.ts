import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceGame,
  careAt,
  commandGame,
  createGame,
  DAY,
  deriveCareTimeline,
  deriveDevelopmentContext,
  GAME_RULES,
  HOUR,
  MINUTE,
  selectV1Branch,
  validateGameState,
  type GameCommand,
  type GameState,
} from "../src/gameplay";
import traces from "../src/gameplay/reference-traces.json";

const START = 9 * HOUR;
const game = (mode: "infant" | "egg" = "infant") =>
  createGame("gameplay-proof-1", mode, START);
let receipt = 0;
const act = (s: GameState, command: GameCommand, at = s.clock.nowMs) =>
  commandGame(s, command, at, `test-${++receipt}`);

function keepWell(s: GameState, untilHours: number) {
  const until = s.clock.hatchAtMs + untilHours * HOUR;
  while (s.clock.nowMs < until) {
    s = advanceGame(s, Math.min(until, s.clock.nowMs + 30 * MINUTE), "active");
    assert.equal(s.dead, false, `unexpected death at ${s.clock.nowMs}`);
    if (s.attention.discipline) s = act(s, { type: "discipline" });
    if (s.waste) s = act(s, { type: "clean" });
    while (s.health.sickness || s.health.injury)
      s = act(s, { type: "medicine" });
    if (s.sleeping) {
      if (s.lightsOn) s = act(s, { type: "lights", on: false });
    } else {
      if (!s.lightsOn) s = act(s, { type: "lights", on: true });
      while (s.meters.hunger < 4) s = act(s, { type: "feed", food: "meal" });
      while (s.meters.happiness < 4)
        s = act(s, { type: "feed", food: "snack" });
      while (s.meters.strength < 4)
        s = act(s, { type: "feed", food: "protein" });
    }
  }
  return s;
}

test("creation is deterministic, serializable, and does not read a mutable clock", () => {
  assert.deepEqual(game(), game());
  assert.deepEqual(
    validateGameState(JSON.parse(JSON.stringify(game()))),
    game(),
  );
  assert.throws(() => createGame("x", "egg", Number.MAX_SAFE_INTEGER), /range/);
  assert.throws(() => createGame("x", "egg", -1), /inputs/);
});

test("egg and all scheduled stage boundaries use chronological hours after hatch", () => {
  let s = game("egg");
  assert.equal(advanceGame(s, START + GAME_RULES.eggMs - 1).stage, "egg");
  s = advanceGame(s, START + GAME_RULES.eggMs);
  assert.equal(s.stage, "hatchling");
  assert.equal(s.stageCommitments[0].atHour, 0);
  for (const [hour, before, after] of [
    [1, "hatchling", "infant"],
    [49, "infant", "juvenile"],
    [121, "juvenile", "adult"],
  ] as const) {
    assert.equal(
      advanceGame(s, s.clock.hatchAtMs + hour * HOUR - 1, "absent").stage,
      before,
    );
    s = advanceGame(s, s.clock.hatchAtMs + hour * HOUR, "absent");
    assert.equal(s.stage, after);
    assert.equal(s.stageCommitments.at(-1)?.atHour, hour);
  }
  assert.equal(validateGameState(s).stage, "adult");
  assert.deepEqual(
    deriveDevelopmentContext(s).stageEndHours,
    [1, 49, 121, 193],
  );
});

test("one long replay and irregular incremental replay produce exactly equal state", () => {
  const start = game("egg"),
    end = START + 27 * HOUR + 17_231;
  const batch = advanceGame(start, end, "absent");
  let steps = start;
  for (let at = START + 18_173; at < end; at += 93_017)
    steps = advanceGame(steps, at, "absent");
  steps = advanceGame(steps, end, "absent");
  assert.deepEqual(steps, batch);
  assert.deepEqual(start, game("egg"));
});

test("hunger and strength emptying together creates only one unanswered call", () => {
  let s = game();
  s.meters.hunger = 1;
  s.meters.strength = 1;
  s.schedule.strengthAtMs = s.schedule.hungerAtMs;
  s = advanceGame(s, START + HOUR + GAME_RULES.callMs, "absent");
  assert.equal(s.stats.careMistakes, 1);
  s = advanceGame(s, START + 6 * HOUR, "absent");
  assert.equal(s.stats.careMistakes, 1);
});

test("overlapping sleep and empty-meter calls remain a single attention episode", () => {
  let s = createGame("sleep", "infant", 20 * HOUR);
  s = advanceGame(s, 21 * HOUR, "absent");
  s.meters.hunger = 0;
  s.health.hungrySinceMs = s.clock.nowMs;
  s = advanceGame(s, 21 * HOUR + 1, "absent");
  s = advanceGame(s, 22 * HOUR, "absent");
  assert.equal(s.stats.careMistakes, 1);
});

test("ordinary live neglect causes death; offline neglect grants a persistent return budget", () => {
  assert.equal(advanceGame(game(), START + 13 * HOUR, "active").dead, true);
  let s = advanceGame(game(), START + 20 * HOUR, "absent");
  assert.equal(s.dead, false);
  assert.equal(s.grace?.remainingActiveMs, 30 * MINUTE);
  s = advanceGame(s, s.clock.nowMs + 10 * MINUTE, "active");
  assert.equal(s.grace?.remainingActiveMs, 20 * MINUTE);
  s = validateGameState(JSON.parse(JSON.stringify(s)));
  s = advanceGame(s, s.clock.nowMs + 5 * DAY, "absent");
  assert.equal(s.grace?.remainingActiveMs, 20 * MINUTE);
  s = advanceGame(s, s.clock.nowMs + 20 * MINUTE, "active");
  assert.equal(s.dead, true);
});

test("treating the lethal condition during return grace saves the pet without erasing mistakes", () => {
  let s = advanceGame(game(), START + 13 * HOUR, "absent");
  const mistakes = s.stats.careMistakes;
  assert.ok(s.grace);
  s = act(s, { type: "feed", food: "meal" });
  assert.equal(s.grace, null);
  assert.equal(s.dead, false);
  assert.equal(s.stats.careMistakes, mistakes);
});

test("waste, seeded sickness doses and medicine work independently of game visuals", () => {
  let s = advanceGame(game(), START + 28 * HOUR, "absent");
  assert.equal(s.waste, 4);
  assert.ok(s.health.sickness > 0);
  s = act(s, { type: "clean" });
  const doses = s.health.sickness;
  for (let i = 0; i < doses; i++) s = act(s, { type: "medicine" });
  assert.equal(s.health.sickness, 0);
  assert.equal(s.health.sickSinceMs, null);
  assert.equal(s.stats.medicines, doses);
  assert.equal(s.waste, 0);
  validateGameState(s);
});

test("training counts at entry, including canceled sessions; correct five-round games reward once", () => {
  let s = act(game(), { type: "start-game", game: "training" });
  assert.equal(s.stats.training, 1);
  s = act(s, { type: "cancel" });
  assert.equal(s.stats.training, 1);
  s.meters.happiness = 2;
  s.meters.strength = 2;
  s.meters.weight = 12;
  s = act(s, { type: "start-game", game: "training" });
  for (let i = 0; i < 5; i++) {
    const a = s.activity!;
    assert.ok("targets" in a);
    s = act(s, { type: "choose", choice: a.choices[a.targets[a.round]] });
  }
  assert.equal(s.activity?.kind, "result");
  assert.equal(s.stats.gamesWon, 1);
  assert.equal(s.meters.weight, 11);
  assert.equal(s.meters.happiness, 3);
  assert.equal(s.meters.strength, 3);
  const result = s;
  s = commandGame(
    s,
    { type: "choose", choice: "high" },
    s.clock.nowMs,
    "late-answer",
  );
  assert.equal(s.stats.gamesWon, result.stats.gamesWon);
});

test("P1 direction and vintage P2 number games are playable five-round games", () => {
  for (const kind of ["direction", "numbers"] as const) {
    let s = act(game(), { type: "start-game", game: kind });
    for (let i = 0; i < 5; i++) {
      const a = s.activity!;
      assert.ok("targets" in a);
      if (kind === "numbers") {
        const shown = a.shownNumbers[a.round],
          next = a.shownNumbers[a.round + 1];
        assert.ok(
          shown >= 1 && shown <= 9 && next >= 1 && next <= 9 && shown !== next,
        );
        assert.equal(
          a.choices[a.targets[a.round]],
          next > shown ? "higher" : "lower",
        );
        assert.equal(shown, s.numberShown);
      }
      s = act(s, { type: "choose", choice: a.choices[a.targets[a.round]] });
    }
    assert.equal(s.activity?.kind, "result");
    if (s.activity?.kind === "result") assert.equal(s.activity.score, 5);
    validateGameState(s);
  }
});

test("CPU battles unlock at juvenile and stable commands cannot duplicate outcomes", () => {
  const early = act(game(), { type: "battle" });
  assert.equal(early.stats.battles, 0);
  const base = keepWell(game(), 49);
  let s = base;
  s = commandGame(s, { type: "battle" }, s.clock.nowMs, "battle-fixed-1");
  assert.equal(s.stats.battles, 1);
  assert.equal(s.activity?.kind, "battle");
  const again = commandGame(
    s,
    { type: "battle" },
    s.clock.nowMs + 1,
    "battle-fixed-1",
  );
  assert.deepEqual(again, s);
  assert.deepEqual(
    commandGame(base, { type: "battle" }, s.clock.nowMs, "battle-fixed-1"),
    s,
  );
  validateGameState(s);
});

test("isolated advanced-gate boundary fixture checks last fifteen results and locks its decision", () => {
  // Synthetic predicate fixture only; lifecycle witnesses must earn every battle through commands.
  let s = advanceGame(game(), START + 192 * HOUR, "absent");
  s.stats.battles = 15;
  s.randomCounters.battles = 15;
  s.stats.wins = 12;
  s.recentBattles = [...Array(12).fill(true), ...Array(3).fill(false)];
  s = advanceGame(s, START + 193 * HOUR, "absent");
  assert.equal(s.stage, "advanced");
  assert.equal(s.stageCommitments.at(-1)?.battle, 0.8);
  assert.equal(s.stageCommitments.at(-1)?.atHour, 193);
  validateGameState(s);
  const failed = advanceGame(game(), START + 194 * HOUR, "absent");
  assert.equal(failed.stage, "adult");
  assert.equal(failed.advancedChecked, true);
});

test("lifetime receipts survive more than 256 commands and round trips without replaying rewards", () => {
  let s = commandGame(
    game(),
    { type: "start-game", game: "training" },
    START,
    "first-entry",
  );
  s = commandGame(s, { type: "cancel" }, START, "first-cancel");
  for (let i = 0; i < 300; i++)
    s = commandGame(s, { type: "clean" }, START, `clean-${i}`);
  s = validateGameState(JSON.parse(JSON.stringify(s)));
  assert.equal(s.commandHistory.length, 302);
  assert.equal(s.receipts.length, 302);
  assert.equal(s.stats.training, 1);
  assert.equal(s.randomCounters.games, 1);
  assert.deepEqual(
    commandGame(
      s,
      { type: "start-game", game: "training" },
      START + MINUTE,
      "first-entry",
    ),
    s,
  );
  assert.ok(Object.isFrozen(s.commandHistory[0]));
  assert.ok(Object.isFrozen(s.commandHistory[0].command));
});

test("command names and rejected padding cannot steer random gameplay outcomes", () => {
  const first = commandGame(
    game(),
    { type: "start-game", game: "direction" },
    START,
    "ordinary-a",
  );
  const renamed = commandGame(
    game(),
    { type: "start-game", game: "direction" },
    START,
    "different-unrelated-id",
  );
  assert.deepEqual(first.activity, renamed.activity);
  assert.deepEqual(first.randomCounters, renamed.randomCounters);
  let padded = game();
  for (let i = 0; i < 12; i++)
    padded = commandGame(
      padded,
      { type: "choose", choice: "higher" },
      START,
      `invalid-choice-${i}`,
    );
  assert.ok(padded.commandHistory.every((entry) => entry.accepted === false));
  assert.deepEqual(padded.randomCounters, game().randomCounters);
  padded = commandGame(
    padded,
    { type: "start-game", game: "direction" },
    START,
    "new-id",
  );
  assert.deepEqual(first.activity, padded.activity);
  assert.deepEqual(first.randomCounters, padded.randomCounters);
  assert.throws(
    () =>
      commandGame(
        game(),
        { type: "clean", target: "hidden-control" } as any,
        START,
        "extra",
      ),
    /command/,
  );
});

test("full command histories reject inconsistent IDs, time order and malformed commands", () => {
  const valid = commandGame(game(), { type: "clean" }, START, "clean");
  const mutations: ((s: any) => void)[] = [
    (s) => {
      s.commandHistory = [];
    },
    (s) => {
      s.commandHistory[0].id = "another";
    },
    (s) => {
      s.commandHistory[0].atMs = START - 1;
    },
    (s) => {
      s.commandHistory[0].command = { type: "feed", food: "invisible" };
    },
    (s) => {
      s.commandHistory[0].accepted = "yes";
    },
    (s) => {
      s.randomCounters.games = -1;
    },
  ];
  for (const mutate of mutations) {
    const corrupted = structuredClone(valid);
    mutate(corrupted);
    assert.throws(() => validateGameState(corrupted));
  }
  assert.deepEqual(validateGameState(valid), valid);
});

test("battle randomness depends on legal battle order and survives renamed receipts", () => {
  const base = keepWell(game(), 49);
  const first = commandGame(
    base,
    { type: "battle" },
    base.clock.nowMs,
    "battle-one",
  );
  let padded = commandGame(
    base,
    { type: "choose", choice: "left" },
    base.clock.nowMs,
    "not-a-game",
  );
  padded = commandGame(
    padded,
    { type: "battle" },
    base.clock.nowMs,
    "unrelated-identity",
  );
  assert.equal(first.activity?.kind, "battle");
  assert.deepEqual(first.activity, padded.activity);
  assert.deepEqual(first.randomCounters, padded.randomCounters);
  assert.deepEqual(first.stats, padded.stats);
  assert.deepEqual(first.health, padded.health);
});

test("V1 reference branch predicate boundary fixtures cover all adult slots", () => {
  const m = (
    careMistakes: number,
    training: number,
    overfeeds = 0,
    sleepDisturbances = 0,
  ) => ({ careMistakes, training, overfeeds, sleepDisturbances });
  for (const [previous, metrics, branch] of [
    ["agumon", m(3, 32), "greymon"],
    ["agumon", m(3, 31), "devimon"],
    ["agumon", m(4, 5, 3, 4), "tyranomon"],
    ["agumon", m(4, 16, 3, 6), "meramon"],
    ["betamon", m(3, 48), "devimon"],
    ["betamon", m(3, 47), "meramon"],
    ["betamon", m(4, 8, 3, 9), "airdramon"],
    ["betamon", m(4, 8, 4, 8), "seadramon"],
    ["agumon", m(4, 0), "numemon"],
  ] as const)
    assert.equal(selectV1Branch("adult", previous, metrics), branch);
});

test("hourly care sampling preserves the past and stays below the manual timeline budget", () => {
  let s = game();
  const before = deriveCareTimeline(s);
  s = act(s, { type: "discipline" }, START + 30 * MINUTE);
  assert.deepEqual(deriveCareTimeline(s), before);
  s = advanceGame(s, START + HOUR, "absent");
  assert.ok(deriveCareTimeline(s).some((p) => p.tick === 1));
  assert.deepEqual(careAt(s, 0), careAt(game(), 0));
  s = advanceGame(s, START + 1_000_000 * DAY, "absent");
  assert.ok(deriveCareTimeline(s).length <= 721 * 6);
  assert.ok(s.grace);
  assert.equal(s.dead, false);
  validateGameState(s);
  s = act(s, { type: "clean" });
  validateGameState(s);
  assert.ok(JSON.stringify(s).length < 200_000);
});

test("a cared-for complete lifespan reaches old age and handles offline goodbye grace", () => {
  let s = keepWell(game(), 29 * 24 + 23);
  assert.equal(s.dead, false);
  s = advanceGame(s, s.clock.hatchAtMs + 30 * DAY, "absent");
  assert.equal(s.grace?.cause, "old age");
  assert.equal(s.dead, false);
  s = advanceGame(s, s.clock.nowMs + 30 * MINUTE, "active");
  assert.equal(s.dead, true);
  assert.equal(s.death?.cause, "old age");
});

test("imports reject malformed nested game state and allow current snapshots", () => {
  const mutations: ((s: any) => void)[] = [
    (s) => (s.clock.energyUnits = -1),
    (s) => (s.meters.hunger = 5),
    (s) => (s.attention.extra = true),
    (s) => (s.version = 999),
    (s) => (s.receipts = ["x", "x"]),
    (s) => (s.schedule.hungerAtMs = Infinity),
    (s) => (s.careSamples[0].values[0] = NaN),
    (s) => (s.stageCommitments[0].atHour = 0.5),
    (s) => (s.health.sickness = 2),
    (s) => (s.extra = "corruption"),
    (s) => (s.numberShown = 10),
  ];
  for (const mutate of mutations) {
    const s = structuredClone(game());
    mutate(s);
    assert.throws(() => validateGameState(s));
  }
});

test("pinned regression command traces preserve training, P1 and vintage P2 behavior", () => {
  for (const trace of traces.traces) {
    let s = createGame(traces.seed, trace.mode as "infant", traces.startedAtMs);
    for (const step of trace.steps) {
      s = commandGame(s, step.command as GameCommand, s.clock.nowMs, step.id);
      const expected = "expect" in step ? step.expect : undefined;
      if (expected && "activity" in expected)
        assert.equal(s.activity?.kind ?? null, expected.activity, trace.id);
      if (expected && "training" in expected)
        assert.equal(s.stats.training, expected.training, trace.id);
      if (expected && "gamesWon" in expected)
        assert.equal(s.stats.gamesWon, expected.gamesWon, trace.id);
      if (expected && "score" in expected) {
        assert.ok(s.activity && "score" in s.activity);
        assert.equal(s.activity.score, expected.score, trace.id);
      }
    }
  }
});

test("exact grace deadline executes before a command and backwards clocks cannot rewind", () => {
  const s = advanceGame(game(), START + 13 * HOUR, "absent");
  const result = commandGame(
    s,
    { type: "feed", food: "meal" },
    s.clock.nowMs + 30 * MINUTE,
    "too-late",
  );
  assert.equal(result.dead, true);
  assert.equal(result.stats.meals, 0);
  const earlier = advanceGame(s, s.clock.nowMs - HOUR, "active");
  assert.deepEqual(earlier, s);
});

test("imports reject stale stages and schedules but allow post-lifespan frozen schedules", () => {
  const egg = game("egg");
  egg.clock.nowMs += DAY;
  assert.throws(() => validateGameState(egg), /stage/);
  const stale = game();
  stale.schedule.hungerAtMs = stale.clock.nowMs;
  assert.throws(() => validateGameState(stale), /schedule/);
  const missingDecision = advanceGame(game(), START + 200 * HOUR, "absent");
  missingDecision.advancedChecked = false;
  assert.throws(() => validateGameState(missingDecision), /decision/);
  const far = advanceGame(game(), START + 1000 * DAY, "absent");
  assert.ok(Object.values(far.schedule).some((at) => at < far.clock.nowMs));
  validateGameState(far);
});

test("death exactly at a stage boundary preserves the prior stage and remains importable", () => {
  let s = advanceGame(game(), START + 48 * HOUR + 30 * MINUTE, "absent");
  s = advanceGame(s, START + 49 * HOUR, "active");
  assert.equal(s.dead, true);
  assert.equal(s.stage, "infant");
  validateGameState(s);
});

test("absence abandons unfinished games without rewards while retaining training entries", () => {
  for (const kind of ["training", "direction", "numbers"] as const) {
    const started = act(game(), { type: "start-game", game: kind });
    const absent = advanceGame(started, START + MINUTE, "absent");
    assert.equal(absent.activity, null);
    assert.equal(absent.stats.gamesWon, 0);
    assert.equal(absent.stats.training, kind === "training" ? 1 : 0);
    validateGameState(absent);
  }
});

test("ordinary lights-off care returns a disturbed pet to sleep and permits repeated genuine disturbances", () => {
  let s = keepWell(game(), 12);
  assert.equal(s.sleeping, true);
  s = act(s, { type: "lights", on: false });
  const before = s.stats.sleepDisturbances;
  for (let i = 0; i < 9; i++) {
    s = act(s, { type: "start-game", game: "training" });
    assert.equal(s.sleeping, false);
    s = act(s, { type: "cancel" });
    s = act(s, { type: "lights", on: false });
    assert.equal(s.sleeping, true);
    s = advanceGame(s, s.clock.nowMs + MINUTE, "active");
  }
  assert.equal(s.stats.sleepDisturbances - before, 9);
  assert.equal(s.dead, false);
  validateGameState(s);
});

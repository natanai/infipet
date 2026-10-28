import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceGame,
  commandGame,
  deriveCareTimeline,
  validateGameState,
  DAY,
  HOUR,
  type GameState,
} from "../src/gameplay";
import {
  createNeedsSimulation,
  initialPhysiology,
  observePhysiology,
  physiologyAt,
  PHYSIOLOGY_EVENT_LIMIT,
  PHYSIOLOGY_NEEDS,
} from "../src/needs";
import { recordedNeedsSimulation } from "../src/integration/living-physiology";
import {
  maintainedLife,
  playerSimulation,
  BENCHMARK_START as T,
} from "../scripts/daily-benchmark";
import { fixtures } from "./alg-development-fixtures";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 2e-11, `${a} != ${b}`);
const age = (s: GameState) => (s.clock.nowMs - s.clock.hatchAtMs) / DAY;
const command = (s: GameState, c: Parameters<typeof commandGame>[1]) =>
  commandGame(
    s,
    c,
    s.clock.nowMs,
    "audit/" + (s.commandSequence ?? s.commandHistory.length),
  );

test("[CARE-005/A1] actual care at days 364,365,366,400,1460 reaches meters, exact timeline, needs and player frame while anatomy freezes", () => {
  // Actual healthy commands all the way to four years. No edited meters,
  // artificial immortality, fabricated samples or absence grace as survival oracle.
  const lives = maintainedLife("MATURE-AUDIT", 1460);
  let mature: unknown;
  const byteSizes: number[] = [];
  for (const day of [364, 365, 366, 400, 1460]) {
    let s = advanceGame(lives.get(day * 24)!, T + day * DAY + 1.5 * HOUR);
    assert.equal(s.dead, false);
    assert.equal(s.grace, null);
    assert.equal(s.sleeping, false);
    assert.equal(s.meters.happiness, 3);
    const before = s,
      priorInput = deriveCareTimeline(before),
      prior = recordedNeedsSimulation(before).stateAt(age(before));
    assert.equal(
      prior.needs.relaxation.fulfillment,
      0.8,
      "independent formula .2+.2*3",
    );
    // A rejected choice has a receipt but no fabricated successful care.
    s = command(s, { type: "choose", choice: "left" });
    assert.equal(s.commandHistory.at(-1)!.accepted, false);
    assert.deepEqual(deriveCareTimeline(s), priorInput);
    for (let attempt = 0; attempt < 8 && s.meters.happiness === 3; attempt++) {
      if (s.attention.discipline) s = command(s, { type: "discipline" });
      s = command(s, { type: "feed", food: "snack" });
    }
    assert.equal(s.commandHistory.at(-1)!.accepted, true);
    assert.equal(s.meters.happiness, 4);
    const input = deriveCareTimeline(s),
      after = recordedNeedsSimulation(s).stateAt(age(s));
    assert.notDeepEqual(
      input,
      priorInput,
      "old sampling cap left this unchanged at day366",
    );
    assert.equal(input.model.events.at(-1)!.atMs, day * DAY + 1.5 * HOUR);
    assert.equal(
      after.needs.relaxation.fulfillment,
      1,
      "independent formula .2+.2*4",
    );
    close(after.needs.relaxation.shortTerm, prior.needs.relaxation.shortTerm);
    const sim = playerSimulation(fixtures.branching, s),
      frame = sim.frameAt(age(s));
    assert.deepEqual(
      frame.wellbeing,
      after,
      "actual player-frame wellbeing consumes the same real chronological care",
    );
    assert.notDeepEqual(
      frame.wellbeing,
      playerSimulation(fixtures.branching, before).frameAt(age(before))
        .wellbeing,
    );
    const at = advanceGame(s, s.clock.nowMs + HOUR / 4),
      later = recordedNeedsSimulation(at).stateAt(age(at));
    close(
      later.needs.relaxation.shortTerm,
      1 +
        (after.needs.relaxation.shortTerm - 1) * Math.pow(2, -(1 / 96) / 0.25),
    );
    close(
      later.needs.relaxation.memory,
      after.needs.relaxation.memory * Math.pow(2, -(1 / 96) / 7),
    );
    close(later.needs.relaxation.exposure, after.needs.relaxation.exposure);
    const reopen = validateGameState(clone(s));
    assert.deepEqual(reopen, s);
    assert.deepEqual(
      createNeedsSimulation(s.seed, deriveCareTimeline(reopen)).stateAt(age(s)),
      after,
    );
    assert.deepEqual(
      playerSimulation(fixtures.branching, reopen, true).frameAt(age(s))
        .wellbeing,
      after,
    );
    if (day >= 365) {
      const graph = sim.materialStateAt(age(s)).graph;
      mature ??= graph;
      assert.deepEqual(
        graph,
        mature,
        "all post-check365 physical properties and transaction history identical",
      );
      assert.deepEqual(
        playerSimulation(fixtures.branching, before).materialStateAt(
          age(before),
        ).graph,
        graph,
      );
      const checkpoint = clone(sim.exportAnatomicalCheckpoint());
      assert.deepEqual(
        playerSimulation(
          fixtures.branching,
          reopen,
          true,
          checkpoint,
        ).materialStateAt(age(s)).graph,
        graph,
      );
    }
    assert.ok(s.physiology!.events.length <= PHYSIOLOGY_EVENT_LIMIT);
    const matureCommands = s.commandHistory.filter(
      (c) => c.atMs >= T + 365 * DAY,
    );
    assert.ok(matureCommands.length <= 128);
    const saveBytes = Buffer.byteLength(JSON.stringify(s));
    if (day >= 400) byteSizes.push(saveBytes);
    console.log(
      JSON.stringify({
        kind: "mature-care",
        day,
        happinessBefore: before.meters.happiness,
        happinessAfter: s.meters.happiness,
        relaxationBefore: prior.needs.relaxation.fulfillment,
        relaxationAfter: after.needs.relaxation.fulfillment,
        physiologyEvents: s.physiology!.events.length,
        retainedMatureCommands: matureCommands.length,
        saveBytes,
      }),
    );
    // Same real presence transitions; arbitrary query partitions add no evidence.
    const absent = advanceGame(s, s.clock.nowMs + HOUR, "absent");
    const split = advanceGame(
      advanceGame(s, s.clock.nowMs + 12345, "absent"),
      s.clock.nowMs + HOUR,
      "absent",
    );
    assert.deepEqual(absent, split);
    assert.equal(absent.physiology!.presence, "absent");
    const direct = advanceGame(absent, absent.clock.nowMs + HOUR / 4);
    const fine = advanceGame(
      advanceGame(absent, absent.clock.nowMs + 1000),
      absent.clock.nowMs + HOUR / 4,
    );
    assert.deepEqual(fine, direct);
    assert.deepEqual(
      recordedNeedsSimulation(fine).stateAt(age(fine)),
      createNeedsSimulation(s.seed, deriveCareTimeline(direct)).stateAt(
        age(direct),
      ),
    );
  }
  assert.ok(
    Math.abs(byteSizes[1] - byteSizes[0]) < 10_000,
    "ongoing four-year commands and physiology have bounded retention",
  );
});

test("[CARE-005/A2] bounded sufficient state equals an independently integrated full event history and remains query-order invariant", () => {
  let model = initialPhysiology();
  const records: { atMs: number; values: number[] }[] = [];
  const state = {
    at: 0,
    raw: Array(6).fill(0.75),
    fast: Array(6).fill(0.75),
    memory: Array(6).fill(0),
    exposure: Array(6).fill(0),
  };
  const step = (at: number) => {
    const dt = (at - state.at) / DAY;
    for (let j = 0; j < 6; j++) {
      const deficit = Math.max(0, 1 - state.raw[j] / 0.75);
      state.fast[j] =
        state.raw[j] + (state.fast[j] - state.raw[j]) * 2 ** (-dt / 0.25);
      state.memory[j] = deficit + (state.memory[j] - deficit) * 2 ** (-dt / 7);
      state.exposure[j] += deficit * dt;
    }
    state.at = at;
  };
  for (let i = 0; i < 2000; i++) {
    const atMs = i * 19_123_457,
      values = PHYSIOLOGY_NEEDS.map((_, j) => ((i * 13 + j * 7) % 101) / 100);
    step(atMs);
    state.raw = values;
    records.push({ atMs, values });
    model = observePhysiology(
      model,
      { atMs, values },
      i % 2 ? "active" : "absent",
    );
  }
  const now = records.at(-1)!.atMs + 123456;
  step(now);
  const input = {
    kind: "recorded-physiology-v1" as const,
    model,
    history: records.filter((p) => p.atMs <= 365 * DAY),
  };
  const actual = physiologyAt(input, now);
  for (let i = 0; i < 6; i++) {
    close(actual.fast[i], state.fast[i]);
    close(actual.memory[i], state.memory[i]);
    close(actual.exposure[i], state.exposure[i]);
  }
  assert.equal(model.events.length, 128);
  assert.ok(model.anchor.atMs > 365 * DAY);
  assert.deepEqual(
    physiologyAt({ ...input, model: clone(model) }, now),
    actual,
  );
  const sim = createNeedsSimulation("CLOSED-FORM", input),
    expected = sim.stateAt(now / DAY);
  sim.stateAt(364);
  assert.deepEqual(sim.stateAt(now / DAY), expected);
  assert.throws(() => sim.stateAt(380), /outside the retained/);
  const mutable = clone(input),
    captured = createNeedsSimulation("CAPTURE", mutable);
  const expectedCaptured = captured.stateAt(now / DAY);
  (mutable.model.events.at(-1)!.values as number[])[0] = 0.123;
  assert.deepEqual(
    captured.stateAt(now / DAY),
    expectedCaptured,
    "captured histories do not change after caller mutation",
  );
  assert.throws(
    () =>
      observePhysiology(model, { atMs: 0, values: Array(6).fill(1) }, "active"),
    /observation/,
  );
});

test("[CARE-005/A2] old mature saves preserve unknown past evidence and resume current care without fabricating earlier anatomy", () => {
  const old = maintainedLife("OLD-MATURE", 366).get(366 * 24)!;
  const input = clone(old);
  delete input.physiology;
  delete input.commandSequence;
  const resumed = advanceGame(validateGameState(input), input.clock.nowMs);
  assert.ok(resumed.physiology!.unknownInterval);
  assert.deepEqual(resumed.careObservations, input.careObservations);
  assert.deepEqual(resumed.commandHistory, input.commandHistory);
  const from = playerSimulation(fixtures.blob, input, true).materialStateAt(
    365,
  );
  assert.deepEqual(
    playerSimulation(fixtures.blob, resumed, true).materialStateAt(365),
    from,
  );
  assert.equal(
    recordedNeedsSimulation(resumed).stateAt(366).needs.relaxation.fulfillment,
    0.2 + 0.2 * resumed.meters.happiness,
  );
  const invalid = clone(resumed);
  (invalid.physiology!.anchor as any).atMs = Infinity;
  assert.throws(() => validateGameState(invalid), /physiolog/);
});

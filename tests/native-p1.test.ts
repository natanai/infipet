import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NATIVE_P1_CHARACTERS,
  NATIVE_P1_PROFILE,
  advanceNativeP1LifecycleCountdown,
  listNativeP1HistoryRoutes,
  nativeP1CountExpiredCall,
  nativeP1InitialDiscipline,
  nativeP1Scold,
  nativeP1Statistics,
  selectNativeP1Evolution,
} from "../src/gameplay/native-p1";

const raw = JSON.parse(
  readFileSync("data/retro-reference/native-rules-v1.json", "utf8"),
);
const world = raw.editions[0];

test("all1792 P1 selector states agree with independently decoded firmware tables", () => {
  assert.equal(NATIVE_P1_PROFILE.romSha1, world.romSha1);
  for (const table of world.evolution.historyKindTables)
    for (let cm = 0; cm < 16; cm++)
      for (let dm = 0; dm < 16; dm++) {
        const match = table.rules.find(
          (r: any) =>
            cm >= r.predicate.all[0].value && dm >= r.predicate.all[1].value,
        );
        const actual = selectNativeP1Evolution(table.historyKind, {
          careMistakes: cm,
          missedDisciplineCalls: dm,
        })!;
        assert.equal(actual.characterId, match.outcome.characterId);
        assert.equal(actual.historyKind, match.outcome.historyKind);
        assert.equal(actual.sourceAddress, parseInt(match.sourceWords[0], 16));
      }
});

test("P1 has14 history-distinct routes with immutable cumulative witnesses", () => {
  const routes = listNativeP1HistoryRoutes();
  assert.equal(routes.length, 14);
  assert.deepEqual(
    routes.map((r) => r.id).sort(),
    world.evolution.historyPaths.map((r: any) => r.id).sort(),
  );
  for (const route of routes) {
    assert.equal(route.ordinaryCommandTraceVerified, false);
    const { atTeenCommit: a, atAdultCommit: b } = route.witnessCounters;
    assert.ok(
      b.careMistakes >= a.careMistakes &&
        b.missedDisciplineCalls >= a.missedDisciplineCalls,
    );
    assert.deepEqual(
      route.characters,
      world.evolution.historyPaths.find((r: any) => r.id === route.id)
        .characters,
    );
  }
  assert.ok(
    !routes.some(
      (r) => r.teenHistoryKind === 3 && r.characters.includes("p1.ginjirotchi"),
    ),
  );
});

test("Bill requires earlier type2 commitment; later display discipline cannot select it", () => {
  const counters = { careMistakes: 0, missedDisciplineCalls: 3 };
  assert.equal(selectNativeP1Evolution(1, counters)!.historyKind, 3);
  const eligible = selectNativeP1Evolution(3, counters)!;
  assert.equal(eligible.characterId, "p1.maskutchi");
  assert.equal(eligible.historyKind, 6);
  const ordinary = selectNativeP1Evolution(2, counters)!;
  assert.equal(ordinary.characterId, "p1.maskutchi");
  assert.equal(ordinary.historyKind, 15);
  for (let cm = 0; cm < 16; cm++)
    for (let dm = 0; dm < 16; dm++) {
      assert.equal(
        selectNativeP1Evolution(6, {
          careMistakes: cm,
          missedDisciplineCalls: dm,
        })!.characterId,
        "p1.bill",
      );
    }
  assert.equal(selectNativeP1Evolution(15, counters), null);
});

test("native physiology preserves raw ROM data and the shared Bill vector", () => {
  for (const id of NATIVE_P1_CHARACTERS.slice(1)) {
    const stat = nativeP1Statistics(id);
    const expected = world.nativeStatistics.find(
      (r: any) => r.characterId === id,
    );
    assert.equal(stat.rawHex, expected.rawHex);
    assert.equal(
      stat.lifecycleCountdownAwakeMinutes,
      expected.baseLifecycleCountdownAwakeMinutes,
    );
    assert.equal(
      stat.sicknessCountdownMinutes,
      expected.baseSicknessCountdownMinutes,
    );
  }
  assert.equal(
    nativeP1Statistics("p1.bill").sourceAddress,
    nativeP1Statistics("p1.mametchi").sourceAddress,
  );
  assert.equal(
    nativeP1Statistics("p1.maskutchi").lifecycleCountdownAwakeMinutes,
    2880,
  );
  assert.equal(nativeP1InitialDiscipline("p1.tamatchi", 2), 8);
  assert.equal(nativeP1InitialDiscipline("p1.tamatchi", 3), 0);
});

test("sleep pauses the native countdown; sickness does not; adult expiry is not death", () => {
  let remaining = 60;
  remaining = advanceNativeP1LifecycleCountdown({
    remainingAwakeMinutes: remaining,
    elapsedMinutes: 40,
    isAsleep: false,
    isSick: false,
  }).remainingAwakeMinutes;
  remaining = advanceNativeP1LifecycleCountdown({
    remainingAwakeMinutes: remaining,
    elapsedMinutes: 5,
    isAsleep: true,
    isSick: true,
  }).remainingAwakeMinutes;
  assert.equal(remaining, 20);
  const final = advanceNativeP1LifecycleCountdown({
    remainingAwakeMinutes: remaining,
    elapsedMinutes: 20,
    isAsleep: false,
    isSick: true,
  });
  assert.equal(final.remainingAwakeMinutes, 0);
  assert.equal(final.expired, true);
  assert.equal(
    selectNativeP1Evolution(15, { careMistakes: 0, missedDisciplineCalls: 0 }),
    null,
  );
});

test("care counters saturate, baby mistakes do not count, and scolding changes only display", () => {
  const counters = { careMistakes: 15, missedDisciplineCalls: 14 };
  assert.deepEqual(
    nativeP1CountExpiredCall(counters, "care", "p1.marutchi"),
    counters,
  );
  assert.deepEqual(
    nativeP1CountExpiredCall(counters, "discipline", "p1.marutchi"),
    { careMistakes: 15, missedDisciplineCalls: 15 },
  );
  assert.deepEqual(
    nativeP1CountExpiredCall(counters, "discipline", "p1.babytchi"),
    counters,
  );
  assert.equal(nativeP1Scold(8, false), 8);
  assert.equal(nativeP1Scold(12, true), 15);
  assert.deepEqual(counters, { careMistakes: 15, missedDisciplineCalls: 14 });
});

test("unresolved history bits and invalid clock/counter inputs are never guessed", () => {
  assert.throws(
    () =>
      selectNativeP1Evolution(7, { careMistakes: 0, missedDisciplineCalls: 0 }),
    /Unresolved/,
  );
  assert.throws(
    () =>
      selectNativeP1Evolution(1, {
        careMistakes: 16,
        missedDisciplineCalls: 0,
      }),
    /4-bit/,
  );
  assert.throws(
    () =>
      advanceNativeP1LifecycleCountdown({
        remainingAwakeMinutes: 60,
        elapsedMinutes: -1,
        isAsleep: false,
        isSick: false,
      }),
    /non-negative/,
  );
});

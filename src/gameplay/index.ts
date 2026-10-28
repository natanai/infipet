/** Infipet's deterministic, serializable pocket-pet game. No renderer or wall-clock reads. */
import {
  initialPhysiology,
  observePhysiology,
  physiologyAt,
  validatePhysiology,
  seal,
  PHYSIOLOGY_NEEDS,
  type RecordedPhysiology,
  type RecordedNeedTimeline,
} from "../needs/recorded-physiology";
import { selectV1Branch } from "./reference-profiles";
export {
  REFERENCE_PROFILES,
  V1_BRANCH_SLOTS,
  selectV1Branch,
} from "./reference-profiles";

export const GAME_RULES_VERSION = 3 as const;
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** The exact old-device timings are provisional; see docs/reference-parity.md. */
export const GAME_RULES = Object.freeze({
  id: "infipet-classic-v3",
  eggMs: 5 * MINUTE,
  stageEndHours: [1, 49, 121, 193] as readonly number[],
  callMs: 20 * MINUTE,
  returnGraceMs: 30 * MINUTE,
  hungerMs: HOUR,
  happinessMs: 90 * MINUTE,
  strengthMs: 90 * MINUTE,
  wasteMs: 3 * HOUR,
  sleepHour: 21,
  wakeHour: 7,
});
export type GameStage =
  "egg" | "hatchling" | "infant" | "juvenile" | "adult" | "advanced";
export type GameKind = "training" | "direction" | "numbers";
export type GameChoice = "high" | "low" | "left" | "right" | "higher" | "lower";
export type GameCommand =
  | { type: "feed"; food: "meal" | "snack" | "protein" }
  | { type: "clean" }
  | { type: "medicine" }
  | { type: "lights"; on: boolean }
  | { type: "discipline" }
  | { type: "start-game"; game: GameKind }
  | { type: "choose"; choice: GameChoice }
  | { type: "battle" }
  | { type: "cancel" }
  | { type: "dismiss" };
export type StageMetrics = {
  careMistakes: number;
  training: number;
  battles: number;
  wins: number;
  overfeeds: number;
  sleepDisturbances: number;
  disciplineMistakes: number;
};
export type StageCommitment = {
  id: Exclude<GameStage, "egg">;
  atHour: number;
  care: number;
  training: number;
  battle: number;
  branch: string;
  metrics: StageMetrics;
};
export type GameActivity =
  | {
      kind: GameKind;
      id: string;
      round: number;
      rounds: number;
      score: number;
      targets: number[];
      shownNumbers: number[];
      prompt: string;
      choices: GameChoice[];
      last: string;
    }
  | {
      kind: "battle";
      id: string;
      opponent: string;
      result: "win" | "loss";
      prompt: string;
    }
  | {
      kind: "result";
      id: string;
      game: GameKind;
      won: boolean;
      score: number;
      rounds: number;
      prompt: string;
    };
type Call = { atMs: number; missed: boolean };
/** Existing hourly care evidence, with optional hunger sampling for old save compatibility. */
type CareSample = { hour: number; values: number[]; nutrition?: number };
/** Actual post-event physiology; piecewise held until the next observation.
 * Presence describes the following interval, never an invented care action. */
export type CareObservation = Readonly<{
  atMs: number;
  values: readonly number[];
  nutrition: number;
  presence: "active" | "absent" | "birth";
}>;
export const ANATOMICAL_HISTORY_MS = 365 * DAY;
export const MAX_GAME_TIMESTAMP = 8_640_000_000_000_000 - DAY;
export type CommandRecord = Readonly<{
  id: string;
  atMs: number;
  command: Readonly<GameCommand>;
  accepted: boolean;
}>;
export type GameState = {
  version: typeof GAME_RULES_VERSION;
  rules: typeof GAME_RULES.id;
  seed: string;
  mode: "infant" | "egg";
  clock: {
    startedAtMs: number;
    nowMs: number;
    hatchAtMs: number;
    utcOffsetMinutes: number;
    activeMs: number;
    energyUnits: number;
  };
  stage: GameStage;
  stageCommitments: StageCommitment[];
  advancedChecked: boolean;
  meters: {
    hunger: number;
    happiness: number;
    strength: number;
    energy: number;
    discipline: number;
    weight: number;
  };
  health: {
    sickness: number;
    injury: number;
    hungrySinceMs: number | null;
    sickSinceMs: number | null;
    injurySinceMs: number | null;
    dirtySinceMs: number | null;
  };
  waste: number;
  sleeping: boolean;
  lightsOn: boolean;
  forcedAwakeUntilMs: number | null;
  attention: {
    care: Call | null;
    sleep: Call | null;
    discipline: boolean;
    counted: boolean;
  };
  grace: { remainingActiveMs: number; cause: string; sinceMs: number } | null;
  dead: boolean;
  death: { atMs: number; cause: string } | null;
  activity: GameActivity | null;
  message: string;
  stats: StageMetrics & {
    meals: number;
    snacks: number;
    medicines: number;
    gamesWon: number;
  };
  stageStats: StageMetrics;
  recentBattles: boolean[];
  overfeedReady: boolean;
  numberShown: number;
  schedule: {
    hungerAtMs: number;
    happinessAtMs: number;
    strengthAtMs: number;
    wasteAtMs: number;
    disciplineAtMs: number;
    sleepBoundaryAtMs: number;
  };
  history: { atHour: number; event: string; message: string }[];
  receipts: string[];
  /** Complete first-year history plus bounded postmaturity receipts. IDs never choose random outcomes. */
  commandHistory: CommandRecord[];
  commandSequence?: number;
  physiology?: RecordedPhysiology;
  randomCounters: { refusals: number; games: number; battles: number };
  careSamples: CareSample[];
  /** Absent only in pre-daily saves; unknown historical effects remain unknown. */
  careObservations?: CareObservation[];
};
export type GameOptions = { utcOffsetMinutes?: number };
const STAGES: GameStage[] = [
  "egg",
  "hatchling",
  "infant",
  "juvenile",
  "adult",
  "advanced",
];
const CARE_NEEDS = PHYSIOLOGY_NEEDS;
export const MATURE_COMMAND_LIMIT = 128;
const emptyMetrics = (): StageMetrics => ({
  careMistakes: 0,
  training: 0,
  battles: 0,
  wins: 0,
  overfeeds: 0,
  sleepDisturbances: 0,
  disciplineMistakes: 0,
});
const clamp = (n: number, low = 0, high = 1) =>
  Math.max(low, Math.min(high, n));
const clone = <T>(s: T): T => JSON.parse(JSON.stringify(s)) as T;
const immutableRecord = (record: CommandRecord): CommandRecord =>
  Object.isFrozen(record) && Object.isFrozen(record.command)
    ? record
    : Object.freeze({
        ...record,
        command: Object.freeze({ ...record.command }),
      });
/** Share only immutable records; cloning a long life must not stringify its entire archive per tick. */
function copyGame(s: GameState): GameState {
  return {
    ...clone({
      ...s,
      commandHistory: [],
      receipts: [],
      careSamples: [],
      careObservations: [],
      physiology: undefined,
    }),
    ...(s.physiology ? { physiology: s.physiology } : {}),
    receipts: [...s.receipts],
    commandHistory: [...s.commandHistory],
    careSamples: [...s.careSamples],
    ...(s.careObservations
      ? { careObservations: [...s.careObservations] }
      : { careObservations: undefined }),
  };
}
export function validateGameCommand(value: unknown): GameCommand {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Unknown game command.");
  const c = value as GameCommand;
  const fields: Record<GameCommand["type"], readonly string[]> = {
    feed: ["type", "food"],
    clean: ["type"],
    medicine: ["type"],
    lights: ["type", "on"],
    discipline: ["type"],
    "start-game": ["type", "game"],
    choose: ["type", "choice"],
    battle: ["type"],
    cancel: ["type"],
    dismiss: ["type"],
  };
  if (
    !fields[c.type] ||
    Object.keys(c).some((key) => !fields[c.type].includes(key))
  )
    throw new Error("Unknown game command.");
  if (
    (c.type === "feed" && !["meal", "snack", "protein"].includes(c.food)) ||
    (c.type === "lights" && typeof c.on !== "boolean") ||
    (c.type === "start-game" &&
      !["training", "direction", "numbers"].includes(c.game)) ||
    (c.type === "choose" &&
      !["high", "low", "left", "right", "higher", "lower"].includes(c.choice))
  )
    throw new Error("Invalid game command.");
  return { ...c };
}
function refusesCare(s: GameState): boolean {
  if (!s.attention.discipline || s.meters.discipline >= 2) return false;
  const ordinal = s.randomCounters.refusals++;
  return random(s.seed, `refusal/${ordinal}`) < 0.5;
}
function random(seed: string, key: string): number {
  let h = 2166136261;
  for (const c of seed + "|" + key)
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export const gameAgeHours = (s: GameState) =>
  Math.max(0, (s.clock.nowMs - s.clock.hatchAtMs) / HOUR);
const hourAt = (s: GameState, at = s.clock.nowMs) =>
  Math.max(0, (at - s.clock.hatchAtMs) / HOUR);
function log(s: GameState, event: string, message: string) {
  s.message = message;
  s.history.push({ atHour: hourAt(s), event, message });
  if (s.history.length > 512) s.history.splice(0, s.history.length - 512);
}
function count(s: GameState, key: keyof StageMetrics, amount = 1) {
  s.stats[key] += amount;
  s.stageStats[key] += amount;
}
function localHour(s: GameState, at = s.clock.nowMs) {
  return (((at / HOUR + s.clock.utcOffsetMinutes / 60) % 24) + 24) % 24;
}
function night(s: GameState, at = s.clock.nowMs) {
  const h = localHour(s, at);
  return h >= GAME_RULES.sleepHour || h < GAME_RULES.wakeHour;
}
function nextBoundary(s: GameState, at = s.clock.nowMs) {
  const h = localHour(s, at),
    delta = h < 7 ? 7 - h : h < 21 ? 21 - h : 31 - h;
  return Math.round(at + delta * HOUR);
}
function setSleep(s: GameState) {
  const asleep =
    s.stage !== "egg" &&
    s.stage !== "hatchling" &&
    night(s) &&
    !(s.forcedAwakeUntilMs !== null && s.clock.nowMs < s.forcedAwakeUntilMs);
  if (asleep && !s.sleeping && s.lightsOn)
    s.attention.sleep = { atMs: s.clock.nowMs, missed: false };
  if (!asleep) s.attention.sleep = null;
  s.sleeping = asleep;
  s.schedule.sleepBoundaryAtMs = nextBoundary(s);
}
function careValues(s: GameState) {
  return [
    clamp(
      1 -
        s.health.sickness * 0.35 -
        s.health.injury * 0.25 -
        (s.meters.hunger === 0 ? 0.2 : 0),
    ),
    clamp(0.4 + s.meters.hunger * 0.12 - s.waste * 0.07),
    clamp(
      0.85 -
        s.stageStats.disciplineMistakes * 0.08 -
        s.stageStats.sleepDisturbances * 0.04,
    ),
    clamp((s.meters.energy / 100) * (s.sleeping && s.lightsOn ? 0.6 : 1)),
    clamp(
      0.2 + s.meters.happiness * 0.2 - (s.sleeping && s.lightsOn ? 0.2 : 0),
    ),
    clamp(
      0.2 +
        s.meters.strength * 0.15 +
        Math.min(s.stageStats.training, 16) * 0.0125,
    ),
  ].map((n) => Math.round(n * 1000) / 1000);
}
function sample(
  s: GameState,
  presence: CareObservation["presence"] = "active",
  recordObservation = true,
) {
  if (s.stage === "egg") return;
  const values = careValues(s);
  if (recordObservation) {
    const prior = s.physiology ?? bootstrapPhysiology(s);
    s.physiology = observePhysiology(
      prior,
      { atMs: s.clock.nowMs - s.clock.hatchAtMs, values },
      presence,
    );
  }
  // Only anatomical evidence stops at maturity; current physiology never does.
  if (s.clock.nowMs - s.clock.hatchAtMs > ANATOMICAL_HISTORY_MS) return;
  if (recordObservation) {
    const observed: CareObservation = Object.freeze({
      atMs: s.clock.nowMs,
      values: Object.freeze(values),
      nutrition: s.meters.hunger / 4,
      presence,
    });
    if (!s.careObservations) s.careObservations = [];
    const last = s.careObservations.at(-1);
    if (last?.atMs === observed.atMs)
      s.careObservations[s.careObservations.length - 1] = observed;
    else if (
      !last ||
      last.nutrition !== observed.nutrition ||
      last.presence !== presence ||
      observed.values.some((v, i) => v !== last.values[i])
    )
      s.careObservations.push(observed);
  }
  // Only exact chronological hour boundaries are sampled. A fractional-hour
  // command cannot retroactively change a prior care keyframe.
  if ((s.clock.nowMs - s.clock.hatchAtMs) % HOUR !== 0) return;
  const hour = Math.floor(hourAt(s));
  const nutrition = s.meters.hunger / 4,
    prev = s.careSamples.at(-1);
  if (prev?.hour === hour) {
    Object.freeze(values);
    s.careSamples[s.careSamples.length - 1] = Object.freeze({
      hour,
      values,
      nutrition,
    });
    return;
  }
  if (
    !prev ||
    values.some((n, i) => n !== prev.values[i]) ||
    prev.nutrition !== nutrition
  ) {
    Object.freeze(values);
    s.careSamples.push(Object.freeze({ hour, values, nutrition }));
  }
}
function updateCalls(s: GameState) {
  if (s.stage === "egg" || s.dead) return;
  const empty =
    s.meters.hunger === 0 ||
    s.meters.strength === 0 ||
    s.meters.happiness === 0;
  if (empty && !s.attention.care)
    s.attention.care = { atMs: s.clock.nowMs, missed: false };
  if (!empty) s.attention.care = null;
  if (!s.attention.care && !s.attention.sleep) s.attention.counted = false;
  if (s.meters.hunger === 0 && s.health.hungrySinceMs === null)
    s.health.hungrySinceMs = s.clock.nowMs;
  if (s.meters.hunger > 0) s.health.hungrySinceMs = null;
  if (s.waste >= 4 && s.health.dirtySinceMs === null)
    s.health.dirtySinceMs = s.clock.nowMs;
  if (s.waste < 4) s.health.dirtySinceMs = null;
}
function lethalCause(s: GameState) {
  const now = s.clock.nowMs;
  if (
    s.health.hungrySinceMs !== null &&
    now - s.health.hungrySinceMs >= 8 * HOUR
  )
    return "prolonged hunger";
  if (s.health.sickSinceMs !== null && now - s.health.sickSinceMs >= 12 * HOUR)
    return "untreated sickness";
  if (
    s.health.injurySinceMs !== null &&
    now - s.health.injurySinceMs >= 6 * HOUR
  )
    return "untreated injury";
  return null;
}
function die(s: GameState, cause: string) {
  s.dead = true;
  s.death = { atMs: s.clock.nowMs, cause };
  s.activity = null;
  log(s, "death", `Your pet has died from ${cause}. You can begin a new life.`);
}
function updateHealth(s: GameState, presence: "active" | "absent") {
  if (
    s.health.dirtySinceMs !== null &&
    s.clock.nowMs - s.health.dirtySinceMs >= 3 * HOUR &&
    !s.health.sickness
  ) {
    s.health.sickness =
      1 +
      Math.floor(
        random(s.seed, `sickness/${s.clock.nowMs - s.clock.hatchAtMs}`) * 3,
      );
    s.health.sickSinceMs = s.clock.nowMs;
    log(s, "sickness", "Your pet is sick. Clean its home and give medicine.");
  }
  const cause = lethalCause(s);
  if (!cause) {
    s.grace = null;
    return;
  }
  if (!s.grace) {
    if (presence === "active") {
      die(s, cause);
      return;
    }
    s.grace = {
      remainingActiveMs: GAME_RULES.returnGraceMs,
      cause,
      sinceMs: s.clock.nowMs,
    };
    log(
      s,
      "return-grace",
      "Your pet is critically unwell. You have 30 active minutes to help when you return.",
    );
  }
}
function stageCommit(s: GameState, id: Exclude<GameStage, "egg">) {
  const m = clone(s.stageStats),
    ratio = s.recentBattles.length
      ? s.recentBattles.filter(Boolean).length / s.recentBattles.length
      : 0;
  const care = clamp(1 - m.careMistakes / 8),
    training = clamp(m.training / 48);
  const previous = s.stageCommitments.at(-1)?.branch;
  const branch = selectV1Branch(id, previous, m);
  s.stage = id;
  s.stageCommitments.push({
    id,
    atHour: hourAt(s),
    care,
    training,
    battle: ratio,
    branch,
    metrics: m,
  });
  s.stageStats = emptyMetrics();
  log(
    s,
    "stage",
    `Your pet has reached ${id}. Its growth reflects its care and training.`,
  );
  setSleep(s);
}
function nextStageAt(s: GameState) {
  if (s.stage === "egg") return s.clock.hatchAtMs;
  const index = ["hatchling", "infant", "juvenile", "adult"].indexOf(s.stage);
  return index < 0 || (s.stage === "adult" && s.advancedChecked)
    ? Infinity
    : s.clock.hatchAtMs + GAME_RULES.stageEndHours[index] * HOUR;
}
function applyStage(s: GameState) {
  if (s.stage === "egg") {
    stageCommit(s, "hatchling");
    s.schedule.hungerAtMs = s.clock.nowMs + GAME_RULES.hungerMs;
    s.schedule.happinessAtMs = s.clock.nowMs + GAME_RULES.happinessMs;
    s.schedule.strengthAtMs = s.clock.nowMs + GAME_RULES.strengthMs;
    s.schedule.wasteAtMs = s.clock.nowMs + GAME_RULES.wasteMs;
  } else if (s.stage === "hatchling") stageCommit(s, "infant");
  else if (s.stage === "infant") stageCommit(s, "juvenile");
  else if (s.stage === "juvenile") stageCommit(s, "adult");
  else if (s.stage === "adult") {
    s.advancedChecked = true;
    if (
      s.stats.battles >= 15 &&
      s.recentBattles.length === 15 &&
      s.recentBattles.filter(Boolean).length >= 12
    )
      stageCommit(s, "advanced");
    else
      log(
        s,
        "stage-gate",
        "Adult growth continues. The advanced milestone needed 15 battles and 80% wins in the last 15.",
      );
  }
}
export function createGame(
  seed: string,
  mode: "infant" | "egg",
  startedAt: number,
  options: GameOptions = {},
): GameState {
  if (
    !Number.isSafeInteger(startedAt) ||
    startedAt < 0 ||
    typeof seed !== "string" ||
    !seed.length ||
    !["infant", "egg"].includes(mode)
  )
    throw new Error("Invalid game creation inputs.");
  const offset = options.utcOffsetMinutes ?? 0;
  if (!Number.isInteger(offset) || Math.abs(offset) > 840)
    throw new Error("Invalid clock offset.");
  const hatchAtMs = startedAt + (mode === "egg" ? GAME_RULES.eggMs : 0);
  if (
    !Number.isSafeInteger(hatchAtMs + ANATOMICAL_HISTORY_MS) ||
    hatchAtMs + ANATOMICAL_HISTORY_MS > MAX_GAME_TIMESTAMP
  )
    throw new Error("Game clock exceeds the supported timestamp range.");
  const state: GameState = {
    version: GAME_RULES_VERSION,
    rules: GAME_RULES.id,
    seed,
    mode,
    clock: {
      startedAtMs: startedAt,
      nowMs: startedAt,
      hatchAtMs,
      utcOffsetMinutes: offset,
      activeMs: 0,
      energyUnits: 180_000_000,
    },
    stage: "egg",
    stageCommitments: [],
    advancedChecked: false,
    meters: {
      hunger: 4,
      happiness: 4,
      strength: 4,
      energy: 100,
      discipline: 0,
      weight: 5,
    },
    health: {
      sickness: 0,
      injury: 0,
      hungrySinceMs: null,
      sickSinceMs: null,
      injurySinceMs: null,
      dirtySinceMs: null,
    },
    waste: 0,
    sleeping: false,
    lightsOn: true,
    forcedAwakeUntilMs: null,
    attention: { care: null, sleep: null, discipline: false, counted: false },
    grace: null,
    dead: false,
    death: null,
    activity: null,
    message:
      mode === "egg"
        ? "Your egg will hatch in five minutes."
        : "Your pet is ready for care.",
    stats: {
      ...emptyMetrics(),
      meals: 0,
      snacks: 0,
      medicines: 0,
      gamesWon: 0,
    },
    stageStats: emptyMetrics(),
    recentBattles: [],
    overfeedReady: true,
    numberShown: 5,
    schedule: {
      hungerAtMs: hatchAtMs + HOUR,
      happinessAtMs: hatchAtMs + 90 * MINUTE,
      strengthAtMs: hatchAtMs + 90 * MINUTE,
      wasteAtMs: hatchAtMs + 3 * HOUR,
      disciplineAtMs: hatchAtMs + 5 * HOUR,
      sleepBoundaryAtMs: startedAt + DAY,
    },
    history: [],
    receipts: [],
    commandHistory: [],
    commandSequence: 0,
    randomCounters: { refusals: 0, games: 0, battles: 0 },
    careSamples: [],
    careObservations: [],
  };
  state.schedule.sleepBoundaryAtMs = nextBoundary(state);
  if (mode === "infant") {
    applyStage(state);
    sample(state, "birth");
  }
  return state;
}
function dueEvents(
  s: GameState,
  presence: "active" | "absent",
  recordObservation = true,
) {
  const now = s.clock.nowMs;
  if (nextStageAt(s) <= now) applyStage(s);
  if (s.schedule.sleepBoundaryAtMs <= now) {
    s.forcedAwakeUntilMs = null;
    setSleep(s);
  }
  const timer = (
    key: "hungerAtMs" | "happinessAtMs" | "strengthAtMs" | "wasteAtMs",
    duration: number,
    effect: () => void,
  ) => {
    if (s.schedule[key] <= now) {
      if (!s.sleeping && s.stage !== "egg") effect();
      s.schedule[key] += duration;
    }
  };
  timer("hungerAtMs", GAME_RULES.hungerMs, () => {
    if (s.meters.hunger > 0) {
      s.meters.hunger--;
      s.overfeedReady = true;
    }
  });
  timer("happinessAtMs", GAME_RULES.happinessMs, () => {
    s.meters.happiness = Math.max(0, s.meters.happiness - 1);
  });
  timer("strengthAtMs", GAME_RULES.strengthMs, () => {
    s.meters.strength = Math.max(0, s.meters.strength - 1);
  });
  timer("wasteAtMs", GAME_RULES.wasteMs, () => {
    s.waste = Math.min(4, s.waste + 1);
  });
  if (s.schedule.disciplineAtMs <= now) {
    if (
      !s.sleeping &&
      s.stage !== "egg" &&
      s.meters.hunger > 0 &&
      s.meters.happiness > 0
    )
      s.attention.discipline = true;
    s.schedule.disciplineAtMs += 5 * HOUR;
  }
  updateCalls(s);
  let newMistake = false;
  for (const key of ["care", "sleep"] as const) {
    const call = s.attention[key];
    if (call && !call.missed && now >= call.atMs + GAME_RULES.callMs) {
      // Overlapping unresolved reasons are one attention episode.
      if (!s.attention.counted) newMistake = true;
      call.missed = true;
    }
  }
  if (newMistake) {
    s.attention.counted = true;
    count(s, "careMistakes");
    log(s, "care-mistake", "A care call went unanswered.");
  }
  updateHealth(s, presence);
  sample(s, presence, recordObservation);
}
function nextEvent(s: GameState) {
  const dates = [nextStageAt(s), ...Object.values(s.schedule)];
  for (const call of [s.attention.care, s.attention.sleep])
    if (call && !call.missed) dates.push(call.atMs + GAME_RULES.callMs);
  if (s.health.dirtySinceMs !== null && !s.health.sickness)
    dates.push(s.health.dirtySinceMs + 3 * HOUR);
  if (!s.grace) {
    if (s.health.hungrySinceMs !== null)
      dates.push(s.health.hungrySinceMs + 8 * HOUR);
    if (s.health.sickSinceMs !== null)
      dates.push(s.health.sickSinceMs + 12 * HOUR);
    if (s.health.injurySinceMs !== null)
      dates.push(s.health.injurySinceMs + 6 * HOUR);
  }
  return Math.min(...dates.filter((n) => n > s.clock.nowMs));
}
export function advanceGame(
  input: GameState,
  toMs: number,
  presence: "active" | "absent" = "active",
): GameState {
  if (
    !Number.isSafeInteger(toMs) ||
    toMs < input.clock.nowMs ||
    toMs > MAX_GAME_TIMESTAMP ||
    !["active", "absent"].includes(presence)
  )
    throw new Error("Invalid game clock.");
  const s = copyGame(input);
  if (s.stage !== "egg" && !s.physiology) {
    s.physiology = bootstrapPhysiology(s);
    sample(s, s.careObservations?.at(-1)?.presence ?? presence);
  }
  if (toMs === s.clock.nowMs || s.dead) return s;
  if (s.physiology?.presence !== presence) sample(s, presence);
  if (presence === "absent" && s.activity && "targets" in s.activity) {
    s.activity = null;
    log(
      s,
      "game-abandoned",
      "Your unfinished game ended while you were away. No game reward was awarded.",
    );
  }
  // Event boundaries, rather than render ticks, make batched and incremental replay equal.
  while (s.clock.nowMs < toMs && !s.dead) {
    const eventAt = nextEvent(s);
    let at = Math.min(toMs, eventAt);
    if (presence === "active" && s.grace)
      at = Math.min(at, s.clock.nowMs + s.grace.remainingActiveMs);
    const elapsed = at - s.clock.nowMs;
    if (presence === "active") {
      s.clock.activeMs += elapsed;
      if (s.grace)
        s.grace.remainingActiveMs = Math.max(
          0,
          s.grace.remainingActiveMs - elapsed,
        );
    }
    s.clock.energyUnits = clamp(
      s.clock.energyUnits + elapsed * (s.sleeping ? 6 : -1),
      0,
      180_000_000,
    );
    s.meters.energy = s.clock.energyUnits / 1_800_000;
    s.clock.nowMs = at;
    if (s.grace?.remainingActiveMs === 0) {
      const cause = lethalCause(s);
      if (cause) {
        die(s, cause);
        break;
      }
      s.grace = null;
    }
    // A render/query cutoff is not a physiological observation. Exact timer
    // boundaries, actual commands and presence transitions alone create data.
    dueEvents(s, presence, at === eventAt);
  }
  return s;
}
function disturbSleep(s: GameState) {
  if (!s.sleeping) return;
  count(s, "sleepDisturbances");
  s.forcedAwakeUntilMs = s.schedule.sleepBoundaryAtMs;
  s.sleeping = false;
  s.attention.sleep = null;
}
function promptActivity(a: Extract<GameActivity, { targets: number[] }>) {
  if (a.kind === "training") {
    a.prompt = `Training ${a.round + 1}/5: attack high or low.`;
    a.choices = ["high", "low"];
  } else if (a.kind === "direction") {
    a.prompt = `Direction ${a.round + 1}/5: which way will your pet turn?`;
    a.choices = ["left", "right"];
  } else {
    a.prompt = `Number ${a.round + 1}/5: is the next number higher or lower than ${a.shownNumbers[a.round]}?`;
    a.choices = ["higher", "lower"];
  }
}
export function commandGame(
  input: GameState,
  command: GameCommand,
  atMs: number,
  stableId: string,
): GameState {
  if (typeof stableId !== "string" || !stableId.length || stableId.length > 128)
    throw new Error("A stable command ID is required.");
  command = validateGameCommand(command);
  if (input.receipts.includes(stableId)) return copyGame(input);
  const s = advanceGame(input, atMs, "active");
  const record = (accepted: boolean) => {
    s.commandSequence = (s.commandSequence ?? s.commandHistory.length) + 1;
    if (!Number.isSafeInteger(s.commandSequence))
      throw new RangeError("Command sequence exhausted.");
    s.receipts.push(stableId);
    s.commandHistory.push(
      immutableRecord({ id: stableId, atMs: s.clock.nowMs, command, accepted }),
    );
    const horizon = s.clock.hatchAtMs + ANATOMICAL_HISTORY_MS;
    if (s.clock.nowMs >= horizon) {
      let lo = 0,
        hi = s.commandHistory.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (s.commandHistory[mid].atMs < horizon) lo = mid + 1;
        else hi = mid;
      }
      const firstMature = lo;
      if (s.commandHistory.length - firstMature > MATURE_COMMAND_LIMIT) {
        const count =
          s.commandHistory.length - firstMature - MATURE_COMMAND_LIMIT;
        s.commandHistory.splice(firstMature, count);
        s.receipts.splice(firstMature, count);
      }
    }
    return s;
  };
  if (s.dead) return record(false);
  if (s.stage === "egg") {
    s.message = "Your egg is still incubating.";
    return record(false);
  }
  const accept = () => {
    updateCalls(s);
    updateHealth(s, "active");
    sample(s);
    return record(true);
  };
  if (command.type === "cancel" || command.type === "dismiss") {
    s.activity = null;
    log(s, "activity-close", "Back to your pet.");
    return accept();
  }
  if (s.activity && command.type !== "choose") {
    s.message = "Finish or close the current game first.";
    return record(false);
  }
  if (command.type === "feed") {
    disturbSleep(s);
    if (!["meal", "snack", "protein"].includes(command.food))
      throw new Error("Unknown food.");
    if (refusesCare(s)) {
      log(
        s,
        "refusal",
        "Your pet is refusing care. Check whether it needs discipline.",
      );
      return accept();
    }
    if (command.food === "meal") {
      if (s.meters.hunger === 4) {
        if (s.overfeedReady) {
          count(s, "overfeeds");
          s.overfeedReady = false;
        }
        log(s, "refusal", "Your pet is full and refuses another meal.");
      } else {
        s.meters.hunger++;
        s.meters.weight++;
        s.stats.meals++;
        log(s, "meal", "Your pet ate a meal.");
      }
    } else if (command.food === "snack") {
      s.meters.happiness = Math.min(4, s.meters.happiness + 1);
      s.meters.weight += 2;
      s.stats.snacks++;
      log(s, "snack", "A snack cheered your pet up.");
    } else {
      s.meters.strength = Math.min(4, s.meters.strength + 1);
      s.meters.weight += 2;
      log(s, "protein", "Protein restored a strength heart.");
    }
  } else if (command.type === "clean") {
    s.waste = 0;
    s.health.dirtySinceMs = null;
    log(s, "clean", "Your pet's home is clean.");
  } else if (command.type === "medicine") {
    if (s.health.sickness) {
      s.health.sickness--;
      if (!s.health.sickness) s.health.sickSinceMs = null;
      s.stats.medicines++;
      log(
        s,
        "medicine",
        s.health.sickness
          ? "Your pet is improving but still needs medicine."
          : "The medicine treated your pet's sickness.",
      );
    } else if (s.health.injury) {
      s.health.injury = 0;
      s.health.injurySinceMs = null;
      s.stats.medicines++;
      log(s, "medicine", "The medicine treated your pet's injury.");
    } else
      log(s, "medicine-refusal", "Your pet is healthy and refuses medicine.");
  } else if (command.type === "lights") {
    s.lightsOn = command.on;
    if (!command.on) {
      s.attention.sleep = null;
      // Returning to a dark bedroom ends a forced waking episode during scheduled sleep.
      s.forcedAwakeUntilMs = null;
      setSleep(s);
    }
    log(s, "lights", command.on ? "Lights on." : "Lights off.");
  } else if (command.type === "discipline") {
    if (s.attention.discipline) {
      s.meters.discipline = Math.min(4, s.meters.discipline + 1);
      s.attention.discipline = false;
      log(s, "discipline", "Your pet understood. Discipline increased.");
    } else {
      count(s, "disciplineMistakes");
      s.meters.happiness = Math.max(0, s.meters.happiness - 1);
      log(
        s,
        "discipline-mistake",
        "Your pet did not need discipline and feels upset.",
      );
    }
  } else if (command.type === "start-game") {
    if (!["training", "direction", "numbers"].includes(command.game))
      throw new Error("Unknown game.");
    if (s.health.sickness || s.health.injury || s.meters.energy < 5) {
      s.message = "Your pet needs rest or medicine before playing.";
      return record(false);
    }
    if (refusesCare(s)) {
      log(
        s,
        "refusal",
        "Your pet refuses to play. Check whether it needs discipline.",
      );
      return accept();
    }
    disturbSleep(s);
    if (command.game === "training") count(s, "training");
    const ordinal = s.randomCounters.games++;
    const randomKey = `games/${ordinal}/${command.game}`;
    const targets = Array.from({ length: 5 }, (_, i) =>
      Math.floor(random(s.seed, `${randomKey}/target/${i}`) * 2),
    );
    const shownNumbers: number[] = [];
    let shown = s.numberShown;
    for (let i = 0; i < 5; i++) {
      shownNumbers.push(shown);
      // Vintage P2 uses 1..9 and carries the second number to the next round.
      // Equal numbers are excluded by an explicit Infipet tie policy.
      const raw =
        1 + Math.floor(random(s.seed, `${randomKey}/number/${i}`) * 8);
      const next = raw >= shown ? raw + 1 : raw;
      if (command.game === "numbers") targets[i] = next > shown ? 0 : 1;
      shown = next;
    }
    if (command.game === "numbers") shownNumbers.push(shown);
    const activity = {
      kind: command.game,
      id: `game/${ordinal}`,
      round: 0,
      rounds: 5,
      score: 0,
      targets,
      shownNumbers,
      prompt: "",
      choices: [] as GameChoice[],
      last: "",
    };
    promptActivity(activity);
    s.activity = activity;
    s.clock.energyUnits = Math.max(0, s.clock.energyUnits - 3_600_000);
    s.meters.energy = s.clock.energyUnits / 1_800_000;
    log(s, "game-start", activity.prompt);
  } else if (command.type === "choose") {
    const a = s.activity;
    if (!a || !("targets" in a) || !a.choices.includes(command.choice)) {
      s.message = "Choose an available game answer.";
      return record(false);
    }
    const correct = command.choice === a.choices[a.targets[a.round]];
    if (correct) a.score++;
    a.last =
      a.kind === "numbers"
        ? `The next number was ${a.shownNumbers[a.round + 1]}. ${correct ? "Correct!" : "Miss!"}`
        : correct
          ? "Correct!"
          : "Miss!";
    if (a.kind === "numbers") s.numberShown = a.shownNumbers[a.round + 1];
    a.round++;
    if (a.round >= a.rounds) {
      const won = a.score >= 3;
      s.meters.weight = Math.max(5, s.meters.weight - 1);
      if (won) {
        s.stats.gamesWon++;
        s.meters.happiness = Math.min(4, s.meters.happiness + 1);
        if (a.kind === "training")
          s.meters.strength = Math.min(4, s.meters.strength + 1);
      }
      s.activity = {
        kind: "result",
        id: a.id,
        game: a.kind,
        won,
        score: a.score,
        rounds: a.rounds,
        prompt: `${a.last} ${won ? "You won" : "Keep practicing"}: ${a.score}/${a.rounds}.`,
      };
      log(s, "game-result", s.activity.prompt);
    } else {
      promptActivity(a);
      s.message = `${a.last} ${a.prompt}`;
    }
  } else if (command.type === "battle") {
    if (!["juvenile", "adult", "advanced"].includes(s.stage)) {
      s.message = "Battles unlock at the juvenile stage.";
      return record(false);
    }
    if (
      s.health.sickness ||
      s.health.injury ||
      s.meters.energy < 10 ||
      s.meters.hunger === 0
    ) {
      s.message = "Your pet needs food, rest or medicine before battling.";
      return record(false);
    }
    disturbSleep(s);
    const ordinal = s.randomCounters.battles++;
    const randomKey = `battles/${ordinal}`;
    const opponent = ["Mossling", "Pebbleback", "Cloudfin", "Emberbud"][
      Math.floor(random(s.seed, `${randomKey}/opponent`) * 4)
    ];
    const chance = clamp(
      0.35 +
        s.meters.strength * 0.075 +
        Math.min(s.stageStats.training, 16) * 0.0125 +
        s.meters.discipline * 0.025,
      0.15,
      0.9,
    );
    const won = random(s.seed, `${randomKey}/battle`) < chance;
    count(s, "battles");
    if (won) count(s, "wins");
    s.recentBattles.push(won);
    if (s.recentBattles.length > 15) s.recentBattles.shift();
    s.clock.energyUnits = Math.max(0, s.clock.energyUnits - 18_000_000);
    s.meters.energy = s.clock.energyUnits / 1_800_000;
    if (won) s.meters.happiness = Math.min(4, s.meters.happiness + 1);
    if (random(s.seed, `${randomKey}/injury`) < (won ? 0.1 : 0.2)) {
      s.health.injury = 1;
      s.health.injurySinceMs = s.clock.nowMs;
    }
    s.activity = {
      kind: "battle",
      id: `battle/${ordinal}`,
      opponent,
      result: won ? "win" : "loss",
      prompt: `${won ? "Victory" : "Defeat"} against ${opponent}.${s.health.injury ? " Your pet was injured; give medicine." : ""}`,
    };
    log(s, "battle", s.activity.prompt);
  } else throw new Error("Unknown game command.");
  s.meters.weight = Math.min(999, s.meters.weight);
  return accept();
}
/** Gameplay-derived care is separate from the player's manually authored Lab timeline. */
function physiologicalHistory(s: GameState) {
  return s.careObservations?.length
    ? s.careObservations.map((p) => ({
        atMs: p.atMs - s.clock.hatchAtMs,
        values: p.values,
      }))
    : s.careSamples.map((p) => ({ atMs: p.hour * HOUR, values: p.values }));
}
/** Migrate only actual recorded evidence. Unknown postmaturity history is labeled,
 * never synthesized from command receipts or presumed successful care. */
function bootstrapPhysiology(s: GameState): RecordedPhysiology {
  let model = initialPhysiology();
  const history = physiologicalHistory(s);
  for (const p of history) model = observePhysiology(model, p, "active");
  const end = history.at(-1)?.atMs ?? 0,
    now = Math.max(0, s.clock.nowMs - s.clock.hatchAtMs);
  if (now > ANATOMICAL_HISTORY_MS && now > end)
    model = seal({ ...model, unknownInterval: { fromMs: end, toMs: now } });
  return model;
}
export function deriveCareTimeline(s: GameState): RecordedNeedTimeline {
  let model = s.physiology ?? bootstrapPhysiology(s);
  if (!s.physiology && s.stage !== "egg")
    model = observePhysiology(
      model,
      { atMs: s.clock.nowMs - s.clock.hatchAtMs, values: careValues(s) },
      "active",
    );
  return {
    kind: "recorded-physiology-v1",
    model,
    history: physiologicalHistory(s),
  };
}
export function careAt(
  s: GameState,
  developmentalHour: number,
): Record<string, number> {
  const state = physiologyAt(
    deriveCareTimeline(s),
    Math.max(0, developmentalHour * HOUR),
  );
  return Object.fromEntries(CARE_NEEDS.map((id, i) => [id, state.raw[i]]));
}
export function deriveDevelopmentContext(s: GameState) {
  return {
    hatchAtHours: (s.clock.hatchAtMs - s.clock.startedAtMs) / HOUR,
    stagePoints: s.stageCommitments.map(
      ({ id, atHour, care, training, battle }) => ({
        id,
        atHour,
        care,
        training,
        battle,
      }),
    ),
    stageEndHours: [...GAME_RULES.stageEndHours],
  };
}
export function validateGameState(value: unknown): GameState {
  if (!value || typeof value !== "object")
    throw new Error("Invalid game state.");
  const s = value as GameState;
  const finite = (n: unknown, low = 0, high = Number.MAX_SAFE_INTEGER) =>
    typeof n === "number" && Number.isFinite(n) && n >= low && n <= high;
  const integer = (n: unknown, low = 0, high = Number.MAX_SAFE_INTEGER) =>
    finite(n, low, high) && Number.isSafeInteger(n);
  const keys = (object: unknown, allowed: string[]) => {
    if (
      !object ||
      typeof object !== "object" ||
      Array.isArray(object) ||
      Object.keys(object).some((k) => !allowed.includes(k))
    )
      throw new Error("Unknown game state field.");
  };
  keys(s, [
    "version",
    "rules",
    "seed",
    "mode",
    "clock",
    "stage",
    "stageCommitments",
    "advancedChecked",
    "meters",
    "health",
    "waste",
    "sleeping",
    "lightsOn",
    "forcedAwakeUntilMs",
    "attention",
    "grace",
    "dead",
    "death",
    "activity",
    "message",
    "stats",
    "stageStats",
    "recentBattles",
    "overfeedReady",
    "numberShown",
    "schedule",
    "history",
    "receipts",
    "commandHistory",
    "randomCounters",
    "careSamples",
    "careObservations",
    "physiology",
    "commandSequence",
  ]);
  if (
    s.version !== GAME_RULES_VERSION ||
    s.rules !== GAME_RULES.id ||
    typeof s.seed !== "string" ||
    !s.seed.length ||
    s.seed.length > 256 ||
    !["infant", "egg"].includes(s.mode) ||
    !STAGES.includes(s.stage)
  )
    throw new Error("Unsupported game rules or stage.");
  if (
    !s.clock ||
    !integer(s.clock.startedAtMs) ||
    !integer(s.clock.nowMs, s.clock.startedAtMs, MAX_GAME_TIMESTAMP) ||
    !integer(s.clock.hatchAtMs, s.clock.startedAtMs) ||
    !integer(s.clock.utcOffsetMinutes, -840, 840) ||
    !finite(s.clock.activeMs) ||
    !integer(s.clock.energyUnits, 0, 180_000_000) ||
    s.clock.hatchAtMs !==
      s.clock.startedAtMs + (s.mode === "egg" ? GAME_RULES.eggMs : 0)
  )
    throw new Error("Invalid game clock.");
  if (s.clock.activeMs > s.clock.nowMs - s.clock.startedAtMs)
    throw new Error("Invalid active time.");
  keys(s.clock, [
    "startedAtMs",
    "nowMs",
    "hatchAtMs",
    "utcOffsetMinutes",
    "activeMs",
    "energyUnits",
  ]);
  if (
    !s.meters ||
    !["hunger", "happiness", "strength", "discipline"].every((k) =>
      integer(s.meters[k as keyof typeof s.meters], 0, 4),
    ) ||
    !finite(s.meters.energy, 0, 100) ||
    !integer(s.meters.weight, 5, 999) ||
    !integer(s.waste, 0, 4)
  )
    throw new Error("Invalid game meters.");
  keys(s.meters, [
    "hunger",
    "happiness",
    "strength",
    "energy",
    "discipline",
    "weight",
  ]);
  if (s.meters.energy !== s.clock.energyUnits / 1_800_000)
    throw new Error("Inconsistent energy state.");
  if (
    !s.health ||
    !integer(s.health.sickness, 0, 3) ||
    !integer(s.health.injury, 0, 1) ||
    !["hungrySinceMs", "sickSinceMs", "injurySinceMs", "dirtySinceMs"].every(
      (k) =>
        s.health[k as keyof typeof s.health] === null ||
        integer(s.health[k as keyof typeof s.health], 0, s.clock.nowMs),
    )
  )
    throw new Error("Invalid game health.");
  keys(s.health, [
    "sickness",
    "injury",
    "hungrySinceMs",
    "sickSinceMs",
    "injurySinceMs",
    "dirtySinceMs",
  ]);
  if (
    !!s.health.sickness !== (s.health.sickSinceMs !== null) ||
    !!s.health.injury !== (s.health.injurySinceMs !== null)
  )
    throw new Error("Inconsistent illness state.");
  if (
    ![s.sleeping, s.lightsOn, s.dead, s.advancedChecked, s.overfeedReady].every(
      (v) => typeof v === "boolean",
    ) ||
    (s.forcedAwakeUntilMs !== null && !integer(s.forcedAwakeUntilMs))
  )
    throw new Error("Invalid game flags.");
  if (
    !s.attention ||
    typeof s.attention.discipline !== "boolean" ||
    typeof s.attention.counted !== "boolean"
  )
    throw new Error("Invalid attention state.");
  keys(s.attention, ["care", "sleep", "discipline", "counted"]);
  for (const call of [s.attention.care, s.attention.sleep])
    if (call !== null) {
      if (
        !call ||
        !integer(call.atMs, 0, s.clock.nowMs) ||
        typeof call.missed !== "boolean"
      )
        throw new Error("Invalid care call.");
      keys(call, ["atMs", "missed"]);
    }
  if (
    s.grace !== null &&
    (!s.grace ||
      !integer(s.grace.remainingActiveMs, 0, GAME_RULES.returnGraceMs) ||
      !integer(s.grace.sinceMs, 0, s.clock.nowMs) ||
      typeof s.grace.cause !== "string")
  )
    throw new Error("Invalid return grace.");
  if (s.grace) keys(s.grace, ["remainingActiveMs", "cause", "sinceMs"]);
  if (
    (s.dead && !s.death) ||
    (!s.dead && s.death) ||
    (s.death &&
      (!integer(s.death.atMs, 0, s.clock.nowMs) ||
        typeof s.death.cause !== "string"))
  )
    throw new Error("Invalid death state.");
  if (s.death) keys(s.death, ["atMs", "cause"]);
  for (const metrics of [s.stats, s.stageStats])
    if (
      !metrics ||
      !Object.keys(emptyMetrics()).every((k) =>
        integer(metrics[k as keyof StageMetrics]),
      )
    )
      throw new Error("Invalid game counters.");
  keys(s.stats, [
    ...Object.keys(emptyMetrics()),
    "meals",
    "snacks",
    "medicines",
    "gamesWon",
  ]);
  keys(s.stageStats, Object.keys(emptyMetrics()));
  if (
    !["meals", "snacks", "medicines", "gamesWon"].every((k) =>
      integer(s.stats[k as keyof typeof s.stats]),
    )
  )
    throw new Error("Invalid game totals.");
  if (
    !s.schedule ||
    ![
      "hungerAtMs",
      "happinessAtMs",
      "strengthAtMs",
      "wasteAtMs",
      "disciplineAtMs",
      "sleepBoundaryAtMs",
    ].every((k) => integer(s.schedule[k as keyof typeof s.schedule]))
  )
    throw new Error("Invalid game schedule.");
  keys(s.schedule, [
    "hungerAtMs",
    "happinessAtMs",
    "strengthAtMs",
    "wasteAtMs",
    "disciplineAtMs",
    "sleepBoundaryAtMs",
  ]);
  if (
    !Array.isArray(s.stageCommitments) ||
    s.stageCommitments.length > 5 ||
    !s.stageCommitments.every(
      (p, i) =>
        p &&
        STAGES.includes(p.id) &&
        p.id !== ("egg" as GameStage) &&
        finite(p.atHour, 0, gameAgeHours(s)) &&
        (i === 0 || p.atHour >= s.stageCommitments[i - 1].atHour) &&
        [p.care, p.training, p.battle].every((n) => finite(n, 0, 1)) &&
        typeof p.branch === "string" &&
        p.metrics &&
        Object.keys(emptyMetrics()).every((k) =>
          integer(p.metrics[k as keyof StageMetrics]),
        ),
    )
  )
    throw new Error("Invalid stage history.");
  s.stageCommitments.forEach((p, i) => {
    keys(p, [
      "id",
      "atHour",
      "care",
      "training",
      "battle",
      "branch",
      "metrics",
    ]);
    keys(p.metrics, Object.keys(emptyMetrics()));
    if (
      p.id !== STAGES[i + 1] ||
      p.atHour !== [0, ...GAME_RULES.stageEndHours][i]
    )
      throw new Error("Inconsistent stage commitment.");
  });
  if (s.stage !== (s.stageCommitments.at(-1)?.id ?? "egg"))
    throw new Error("Inconsistent current stage.");
  const stageForTime = (atMs: number): GameStage => {
    const age = (atMs - s.clock.hatchAtMs) / HOUR;
    return age < 0
      ? "egg"
      : age < 1
        ? "hatchling"
        : age < 49
          ? "infant"
          : age < 121
            ? "juvenile"
            : "adult";
  };
  const expectedStage = stageForTime(s.clock.nowMs);
  const previousStage = s.dead
    ? stageForTime(s.clock.nowMs - 1)
    : expectedStage;
  if (s.stage === "advanced") {
    if (gameAgeHours(s) < 193 || !s.advancedChecked)
      throw new Error("Premature advanced stage.");
  } else if (s.stage !== expectedStage && s.stage !== previousStage)
    throw new Error("Stale game stage.");
  if (gameAgeHours(s) < 193 && s.advancedChecked)
    throw new Error("Premature advanced decision.");
  if (
    gameAgeHours(s) >= 193 &&
    !s.advancedChecked &&
    !(s.dead && gameAgeHours(s) === 193)
  )
    throw new Error("Missing advanced decision.");
  if (!s.dead && Object.values(s.schedule).some((at) => at <= s.clock.nowMs))
    throw new Error("Stale game schedule.");
  if (s.dead && (s.death?.atMs !== s.clock.nowMs || s.activity !== null))
    throw new Error("Inconsistent terminal clock.");
  if (
    !Array.isArray(s.recentBattles) ||
    s.recentBattles.length > 15 ||
    !s.recentBattles.every((n) => typeof n === "boolean")
  )
    throw new Error("Invalid battle history.");
  if (
    !Array.isArray(s.receipts) ||
    !s.receipts.every(
      (n) => typeof n === "string" && n.length > 0 && n.length <= 128,
    ) ||
    new Set(s.receipts).size !== s.receipts.length
  )
    throw new Error("Invalid command receipts.");
  keys(s.randomCounters, ["refusals", "games", "battles"]);
  if (
    !s.randomCounters ||
    !Object.values(s.randomCounters).every((n) => integer(n)) ||
    s.randomCounters.battles !== s.stats.battles ||
    s.randomCounters.games < Math.max(s.stats.training, s.stats.gamesWon)
  )
    throw new Error("Invalid random event counters.");
  if (
    !Array.isArray(s.commandHistory) ||
    s.commandHistory.length !== s.receipts.length
  )
    throw new Error("Incomplete command history.");
  if (
    s.commandSequence !== undefined &&
    !integer(s.commandSequence, s.commandHistory.length)
  )
    throw new Error("Invalid command sequence.");
  if (s.physiology !== undefined)
    validatePhysiology(
      s.physiology,
      Math.max(0, s.clock.nowMs - s.clock.hatchAtMs),
    );
  s.commandHistory.forEach((entry, i) => {
    keys(entry, ["id", "atMs", "command", "accepted"]);
    if (
      entry.id !== s.receipts[i] ||
      typeof entry.accepted !== "boolean" ||
      !integer(
        entry.atMs,
        i ? s.commandHistory[i - 1].atMs : s.clock.startedAtMs,
        s.clock.nowMs,
      )
    )
      throw new Error("Invalid command history.");
    validateGameCommand(entry.command);
  });
  if (
    !Array.isArray(s.history) ||
    s.history.length > 512 ||
    !s.history.every(
      (p) =>
        p &&
        finite(p.atHour, 0, gameAgeHours(s)) &&
        typeof p.event === "string" &&
        p.event.length < 100 &&
        typeof p.message === "string" &&
        p.message.length < 1000,
    )
  )
    throw new Error("Invalid game history.");
  s.history.forEach((p) => keys(p, ["atHour", "event", "message"]));
  if (!integer(s.numberShown, 1, 9))
    throw new Error("Invalid number game history.");
  if (
    !Array.isArray(s.careSamples) ||
    s.careSamples.length > 8761 ||
    !s.careSamples.every(
      (p, i) =>
        p &&
        integer(p.hour, 0, Math.min(8760, Math.floor(gameAgeHours(s)))) &&
        (i === 0 || p.hour > s.careSamples[i - 1].hour) &&
        Array.isArray(p.values) &&
        p.values.length === 6 &&
        p.values.every((n) => finite(n, 0, 1)) &&
        (p.nutrition === undefined || finite(p.nutrition, 0, 1)),
    )
  )
    throw new Error("Invalid derived care history.");
  s.careSamples.forEach((p) => keys(p, ["hour", "values", "nutrition"]));
  if (s.careObservations !== undefined) {
    if (!Array.isArray(s.careObservations))
      throw new Error("Invalid care observations.");
    s.careObservations.forEach((o, i) => {
      keys(o, ["atMs", "values", "nutrition", "presence"]);
      if (
        !integer(
          o.atMs,
          s.clock.hatchAtMs,
          Math.min(s.clock.nowMs, s.clock.hatchAtMs + ANATOMICAL_HISTORY_MS),
        ) ||
        (i > 0 && o.atMs <= s.careObservations![i - 1].atMs) ||
        !Array.isArray(o.values) ||
        o.values.length !== 6 ||
        !o.values.every((v) => finite(v, 0, 1)) ||
        !finite(o.nutrition, 0, 1) ||
        !["birth", "active", "absent"].includes(o.presence)
      )
        throw new Error("Invalid care observation chronology.");
    });
  }
  if (typeof s.message !== "string" || s.message.length > 1000)
    throw new Error("Invalid game message.");
  if (s.activity !== null) {
    const a = s.activity;
    if (
      !a ||
      typeof a.id !== "string" ||
      a.id.length > 128 ||
      typeof a.prompt !== "string" ||
      a.prompt.length > 1000
    )
      throw new Error("Invalid activity.");
    keys(
      a,
      a.kind === "battle"
        ? ["kind", "id", "opponent", "result", "prompt"]
        : a.kind === "result"
          ? ["kind", "id", "game", "won", "score", "rounds", "prompt"]
          : [
              "kind",
              "id",
              "round",
              "rounds",
              "score",
              "targets",
              "shownNumbers",
              "prompt",
              "choices",
              "last",
            ],
    );
    if (a.kind === "battle") {
      if (
        !["win", "loss"].includes(a.result) ||
        typeof a.opponent !== "string" ||
        a.opponent.length > 100
      )
        throw new Error("Invalid battle.");
    } else if (a.kind === "result") {
      if (
        !["training", "direction", "numbers"].includes(a.game) ||
        typeof a.won !== "boolean" ||
        !integer(a.score, 0, 5) ||
        a.rounds !== 5
      )
        throw new Error("Invalid game result.");
    } else if (
      !["training", "direction", "numbers"].includes(a.kind) ||
      a.rounds !== 5 ||
      !integer(a.round, 0, 4) ||
      !integer(a.score, 0, a.round) ||
      !Array.isArray(a.targets) ||
      a.targets.length !== 5 ||
      !a.targets.every((n) => integer(n, 0, 1)) ||
      !Array.isArray(a.shownNumbers) ||
      a.shownNumbers.length !== (a.kind === "numbers" ? 6 : 5) ||
      !a.shownNumbers.every((n) => integer(n, 1, 9)) ||
      !Array.isArray(a.choices) ||
      a.choices.length !== 2 ||
      !a.choices.every((c) =>
        ["high", "low", "left", "right", "higher", "lower"].includes(c),
      ) ||
      typeof a.last !== "string"
    )
      throw new Error("Invalid minigame.");
    if ("targets" in a) {
      const choices =
        a.kind === "training"
          ? ["high", "low"]
          : a.kind === "direction"
            ? ["left", "right"]
            : ["higher", "lower"];
      if (a.choices.some((v, i) => v !== choices[i]))
        throw new Error("Invalid minigame choices.");
      if (
        a.kind === "numbers" &&
        a.targets.some(
          (v, i) =>
            a.shownNumbers[i] === a.shownNumbers[i + 1] ||
            v !== (a.shownNumbers[i + 1] > a.shownNumbers[i] ? 0 : 1),
        )
      )
        throw new Error("Invalid number sequence.");
    }
  }
  const validated = copyGame(s);
  validated.careSamples = validated.careSamples.map((o) =>
    Object.isFrozen(o) && Object.isFrozen(o.values)
      ? o
      : Object.freeze({
          ...o,
          values: Object.freeze([...o.values]) as unknown as number[],
        }),
  );
  validated.commandHistory = validated.commandHistory.map(immutableRecord);
  if (validated.careObservations)
    validated.careObservations = validated.careObservations.map((o) =>
      Object.isFrozen(o) && Object.isFrozen(o.values)
        ? o
        : Object.freeze({ ...o, values: Object.freeze([...o.values]) }),
    );
  return validated;
}

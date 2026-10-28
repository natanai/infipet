import {
  APPEARANCE_NEED_IDS,
  feelingNeedEdges,
  feelingRuleFallbacks,
  feelings,
  NEED_IDS,
  type NeedId,
} from "./catalog";
import { normalizeNeedTimeline } from "./timeline";
import {
  physiologyAt,
  validatePhysiology,
  seal,
  PHYSIOLOGY_NEEDS,
  type RecordedNeedTimeline,
} from "./recorded-physiology";
export type NeedsTimelineInput = readonly NeedKeyframe[] | RecordedNeedTimeline;
import {
  DEFAULT_FULFILLMENT,
  DEFAULT_PREVIEW_DAYS,
  MAX_NEED_TICK,
  MAX_SIMULATION_DAYS,
  type NeedDevelopmentDrivers,
  type NeedMorphologySignals,
  type NeedKeyframe,
  type WellbeingState,
} from "./types";

const HOUR = 1 / 24;
const FAST_RATE = Math.LN2 / 0.25;
const MEMORY_RATE = Math.LN2 / 7;
const MAX_CHECKPOINTS = 32;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const index = new Map<NeedId, number>(NEED_IDS.map((id, i) => [id, i]));
const feelingIndices = feelings.map((feeling) =>
  feelingNeedEdges
    .filter((edge) => edge.feelingId === feeling.id)
    .map((edge) => index.get(edge.needId)!),
);
const fallbackIndices = feelings.map((feeling) =>
  feelingRuleFallbacks
    .filter((rule) =>
      (rule.feelingIds as readonly string[]).includes(feeling.id),
    )
    .map((rule) => index.get(rule.needId)!),
);
const safetyIndex = index.get("safety")!;
type Snapshot = {
  tick: number;
  raw: number[];
  fast: number[];
  exposure: number[];
  memory: number[];
};
function clone(snapshot: Snapshot): Snapshot {
  return {
    tick: snapshot.tick,
    raw: [...snapshot.raw],
    fast: [...snapshot.fast],
    exposure: [...snapshot.exposure],
    memory: [...snapshot.memory],
  };
}
function deficit(value: number): number {
  return clamp((DEFAULT_FULFILLMENT - value) / DEFAULT_FULFILLMENT);
}
function integrate(snapshot: Snapshot, days: number): void {
  const fastMix = 1 - Math.exp(-FAST_RATE * days);
  const memoryMix = 1 - Math.exp(-MEMORY_RATE * days);
  for (let i = 0; i < NEED_IDS.length; i++) {
    const pressure = deficit(snapshot.raw[i]);
    snapshot.fast[i] += (snapshot.raw[i] - snapshot.fast[i]) * fastMix;
    snapshot.memory[i] += (pressure - snapshot.memory[i]) * memoryMix;
    snapshot.exposure[i] += pressure * days;
  }
}
function unit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++)
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function development(snapshot: Snapshot): WellbeingState["development"] {
  const state = (id: NeedId) => {
    const i = index.get(id)!;
    return {
      raw: snapshot.raw[i],
      fast: snapshot.fast[i],
      memory: snapshot.memory[i],
    };
  };
  const safety = state("safety"),
    security = state("security"),
    trust = state("trust");
  // Max retains each need's causal response instead of diluting it across all 67 needs.
  const persistent = Math.max(
    safety.memory,
    security.memory * 0.9,
    trust.memory * 0.85,
  );
  const acute = Math.max(
    deficit(safety.raw),
    deficit(security.fast) * 0.8,
    deficit(trust.fast) * 0.65,
  );
  const rest = state("rest"),
    relaxation = state("relaxation"),
    fitness = state("physical-fitness");
  const recovery = clamp(
    ((rest.fast + relaxation.fast) / 2) *
      (1 - 0.45 * Math.max(rest.memory, relaxation.memory)),
  );
  const vigor = clamp(
    (fitness.fast * 0.65 + rest.fast * 0.35) * (1 - 0.4 * fitness.memory),
  );
  return {
    protection: clamp(persistent),
    recovery,
    vigor,
    vigilance: clamp(acute * 0.7 + persistent * 0.3),
    guarding: clamp(persistent * 0.85 + deficit(trust.fast) * 0.15),
    defensiveDisplay: clamp(persistent * 0.8 + deficit(security.fast) * 0.2),
    noveltyDrive: clamp(
      (vigor * 0.55 + recovery * 0.45) * (1 - persistent * 0.7),
    ),
  };
}

function needDrivers(snapshot: Snapshot): NeedDevelopmentDrivers {
  return Object.fromEntries(
    APPEARANCE_NEED_IDS.map((needId) => {
      const i = index.get(needId)!;
      const shortage = deficit(snapshot.fast[i]);
      return [
        needId,
        {
          fulfillment: snapshot.raw[i],
          shortTerm: snapshot.fast[i],
          exposure: snapshot.exposure[i],
          memory: snapshot.memory[i],
          acuteDeficit: deficit(snapshot.raw[i]),
          shortage,
          opportunity: clamp(
            (snapshot.fast[i] - DEFAULT_FULFILLMENT) /
              (1 - DEFAULT_FULFILLMENT),
          ),
          load: clamp(shortage * 0.55 + snapshot.memory[i] * 0.45),
        },
      ];
    }),
  ) as NeedDevelopmentDrivers;
}

/** Captures its timeline; seeking and future edits never consume random state. */
export function createNeedsSimulation(
  seed: string,
  timeline: NeedsTimelineInput = [],
) {
  const recorded = Array.isArray(timeline)
    ? undefined
    : seal(JSON.parse(JSON.stringify(timeline)) as RecordedNeedTimeline);
  if (recorded) {
    if (
      recorded.kind !== "recorded-physiology-v1" ||
      !Array.isArray(recorded.history)
    )
      throw new Error("Invalid recorded need timeline.");
    validatePhysiology(recorded.model, Number.MAX_SAFE_INTEGER);
    recorded.history.forEach((p, i) => {
      if (
        !Number.isSafeInteger(p.atMs) ||
        p.atMs < 0 ||
        p.atMs > 365 * 86400000 ||
        (i > 0 && p.atMs <= recorded.history[i - 1].atMs) ||
        p.values.length !== 6 ||
        p.values.some((v: number) => !Number.isFinite(v) || v < 0 || v > 1)
      )
        throw new Error("Invalid recorded physiological history.");
    });
  }
  const normalized = normalizeNeedTimeline(
    recorded ? [] : (timeline as readonly NeedKeyframe[]),
  );
  const events = new Map<number, NeedKeyframe[]>();
  for (const frame of normalized)
    events.set(frame.tick, [...(events.get(frame.tick) ?? []), frame]);
  const eventTicks = [...events.keys()].sort((a, b) => a - b);
  const initial: Snapshot = {
    tick: 0,
    raw: NEED_IDS.map(() => DEFAULT_FULFILLMENT),
    fast: NEED_IDS.map(() => DEFAULT_FULFILLMENT),
    exposure: NEED_IDS.map(() => 0),
    memory: NEED_IDS.map(() => 0),
  };
  function apply(snapshot: Snapshot): void {
    for (const event of events.get(snapshot.tick) ?? [])
      snapshot.raw[index.get(event.needId)!] = event.fulfillment;
  }
  const initialBeforeEvents = clone(initial);
  apply(initial);
  const checkpoints = new Map<number, Snapshot>([[0, initial]]);
  // Only canonical EVENT snapshots may resume numerical integration. A prior
  // arbitrary frame cutoff would split an exponential segment differently.
  // Storing after each real event preserves exactly the cold arithmetic order.
  const canonicalEvents = new Map<number, Snapshot>([[0, clone(initial)]]);
  const temperament = feelings.map(
    (feeling) => 0.94 + unit(seed + "|feeling|" + feeling.id) * 0.12,
  );
  function cache(cache: Map<number, Snapshot>, snapshot: Snapshot): void {
    cache.delete(snapshot.tick);
    cache.set(snapshot.tick, clone(snapshot));
    while (cache.size > MAX_CHECKPOINTS)
      cache.delete(cache.keys().next().value!);
  }
  function boundedAge(age: number): number {
    return Number.isFinite(age)
      ? Math.max(0, Math.min(MAX_SIMULATION_DAYS, age))
      : 0;
  }
  function ageTick(age: number): number {
    const value = Math.min(MAX_NEED_TICK, age * 24),
      integer = Math.round(value);
    return Math.abs(value - integer) < 1e-8 ? integer : value;
  }
  /** Constant fulfillment segments admit exact exponential integration, regardless of duration. */
  function snapshotAt(target: number, beforeEvents = false): Snapshot {
    const hit = beforeEvents ? undefined : checkpoints.get(target);
    if (hit) return clone(hit);
    // Query-dependent chunk boundaries must not change floating-point replay.
    // Misses always integrate the same canonical event segments from the origin.
    let start = beforeEvents && target === 0 ? initialBeforeEvents : initial;
    for (const [tick, snapshot] of canonicalEvents)
      if (tick > start.tick && (beforeEvents ? tick < target : tick <= target))
        start = snapshot;
    const current = clone(start);
    let lo = 0,
      hi = eventTicks.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (eventTicks[mid] <= current.tick) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < eventTicks.length; i++) {
      const tick = eventTicks[i];
      if (tick > target || (beforeEvents && tick === target)) break;
      integrate(current, (tick - current.tick) * HOUR);
      current.tick = tick;
      apply(current);
      canonicalEvents.delete(tick);
      canonicalEvents.set(tick, clone(current));
      while (canonicalEvents.size > MAX_CHECKPOINTS)
        canonicalEvents.delete(canonicalEvents.keys().next().value!);
    }
    integrate(current, (target - current.tick) * HOUR);
    current.tick = target;
    if (!beforeEvents && target % 24 === 0) cache(checkpoints, current);
    return current;
  }
  function recordedSnapshot(tick: number, before = false): Snapshot {
    const point = physiologyAt(recorded!, tick * 3_600_000, before);
    const value: Snapshot = {
      tick,
      raw: NEED_IDS.map(() => 0.75),
      fast: NEED_IDS.map(() => 0.75),
      exposure: NEED_IDS.map(() => 0),
      memory: NEED_IDS.map(() => 0),
    };
    PHYSIOLOGY_NEEDS.forEach((id, i) => {
      const j = index.get(id)!;
      value.raw[j] = point.raw[i];
      value.fast[j] = point.fast[i];
      value.exposure[j] = point.exposure[i];
      value.memory[j] = point.memory[i];
    });
    return value;
  }
  function stateAt(
    developmentalAge: number,
    beforeEvents = false,
    forcedTick?: number,
  ): WellbeingState {
    const age = boundedAge(developmentalAge);
    const exactTick = forcedTick ?? ageTick(age);
    const target = Math.floor(exactTick);
    const current = recorded
      ? recordedSnapshot(exactTick, beforeEvents)
      : snapshotAt(target, beforeEvents);
    if (!recorded) integrate(current, Math.max(0, exactTick - target) * HOUR);
    const needStates = Object.fromEntries(
      NEED_IDS.map((id, i) => [
        id,
        {
          fulfillment: current.raw[i],
          shortTerm: current.fast[i],
          exposure: current.exposure[i],
          memory: current.memory[i],
        },
      ]),
    ) as WellbeingState["needs"];
    const scored = feelings
      .map((feeling, i) => {
        const ids = feelingIndices[i];
        const positive = feeling.satisfaction === "met";
        const signals = ids.map((j) =>
          positive
            ? current.raw[j] * 0.65 + current.fast[j] * 0.35
            : clamp(
                (1 - current.raw[j]) * 0.55 +
                  (1 - current.fast[j]) * 0.25 +
                  current.memory[j] * 0.2,
              ),
        );
        const mean =
          signals.reduce((sum, value) => sum + value, 0) /
          Math.max(1, signals.length);
        const strongest = signals.reduce(
          (maximum, value) => Math.max(maximum, value),
          0,
        );
        // Mean balances edge degree; strongest keeps a single specific deficit legible.
        let intensity = (mean * 0.6 + strongest * 0.4) * temperament[i];
        if (!positive && ids.includes(safetyIndex))
          intensity = Math.max(
            intensity,
            deficit(current.raw[safetyIndex]) * (0.9 + 0.1 * temperament[i]),
          );
        for (const j of fallbackIndices[i])
          intensity = Math.max(
            intensity,
            deficit(current.raw[j]) * (0.7 + 0.1 * temperament[i]),
          );
        return {
          id: feeling.id,
          title: feeling.title,
          intensity: clamp(intensity),
          satisfaction: feeling.satisfaction,
        };
      })
      .sort(
        (a, b) =>
          b.intensity - a.intensity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    // Separate pools keep a specific unmet need audible beside generally good care.
    // Catalog edges are hypotheses rather than diagnosis; broad-degree feelings
    // get a mean, never a sum of all their possible needs.
    const urgent = current.raw.some((value) => deficit(value) >= 0.2);
    const selected = new Set<string>();
    if (urgent) {
      const unmet = scored.find((feeling) => feeling.satisfaction !== "met");
      const met = scored.find(
        (feeling) => feeling.satisfaction === "met" && feeling.intensity > 0.05,
      );
      if (unmet) selected.add(unmet.id);
      if (met) selected.add(met.id);
    }
    for (const feeling of scored) {
      if (selected.size >= 3) break;
      selected.add(feeling.id);
    }
    const emitted = scored.filter((feeling) => selected.has(feeling.id));
    return freeze({
      tick: target,
      developmentalAge: age,
      ...(recorded?.model.unknownInterval && exactTick*3_600_000>=recorded.model.unknownInterval.fromMs
        ? {
            physiologyEvidence: {
              unknownInterval: recorded.model.unknownInterval,
            },
          }
        : {}),
      needs: needStates,
      needDrivers: needDrivers(current),
      feelings: emitted,
      development: development(current),
    });
  }
  type MutableSignals = Record<
    (typeof APPEARANCE_NEED_IDS)[number],
    { load: number; opportunity: number }
  >;
  type MorphologyCheckpoint = { snapshot: Snapshot; signals: MutableSignals };
  const halfLives = [4, 9, 7, 2, 3, 8];
  const prefixTick = DEFAULT_PREVIEW_DAYS * 24;
  const zeroSignals = () =>
    Object.fromEntries(
      APPEARANCE_NEED_IDS.map((id) => [id, { load: 0, opportunity: 0 }]),
    ) as MutableSignals;
  const copySignals = (value: MutableSignals): MutableSignals =>
    Object.fromEntries(
      APPEARANCE_NEED_IDS.map((id) => [id, { ...value[id] }]),
    ) as MutableSignals;
  const morphologyCheckpoints = new Map<number, MorphologyCheckpoint>([
    [0, { snapshot: clone(initial), signals: zeroSignals() }],
  ]);
  let morphologyHourlySteps = 0;
  function saveMorphology(value: MorphologyCheckpoint): void {
    morphologyCheckpoints.delete(value.snapshot.tick);
    morphologyCheckpoints.set(value.snapshot.tick, {
      snapshot: clone(value.snapshot),
      signals: copySignals(value.signals),
    });
    while (morphologyCheckpoints.size > MAX_CHECKPOINTS) {
      const old = [...morphologyCheckpoints.keys()].find(
        (tick) => tick !== 0 && tick !== prefixTick,
      )!;
      morphologyCheckpoints.delete(old);
    }
  }
  function halfLife(base: number, tick: number): number {
    const t = clamp((tick / 24 - 100) / 60),
      elder = t * t * (3 - 2 * t);
    return base * (1 + elder * 1.8);
  }
  function hourlyMorphology(value: MorphologyCheckpoint, fraction = 1): void {
    const target = needDrivers(value.snapshot);
    APPEARANCE_NEED_IDS.forEach((id, i) => {
      const mix = -Math.expm1(
        (-Math.LN2 * fraction) /
          (halfLife(halfLives[i], value.snapshot.tick) * 24),
      );
      value.signals[id].load +=
        (target[id].load - value.signals[id].load) * mix;
      value.signals[id].opportunity +=
        (target[id].opportunity - value.signals[id].opportunity) * mix;
    });
  }
  /** Exact geometric convolution of a left-hour sampled constant-plus-two-exponentials target. */
  function filtered(
    start: number,
    constant: number,
    fast: number,
    memory: number,
    hours: number,
    days: number,
  ): number {
    if (hours <= 0) return start;
    const a = Math.exp(-Math.LN2 / (days * 24));
    const power = Math.exp((-Math.LN2 * hours) / (days * 24));
    const sum = (rate: number) => {
      const r = Math.exp(-rate / 24),
        rp = Math.exp((-rate * hours) / 24);
      return Math.abs(a - r) < 1e-12
        ? hours * Math.exp((-Math.LN2 * (hours - 1)) / (days * 24))
        : (power - rp) / (a - r);
    };
    return clamp(
      start * power +
        constant * (1 - power) +
        (1 - a) * (fast * sum(FAST_RATE) + memory * sum(MEMORY_RATE)),
    );
  }
  function fixedNeed(
    signal: { load: number; opportunity: number },
    f: number,
    m: number,
    raw: number,
    hours: number,
    days: number,
  ) {
    const run = (
      s: typeof signal,
      fast: number,
      memory: number,
      count: number,
    ) => {
      const below =
        fast < DEFAULT_FULFILLMENT ||
        (fast === DEFAULT_FULFILLMENT && raw < DEFAULT_FULFILLMENT);
      const pressure = deficit(raw);
      return {
        load: filtered(
          s.load,
          0.45 * pressure +
            (below ? 0.55 * (1 - raw / DEFAULT_FULFILLMENT) : 0),
          below ? (-0.55 * (fast - raw)) / DEFAULT_FULFILLMENT : 0,
          0.45 * (memory - pressure),
          count,
          days,
        ),
        opportunity: below
          ? filtered(s.opportunity, 0, 0, 0, count, days)
          : filtered(
              s.opportunity,
              (raw - DEFAULT_FULFILLMENT) / (1 - DEFAULT_FULFILLMENT),
              (fast - raw) / (1 - DEFAULT_FULFILLMENT),
              0,
              count,
              days,
            ),
      };
    };
    let first = hours;
    if ((f - DEFAULT_FULFILLMENT) * (raw - DEFAULT_FULFILLMENT) < 0) {
      const crossing =
        -Math.log((DEFAULT_FULFILLMENT - raw) / (f - raw)) / FAST_RATE;
      first = Math.min(hours, Math.max(0, Math.ceil(crossing * 24 - 1e-10)));
    }
    const middle = run(signal, f, m, first);
    if (first === hours) return middle;
    const dt = first / 24,
      pressure = deficit(raw);
    return run(
      middle,
      raw + (f - raw) * Math.exp(-FAST_RATE * dt),
      pressure + (m - pressure) * Math.exp(-MEMORY_RATE * dt),
      hours - first,
    );
  }
  function advanceFixed(value: MorphologyCheckpoint, hours: number): void {
    if (!hours) return;
    APPEARANCE_NEED_IDS.forEach((id, j) => {
      const i = index.get(id)!;
      value.signals[id] = fixedNeed(
        value.signals[id],
        value.snapshot.fast[i],
        value.snapshot.memory[i],
        value.snapshot.raw[i],
        hours,
        halfLives[j] * 2.8,
      );
    });
    integrate(value.snapshot, hours / 24);
    value.snapshot.tick += hours;
  }
  function morphologyAt(developmentalAge: number): NeedMorphologySignals {
    // Recorded physiology controls current expression. Permanent player anatomy
    // consumes exact daily environmental evidence, never this legacy Lab filter.
    if (recorded) {
      const drivers = needDrivers(
        recordedSnapshot(ageTick(boundedAge(developmentalAge))),
      );
      return freeze(
        Object.fromEntries(
          APPEARANCE_NEED_IDS.map((id) => [
            id,
            { load: drivers[id].load, opportunity: drivers[id].opportunity },
          ]),
        ) as NeedMorphologySignals,
      );
    }

    const exact = ageTick(boundedAge(developmentalAge)),
      target = Math.floor(exact);
    let start =
      morphologyCheckpoints.get(target) ?? morphologyCheckpoints.get(0)!;
    if (start.snapshot.tick !== target)
      for (const checkpoint of morphologyCheckpoints.values())
        if (
          checkpoint.snapshot.tick <= Math.min(target, prefixTick) &&
          checkpoint.snapshot.tick >= start.snapshot.tick
        )
          start = checkpoint;
    const current = {
      snapshot: clone(start.snapshot),
      signals: copySignals(start.signals),
    };
    while (current.snapshot.tick < Math.min(target, prefixTick)) {
      hourlyMorphology(current);
      integrate(current.snapshot, HOUR);
      current.snapshot.tick++;
      morphologyHourlySteps++;
      apply(current.snapshot);
      if (current.snapshot.tick % 24 === 0) saveMorphology(current);
    }
    // Elder filter rates are constant by this boundary. Later time costs depend on events, not elapsed hours.
    if (current.snapshot.tick < target) {
      for (const tick of eventTicks) {
        if (tick <= current.snapshot.tick) continue;
        if (tick > target) break;
        advanceFixed(current, tick - current.snapshot.tick);
        apply(current.snapshot);
      }
      advanceFixed(current, target - current.snapshot.tick);
      if (target % 24 === 0) saveMorphology(current);
    }
    if (exact > target) hourlyMorphology(current, exact - target);
    return freeze(copySignals(current.signals));
  }
  return {
    stateAt: (developmentalAge: number) => stateAt(developmentalAge),
    morphologyAt,
    getReplayStats: () =>
      Object.freeze({
        wellbeingCheckpoints: checkpoints.size,
        morphologyCheckpoints: morphologyCheckpoints.size,
        morphologyHourlySteps,
      }),
    /** Exact state at an hourly boundary before that boundary's care events. */
    stateBeforeTick(tick: number): WellbeingState {
      if (!Number.isSafeInteger(tick) || tick < 0 || tick > MAX_NEED_TICK)
        throw new RangeError(
          `Need tick must be an integer from 0 to ${MAX_NEED_TICK}.`,
        );
      return stateAt(tick / 24, true, tick);
    },
  };
}

export {
  DEVELOPMENT_PROFILES_VERSION,
  REGIONAL_NEED_PROFILES,
  type DevelopmentRegion,
  type RegionalNeedProfile,
} from "./development-profiles";

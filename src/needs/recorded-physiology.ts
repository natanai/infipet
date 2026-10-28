/** Exact sufficient state for lifelong recorded physiology. Time is elapsed ms
 * since hatch; only real physiological observations are integration boundaries.
 * For constant raw u: f'=ln(2)/.25*(u-f), m'=ln(2)/7*(d(u)-m),
 * e'=d(u), d(u)=max(0,(.75-u)/.75), with time measured in days.
 * IEEE-754 binary64; canonical event ordering makes query partition irrelevant.
 * The finite anatomical archive is independent of this bounded rolling model. */
export const PHYSIOLOGY_NEEDS = [
  "safety",
  "security",
  "trust",
  "rest",
  "relaxation",
  "physical-fitness",
] as const;
export const PHYSIOLOGY_EVENT_LIMIT = 128;
const DAY = 86_400_000;
export type PhysiologyPoint = Readonly<{
  atMs: number;
  values: readonly number[];
}>;
export type PhysiologySnapshot = Readonly<{
  atMs: number;
  raw: readonly number[];
  fast: readonly number[];
  exposure: readonly number[];
  memory: readonly number[];
}>;
export type RecordedPhysiology = Readonly<{
  version: 1;
  anchor: PhysiologySnapshot;
  events: readonly PhysiologyPoint[];
  presence: "active" | "absent" | "birth";
  /** Older saves did not observe beyond maturity. This interval is unknown. */
  unknownInterval?: Readonly<{ fromMs: number; toMs: number }>;
}>;
export type RecordedNeedTimeline = Readonly<{
  kind: "recorded-physiology-v1";
  model: RecordedPhysiology;
  /** Actual first-year observations, retained for historical daily replay. */
  history: readonly PhysiologyPoint[];
}>;
export function initialPhysiology(): RecordedPhysiology {
  return seal({
    version: 1,
    anchor: {
      atMs: 0,
      raw: Array(6).fill(0.75),
      fast: Array(6).fill(0.75),
      exposure: Array(6).fill(0),
      memory: Array(6).fill(0),
    },
    events: [],
    presence: "birth",
  });
}
export function seal<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(seal);
    Object.freeze(value);
  }
  return value;
}
function integrate(s: PhysiologySnapshot, atMs: number): PhysiologySnapshot {
  if (atMs < s.atMs) throw new RangeError("Backward physiological chronology.");
  const days = (atMs - s.atMs) / DAY,
    f = -Math.expm1((-Math.LN2 / 0.25) * days),
    m = -Math.expm1((-Math.LN2 / 7) * days);
  const pressure = s.raw.map((v) => Math.max(0, (0.75 - v) / 0.75));
  return {
    atMs,
    raw: [...s.raw],
    fast: s.fast.map((v, i) => v + (s.raw[i] - v) * f),
    memory: s.memory.map((v, i) => v + (pressure[i] - v) * m),
    exposure: s.exposure.map((v, i) => v + pressure[i] * days),
  };
}
function apply(s: PhysiologySnapshot, p: PhysiologyPoint): PhysiologySnapshot {
  return { ...integrate(s, p.atMs), raw: [...p.values] };
}
const same = (a: readonly number[], b: readonly number[]) =>
  a.every((v, i) => v === b[i]);
/** Duplicate timestamps use the actual last post-command state, never a receipt's intended effect. */
export function observePhysiology(
  model: RecordedPhysiology,
  point: PhysiologyPoint,
  presence: RecordedPhysiology["presence"],
): RecordedPhysiology {
  if (
    !Number.isSafeInteger(point.atMs) ||
    point.atMs < (model.events.at(-1)?.atMs ?? model.anchor.atMs) ||
    point.values.length !== 6 ||
    point.values.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
  )
    throw new Error("Invalid physiological observation.");
  let anchor = model.anchor;
  const events = [...model.events];
  if (events.at(-1)?.atMs === point.atMs) events.pop();
  if (!same(events.at(-1)?.values ?? anchor.raw, point.values))
    events.push({ atMs: point.atMs, values: [...point.values] });
  while (events.length > PHYSIOLOGY_EVENT_LIMIT)
    anchor = apply(anchor, events.shift()!);
  if (
    anchor === model.anchor &&
    presence === model.presence &&
    events.length === model.events.length &&
    events.every((p, i) => p === model.events[i])
  )
    return model;
  return seal({ ...model, anchor, events, presence });
}
/** Exact current state; older postmaturity history outside the retained window is
 * unavailable, rather than reconstructed from invented care. First-year replay
 * uses the independently retained actual finite anatomical evidence. */
export function physiologyAt(
  input: RecordedNeedTimeline,
  atMs: number,
  before = false,
): PhysiologySnapshot {
  if (!Number.isFinite(atMs) || atMs < 0 || atMs > Number.MAX_SAFE_INTEGER)
    throw new RangeError("Invalid physiological time.");
  const { model } = input;
  let state: PhysiologySnapshot = model.anchor,
    events = model.events;
  if (atMs < state.atMs || (before && atMs === state.atMs)) {
    const end = input.history.at(-1)?.atMs ?? 0;
    if (atMs > end)
      throw new RangeError(
        "Historical physiology is outside the retained evidence window.",
      );
    state = initialPhysiology().anchor;
    events = [];
    // Match the stream's coalescing order exactly, including same-value observations.
    let raw = state.raw;
    events = input.history.filter((p) => {
      if (same(p.values, raw)) return false;
      raw = p.values;
      return true;
    });
  }
  for (const p of events) {
    if (p.atMs > atMs || (before && p.atMs === atMs)) break;
    state = apply(state, p);
  }
  return integrate(state, atMs);
}
export function validatePhysiology(
  value: RecordedPhysiology,
  now: number,
): RecordedPhysiology {
  const only = (o: object, keys: string[]) =>
    o &&
    typeof o === "object" &&
    !Array.isArray(o) &&
    Object.keys(o).every((k) => keys.includes(k));
  const time = (v: number) => Number.isSafeInteger(v) && v >= 0 && v <= now;
  const vector = (v: readonly number[], max = 1) =>
    Array.isArray(v) &&
    v.length === 6 &&
    v.every((n) => Number.isFinite(n) && n >= 0 && n <= max);
  if (
    !only(value, [
      "version",
      "anchor",
      "events",
      "presence",
      "unknownInterval",
    ]) ||
    value.version !== 1 ||
    !["active", "absent", "birth"].includes(value.presence) ||
    !only(value.anchor, ["atMs", "raw", "fast", "exposure", "memory"]) ||
    !time(value.anchor.atMs) ||
    !vector(value.anchor.raw) ||
    !vector(value.anchor.fast) ||
    !vector(value.anchor.memory) ||
    !vector(value.anchor.exposure, value.anchor.atMs / DAY + 1e-8) ||
    !Array.isArray(value.events) ||
    value.events.length > PHYSIOLOGY_EVENT_LIMIT
  )
    throw new Error("Invalid saved physiological state.");
  let previous = value.anchor.atMs;
  value.events.forEach((p, i) => {
    if (
      !only(p, ["atMs", "values"]) ||
      !time(p.atMs) ||
      (i ? p.atMs <= previous : p.atMs < previous) ||
      !vector(p.values)
    )
      throw new Error("Invalid saved physiological chronology.");
    previous = p.atMs;
  });
  const gap = value.unknownInterval;
  if (
    gap &&
    (!only(gap, ["fromMs", "toMs"]) ||
      !time(gap.fromMs) ||
      !time(gap.toMs) ||
      gap.toMs < gap.fromMs)
  )
    throw new Error("Invalid unknown physiological interval.");
  return seal(value);
}

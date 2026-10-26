/**
 * Incremental CARE expression contract (v1).
 *
 * Environmental *permission* is distinct from inherited operator strength
 * and from any structural cells that a Development transaction may create.
 *
 * Model: Zero-order-hold reaction norm q(t) in [0,1] for each operator.
 * Canonical discontinuities are operation onset/end, integer developmental
 * hours, recorded physiological sample hours and command timestamps.
 * On [b_i,b_(i+1)) the pressure is evaluated at exactly b_i, *after* all
 * commands/samples at that boundary (and before anything later).
 *
 * E_op(t) = strength_op / duration_op *
 *   integral_[op.start, min(t,op.end)] q_op(u) du.
 * This is exact for the declared zero-order-hold model, NOT an assertion that
 * continuous biological kinetics are physically piecewise constant.
 *
 * An incremental Development transaction must consume only:
 *   delta = E_op(to) - E_op(from)
 * and must not reapply E_op(to) as a new operator on an already-grown graph.
 */
import {
  MATERIAL_LIMITS,
  type MaterialDevelopmentProgram,
  type MaterialOperator,
  type MaterialOperatorKind,
} from "../development";
import { validateGameCommand } from "../gameplay";
import type { DevelopmentalGenotype } from "../genetics";
import type { EnvironmentalHistory } from "./history";
import { compileCareDevelopmentSignals } from "./reaction-norm";

export const CARE_EXPOSURE_VERSION = 1 as const;
/** Guard unbounded synthetic histories; ordinary gameplay is at most 720 h. */
export const CARE_EXPOSURE_LIMITS = Object.freeze({
  maxHours: 1_000_000,
  maxSamples: 8192,
  maxCommands: 100_000,
  maxBoundariesPerOperator: 16_384,
});

const kindToChannel: Readonly<Record<MaterialOperatorKind,
  "tip-extension" | "branch-axis" | "surface-expansion" |
  "tissue-remodeling" | "appendage-extension" | "wall-deposition">> = {
  elongate: "tip-extension",
  expand: "surface-expansion",
  branch: "branch-axis",
  bud: "appendage-extension",
  fuse: "tissue-remodeling",
  resorb: "tissue-remodeling",
  remodel: "tissue-remodeling",
  reinforce: "wall-deposition",
};
const finiteRange = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" && Number.isFinite(value) &&
  value >= low && value <= high;
const isHour = (value: unknown, max: number): value is number =>
  finiteRange(value, 0, max);
const types = new Set(Object.keys(kindToChannel));

/**
 * Unitless progress: 1 means full unmodulated operator capacity, not that a
 * particular anatomical feature has appeared. No random seed is consumed.
 */
export type OperatorExpressionCredit = Readonly<{
  operatorId: string;
  kind: MaterialOperatorKind;
  tissueId: string;
  operatorAtHour: number;
  durationHours: number;
  inheritedStrength: number;
  /** Intersection of [from,to) with the operator's scheduled window, hours. */
  activeHours: number;
  /** Exact zero-order-hold integral of q(t) dt, in hours. */
  expressedHours: number;
  /** inheritedStrength * expressedHours, in strength-hours. */
  strengthHours: number;
  /** strengthHours / durationHours; incremental, not cumulative. */
  progressDelta: number;
  /** Credit earned since the operator's own onset, for auditing only. */
  progressAtEnd: number;
}>;

export type CareExpressionCursor = Readonly<{
  version: typeof CARE_EXPOSURE_VERSION;
  programFingerprint: string;
  genotypeFingerprint: string;
  throughHour: number;
  /** Cumulative values used only to detect historic edits and double counting. */
  progress: Readonly<Record<string, number>>;
}>;
export type CareExposureAdvance = Readonly<{
  fromHour: number;
  toHour: number;
  /** Consume once through the returned cursor, never replay as total strengths. */
  deltas: readonly OperatorExpressionCredit[];
  next: CareExpressionCursor;
}>;
export type CareOperatorChronology = Readonly<{
  version: typeof CARE_EXPOSURE_VERSION;
  programFingerprint: string;
  genotypeFingerprint: string;
  maxHour: number;
  /** Pure query, no progression state: [from,to), including fractional hours. */
  interval: (fromHour: number, toHour: number) => readonly OperatorExpressionCredit[];
  /** Deterministic, JSON-serializable progress marker at birth. */
  initial: () => CareExpressionCursor;
  /** An existing marker can be reused with an extended, equivalent saved life. */
  advance: (cursor: CareExpressionCursor, toHour: number) => CareExposureAdvance;
}>;

type Segment = Readonly<{ start: number; end: number; permission: number; prefix: number }>;
type PreparedOperator = Readonly<{ operator: MaterialOperator; segments: readonly Segment[] }>;

function checkHistory(history: EnvironmentalHistory): void {
  if (!history || history.version !== 1 ||
      !isHour(history.maxHour, CARE_EXPOSURE_LIMITS.maxHours) ||
      !Array.isArray(history.samples) ||
      history.samples.length > CARE_EXPOSURE_LIMITS.maxSamples ||
      !Array.isArray(history.commands) ||
      history.commands.length > CARE_EXPOSURE_LIMITS.maxCommands ||
      typeof history.atHour !== "function")
    throw new TypeError("Invalid bounded chronological care history");
  let previousSample = -1;
  for (const sample of history.samples) {
    if (!sample || !Number.isSafeInteger(sample.hour) ||
        !isHour(sample.hour, history.maxHour) ||
        sample.hour <= previousSample ||
        (sample.nutrition !== null && !finiteRange(sample.nutrition, 0, 1)) ||
        !Array.isArray(sample.needs) || sample.needs.length !== 6 ||
        sample.needs.some((value: number) => !finiteRange(value, 0, 1)))
      throw new TypeError("Invalid or unordered physiological sample");
    previousSample = sample.hour;
  }
  // Egg-stage commands may precede hatching; these cannot affect after-birth
  // expression but must remain valid recorded history, not silently deleted.
  let previousEvent = -Infinity;
  const ids = new Set<string>();
  for (const event of history.commands) {
    if (!event || !finiteRange(event.atHour, -1, history.maxHour) ||
        event.atHour < previousEvent ||
        typeof event.id !== "string" || !event.id ||
        ids.has(event.id) || typeof event.accepted !== "boolean")
      throw new TypeError("Invalid or unordered care command record");
    validateGameCommand(event.command);
    ids.add(event.id);
    previousEvent = event.atHour;
  }
}

function checkProgram(program: MaterialDevelopmentProgram, genotype: DevelopmentalGenotype): void {
  if (!program || program.version !== 1 || !genotype ||
      genotype.fingerprint !== program.genomeFingerprint ||
      !program.signals || !program.signals.channels ||
      JSON.stringify(program.signals.channels) !== JSON.stringify(genotype.channels) ||
      !Array.isArray(program.operators) ||
      program.operators.length > MATERIAL_LIMITS.operators ||
      typeof program.fingerprint !== "string" || !program.fingerprint)
    throw new TypeError("Material chronology requires its permanent genetic program");
  const ids = new Set<string>();
  for (const op of program.operators) {
    if (!op || typeof op.id !== "string" || !op.id || ids.has(op.id) ||
        !types.has(op.kind) ||
        typeof op.tissueId !== "string" || !op.tissueId ||
        !isHour(op.atHour, CARE_EXPOSURE_LIMITS.maxHours) ||
        !finiteRange(op.durationHours, Number.MIN_VALUE, CARE_EXPOSURE_LIMITS.maxHours) ||
        !Number.isFinite(op.atHour + op.durationHours) ||
        !finiteRange(op.strength, 0, 1))
      throw new TypeError("Invalid permanent material operation");
    ids.add(op.id);
  }
}

function validatePressure(history: EnvironmentalHistory, hour: number) {
  const p = history.atHour(hour);
  if (!p || p.atHour !== hour || !p.exposure ||
      !p.physiology || !p.cumulative ||
      !finiteRange(p.exposure.nutrition, 0, 1) ||
      !finiteRange(p.exposure.activity, 0, 1) ||
      !finiteRange(p.exposure.threat, 0, 1) ||
      !finiteRange(p.physiology.restRecovery, 0, 1) ||
      !finiteRange(p.cumulative.safetyDeficitDays, 0, CARE_EXPOSURE_LIMITS.maxHours / 24))
    throw new TypeError("Invalid recorded environmental pressure");
  return p;
}

function prepare(
  program: MaterialDevelopmentProgram,
  history: EnvironmentalHistory,
  genotype: DevelopmentalGenotype,
): readonly PreparedOperator[] {
  const cache = new Map<number, ReturnType<typeof compileCareDevelopmentSignals>>();
  function permission(atHour: number, kind: MaterialOperatorKind): number {
    let response = cache.get(atHour);
    if (!response) {
      response = compileCareDevelopmentSignals(genotype,
        validatePressure(history, atHour),
        program.signals.biologicalPrior ?? undefined);
      cache.set(atHour, response);
    }
    const signal = response.operators[kindToChannel[kind]];
    const ratio = signal.inheritedPotential > 0 ?
      signal.expressedPotential / signal.inheritedPotential : 0;
    if (!finiteRange(ratio, 0, 1))
      throw new RangeError("Reaction norm exceeded [0,1]");
    return ratio;
  }
  return Object.freeze(program.operators.map(operator => {
    const start = operator.atHour;
    const end = Math.min(operator.atHour + operator.durationHours, history.maxHour);
    if (start >= end) return Object.freeze({ operator, segments: Object.freeze([]) });
    const marks = new Set<number>([start, end]);
    // A canonical *global* grid is independent of caller queries and replay order.
    for (let hour = Math.floor(start) + 1; hour < end; hour++) {
      if (marks.size > CARE_EXPOSURE_LIMITS.maxBoundariesPerOperator)
        throw new RangeError("Too many exposure boundaries");
      marks.add(hour);
    }
    for (const sample of history.samples)
      if (sample.hour > start && sample.hour < end) marks.add(sample.hour);
    for (const command of history.commands)
      if (command.atHour > start && command.atHour < end) marks.add(command.atHour);
    if (marks.size > CARE_EXPOSURE_LIMITS.maxBoundariesPerOperator)
      throw new RangeError("Too many exposure boundaries");
    const boundaries = [...marks].sort((a, b) => a - b);
    let prefix = 0;
    const segments: Segment[] = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const a = boundaries[i], b = boundaries[i + 1];
      const value = permission(a, operator.kind);
      segments.push(Object.freeze({ start: a, end: b, permission: value, prefix }));
      prefix += (b - a) * value;
    }
    return Object.freeze({ operator, segments: Object.freeze(segments) });
  }));
}

function integralAt(prepared: PreparedOperator, hour: number): number {
  const segments = prepared.segments;
  let total = 0;
  for (const segment of segments) {
    if (hour <= segment.start) break;
    total = segment.prefix +
      (Math.min(hour, segment.end) - segment.start) * segment.permission;
    if (hour <= segment.end) break;
  }
  return total;
}

export function createCareOperatorChronology(
  program: MaterialDevelopmentProgram,
  history: EnvironmentalHistory,
  genotype: DevelopmentalGenotype,
): CareOperatorChronology {
  checkProgram(program, genotype);
  checkHistory(history);
  const prepared = prepare(program, history, genotype);
  const idSet = new Set(prepared.map(p => p.operator.id));
  function checkHour(hour: number): void {
    if (!isHour(hour, history.maxHour))
      throw new RangeError("Exposure hour outside recorded chronological history");
  }
  function absolute(preparedOp: PreparedOperator, atHour: number): number {
    return preparedOp.operator.strength *
      integralAt(preparedOp, atHour) / preparedOp.operator.durationHours;
  }
  function interval(fromHour: number, toHour: number): readonly OperatorExpressionCredit[] {
    checkHour(fromHour);
    checkHour(toHour);
    if (toHour < fromHour) throw new RangeError("Exposure interval must not reverse time");
    return Object.freeze(prepared.map(entry => {
      const op = entry.operator;
      const activeHours = Math.max(0, Math.min(toHour, op.atHour + op.durationHours) -
        Math.max(fromHour, op.atHour));
      const expressedHours = Math.max(0,
        integralAt(entry, toHour) - integralAt(entry, fromHour));
      const strengthHours = op.strength * expressedHours;
      const progressDelta = strengthHours / op.durationHours;
      return Object.freeze({
        operatorId: op.id, kind: op.kind, tissueId: op.tissueId,
        operatorAtHour: op.atHour, durationHours: op.durationHours,
        inheritedStrength: op.strength, activeHours,
        expressedHours, strengthHours, progressDelta,
        progressAtEnd: absolute(entry, toHour),
      });
    }));
  }
  function initial(): CareExpressionCursor {
    return Object.freeze({
      version: CARE_EXPOSURE_VERSION, programFingerprint: program.fingerprint,
      genotypeFingerprint: genotype.fingerprint, throughHour: 0,
      progress: Object.freeze(Object.fromEntries(
        prepared.map(entry => [entry.operator.id, 0]))),
    });
  }
  function advance(cursor: CareExpressionCursor, toHour: number): CareExposureAdvance {
    if (!cursor || cursor.version !== CARE_EXPOSURE_VERSION ||
        cursor.programFingerprint !== program.fingerprint ||
        cursor.genotypeFingerprint !== genotype.fingerprint ||
        !cursor.progress || typeof cursor.progress !== "object" ||
        Array.isArray(cursor.progress) ||
        Object.keys(cursor.progress).length !== idSet.size ||
        Object.keys(cursor.progress).some(id => !idSet.has(id)))
      throw new TypeError("Care exposure cursor belongs to a different material life");
    checkHour(cursor.throughHour);
    checkHour(toHour);
    if (toHour < cursor.throughHour)
      throw new RangeError("Cannot reapply a previously consumed care interval");
    for (const entry of prepared) {
      const claimed = cursor.progress[entry.operator.id];
      const expected = absolute(entry, cursor.throughHour);
      if (!finiteRange(claimed, 0, 1) || Math.abs(claimed - expected) > 1e-10)
        throw new TypeError("Care exposure cursor conflicts with historical expression");
    }
    const deltas = interval(cursor.throughHour, toHour);
    const next: CareExpressionCursor = Object.freeze({
      version: CARE_EXPOSURE_VERSION, programFingerprint: program.fingerprint,
      genotypeFingerprint: genotype.fingerprint, throughHour: toHour,
      progress: Object.freeze(Object.fromEntries(
        deltas.map(delta => [delta.operatorId, delta.progressAtEnd]))),
    });
    return Object.freeze({ fromHour: cursor.throughHour, toHour, deltas, next });
  }
  return Object.freeze({
    version: CARE_EXPOSURE_VERSION,
    programFingerprint: program.fingerprint,
    genotypeFingerprint: genotype.fingerprint,
    maxHour: history.maxHour, interval, initial, advance,
  });
}

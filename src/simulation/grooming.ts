import { clamp, compareText, type PartKind, type Point } from "./model";

/** Developmental hours after birth/hatching; vectors use original source material coordinates. */
/** Fractional elapsed hours must represent an exact integer-millisecond event.
 * The tolerance corrects only floating conversion roundoff, never a real
 * sub-millisecond timestamp. Earlier integer-hour saves remain valid. */
export function validGroomTick(value:unknown):value is number {
  if(typeof value!=="number"||!Number.isFinite(value)||value<0)return false;
  const ms=value*3600000,nearest=Math.round(ms);
  return Number.isSafeInteger(nearest)&&Math.abs(ms-nearest)<=8*Number.EPSILON*Math.max(1,ms);
}
export type GroomStroke = {
  tick: number;
  sourceId: string;
  materialAnchor: Point;
  direction: Point;
  strength: number;
  id?: string;
};
export type GroomSourceAlias = {
  sourceId: string;
  sourceAnchor: Point;
  targetAnchor: Point;
  rotation?: number;
  weight?: number;
};
export type GroomingBinding = {
  id: string;
  kind: PartKind;
  parentId?: string | null;
  sourceIds: readonly string[];
  materialAnchor: Point;
  growthAxis: Point;
  influenceRadius: number;
  /** Inherited 0..1 opportunities, supplied by the genetic/material compiler. */
  geneticOpportunity: { length: number; bend: number };
  sourceClip?: { axis: "x" | "y"; min: number; max: number };
  /** Explicit material transfers for an absorbed source or remapped carrier. */
  sourceAliases?: readonly GroomSourceAlias[];
  /** Generated structures can inherit their parent's material history. */
  inheritParent?: boolean;
};
export type GroomInfluence = {
  strokeId: string;
  sourceId: string;
  materialAnchor: Point;
  direction: Point;
  weight: number;
  inherited: boolean;
};
export type GroomModifier = {
  bindingId: string;
  lengthDelta: number;
  bendRadians: number;
  priorityBias: number;
  memory: number;
  materialFocus: Point;
  influenceCount: number;
  influences: readonly GroomInfluence[];
};
export type GroomingState = {
  developmentalAge: number;
  byRegion: Readonly<Record<string, GroomModifier>>;
  input: {
    appliedStrokes: number;
    acceptedStrength: number;
    cappedStrength: number;
    days: readonly { day: number; acceptedStrength: number }[];
  };
};
export const GROOMING_RULES = Object.freeze({
  version: 1,
  dailyInputBudget: 1,
  maximumLengthDelta: 0.25,
  maximumBendRadians: Math.PI / 9,
  maximumPriorityBias: 0.08,
  responseHalfLifeDays: 2.5,
  memoryHalfLifeDays: 28,
  maximumStrokes: 8192,
  directionBins: 4096,
});
const quantize = (n: number, precision: number) =>
  Math.round(n * precision) / precision;
const point = (p: Point): Point => ({ x: p.x, y: p.y });
const finitePoint = (p: unknown): p is Point =>
  !!p &&
  typeof p === "object" &&
  Number.isFinite((p as Point).x) &&
  Number.isFinite((p as Point).y);
function unit(p: Point): Point {
  const scale = Math.max(Math.abs(p.x), Math.abs(p.y));
  if (!(scale > 1e-9)) return { x: 0, y: -1 };
  const x = p.x / scale,
    y = p.y / scale,
    length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}
function canonicalDirection(p: Point): Point {
  const angle = Math.atan2(p.y, p.x),
    bins = GROOMING_RULES.directionBins;
  const bin =
    ((Math.round((angle / (Math.PI * 2)) * bins) % bins) + bins) % bins;
  const canonical = bin * ((Math.PI * 2) / bins);
  // Stable angular bins avoid re-normalizing quantized Cartesian components.
  return {
    x: quantize(Math.cos(canonical), 1e9) || 0,
    y: quantize(Math.sin(canonical), 1e9) || 0,
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function contentKey(s: GroomStroke) {
  return JSON.stringify([
    s.tick,
    s.sourceId,
    s.materialAnchor.x,
    s.materialAnchor.y,
    s.direction.x,
    s.direction.y,
    s.strength,
  ]);
}
/** Invalid records are ignored; identical timestamp/material commands cannot amplify a gesture. */
export function normalizeGroomTimeline(
  input: readonly GroomStroke[],
): GroomStroke[] {
  const unique = new Map<string, GroomStroke>();
  for (const raw of Array.isArray(input) ? input : []) {
    if (
      !raw ||
      !validGroomTick(raw.tick) ||
      raw.tick < 0 ||
      typeof raw.sourceId !== "string" ||
      !raw.sourceId.trim() ||
      !finitePoint(raw.materialAnchor) ||
      !finitePoint(raw.direction) ||
      Math.hypot(raw.direction.x, raw.direction.y) < 1e-9 ||
      !Number.isFinite(raw.strength) ||
      raw.strength <= 0
    )
      continue;
    const stroke: GroomStroke = {
      tick: Math.round(raw.tick*3600000)/3600000,
      sourceId: raw.sourceId.trim(),
      materialAnchor: {
        x: quantize(clamp(raw.materialAnchor.x, 0, 63), 256),
        y: quantize(clamp(raw.materialAnchor.y, 0, 63), 256),
      },
      direction: canonicalDirection(raw.direction),
      strength: quantize(clamp(raw.strength, 0, 1), 1e6),
      ...(typeof raw.id === "string" && raw.id.trim()
        ? { id: raw.id.trim() }
        : {}),
    };
    if (!stroke.strength) continue;
    const key = contentKey(stroke),
      old = unique.get(key);
    if (!old || compareText(stroke.id ?? "", old.id ?? "") < 0)
      unique.set(key, stroke);
  }
  if (unique.size > GROOMING_RULES.maximumStrokes)
    throw new RangeError(
      `Groom timeline exceeds ${GROOMING_RULES.maximumStrokes} strokes`,
    );
  return [...unique.values()].sort(
    (a, b) => a.tick - b.tick || compareText(contentKey(a), contentKey(b)),
  );
}
type AcceptedStroke = {
  stroke: GroomStroke;
  accepted: number;
  capped: number;
  key: string;
};
function acceptedTimeline(timeline: readonly GroomStroke[]): AcceptedStroke[] {
  const used = new Map<number, number>();
  return timeline.map((stroke) => {
    const day = Math.floor(stroke.tick / 24),
      prior = used.get(day) ?? 0;
    // Chronological allocation, never normalization by a day's future total.
    const accepted = Math.min(
      stroke.strength,
      Math.max(0, GROOMING_RULES.dailyInputBudget - prior),
    );
    used.set(day, prior + accepted);
    return {
      stroke,
      accepted,
      capped: stroke.strength - accepted,
      key: stroke.id ?? contentKey(stroke),
    };
  });
}
/** Closed-form rise followed by relaxation: zero at input, no wall clock or seek state. */
export function groomResponse(elapsedDays: number): number {
  if (!(elapsedDays > 0) || !Number.isFinite(elapsedDays)) return 0;
  const rise = Math.LN2 / GROOMING_RULES.responseHalfLifeDays;
  const decay = Math.LN2 / GROOMING_RULES.memoryHalfLifeDays;
  return (
    (rise / (rise - decay)) *
    (Math.exp(-decay * elapsedDays) - Math.exp(-rise * elapsedDays))
  );
}
type Match = {
  anchor: Point;
  direction: Point;
  inherited: boolean;
  attenuation: number;
};
function bindingMatch(
  binding: GroomingBinding,
  stroke: GroomStroke,
  byId: Map<string, GroomingBinding>,
  visiting = new Set<string>(),
): Match | undefined {
  if (visiting.has(binding.id)) return undefined;
  visiting.add(binding.id);
  const alias = binding.sourceAliases
    ?.filter((a) => a.sourceId === stroke.sourceId)
    .sort(
      (a, b) =>
        a.sourceAnchor.x - b.sourceAnchor.x ||
        a.sourceAnchor.y - b.sourceAnchor.y ||
        a.targetAnchor.x - b.targetAnchor.x ||
        a.targetAnchor.y - b.targetAnchor.y,
    )[0];
  if (
    alias &&
    finitePoint(alias.sourceAnchor) &&
    finitePoint(alias.targetAnchor)
  ) {
    const angle = Number.isFinite(alias.rotation) ? alias.rotation! : 0,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const x = stroke.materialAnchor.x - alias.sourceAnchor.x,
      y = stroke.materialAnchor.y - alias.sourceAnchor.y;
    return {
      anchor: {
        x: alias.targetAnchor.x + x * c - y * s,
        y: alias.targetAnchor.y + x * s + y * c,
      },
      direction: {
        x: stroke.direction.x * c - stroke.direction.y * s,
        y: stroke.direction.x * s + stroke.direction.y * c,
      },
      inherited: true,
      attenuation: clamp(
        Number.isFinite(alias.weight) ? alias.weight! : 1,
        0,
        1,
      ),
    };
  }
  if (
    binding.id === stroke.sourceId ||
    binding.sourceIds.includes(stroke.sourceId)
  ) {
    const clip = binding.sourceClip,
      coordinate =
        clip?.axis === "x" ? stroke.materialAnchor.x : stroke.materialAnchor.y;
    if (clip && (coordinate < clip.min || coordinate >= clip.max))
      return undefined;
    return {
      anchor: point(stroke.materialAnchor),
      direction: point(stroke.direction),
      inherited: binding.id !== stroke.sourceId,
      attenuation: 1,
    };
  }
  if (binding.inheritParent && binding.parentId) {
    const parent = byId.get(binding.parentId);
    if (parent) {
      const match = bindingMatch(parent, stroke, byId, visiting);
      if (match)
        return {
          ...match,
          inherited: true,
          attenuation: match.attenuation * 0.55,
        };
    }
  }
  return undefined;
}
/** This module produces optional material biases only; it never paints or changes care/genetics. */
export function createGroomingSimulation(input: readonly GroomStroke[] = []) {
  const timeline = freeze(normalizeGroomTimeline(input)),
    accepted = acceptedTimeline(timeline);
  return Object.freeze({
    timeline,
    stateAt(
      rawAge: number,
      inputBindings: readonly GroomingBinding[],
    ): GroomingState {
      const age = Math.max(0, Number.isFinite(rawAge) ? rawAge : 0);
      let low = 0,
        high = accepted.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (accepted[mid].stroke.tick / 24 <= age) low = mid + 1;
        else high = mid;
      }
      const prefix = accepted.slice(0, low),
        days = new Map<number, number>();
      let acceptedStrength = 0,
        cappedStrength = 0;
      for (const event of prefix) {
        const day = Math.floor(event.stroke.tick / 24);
        days.set(day, (days.get(day) ?? 0) + event.accepted);
        acceptedStrength += event.accepted;
        cappedStrength += event.capped;
      }
      const events = prefix
        .filter((e) => e.accepted > 0)
        .map((e) => ({
          ...e,
          response: groomResponse(age - e.stroke.tick / 24),
        }));
      const bindings = [...inputBindings].sort((a, b) =>
          compareText(a.id, b.id),
        ),
        byId = new Map(bindings.map((b) => [b.id, b]));
      const modifiers: [string, GroomModifier][] = [];
      for (const binding of bindings) {
        if (
          ["eye", "mouth", "decoration"].includes(binding.kind) ||
          !finitePoint(binding.materialAnchor) ||
          !finitePoint(binding.growthAxis)
        )
          continue;
        const opportunity = {
          length: clamp(
            Number.isFinite(binding.geneticOpportunity.length)
              ? binding.geneticOpportunity.length
              : 0,
            0,
            1,
          ),
          bend: clamp(
            Number.isFinite(binding.geneticOpportunity.bend)
              ? binding.geneticOpportunity.bend
              : 0,
            0,
            1,
          ),
        };
        const axis = unit(binding.growthAxis),
          radius = clamp(
            Number.isFinite(binding.influenceRadius)
              ? binding.influenceRadius
              : 1,
            1,
            64,
          );
        let along = 0,
          across = 0,
          memory = 0,
          focusX = 0,
          focusY = 0,
          influenceCount = 0;
        const influences: GroomInfluence[] = [];
        for (const event of events) {
          if (event.response <= 0) continue;
          const match = bindingMatch(binding, event.stroke, byId);
          if (!match) continue;
          const dx = match.anchor.x - binding.materialAnchor.x,
            dy = match.anchor.y - binding.materialAnchor.y;
          const falloff = Math.exp(
            -(dx * dx + dy * dy) / (2 * radius * radius),
          );
          const weight =
            event.accepted * event.response * falloff * match.attenuation;
          if (weight < 1e-12) continue;
          along +=
            weight * (match.direction.x * axis.x + match.direction.y * axis.y);
          across +=
            weight * (axis.x * match.direction.y - axis.y * match.direction.x);
          memory += weight;
          focusX += match.anchor.x * weight;
          focusY += match.anchor.y * weight;
          influenceCount++;
          const last = influences[influences.length - 1];
          if (
            influences.length < 8 ||
            weight > last.weight ||
            (weight === last.weight &&
              compareText(event.key, last.strokeId) < 0)
          ) {
            influences.push({
              strokeId: event.key,
              sourceId: event.stroke.sourceId,
              materialAnchor: match.anchor,
              direction: match.direction,
              weight,
              inherited: match.inherited,
            });
            influences.sort(
              (a, b) =>
                b.weight - a.weight || compareText(a.strokeId, b.strokeId),
            );
            if (influences.length > 8) influences.pop();
          }
        }
        modifiers.push([
          binding.id,
          {
            bindingId: binding.id,
            lengthDelta:
              GROOMING_RULES.maximumLengthDelta *
              opportunity.length *
              Math.tanh(along / 1.5),
            bendRadians:
              GROOMING_RULES.maximumBendRadians *
              opportunity.bend *
              Math.tanh(across / 1.5),
            priorityBias:
              GROOMING_RULES.maximumPriorityBias *
              Math.max(opportunity.length, opportunity.bend) *
              Math.tanh(memory / 2),
            memory,
            materialFocus:
              memory > 1e-12
                ? { x: focusX / memory, y: focusY / memory }
                : point(binding.materialAnchor),
            influenceCount,
            influences,
          },
        ]);
      }
      return freeze({
        developmentalAge: age,
        byRegion: Object.fromEntries(modifiers),
        input: {
          appliedStrokes: prefix.filter((e) => e.accepted > 0).length,
          acceptedStrength,
          cappedStrength,
          days: [...days]
            .sort(([a], [b]) => a - b)
            .map(([day, acceptedStrength]) => ({ day, acceptedStrength })),
        },
      });
    },
  });
}

import { isNeedId, NEED_IDS, type NeedId } from "./catalog";
import {
  DEFAULT_FULFILLMENT,
  MAX_NEED_KEYFRAMES,
  MAX_NEED_TICK,
  type NeedKeyframe,
} from "./types";

const order = new Map(NEED_IDS.map((id, index) => [id, index]));
function validTick(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0 || tick > MAX_NEED_TICK)
    throw new Error(
      `Need timeline tick must be a safe whole hour from 0 to ${MAX_NEED_TICK}.`,
    );
}
/** Strict bounds, last-write-wins at the same need/hour, stable canonical order. */
export function normalizeNeedTimeline(value: unknown): NeedKeyframe[] {
  if (!Array.isArray(value) || value.length > MAX_NEED_KEYFRAMES)
    throw new Error("Need timeline exceeds the supported keyframe budget.");
  const unique = new Map<string, NeedKeyframe>();
  for (const candidate of value) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate) ||
      Object.keys(candidate).some(
        (key) => !["needId", "tick", "fulfillment"].includes(key),
      ) ||
      !isNeedId(candidate.needId)
    )
      throw new Error(
        "Need timeline contains an unknown need or keyframe field.",
      );
    validTick(candidate.tick);
    if (
      typeof candidate.fulfillment !== "number" ||
      !Number.isFinite(candidate.fulfillment) ||
      candidate.fulfillment < 0 ||
      candidate.fulfillment > 1
    )
      throw new Error("Need fulfillment must be a number from 0 to 1.");
    unique.set(candidate.needId + ":" + candidate.tick, {
      needId: candidate.needId,
      tick: candidate.tick,
      fulfillment: candidate.fulfillment,
    });
  }
  return [...unique.values()].sort(
    (a, b) => a.tick - b.tick || order.get(a.needId)! - order.get(b.needId)!,
  );
}
export function setNeedKeyframe(
  timeline: readonly NeedKeyframe[],
  frame: NeedKeyframe,
): NeedKeyframe[] {
  // Replacing a keyframe remains possible even at the event budget.
  return normalizeNeedTimeline([
    ...timeline.filter(
      (item) => item.needId !== frame.needId || item.tick !== frame.tick,
    ),
    frame,
  ]);
}
export function removeNeedKeyframe(
  timeline: readonly NeedKeyframe[],
  needId: NeedId,
  tick: number,
): NeedKeyframe[] {
  if (!isNeedId(needId)) throw new Error("Unknown need.");
  validTick(tick);
  return normalizeNeedTimeline(timeline).filter(
    (frame) => frame.needId !== needId || frame.tick !== tick,
  );
}
/** The event at an hour applies immediately; the default before it is exactly .75. */
export function needValueAt(
  timeline: readonly NeedKeyframe[],
  needId: NeedId,
  tick: number,
): number {
  if (!isNeedId(needId)) throw new Error("Unknown need.");
  if (!Number.isFinite(tick))
    throw new Error("Need timeline time must be finite.");
  let value = DEFAULT_FULFILLMENT,
    latest = -1;
  for (const frame of timeline)
    if (frame.needId === needId && frame.tick <= tick && frame.tick >= latest) {
      value = frame.fulfillment;
      latest = frame.tick;
    }
  return value;
}

export type NeedTimelineHistory = {
  past: NeedKeyframe[][];
  present: NeedKeyframe[];
  future: NeedKeyframe[][];
};
const HISTORY_LIMIT = 50;
export function createNeedTimelineHistory(
  initial: readonly NeedKeyframe[] = [],
): NeedTimelineHistory {
  return { past: [], present: normalizeNeedTimeline(initial), future: [] };
}
function copy(timeline: readonly NeedKeyframe[]): NeedKeyframe[] {
  return timeline.map((frame) => ({ ...frame }));
}
export function commitNeedTimeline(
  history: NeedTimelineHistory,
  timeline: readonly NeedKeyframe[],
): NeedTimelineHistory {
  const next = normalizeNeedTimeline(timeline);
  if (JSON.stringify(next) === JSON.stringify(history.present))
    return {
      past: history.past.map(copy),
      present: copy(history.present),
      future: history.future.map(copy),
    };
  return {
    past: [...history.past.map(copy), copy(history.present)].slice(
      -HISTORY_LIMIT,
    ),
    present: next,
    future: [],
  };
}
export function undoNeedTimeline(
  history: NeedTimelineHistory,
): NeedTimelineHistory {
  if (!history.past.length) return commitNeedTimeline(history, history.present);
  return {
    past: history.past.slice(0, -1).map(copy),
    present: copy(history.past[history.past.length - 1]),
    future: [copy(history.present), ...history.future.map(copy)].slice(
      0,
      HISTORY_LIMIT,
    ),
  };
}
export function redoNeedTimeline(
  history: NeedTimelineHistory,
): NeedTimelineHistory {
  if (!history.future.length)
    return commitNeedTimeline(history, history.present);
  return {
    past: [...history.past.map(copy), copy(history.present)].slice(
      -HISTORY_LIMIT,
    ),
    present: copy(history.future[0]),
    future: history.future.slice(1).map(copy),
  };
}

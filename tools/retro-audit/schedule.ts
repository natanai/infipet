import type { PetAction } from "../../src/simulation";
import type { RetroCase, RetroCheckpoint } from "./types";

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === "object") {
    Object.values(value).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
};
/** Frozen before v10 seed search; never inferred from a target, seed, care result or pose score. */
export const RETRO_AUDIT_SCHEDULE = deepFreeze({
  version: "retro-full-life-schedule-v1",
  startedAtHourUtc: 9,
  utcOffsetMinutes: 0,
  inputGridMinutes: 10,
  nonbirthReferenceOffsetHours: 1,
  transitionOffsetsHours: [
    -1 / 60,
    0,
    ...Array.from({ length: 12 }, (_, i) => (i + 1) / 12),
  ] as readonly number[],
  actionPhases: [0, 0.25, 0.5, 0.75] as readonly number[],
  actions: ["idle", "move", "play", "greet"] as readonly PetAction[],
  retirementHour: 194,
  trainingStrategy:"fixed-high-five-legal-rounds-v1",
  terminalBoundExtraHours: 1,
  retainedFormHours: [194,336, 504, 708] as readonly number[],
  preDeathOffsetsHours: [1, 1 / 60] as readonly number[],
  maxMaterialCellsPerFiveMinutes: 2,
  maxFeatureCellsPerFiveMinutes: 2,
  actionTarget: { x: 48, y: 38 },
});

export function commitmentHour(checkpoint: RetroCheckpoint): number {
  return checkpoint.expectedStage === "hatchling" ||
    checkpoint.expectedStage === "egg"
    ? checkpoint.atHour
    : checkpoint.atHour - RETRO_AUDIT_SCHEDULE.nonbirthReferenceOffsetHours;
}

/** Diagnostics have no reference target and cannot choose a favorable pose or stage label. */
export function diagnosticSchedule(
  case_: RetroCase,
  deathHour?: number,
): RetroCheckpoint[] {
  const samples: RetroCheckpoint[] = [];
  const add = (
    base: RetroCheckpoint,
    suffix: string,
    atHour: number,
    action: PetAction,
    animationTime: number,
    kind: "transition" | "action" | "interstage" | "retention",
  ) => {
    if (atHour < 0) return;
    samples.push({
      ...base,
      id: `${base.id}/${suffix}`,
      atHour,
      action,
      actionTarget:
        action === "play" || action === "greet"
          ? { ...RETRO_AUDIT_SCHEDULE.actionTarget }
          : undefined,
      animationTime,
      sampleKind: kind,
      target: undefined,
      referenceStatus: "unavailable",
      expectedBranch: undefined,
    });
  };
  for (const [index, checkpoint] of case_.checkpoints.entries()) {
    const boundary = commitmentHour(checkpoint);
    if (index) {
      for (const offset of RETRO_AUDIT_SCHEDULE.transitionOffsetsHours)
        add(
          checkpoint,
          `transition-${offset}`,
          boundary + offset,
          "idle",
          0,
          "transition",
        );
      const previous = commitmentHour(case_.checkpoints[index - 1]);
      add(
        checkpoint,
        "interstage",
        (previous + boundary) / 2,
        "idle",
        0,
        "interstage",
      );
    }
    for (const action of RETRO_AUDIT_SCHEDULE.actions)
      for (const phase of RETRO_AUDIT_SCHEDULE.actionPhases)
        add(
          checkpoint,
          `${action}-${phase}`,
          checkpoint.atHour,
          action,
          phase,
          "action",
        );
  }
  const final = case_.checkpoints.at(-1)!;
  const retention = [
    ...RETRO_AUDIT_SCHEDULE.retainedFormHours,
    ...(deathHour === undefined
      ? []
      : RETRO_AUDIT_SCHEDULE.preDeathOffsetsHours.map(
          (offset) => deathHour - offset,
        )),
  ];
  for (const hour of [...new Set(retention)].sort((a, b) => a - b)) {
    if (hour > final.atHour && (deathHour === undefined || hour < deathHour)) {
      add(final, `retained-${hour}`, hour, "idle", 0, "retention");
      const sample = samples.at(-1)!;
      sample.target = final.target;
      sample.referenceStatus = final.referenceStatus;
      sample.expectedBranch = final.expectedBranch;
    }
  }
  return samples.sort(
    (a, b) => a.atHour - b.atHour || a.id.localeCompare(b.id),
  );
}

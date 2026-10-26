import type { Pixel } from "../../src/simulation";
import { replayWitness } from "./engine";
import { diagnosticSchedule, RETRO_AUDIT_SCHEDULE } from "./schedule";
import {
  compareBitmaps,
  compareRelativeDimensions,
  measureBitmap,
  meetsNearExactGate,
  pixelsToBitmap,
} from "./metrics";
import type {
  CapturedCheckpoint,
  DiagnosticEvidence,
  RetroCase,
  TerminalEvidence,
  WitnessRecipe,
} from "./types";

const faceKinds = new Set(["eye", "mouth"]);
const sourceIntact = (capture: CapturedCheckpoint) =>
  !capture.sourceIntegrity.missingSourceIds.length &&
  !capture.sourceIntegrity.emptyFaceIds.length &&
  !capture.sourceIntegrity.hiddenFaceIds.length &&
  !capture.sourceIntegrity.unverifiedFaceTransportIds?.length &&
  !capture.sourceIntegrity.lowContrastFaceIds?.length;
function materialDistance(a: readonly Pixel[], b: readonly Pixel[]): number {
  const directed = (from: readonly Pixel[], to: readonly Pixel[]) => {
    if (!from.length) return 0;
    if (!to.length) return Infinity;
    const distances = new Int16Array(4096).fill(-1),
      queue: number[] = [];
    for (const point of to) {
      const at = point.y * 64 + point.x;
      if (distances[at] === -1) {
        distances[at] = 0;
        queue.push(at);
      }
    }
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const at = queue[cursor],
        x = at % 64,
        y = Math.floor(at / 64);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= 64 || ny >= 64) continue;
          const next = ny * 64 + nx;
          if (distances[next] === -1) {
            distances[next] = distances[at] + 1;
            queue.push(next);
          }
        }
    }
    return Math.max(...from.map((point) => distances[point.y * 64 + point.x]));
  };
  return Math.max(directed(a, b), directed(b, a));
}
function featureCenters(capture: CapturedCheckpoint) {
  const centers = new Map<string, { x: number; y: number }>();
  for (const part of capture.parts ?? [])
    if (faceKinds.has(part.kind)) {
      const point = {
        x: part.bounds.x + part.bounds.width / 2,
        y: part.bounds.y + part.bounds.height / 2,
      };
      for (const id of [part.sourcePartId, ...(part.sourcePartIds ?? [])])
        if (id) centers.set(id, point);
    }
  return centers;
}

/** Target-independent poses/transition times; source ancestry and native scale are never normalized away. */
export function auditDiagnostics(
  recipe: WitnessRecipe,
  case_: RetroCase,
  terminal: TerminalEvidence,
  birth: CapturedCheckpoint,
): DiagnosticEvidence {
  const samples = diagnosticSchedule(case_, terminal.terminal?.atHour).filter(
    (sample) => sample.atHour <= recipe.endHour,
  );
  const captures = replayWitness(recipe, samples);
  const failures: string[] = [];
  let maximumMaterialStep = 0,
    maximumFeatureStep = 0,
    unscored = false;
  const priorTransition = new Map<string, CapturedCheckpoint>();
  const rows = captures.map((capture) => {
    const point = capture.checkpoint,
      actual = pixelsToBitmap(capture.pixels);
    const intact = sourceIntact(capture);
    if (!intact)
      failures.push(
        `${point.id}: source feature or contrast continuity failed`,
      );
    if (capture.genomeFingerprint !== birth.genomeFingerprint)
      failures.push(`${point.id}: inherited genome changed`);
    if (
      capture.game.dead &&
      point.atHour < (terminal.terminal?.atHour ?? Infinity)
    )
      failures.push(`${point.id}: unexpectedly dead before terminal boundary`);
    if (point.sampleKind === "transition") {
      const group = point.id.split("/transition-")[0],
        prior = priorTransition.get(group);
      if (prior) {
        const material = materialDistance(prior.pixels, capture.pixels);
        const before = featureCenters(prior),
          after = featureCenters(capture);
        const feature = Math.max(
          0,
          ...[...before].map(([id, p]) => {
            const q = after.get(id);
            return q
              ? Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y))
              : Infinity;
          }),
        );
        maximumMaterialStep = Math.max(maximumMaterialStep, material);
        maximumFeatureStep = Math.max(maximumFeatureStep, feature);
        const units = Math.max(
          1,
          Math.ceil((point.atHour - prior.checkpoint.atHour) * 12 - 1e-7),
        );
        if (
          material >
          units * RETRO_AUDIT_SCHEDULE.maxMaterialCellsPerFiveMinutes
        )
          failures.push(`${point.id}: material teleported ${material} cells`);
        if (
          feature >
          units * RETRO_AUDIT_SCHEDULE.maxFeatureCellsPerFiveMinutes
        )
          failures.push(
            `${point.id}: source feature teleported ${feature} cells`,
          );
      }
      priorTransition.set(group, capture);
    }
    let referenceMetrics = null;
    if (point.sampleKind === "retention") {
      if (
        point.target &&
        birth.checkpoint.target &&
        !["provisional", "unavailable"].includes(point.referenceStatus)
      ) {
        referenceMetrics = compareBitmaps(actual, point.target);
        const scale = compareRelativeDimensions(
          actual,
          pixelsToBitmap(birth.pixels),
          point.target,
          birth.checkpoint.target,
        );
        if (!meetsNearExactGate(referenceMetrics) || !scale.passed)
          failures.push(
            `${point.id}: final form not retained near the reference through life`,
          );
      } else unscored = true;
      if (capture.game.stage !== case_.checkpoints.at(-1)!.expectedStage)
        failures.push(
          `${point.id}: terminal form changed to another gameplay stage`,
        );
    }
    return {
      id: point.id,
      atHour: point.atHour,
      animationTime: point.animationTime,
      action: point.action ?? ("idle" as const),
      kind: point.sampleKind ?? "reference",
      frameHash: capture.frameHash,
      sourcePreserved: intact,
      alive: !capture.game.dead,
      stage: capture.game.stage,
      bounds: measureBitmap(actual),
      referenceMetrics,
    };
  });
  return {
    scheduleVersion: RETRO_AUDIT_SCHEDULE.version,
    status: failures.length ? "failed" : unscored ? "unscored" : "passed",
    maximumMaterialStep,
    maximumFeatureStep,
    failures,
    samples: rows,
  };
}

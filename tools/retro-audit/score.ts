import {
  compareBitmaps,
  meetsNearExactGate,
  pixelsToBitmap,
  compareRelativeDimensions,
  measureBitmap,
} from "./metrics";
import { digest, sourceBirthExact } from "./engine";
import type {
  CapturedCheckpoint,
  LifecycleScore,
  WitnessRecipe,
  CheckpointScore,
  TerminalEvidence,
  RetroCase,
  DiagnosticEvidence,
} from "./types";

/** Targets are admitted only here, after a genuine game/render replay has completed. */
export function scoreLifecycle(
  recipe: WitnessRecipe,
  captures: readonly CapturedCheckpoint[],
  terminal?: TerminalEvidence,
  nativeHistory?: RetroCase["nativeHistory"],
  diagnostics?: DiagnosticEvidence,
): LifecycleScore {
  const birthExact = sourceBirthExact(recipe);
  const birth = captures[0];
  const nativeHistoryStatus = nativeHistory
    ? ("unverified-controller-mapping" as const)
    : ("not-applicable" as const);
  const checkpoints: CheckpointScore[] = captures.map((capture) => {
    const c = capture.checkpoint;
    const stageReached =
      capture.game.stage === c.expectedStage &&
      Math.abs(
        (capture.game.clock.nowMs - capture.game.clock.hatchAtMs) / 3_600_000 -
          c.atHour,
      ) < 1e-7;
    const sourcePreserved =
      !capture.sourceIntegrity.missingSourceIds.length &&
      !capture.sourceIntegrity.emptyFaceIds.length &&
      !capture.sourceIntegrity.hiddenFaceIds.length &&
      !capture.sourceIntegrity.unverifiedFaceTransportIds?.length &&
      !capture.sourceIntegrity.lowContrastFaceIds?.length;
    const available =
      !!c.target &&
      c.referenceStatus !== "unavailable" &&
      c.referenceStatus !== "provisional";
    const metrics = available
      ? compareBitmaps(pixelsToBitmap(capture.pixels), c.target!)
      : null;
    const relativeDimensions =
      available &&
      birth?.checkpoint.target &&
      !["provisional", "unavailable"].includes(birth.checkpoint.referenceStatus)
        ? compareRelativeDimensions(
            pixelsToBitmap(capture.pixels),
            pixelsToBitmap(birth.pixels),
            c.target!,
            birth.checkpoint.target,
          )
        : null;
    const bounds = measureBitmap(pixelsToBitmap(capture.pixels));
    const sourceFeatureGeometry = (capture.parts ?? [])
      .filter((part) => part.kind === "eye" || part.kind === "mouth")
      .map((part) => ({
        id: part.id,
        sourcePartIds: [
          ...new Set(
            [part.sourcePartId, ...(part.sourcePartIds ?? [])].filter(
              (id): id is string => !!id,
            ),
          ),
        ],
        kind: part.kind,
        relativeX: bounds.width
          ? (part.bounds.x + part.bounds.width / 2 - bounds.left) / bounds.width
          : 0,
        relativeY: bounds.height
          ? (part.bounds.y + part.bounds.height / 2 - bounds.top) /
            bounds.height
          : 0,
        relativeWidth: bounds.width ? part.bounds.width / bounds.width : 0,
        relativeHeight: bounds.height ? part.bounds.height / bounds.height : 0,
        contrast:
          capture.sourceFeatureContrasts?.[part.id] ??
          part.surfaceExpression?.contrastAfter ??
          null,
        transport: part.surfaceExpression?.operation ?? "identity",
      }));
    const actualBranch = capture.game.stageCommitments.at(-1)?.branch ?? null;
    const referenceBranchMatched = c.expectedBranch
      ? actualBranch === c.expectedBranch
      : null;
    const failed =
      !stageReached ||
      capture.game.dead ||
      !sourcePreserved ||
      !birthExact ||
      referenceBranchMatched === false ||
      relativeDimensions?.passed === false ||
      (!!metrics && !meetsNearExactGate(metrics));
    const unresolved = !available || c.careEvidence !== "documented";
    return {
      id: c.id,
      characterId: c.characterId,
      name: c.name,
      atHour: c.atHour,
      animationTime: c.animationTime,
      expectedStage: c.expectedStage,
      actualStage: capture.game.stage,
      status: failed ? "failed" : unresolved ? "unscored" : "machine-candidate",
      ...(!available
        ? {
            unavailableReason:
              "No verified monochrome reference target is available.",
          }
        : c.careEvidence !== "documented"
          ? {
              unavailableReason:
                "The care route is not documented; visual distance is measured but care parity is unscored.",
            }
          : {}),
      metrics,
      stageReached,
      alive: !capture.game.dead,
      sourcePreserved,
      actualBranch,
      expectedBranch: c.expectedBranch ?? null,
      referenceBranchMatched,
      frameHash: capture.frameHash,
      targetHash: available ? digest(c.target) : null,
      referenceTiming: c.referenceTiming,
      careEvidence: c.careEvidence,
      relativeDimensions,
      sourceFeatureGeometry,
      referenceFeatureGeometry: "unverified",
    };
  });
  const values = checkpoints.flatMap((c) =>
    c.metrics ? [c.metrics.silhouetteIoU] : [],
  );
  const gameEligible =
    birthExact &&
    checkpoints.length > 0 &&
    checkpoints.every(
      (point) =>
        point.stageReached &&
        point.alive &&
        point.sourcePreserved &&
        point.referenceBranchMatched !== false,
    );
  return {
    gameEligible,
    status:
      checkpoints.some((c) => c.status === "failed") ||
      terminal?.complete === false ||
      diagnostics?.status === "failed"
        ? "failed"
        : checkpoints.length &&
            checkpoints.every((c) => c.status === "machine-candidate") &&
            terminal?.complete &&
            nativeHistoryStatus === "not-applicable" &&
            diagnostics?.status === "passed"
          ? "candidate-needs-visual-review"
          : "unscored",
    worstIoU: values.length ? Math.min(...values) : null,
    meanIoU: values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null,
    scoredStages: values.length,
    totalStages: checkpoints.length,
    birthExact,
    referenceParityEstablished: false,
    visualReview: "unreviewed",
    checkpoints,
    fullLifeComplete: terminal?.complete ?? false,
    fullLifeEligible: gameEligible && !!terminal?.complete,
    ...(terminal ? { terminal } : {}),
    nativeHistoryStatus,
    ...(diagnostics ? { diagnostics } : {}),
  };
}

import assert from "node:assert/strict";
import { GAME_RULES, HOUR } from "../../src/gameplay";
import {
  buildPolicyWitness,
  CARE_POLICIES,
  digest,
  replayWitness,
} from "./engine";
import { cohortSeed } from "./search";
import { scoreLifecycle } from "./score";
import { lifetimeEvidence } from "./lifetime";
import { auditDiagnostics } from "./diagnostics";
import { RETRO_AUDIT_SCHEDULE } from "./schedule";
import type {
  CapturedCheckpoint,
  RetroCase,
  RetroAuditSummary,
  SearchResult,
  WitnessRecipe,
} from "./types";

export type StagedProgress = NonNullable<RetroAuditSummary["stagedSearch"]>;
/** Root-batched early rejection. One candidate always means one source, ordinary seed and policy. */
export function searchStaged(
  cases: readonly RetroCase[],
  options: {
    seedCount: number;
    seedStart?: number;
    policyIds: string[];
    maxInputs?: number;
    maxMs?: number;
    onProgress?: (progress: StagedProgress) => void;
  },
): { results: SearchResult[]; progress: StagedProgress } {
  const seedStart = options.seedStart ?? 0;
  if (
    !Number.isSafeInteger(options.seedCount) ||
    options.seedCount < 1 ||
    options.seedCount > 1_000_000 ||
    !Number.isSafeInteger(seedStart) ||
    seedStart < 0 ||
    !options.policyIds.length ||
    options.policyIds.some(
      (id) => !CARE_POLICIES.some((policy) => policy.id === id),
    )
  )
    throw new Error("Invalid staged neutral cohort budget.");
  if (
    (options.maxInputs !== undefined &&
      (!Number.isSafeInteger(options.maxInputs) || options.maxInputs < 1)) ||
    (options.maxMs !== undefined &&
      (!Number.isFinite(options.maxMs) || options.maxMs < 0))
  )
    throw new Error("Invalid explicit staged input/time budget.");
  const began = Date.now(),
    results = new Map<string, SearchResult>();
  const progress: StagedProgress = {
    uniqueInputCandidates: 0,
    prefixSimulations: 0,
    uniquePrefixInputs: 0,
    fullLivesSimulated: 0,
    budgetExhausted: false,
    elapsedMs: 0,
    nextByRoot: {},
  };
  const groups = new Map<string, RetroCase[]>();
  for (const case_ of cases) {
    const unscoredReference = case_.checkpoints.some(
      (point) =>
        !point.target ||
        ["provisional", "unavailable"].includes(point.referenceStatus),
    );
    results.set(case_.id, {
      caseId: case_.id,
      candidatesTried: 0,
      seedsTried: 0,
      policiesTried: [...options.policyIds],
      searchMode: "staged",
      status: "unscored",
      prefixSearch: {
        attemptedInputs: 0,
        prefixSimulations: 0,
        fullLivesSimulated: 0,
        rejectedAt: {},
        rejectionReasons: {},
        unscoredReference,
      },
      winner: null,
    });
    if (unscoredReference) continue;
    const key = digest(case_.source);
    groups.set(key, [...(groups.get(key) ?? []), case_]);
  }
  const stopped = () => {
    const stop =
      (options.maxInputs !== undefined &&
        progress.uniqueInputCandidates >= options.maxInputs) ||
      (!!options.maxMs && Date.now() - began >= options.maxMs);
    if (stop) progress.budgetExhausted = true;
    return stop;
  };
  const publish = () => {
    progress.elapsedMs = Date.now() - began;
    options.onProgress?.(structuredClone(progress));
  };
  outer: for (const group of groups.values()) {
    const root = group[0].rootCharacterId;
    const prefixFrames = new Map<string, CapturedCheckpoint>();
    progress.nextByRoot[root] = { seedIndex: seedStart, policyIndex: 0 };
    for (let index = 0; index < options.seedCount; index++)
      for (
        let policyIndex = 0;
        policyIndex < options.policyIds.length;
        policyIndex++
      ) {
        progress.nextByRoot[root] = {
          seedIndex: seedStart + index,
          policyIndex,
        };
        if (stopped()) break outer;
        const seed = cohortSeed(seedStart + index),
          policyId = options.policyIds[policyIndex];
        if (policyIndex === 0) prefixFrames.clear();
        progress.uniqueInputCandidates++;
        for (const case_ of group) {
          const row = results.get(case_.id)!;
          row.candidatesTried++;
          if (!row.winner) row.status = "failed";
          row.seedsTried = index + 1;
          row.prefixSearch!.attemptedInputs++;
        }
        let active = [...group],
          previousPrefix: WitnessRecipe | null = null;
        let fullRecipe: WitnessRecipe | null = null;
        const points = [
          ...new Set(
            group.flatMap((case_) =>
              case_.checkpoints.map((point) => point.atHour),
            ),
          ),
        ].sort((a, b) => a - b);
        const acceptedCaptures = new Map<string, CapturedCheckpoint[]>();
        for (const atHour of points) {
          if (!active.length) break;
          const prefix = buildPolicyWitness({
            source: group[0].source,
            seed,
            policyId,
            endHour: atHour,
          });
          if (previousPrefix)
            assert.deepEqual(
              prefix.commands.filter(
                (event) => event.atHour <= previousPrefix!.endHour,
              ),
              previousPrefix.commands,
              "A later prefix rewrote real earlier player inputs",
            );
          previousPrefix = prefix;
          progress.prefixSimulations++;
          const atThisTime = active.filter((case_) =>
            case_.checkpoints.some((point) => point.atHour === atHour),
          );
          if (!atThisTime.length) continue;
          const barePoint = {
            ...atThisTime[0].checkpoints.find(
              (point) => point.atHour === atHour,
            )!,
            id: "staged-neutral",
            characterId: "audit-only",
            name: "Ordinary prefix checkpoint",
            target: undefined,
            referenceStatus: "unavailable" as const,
            expectedBranch: undefined,
          };
          const frameKey = digest([
            prefix.source.parts,
            prefix.seed,
            prefix.source.mode,
            prefix.startedAtMs,
            prefix.utcOffsetMinutes,
            prefix.commands,
            atHour,
            barePoint.animationTime,
            barePoint.action ?? "idle",
            barePoint.actionTarget,
          ]);
          let actual = prefixFrames.get(frameKey);
          if (!actual) {
            actual = replayWitness(prefix, [barePoint])[0];
            prefixFrames.set(frameKey, actual);
            progress.uniquePrefixInputs!++;
          }
          const outcomes = new Map<string, ReturnType<typeof scoreLifecycle>>();
          const continuing: RetroCase[] = [];
          for (const case_ of active) {
            const point = case_.checkpoints.find(
              (checkpoint) => checkpoint.atHour === atHour,
            );
            if (!point) {
              continuing.push(case_);
              continue;
            }
            const row = results.get(case_.id)!,
              stats = row.prefixSearch!;
            stats.prefixSimulations++;
            const captures: CapturedCheckpoint[] = [
              ...(acceptedCaptures.get(case_.id) ?? []),
              { ...actual, checkpoint: point },
            ];
            const key = digest(
              captures.map((capture) => [
                capture.checkpoint.target,
                capture.checkpoint.expectedStage,
                capture.checkpoint.expectedBranch,
                capture.checkpoint.referenceStatus,
                capture.checkpoint.careEvidence,
              ]),
            );
            let score = outcomes.get(key);
            if (!score) {
              score = scoreLifecycle(prefix, captures);
              outcomes.set(key, score);
            }
            const rejected = score.checkpoints.some(
              (checkpoint) =>
                checkpoint.status === "failed" || !checkpoint.metrics,
            );
            if (rejected) {
              const stage = `${point.expectedStage}@${point.atHour}`;
              stats.rejectedAt[stage] = (stats.rejectedAt[stage] ?? 0) + 1;
            const last=score.checkpoints.at(-1)!;
            const reasons=[!score.birthExact?"birth-not-exact":null,!last.stageReached?"stage-not-earned":null,!last.sourcePreserved?"source-feature-continuity":null,last.referenceBranchMatched===false?"reference-slot-not-earned":null,last.relativeDimensions?.passed===false?"relative-native-size":null,last.metrics&&last.status==="failed"?"morphology-or-topology":null].filter((reason):reason is string=>!!reason);
            for(const reason of reasons)stats.rejectionReasons![reason]=(stats.rejectionReasons![reason]??0)+1;
            const partial={seed,policyId,atHour,worstIoU:score.worstIoU,frameHash:actual.frameHash,relativeSizePassed:!!last.relativeDimensions?.passed,sourcePreserved:last.sourcePreserved,stageReached:last.stageReached};
              if (
                !stats.bestRejectedPrefix ||
                (score.worstIoU ?? -1) >
                  (stats.bestRejectedPrefix.worstIoU ?? -1)
              )
              stats.bestRejectedPrefix = partial;
            if(last.relativeDimensions?.passed&&last.sourcePreserved&&last.stageReached&&last.referenceBranchMatched!==false&&(!stats.bestRawSizeEligiblePrefix||(score.worstIoU??-1)>(stats.bestRawSizeEligiblePrefix.worstIoU??-1)))stats.bestRawSizeEligiblePrefix=partial;
              continue;
            }
            acceptedCaptures.set(case_.id, captures);
            if (point !== case_.checkpoints.at(-1)) {
              continuing.push(case_);
              continue;
            }
            if (!fullRecipe) {
              fullRecipe = buildPolicyWitness({
                source: case_.source,
                seed,
                policyId,
                endHour:
                  GAME_RULES.lifespanMs / HOUR +
                  RETRO_AUDIT_SCHEDULE.terminalBoundExtraHours,
              });
              assert.deepEqual(
                fullRecipe.commands.filter(
                  (event) => event.atHour <= prefix.endHour,
                ),
                prefix.commands,
                "Full-life continuation changed the input prefix",
              );
              progress.fullLivesSimulated++;
            }
            stats.fullLivesSimulated++;
            const fullCaptures = replayWitness(fullRecipe, case_.checkpoints);
            assert.deepEqual(
              fullCaptures.map((capture) => capture.frameHash),
              captures.map((capture) => capture.frameHash),
              "Full-life replay rewrote an earlier generated frame",
            );
            const terminal = lifetimeEvidence(
              fullRecipe,
              point.atHour,
              point.expectedStage,
              point.expectedBranch,
            );
            const diagnostics = auditDiagnostics(
              fullRecipe,
              case_,
              terminal,
              fullCaptures[0],
            );
            const fullScore = scoreLifecycle(
              fullRecipe,
              fullCaptures,
              terminal,
              case_.nativeHistory,
              diagnostics,
            );
            const candidate = {
              recipe: fullRecipe,
              score: fullScore,
              captures: fullCaptures,
            };
            const rank = (winner: NonNullable<SearchResult["winner"]>) => [
              winner.score.status === "candidate-needs-visual-review"
                ? 2
                : winner.score.status === "unscored"
                  ? 1
                  : 0,
              winner.score.fullLifeEligible ? 1 : 0,
              winner.score.worstIoU ?? -1,
              winner.score.meanIoU ?? -1,
            ];
            const better = (a: number[], b: number[]) => {
              for (let at = 0; at < a.length; at++) {
                if (a[at] > b[at]) return true;
                if (a[at] < b[at]) return false;
              }
              return false;
            };
            if (!row.winner || better(rank(candidate), rank(row.winner)))
              row.winner = candidate;
            row.status = row.winner.score.status;
          }
          active = continuing;
        }
        progress.nextByRoot[root] =
          policyIndex + 1 < options.policyIds.length
            ? { seedIndex: seedStart + index, policyIndex: policyIndex + 1 }
            : { seedIndex: seedStart + index + 1, policyIndex: 0 };
        publish();
      }
  }
  publish();
  return { results: [...results.values()], progress };
}

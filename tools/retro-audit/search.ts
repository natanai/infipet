import {
  buildPolicyWitness,
  CARE_POLICIES,
  digest,
  replayWitness,
  currentVersions,
} from "./engine";
import { scoreLifecycle } from "./score";
import { lifetimeEvidence } from "./lifetime";
import { GAME_RULES, HOUR } from "../../src/gameplay";
import { RETRO_AUDIT_SCHEDULE } from "./schedule";
import { auditDiagnostics } from "./diagnostics";
import type {
  CapturedCheckpoint,
  RetroCase,
  SearchResult,
  WitnessRecipe,
} from "./types";

type Cached = { recipe: WitnessRecipe; captures: CapturedCheckpoint[] };
const policyRecipeCache = new Map<string, WitnessRecipe>();
export type SearchCache = Map<string, Cached>;
/** Same neutral seed cohort for every target and device; no character name encodes a desired endpoint. */
export const cohortSeed = (index: number) =>
  digest(`infipet-retro-cohort-v1|${index}`).slice(0, 16);
export function searchCase(
  case_: RetroCase,
  options: {
    seedCount: number;
    seedStart?: number;
    policyIds?: string[];
    cache?: SearchCache;
    endHour?: number;
    onProgress?: (progress: {
      candidatesTried: number;
      candidatesTotal: number;
      elapsedMs: number;
    }) => void;
  },
): SearchResult {
  const policyIds = options.policyIds ?? [
    "tended",
    "trained",
    "battle-trained",
  ];
  if (
    !Number.isInteger(options.seedCount) ||
    options.seedCount < 1 ||
    options.seedCount > 1024 ||
    !Number.isInteger(options.seedStart ?? 0) ||
    (options.seedStart ?? 0) < 0 ||
    !policyIds.length ||
    policyIds.some((id) => !CARE_POLICIES.some((policy) => policy.id === id))
  )
    throw new Error("Invalid bounded seed/policy search budget.");
  const cache = options.cache ?? new Map<string, Cached>(),
    endHour =
      options.endHour ??
      GAME_RULES.lifespanMs / HOUR +
        RETRO_AUDIT_SCHEDULE.terminalBoundExtraHours;
  let winner: SearchResult["winner"] = null,
    candidatesTried = 0;
  const startedAt = Date.now();
  const rank = (candidate: NonNullable<SearchResult["winner"]>) => {
    const reached = candidate.score.checkpoints.filter(
      (point) =>
        point.stageReached &&
        point.alive &&
        point.sourcePreserved &&
        point.referenceBranchMatched !== false,
    ).length;
    const hard =
      candidate.score.birthExact &&
      candidate.score.checkpoints.every(
        (point) =>
          point.stageReached &&
          point.alive &&
          point.sourcePreserved &&
          point.referenceBranchMatched !== false,
      )
        ? 1
        : 0;
    return [
      candidate.score.status === "candidate-needs-visual-review"
        ? 2
        : candidate.score.status === "unscored"
          ? 1
          : 0,
      candidate.score.fullLifeEligible ? 1 : 0,
      hard,
      reached / Math.max(1, candidate.score.totalStages),
      candidate.score.worstIoU ?? -1,
      candidate.score.meanIoU ?? -1,
    ];
  };
  const greater = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] > b[i]) return true;
      if (a[i] < b[i]) return false;
    }
    return false;
  };
  for (let i = 0; i < options.seedCount; i++)
    for (const policyId of policyIds) {
      const seed = cohortSeed((options.seedStart ?? 0) + i);
      const key = digest([
        case_.source,
        seed,
        policyId,
        endHour,
        case_.checkpoints.map((point) => [
          point.atHour,
          point.animationTime,
          point.action ?? "idle",
          point.actionTarget,
        ]),
      ]);
      let cached = cache.get(key);
      if (!cached) {
        const policyKey = digest([
          currentVersions(),
          case_.source.mode,
          seed,
          policyId,
          endHour,
        ]);
        let template = policyRecipeCache.get(policyKey);
        if (!template) {
          template = buildPolicyWitness({
            source: case_.source,
            seed,
            policyId,
            endHour,
          });
          policyRecipeCache.set(policyKey, template);
          if (policyRecipeCache.size > 64)
            policyRecipeCache.delete(policyRecipeCache.keys().next().value!);
        }
        const recipe = structuredClone({ ...template, source: case_.source });
        const bare = case_.checkpoints.map((point) => ({
          ...point,
          id: String(point.atHour),
          characterId: "audit-only",
          name: "Ordinary game checkpoint",
          target: undefined,
          referenceStatus: "unavailable" as const,
        }));
        cached = { recipe, captures: replayWitness(recipe, bare) };
        cache.set(key, cached);
      }
      const captures = cached.captures.map((capture, index) => ({
        ...capture,
        checkpoint: structuredClone(case_.checkpoints[index]),
      }));
      const candidate = {
        recipe: cached.recipe,
        score: scoreLifecycle(
          cached.recipe,
          captures,
          lifetimeEvidence(
            cached.recipe,
            case_.checkpoints.at(-1)!.atHour,
            case_.checkpoints.at(-1)!.expectedStage,
            case_.checkpoints.at(-1)!.expectedBranch,
          ),
          case_.nativeHistory,
        ),
        captures,
      };
      if (
        candidate.score.terminal?.complete &&
        candidate.score.checkpoints.every(
          (point) => point.metrics && point.status !== "failed",
        )
      ) {
        const diagnostics = auditDiagnostics(
          candidate.recipe,
          case_,
          candidate.score.terminal,
          captures[0],
        );
        candidate.score = scoreLifecycle(
          candidate.recipe,
          captures,
          candidate.score.terminal,
          case_.nativeHistory,
          diagnostics,
        );
      }
      candidatesTried++;
      if (!winner || greater(rank(candidate), rank(winner))) winner = candidate;
      options.onProgress?.({
        candidatesTried,
        candidatesTotal: options.seedCount * policyIds.length,
        elapsedMs: Date.now() - startedAt,
      });
    }
  if (winner && !winner.score.diagnostics && winner.score.terminal) {
    const diagnostics = auditDiagnostics(
      winner.recipe,
      case_,
      winner.score.terminal,
      winner.captures[0],
    );
    winner.score = scoreLifecycle(
      winner.recipe,
      winner.captures,
      winner.score.terminal,
      case_.nativeHistory,
      diagnostics,
    );
  }
  return {
    caseId: case_.id,
    candidatesTried,
    seedsTried: options.seedCount,
    policiesTried: [...policyIds],
    winner,
  };
}

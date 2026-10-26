import { createGame, HOUR, MINUTE, type GameStage } from "../../src/gameplay";
import { digest, validateWitness, witnessGameState } from "./engine";
import type { TerminalEvidence, WitnessRecipe } from "./types";

/** Terminal state and fresh-game checks are evidence, never a substitute for input replay. */
export function lifetimeEvidence(
  raw: WitnessRecipe,
  finalReferenceHour: number,
  expectedFinalStage?: GameStage,
  expectedFinalBranch?: string,
): TerminalEvidence {
  const recipe = validateWitness(raw);
  const game = witnessGameState(recipe, recipe.endHour);
  const deathHour = game.death
    ? (game.death.atMs - game.clock.hatchAtMs) / HOUR
    : null;
  const next = createGame(
    "neutral-restart-v1",
    "infant",
    game.clock.nowMs + MINUTE,
    { utcOffsetMinutes: game.clock.utcOffsetMinutes },
  );
  const nextWithHistory = next as typeof next & { commandHistory?: unknown[] };
  const noInputsAfterDeath =
    deathHour === null ||
    recipe.commands.every((event) => event.atHour <= deathHour);
  const freshGameCreated =
    !next.dead &&
    next.stage === "hatchling" &&
    next.stageCommitments.length === 1;
  const emptyCommandHistory =
    !nextWithHistory.commandHistory?.length && !next.receipts.length;
  const zeroCareAndBattles =
    next.stats.careMistakes === 0 &&
    next.stats.battles === 0 &&
    next.stats.training === 0;
  const finalFormRetained =
    (!expectedFinalStage || game.stage === expectedFinalStage) &&
    (!expectedFinalBranch ||
      game.stageCommitments.at(-1)?.branch === expectedFinalBranch);
  return {
    complete:
      game.dead &&
      deathHour !== null &&
      deathHour >= finalReferenceHour &&
      noInputsAfterDeath &&
      finalFormRetained &&
      freshGameCreated &&
      emptyCommandHistory &&
      zeroCareAndBattles,
    terminal: game.death
      ? {
          atHour: deathHour!,
          cause: game.death.cause,
          stage: game.stage,
          stateHash: digest(game),
          commandCount: recipe.commands.length,
        }
      : null,
    finalReferenceHour,
    finalFormLivedHours:
      deathHour === null ? null : Math.max(0, deathHour - finalReferenceHour),
    noInputsAfterDeath,
    finalFormRetained,
    restart: {
      freshGameCreated,
      emptyCommandHistory,
      zeroCareAndBattles,
      stateHash: digest(next),
      creationUI: "requires-visual-review",
    },
  };
}

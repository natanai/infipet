/** Browser-safe export: ordinary saved-pet fields, no reference sprites or benchmark overrides. */
import {
  decodePet,
  PROTOTYPE_REVISION,
  LINEAGE_RECIPE_VERSION,
  type PetDocument,
} from "../../src/pet-format";
import {
  deriveCareTimeline,
  HOUR,
  MINUTE,
  GAME_RULES,
} from "../../src/gameplay";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION } from "../../src/needs";
import { replayGameRecipe, validateReplayRecipe } from "../../src/retro/replay";
import type { WitnessRecipe } from "./types";

export function rebaseWitnessClock(
  raw: WitnessRecipe,
  atHour: number,
  rebaseToMs: number,
) {
  const recipe = validateReplayRecipe(raw);
  if (
    !Number.isFinite(atHour) ||
    atHour < 0 ||
    atHour > recipe.endHour ||
    !Number.isSafeInteger(rebaseToMs)
  )
    throw new Error(
      "A portable proof requires a valid witnessed hour and destination clock.",
    );
  const checkpoint =
    recipe.startedAtMs +
    (recipe.source.mode === "egg" ? GAME_RULES.eggMs : 0) +
    Math.round(atHour * HOUR);
  const deltaMinutes = Math.floor((rebaseToMs - checkpoint) / MINUTE);
  const shifted = structuredClone(recipe);
  shifted.startedAtMs += deltaMinutes * MINUTE;
  shifted.utcOffsetMinutes =
    ((((recipe.utcOffsetMinutes - deltaMinutes + 720) % 1440) + 1440) % 1440) -
    720;
  const validated = validateReplayRecipe(shifted);
  return {
    recipe: validated,
    provenance: {
      version: "input-clock-rebase-v1" as const,
      deltaMinutes,
      fromStartedAtMs: recipe.startedAtMs,
      toStartedAtMs: validated.startedAtMs,
      fromUtcOffsetMinutes: recipe.utcOffsetMinutes,
      toUtcOffsetMinutes: validated.utcOffsetMinutes,
    },
  };
}

export function witnessPetDocument(
  raw: WitnessRecipe,
  atHour: number,
  options: { name?: string; rebaseToMs?: number } = {},
): PetDocument {
  const recipe =
    options.rebaseToMs === undefined
      ? validateReplayRecipe(raw)
      : rebaseWitnessClock(raw, atHour, options.rebaseToMs).recipe;
  if (!Number.isFinite(atHour) || atHour < 0 || atHour > recipe.endHour)
    throw new Error(
      "The exported pet must lie within the actual witnessed life.",
    );
  const game = replayGameRecipe(recipe, atHour);
  const name = options.name ?? "Lifecycle proof";
  return decodePet(
    JSON.stringify({
      version: 8,
      algorithmVersion: 7,
      revision: PROTOTYPE_REVISION,
      mode: recipe.source.mode,
      name,
      seed: recipe.seed,
      parts: recipe.source.parts,
      needTimeline: deriveCareTimeline(game),
      groomingTimeline: [],
      catalogVersion: NEEDS_CATALOG_VERSION,
      needsRulesVersion: NEEDS_RULES_VERSION,
      bornAt: game.clock.startedAtMs,
      age: (game.clock.nowMs - game.clock.startedAtMs) / (24 * HOUR),
      life: {
        lineageVersion: LINEAGE_RECIPE_VERSION,
        mode: recipe.source.mode,
        name,
        seed: recipe.seed,
        parts: recipe.source.parts,
        game,
        groomingTimeline: [],
      },
    }),
  );
}

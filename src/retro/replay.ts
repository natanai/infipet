import {
  createGame,
  advanceGame,
  commandGame,
  GAME_RULES,
  GAME_RULES_VERSION,
  HOUR,
  type GameState,
  type GameCommand,
} from "../gameplay";
import {
  PROTOTYPE_REVISION,
  LINEAGE_RECIPE_VERSION,
  decodePet,
} from "../pet-format";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION } from "../needs";
import type { WitnessRecipe } from "../../tools/retro-audit/types";

const keys = (v: object, allowed: readonly string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const finite = (
  v: unknown,
  lo = 0,
  hi = Number.MAX_SAFE_INTEGER,
): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const commandFields: Record<string, string[]> = {
  feed: ["type", "food"],
  clean: ["type"],
  medicine: ["type"],
  lights: ["type", "on"],
  discipline: ["type"],
  "start-game": ["type", "game"],
  choose: ["type", "choice"],
  battle: ["type"],
  cancel: ["type"],
  dismiss: ["type"],
};

/** Browser-safe verification boundary. Endpoint art, future poses and stage overrides are forbidden. */
export function validateReplayRecipe(input: unknown): WitnessRecipe {
  if (
    !input ||
    typeof input !== "object" ||
    !keys(input, [
      "version",
      "versions",
      "source",
      "seed",
      "startedAtMs",
      "utcOffsetMinutes",
      "policyId",
      "endHour",
      "commands",
    ])
  )
    throw new Error(
      "A replay accepts only the starting drawing, seed, clock and recorded care commands.",
    );
  const r = input as WitnessRecipe;
  if (
    r.version !== 1 ||
    !r.versions ||
    !keys(r.versions, [
      "prototype",
      "gameplay",
      "rules",
      "lineage",
      "needsCatalog",
      "needsRules",
    ]) ||
    r.versions.prototype !== PROTOTYPE_REVISION ||
    r.versions.gameplay !== GAME_RULES_VERSION ||
    r.versions.rules !== GAME_RULES.id ||
    r.versions.lineage !== LINEAGE_RECIPE_VERSION ||
    r.versions.needsCatalog !== NEEDS_CATALOG_VERSION ||
    r.versions.needsRules !== NEEDS_RULES_VERSION
  )
    throw new Error(
      "This measured replay belongs to a different procedural revision.",
    );
  if (
    !r.source ||
    !keys(r.source, ["id", "parts", "mode"]) ||
    typeof r.source.id !== "string" ||
    !r.source.id.length ||
    r.source.id.length > 160 ||
    typeof r.seed !== "string" ||
    !r.seed.length ||
    r.seed.length > 128 ||
    !Number.isSafeInteger(r.startedAtMs) ||
    r.startedAtMs < 0 ||
    !Number.isInteger(r.utcOffsetMinutes) ||
    Math.abs(r.utcOffsetMinutes) > 840 ||
    !finite(r.endHour, 0, 8760) ||
    typeof r.policyId !== "string" ||
    r.policyId.length > 100
  )
    throw new Error("Invalid starting source or clock in the replay.");
  const checked = decodePet(
    JSON.stringify({
      version: 8,
      algorithmVersion: 7,
      revision: PROTOTYPE_REVISION,
      name: "Measured replay",
      mode: r.source.mode,
      seed: r.seed,
      parts: r.source.parts,
      age: 0,
      bornAt: r.startedAtMs,
      needTimeline: [],
      catalogVersion: NEEDS_CATALOG_VERSION,
      needsRulesVersion: NEEDS_RULES_VERSION,
    }),
  );
  if (!checked.parts.some((p) => p.pixels.length))
    throw new Error("The replay needs a visible drawing.");
  if (!Array.isArray(r.commands) || r.commands.length > 50000)
    throw new Error("Invalid replay command history.");
  const ids = new Set<string>();
  let previous = -1;
  for (const event of r.commands) {
    if (
      !event ||
      !keys(event, ["id", "atHour", "command"]) ||
      typeof event.id !== "string" ||
      !event.id.length ||
      event.id.length > 128 ||
      ids.has(event.id) ||
      !finite(event.atHour, Math.max(0, previous), r.endHour)
    )
      throw new Error(
        "Replay care events must have unique IDs and chronological times.",
      );
    ids.add(event.id);
    previous = event.atHour;
    const c = event.command as GameCommand;
    if (!c || !commandFields[c.type] || !keys(c, commandFields[c.type]))
      throw new Error("The replay contains a non-gameplay control.");
    if (
      (c.type === "feed" && !["meal", "snack", "protein"].includes(c.food)) ||
      (c.type === "lights" && typeof c.on !== "boolean") ||
      (c.type === "start-game" &&
        !["training", "direction", "numbers"].includes(c.game)) ||
      (c.type === "choose" &&
        !["high", "low", "left", "right", "higher", "lower"].includes(c.choice))
    )
      throw new Error("Invalid care command in the replay.");
  }
  return JSON.parse(
    JSON.stringify({ ...r, source: { ...r.source, parts: checked.parts } }),
  ) as WitnessRecipe;
}

/** The ordinary game engine is the only authority over every reached stage and care value. */
export function replayGameRecipe(
  raw: WitnessRecipe,
  atHour: number,
): GameState {
  const recipe = validateReplayRecipe(raw);
  if (!finite(atHour, 0, recipe.endHour))
    throw new Error("The requested hour is outside this witnessed life.");
  let state = createGame(recipe.seed, recipe.source.mode, recipe.startedAtMs, {
    utcOffsetMinutes: recipe.utcOffsetMinutes,
  });
  const hatch = state.clock.hatchAtMs;
  for (const event of recipe.commands) {
    if (event.atHour > atHour) break;
    state = commandGame(
      state,
      event.command,
      hatch + Math.round(event.atHour * HOUR),
      event.id,
    );
  }
  return advanceGame(state, hatch + Math.round(atHour * HOUR), "active");
}

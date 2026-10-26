import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createSimulation,
  DRAW_SIZE,
  WORLD_SIZE,
  type Pixel,
  type PartFrame,
} from "../../src/simulation";
import { drawingPixels } from "../../src/drawing";
import {
  advanceGame,
  commandGame,
  createGame,
  deriveCareTimeline,
  deriveDevelopmentContext,
  GAME_RULES_VERSION,
  GAME_RULES,
  HOUR,
  MINUTE,
  type GameState,
  type GameCommand,
} from "../../src/gameplay";
import {
  decodePet,
  PROTOTYPE_REVISION,
  LINEAGE_RECIPE_VERSION,
} from "../../src/pet-format";
import { NEEDS_CATALOG_VERSION, NEEDS_RULES_VERSION } from "../../src/needs";
import { RETRO_AUDIT_SCHEDULE } from "./schedule";
import type {
  CapturedCheckpoint,
  RetroCheckpoint,
  RetroSource,
  WitnessRecipe,
  WitnessVersions,
} from "./types";

export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function currentVersions(): WitnessVersions {
  return {
    prototype: PROTOTYPE_REVISION,
    gameplay: GAME_RULES_VERSION,
    rules: GAME_RULES.id,
    lineage: LINEAGE_RECIPE_VERSION,
    needsCatalog: NEEDS_CATALOG_VERSION,
    needsRules: NEEDS_RULES_VERSION,
  };
}
/** Entire current transitive runtime/validation surface, excluding presentation and target catalogs. */
export function engineSourceFiles(): string[] {
  const files: string[] = [];
  const visit = (folder: string) => {
    if (!fs.existsSync(folder)) return;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(ts|tsx|json)$/.test(entry.name))
        files.push(file.replaceAll("\\", "/"));
    }
  };
  for (const folder of [
    "src/simulation",
    "src/lineage",
    "src/gameplay",
    "src/phylogeny",
    "src/needs",
    "src/anatomy",
  ]) {
    visit(folder);
  }
  for (const file of [
    "src/drawing.ts",
    "src/drawing-features.ts",
    "src/anatomy.ts",
    "src/pet-format.ts",
    "src/retro/replay.ts",
  ]) {
    if (fs.existsSync(file)) files.push(file);
  }
  return [...new Set(files)].sort();
}
export function engineSourceHash(): string {
  const hash = createHash("sha256");
  for (const file of engineSourceFiles()) {
    hash.update(file);
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}
function onlyKeys(value: object, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}
export function validateSource(source: RetroSource): RetroSource {
  if (
    !source ||
    typeof source !== "object" ||
    !onlyKeys(source, ["id", "parts", "mode"]) ||
    typeof source.id !== "string" ||
    !source.id.length ||
    source.id.length > 160
  )
    throw new Error(
      "A witness source contains only an ID, ordinary drawing parts and beginning mode.",
    );
  const checked = decodePet(
    JSON.stringify({
      version: 8,
      algorithmVersion: 7,
      revision: PROTOTYPE_REVISION,
      mode: source.mode,
      name: "Retro audit source",
      seed: "source-validation",
      parts: source.parts,
      bornAt: 0,
      age: 0,
      needTimeline: [],
      catalogVersion: NEEDS_CATALOG_VERSION,
      needsRulesVersion: NEEDS_RULES_VERSION,
    }),
  );
  if (!checked.parts.some((part) => part.pixels.length))
    throw new Error("A lifecycle witness needs a nonempty starting drawing.");
  return { id: source.id, parts: checked.parts, mode: checked.mode };
}
export function validateWitness(value: unknown): WitnessRecipe {
  if (
    !value ||
    typeof value !== "object" ||
    !onlyKeys(value, [
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
      "Witness recipes cannot contain targets, paths, endpoint sprites or stage overrides.",
    );
  const recipe = value as WitnessRecipe;
  const expected = currentVersions();
  if (
    recipe.version !== 1 ||
    !recipe.versions ||
    !onlyKeys(recipe.versions, Object.keys(expected)) ||
    Object.entries(expected).some(
      ([key, value]) => recipe.versions[key as keyof WitnessVersions] !== value,
    )
  )
    throw new Error(
      "This witness belongs to different engine/catalog versions.",
    );
  if (
    typeof recipe.seed !== "string" ||
    !recipe.seed.length ||
    recipe.seed.length > 128 ||
    typeof recipe.policyId !== "string" ||
    recipe.policyId.length > 100 ||
    !Number.isSafeInteger(recipe.startedAtMs) ||
    recipe.startedAtMs < 0 ||
    !Number.isInteger(recipe.utcOffsetMinutes) ||
    Math.abs(recipe.utcOffsetMinutes) > 840 ||
    !Number.isFinite(recipe.endHour) ||
    recipe.endHour < 0 ||
    recipe.endHour > 24 * 365
  )
    throw new Error("Invalid witness seed, policy or explicit clock.");
  const source = validateSource(recipe.source);
  if (!Array.isArray(recipe.commands) || recipe.commands.length > 50_000)
    throw new Error(
      "A witness may contain at most 50,000 concrete player commands.",
    );
  const seen = new Set<string>();
  let prior = -1;
  for (const [index, event] of recipe.commands.entries()) {
    if (
      !event ||
      !onlyKeys(event, ["id", "atHour", "command"]) ||
      typeof event.id !== "string" ||
      !event.id.length ||
      event.id.length > 128 ||
      event.id !== `retro-input-${index + 1}` ||
      seen.has(event.id) ||
      !Number.isFinite(event.atHour) ||
      event.atHour < prior ||
      event.atHour < 0 ||
      event.atHour > recipe.endHour ||
      Math.abs(
        (event.atHour * 60) / RETRO_AUDIT_SCHEDULE.inputGridMinutes -
          Math.round(
            (event.atHour * 60) / RETRO_AUDIT_SCHEDULE.inputGridMinutes,
          ),
      ) > 1e-7
    )
      throw new Error(
        "Witness commands require canonical sequential input IDs and chronological hours on the fixed input grid.",
      );
    seen.add(event.id);
    prior = event.atHour;
    if (!event.command || typeof event.command !== "object")
      throw new Error("Invalid player command.");
    const command = event.command as unknown as Record<string, unknown>;
    const fields: Record<string, string[]> = {
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
    if (
      typeof command.type !== "string" ||
      !fields[command.type] ||
      !onlyKeys(command, fields[command.type])
    )
      throw new Error("Only ordinary gameplay commands may drive a witness.");
    if (
      (command.type === "feed" &&
        !["meal", "snack", "protein"].includes(String(command.food))) ||
      (command.type === "lights" && typeof command.on !== "boolean") ||
      (command.type === "start-game" &&
        !["training", "direction", "numbers"].includes(String(command.game))) ||
      (command.type === "choose" &&
        !["high", "low", "left", "right", "higher", "lower"].includes(
          String(command.choice),
        ))
    )
      throw new Error("Invalid gameplay command parameters.");
  }
  return structuredClone({ ...recipe, source });
}

type CarePolicy = {
  id: string;
  label: string;
  intervalMinutes: number;
  trainingMinutes: number;
  battleMinutes: number;
  extraMeal: boolean;
  nightWakeMinutes?: number;
  emergencyHungerHours?: number;
  early?: {
    untilHour: number;
    intervalMinutes: number;
    trainingMinutes: number;
    battleMinutes: number;
    extraMeal: boolean;
  };
  battleMinimumStrength?: number;
};
const BASE_CARE_POLICIES: readonly CarePolicy[] = Object.freeze([
  {
    id: "tended",
    label: "Timely basic care",
    intervalMinutes: 10,
    trainingMinutes: 0,
    battleMinutes: 0,
    extraMeal: false,
  },
  {
    id: "trained",
    label: "Timely care and regular training",
    intervalMinutes: 10,
    trainingMinutes: 60,
    battleMinutes: 0,
    extraMeal: false,
  },
  {
    id: "battle-trained",
    label: "Timely care, training and battles",
    intervalMinutes: 10,
    trainingMinutes: 60,
    battleMinutes: 120,
    extraMeal: false,
  },
  {
    id: "playful-battles",
    label: "Timely care and battles without training",
    intervalMinutes: 10,
    trainingMinutes: 0,
    battleMinutes: 120,
    extraMeal: false,
    battleMinimumStrength: 3,
  },
  {
    id: "sparse-recovery",
    label: "Delayed care with recovery",
    intervalMinutes: 300,
    trainingMinutes: 0,
    battleMinutes: 0,
    extraMeal: false,
  },
  {
    id: "stout-training",
    label: "Delayed care, some training and overfeeding",
    intervalMinutes: 300,
    trainingMinutes: 240,
    battleMinutes: 0,
    extraMeal: true,
  },
  {
    id: "rest-interrupted",
    label: "Delayed care, light training and interrupted rest",
    intervalMinutes: 300,
    trainingMinutes: 360,
    battleMinutes: 0,
    extraMeal: false,
    nightWakeMinutes: 180,
    emergencyHungerHours: 6,
  },
  {
    id: "rest-battles",
    label: "Delayed care, interrupted rest and regular battles",
    intervalMinutes: 300,
    trainingMinutes: 360,
    battleMinutes: 180,
    extraMeal: false,
    nightWakeMinutes: 180,
    emergencyHungerHours: 6,
  },
  {
    id: "sparse-battles",
    label: "Delayed care and battles without training",
    intervalMinutes: 300,
    trainingMinutes: 0,
    battleMinutes: 120,
    extraMeal: false,
    emergencyHungerHours: 6,
  },
  {
    id: "sparse-stout-battles",
    label: "Delayed care, overfeeding, light training and battles",
    intervalMinutes: 300,
    trainingMinutes: 360,
    battleMinutes: 180,
    extraMeal: true,
    emergencyHungerHours: 6,
    battleMinimumStrength: 3,
  },
  {
    id: "early-tended-then-stout",
    label: "Timely first two days, then sparse care and light training",
    intervalMinutes: 300,
    trainingMinutes: 360,
    battleMinutes: 180,
    extraMeal: true,
    emergencyHungerHours: 6,
    battleMinimumStrength: 3,
    early: {
      untilHour: 48,
      intervalMinutes: 10,
      trainingMinutes: 0,
      battleMinutes: 0,
      extraMeal: false,
    },
  },
  {
    id: "early-tended-then-strenuous",
    label: "Timely first two days, then sparse care and strenuous training",
    intervalMinutes: 300,
    trainingMinutes: 60,
    battleMinutes: 180,
    extraMeal: true,
    emergencyHungerHours: 6,
    battleMinimumStrength: 3,
    early: {
      untilHour: 48,
      intervalMinutes: 10,
      trainingMinutes: 0,
      battleMinutes: 0,
      extraMeal: false,
    },
  },
  {
    id: "early-tended-then-sparse",
    label: "Timely first two days, then sparse care without training",
    intervalMinutes: 300,
    trainingMinutes: 0,
    battleMinutes: 120,
    extraMeal: false,
    emergencyHungerHours: 6,
    battleMinimumStrength: 3,
    early: {
      untilHour: 48,
      intervalMinutes: 10,
      trainingMinutes: 0,
      battleMinutes: 0,
      extraMeal: false,
    },
  },
  {
    id: "recovery-intensive",
    label: "Delayed first two days, then timely care and intensive training",
    intervalMinutes: 10,
    trainingMinutes: 30,
    battleMinutes: 180,
    extraMeal: false,
    emergencyHungerHours: 6,
    battleMinimumStrength: 3,
    early: {
      untilHour: 48,
      intervalMinutes: 300,
      trainingMinutes: 0,
      battleMinutes: 0,
      extraMeal: false,
    },
  },
  {
    id: "recovery-playful",
    label: "Delayed first two days, then timely care and occasional training",
    intervalMinutes: 10,
    trainingMinutes: 360,
    battleMinutes: 120,
    extraMeal: false,
    emergencyHungerHours: 6,
    battleMinimumStrength: 3,
    early: {
      untilHour: 48,
      intervalMinutes: 300,
      trainingMinutes: 0,
      battleMinutes: 0,
      extraMeal: false,
    },
  },
]);
const policySemantics=(policy:CarePolicy)=>JSON.stringify({...policy,id:undefined,label:undefined,battleMinimumStrength:policy.battleMinutes?policy.battleMinimumStrength:undefined});
const retainedPolicies:CarePolicy[]=[];
for(const policy of BASE_CARE_POLICIES) {
  if(!policy.battleMinutes)continue;
  const candidate:CarePolicy={...policy,id:`${policy.id}-without-battles`,label:`${policy.label}; no battles`,battleMinutes:0,battleMinimumStrength:undefined,...(policy.early?{early:{...policy.early,battleMinutes:0}}:{})};
  if(![...BASE_CARE_POLICIES,...retainedPolicies].some((existing)=>policySemantics(existing)===policySemantics(candidate)))retainedPolicies.push(candidate);
}
export const CARE_POLICIES:readonly CarePolicy[]=Object.freeze([...BASE_CARE_POLICIES,...retainedPolicies]);
const terminalGameCache = new Map<string, GameState>();
const gameInputKey = (recipe: WitnessRecipe) =>
  digest([
    recipe.versions,
    recipe.seed,
    recipe.source.mode,
    recipe.startedAtMs,
    recipe.utcOffsetMinutes,
    recipe.commands,
    recipe.endHour,
  ]);
function cacheTerminal(recipe: WitnessRecipe, state: GameState) {
  terminalGameCache.set(gameInputKey(recipe), structuredClone(state));
  if (terminalGameCache.size > 64)
    terminalGameCache.delete(terminalGameCache.keys().next().value!);
}
export function witnessGameState(
  raw: WitnessRecipe,
  atHour: number,
): GameState {
  const recipe = validateWitness(raw);
  if (!Number.isFinite(atHour) || atHour < 0 || atHour > recipe.endHour)
    throw new Error("Invalid witnessed state hour.");
  if (atHour === recipe.endHour) {
    const cached = terminalGameCache.get(gameInputKey(recipe));
    if (cached) return structuredClone(cached);
  }
  let state = createGame(recipe.seed, recipe.source.mode, recipe.startedAtMs, {
    utcOffsetMinutes: recipe.utcOffsetMinutes,
  });
  const hatch = state.clock.hatchAtMs,
    until = hatch + Math.round(atHour * HOUR);
  for (const event of recipe.commands) {
    const at = hatch + Math.round(event.atHour * HOUR);
    if (at > until) break;
    state = advanceGame(state, at, "active");
    if (!humanInputAvailable(state, event.command))
      throw new Error(
        `Witness input ${event.id} is unavailable or no-op padding.`,
      );
    state = commandGame(state, event.command, at, event.id);
  }
  state = advanceGame(state, until, "active");
  if (atHour === recipe.endHour) cacheTerminal(recipe, state);
  return state;
}

/** Visible controls only: rejected/no-op padding is never used to encode a search result. */
export function humanInputAvailable(
  state: GameState,
  command: GameCommand,
): boolean {
  if (state.dead || state.stage === "egg") return false;
  if (command.type === "cancel" || command.type === "dismiss")
    return !!state.activity;
  if (state.activity && command.type !== "choose") return false;
  if (command.type === "choose")
    return (
      !!state.activity &&
      "choices" in state.activity &&
      state.activity.choices.includes(command.choice)
    );
  if (command.type === "clean") return state.waste > 0;
  if (command.type === "medicine")
    return !!(state.health.sickness || state.health.injury);
  if (command.type === "lights")
    return (
      state.lightsOn !== command.on ||
      (!command.on &&
        (state.forcedAwakeUntilMs !== null || state.attention.sleep !== null))
    );
  if (command.type === "start-game")
    return (
      !state.health.sickness && !state.health.injury && state.meters.energy >= 5
    );
  if (command.type === "battle")
    return (
      ["juvenile", "adult", "advanced"].includes(state.stage) &&
      !state.health.sickness &&
      !state.health.injury &&
      state.meters.energy >= 10 &&
      state.meters.hunger > 0
    );
  if (command.type === "feed" && command.food === "meal")
    return (
      state.meters.hunger < 4 ||
      state.overfeedReady ||
      state.sleeping ||
      state.attention.discipline
    );
  return true;
}

/** Policy selection reads ordinary visible meters/flags, never future reference art or hidden game targets. */
export function buildPolicyWitness(input: {
  source: RetroSource;
  seed: string;
  policyId: string;
  endHour: number;
}): WitnessRecipe {
  const source = validateSource(input.source),
    policy = CARE_POLICIES.find((item) => item.id === input.policyId);
  if (!policy) throw new Error(`Unknown audit care policy: ${input.policyId}`);
  if (
    !Number.isFinite(input.endHour) ||
    input.endHour < 0 ||
    input.endHour > 24 * 365
  )
    throw new Error("Audit end hour is out of bounds.");
  const recipe: WitnessRecipe = {
    version: 1,
    versions: currentVersions(),
    source,
    seed: input.seed,
    startedAtMs: RETRO_AUDIT_SCHEDULE.startedAtHourUtc * HOUR,
    utcOffsetMinutes: RETRO_AUDIT_SCHEDULE.utcOffsetMinutes,
    policyId: policy.id,
    endHour: input.endHour,
    commands: [],
  };
  let state = createGame(input.seed, source.mode, recipe.startedAtMs, {
    utcOffsetMinutes: 0,
  });
  const end = state.clock.hatchAtMs + Math.round(input.endHour * HOUR);
  let nextCare = state.clock.hatchAtMs,
    nextTrain = state.clock.hatchAtMs,
    nextBattle = state.clock.hatchAtMs,
    nextNightWake = state.clock.hatchAtMs;
  let previousPhase = "";
  const act = (command: GameCommand) => {
    if (!humanInputAvailable(state, command)) return;
    const event = {
      id: `retro-input-${recipe.commands.length + 1}`,
      atHour: Math.max(0, (state.clock.nowMs - state.clock.hatchAtMs) / HOUR),
      command,
    };
    state = commandGame(state, command, state.clock.nowMs, event.id);
    recipe.commands.push(event);
  };
  const completeTraining=()=>{
    act({type:"start-game",game:"training"});
    for(let round=0;round<5&&state.activity?.kind==="training";round++)act({type:"choose",choice:"high"});
    if(state.activity?.kind==="result")act({type:"dismiss"});
  };
  while (state.clock.nowMs <= end && !state.dead) {
    const retired =
      (state.clock.nowMs - state.clock.hatchAtMs) / HOUR >=
      RETRO_AUDIT_SCHEDULE.retirementHour;
    const phase = retired
      ? "retired"
      : policy.early &&
          (state.clock.nowMs - state.clock.hatchAtMs) / HOUR <
            policy.early.untilHour
        ? "early"
        : "usual";
    if (phase !== previousPhase) {
      nextCare = Math.min(nextCare, state.clock.nowMs);
      previousPhase = phase;
    }
    const settings = retired
      ? {
          ...policy,
          intervalMinutes: 10,
          trainingMinutes: 0,
          battleMinutes: 0,
          extraMeal: false,
        }
      : policy.early &&
          (state.clock.nowMs - state.clock.hatchAtMs) / HOUR <
            policy.early.untilHour
        ? { ...policy, ...policy.early }
        : policy;
    if (state.stage !== "egg" && state.clock.nowMs >= nextCare) {
      if (state.activity) act({ type: "cancel" });
      if (state.attention.discipline) act({ type: "discipline" });
      if (state.waste) act({ type: "clean" });
      for (
        let dose = 0;
        dose < 6 && (state.health.sickness || state.health.injury);
        dose++
      )
        act({ type: "medicine" });
      if (state.sleeping) {
        if (state.lightsOn) act({ type: "lights", on: false });
      } else {
        if (!state.lightsOn) act({ type: "lights", on: true });
        for (const [meter, food] of [
          ["hunger", "meal"],
          ["happiness", "snack"],
          ["strength", "protein"],
        ] as const)
          for (
            let attempt = 0;
            attempt < 8 && state.meters[meter] < 4;
            attempt++
          )
            act({ type: "feed", food });
        if (settings.extraMeal && state.meters.hunger === 4)
          act({ type: "feed", food: "meal" });
      }
      nextCare = state.clock.nowMs + settings.intervalMinutes * MINUTE;
    }
    if (
      policy.emergencyHungerHours &&
      state.health.hungrySinceMs !== null &&
      state.clock.nowMs - state.health.hungrySinceMs >=
        policy.emergencyHungerHours * HOUR
    ) {
      const wasSleeping = state.sleeping;
      if (state.attention.discipline) act({ type: "discipline" });
      for (let attempt = 0; attempt < 8 && state.meters.hunger === 0; attempt++)
        act({ type: "feed", food: "meal" });
      if (wasSleeping) act({ type: "lights", on: false });
    }
    if (
      !retired &&
      policy.nightWakeMinutes &&
      state.sleeping &&
      state.clock.nowMs >= nextNightWake &&
      state.meters.energy >= 5 &&
      !state.health.sickness &&
      !state.health.injury
    ) {
      completeTraining();
      act({ type: "lights", on: false });
      nextNightWake = state.clock.nowMs + policy.nightWakeMinutes * MINUTE;
    }
    if (
      settings.trainingMinutes &&
      state.stage !== "egg" &&
      !state.sleeping &&
      state.clock.nowMs >= nextTrain &&
      state.meters.energy >= 5 &&
      !state.health.sickness &&
      !state.health.injury
    ) {
      completeTraining();
      nextTrain = state.clock.nowMs + settings.trainingMinutes * MINUTE;
    }
    if (
      settings.battleMinutes &&
      ["juvenile", "adult", "advanced"].includes(state.stage) &&
      !state.sleeping &&
      state.clock.nowMs >= nextBattle &&
      state.meters.energy >= 10 &&
      state.meters.hunger > 0 &&
      state.meters.strength >= (settings.battleMinimumStrength ?? 0) &&
      !state.health.sickness &&
      !state.health.injury
    ) {
      act({ type: "battle" });
      if (state.activity) act({ type: "dismiss" });
      nextBattle = state.clock.nowMs + settings.battleMinutes * MINUTE;
    }
    if (state.clock.nowMs >= end) break;
    state = advanceGame(
      state,
      Math.min(
        end,
        state.clock.nowMs + RETRO_AUDIT_SCHEDULE.inputGridMinutes * MINUTE,
      ),
      "active",
    );
  }
  const validated = validateWitness(recipe);
  cacheTerminal(validated, state);
  return validated;
}

// Ordinary gameplay is independent of the drawing. Cache only completed genuine command replays,
// never supplied stage summaries; each anatomical source is still rendered independently below.
const gameReplayCache = new Map<string, Map<number, GameState>>();
export function visibleFeatureContrast(
  feature: readonly Pixel[],
  composite: readonly Pixel[],
): number {
  const colorValue = (color: string) => {
    const hex = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "000000";
    return (
      (0.2126 * parseInt(hex.slice(0, 2), 16) +
        0.7152 * parseInt(hex.slice(2, 4), 16) +
        0.0722 * parseInt(hex.slice(4, 6), 16)) /
      255
    );
  };
  const colors = new Map(
    composite.map((pixel) => [`${pixel.x},${pixel.y}`, pixel.color]),
  );
  const cells = new Set(feature.map((pixel) => `${pixel.x},${pixel.y}`));
  let sum = 0,
    count = 0;
  for (const pixel of feature)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${pixel.x + dx},${pixel.y + dy}`;
        if (cells.has(key)) continue;
        sum += Math.abs(
          colorValue(pixel.color) - colorValue(colors.get(key) ?? "#000000"),
        );
        count++;
      }
  return count ? sum / count : 0;
}
export function validFaceTransport(
  source: RetroSource,
  parts: readonly PartFrame[],
  part: PartFrame,
): boolean {
  const expression = part.surfaceExpression;
  const ids = [part.sourcePartId, ...(part.sourcePartIds ?? [])].filter(
    (id): id is string => !!id,
  );
  const ancestors = source.parts.filter(
    (candidate) =>
      (candidate.kind === "eye" || candidate.kind === "mouth") &&
      ids.includes(candidate.id),
  );
  if (!ancestors.length) return true; // New grown features do not stand in for a protected source feature.
  const sourceColors = ancestors.flatMap((ancestor) =>
    ancestor.pixels.map((pixel) => pixel.color.toUpperCase()),
  );
  const expressedColors = [
    ...new Set(part.pixels.map((pixel) => pixel.color.toUpperCase())),
  ];
  if (expressedColors.every((color) => sourceColors.includes(color)))
    return true;
  return (
    !!expression &&
    expression.version === "surface-expression-v1" &&
    expression.operation === "facial-contrast" &&
    Number.isFinite(expression.expression) &&
    expression.expression >= 0 &&
    expression.expression <= 1 &&
    ancestors.every((ancestor) =>
      expression.sourcePartIds.includes(ancestor.id),
    ) &&
    sourceColors.every((color) =>
      expression.originalColors.map((c) => c.toUpperCase()).includes(color),
    ) &&
    expressedColors.every((color) =>
      expression.expressedColors.map((c) => c.toUpperCase()).includes(color),
    ) &&
    !!expression.carrierId &&
    parts.some((carrier) => carrier.id === expression.carrierId)
  );
}
export function replayWitness(
  raw: WitnessRecipe,
  checkpoints: readonly RetroCheckpoint[],
): CapturedCheckpoint[] {
  const recipe = validateWitness(raw);
  const ordered = [...checkpoints].sort(
    (a, b) => a.atHour - b.atHour || a.id.localeCompare(b.id),
  );
  if (
    ordered.some(
      (point) =>
        !Number.isFinite(point.atHour) ||
        point.atHour < 0 ||
        point.atHour > recipe.endHour ||
        !Number.isFinite(point.animationTime) ||
        point.animationTime < 0,
    )
  )
    throw new Error("Checkpoints must lie within the witnessed life.");
  const hours = [...new Set(ordered.map((point) => point.atHour))];
  const replayKey = digest([
    recipe.versions,
    recipe.seed,
    recipe.source.mode,
    recipe.startedAtMs,
    recipe.utcOffsetMinutes,
    recipe.commands,
    hours,
  ]);
  let states = gameReplayCache.get(replayKey);
  if (!states) {
    let state = createGame(
        recipe.seed,
        recipe.source.mode,
        recipe.startedAtMs,
        { utcOffsetMinutes: recipe.utcOffsetMinutes },
      ),
      cursor = 0;
    const hatch = state.clock.hatchAtMs;
    states = new Map(
      hours.map((hour) => {
        const until = hatch + Math.round(hour * HOUR);
        while (
          cursor < recipe.commands.length &&
          hatch + Math.round(recipe.commands[cursor].atHour * HOUR) <= until
        ) {
          const event = recipe.commands[cursor++];
          state = advanceGame(
            state,
            hatch + Math.round(event.atHour * HOUR),
            "active",
          );
          if (!humanInputAvailable(state, event.command))
            throw new Error(
              `Witness input ${event.id} is unavailable or no-op padding.`,
            );
          state = commandGame(
            state,
            event.command,
            hatch + Math.round(event.atHour * HOUR),
            event.id,
          );
        }
        state = advanceGame(state, until, "active");
        return [hour, structuredClone(state)];
      }),
    );
    gameReplayCache.set(replayKey, states);
    const storedRecords = () =>
      [...gameReplayCache.values()].reduce(
        (total, group) =>
          total +
          [...group.values()].reduce(
            (sum, game) =>
              sum + (game.commandHistory?.length ?? game.receipts.length),
            0,
          ),
        0,
      );
    while (
      gameReplayCache.size > 1 &&
      (gameReplayCache.size > 64 || storedRecords() > 100_000)
    )
      gameReplayCache.delete(gameReplayCache.keys().next().value!);
  }
  const ownedStates = new Map(
    [...states].map(([hour, state]) => [hour, structuredClone(state)]),
  );
  return ordered.map((checkpoint) => {
    const state = ownedStates.get(checkpoint.atHour)!;
    const simulation = createSimulation(
      recipe.source.parts,
      recipe.seed,
      recipe.source.mode,
      {
        needTimeline: deriveCareTimeline(state),
        liveContext: deriveDevelopmentContext(state),
      },
    );
    const frame = simulation.frameAt(
      (state.clock.nowMs - state.clock.startedAtMs) / (24 * HOUR),
      {
        time: checkpoint.animationTime,
        action: checkpoint.action ?? "idle",
        target: checkpoint.actionTarget,
      },
    );
    const seen = new Set(
      frame.parts
        .flatMap((part) => [part.sourcePartId, ...(part.sourcePartIds ?? [])])
        .filter(Boolean),
    );
    const colors = new Map(
      frame.pixels.map((pixel) => [
        `${pixel.x},${pixel.y}`,
        pixel.color.toUpperCase(),
      ]),
    );
    const faces = frame.parts.filter(
      (part) => part.kind === "eye" || part.kind === "mouth",
    );
    const sourceFeatureContrasts = Object.fromEntries(
      faces.map((part) => [
        part.id,
        visibleFeatureContrast(part.pixels, frame.pixels),
      ]),
    );
    return {
      checkpoint: structuredClone(checkpoint),
      game: state,
      pixels: frame.pixels,
      parts: frame.parts,
      sourceFeatureContrasts,
      frameHash: digest(frame.pixels),
      sourceIntegrity: {
        missingSourceIds:
          recipe.source.mode === "egg"
            ? []
            : recipe.source.parts
                .filter((part) => !seen.has(part.id))
                .map((part) => part.id),
        emptyFaceIds: faces
          .filter((part) => !part.pixels.length)
          .map((part) => part.id),
        hiddenFaceIds: faces
          .filter(
            (part) =>
              part.pixels.length &&
              !part.pixels.every(
                (pixel) =>
                  colors.get(`${pixel.x},${pixel.y}`) ===
                  pixel.color.toUpperCase(),
              ),
          )
          .map((part) => part.id),
        unverifiedFaceTransportIds: faces
          .filter(
            (part) => !validFaceTransport(recipe.source, frame.parts, part),
          )
          .map((part) => part.id),
        lowContrastFaceIds: faces
          .filter(
            (part) =>
              sourceFeatureContrasts[part.id] < 0.25 ||
              (part.surfaceExpression?.operation === "facial-contrast" &&
                (part.surfaceExpression.contrastAfter ?? 0) < 0.5),
          )
          .map((part) => part.id),
      },
      genomeFingerprint: String(simulation.genome.fingerprint),
    };
  });
}
/** Exact flattened ink/color identity, permitting only the canvas-to-world origin translation. */
export function exactBirthPixelsMatch(
  source: readonly Pixel[],
  actual: readonly Pixel[],
): boolean {
  const translation = (WORLD_SIZE - DRAW_SIZE) / 2;
  const exactPixels = (pixels: readonly Pixel[], offset: number) => {
    const composite = new Map<
      string,
      { x: number; y: number; color: string }
    >();
    for (const pixel of pixels) {
      const x = pixel.x + offset,
        y = pixel.y + offset;
      composite.set(`${x},${y}`, { x, y, color: pixel.color.toUpperCase() });
    }
    return [...composite.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  };
  return (
    JSON.stringify(exactPixels(source, translation)) ===
    JSON.stringify(exactPixels(actual, 0))
  );
}
export function sourceBirthExact(recipe: WitnessRecipe): boolean {
  const game = createGame(recipe.seed, recipe.source.mode, recipe.startedAtMs, {
    utcOffsetMinutes: recipe.utcOffsetMinutes,
  });
  const sim = createSimulation(
    recipe.source.parts,
    recipe.seed,
    recipe.source.mode,
    {
      needTimeline: deriveCareTimeline(game),
      liveContext: deriveDevelopmentContext(game),
    },
  );
  return exactBirthPixelsMatch(
    drawingPixels(recipe.source.parts),
    sim.frameAt(0, { time: 0, action: "idle" }).pixels,
  );
}

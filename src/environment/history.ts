/** Chronological interpretation of *existing* game care evidence. Never persisted as a second log. */
import {
  HOUR,
  deriveCareTimeline,
  type CommandRecord,
  type GameState,
} from "../gameplay";
import { createNeedsSimulation } from "../needs";
import type { DevelopmentalExposure } from "../genetics";

export const ENVIRONMENT_HISTORY_VERSION = 1 as const;
const NEUTRAL_NUTRITION = 0.75;
const LN2 = Math.LN2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export type RecordedCareEvidence = Readonly<{
  /** Relative to hatching, not wall-clock or a drawing's age. */
  atHour: number;
  id: string;
  command: Readonly<CommandRecord["command"]>;
  accepted: boolean;
}>;
export type SampledCareEvidence = Readonly<{
  hour: number;
  nutrition: number | null;
  /** The six need values already recorded by gameplay, not a second need system. */
  needs: readonly number[];
}>;
export type EnvironmentPressure = Readonly<{
  atHour: number;
  /** Contract accepted by the permanent-genotype reaction-norm API. */
  exposure: DevelopmentalExposure;
  /** Raw and interpreted physiological signals are deliberately distinct. */
  physiology: Readonly<{
    nutrition: number;
    restRecovery: number;
    physicalFitness: number;
    resourceSecurity: number;
    persistentStress: number;
  }>;
  cumulative: Readonly<{
    nutritionDeficitDays: number;
    nutritionOpportunityDays: number;
    nutritionMean: number;
    restDeficitDays: number;
    safetyDeficitDays: number;
    /** Counts observed sessions, never invented durations or caloric costs. */
    trainingSessions: number;
    battles: number;
  }>;
  provenance: Readonly<{
    /** Old saves have only the six historic care values; unknown stays neutral. */
    nutrition: "sampled-hunger" | "legacy-unsampled";
    latestCareSampleHour: number | null;
    observedCommands: number;
  }>;
}>;
export type EnvironmentalHistory = Readonly<{
  version: typeof ENVIRONMENT_HISTORY_VERSION;
  maxHour: number;
  samples: readonly SampledCareEvidence[];
  commands: readonly RecordedCareEvidence[];
  atHour: (hour: number) => EnvironmentPressure;
  eventsThrough: (hour: number) => readonly RecordedCareEvidence[];
}>;

function nutritionHistory(
  samples: readonly SampledCareEvidence[],
  hour: number,
): { value: number; deficit: number; opportunity: number; mean: number; measured: boolean } {
  let cursor = 0;
  let nutrition = NEUTRAL_NUTRITION;
  let measured = false;
  let deficit = 0;
  let opportunity = 0;
  let total = 0;
  function advance(until: number) {
    const days = (until - cursor) / 24;
    total += nutrition * days;
    deficit += clamp((NEUTRAL_NUTRITION - nutrition) / NEUTRAL_NUTRITION) * days;
    opportunity += clamp((nutrition - NEUTRAL_NUTRITION) / (1 - NEUTRAL_NUTRITION)) * days;
    cursor = until;
  }
  for (const sample of samples) {
    if (sample.hour > hour) break;
    advance(sample.hour);
    if (sample.nutrition !== null) {
      nutrition = sample.nutrition;
      measured = true;
    }
  }
  advance(hour);
  return {
    value: nutrition,
    deficit,
    opportunity,
    mean: hour > 0 ? total / (hour / 24) : nutrition,
    measured,
  };
}

/**
 * Interprets a snapshot without changing gameplay's rules, the save format,
 * genetic information, or the timeline. Calls may seek in any order.
 *
 * Hour-boundary care samples are authoritative for physiological levels.
 * Command receipts establish training/battle participation, but a feed receipt
 * is NOT proof that a refused meal was consumed.
 */
export function createEnvironmentalHistory(game: GameState): EnvironmentalHistory {
  const maxHour = Math.max(0, (game.clock.nowMs - game.clock.hatchAtMs) / HOUR);
  const samples: readonly SampledCareEvidence[] = Object.freeze(
    game.careSamples.map(s => Object.freeze({
      hour: s.hour,
      nutrition: s.nutrition ?? null,
      needs: Object.freeze([...s.values]),
    })),
  );
  const commands: readonly RecordedCareEvidence[] = Object.freeze(
    game.commandHistory.map(record => Object.freeze({
      id: record.id,
      atHour: (record.atMs - game.clock.hatchAtMs) / HOUR,
      accepted: record.accepted,
      command: Object.freeze({ ...record.command }),
    })),
  );
  // Existing need simulation already handles time, cumulative exposure and
  // deterministic seeking. No second need state machine is introduced.
  const needs = createNeedsSimulation(game.seed, deriveCareTimeline(game));
  function validateHour(hour: number) {
    if (!Number.isFinite(hour) || hour < 0 || hour > maxHour)
      throw new RangeError("Environmental hour must be within the recorded life.");
  }
  function eventsThrough(hour: number): readonly RecordedCareEvidence[] {
    validateHour(hour);
    return Object.freeze(commands.filter(e => e.atHour >= 0 && e.atHour <= hour));
  }
  function atHour(hour: number): EnvironmentPressure {
    validateHour(hour);
    const nutrition = nutritionHistory(samples, hour);
    const wellbeing = needs.stateAt(hour / 24);
    const observed = eventsThrough(hour);
    const training = observed.filter(e =>
      e.accepted && e.command.type === "start-game" && e.command.game === "training");
    const battles = observed.filter(e => e.accepted && e.command.type === "battle");
    // A recorded activity is evidence of a session, not how long it lasted.
    // Decay is an explicit game interpretation, not a biological rate claim.
    const recentActivity = clamp([...training, ...battles].reduce(
      (sum, event) => sum + 0.35 * Math.exp(-LN2 * (hour - event.atHour) / 24), 0));
    const fitness = wellbeing.needs["physical-fitness"].shortTerm;
    const recovery = wellbeing.development.recovery;
    const security = wellbeing.needs.security.shortTerm;
    const stress = Math.max(
      wellbeing.development.protection,
      wellbeing.development.vigilance,
    );
    const previous = samples.filter(s => s.hour <= hour).at(-1);
    // Chronic deficit remains in the rate input after today's hunger recovers.
    const chronicNutrition = hour > 0
      ? clamp(nutrition.deficit / (hour / 24))
      : 0;
    return Object.freeze({
      atHour: hour,
      exposure: Object.freeze({
        nutrition: clamp(nutrition.value * (1 - 0.4 * chronicNutrition)),
        activity: clamp(0.8 * fitness + 0.2 * recentActivity),
        threat: clamp(stress),
      }),
      physiology: Object.freeze({
        nutrition: nutrition.value,
        restRecovery: recovery,
        physicalFitness: fitness,
        resourceSecurity: security,
        persistentStress: stress,
      }),
      cumulative: Object.freeze({
        nutritionDeficitDays: nutrition.deficit,
        nutritionOpportunityDays: nutrition.opportunity,
        nutritionMean: nutrition.mean,
        restDeficitDays: wellbeing.needs.rest.exposure,
        safetyDeficitDays: wellbeing.needs.safety.exposure,
        trainingSessions: training.length,
        battles: battles.length,
      }),
      provenance: Object.freeze({
        nutrition: nutrition.measured ? "sampled-hunger" : "legacy-unsampled",
        latestCareSampleHour: previous?.hour ?? null,
        observedCommands: observed.length,
      }),
    });
  }
  return Object.freeze({
    version: ENVIRONMENT_HISTORY_VERSION,
    maxHour,
    samples,
    commands,
    atHour,
    eventsThrough,
  });
}

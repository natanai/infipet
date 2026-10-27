/**
 * GAME-001: player life-cycle boundary. These pure transitions are called by
 * the actual App, not a substitute simulation. Time is always an explicit
 * caller-supplied integer millisecond timestamp.
 *
 * Birth identity (source pixels, IDs, definitions, mode, seed) is immutable.
 * Only the canonical GameState and optional grooming history may advance.
 * GameState's native rules own physiological samples and command chronology.
 */
import { createSimulation, type PetPart, type SourceMode } from "../simulation";
import { advanceGame, commandGame, createGame, deriveCareTimeline,
  deriveDevelopmentContext, type GameCommand } from "../gameplay";
import { normalizeGroomTimeline } from "../simulation/grooming";
import { LINEAGE_RECIPE_VERSION, type LivingPet } from "../pet-format";

export type PlayerBirth = Readonly<{
  parts: readonly PetPart[];
  mode: SourceMode;
  seed: string;
  name: string;
}>;

export function drawableMaterial(parts: readonly PetPart[]): boolean {
  return parts.some(part => part.pixels.length > 0);
}

/** No classification, part labels, kingdom, taxon or template is requested. */
export function birthPlayerLife(
  source: PlayerBirth,
  atMs: number,
  utcOffsetMinutes = 0,
): LivingPet {
  if (!drawableMaterial(source.parts))
    throw new RangeError("Draw at least one pixel to begin your pet's life.");
  if (!source.seed || !source.seed.trim())
    throw new TypeError("Your pet needs a stable birth identity.");
  const parts = source.parts.map(part => ({
    ...part, position: {...part.position},
    pixels: part.pixels.map(pixel => ({...pixel})),
  }));
  return {
    lineageVersion: LINEAGE_RECIPE_VERSION,
    parts,
    mode: source.mode,
    seed: source.seed,
    name: source.name.trim() || "Little one",
    game: createGame(source.seed,source.mode,atMs,{utcOffsetMinutes}),
    groomingTimeline: [],
  };
}

/** Pure absolute-clock advancement, including background/absent intervals. */
export function advancePlayerLife(
  pet: LivingPet,
  atMs: number,
  presence: "active" | "absent",
): LivingPet {
  if (atMs <= pet.game.clock.nowMs) return pet;
  return {...pet,game:advanceGame(pet.game,atMs,presence)};
}

/** One accepted or rejected native command, never a new organism. */
export function commandPlayerLife(
  pet: LivingPet, command: GameCommand, atMs: number, id: string,
): LivingPet {
  return {...pet,game:commandGame(pet.game,command,atMs,id)};
}

/** The ONLY live render path: recorded care + same source + same seed. */
export function createPlayerLifeSimulation(pet: LivingPet) {
  return createSimulation(pet.parts,pet.seed,pet.mode,{
    needTimeline: deriveCareTimeline(pet.game),
    groomingTimeline: normalizeGroomTimeline(pet.groomingTimeline),
    liveContext: deriveDevelopmentContext(pet.game),
    careGame: pet.game,
  });
}

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
    anatomicalClock:"daily-365-v1",
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
  if (pet.anatomicalClock!=="daily-365-v1" || atMs <= pet.game.clock.nowMs) return pet;
  return {...pet,game:advanceGame(pet.game,atMs,presence)};
}

/** One accepted or rejected native command, never a new organism. */
export function commandPlayerLife(
  pet: LivingPet, command: GameCommand, atMs: number, id: string,
): LivingPet {
  if(pet.anatomicalClock!=="daily-365-v1")throw new Error("Earlier saved life is read-only");
  return {...pet,game:commandGame(pet.game,command,atMs,id)};
}

/** The ONLY live render path: recorded care + same source + same seed. */
export function createPlayerLifeSimulation(pet: LivingPet) {
  if(pet.anatomicalClock!=="daily-365-v1")throw new Error("Earlier saved life cannot fabricate daily history");
  return createSimulation(pet.parts,pet.seed,pet.mode,{
    groomingTimeline: normalizeGroomTimeline(pet.groomingTimeline),
    liveContext: deriveDevelopmentContext(pet.game),
    careGame: pet.game,
    anatomicalCheckpoint:pet.anatomicalCheckpoint,
  });
}

/** Prime chronological catch-up in short main-thread slices before rendering a
 * returned life. This executes EVERY due check, then the normal player renderer
 * reuses those exact states. No scheduler modifies gameplay timestamps. */
export async function prepareReturnedLife(pet:LivingPet):Promise<LivingPet>{
  const simulation=createPlayerLifeSimulation(pet);
  const hatchDays=(pet.game.clock.hatchAtMs-pet.game.clock.startedAtMs)/86400000;
  const due=Math.min(365,Math.floor(Math.max(0,pet.game.clock.nowMs-pet.game.clock.hatchAtMs)/86400000));
  let slice=typeof performance!=="undefined"?performance.now():0;
  const completed=simulation.exportAnatomicalCheckpoint()?.state.completedChecks??0;
  for(let day=completed+1;day<=due;day++){
    simulation.materialStateAt(hatchDays+day);
    if(typeof performance!=="undefined"&&performance.now()-slice>=12&&day<due){
      await new Promise<void>(resolve=>setTimeout(resolve,0));slice=performance.now();
    }
  }
  const anatomicalCheckpoint=simulation.exportAnatomicalCheckpoint();
  return anatomicalCheckpoint?{...pet,anatomicalCheckpoint}:pet;
}

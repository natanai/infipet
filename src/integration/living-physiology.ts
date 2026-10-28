/** A bounded cache of captured physiological inputs, separate from anatomy. */
import { createNeedsSimulation } from "../needs";
import { deriveCareTimeline, type GameState } from "../gameplay";
type Entry = {
  model: GameState["physiology"];
  history: readonly unknown[];
  serialized: string[];
  simulation: ReturnType<typeof createNeedsSimulation>;
};
const cache = new Map<string, Entry>();
export function recordedNeedsSimulation(game: GameState) {
  const key = JSON.stringify([
    game.seed,
    game.mode,
    game.clock.startedAtMs,
    game.clock.hatchAtMs,
  ]);
  const prior = cache.get(key),
    history = game.careObservations?.length
      ? game.careObservations
      : game.careSamples;
  if (
    prior &&
    game.physiology &&
    Object.isFrozen(game.physiology) &&
    prior.model === game.physiology &&
    prior.history.length === history.length &&
    history.every(
      (s, i) =>
        (Object.isFrozen(s) &&
          Object.isFrozen(s.values) &&
          s === prior.history[i]) ||
        JSON.stringify(s) === prior.serialized[i],
    )
  ) {
    cache.delete(key);
    cache.set(key, prior);
    return prior.simulation;
  }
  const input = deriveCareTimeline(game);
  // The factory captures mutable imports before caching.
  const simulation = createNeedsSimulation(game.seed, input);
  cache.delete(key);
  cache.set(key, {
    model: game.physiology,
    history: [...history],
    serialized: history.map((s) => JSON.stringify(s)),
    simulation,
  });
  while (cache.size > 3) cache.delete(cache.keys().next().value!);
  return simulation;
}

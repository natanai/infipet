/** Reuse the existing physiological model when its exact recorded input is
 * unchanged. This is independent of anatomy; current values still integrate
 * continuously between canonical historical keyframes. */
import {createNeedsSimulation} from "../needs";
import {deriveCareTimeline,type GameState} from "../gameplay";
const cache=new Map<string,{samples:GameState["careSamples"];serialized:string[];simulation:ReturnType<typeof createNeedsSimulation>}>();
export function recordedNeedsSimulation(game:GameState){
  const key=JSON.stringify([game.seed,game.mode,game.clock.startedAtMs,game.clock.hatchAtMs]);
  const prior=cache.get(key),samples=game.careSamples;
  if(prior&&prior.samples.length===samples.length&&samples.every((s,i)=>
      Object.isFrozen(s)&&Object.isFrozen(s.values)&&s===prior.samples[i]||JSON.stringify(s)===prior.serialized[i])){
    cache.delete(key);cache.set(key,prior);return prior.simulation;
  }
  const simulation=createNeedsSimulation(game.seed,deriveCareTimeline(game));
  cache.delete(key);cache.set(key,{samples:[...samples],serialized:samples.map(s=>JSON.stringify(s)),simulation});
  while(cache.size>3)cache.delete(cache.keys().next().value!);
  return simulation;
}

/**
 * Current wellbeing remains responsive after the finite anatomical horizon.
 *
 * A 365-day full historical prefix is retained for anatomy. After maturity,
 * only a bounded event suffix and an exact sufficient-statistics checkpoint
 * contribute to current physiological state. All transitions use the same
 * continuous-time need integrator as the first year.
 *
 * The checkpoint may retire earlier mature events, so an old postmaturity
 * historical *frame* before the checkpoint is deliberately unavailable:
 * claiming to reconstruct it from absent observations would falsify care.
 */
import {createNeedsSimulation} from "../needs";
import {deriveCareTimeline,type GameState} from "../gameplay";

type Simulator=ReturnType<typeof createNeedsSimulation>;
type CacheEntry={samples:GameState["careSamples"];serialized:string[];
  mature:string;simulation:Simulator};
const cache=new Map<string,CacheEntry>();
export function recordedNeedsSimulation(game:GameState):Simulator{
  const key=JSON.stringify([game.seed,game.mode,game.clock.startedAtMs,game.clock.hatchAtMs]);
  const samples=game.careSamples,mature=JSON.stringify(game.matureCare??null);
  const prior=cache.get(key);
  if(prior&&mature===prior.mature&&prior.samples.length===samples.length&&
     samples.every((s,i)=>
       Object.isFrozen(s)&&Object.isFrozen(s.values)&&s===prior.samples[i]||
       JSON.stringify(s)===prior.serialized[i])){
    cache.delete(key);cache.set(key,prior);
    return prior.simulation;
  }
  const all=deriveCareTimeline(game);
  const baseline=createNeedsSimulation(game.seed,all.filter(p=>p.tick<=8760));
  const after=game.matureCare;
  let simulation:Simulator=baseline;
  if(after){
    const current=createNeedsSimulation(game.seed,all.filter(p=>p.tick>after.checkpoint.tick),after.checkpoint);
    const boundary=after.checkpoint.tick/24;
    simulation={
      ...current,
      stateAt(age:number){
        if(age<=365)return baseline.stateAt(age);
        if(age<boundary)throw new RangeError("Earlier mature physiological evidence has been compacted");
        return current.stateAt(age);
      },
      morphologyAt(age:number){
        if(age<=365)return baseline.morphologyAt(age);
        if(age<boundary)throw new RangeError("Earlier mature morphology history has been compacted");
        return current.morphologyAt(age);
      },
      stateBeforeTick(tick:number){
        if(tick<=8760)return baseline.stateBeforeTick(tick);
        if(tick<after.checkpoint.tick)
          throw new RangeError("Earlier mature physiological evidence has been compacted");
        return current.stateBeforeTick(tick);
      },
      exportCheckpoint(age:number){
        if(age<=365)return baseline.exportCheckpoint(age);
        if(age<boundary)throw new RangeError("Earlier mature physiological evidence has been compacted");
        return current.exportCheckpoint(age);
      },
    };
  }
  cache.delete(key);
  cache.set(key,{samples:[...samples],serialized:samples.map(s=>JSON.stringify(s)),
    mature,simulation});
  while(cache.size>3)cache.delete(cache.keys().next().value!);
  return simulation;
}

import test from "node:test";
import assert from "node:assert/strict";
import {advanceGame,commandGame,createGame,deriveCareTimeline,validateGameState,
  DAY,HOUR,type GameCommand,type GameState} from "../src/gameplay";
import {recordedNeedsSimulation} from "../src/integration/living-physiology";
import {createSimulation} from "../src/simulation";
import {fixtures} from "./alg-development-fixtures";

const T=Date.UTC(2026,9,27,12);
function care(game:GameState):GameState{
  let s=game;
  const act=(command:GameCommand)=>{
    s=commandGame(s,command,s.clock.nowMs,"sustain/"+s.commandHistory.length);
  };
  if(s.sleeping){
    if(s.lightsOn)act({type:"lights",on:false});
    return s;
  }
  if(s.attention.discipline)act({type:"discipline"});
  for(const [key,food] of [["hunger","meal"],["happiness","snack"],["strength","protein"]] as const)
    while(s.meters[key]<4)act({type:"feed",food});
  if(s.waste)act({type:"clean"});
  while(s.health.sickness||s.health.injury)act({type:"medicine"});
  return s;
}
function living(days:number):GameState{
  let s=createGame("MATURE-LIVING","infant",T);
  for(let h=1;h<=days*24;h++){
    s=care(advanceGame(s,T+h*HOUR,h%17===0?"absent":"active"));
    if(h%24===0)assert.equal(s.dead,false,"genuine living physiology at day "+h/24);
  }
  return s;
}

test("[AUD-002/A1] a genuinely alive day-400 pet changes current need physiology after an accepted command",()=>{
  const alive=living(400),before=recordedNeedsSimulation(alive).stateAt(400);
  assert.equal(alive.dead,false);
  assert.equal(alive.clock.nowMs,T+400*DAY);
  assert.ok(alive.matureCare);
  const changed=commandGame(alive,{type:"discipline"},T+400*DAY,"post-maturity-mistake");
  assert.equal(changed.commandHistory.at(-1)?.accepted,true);
  assert.equal(changed.meters.happiness,Math.max(0,alive.meters.happiness-1));
  const after=recordedNeedsSimulation(changed).stateAt(400);
  assert.notEqual(after.needs.relaxation.fulfillment,before.needs.relaxation.fulfillment);
  assert.ok(changed.matureCare!.samples.some(s=>s.atMs===T+400*DAY));
  assert.ok(changed.matureCare!.samples.length<=128);
  assert.equal(deriveCareTimeline(changed).at(-1)!.tick,400*24);
  const rejected=commandGame(changed,{type:"choose",choice:"higher"},T+400*DAY,"invalid-choice");
  assert.equal(rejected.commandHistory.at(-1)?.accepted,false);
  assert.deepEqual(recordedNeedsSimulation(rejected).stateAt(400),after);
  assert.deepEqual(validateGameState(JSON.parse(JSON.stringify(changed))),changed);
});

test("[AUD-002/A2] days 364/365/366 and later 440 keep anatomy frozen while wellbeing remains causal",()=>{
  const alive=living(440);
  const sim=createSimulation(fixtures.blob,alive.seed,alive.mode,{careGame:alive});
  const anatomy=sim.materialStateAt(365);
  assert.equal(anatomy.completedChecks,365);
  for(const d of [364,365,366,400,440]){
    assert.equal(sim.materialStateAt(d).completedChecks,Math.min(365,d));
  }
  assert.deepEqual(sim.materialStateAt(366),anatomy);
  assert.deepEqual(sim.materialStateAt(400),anatomy);
  assert.deepEqual(sim.materialStateAt(440),anatomy);
  assert.equal(alive.dead,false);
  const after=commandGame(alive,{type:"discipline"},alive.clock.nowMs,"late-care");
  assert.notDeepEqual(recordedNeedsSimulation(after).stateAt(440),
    recordedNeedsSimulation(alive).stateAt(440));
  assert.deepEqual(createSimulation(fixtures.blob,after.seed,after.mode,{careGame:after})
    .materialStateAt(440),anatomy);
  assert.ok(after.matureCare!.samples.length<=128);
  assert.ok(after.matureCare!.checkpoint.tick>365*24);
});

test("[AUD-002/A3] save/reopen, equal-clock rejection, and batched/incremental updates preserve physiology",()=>{
  const at365=living(365);
  const s=care(advanceGame(at365,T+366*DAY,"active"));
  const returned=validateGameState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(returned,s);
  const start=T+366*DAY;
  const batched=advanceGame(s,start+2*HOUR,"absent");
  const sliced=advanceGame(advanceGame(s,start+HOUR,"absent"),start+2*HOUR,"absent");
  assert.deepEqual(batched,sliced);
  assert.deepEqual(recordedNeedsSimulation(batched).stateAt(366+2/24),
    recordedNeedsSimulation(sliced).stateAt(366+2/24));
  const bad=commandGame(s,{type:"choose",choice:"left"},start,"rejected");
  assert.equal(bad.commandHistory.at(-1)?.accepted,false);
  assert.deepEqual(bad.matureCare,s.matureCare,
    "a rejected command cannot fabricate any postmaturity physiological change");
  const reopened=validateGameState(JSON.parse(JSON.stringify(batched)));
  assert.deepEqual(recordedNeedsSimulation(reopened).stateAt(366+2/24),
    recordedNeedsSimulation(batched).stateAt(366+2/24));
});

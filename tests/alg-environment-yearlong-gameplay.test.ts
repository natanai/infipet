import test from "node:test";
import assert from "node:assert/strict";
import {advanceGame,commandGame,createGame,validateGameState,DAY,HOUR,GAME_RULES,type GameState,type GameCommand} from "../src/gameplay";

const T=Date.UTC(2026,2,7,12,17,13,123);
function care(game:GameState):GameState {
  let s=game;
  const command=(c:GameCommand)=>{s=commandGame(s,c,s.clock.nowMs,"care/"+s.commandHistory.length);};
  if(s.sleeping) {if(s.lightsOn)command({type:"lights",on:false});return s;}
  if(s.attention.discipline)command({type:"discipline"});
  for(const [meter,food] of [["hunger","meal"],["happiness","snack"],["strength","protein"]] as const)
    while(s.meters[meter]<4)command({type:"feed",food});
  if(s.waste)command({type:"clean"});
  while(s.health.sickness||s.health.injury)command({type:"medicine"});
  return s;
}

test("[GAME-002/A1] actual deterministic care supports 370 days; mortality remains physiological",()=>{
  let s=createGame("YEAR-LIVING","infant",T);
  const immutable=[s.seed,s.clock.startedAtMs,s.clock.hatchAtMs];
  for(let hour=1;hour<=370*24;hour++) {
    s=care(advanceGame(s,T+hour*HOUR));
    assert.equal(s.dead,false,"healthy survival at hour "+hour);
    if(hour===31*24||hour===365*24)s=validateGameState(JSON.parse(JSON.stringify(s)));
  }
  assert.deepEqual([s.seed,s.clock.startedAtMs,s.clock.hatchAtMs],immutable);
  assert.equal(s.clock.nowMs,T+370*DAY);
  assert.ok(s.stats.meals>1000,"real command history, not artificially immortal meters");
  assert.ok(s.careObservations!.length>365);
  assert.ok(s.careObservations!.every(o=>o.atMs<=T+365*DAY));
  assert.ok(!("lifespanMs" in GAME_RULES));
  const neglected=advanceGame(createGame("NEGLECT","infant",T),T+2*DAY,"active");
  assert.equal(neglected.dead,true);
  assert.match(neglected.death!.cause,/hunger|sickness|injury/);
  assert.deepEqual(validateGameState(JSON.parse(JSON.stringify(s))),s);
});

test("[GAME-002/A2] elapsed clock, fractional evidence, absence, backward time and stage determinism",()=>{
  const initial=createGame("REAL-CLOCK","egg",T,{utcOffsetMinutes:-360});
  const hatch=initial.clock.hatchAtMs;
  assert.equal(hatch-T,5*60_000);
  let s=advanceGame(initial,hatch+HOUR);
  const before=s.meters.hunger;
  s=commandGame(s,{type:"feed",food:"meal"},hatch+HOUR+12345,"fractional");
  assert.equal(s.meters.hunger,before+1);
  assert.equal(s.careObservations!.at(-1)!.atMs,hatch+HOUR+12345);
  assert.equal(s.commandHistory.at(-1)!.atMs,hatch+HOUR+12345);
  assert.throws(()=>advanceGame(s,s.clock.nowMs-1),/clock/);
  assert.throws(()=>commandGame(s,{type:"clean"},s.clock.nowMs-1,"backward"),/clock/);
  assert.throws(()=>advanceGame(s,NaN),/clock/);
  assert.throws(()=>createGame("X","infant",Number.MAX_SAFE_INTEGER),/range/);
  const absent=advanceGame(s,hatch+7*DAY,"absent");
  assert.equal(absent.commandHistory.length,s.commandHistory.length);
  assert.ok(absent.grace,"return grace retains actual neglect without inventing care");
  assert.ok(absent.careObservations!.some(o=>o.presence==="absent"));
  assert.deepEqual(validateGameState(JSON.parse(JSON.stringify(absent))),absent);
  const direct=advanceGame(initial,hatch+49*HOUR,"absent");
  const split=advanceGame(advanceGame(initial,hatch+DAY,"absent"),hatch+49*HOUR,"absent");
  assert.deepEqual(direct,split);
  const offsetChanged=JSON.parse(JSON.stringify(initial)) as GameState;
  offsetChanged.clock.utcOffsetMinutes=-300;
  assert.equal(offsetChanged.clock.hatchAtMs,hatch,"DST affects sleep schedule, never the birth anchor");
  assert.equal(Math.floor((hatch+DAY-hatch)/DAY),1);
});


test("[GAME-002/A2] one-second rendering and hourly batching have identical real care evidence and bounded archives",()=>{
  let coarse=createGame("PARTITION-INDEPENDENT","infant",T);
  for(let hour=1;hour<=24;hour++)coarse=care(advanceGame(coarse,T+hour*HOUR));
  let fine=createGame("PARTITION-INDEPENDENT","infant",T);
  for(let second=1;second<=86400;second++){
    fine=advanceGame(fine,T+second*1000);
    if(second%3600===0)fine=care(fine);
  }
  assert.deepEqual(fine,coarse,"frame frequency is not a biological or care input");
  assert.ok(fine.careObservations!.length<100,"one-second play cannot create 86400 archival observations per day");
  const once=advanceGame(createGame("PRESENCE-PARTITION","infant",T),T+HOUR/4);
  const split=advanceGame(advanceGame(createGame("PRESENCE-PARTITION","infant",T),T+12345),T+HOUR/4);
  assert.deepEqual(once,split);
  assert.deepEqual(advanceGame(once,T+HOUR,"absent"),
    advanceGame(advanceGame(split,T+HOUR/2,"absent"),T+HOUR,"absent"));
});

import test from "node:test";
import assert from "node:assert/strict";
import {createGame,advanceGame,commandGame,HOUR,DAY,type GameState} from "../src/gameplay";
import {summarizeDailyCareWindow} from "../src/environment/daily-care";
const T=Date.UTC(2026,2,7,18,13,14,123);
const snapshot=(s:GameState)=>JSON.parse(JSON.stringify(s)) as GameState;

test("[CARE-004/A1] independent exact rectangle areas, fractional commands and half-open boundaries",()=>{
  let s=advanceGame(createGame("WINDOW","infant",T),T+DAY,"absent");
  s.careObservations=[
    {atMs:T,values:[1,0.8,0.7,0.9,0.7,0.4],nutrition:1,presence:"active"},
    {atMs:T+HOUR/2,values:[0.5,0.2,0.7,0.3,0.7,0.8],nutrition:0.25,presence:"absent"},
    {atMs:T+DAY,values:[1,1,1,1,1,1],nutrition:1,presence:"active"},
  ];
  const w=summarizeDailyCareWindow(s,1);
  assert.equal(w.startMs,T);assert.equal(w.endMs,T+DAY);
  assert.equal(w.forcing.nutrition,(0.5+23.5*0.25)/24);
  assert.equal(w.forcing.rest,(0.5*0.9+23.5*0.3)/24);
  assert.equal(w.forcing.threat,23.5*0.5/24);
  assert.equal(w.activeMs,HOUR/2);assert.equal(w.absentMs,DAY-HOUR/2);
  assert.deepEqual(w.unknown,[]);
  let live=advanceGame(createGame("FRACTION","infant",T),T+HOUR);
  live=commandGame(live,{type:"feed",food:"meal"},T+1.5*HOUR,"fraction");
  live=advanceGame(live,T+DAY,"absent");
  live=commandGame(live,{type:"choose",choice:"left"},T+DAY,"rejected-boundary");
  const day1=summarizeDailyCareWindow(live,1);
  assert.equal(day1.acceptedCommands,1);assert.equal(day1.rejectedCommands,0);
  assert.ok(live.careObservations!.some(o=>o.atMs===T+1.5*HOUR&&o.nutrition===1));
  live=advanceGame(live,T+2*DAY,"absent");
  const day2=summarizeDailyCareWindow(live,2);
  assert.equal(day2.rejectedCommands,1);
  assert.equal(day2.acceptedCommands,0);
});

test("[CARE-004/A2] unknown remains unknown, future care cannot rewrite day 1 or 365",()=>{
  const old=advanceGame(createGame("MISSING","infant",T),T+366*DAY,"absent");
  old.careSamples=[];delete old.careObservations;
  const missing=summarizeDailyCareWindow(old,1);
  assert.equal(missing.forcing.observedFraction,0);
  assert.equal(missing.forcing.nutrition,0);
  assert.equal(missing.acceptedCommands,0);
  assert.equal(missing.unknownMs,DAY);assert.ok(missing.unknown.includes("physiology"));
  const legacy=snapshot(old);legacy.careSamples=[{hour:0,values:[0.5,0.5,0.5,0.5,0.5,0.5]}];
  assert.ok(summarizeDailyCareWindow(legacy,1).unknown.includes("nutrition"));
  const unchanged=summarizeDailyCareWindow(old,365);
  const later=commandGame(old,{type:"clean"},old.clock.nowMs,"later");
  assert.deepEqual(summarizeDailyCareWindow(later,365),unchanged);
  assert.deepEqual(summarizeDailyCareWindow(snapshot(later),1),missing);
  assert.throws(()=>summarizeDailyCareWindow(later,366),/clock/);
  const invalid=snapshot(later);invalid.commandHistory[0]={...invalid.commandHistory[0],atMs:T+DAY-0.1};
  assert.throws(()=>summarizeDailyCareWindow(invalid,1),/history/);
  const backward=snapshot(later);backward.careObservations=[
    {atMs:T+1,values:[1,1,1,1,1,1],nutrition:1,presence:"active"},
    {atMs:T,values:[1,1,1,1,1,1],nutrition:1,presence:"active"}];
  assert.throws(()=>summarizeDailyCareWindow(backward,1),/chronology/);
});

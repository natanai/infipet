import test from "node:test";
import assert from "node:assert/strict";
import { HOUR, GAME_RULES, createGame, commandGame, advanceGame,
  deriveCareTimeline, deriveDevelopmentContext } from "../src/gameplay";
import { createEnvironmentalHistory } from "../src/environment";
import { RETRO_PRESETS, cloneRetroPreset } from "../src/retro";
import { drawingPixels } from "../src/drawing";
import { listNativeP1HistoryRoutes } from "../src/gameplay/native-p1";
import { evaluateTrajectory } from "./alg-evaluation-trajectory-metrics";
import { isIndependentlyReplayedProductionSample } from "./alg-evaluation-production-witness";
import {
  SEARCH_LIMITS, WITNESS_VERSION,
  enumerateCandidates, strategySteps, executeSteps,
  createRecordedCareWitness, replayRecordedCareWitness,
  selectBestCandidate, searchRecordedCareWitness,
  type RecordedCareWitness,
} from "./alg-evaluation-recorded-care-search";

const birth=12*HOUR;
const pixel=(x:number,y:number)=>({x,y,color:"#597b42"});
const source=[{id:"arbitrary-drawn-organism",kind:"body" as const,
  name:"Drawn by player",parentId:null,position:{x:0,y:0},
  pixels:[
    pixel(8,8),pixel(9,8),pixel(10,8),
    pixel(8,9),pixel(9,9),pixel(10,9),
    pixel(8,10),pixel(9,10),pixel(10,10),
  ]}];
const controlHours=[0.5,1,2,4];
const base=(steps=strategySteps("fractional",birth,4))=>
  createRecordedCareWitness({
    source,seed:"eval003/fixture-seed/0",birthAtMs:birth,
    steps,stages:controlHours,searchSeed:"fixture-seed",
    enumerationIndex:0,strategy:"fractional",
  });
const fresh=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;

test("[EVAL-003/A1] finite seed-major enumeration, fixed limits and independently derived selection oracle",()=>{
  const candidates=enumerateCandidates("run-17",3,
    ["observe","fractional","maintain"],4);
  assert.deepEqual(candidates.map(c=>[c.index,c.permanentSeed,c.strategy]),[
    [0,"eval003/run-17/0","observe"],
    [1,"eval003/run-17/0","fractional"],
    [2,"eval003/run-17/0","maintain"],
    [3,"eval003/run-17/1","observe"],
  ]);
  assert.deepEqual(enumerateCandidates("run-17",3,
    ["observe","fractional","maintain"],4),candidates);
  assert.equal(SEARCH_LIMITS.maxCandidates,4);
  assert.equal(SEARCH_LIMITS.maxHours,128);
  assert.throws(()=>enumerateCandidates("x",6,["observe"],4),/invalid seed count/);
  assert.throws(()=>enumerateCandidates("x",1,["observe"],5),/invalid search budget/);
  assert.throws(()=>enumerateCandidates("x",1,["observe","observe"],1),/strategy/);
  const synthetic=[
    {index:0,status:"fail" as const,aggregate:0.4,weakest:0.3},
    {index:1,status:"pass" as const,aggregate:0.81,weakest:0.79},
    {index:2,status:"pass" as const,aggregate:0.88,weakest:0.7},
    {index:3,status:"pass" as const,aggregate:0.88,weakest:0.83},
    {index:4,status:"pass" as const,aggregate:0.88,weakest:0.83},
  ];
  // Known optimum follows lexicographic key: pass, aggregate, weakest, -index.
  assert.equal(selectBestCandidate(synthetic)?.index,3);
  assert.equal(selectBestCandidate([synthetic[4],synthetic[3]])?.index,3);
  assert.equal(selectBestCandidate([]),null);
});

test("[EVAL-003/A1] true fractional commands retain accepted/rejected receipts and native physiological samples",()=>{
  const steps=strategySteps("fractional",birth,4);
  assert.equal(steps[0].atMs,birth+HOUR/4);
  assert.equal(steps[1].atMs,birth+HOUR/2);
  const game=executeSteps("eval003/fixture-seed/0",birth,steps);
  assert.deepEqual(game.commandHistory.map(r=>[r.id,r.accepted,r.atMs]),[
    ["invalid-choice",false,birth+HOUR/4],
    ["fractional-clean",true,birth+HOUR/2],
  ]);
  assert.equal(game.clock.nowMs,birth+4*HOUR);
  assert.ok(game.careSamples.length>0);
  const history=createEnvironmentalHistory(game);
  assert.deepEqual(history.commands.map(c=>[c.atHour,c.accepted]),[
    [0.25,false],[0.5,true],
  ]);
  assert.deepEqual(history.samples.map(s=>s.hour),game.careSamples.map(s=>s.hour));
  assert.equal(history.maxHour,4);
  assert.deepEqual(deriveCareTimeline(game).length,game.careSamples.length*6);
  assert.equal(deriveDevelopmentContext(game).hatchAtHours,0);
  assert.ok(game.stageCommitments.some(s=>s.atHour===1),"real stage gate at 1 hour");
  let manual=createGame("eval003/fixture-seed/0","infant",birth);
  manual=commandGame(manual,{type:"choose",choice:"high"},birth+HOUR/4,"invalid-choice");
  manual=commandGame(manual,{type:"clean"},birth+HOUR/2,"fractional-clean");
  manual=advanceGame(manual,birth+4*HOUR,"active");
  assert.deepEqual(game,manual,"step interpreter must faithfully replay canonical commands");
  assert.throws(()=>executeSteps("x",birth,[steps[1],steps[0]]),/chronological/);
});

test("[EVAL-003/A1] serialized birth/seed/care/stages replays byte-identical chronological material and frame evidence",()=>{
  const original=base();
  const serialized=JSON.stringify(original.witness);
  const deserialized=JSON.parse(serialized) as RecordedCareWitness;
  assert.equal(deserialized.version,WITNESS_VERSION);
  assert.ok(deserialized.source[0].pixels.length===source[0].pixels.length);
  assert.ok(deserialized.care.commandHistory.some(c=>!c.accepted));
  assert.ok(deserialized.care.commandHistory.some(c=>c.accepted));
  assert.deepEqual(deserialized.stages,controlHours);
  assert.equal(deserialized.care.context.stageEndHours[0],GAME_RULES.stageEndHours[0]);
  assert.deepEqual(deserialized.care.environment.commands.map(c=>c.accepted),[false,true]);
  const replay=replayRecordedCareWitness(deserialized);
  assert.equal(replay.production.programFingerprint,original.production.programFingerprint);
  assert.deepEqual(replay.production.samples.map(s=>s.graph),
    original.production.samples.map(s=>s.graph));
  assert.deepEqual(replay.production.samples.map(s=>s.pixels),
    original.production.samples.map(s=>s.pixels));
  assert.deepEqual(replay.game,original.game);
  assert.deepEqual(replay.production.careEvidence,{
    commandCount:2,sampleCount:original.game.careSamples.length,
    stageCount:original.game.stageCommitments.length,maxHour:4,
    accepted:1,rejected:1,
  });
  assert.ok(replay.production.samples.some(s=>s.graph?.events!==undefined));
});

test("[EVAL-003/A2] witness mutations of seed, birth ink, command, timestamp, replayed material cannot counterfeit a life",()=>{
  const w=base().witness;
  const tamper=(edit:(value:any)=>void)=>{
    const bad=fresh(w);edit(bad);
    assert.throws(()=>replayRecordedCareWitness(bad),/witness rejected|Invalid|mismatch|identity/);
  };
  tamper(bad=>bad.permanentSeed="different");
  tamper(bad=>bad.source[0].pixels[0].x+=1);
  tamper(bad=>bad.chronologicalSteps[0].command.choice="low");
  tamper(bad=>bad.chronologicalSteps[1].atMs+=1);
  tamper(bad=>bad.stages[1]=3.2);
  tamper(bad=>bad.identity.source="fabricated");
  tamper(bad=>bad.stagesSha256[1].materialSha256="invented-material");
  tamper(bad=>bad.care.careSamples[0].values[0]=0);
  tamper(bad=>bad.care.commandHistory[0].accepted=true);
  // Removing a command from the history while keeping recorded physiology
  // necessarily changes the source-of-truth game and invalidates stored hashes.
  tamper(bad=>bad.chronologicalSteps.splice(1,1));
  const invalidLater:any=fresh(w);invalidLater.chronologicalSteps[0].atMs+=5*HOUR;
  assert.throws(()=>replayRecordedCareWitness(invalidLater),/mismatch|rejected/);
});

test("[EVAL-003/A2] recorded future interventions cannot retroactively rewrite an earlier independently replayed anatomy",()=>{
  const horizon=4;
  const earlier=strategySteps("observe",birth,horizon);
  const later=[
    {kind:"command" as const,atMs:birth+3*HOUR,id:"later-clean",
      command:{type:"clean" as const}},
    {kind:"advance" as const,atMs:birth+horizon*HOUR,presence:"active" as const},
  ];
  const original=createRecordedCareWitness({
    source,seed:"future-control",birthAtMs:birth,steps:earlier,
    stages:controlHours,searchSeed:"counterfactual",
    enumerationIndex:0,strategy:"observe",
  });
  const changed=createRecordedCareWitness({
    source,seed:"future-control",birthAtMs:birth,steps:later,
    stages:controlHours,searchSeed:"counterfactual",
    enumerationIndex:1,strategy:"observe",
  });
  for(let i=0;i<3;i++){
    assert.deepEqual(original.production.samples[i].graph,
      changed.production.samples[i].graph);
    assert.deepEqual(original.production.samples[i].pixels,
      changed.production.samples[i].pixels);
  }
  const noop=createRecordedCareWitness({
    source,seed:"future-control",birthAtMs:birth,
    steps:[{kind:"command",atMs:birth+HOUR/4,id:"rejected",
      command:{type:"choose",choice:"high"}},
      {kind:"advance",atMs:birth+4*HOUR,presence:"active"}],
    stages:controlHours,searchSeed:"counterfactual",
    enumerationIndex:2,strategy:"observe",
  });
  assert.equal(noop.game.commandHistory[0].accepted,false);
  assert.deepEqual(noop.production.samples.map(s=>s.graph),
    original.production.samples.map(s=>s.graph),
    "rejected no-op cannot fabricate a material effect");
});

test("[EVAL-003/A1/A2] actual deterministic budget search keeps all milestone evidence and never treats best as parity",()=>{
  const searchSeed="bounded-demo";
  const firstSpec=enumerateCandidates(searchSeed,1,["observe"],1)[0];
  const steps=strategySteps(firstSpec.strategy,birth,4);
  const observed=createRecordedCareWitness({
    source,seed:firstSpec.permanentSeed,birthAtMs:birth,steps,
    stages:controlHours,searchSeed,enumerationIndex:0,strategy:"observe",
  });
  const references=observed.production.samples.map(s=>({
    id:"external-control-"+s.atHour,atHour:s.atHour,
    pixels:s.pixels.map(p=>({x:p.x,y:p.y})),
  }));
  const args={source,birthAtMs:birth,searchSeed,references,
    seeds:2,strategies:["observe","fractional"] as const,budget:2};
  const result=searchRecordedCareWitness(args);
  const rerun=searchRecordedCareWitness(args);
  assert.deepEqual(result,rerun);
  assert.equal(result.budget,2);
  assert.equal(result.examined,2);
  assert.equal(result.exhausted,true);
  assert.equal(result.candidates.length,2);
  assert.ok(result.best);
  assert.deepEqual(result.requestedStages,controlHours);
  assert.ok(result.best.result.stages.every(s=>s.shapeScore!==null));
  assert.ok(result.best.result.stages.every(s=>s.status!=="pass"||
    s.physical.status==="verified"&&s.rendering.status==="verified"));
  assert.equal(result.searchStatus,"unresolved",
    "even exact visible control cannot establish full retro parity or missing material ownership");
  const replay=replayRecordedCareWitness(JSON.parse(JSON.stringify(result.best.witness)));
  assert.deepEqual(replay.production.samples.map(s=>s.graph),
    createRecordedCareWitness({
      source,seed:result.best.specification.permanentSeed,
      birthAtMs:birth,steps:result.best.witness.chronologicalSteps,
      stages:controlHours,searchSeed,
      enumerationIndex:result.best.specification.index,
      strategy:result.best.specification.strategy,
    }).production.samples.map(s=>s.graph));
  const shifted=references.map(x=>({...x,
    pixels:x.pixels.map(p=>({x:p.x+2,y:p.y+4})),
    metadata:{label:"changed research annotation"}}));
  const transformed=searchRecordedCareWitness({...args,references:shifted});
  assert.deepEqual(transformed.best?.witness,
    result.best.witness,
    "reference art and metadata must never reach the simulator or its recorded evidence");
  assert.throws(()=>searchRecordedCareWitness({...args,budget:5}),/budget/);
  const missing=evaluateTrajectory(observed.production.samples.slice(0,3),references,
    observed.production.sourceFingerprint);
  assert.notEqual(missing.status,"pass");
  assert.ok(missing.reasons.includes("milestone-coverage-mismatch"));
});

test("[EVAL-003/A2] bounded actual historical reference search publishes exact numerical and unresolved outcome",()=>{
  const catalog=new Map(RETRO_PRESETS.map(p=>[p.referenceId,p]));
  const route=listNativeP1HistoryRoutes().find(r=>r.characters.includes("p1.mametchi") &&
    r.characters.slice(0,4).every(id=>catalog.has(id)));
  assert.ok(route);
  const birthDrawing=cloneRetroPreset(catalog.get(route.characters[0])!.id);
  const hours=[0.5,1,49,121];
  const targets=route.characters.slice(0,4).map((id,i)=>({
    id,atHour:hours[i],pixels:drawingPixels(catalog.get(id)!.parts),
    metadata:{sourceUrl:catalog.get(id)!.sourceUrl},
  }));
  const search=searchRecordedCareWitness({
    source:birthDrawing,birthAtMs:birth,searchSeed:"retro-path-v1",
    references:targets,seeds:1,strategies:["maintain"],budget:1,
  });
  assert.equal(search.examined,1);
  assert.ok(search.best,"bounded search must preserve a complete exact replayable best witness");
  assert.equal(search.best.result.stages.length,4);
  assert.equal(search.searchStatus,"unresolved");
  assert.ok(search.best.result.stages.every(s=>s.shapeScore!==null));
  assert.ok(search.best.result.stages.some(s=>s.status!=="pass"));
  const replay=replayRecordedCareWitness(
    JSON.parse(JSON.stringify(search.best.witness)));
  assert.deepEqual(replay.production.samples.map(s=>s.graph),
    createRecordedCareWitness({
      source:search.best.witness.source,seed:search.best.witness.permanentSeed,
      birthAtMs:birth,steps:search.best.witness.chronologicalSteps,
      stages:hours,searchSeed:"retro-path-v1",enumerationIndex:0,
      strategy:"maintain",
    }).production.samples.map(s=>s.graph));
  console.info("EVAL-003 SEARCH "+JSON.stringify({
    budget:search.budget,examined:search.examined,status:search.searchStatus,
    seed:search.best.specification.permanentSeed,
    strategy:search.best.specification.strategy,
    commands:search.best.witness.care.commandHistory.length,
    accepted:search.best.witness.care.commandHistory.filter(x=>x.accepted).length,
    rejected:search.best.witness.care.commandHistory.filter(x=>!x.accepted).length,
    sampledHours:search.best.witness.care.careSamples.length,
    stageCommits:search.best.witness.care.stageCommitments.map(s=>s.atHour),
    shapes:search.best.result.stages.map(s=>({
      hour:s.atHour,status:s.status,IoU:s.silhouetteIoU,
      shape:s.shapeScore,structure:s.structuralScore,
      rendered:s.rendering.status,physical:s.physical.status,
      mismatches:s.mismatches,reasons:s.reasons,
    })),
    aggregate:search.best.result.aggregateScore,
    weakest:search.best.result.weakestStageScore,
    verifiedPhysicalStages:search.best.physicallyVerifiedStages,
    limitations:search.best.failureReasons.slice(0,8),
  }));
});

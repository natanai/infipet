import test from "node:test";
import assert from "node:assert/strict";
import {createSimulation,type Pixel} from "../src/simulation";
import {createGame,advanceGame,commandGame,DAY,HOUR,type GameState} from "../src/gameplay";
import {fixtures} from "./alg-development-fixtures";
import {evaluateDailyEvidence} from "./alg-evaluation-daily-proof";
import {buildProductionTrajectoryWitness} from "./alg-evaluation-production-witness";
import {dailyStrategySteps,executeSteps,searchDailyRecordedCareWitness,replayRecordedCareWitness} from "./alg-evaluation-recorded-care-search";
import type {DailyMaterialState} from "../src/development";
const T=Date.UTC(2026,9,27,12,0,0),seed="DAILY-EVAL-REAL",source=fixtures.branching;
const clone=<V>(v:V):V=>JSON.parse(JSON.stringify(v));
const game=executeSteps(seed,T,dailyStrategySteps(seed,"maintain",T,48));
const simulation=createSimulation(source,seed,"infant",{careGame:game,reuseLivingMaterial:false});
const state=simulation.materialStateAt(1),frame=simulation.frameAt(1);
const quads=(frame.interaction.diagnostics as {physicalMaterial:{renderedCellQuads:{cellId:string;quad:{x:number;y:number}[]}[]}}).physicalMaterial.renderedCellQuads;
const args={source,game,atMs:T+DAY,state,pixels:frame.pixels,renderWitness:{projections:quads}};

test("[EVAL-004/A1] physical ownership, daily witness replay, nulls and numerical reference failures remain distinct",()=>{
  assert.equal(evaluateDailyEvidence(args).status,"pass",JSON.stringify(evaluateDailyEvidence(args)));
  const observed=buildProductionTrajectoryWitness(source,seed,[0,24,48],{careGame:game,renderScope:"composited-screen"});
  assert.equal(observed.counts.genuinelyVerifiedStages,3);
  const references=observed.samples.map(s=>({id:"external/"+s.atHour,atHour:s.atHour,pixels:s.pixels.map(p=>({x:p.x,y:p.y}))}));
  const report=searchDailyRecordedCareWitness({source,birthAtMs:T,searchSeed:"daily-proof",references,seeds:1,strategies:["maintain"],budget:1});
  assert.ok(report.best);
  const replay=replayRecordedCareWitness(clone(report.best.witness));
  assert.deepEqual(replay.production.samples.map(s=>s.graph),
    buildProductionTrajectoryWitness(source,report.best.witness.permanentSeed,[0,24,48],{careGame:replay.game,renderScope:"composited-screen"}).samples.map(s=>s.graph));
  assert.ok(report.best.witness.chronologicalSteps.some(s=>s.kind==="command"));
  assert.ok(report.best.witness.stages.every(h=>h%24===0));
  assert.throws(()=>searchDailyRecordedCareWitness({source,birthAtMs:T,searchSeed:"old",references:[{id:"old",atHour:23,pixels:[]}],seeds:1,strategies:["observe"],budget:1}),/daily milestone/);
  const within=simulation.materialStateAt(1+0.1);
  assert.deepEqual(within,state,"physiology and pose cannot imply structural development");
  const posed=simulation.frameAt(1,{time:2});
  assert.ok(posed.pixels.every(p=>state.graph.cells.some(c=>c.id===p.materialCellId)),
    "pose can change without new material, and a quiescent pose is legitimate");
  assert.deepEqual(simulation.materialStateAt(1),state);
  assert.equal(evaluateDailyEvidence({...args,pixels:frame.pixels.map(p=>({x:p.x,y:p.y,color:p.color})),renderWitness:undefined}).status,"unresolved");
});

test("[EVAL-004/A2] independently falsify early growth, duplicated/fabricated checks and invalid boundary times",()=>{
  assert.equal(evaluateDailyEvidence({...args,atMs:T+23*HOUR}).status,"fail");
  const duplicate=clone(state);(duplicate as unknown as {checks:unknown[]}).checks.push(clone(state.checks[0]));
  assert.equal(evaluateDailyEvidence({...args,state:duplicate}).status,"fail");
  const fabricated=clone(state);(fabricated.checks[0] as {atMs:number}).atMs=T+7*DAY;
  assert.equal(evaluateDailyEvidence({...args,state:fabricated}).status,"fail");
  assert.equal(evaluateDailyEvidence({...args,atMs:T+DAY-0.5}).status,"fail");
  const absent=advanceGame(createGame(seed,"infant",T),T+2*DAY,"absent");
  assert.equal(evaluateDailyEvidence({...args,game:absent}).status,"fail","care from another/future interval cannot explain past cells");
  const corrupt=clone(state);(corrupt.graph.cells[0] as {x:number}).x+=1;
  assert.equal(evaluateDailyEvidence({...args,state:corrupt}).status,"fail","cached and fresh reconstruction disagreement is a failure");
});

test("[EVAL-004/A2] postmaturity transactions, attractive wrong ancestry and missing physical evidence cannot pass",()=>{
  assert.ok(state.graph.cells.some(c=>c.provenance==="generated"));
  const counterfeit=clone(state);
  const created=counterfeit.graph.cells.find(c=>c.provenance==="generated")!;
  (created as unknown as {sourceIds:string[]}).sourceIds=["not-original-ink"];
  assert.equal(evaluateDailyEvidence({...args,state:counterfeit}).status,"fail","same rendered silhouette with wrong ancestry fails");
  assert.equal(evaluateDailyEvidence({...args,state:undefined}).status,"unresolved");
  const old=advanceGame(game,T+367*DAY,"absent");
  const mature=createSimulation(source,seed,"infant",{careGame:old}).materialStateAt(365);
  const after=clone(mature);(after.graph.events as unknown[]).push({id:"after-maturity",kind:"reinforce",checkIndex:366,
    atHour:366*24,atMs:T+366*DAY,createdCellIds:[],removedCellIds:[],sourceCellIds:[],createdCells:[],genomeFingerprint:after.genomeFingerprint});
  assert.equal(evaluateDailyEvidence({...args,game:old,atMs:T+366*DAY,state:after}).status,"fail");
});

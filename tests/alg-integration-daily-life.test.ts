import test from "node:test";
import assert from "node:assert/strict";
import {createSimulation,type PetPart} from "../src/simulation";
import {advanceGame,commandGame,createGame,validateGameState,DAY,HOUR,type GameState} from "../src/gameplay";
import {fixtures,drawing} from "./alg-development-fixtures";
import {clearDailyLivingCache,getDailyLivingCacheStats} from "../src/integration/daily-runtime";
import {normalizeGroomTimeline,validGroomTick} from "../src/simulation/grooming";
import {verifyDailyMaterialInventory} from "../src/development/daily-step";
const T=Date.UTC(2026,9,27,12,17,23,456);
const sim=(parts:PetPart[],game:GameState,cold=false)=>createSimulation(parts,game.seed,game.mode,{careGame:game,reuseLivingMaterial:!cold});
const geometry=(f:ReturnType<ReturnType<typeof createSimulation>["frameAt"]>)=>f.pixels.map(p=>[p.x,p.y,p.color]);

test("[INT-002/A1] production API preserves one daily anatomy, immediate care, final maturity and exact chronological catch-up",()=>{
  const parts=fixtures.cavity;
  const born=createGame("REAL-DAILY","infant",T);
  const before=advanceGame(born,T+DAY-1,"absent");
  const a=sim(parts,before);
  assert.equal(a.materialStateAt(0).completedChecks,0);
  assert.deepEqual(a.materialStateAt((DAY-1)/DAY).graph,a.materialStateAt(0).graph);
  assert.deepEqual(geometry(a.frameAt((DAY-1)/DAY)),geometry(a.frameAt(0)));
  const boundary=advanceGame(before,T+DAY,"absent"),b=sim(parts,boundary);
  assert.equal(b.materialStateAt(1).completedChecks,1);
  const command=commandGame(boundary,{type:"feed",food:"meal"},T+DAY,"meal");
  assert.equal(command.meters.hunger,boundary.meters.hunger+1);
  const c=sim(parts,command);
  assert.deepEqual(c.materialStateAt(1),b.materialStateAt(1),"boundary commands belong to the next window");
  const late=advanceGame(command,T+366*DAY,"absent");
  const live=sim(parts,late);
  for(const day of [7,93,200,364,365]){
    const state=live.materialStateAt(day);
    assert.equal(state.completedChecks,day);assert.equal(state.checks.length,day);
    verifyDailyMaterialInventory(state.graph,T,day);
    assert.deepEqual(state.checks.map(c=>c.checkIndex),Array.from({length:day},(_,i)=>i+1));
    assert.deepEqual(state.checks.map(c=>c.atMs),Array.from({length:day},(_,i)=>T+(i+1)*DAY));
  }
  for(const k of [1,365]){
    assert.equal(live.materialStateAt(k-0.25/DAY).completedChecks,k-1,"sub-ms UI queries cannot round into a future check");
    assert.equal(live.materialStateAt(k).completedChecks,k);
  }
  assert.deepEqual(live.materialStateAt(366),live.materialStateAt(365));
  assert.deepEqual(geometry(live.frameAt(366)),geometry(live.frameAt(365)));
  assert.ok(live.frameAt(366,{time:2}).wellbeing);
  assert.ok(getDailyLivingCacheStats().states<=getDailyLivingCacheStats().maxStates);
});

test("[INT-002/A2] cached, reloaded and cold production graphs/events/ownership agree across ten unfamiliar drawings",()=>{
  const cohort={...fixtures,pixel:drawing(["#"]),thin:drawing(Array.from({length:32},()=>"#")),
    asymmetric:drawing(["#....","###..",".#...","....#"]),dense:drawing(Array.from({length:32},()=>"#".repeat(32)))};
  for(const [label,parts] of Object.entries(cohort)){
    if(!parts.some(p=>p.pixels.length))continue;
    const seed="INK-"+label;
    const game=advanceGame(createGame(seed,"infant",T),T+366*DAY,"absent");
    const s=sim(parts,game),warm=s.materialStateAt(365);
    const reopened=sim(parts,validateGameState(JSON.parse(JSON.stringify(game))));
    const cold=sim(parts,game,true);
    assert.deepEqual(reopened.materialStateAt(365),warm,label+" reopen");
    assert.deepEqual(cold.materialStateAt(365),warm,label+" independent reconstruction");
    assert.deepEqual(geometry(reopened.frameAt(365)),geometry(cold.frameAt(365)));
    const frame=s.frameAt(365);
    const active=new Set(warm.graph.cells.map(c=>c.id));
    for(const p of frame.parts.flatMap(p=>p.pixels)){
      assert.ok(p.materialCellId&&active.has(p.materialCellId),"every rendered pixel owns an active cell");
      assert.ok(p.materialSourceIds?.length);
    }
    const sourceCopy=JSON.stringify(parts);
    sim(parts,game).frameAt(366,{time:10,action:"move"});
    assert.equal(JSON.stringify(parts),sourceCopy);
  }
});

test("[INT-002/A2] actual fractional care can change anatomy only after its daily window and previews cannot contaminate a life",()=>{
  const parts=fixtures.branching,seed="CARE-DAILY-DIFF";
  const born=createGame(seed,"infant",T);
  let cared=born;
  for(let h=1;h<=24;h++){
    cared=advanceGame(cared,T+h*HOUR);
    if(cared.sleeping)continue;
    if(cared.attention.discipline)cared=commandGame(cared,{type:"discipline"},cared.clock.nowMs,"d/"+h);
    while(cared.meters.hunger<4)cared=commandGame(cared,{type:"feed",food:"meal"},cared.clock.nowMs,"f/"+cared.commandHistory.length);
  }
  const absent=advanceGame(born,T+DAY,"absent");
  const fed=sim(parts,cared),neglected=sim(parts,absent);
  assert.deepEqual(fed.materialStateAt(0.9).graph,neglected.materialStateAt(0.9).graph);
  assert.notDeepEqual(fed.materialStateAt(1).graph.cells,neglected.materialStateAt(1).graph.cells);
  const baseline=neglected.materialStateAt(1);
  createSimulation(parts,seed).frameAt(365);
  assert.deepEqual(sim(parts,absent).materialStateAt(1),baseline);
  assert.deepEqual(fed.genome,neglected.genome);
  clearDailyLivingCache();
  assert.deepEqual(sim(parts,absent).materialStateAt(1),baseline);
});

test("[INT-002/A2] persisted canonical checkpoints reopen without replay; damaged or wrong-history caches reconstruct safely",()=>{
  const parts=fixtures.fantasy,seed="PERSISTED-DAILY";
  const game=advanceGame(createGame(seed,"infant",T),T+366*DAY,"absent");
  const initial=sim(parts,game,true),expected=initial.materialStateAt(365);
  const checkpoint=JSON.parse(JSON.stringify(initial.exportAnatomicalCheckpoint()));
  clearDailyLivingCache();
  const restored=createSimulation(parts,seed,"infant",{careGame:game,anatomicalCheckpoint:checkpoint,reuseLivingMaterial:false});
  assert.equal(restored.getMaterialRuntimeStats!().imported,1);
  assert.deepEqual(restored.materialStateAt(366),expected);
  assert.equal((restored.getMaterialRuntimeStats!() as {steps:number}).steps,0,"valid saved mature state runs no biological steps");
  const corrupt=JSON.parse(JSON.stringify(checkpoint));corrupt.state.graph.cells[0].x+=1;
  const fallback=createSimulation(parts,seed,"infant",{careGame:game,anatomicalCheckpoint:corrupt,reuseLivingMaterial:false});
  assert.equal(fallback.getMaterialRuntimeStats!().imported,0);
  assert.deepEqual(fallback.materialStateAt(365),expected);
  const edited=JSON.parse(JSON.stringify(game)) as GameState;
  edited.careObservations![0]={...edited.careObservations![0],nutrition:0};
  const historicalEdit=createSimulation(parts,seed,"infant",{careGame:edited,anatomicalCheckpoint:checkpoint,reuseLivingMaterial:false});
  assert.equal(historicalEdit.getMaterialRuntimeStats!().imported,0);
  assert.deepEqual(historicalEdit.materialStateAt(365),sim(parts,edited,true).materialStateAt(365));
  const other=createSimulation(fixtures.blob,seed,"infant",{careGame:game,anatomicalCheckpoint:checkpoint,reuseLivingMaterial:false});
  assert.equal(other.getMaterialRuntimeStats!().imported,0);
});

test("[INT-002/A2] portable checkpoint SHA-256 agrees with independent native crypto",async()=>{
  const {checkpointDigest}=await import("../src/integration/checkpoint-integrity");
  const {createHash}=await import("node:crypto");
  for(const text of ["","abc","漢字 and 🐾",String.fromCharCode(0xd800),"a".repeat(10000),JSON.stringify({T,source:fixtures.fantasy})])
    assert.equal(checkpointDigest(text),createHash("sha256").update(text).digest("hex"));
});

test("[INT-002/A2] source-owned grooming poses existing hair without any between-check anatomical transaction",()=>{
  const body:PetPart={id:"body",kind:"body",name:"body",parentId:null,position:{x:0,y:0},pixels:[{x:16,y:25,color:"#607840"}]};
  const hair:PetPart={id:"hair",kind:"hair",name:"hair",parentId:"body",position:{x:0,y:0},pixels:Array.from({length:20},(_,i)=>({x:16,y:5+i,color:"#708040"}))};
  const parts=[body,hair],game=advanceGame(createGame("BRUSH-POSE","infant",T),T+4*DAY,"absent");
  const original=sim(parts,game),from=original.frameAt(3.5).parts.find(p=>p.kind==="hair")!.pixels[10];
  const at=3.5+0.25/24;
  const stroke=original.groomingStrokeAt(at,from,{x:from.x+12,y:from.y});
  assert.ok(stroke,"the brush must hit actual owned material");assert.equal(stroke.tick,84.25);
  assert.equal(validGroomTick(84.25-0.1/3600000),false,"a genuine fractional millisecond is invalid");
  assert.equal(normalizeGroomTimeline([stroke])[0].tick,84.25);
  const brushed=createSimulation(parts,game.seed,"infant",{careGame:game,groomingTimeline:[stroke]});
  assert.deepEqual(brushed.frameAt(at-1/DAY).pixels,original.frameAt(at-1/DAY).pixels,"future brushing cannot change an earlier pose");
  assert.deepEqual(brushed.materialStateAt(3.75),original.materialStateAt(3.75),"brushing has no authority to create, remove or relocate physical cells");
  const a=original.frameAt(3.75),b=brushed.frameAt(3.75);
  const quads=(f:typeof a)=>(f.interaction.diagnostics as {physicalMaterial:{renderedCellQuads:unknown}}).physicalMaterial.renderedCellQuads;
  assert.notDeepEqual(quads(a),quads(b),"the bounded cosmetic hair pose responds to real brushing");
  assert.deepEqual(brushed.materialStateAt(4),original.materialStateAt(4),"grooming cannot become an unrecorded anatomical growth input");
  assert.equal(original.groomingStrokeAt(3.5,{x:60,y:60},{x:61,y:62}),null);
});

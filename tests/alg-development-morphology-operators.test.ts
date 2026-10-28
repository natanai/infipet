import test from "node:test";
import assert from "node:assert/strict";
import {chooseMorphologicalField,proposeMorphologicalField,
  rankMorphologicalField,morphologicalVolumeCapacity} from "../src/development/morphological-fields";
import {assessIterativePlacement} from "../src/development/iterative-growth";
import {compileMaterialDevelopment} from "../src/development/operators";
import {applyDailyMaterialStep,createDailyMaterialState,
  verifyDailyMaterialInventory} from "../src/development/daily-step";
import type {DailyCareWindowV1} from "../src/development/daily-contract";
import type {MaterialCell,MaterialGraph} from "../src/development/material-graph";
import {materialInputs,fixtures,drawing} from "./alg-development-fixtures";
import type {InheritedGenome} from "../src/simulation/genome";
import {CHAOS_MODULUS,seedChaos} from "../src/development/chaos";

const EPOCH=1_700_050_000_000, DAY=86_400_000;
function window(k:number,care=1):DailyCareWindowV1{return {
 version:1,hatchAtMs:EPOCH,checkIndex:k,
 startMs:EPOCH+(k-1)*DAY,endMs:EPOCH+k*DAY,
 forcing:{nutrition:care,security:care,rest:care,
   activity:care,threat:0,observedFraction:care},
 acceptedCommands:0,rejectedCommands:0,observations:1,activeMs:DAY,
 absentMs:0,unknownMs:0,unknown:[],provenanceDigest:"morph/"+k+"/"+care,
};}
function cell(x:number,y:number):MaterialCell{return {
 id:"src/"+x+"/"+y,tissueId:"t",x,y,color:"#303030",
 provenance:"authored",sourceIds:["src/"+x+"/"+y],
 parentCellIds:[],operationId:null,
};}
const orthogonal=[[-1,0],[1,0],[0,-1],[0,1]] as const;
const xy=(c:{x:number;y:number})=>c.x+","+c.y;
function bounds(cells:readonly {x:number;y:number}[]){
 return {
  width:Math.max(...cells.map(c=>c.x))-Math.min(...cells.map(c=>c.x))+1,
  height:Math.max(...cells.map(c=>c.y))-Math.min(...cells.map(c=>c.y))+1,
  cells:cells.length,
 };
}
/** Independent mathematical inventory, not the engine's validation function. */
function conservation(graph:MaterialGraph){
 const original=new Map(graph.sourceCells.map(c=>[c.id,c]));
 const live=new Map(original),ever=new Set(live.keys());
 let last=0;const ancestry=new Map([...original.values()].map(c=>[c.id,new Set([c.id])]));
 for(const e of graph.events){
   assert.ok(e.checkIndex!==undefined&&e.checkIndex>=last&&e.checkIndex<=365);
   last=e.checkIndex;
   assert.equal(e.atHour,e.checkIndex*24);
   assert.equal(e.atMs,EPOCH+e.checkIndex*DAY);
   assert.deepEqual(e.createdCells?.map(c=>c.id),e.createdCellIds);
   const before=new Map(live);
   const during=new Map(before);
   for(const c of e.createdCells??[]){
     assert.ok(!ever.has(c.id),"physical identity cannot be recycled");
     assert.ok(!during.has(c.id),"creation must be new");
     assert.ok(c.parentCellIds.length>0);
     const inherited=new Set(c.parentCellIds.flatMap(id=>{
       const p=during.get(id);assert.ok(p,"parent must precede its child physically");
       assert.ok(Math.max(Math.abs(p.x-c.x),Math.abs(p.y-c.y))<=1,
         "every material quantum has an adjacent parent");
       return [...ancestry.get(id)!];
     }));
     assert.deepEqual(new Set(c.sourceIds),inherited);
     ancestry.set(c.id,inherited);ever.add(c.id);during.set(c.id,c);
   }
   for(const id of e.removedCellIds){
     assert.ok(live.has(id),"removal must consume live matter");live.delete(id);
   }
   for(const c of e.createdCells??[])live.set(c.id,c);
   // All relocations in a material event are atomic: validate the BEFORE
   // snapshot, then update the same permanent cell identities together.
   const moved=new Map<string,MaterialCell>();
   for(const move of e.physical?.relocations??[]){
     const before=live.get(move.cellId);
     assert.ok(before,"moving matter must already exist");
     assert.equal(xy(before),xy(move.from),"relocation from must equal live position");
     assert.ok(!moved.has(move.cellId),"duplicate relocation in one event");
     assert.equal(move.operationId,e.physical?.operation.id);
     assert.ok(Math.max(Math.abs(move.from.x-move.to.x),
       Math.abs(move.from.y-move.to.y))<=1);
     assert.equal(move.checkIndex,e.checkIndex);
     moved.set(move.cellId,{...before,x:move.to.x,y:move.to.y});
   }
   for(const [id,c] of moved)live.set(id,c);
 }
 assert.deepEqual(new Set(graph.cells.map(c=>c.id)),new Set(live.keys()));
 assert.deepEqual(new Map(graph.cells.map(c=>[c.id,xy(c)])),
   new Map([...live.values()].map(c=>[c.id,xy(c)])),
   "no surviving material identity may teleport without a recorded move");
 assert.deepEqual(graph.sourceCells,original.size?[...original.values()]:[]);
 assert.ok(graph.cells.every(c=>c.x>=0&&c.x<64&&c.y>=0&&c.y<64));
 assert.ok(graph.events.every(e=>(e.createdCells??[]).every(c=>
   !graph.protectedVoids.includes(xy(c)))));
}
test("[MORPH-002/A1] independently derived field geometry changes thickness, width and height, not a tip",()=>{
 const square=Array.from({length:9},(_,i)=>cell(3+i%3,3+Math.floor(i/3)));
 const orbit={x:1000,y:2000};
 const modes=["thicken","width","height","surface"] as const;
 for(const mode of modes){
   const candidates=rankMorphologicalField(square,"t",mode,orbit,16);
   assert.ok(candidates.length>0,mode);
   assert.deepEqual(candidates,rankMorphologicalField([...square].reverse(),"t",mode,orbit,16),
     "proposal ordering may not depend on array insertion order");
   for(const c of candidates){
     const parent=square.find(p=>p.id===c.parentId);
     assert.ok(parent);
     assert.ok(Math.max(Math.abs(parent.x-c.destination.x),
       Math.abs(parent.y-c.destination.y))===1);
     assert.ok(!square.some(p=>xy(p)===xy(c.destination)));
     assert.ok(c.neighboringMaterial>=1);
     if(mode==="thicken")assert.ok(c.neighboringMaterial>=2);
   }
   assert.deepEqual(proposeMorphologicalField(square,"t",mode,orbit),candidates[0]);
 }
 const widening=rankMorphologicalField(square,"t","width",orbit)[0];
 const heightening=rankMorphologicalField(square,"t","height",orbit)[0];
 const b=bounds(square);
 assert.ok(bounds([...square,widening.destination]).width>b.width);
 assert.equal(bounds([...square,widening.destination]).height,b.height);
 assert.ok(bounds([...square,heightening.destination]).height>b.height);
 assert.equal(bounds([...square,heightening.destination]).width,b.width);
 assert.throws(()=>rankMorphologicalField(square,"t","surface",orbit,999),/cap/);
 assert.throws(()=>proposeMorphologicalField(square,"t","surface",{x:-1,y:0}),/chaos/);
 assert.equal(proposeMorphologicalField([],"t","surface",orbit),null);
});
test("[MORPH-002/A2] coherent surfaces permit same-tissue contact without relaxing inter-tissue/void protection",()=>{
 const all=Array.from({length:9},(_,i)=>({...cell(3+i%3,3+Math.floor(i/3)),
  provenance:"generated" as const,parentCellIds:["src/4/4"],operationId:"test"}));
 const occupied=new Map(all.map(c=>[xy(c),c]));
 const parent=all.find(c=>c.x===5&&c.y===4)!;
 const destination={x:6,y:4},roots=new Map([["t","t"],["foreign","foreign"]]);
 assert.equal(assessIterativePlacement(occupied,new Set(),parent,"t",
   destination,0,roots),"self-overcrowding");
 assert.equal(assessIterativePlacement(occupied,new Set(),parent,"t",
   destination,0,roots,true),null);
 assert.equal(assessIterativePlacement(occupied,new Set(["6,4"]),parent,"t",
   destination,0,roots,true),"protected-void");
 const foreign={...cell(7,4),tissueId:"foreign"};
 assert.equal(assessIterativePlacement(new Map([...occupied,["7,4",foreign]]),
   new Set(),parent,"t",destination,0,roots,true),"unrelated-source-proximity");
 assert.equal(assessIterativePlacement(occupied,new Set(),parent,"t",
   {x:64,y:4},0,roots,true),"outside-world");
 assert.equal(assessIterativePlacement(occupied,new Set(),parent,"t",
   destination,3072,roots,true),"material-cap");
});
test("[MORPH-002/A3] independent allometric expression bounds dense growth without disabling small-source volume",()=>{
  // These exact expectations follow solely from the declared equation, NOT
  // from a renderer snapshot, seed-specific creature or production validator.
  assert.equal(morphologicalVolumeCapacity(9,0.5,0.5),98);
  assert.equal(morphologicalVolumeCapacity(1024,0.5,0.5),1064);
  assert.ok(morphologicalVolumeCapacity(9,0.5,0.5)-9>
    morphologicalVolumeCapacity(1024,0.5,0.5)-1024,
    "source mass inertia should not erase small organism growth capacity");
  for(const source of [1,4,9,64,128,512,1024,4096])
    for(const e of [0,0.1,0.5,1])for(const m of [0,0.5,1]){
      const cap=morphologicalVolumeCapacity(source,e,m);
      assert.ok(Number.isSafeInteger(cap)&&cap>=source&&cap<=source+192);
    }
  for(const bad of [0,-1,4097,0.5,Infinity,NaN])
    assert.throws(()=>morphologicalVolumeCapacity(bad,0.5,0.5),/allometric/);
  assert.throws(()=>morphologicalVolumeCapacity(9,1.1,0.5),/allometric/);
});
test("[MORPH-002/A3] genomic expansion potential and exact chaos gate anatomical field eligibility",()=>{
 const a=seedChaos("morph/seed-a"),b=seedChaos("morph/seed-b");
 assert.notDeepEqual(a,b);
 assert.equal(chooseMorphologicalField(0,1,a),null);
 assert.equal(chooseMorphologicalField(0.11,0.8,a),null);
 assert.ok(chooseMorphologicalField(1,1,a));
 assert.ok(chooseMorphologicalField(1,0,b));
 for(const potential of [-0.01,1.01,NaN])
  assert.throws(()=>chooseMorphologicalField(potential,0.5,a),/genetic/);
 assert.throws(()=>chooseMorphologicalField(0.9,0.4,{x:CHAOS_MODULUS,y:0}),/chaos/);
 const values=new Set<number>();
 for(let i=0;i<20;i++)values.add(seedChaos("morph-sweep-"+i).x);
 assert.ok(values.size>17,"birth seed reaches independently different deterministic phases");
});
test("[MORPH-002/A4] actual daily development deposits source-owned nontip material under bounded care",()=>{
 const births=fixtures.blob;
 const examined=[] as {seed:string;events:number;fields:number;
   spread:number;shape:ReturnType<typeof bounds>;graph:MaterialGraph}[];
 for(const seed of ["morph-alpha","morph-beta","morph-gamma","morph-delta"]){
   const {atlas,genome}=materialInputs(births,seed);
   const program=compileMaterialDevelopment(atlas,genome);
   let state=createDailyMaterialState(program,EPOCH);
   const before=bounds(state.graph.cells);
   for(let k=1;k<=42;k++)state=applyDailyMaterialStep(program,genome,state,window(k,1));
   conservation(state.graph);
   verifyDailyMaterialInventory(state.graph,EPOCH,42,program.source);
   const fields=state.graph.events.filter(e=>e.physical?.system==="iterative"&&e.kind==="expand");
   const tip=state.graph.events.filter(e=>e.physical?.system==="iterative"&&e.kind==="elongate");
   const shape=bounds(state.graph.cells);
   examined.push({seed,events:state.graph.events.length,fields:fields.length,
     spread:Math.max(0,shape.width-before.width)+Math.max(0,shape.height-before.height),
     shape,graph:state.graph});
   assert.ok(state.graph.sourceCells.every(c=>program.source.sourceCells.some(a=>a.id===c.id)));
   assert.ok(fields.every(e=>e.createdCellIds.length===1&&
     e.createdCells?.[0].parentCellIds.length===1));
   assert.ok(tip.every(e=>e.createdCells?.length===1));
 }
 console.info("MORPH-002 structural cohort",JSON.stringify(examined.map(x=>({
   seed:x.seed,events:x.events,area:x.shape.cells,span:[x.shape.width,x.shape.height],
   nonTipDeposits:x.fields,spread:x.spread,
 }))));
 assert.ok(examined.some(r=>r.fields>0),"at least one real coherent surface transformation");
 assert.ok(examined.some(r=>r.spread>0),"regional proportion changed physically");
 const signatures=new Set(examined.map(r=>JSON.stringify(r.shape)));
 assert.ok(signatures.size>=2,"seed changes more than tip azimuth");
});
test("[MORPH-002/A5] care vetoes are genuine nulls, future care cannot rewrite already committed morphology",()=>{
 const {atlas,genome}=materialInputs(drawing([".###.",".###.",".###."]), "morph-care");
 const program=compileMaterialDevelopment(atlas,genome);
 const newborn=createDailyMaterialState(program,EPOCH);
 let zero=newborn,rich=newborn;
 for(let k=1;k<=24;k++){
   zero=applyDailyMaterialStep(program,genome,zero,window(k,0));
   rich=applyDailyMaterialStep(program,genome,rich,window(k,1));
 }
 assert.deepEqual(zero.graph.sourceCells,rich.graph.sourceCells);
 assert.ok(zero.graph.events.length===0,"zero nutrient, rest and security cannot create matter");
 assert.ok(rich.graph.cells.length>zero.graph.cells.length,
   "real accepted daily resources must physically change this eligible organism");
 assert.ok(rich.graph.events.length>0,"genuine care must generate chronological material events");
 const at24=JSON.stringify(rich.graph);
 const changed=applyDailyMaterialStep(program,genome,rich,window(25,0));
 assert.equal(JSON.stringify(rich.graph),at24,"future care must never mutate past state");
 assert.deepEqual(changed.graph.cells,rich.graph.cells);
 assert.deepEqual(changed.graph.events,rich.graph.events);
 assert.throws(()=>applyDailyMaterialStep(program,genome,rich,window(24,1)),/Duplicate/);
});
test("[MORPH-002/A6] fabricated new material, forged relocation and ancestral deletion fail independent conservation",()=>{
 const {atlas,genome}=materialInputs(fixtures.blob,"morph-forge");
 const program=compileMaterialDevelopment(atlas,genome);
 let state=createDailyMaterialState(program,EPOCH);
 for(let k=1;k<=18;k++)state=applyDailyMaterialStep(program,genome,state,window(k));
 const g=state.graph;
 const extra={...g.sourceCells[0],id:"forged",x:60,y:60,
   provenance:"generated" as const,sourceIds:[g.sourceCells[0].id],
   parentCellIds:[g.sourceCells[0].id],operationId:"invented"};
 assert.throws(()=>conservation({...g,cells:[...g.cells,extra]}),/deep-equal|Expected/);
 assert.throws(()=>verifyDailyMaterialInventory({...g,cells:[...g.cells,extra]},
   EPOCH,18,program.source));
 const forged=g.events.length?g.events.map((e,i)=>i===0?
   {...e,createdCellIds:["invented-material"]}:e):[];
 if(forged.length)assert.throws(()=>conservation({...g,events:forged}));
 const survivor=g.cells[0];
 if(survivor)assert.throws(()=>conservation({...g,cells:g.cells.map(c=>
   c.id===survivor.id?{...c,x:c.x+1}:c)}),/teleport|relocation|same permanent|deep-equal|Expected/);
});

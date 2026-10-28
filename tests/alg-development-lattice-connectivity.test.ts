import test from "node:test";
import assert from "node:assert/strict";
import {isLatticeConnected} from "../src/development/lattice-connectivity";
import {compileMaterialDevelopment,createDailyMaterialState,applyDailyMaterialStep,
 type MaterialGraph,type DailyCareWindowV1} from "../src/development";
import {compileLifetimeRemodeling} from "../src/development/lifetime-remodeling";
import {applyRemodelingProposal,remodelingProposalsBetween} from "../src/development/remodel-transactions";
import {reconstructDailyPhysicalState} from "../src/development/spatial-inventory";
import {materialInputs,drawing} from "./alg-development-fixtures";

type Point=Readonly<{x:number;y:number}>;
const key=(p:Point)=>p.x+","+p.y;
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
// Independent undirected graph/union-find oracle. Uses all original nodes,
// including separate collocated identities, and never encodes a grid index.
function reference(points:readonly Point[]):boolean{
 if(!points.length)return false;
 const parent=points.map((_,i)=>i);
 const root=(i:number):number=>{while(parent[i]!==i)i=parent[i];return i;};
 for(let a=0;a<points.length;a++)for(let b=0;b<a;b++)
  if(Math.abs(points[a].x-points[b].x)<=1&&Math.abs(points[a].y-points[b].y)<=1)
   parent[root(a)]=root(b);
 return new Set(parent.map((_,i)=>root(i))).size===1;
}
test("[PERF-002/A1] exact occupancy reachability equals an independent all-pairs graph at every local pattern and world edge",()=>{
 for(let mask=0;mask<512;mask++){
  const points=Array.from({length:9},(_,i)=>({x:i%3,y:Math.floor(i/3)}))
   .filter((_,i)=>mask&(1<<i));
  const expected=reference(points);
  for(const [x,y] of [[0,0],[61,0],[0,61],[61,61]]){
   const shifted=points.map(p=>Object.freeze({x:p.x+x,y:p.y+y}));
   const before=JSON.stringify(shifted);
   assert.equal(isLatticeConnected(Object.freeze(shifted)),expected,"pattern "+mask);
   assert.equal(isLatticeConnected([...shifted].reverse()),expected);
   assert.equal(JSON.stringify(shifted),before);
  }
  assert.equal(isLatticeConnected(points.flatMap(p=>[p,{...p}])),expected,
   "authored co-location is a clique, not lost physical identities");
 }
 assert.equal(isLatticeConnected([{x:63,y:2},{x:0,y:3}]),false,"no row wrapping");
 assert.equal(isLatticeConnected([{x:0,y:0},{x:63,y:63}]),false);
 assert.equal(isLatticeConnected([{x:0,y:0},{x:1,y:1}]),true);
 assert.equal(isLatticeConnected(Array.from({length:4096},(_,i)=>({x:i%64,y:Math.floor(i/64)}))),true);
 // Reproducible generated walks exercise much larger connected graphs and
 // disconnected unions without trusting any producer growth implementation.
 let random=0x47524944;
 const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random;};
 for(let sample=0;sample<80;sample++){
  const points:Point[]=[{x:16,y:16}];
  for(let i=0;i<48;i++){
   const p=points.at(-1)!;
   points.push({x:Math.max(0,Math.min(31,p.x+(next()%3)-1)),
    y:Math.max(0,Math.min(31,p.y+(next()%3)-1))});
  }
  for(const graph of [points,[...points,{x:63,y:63}]])
   assert.equal(isLatticeConnected(graph),reference(graph));
 }
 for(const p of [{x:-1,y:0},{x:64,y:1},{x:1.5,y:2},{x:NaN,y:2}])
  assert.throws(()=>isLatticeConnected([p]),/bounded integer/);
});

function scenario(parts= drawing(["###","###","###"])){
 const {atlas,genome}=materialInputs(parts,"CAVITY-OVERLAY");
 const program=compileMaterialDevelopment(atlas,genome);
 const tissue=program.source.tissues.find(t=>t.sourceCellIds.length>=9)!;
 const remodeling=compileLifetimeRemodeling(program,genome,[{
  id:"indexed-validation",kind:"reinforce",tissueId:tissue.id,
  atHour:0,durationHours:12,units:12,strength:1,
 }]);
 const due=remodelingProposalsBetween(remodeling,0,12)[0];
 assert.ok(due,"fixture must possess actual inherited reinforcement potential");
 return {program,genome,remodeling,due};
}
test("[PERF-002/A2] indexed material validation retains ancestry, connectivity, overlap and protected-space rejection",()=>{
 const {program,remodeling,due}=scenario();
 const birth=program.source;
 for(const [mutate,reason] of [
  [(g:MaterialGraph)=>({...g,cells:[...g.cells,g.cells[0]]}),"duplicate-material-identity"],
  [(g:MaterialGraph)=>({...g,cells:g.cells.map((c,i)=>i?c:{...c,x:62,y:62})}),"existing-tissue-disconnected"],
  [(g:MaterialGraph)=>({...g,cells:g.cells.map((c,i)=>i?c:{...c,sourceIds:["invented-source"]})}),"missing-source-ancestry"],
  [(g:MaterialGraph)=>({...g,sourceCells:g.sourceCells.map((c,i)=>i?c:{...c,color:"#ffffff"})}),"foreign-source-material"],
 ] as const){
  const g=mutate(clone(birth)),before=JSON.stringify(g);
  const result=applyRemodelingProposal(g,remodeling,due);
  assert.equal(result.attempt.status,"rejected");
  assert.equal(result.attempt.reason,reason);
  assert.strictEqual(result.graph,g,"failed atomic operation must preserve the exact graph");
  assert.equal(JSON.stringify(g),before);
 }
 const ring=scenario(drawing(["#####","#...#","#...#","#...#","#####"]));
 const g=ring.program.source,[x,y]=g.protectedVoids[0].split(",").map(Number);
 const parent=g.cells.find(c=>Math.max(Math.abs(c.x-x),Math.abs(c.y-y))<=1)!;
 const illegal={...parent,id:"illegal-cavity-deposit",x,y,provenance:"generated" as const,
  parentCellIds:[parent.id],sourceIds:[...parent.sourceIds],operationId:"illegal-create"};
 const forged={...g,cells:[...g.cells,illegal],events:[{
  id:"illegal-create",kind:"expand",atHour:0,createdCellIds:[illegal.id],createdCells:[illegal],
  removedCellIds:[],sourceCellIds:[...illegal.sourceIds],
 }]};
 assert.equal(applyRemodelingProposal(forged,ring.remodeling,ring.due).attempt.reason,"existing-protected-void");
 const parts=drawing(["#####","#...#","#...#","#...#","#####"]);
 parts.push({...drawing(["#"])[0],id:"authored-overlay",position:{x:2,y:2}});
 const overlay=scenario(parts),o=overlay.program.source;
 const mark=o.cells.find(c=>o.protectedVoids.includes(key(c)))!;
 assert.ok(mark,"test must contain genuine authored ink in another tissue's protected cavity");
 assert.equal(applyRemodelingProposal(o,overlay.remodeling,overlay.due).attempt.status,"accepted");
 const shifted={...o,cells:o.cells.map(c=>c.id===mark.id?{...c,x:c.x+1}:c)};
 assert.equal(applyRemodelingProposal(shifted,overlay.remodeling,overlay.due).attempt.reason,"existing-protected-void",
  "only that exact stationary original identity receives the birth exception");
});

const TIME=1_800_000_123_456,DAY=86_400_000;
const window=(k:number):DailyCareWindowV1=>({version:1,hatchAtMs:TIME,checkIndex:k,
 startMs:TIME+(k-1)*DAY,endMs:TIME+k*DAY,
 forcing:{nutrition:1,rest:1,security:1,activity:1,threat:0,observedFraction:1},
 acceptedCommands:0,rejectedCommands:0,observations:0,activeMs:DAY,absentMs:0,
 unknownMs:0,unknown:[],provenanceDigest:"indexed-graph/"+k});
test("[PERF-002/A3] full daily life preserves exact original identities and independently reconstructs every physical transaction",()=>{
 const {program,genome}=scenario();
 const remodeling=compileLifetimeRemodeling(program,genome),
  authorization={material:program.operators,remodeling:remodeling.operations};
 let state=createDailyMaterialState(program,TIME);
 const birth=JSON.stringify(program.source);
 assert.deepEqual(applyDailyMaterialStep(program,genome,clone(state),window(1),remodeling),
  applyDailyMaterialStep(program,genome,state,window(1),remodeling),
  "identical cloned source arrays must pass the full value-comparison path");
 for(let k=1;k<=365;k++){
  state=applyDailyMaterialStep(program,genome,state,window(k),remodeling);
  if([1,7,90,180,365].includes(k)){
   const proof=reconstructDailyPhysicalState(clone(state.graph),TIME,k,program.source,authorization);
   assert.deepEqual(proof.cells,new Map(state.graph.cells.map(c=>[c.id,c])));
   assert.deepEqual(proof.tissues,new Map(state.graph.tissues.map(t=>[t.id,t])));
   assert.deepEqual(proof.links,new Map(state.graph.links.map(l=>[l.id,l])));
  }
 }
 assert.equal(JSON.stringify(program.source),birth);
 assert.equal(state.completedChecks,365);assert.equal(state.checks.length,365);
 assert.ok(state.graph.events.length>0);
 assert.deepEqual(state.graph.sourceCells,program.source.sourceCells);
 assert.ok(state.graph.events.every(e=>e.atHour===e.checkIndex!*24&&e.atMs===TIME+e.checkIndex!*DAY));
 const replay=()=>{
  let s=createDailyMaterialState(program,TIME);
  for(let k=1;k<=365;k++)s=applyDailyMaterialStep(program,genome,s,window(k),remodeling);
  return s;
 };
 assert.deepEqual(replay(),state,"call order, warm proof indexes and fresh birth replay must agree in full state");
});

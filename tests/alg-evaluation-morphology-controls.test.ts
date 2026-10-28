import test from "node:test";
import assert from "node:assert/strict";
import type {MaterialCell,MaterialGraph,MaterialEvent,MaterialTissue} from "../src/development/material-graph";
import {
  EXPRESSIVENESS_GATE,measurePhysical,measureChange,provePhysicalMaterial,
  qualifyPhysicalChange,compareCounterfactuals,
} from "../src/evaluation/morphology";

type Point=Readonly<{x:number;y:number}>;
const at=(p:Point)=>p.x+","+p.y;
const source=(name:string,points:readonly Point[]):MaterialGraph=>{
  const cells:MaterialCell[]=[...new Map(points.map(p=>[at(p),p])).values()].map((p,i)=>({
    id:"ink/"+name+"/"+i,tissueId:"source",x:p.x,y:p.y,
    color:"#000000",provenance:"authored" as const,sourceIds:["ink/"+name+"/"+i],
    parentCellIds:[],operationId:null,
  }));
  const tissue:MaterialTissue={id:"source",sourcePartId:name,parentId:null,
    relationship:"root",sourceCellIds:cells.map(c=>c.id),
    growthSiteIds:[],rigidity:0};
  return {version:1,sourceFingerprint:name,sourceCells:cells,
    cells:[...cells],tissues:[tissue],sites:[],links:[],protectedVoids:[],events:[],
    birth:{tissues:[tissue],sites:[],links:[],protectedVoids:[]}};
};
const box=(width:number,height:number,x=20,y=20):Point[]=>Array.from({length:width*height},(_,i)=>({
  x:x+i%width,y:y+Math.floor(i/width)}));
/**
 * Intentional restricted mutant: EVERY added cell is in a single cardinal
 * one-cell-wide chain. Same event/provenance structure as the positive.
 */
function add(graph:MaterialGraph,day:number,added:readonly Point[]):MaterialGraph{
  const seen=new Set(graph.cells.map(at)),points=added.filter(p=>!seen.has(at(p)));
  if(!points.length)return graph;
  const root=graph.sourceCells[0];
  const operation="synthetic/"+day;
  const createdCells:MaterialCell[]=points.map((p,i)=>({
    id:operation+"/"+i,tissueId:"source",x:p.x,y:p.y,color:root.color,
    provenance:"generated",sourceIds:[root.id],parentCellIds:[root.id],operationId:operation,
  }));
  const event:MaterialEvent={id:operation,kind:"synthetic-witness",atHour:day*24,checkIndex:day,
    atMs:day*86400000,sourceCellIds:[root.id],createdCellIds:createdCells.map(c=>c.id),
    removedCellIds:[],createdCells,careDigest:"synthetic/"+day,genomeFingerprint:"synthetic"};
  return {...graph,cells:[...graph.cells,...createdCells],events:[...graph.events,event]};
}
function tendril(graph:MaterialGraph):MaterialGraph{
  return add(graph,30,Array.from({length:20},(_,i)=>({x:26+i,y:21})));
}
function volume(graph:MaterialGraph,seed=0,care=0,day=30):MaterialGraph{
  const side=5+seed+care;
  const x=Math.max(...graph.cells.map(p=>p.x))+1;
  return add(graph,day,box(side,side,x,20));
}
const stable=(g:MaterialGraph)=>JSON.stringify(g);

test("[MORPH-003/A1] independent geometry distinguishes rich deposition, line-only mutant and honest constrained null",()=>{
  const initial=source("rectangle",box(5,5));
  const enlarged=volume(initial);
  const skinny=tendril(initial);
  const before=stable(initial);
  assert.equal(measurePhysical(initial).occupiedArea,25);
  assert.equal(measurePhysical(initial).perimeter,20);
  assert.equal(measurePhysical(initial).thickness.threePlus,1);
  assert.equal(measurePhysical(initial).solidity,1);
  assert.equal(measurePhysical(initial).components,1);
  assert.ok(measureChange(initial,enlarged).broadFraction>=0.20);
  assert.equal(measureChange(initial,skinny).broadFraction,0);
  assert.equal(provePhysicalMaterial(enlarged).valid,true);
  assert.equal(qualifyPhysicalChange(initial,enlarged,"eligible").status,"pass");
  const failed=qualifyPhysicalChange(initial,skinny,"eligible");
  assert.equal(failed.status,"fail");
  assert.ok(failed.reasons.some(s=>s.includes("Tendril-dominant")));
  assert.equal(qualifyPhysicalChange(initial,initial,"constrained").status,"null");
  assert.equal(qualifyPhysicalChange(initial,initial,"eligible").status,"fail");
  assert.equal(qualifyPhysicalChange(initial,initial,"unknown").status,"unresolved");
  assert.equal(stable(initial),before);
});
test("[MORPH-003/A2] forged attractive morphology, fabricated provenance and silent relocations all fail",()=>{
  const initial=source("proof",box(5,5));
  const adult=volume(initial);
  const forged:MaterialGraph={...adult,events:[]};
  assert.equal(provePhysicalMaterial(forged).valid,false);
  assert.equal(qualifyPhysicalChange(initial,forged,"eligible").status,"fail");
  const fake=JSON.parse(JSON.stringify(adult)) as MaterialGraph;
  const target=fake.cells.find(c=>c.provenance==="generated")!;
  (target as unknown as {sourceIds:string[]}).sourceIds=["not-my-art"];
  assert.equal(provePhysicalMaterial(fake).valid,false);
  const shifted=JSON.parse(JSON.stringify(adult)) as MaterialGraph;
  (shifted.cells[0] as {x:number}).x++;
  assert.equal(provePhysicalMaterial(shifted).valid,false);
  const future=JSON.parse(JSON.stringify(adult)) as MaterialGraph;
  (future.events[0] as {checkIndex:number}).checkIndex=366;
  assert.equal(provePhysicalMaterial(future).valid,false);
});
/** 30 deterministic independent birth drawings, not 30 restyled versions of one. */
function drawing(i:number):MaterialGraph{
  const width=3+i%5,height=3+Math.floor(i/5),shape=i%6;
  const points=box(width,height,19,19).filter(p=>{
    const x=p.x-19,y=p.y-19;
    if(shape===0)return true;
    if(shape===1)return x===0||y===0||x===width-1;
    if(shape===2)return x===Math.floor(width/2)||y===Math.floor(height/2);
    if(shape===3)return (x+y)%2===0||y===height-1;
    if(shape===4)return x<=y+1||y===0;
    return x===0||x===width-1||y===0||y===height-1;
  });
  return source("drawing-"+i,points);
}
/** Fixed design, not a production-calibrated threshold. */
const checks=[0,1,7,30,90,180,365] as const;
function syntheticLife(i:number,seed:number,care:number){
  const birth=drawing(i),last=checks.slice(1).map(day=>{
    if(i%7===0)return birth; // explicitly constrained fixture, not eligible
    if(care===0)return tendril(birth);
    return volume(birth,seed,care-1,day);
  });
  return [birth,...last];
}
test("[MORPH-003/A3] 30 distinct source forms, seed/care counterfactuals and day-365 trajectory are separated from birth differences",()=>{
  const births=Array.from({length:30},(_,i)=>drawing(i));
  assert.equal(new Set(births.map(g=>[...g.cells].map(at).sort().join(";"))).size,30);
  let eligible=0,positives=0,mutantRejected=0,nulls=0,seedDivergence=0,careDivergence=0;
  const sampleNumbers:number[]=[];
  for(let i=0;i<30;i++){
    const eligibleSource=i%7!==0;
    const high=syntheticLife(i,0,1),otherSeed=syntheticLife(i,1,1),low=syntheticLife(i,0,0);
    assert.equal(high.length,checks.length);
    assert.deepEqual(checks,[0,1,7,30,90,180,365]);
    if(!eligibleSource){
      assert.equal(qualifyPhysicalChange(high[0],high.at(-1)!,"constrained").status,"null");
      nulls++;continue;
    }
    eligible++;
    const qualified=qualifyPhysicalChange(high[0],high.at(-1)!,"eligible");
    if(qualified.status==="pass")positives++;
    sampleNumbers.push(qualified.change.broadFraction);
    if(qualifyPhysicalChange(low[0],low.at(-1)!,"eligible").status==="fail")mutantRejected++;
    if(compareCounterfactuals(high,otherSeed).divergentChecks>0)seedDivergence++;
    if(compareCounterfactuals(high,low).divergentChecks>0)careDivergence++;
  }
  assert.equal(births.length,30);
  assert.ok(eligible>=EXPRESSIVENESS_GATE.minEligibleLives);
  assert.ok(positives>=EXPRESSIVENESS_GATE.minIndependentBreadthExamples);
  assert.equal(mutantRejected,eligible);
  assert.ok(seedDivergence>=20);
  assert.ok(careDivergence>=20);
  assert.equal(nulls,5);
  assert.ok(sampleNumbers.every(n=>n>=EXPRESSIVENESS_GATE.minBroadFraction));
});

import test from "node:test";
import assert from "node:assert/strict";
import { materialInputs, drawing, fixtures } from "./alg-development-fixtures";
import { compileMaterialDevelopment, materialDevelopmentAt,
  materialOperatorPotential, type MaterialDevelopmentProgram,
  type MaterialOperator } from "../src/development/operators";
import { createMaterialGraph, materialSourceAncestry,
  reconstructMaterialGraph, type MaterialGraph } from "../src/development/material-graph";
import {
  initializeMaterialOperatorChronology, stepMaterialOperatorChronology,
  type MaterialOperatorChronologyState, type MaterialExpressionInterval,
} from "../src/development/operator-chronology";

function rig(rows:readonly string[],kind:MaterialOperator["kind"]="elongate",
  direction={x:1,y:0},seed="chrono-11", other?:string) {
  const {atlas,genome}=materialInputs(drawing(rows),seed);
  const base=compileMaterialDevelopment(atlas,genome);
  const tissue=base.source.tissues[0];
  const op:MaterialOperator={
    id:"fixed/"+kind,tissueId:tissue.id,kind,siteId:tissue.growthSiteIds[0],
    atHour:0,durationHours:4,strength:1,direction,
    ...(other?{targetTissueId:other}:{}),
  };
  const program:MaterialDevelopmentProgram={...base,operators:[op],
    fingerprint:base.fingerprint+"/test-"+kind};
  return {program,op,graph:base.source,
    state:initializeMaterialOperatorChronology(program)};
}
function interval(program:MaterialDevelopmentProgram,from:number,to:number,
  values:readonly number[]):MaterialExpressionInterval {
  return {fromHour:from,toHour:to,
    expressions:program.operators.map((o,i)=>({operatorId:o.id,cumulative:values[i]}))};
}
function amount(p:MaterialDevelopmentProgram,op:MaterialOperator,number:number) {
  const scale=op.kind==="branch"?5:7;
  return Math.min(1,(number+0.03)/(scale*materialOperatorPotential(op.kind,p.signals)));
}
function integrity(g:MaterialGraph,source:MaterialGraph) {
  assert.deepEqual(g.sourceCells,source.sourceCells);
  const cells=new Map(g.cells.map(c=>[c.id,c]));
  const tissue=new Set(g.tissues.map(t=>t.id));
  assert.equal(cells.size,g.cells.length);
  assert.ok(g.cells.every(c=>c.x>=0&&c.x<64&&c.y>=0&&c.y<64&&
    tissue.has(c.tissueId)&&c.sourceIds.length>0&&
    materialSourceAncestry(g,c.id).length===c.sourceIds.length));
  assert.ok(g.links.every(l=>
    tissue.has(l.fromTissueId)&&tissue.has(l.toTissueId)&&
    (l.fromCellId===null||cells.get(l.fromCellId)?.tissueId===l.fromTissueId)&&
    (l.toCellId===null||cells.get(l.toCellId)?.tissueId===l.toTissueId)));
  assert.equal(new Set(g.events.map(e=>e.id)).size,g.events.length);
  assert.ok(g.events.every(e=>e.createdCellIds.every(id=> 
    cells.has(id)||g.events.some(x=>x.removedCellIds.includes(id)))));
}
test("incremental unit IDs are unique and cumulative credit only creates newly earned material",()=>{
  const {program,op,graph,state}=rig(["##","##"]);
  const first=amount(program,op,1), third=amount(program,op,3);
  assert.ok(third>first&&third<=1);
  const a=stepMaterialOperatorChronology(graph,program,state,
    interval(program,0,1,[first]));
  assert.equal(a.events.length,1);
  const b=stepMaterialOperatorChronology(a.graph,program,a.state,
    interval(program,1,2,[first]));
  assert.equal(b.events.length,0);
  assert.strictEqual(b.graph,a.graph);
  const c=stepMaterialOperatorChronology(b.graph,program,b.state,
    interval(program,2,3,[third]));
  assert.equal(c.events.length,2);
  assert.deepEqual(c.events.map(e=>e.id),[
    "operator/fixed%2Felongate/unit/2","operator/fixed%2Felongate/unit/3",
  ]);
  const d=stepMaterialOperatorChronology(c.graph,program,c.state,
    interval(program,3,4,[third]));
  assert.equal(d.events.length,0);
  assert.equal(d.state.records[0].committedUnits,3);
  assert.equal(d.state.records[0].settled,true);
  assert.deepEqual(d.graph.cells.filter(x=>x.provenance==="generated").length,3);
  integrity(d.graph,graph);
  assert.throws(()=>stepMaterialOperatorChronology(d.graph,program,d.state,
    interval(program,4,5,[1])),/retroactive|Noncausal/);
});

test("live relocated tip anchors future growth; earlier events and their coordinates remain unchanged",()=>{
  const setup=rig(["##","##"]);
  const {program,op,graph,state}=setup;
  const oldTip=[...graph.cells].sort((a,b)=>b.x-a.x||a.y-b.y)[0];
  const translated:MaterialGraph={...graph,cells:graph.cells.map(c=>({...c,y:c.y+1})),
    events:[{id:"remodel/half",kind:"translate",atHour:0.5,
      createdCellIds:[],removedCellIds:[],sourceCellIds:[]}]};
  const a=stepMaterialOperatorChronology(translated,program,state,
    interval(program,0,1,[amount(program,op,1)]));
  assert.equal(a.events.length,1);
  assert.equal(a.events[0].atHour,1);
  const created=a.graph.cells.find(c=>c.id===a.events[0].createdCellIds[0])!;
  assert.equal(created.x,oldTip.x+1);
  assert.equal(created.y,oldTip.y+1);
  assert.deepEqual(a.graph.events[0],translated.events[0]);
  assert.deepEqual(graph.cells,program.source.cells);
  assert.equal(created.parentCellIds[0],oldTip.id);
  integrity(a.graph,graph);
});

test("historical completion is irreversible and after-window care cannot change earlier anatomy",()=>{
  const {program,op,graph,state}=rig(["##","##"]);
  const a=stepMaterialOperatorChronology(graph,program,state,
    interval(program,0,2,[amount(program,op,1)]));
  const b=stepMaterialOperatorChronology(a.graph,program,a.state,
    interval(program,2,4,[amount(program,op,1)]));
  const saved=JSON.stringify(b.graph);
  const c=stepMaterialOperatorChronology(b.graph,program,b.state,
    interval(program,4,9,[amount(program,op,1)]));
  assert.equal(JSON.stringify(c.graph),saved);
  assert.equal(c.state.records[0].settled,true);
  assert.deepEqual(a.graph.events,b.graph.events);
  assert.throws(()=>stepMaterialOperatorChronology(c.graph,program,c.state,
    interval(program,9,10,[0.99])),/retroactive/);
});

test("branching followed by live remodeling preserves ancestry and original attachments",()=>{
  const first=rig(["..#..","..#..","..#..","..#.."],"branch",
    {x:0,y:-1},"branch-seed");
  const p=first.program;
  const a=stepMaterialOperatorChronology(first.graph,p,first.state,
    interval(p,0,2,[Math.min(1,amount(p,first.op,1))]));
  assert.equal(a.events.length,1,JSON.stringify(a.decisions));
  assert.equal(a.graph.tissues.length,first.graph.tissues.length+2);
  assert.equal(a.graph.links.length,first.graph.links.length+2);
  const child=a.graph.tissues.find(t=>t.id===first.op.id+"/growth/0")!;
  assert.ok(child);
  // The same cell identity moves in place: its persistent site follows the
  // relocated tip rather than searching for a fresh source-material cell.
  const moved=new Set(a.graph.cells.filter(c=>c.tissueId===child.id).map(c=>c.id));
  const altered:MaterialGraph={...a.graph,
    cells:a.graph.cells.map(c=>moved.has(c.id)?{...c,y:c.y-1}:c),
    events:[...a.graph.events,{id:"remodel/external",kind:"translate",
      atHour:2.5,createdCellIds:[],removedCellIds:[],sourceCellIds:[]}]};
  const b=stepMaterialOperatorChronology(altered,p,a.state,
    interval(p,2,3,[amount(p,first.op,2)]));
  assert.equal(b.events.length,1,JSON.stringify(b.decisions));
  const created=b.graph.cells.filter(c=>b.events[0].createdCellIds.includes(c.id));
  assert.equal(created.length,2);
  assert.ok(created.every(c=>c.sourceIds.length&&
    materialSourceAncestry(b.graph,c.id).length));
  assert.deepEqual(b.graph.links.slice(0,a.graph.links.length),a.graph.links);
  integrity(b.graph,first.graph);
});

test("resorbed source site is suppressed without corrupting the authoritative graph",()=>{
  const {program,op,graph,state}=rig(["##","##"]);
  const site=graph.sites.find(s=>s.id===op.siteId)!;
  const removed=graph.cells.find(c=>c.id===site.rootCellId)!;
  const external:MaterialGraph={...graph,
    cells:graph.cells.filter(c=>c.id!==removed.id),
    events:[{id:"resorb/external",kind:"resorb",atHour:0.5,
      createdCellIds:[],removedCellIds:[removed.id],sourceCellIds:removed.sourceIds}]};
  const a=stepMaterialOperatorChronology(external,program,state,
    interval(program,0,1,[amount(program,op,1)]));
  assert.strictEqual(a.graph,external);
  assert.equal(a.decisions[0].status,"deferred");
  assert.equal(a.decisions[0].reason,"site-root-removed");
  assert.equal(a.state.records[0].committedUnits,0);
  const b=stepMaterialOperatorChronology(a.graph,program,a.state,
    interval(program,1,4,[amount(program,op,1)]));
  assert.strictEqual(b.graph,external);
  assert.equal(b.decisions[0].status,"suppressed");
  assert.equal(b.state.records[0].settled,true);
});

test("each material operator has real causal units or typed, graph-preserving rejection",()=>{
  for(const kind of ["elongate","expand","bud","reinforce","resorb","remodel"] as const) {
    const {program,op,graph,state}=rig(["###","###","###"],kind);
    const outcome=stepMaterialOperatorChronology(graph,program,state,
      interval(program,0,4,[1]));
    assert.ok(outcome.decisions.length>0,kind);
    assert.ok(outcome.decisions.every(x=>x.status==="accepted"||
      (x.status==="suppressed"&&x.reason!==null)),kind);
    if(outcome.events.length)integrity(outcome.graph,graph);
    assert.deepEqual(outcome.graph.sourceCells,graph.sourceCells,kind);
    assert.deepEqual(outcome.state.records.map(r=>r.operatorId),[op.id]);
    if(kind==="reinforce")assert.ok(outcome.graph.tissues.some(t=>t.rigidity>0));
    if(kind==="resorb")assert.ok(outcome.graph.cells.length<graph.cells.length);
  }
  const source=materialInputs(drawing(["#...#"]));
  const base=compileMaterialDevelopment(source.atlas,source.genome);
  const left=base.source.tissues[0],right=base.source.tissues[1];
  const op:MaterialOperator={id:"join",kind:"fuse",tissueId:left.id,
    targetTissueId:right.id,atHour:0,durationHours:4,strength:1};
  const program={...base,operators:[op],fingerprint:base.fingerprint+"/join"};
  const state=initializeMaterialOperatorChronology(program);
  const connected=stepMaterialOperatorChronology(base.source,program,state,
    interval(program,0,4,[1]));
  assert.equal(connected.events.length,1,JSON.stringify(connected.decisions));
  assert.equal(connected.graph.links.filter(l=>l.kind==="fusion").length,1);
  integrity(connected.graph,base.source);
});

test("no references, causal order, time bounds, or graph constraints are silently relaxed",()=>{
  const {program,op,graph,state}=rig(["##","##"]);
  assert.throws(()=>stepMaterialOperatorChronology(graph,program,state,
    interval(program,0,1,[1])),/Noncausal/);
  assert.throws(()=>stepMaterialOperatorChronology(graph,program,state,
    interval(program,0,1,[-1])),/unbounded/);
  assert.throws(()=>stepMaterialOperatorChronology(graph,program,state,
    {fromHour:0,toHour:1,expressions:[]}),/Incomplete/);
  assert.throws(()=>stepMaterialOperatorChronology(graph,program,state,
    interval(program,1,2,[0])),/Non-contiguous/);
  const unrelated:MaterialGraph={...graph,sourceFingerprint:"other"};
  assert.throws(()=>stepMaterialOperatorChronology(unrelated,program,state,
    interval(program,0,1,[0])),/identity/);
  const future:MaterialGraph={...graph,events:[{
    id:"future",kind:"translate",atHour:1.5,
    createdCellIds:[],removedCellIds:[],sourceCellIds:[],
  }]};
  assert.throws(()=>stepMaterialOperatorChronology(future,program,state,
    interval(program,0,1,[0])),/future-dated/);
});

test("unordered frame requests are equivalent to deterministic forward replay",()=>{
  const {program,op,graph,state}=rig(["##","##"]);
  const fractions=[0,0.25,0.5,0.75,1];
  const replay=()=>{
    let g=graph,s:MaterialOperatorChronologyState=state;
    const checkpoints=new Map<number,MaterialGraph>([[0,g]]);
    for(let hour=1;hour<=4;hour++) {
      const a=stepMaterialOperatorChronology(g,program,s,
        interval(program,hour-1,hour,[fractions[hour]]));
      g=a.graph;s=a.state;checkpoints.set(hour,reconstructMaterialGraph(g));
    }
    return checkpoints;
  };
  const first=replay(),second=replay();
  for(const hour of [4,1,3,0,2,4,2,1])
    assert.deepEqual(second.get(hour),first.get(hour));
  assert.deepEqual(materialDevelopmentAt(program,0).sourceCells,graph.sourceCells);
  assert.deepEqual(replay(),first);
});

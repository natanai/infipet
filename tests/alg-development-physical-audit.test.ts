import test from "node:test";
import assert from "node:assert/strict";
import {applyDailyMaterialStep,createDailyMaterialState,verifyDailyMaterialInventory,
  compileMaterialDevelopment,type MaterialGraph,type DailyCareWindowV1} from "../src/development";
import {fixtures,materialInputs} from "./alg-development-fixtures";

const HATCH=Date.UTC(2026,9,27,12),DAY=86_400_000;
const window=(k:number):DailyCareWindowV1=>({
  version:1,hatchAtMs:HATCH,checkIndex:k,startMs:HATCH+(k-1)*DAY,endMs:HATCH+k*DAY,
  forcing:{nutrition:1,rest:1,security:1,activity:1,threat:0,observedFraction:1},
  acceptedCommands:0,rejectedCommands:0,observations:1,
  activeMs:DAY,absentMs:0,unknownMs:0,unknown:[],provenanceDigest:"care/"+k,
});
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function witness(){
  const {atlas,genome}=materialInputs(fixtures.branching,"PHYSICAL-FORENSICS");
  const program=compileMaterialDevelopment(atlas,genome);
  let state=createDailyMaterialState(program,HATCH);
  for(let k=1;k<=365;k++){
    state=applyDailyMaterialStep(program,genome,state,window(k));
    if(k===1||k===180||k===364||k===365)
      verifyDailyMaterialInventory(state.graph,HATCH,k);
  }
  return {program,genome,state};
}
function altered(g:MaterialGraph):MaterialGraph{
  const forged=copy(g) as any;
  const cell=forged.cells[0];
  const x=cell.x<63?cell.x+1:cell.x-1;
  forged.cells[0]={...cell,x};
  return forged;
}

test("[AUD-001/A1] a fixed-ID position forgery with unchanged creation/removal archive is rejected",()=>{
  const {atlas,genome}=materialInputs(fixtures.blob,"COUNTEREXAMPLE");
  const program=compileMaterialDevelopment(atlas,genome);
  const birth=createDailyMaterialState(program,HATCH);
  assert.equal(birth.graph.events.length,0);
  const original=birth.graph.cells[0];
  const forged=altered(birth.graph);
  assert.equal(forged.cells.length,birth.graph.cells.length);
  assert.deepEqual(forged.cells.map(c=>c.id),birth.graph.cells.map(c=>c.id));
  assert.deepEqual(forged.events,birth.graph.events);
  assert.equal(forged.cells[0].provenance,original.provenance);
  assert.doesNotThrow(()=>verifyDailyMaterialInventory(birth.graph,HATCH,0));
  assert.throws(()=>verifyDailyMaterialInventory(forged,HATCH,0),
    /physical state|reconstruction/i);
});

test("[AUD-001/A2] full chronological graph survives 365 checks and JSON save/reopen",()=>{
  const {state}=witness();
  assert.equal(state.completedChecks,365);
  const graph=copy(state.graph);
  assert.deepEqual(graph.events,state.graph.events);
  verifyDailyMaterialInventory(graph,HATCH,365);
  assert.deepEqual(graph.cells,state.graph.cells);
  assert.ok(graph.events.some(e=>e.kind==="daily-physical"),
    "each effective daily physical operation must leave a reconciliation");
});

test("[AUD-001/A3] forged relocation, source tissue identity, unauthorized topology and unrecorded link edits fail closed",()=>{
  const {state}=witness(),g=state.graph;
  const badPosition=altered(g);
  assert.throws(()=>verifyDailyMaterialInventory(badPosition,HATCH,365),
    /physical state|reconstruction/);
  const badTissue=copy(g) as any;
  badTissue.cells[0]={...badTissue.cells[0],tissueId:"unknown/fiction"};
  assert.throws(()=>verifyDailyMaterialInventory(badTissue,HATCH,365),
    /physical state|reconstruction/);
  const badLinks=copy(g) as any;
  badLinks.links.push({id:"forged",fromTissueId:badLinks.tissues[0].id,
    toTissueId:badLinks.tissues[0].id,kind:"attachment",
    fromCellId:badLinks.cells[0].id,toCellId:badLinks.cells[0].id});
  assert.throws(()=>verifyDailyMaterialInventory(badLinks,HATCH,365),
    /physical state|reconstruction/);
  const badLedger=copy(g) as any;
  const closing=badLedger.events.find((e:any)=>e.dailyPhysical)!;
  closing.dailyPhysical!.relocations.push({
    cellId:badLedger.sourceCells[0].id,from:{x:9,y:9},to:{x:60,y:60},
    operationId:"not-an-accepted-operation",checkIndex:closing.checkIndex!,
  });
  assert.throws(()=>verifyDailyMaterialInventory(badLedger,HATCH,365),
    /relocation|ownership/);
});

test("[AUD-001/A2] an explicitly authorized coherent whole-tissue translation replays, but forged before-images fail",()=>{
  const {atlas,genome}=materialInputs(fixtures.blob,"RELOCATION-POSITIVE");
  const birth=createDailyMaterialState(compileMaterialDevelopment(atlas,genome),HATCH).graph;
  const shifted=copy(birth) as any;
  const direction=Math.max(...birth.cells.map(c=>c.x))<63?1:-1;
  const moved=birth.cells.map(c=>({...c,x:c.x+direction}));
  assert.ok(moved.every(c=>c.x>=0&&c.x<64&&!birth.protectedVoids.includes(c.x+","+c.y)));
  const op="audited/translate/1";
  const raw={id:op,kind:"translate",atHour:24,atMs:HATCH+DAY,checkIndex:1,
    sourceCellIds:birth.sourceCells.map(c=>c.id),
    createdCellIds:[],createdCells:[],removedCellIds:[]};
  const ledger={id:"daily-physical/1",kind:"daily-physical",atHour:24,
    atMs:HATCH+DAY,checkIndex:1,sourceCellIds:[],
    createdCellIds:[],createdCells:[],removedCellIds:[],
    dailyPhysical:{authorizedEvents:[op],
      relocations:birth.cells.map(c=>({
        cellId:c.id,from:{x:c.x,y:c.y},to:{x:c.x+direction,y:c.y},
        operationId:op,checkIndex:1,
      })),
      tissues:[],sites:[],links:[]}};
  shifted.cells=moved;shifted.events=[raw,ledger];
  shifted.birthStructure={tissues:birth.tissues,sites:birth.sites,links:birth.links};
  assert.doesNotThrow(()=>verifyDailyMaterialInventory(shifted,HATCH,1));
  const lied=copy(shifted) as any;
  lied.events[1].dailyPhysical.relocations[0].from.x+=1;
  assert.throws(()=>verifyDailyMaterialInventory(lied,HATCH,1),/relocation/);
});

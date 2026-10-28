import test from "node:test";
import assert from "node:assert/strict";
import {createSimulation} from "../src/simulation";
import {createGame,advanceGame} from "../src/gameplay";
import {createPreviewCareWindow,type PreviewCareInputs} from "../src/integration/daily-runtime";
import {measurePhysical,measureChange} from "../src/evaluation/morphology";
import {fixtures} from "./alg-development-fixtures";
const basic:PreviewCareInputs={kind:"synthetic-needs-lab-v1",timeline:[],nutrition:0.75};
const low:PreviewCareInputs={kind:"synthetic-needs-lab-v1",
  timeline:[
    {needId:"rest",tick:0,fulfillment:0},
    {needId:"physical-fitness",tick:0,fulfillment:0},
    {needId:"security",tick:0,fulfillment:0},
    {needId:"safety",tick:0,fulfillment:0},
  ],nutrition:0};

test("[MORPH-003/I1] synthetic Lab windows honor exact half-open 24h boundaries and never become saved history",()=>{
  const strategy:PreviewCareInputs={...basic,timeline:[
    {needId:"rest",tick:23,fulfillment:0},
    {needId:"rest",tick:24,fulfillment:1},
  ]};
  const first=createPreviewCareWindow(1,strategy);
  const second=createPreviewCareWindow(2,strategy);
  assert.equal(first.startMs,0);
  assert.equal(first.endMs,86400000);
  assert.equal(second.startMs,first.endMs);
  assert.equal(second.endMs,2*86400000);
  assert.equal(first.forcing.rest,(23*0.75+0)/24);
  assert.equal(second.forcing.rest,1,"hour 24 belongs exclusively to the next window");
  assert.equal(first.acceptedCommands,0);
  assert.equal(first.observations,0);
  assert.equal(first.unknownMs,0);
  assert.match(first.unknown[0],/SYNTHETIC/);
  assert.notEqual(first.provenanceDigest,second.provenanceDigest);
  assert.deepEqual(first,createPreviewCareWindow(1,strategy));
  assert.throws(()=>createPreviewCareWindow(366,basic),/Invalid synthetic/);
  const start=Date.UTC(2026,9,27);
  const game=advanceGame(createGame("CARE-PREVIEW-TEST","infant",start),start+86400000,"absent");
  assert.throws(()=>createSimulation(fixtures.blob,"CARE-PREVIEW-TEST","infant",{
    careGame:game,previewCare:basic,
  }),/Synthetic Needs Lab care cannot enter a real saved life/);
});
test("[MORPH-003/I2] preview and production share daily material engine; immutable replay, exact checks and renderer ownership",()=>{
  const options={previewCare:basic,reuseLivingMaterial:false};
  const sim=createSimulation(fixtures.blob,"RENDER-MORPH","infant",options);
  const birth=sim.materialStateAt(0);
  const before=sim.materialStateAt(1-1/86400);
  const day1=sim.materialStateAt(1);
  assert.deepEqual(before,birth,"no structural changes between completed checks");
  assert.equal(day1.completedChecks,1);
  assert.deepEqual(day1,createSimulation(fixtures.blob,"RENDER-MORPH","infant",options).materialStateAt(1));
  const frame=sim.frameAt(1,{time:1,action:"idle"});
  const evidence=(frame.interaction.diagnostics as {
    physicalMaterial:{renderedCellQuads:{cellId:string;quad:{x:number;y:number}[]}[];
      renderedPhysicalCells:number;missingPhysicalOwnerIds:string[]}
  }).physicalMaterial;
  const ids=day1.graph.cells.map(c=>c.id);
  const projected=evidence.renderedCellQuads.map(c=>c.cellId);
  assert.deepEqual([...projected].sort(),[...ids].sort(),
    "every authoritative physical material cell owns exactly one projected quad");
  assert.equal(evidence.renderedPhysicalCells,ids.length);
  assert.deepEqual(evidence.missingPhysicalOwnerIds,[]);
  assert.ok(evidence.renderedCellQuads.every(c=>c.quad.length===4&&
    c.quad.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
  assert.ok(frame.pixels.every(p=>p.materialCellId&&ids.includes(p.materialCellId)),
    "no painted anatomical pixels without physical cell ownership");
  const calm=createSimulation(fixtures.blob,"RENDER-MORPH","infant",{previewCare:low});
  const lowDay=calm.materialStateAt(1);
  assert.equal(lowDay.completedChecks,1);
  // Equality is a legitimate null: no fabricated morphological contrast.
  const count=measurePhysical(day1.graph).occupiedArea;
  const lowCount=measurePhysical(lowDay.graph).occupiedArea;
  console.log(JSON.stringify({kind:"MORPH-003-production-day1",count,lowCount,
    delta:measureChange(day1.graph,lowDay.graph).structuralChange,
    note:"null means no physically eligible change at this check"}));
});

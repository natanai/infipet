import test from "node:test";
import assert from "node:assert/strict";
import {
  EVALUATION_LIMITS, TRAJECTORY_GATE,
  auditPhysicalEvidence, describeShape, evaluateTrajectory,
  normalizedMask, silhouetteIoU, type InkPoint,
} from "./alg-evaluation-trajectory-metrics";
import type { MaterialCell, MaterialGraph } from "../src/development";
import { RETRO_PRESETS, cloneRetroPreset } from "../src/retro";
import { drawingPixels } from "../src/drawing";
import { createSimulation } from "../src/simulation";
import { listNativeP1HistoryRoutes } from "../src/gameplay/native-p1";

const rows=(shape:readonly string[]):InkPoint[]=>shape.flatMap((row,y)=>
  [...row].flatMap((c,x)=>c==="#"?[{x,y}]:[]));
const transformed=(cells:readonly InkPoint[],factor:number,dx:number,dy:number):InkPoint[] =>
  cells.map(p=>({x:p.x*factor+dx,y:p.y*factor+dy}));
const square=rows(["#####","#####","#####","#####","#####"]);
const ring=rows(["#####","#...#","#...#","#...#","#####"]);
const filament=rows([".......",".......",".......","#######",".......",".......","......."]);
const fork=rows(["...#...","...#...","...#...","#######",".......",".......","......."]);

function graph(sourcePoints:readonly InkPoint[],fingerprint="drawing-one",
  activePoints:readonly InkPoint[]=sourcePoints):MaterialGraph {
  const sourceCells:MaterialCell[]=sourcePoints.map((p,i)=>({
    id:"source/"+i,tissueId:"first",x:p.x,y:p.y,color:"#ffffff",
    provenance:"authored",sourceIds:["source/"+i],
    parentCellIds:[],operationId:null,
  }));
  const cells:MaterialCell[]=activePoints.map((p,i)=>({
    id:sourceCells[i]?.id??"grown/"+i,tissueId:"first",
    x:p.x,y:p.y,color:"#ffffff",
    provenance:i<sourceCells.length?"authored":"generated",
    sourceIds:[sourceCells[Math.min(i,sourceCells.length-1)]?.id??"missing"],
    parentCellIds:i<sourceCells.length?[]:[sourceCells[0]?.id??"missing"],
    operationId:i<sourceCells.length?null:"growth-event",
  }));
  return {
    version:1,sourceFingerprint:fingerprint,sourceCells,cells,
    tissues:[{id:"first",sourcePartId:"drawing",parentId:null,relationship:"root",
      sourceCellIds:sourceCells.map(c=>c.id),growthSiteIds:[],rigidity:0}],
    sites:[],links:[],events:[],protectedVoids:[],
  };
}
function input(
  atHour:number,actual:readonly InkPoint[],target:readonly InkPoint[],
  material?:MaterialGraph,
){
  return {
    actual:{id:"generated",atHour,pixels:actual,graph:material},
    ref:{id:"research-target",atHour,pixels:target,metadata:{label:"not-an-input-to-the-generator"}},
  };
}

test("[EVAL-002/A1] independent shape scores follow exact mathematical identity, translation, scale and topology counterexamples",()=>{
  assert.deepEqual(EVALUATION_LIMITS,{resolution:32,maxCells:4096,maxWidth:128,maxHeight:128,maxStages:16});
  assert.deepEqual(TRAJECTORY_GATE,{
    minStageScore:0.8,minIoU:0.65,minStructuralScore:0.78,
    minAggregateScore:0.82,minStages:2,
  });
  assert.equal(silhouetteIoU(square,square),1);
  assert.equal(silhouetteIoU(square,transformed(square,1,21,-13)),1);
  assert.equal(silhouetteIoU(square,transformed(square,2,21,-13)),1,
    "uniform integer coordinate scaling must have identical normalized samples");
  assert.deepEqual([...normalizedMask(square)].sort(),
    [...normalizedMask(transformed(square,2,21,-13))].sort());
  // Normalized horizontal/vertical endpoints have non-overlapping raster cells:
  const horizontal=[{x:0,y:0},{x:2,y:0}],vertical=[{x:0,y:0},{x:0,y:2}];
  assert.equal(silhouetteIoU(horizontal,vertical),0);
  assert.equal(describeShape(square).holes,0);
  assert.equal(describeShape(ring).holes,1);
  assert.equal(describeShape(square).components,1);
  assert.equal(describeShape([{x:0,y:0},{x:12,y:12}]).components,2);
  assert.equal(describeShape(filament).skeletonJunctions,0);
  assert.equal(describeShape(filament).skeletonEndpoints,2);
  assert.ok(describeShape(fork).skeletonJunctions>=1,
    "T filament has a skeleton fork, unlike straight filament");
  assert.ok(describeShape(fork).skeletonEndpoints>=3);
  assert.equal(describeShape(square).orientationRadians,null,
    "an isotropic square has no inventible major axis");
  assert.equal(describeShape(filament).orientationRadians,0);
  assert.equal(describeShape(rows(["#","#","#","#","#"])).orientationRadians,Math.PI/2);
  assert.throws(()=>describeShape([{x:NaN,y:0}]),/safe integers/);
  assert.throws(()=>describeShape([{x:0,y:0},{x:129,y:0}]),/bounds/);

  const withoutGraph=[
    input(0,square,square),
    input(24,square,square),
  ];
  const unsupported=evaluateTrajectory(withoutGraph.map(s=>s.actual),
    withoutGraph.map(s=>s.ref));
  assert.equal(unsupported.status,"unresolved",
    "perfect visible match with no material graph must remain unresolved");
  assert.deepEqual(unsupported.stages.map(s=>s.silhouetteIoU),[1,1]);
  assert.deepEqual(unsupported.stages.map(s=>s.status),["unresolved","unresolved"]);
  const visibleFailure=evaluateTrajectory([
    input(0,square,square).actual,input(24,square,ring).actual,
  ],[input(0,square,square).ref,input(24,square,ring).ref]);
  assert.equal(visibleFailure.status,"fail",
    "missing topology cannot obscure directly measurable negative silhouette evidence");

  const solid=input(0,square,square,graph(square));
  const hollow=input(24,square,ring,graph(square));
  const result=evaluateTrajectory([solid.actual,hollow.actual],[solid.ref,hollow.ref],"drawing-one");
  assert.equal(result.stages.length,2);
  assert.equal(result.stages[0].silhouetteIoU,1);
  assert.equal(result.stages[0].shapeScore,1);
  assert.equal(result.stages[0].status,"pass");
  assert.equal(result.stages[1].observed?.holes,0);
  assert.equal(result.stages[1].reference?.holes,1);
  assert.ok(result.stages[1].mismatches.includes("enclosed-voids"));
  assert.equal(result.stages[1].status,"fail");
  assert.equal(result.status,"fail",
    "perfect first milestone never conceals a failed second milestone");
  assert.ok((result.aggregateScore??1)<1);
  const branching=evaluateTrajectory(
    [input(0,filament,filament,graph(filament)).actual,
      input(24,filament,fork,graph(filament)).actual],
    [input(0,filament,filament).ref,input(24,filament,fork).ref],
    "drawing-one",
  );
  assert.ok(branching.stages[1].mismatches.includes("branching-endpoints"));
  assert.ok((branching.stages[1].structuralScore??1)<1);
});

test("[EVAL-002/A1] identical appearance with contradictory material origins cannot pass",()=>{
  const shape=filament;
  const intact=graph(shape,"one-origin");
  const counterfeit=graph(shape,"second-origin");
  assert.deepEqual(auditPhysicalEvidence(intact).status,"verified");
  const [s0,s1]=[input(0,shape,shape,intact),input(24,shape,shape,counterfeit)];
  const result=evaluateTrajectory([s0.actual,s1.actual],[s0.ref,s1.ref],"one-origin");
  assert.deepEqual(result.stages.map(x=>x.silhouetteIoU),[1,1]);
  assert.equal(result.stages[1].status,"fail");
  assert.equal(result.status,"fail");
  assert.ok(result.reasons.includes("material-origin-changed-over-lifetime"));
  assert.ok(result.stages[1].reasons.includes("unexpected-birth-source"));
  const substituted=graph(shape,"one-origin");
  const modified={...substituted,sourceCells:substituted.sourceCells.map((c,i)=>
    i===0?{...c,x:c.x+1}:c)};
  const invalid=evaluateTrajectory([s0.actual,{...s1.actual,graph:modified}],[s0.ref,s1.ref],"one-origin");
  assert.ok(invalid.reasons.includes("material-origin-changed-over-lifetime"),
    "matching string fingerprints cannot conceal replaced source cells");
  assert.notEqual(invalid.stages[0].physical.sourceAncestrySignature,
    invalid.stages[1].physical.sourceAncestrySignature);
  const forged={...intact,cells:intact.cells.map((c,i)=>
    i===1?{...c,sourceIds:["ghost-id"]}:c)};
  assert.equal(auditPhysicalEvidence(forged).status,"invalid");
  assert.ok(auditPhysicalEvidence(forged).errors.some(e=>e.includes("orphan-source-ancestry")));
});

test("[EVAL-002/A2] externally established retro stages report every age, metadata cannot change generated organism",()=>{
  const catalog=new Map(RETRO_PRESETS.map(p=>[p.referenceId,p]));
  const route=listNativeP1HistoryRoutes().find(r=>r.characters.includes("p1.mametchi")&&
    r.characters.slice(0,4).every(id=>catalog.has(id)));
  assert.ok(route,"must use externally catalogued history route; never invent target shapes");
  const initial=catalog.get(route.characters[0])!;
  const starting=cloneRetroPreset(initial.id);
  const birthSeed=initial.seed; // An unvalidated candidate, NOT a replay witness.
  const milestones=[0,1,49,121] as const;
  const stagePoints=[
    {id:"hatchling",atHour:0,care:1,training:0,battle:0},
    {id:"infant",atHour:1,care:1,training:0.2,battle:0},
    {id:"juvenile",atHour:49,care:1,training:0.5,battle:0},
    {id:"adult",atHour:121,care:1,training:0.5,battle:0},
  ];
  const context={hatchAtHours:0,stageEndHours:[1,49,121,193],stagePoints};
  const before=createSimulation(starting,birthSeed,"infant",{liveContext:context});
  const frames=milestones.map(h=>before.frameAt(h/24).pixels);
  const originalProgram=before.program.fingerprint,originalGenome=before.genome.fingerprint;
  const targets=route.characters.slice(0,4).map((id,index)=>({
    id,atHour:milestones[index],
    pixels:drawingPixels(catalog.get(id)!.parts),
    metadata:{sourceUrl:catalog.get(id)!.sourceUrl,stage:catalog.get(id)!.stage},
  }));
  const changedTargets=targets.map(t=>({...t,
    metadata:{name:"changed-metadata-only",sourceUrl:"not-a-physical-input"}}));
  const after=createSimulation(cloneRetroPreset(initial.id),birthSeed,"infant",{liveContext:context});
  assert.equal(after.program.fingerprint,originalProgram);
  assert.equal(after.genome.fingerprint,originalGenome);
  assert.deepEqual(milestones.map(h=>after.frameAt(h/24).pixels),frames,
    "target metadata must never affect generated pixels at any milestone");
  const actual=milestones.map((h,i)=>({id:"generated-"+i,atHour:h,pixels:frames[i]}));
  const score=evaluateTrajectory(actual,targets);
  assert.deepEqual(score.stages.map(s=>s.atHour),[...milestones]);
  assert.deepEqual(score.stages.map(s=>s.id),route.characters.slice(0,4));
  assert.ok(score.stages.every(s=>typeof s.shapeScore==="number"));
  assert.deepEqual(evaluateTrajectory(actual,changedTargets),score,
    "evaluation must ignore all target metadata");
  assert.notEqual(score.status,"pass",
    "frames without physical ancestry cannot support structural resemblance claims");
  assert.ok(score.stages.every(stage=>stage.status!=="pass"),
    "geometric failure is conclusive; otherwise ungrounded physical parity remains unresolved");
  assert.ok(score.stages.every(s=>s.physical.status==="unavailable"));
  assert.equal(score.scope,"numerical-resemblance-not-hardware-parity");
  assert.ok(score.aggregateScore!==null&&score.aggregateScore>=0&&score.aggregateScore<=1);
  const missing=evaluateTrajectory(actual.slice(0,3),targets);
  assert.notEqual(missing.status,"pass",
    "missing one milestone cannot be covered up by a strong final frame");
  assert.ok(missing.reasons.includes("milestone-coverage-mismatch"));
});

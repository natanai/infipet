import test from "node:test";
import assert from "node:assert/strict";
import {
  EVALUATION_LIMITS, TRAJECTORY_GATE,
  auditPhysicalEvidence, describeShape, evaluateTrajectory,
  normalizedMask, silhouetteIoU, auditRenderedOwnership,
  type InkPoint, type RenderedInkPoint, type RenderWitness,
} from "./alg-evaluation-trajectory-metrics";
import type { MaterialCell, MaterialGraph } from "../src/development";
import { rasterCellQuads, cellCorners } from "../src/simulation/material-raster";
import { RETRO_PRESETS, cloneRetroPreset } from "../src/retro";
import { drawingPixels } from "../src/drawing";
import { createSimulation } from "../src/simulation";
import { buildProductionTrajectoryWitness,
  isIndependentlyReplayedProductionSample } from "./alg-evaluation-production-witness";
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
/** Use the real rasterization primitive for a known physical source,
 * but audit its metadata and footprint INDEPENDENTLY of that primitive. */
function observedMaterial(graph:MaterialGraph,dx=0,dy=0){
  const quads=graph.cells.map(cell=>({
    cell:{...cell,materialCellId:cell.id,
      materialSourceIds:cell.sourceIds,
      materialParentCellIds:cell.parentCellIds,
      materialOperationId:cell.operationId},
    quad:cellCorners(cell),center:cell,
  }));
  const screen=rasterCellQuads(quads,point=>({x:point.x+dx,y:point.y+dy}));
  const renderWitness:RenderWitness={projections:graph.cells.map(cell=>({
    cellId:cell.id,quad:cellCorners(cell),
  })),camera:{scale:1,offset:{x:dx,y:dy}}};
  return {pixels:screen as readonly RenderedInkPoint[],renderWitness};
}
function input(
  atHour:number,actual:readonly InkPoint[],target:readonly InkPoint[],
  material?:MaterialGraph,
){
  const owned=material?observedMaterial(material):undefined;
  return {
    actual:{id:"generated-"+atHour,atHour,
      pixels:owned?.pixels??actual,graph:material,renderWitness:owned?.renderWitness},
    ref:{id:"research-target-"+atHour,atHour,pixels:target,metadata:{label:"not-an-input-to-the-generator"}},
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
  assert.equal(result.stages[0].status,"unresolved",
    "a caller-generated graph, even with honest-looking ink, is not independently replayed");
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

test("[EVAL-002/A1] fake chronological material creation and resurrection cannot pass",()=>{
  const born=graph([{x:6,y:5}],"seeded-source");
  const source=born.sourceCells[0];
  const generated:MaterialCell={
    ...source,id:"growth/claimed",x:7,y:5,
    provenance:"generated",sourceIds:[source.id],
    parentCellIds:[source.id],operationId:"growth-claimed",
  };
  const event=(id="growth-claimed",atHour=3,kind="elongate")=>({
    id,atHour,kind,createdCellIds:[generated.id],removedCellIds:[],
    sourceCellIds:[source.id],
  });
  const bad=(g:MaterialGraph,fragment:string)=>{
    const audit=auditPhysicalEvidence(g,5);
    assert.equal(audit.status,"invalid",JSON.stringify(audit));
    assert.ok(audit.errors.some(e=>e.includes(fragment)),JSON.stringify(audit.errors));
  };
  bad({...born,cells:[...born.cells,generated]},"generated-without-chronological-event");
  bad({...born,cells:[...born.cells,generated],events:[event("unrelated",3)]},
    "creation-operation-mismatch");
  bad({...born,cells:[...born.cells,generated],events:[event("growth-claimed",6)]},
    "event-clock-out-of-order-or-future");
  bad({...born,cells:[...born.cells,generated],events:[event("growth-claimed",3,"conjure")]},
    "unsupported-creation-operator");
  // A plausible operation ID, event, and ancestry still cannot authorize
  // matter appearing physically disconnected from its live source.
  const remote={...generated,x:31,y:31};
  bad({...born,cells:[...born.cells,remote],events:[event()]},
    "generated-nonadjacent-to-physical-parent");
  bad({...born,cells:[...born.cells,generated],events:[
    {id:"remove-before",kind:"resorb",atHour:2,createdCellIds:[],
      removedCellIds:[source.id],sourceCellIds:[source.id]},
    event(),
  ]},"parent-not-alive-at-creation");
  bad({...born,events:[{id:"remove-ghost",kind:"resorb",atHour:2,
    createdCellIds:[],removedCellIds:["never-existed"],sourceCellIds:[source.id]}]},
    "removed-nonlive-material");
  bad({...born,cells:[...born.cells,generated],events:[
    event(),{id:"remove-new",kind:"resorb",atHour:4,createdCellIds:[],
      removedCellIds:[generated.id],sourceCellIds:[source.id]},
  ]},"event-ledger-active-inventory-mismatch");
  bad({...born,cells:[...born.cells,generated],events:[
    event(),{id:"remove-new",kind:"resorb",atHour:4,createdCellIds:[],
      removedCellIds:[generated.id],sourceCellIds:[source.id]},
    {...event("repeat",5),createdCellIds:[generated.id]},
  ]},"recreated-or-resurrected-material");

  const plausible={...born,cells:[...born.cells,generated],events:[event()]};
  const reconciled=auditPhysicalEvidence(plausible,3);
  assert.equal(reconciled.status,"unavailable",
    "even a convincing event ledger cannot prove that an operation truly ran");
  assert.ok(reconciled.errors.includes("operation-execution-not-independently-replayed"));
  const actual=observedMaterial(plausible);
  assert.equal(auditRenderedOwnership(actual.pixels,plausible,actual.renderWitness).status,
    "verified","the image can be traceable despite unverified chronological execution");
  const sameImage=evaluateTrajectory([
    {id:"claimed-0",atHour:3,graph:plausible,...actual},
    {id:"claimed-1",atHour:4,graph:plausible,...actual},
  ],[{id:"reference-0",atHour:3,pixels:actual.pixels},
    {id:"reference-1",atHour:4,pixels:actual.pixels}]);
  assert.equal(sameImage.status,"unresolved",
    "a forged event can never pass on internal ledger consistency alone");
  assert.equal(auditPhysicalEvidence(plausible,2).status,"invalid",
    "future material cannot appear in an earlier chronological checkpoint");
});

test("[EVAL-002/A2] perfectly matching foreign render and valid graph cannot certify ownership",()=>{
  const a=graph([{x:8,y:8},{x:9,y:8}],"organism-A");
  const b:MaterialGraph={...graph([{x:8,y:8},{x:9,y:8}],"organism-B"),
    sourceCells:graph([{x:8,y:8},{x:9,y:8}],"organism-B").sourceCells.map(c=>
      ({...c,id:"B/"+c.id,sourceIds:["B/"+c.id]})),
  } as MaterialGraph;
  const bActive:MaterialGraph={...b,cells:b.sourceCells,
    tissues:b.tissues.map(t=>({...t,sourceCellIds:b.sourceCells.map(c=>c.id)}))};
  assert.equal(auditPhysicalEvidence(a).status,"verified");
  assert.equal(auditPhysicalEvidence(bActive).status,"verified");
  const renderedB=observedMaterial(bActive);
  const stageA={id:"A",atHour:0,pixels:renderedB.pixels,graph:a,
    renderWitness:observedMaterial(a).renderWitness};
  const stageA2={...stageA,id:"A2",atHour:24};
  const refs=[
    {id:"B0",atHour:0,pixels:renderedB.pixels},
    {id:"B24",atHour:24,pixels:renderedB.pixels},
  ];
  const fraud=evaluateTrajectory([stageA,stageA2],refs);
  assert.deepEqual(fraud.stages.map(s=>s.silhouetteIoU),[1,1]);
  assert.deepEqual(fraud.stages.map(s=>s.status),["fail","fail"]);
  assert.ok(fraud.stages.every(s=>s.rendering.errors.some(e=>
    e.includes("rendered-nonlive-material"))));
  assert.equal(fraud.status,"fail");

  // A pose and camera transform are NOT supposed to use raw cell coordinates.
  const valid=observedMaterial(a,5,7);
  assert.equal(auditRenderedOwnership(valid.pixels,a,valid.renderWitness).status,"verified");
  const validReferences=[{id:"pose-0",atHour:0,pixels:valid.pixels},
    {id:"pose-24",atHour:24,pixels:valid.pixels}];
  const genuine=evaluateTrajectory([
    {id:"real0",atHour:0,graph:a,...valid},
    {id:"real24",atHour:24,graph:a,...valid},
  ],validReferences);
  assert.equal(genuine.status,"unresolved",
    "source-only shape fixtures are not a verified production runtime witness");
  assert.deepEqual(genuine.stages.map(s=>s.status),["unresolved","unresolved"]);

  const forgedColorOnly=valid.pixels.map(p=>({
    x:p.x,y:p.y,color:"#ffffff",
  }));
  assert.equal(auditRenderedOwnership(forgedColorOnly,a,valid.renderWitness).status,
    "unavailable","cosmetic-only material must not prove physical likeness");
  const shifted=valid.pixels.map(p=>({...p,x:p.x+20}));
  assert.equal(auditRenderedOwnership(shifted,a,valid.renderWitness).status,"invalid");
});

test("[EVAL-002/A1/A2] actual unmodified production growth and projected visible pixels must match independent replay",()=>{
  const drawing=[{
    id:"real-ink",kind:"body" as const,name:"author drawing",parentId:null,
    position:{x:0,y:0},pixels:rows([".....","..###","..###","..###","....."])
      .map(p=>({...p,color:"#3a78ae"})),
  }];
  const hours=[0.5,1,2,4,8,24,48,72];
  const witness=buildProductionTrajectoryWitness(drawing,"INT-LIVE-PIXEL-2026",hours);
  assert.equal(witness.counts.stages,hours.length);
  const trulyVerified=witness.samples.filter(isIndependentlyReplayedProductionSample);
  assert.ok(trulyVerified.length>=2,
    "genuine material+visible output must have at least two replay-verifiable stages; "+witness.limitations.join("; "));
  assert.ok(witness.counts.materialPixels>0);
  assert.ok(witness.counts.graphEvents>=0);
  for(const s of trulyVerified){
    assert.equal(auditPhysicalEvidence(s.graph,s.atHour).status==="invalid",false);
    assert.equal(auditRenderedOwnership(s.pixels,s.graph,s.renderWitness).status,"verified");
    assert.ok(s.pixels.length>0,"only rendered material, never cosmetic substitute");
  }
  // Positive CONTROL target is a separate immutable copy of an actual
  // generated physical layer, not a historical sprite/parity claim.
  // Scoring it proves ability to validate genuine production ownership,
  // not that reference art influenced the material generator.
  const references=trulyVerified.map(s=>({
    id:"independent-control-"+s.atHour,atHour:s.atHour,
    pixels:s.pixels.map(p=>({x:p.x,y:p.y})),
    metadata:{researchOnly:true},
  }));
  const measured=evaluateTrajectory(trulyVerified,references,witness.sourceFingerprint);
  assert.equal(measured.status,"pass");
  assert.deepEqual(measured.stages.map(s=>s.status),
    references.map(()=>"pass"));
  assert.ok(measured.stages.every(s=>s.silhouetteIoU===1 &&
    s.shapeScore===1 && s.rendering.status==="verified" &&
    s.physical.status==="verified" && s.materialShape!==null));
  const topologyControl=references.map((r,i)=>i===0?{
    ...r,physicalRequirements:{
      components:(measured.stages[i].materialShape?.components??0)+1,
      holes:measured.stages[i].materialShape?.holes??0,
    },
  }:r);
  const physicalMismatch=evaluateTrajectory(trulyVerified,topologyControl,
    witness.sourceFingerprint);
  assert.equal(physicalMismatch.stages[0].silhouetteIoU,1);
  assert.equal(physicalMismatch.stages[0].status,"fail");
  assert.ok(physicalMismatch.stages[0].mismatches.includes("physical-components"),
    "perfectly matching image cannot excuse independently contradicted material connectivity");
  assert.equal(physicalMismatch.status,"fail");
  // Decoupled reference target: rewrite target *metadata* or shape and keep
  // replayed material untouched. A foreign perfect image cannot be promoted.
  const invalidPixels=trulyVerified[0].pixels.map(p=>({...p,materialCellId:"different-pet"}));
  const adversarial={...trulyVerified[0],pixels:invalidPixels};
  const fraud=evaluateTrajectory([adversarial,...trulyVerified.slice(1)],references);
  assert.notEqual(fraud.status,"pass");
  assert.equal(fraud.stages[0].status,"fail");
  assert.ok(fraud.stages[0].rendering.errors.some(e=>
    e.includes("rendered-nonlive-material")));
  const unauthorized={...trulyVerified[0]};
  assert.equal(isIndependentlyReplayedProductionSample(unauthorized),false,
    "replay authority cannot be copied by object cloning");
  const changedFuture=trulyVerified.map(s=>({...s,
    graph:s.graph?{...s.graph,events:[...s.graph.events,
      {id:"retroactive",kind:"elongate",atHour:0,createdCellIds:[],
        removedCellIds:[],sourceCellIds:[]}]}:undefined,
  }));
  assert.equal(evaluateTrajectory(changedFuture,references).status,"fail",
    "an earlier event added after observation may not rewrite past anatomy");
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

  // Real history-independent production generator, same authored birth ink
  // and fixed seed. Historical targets enter ONLY here, after all stages are
  // physically generated and independently replayed. This is not a ROM-care
  // replay witness and is never asserted to be historical-device parity.
  const physicalRun=buildProductionTrajectoryWitness(starting,birthSeed,milestones,
    {renderScope:"composited-screen"});
  const scored=evaluateTrajectory(physicalRun.samples,targets,
    physicalRun.sourceFingerprint);
  assert.deepEqual(scored.stages.map(s=>s.atHour),[...milestones]);
  assert.equal(scored.scope,"numerical-resemblance-not-hardware-parity");
  assert.ok(scored.stages.every(s=>s.shapeScore!==null &&
    s.silhouetteIoU!==null && s.structuralScore!==null));
  assert.ok(scored.stages.every(s=>s.status==="fail"||
    s.status==="unresolved"||s.rendering.status==="verified"));
  assert.ok(scored.stages.every(s=>s.status!=="pass"||
    isIndependentlyReplayedProductionSample(
      physicalRun.samples.find(sample=>sample.atHour===s.atHour)!)));
  const report={
    referenceRoute:route.characters.slice(0,4),
    generatedProgramFingerprint:physicalRun.programFingerprint,
    generatedGenomeFingerprint:physicalRun.genomeFingerprint,
    verifiedStages:physicalRun.counts.genuinelyVerifiedStages,
    materialPixels:physicalRun.counts.materialPixels,
    generatedCellsAcrossAges:physicalRun.counts.generatedCells,
    eventsAcrossAges:physicalRun.counts.graphEvents,
    stages:scored.stages.map(s=>({
      atHour:s.atHour,status:s.status,scope:s.renderScope,
      silhouetteIoU:s.silhouetteIoU,score:s.shapeScore,
      structuralScore:s.structuralScore,
      mismatches:s.mismatches,reasons:s.reasons,
      physical:s.physical.status,rendered:s.rendering.status,
    })),
    aggregate:scored.aggregateScore,
    weakest:scored.weakestStageScore,status:scored.status,
    limitations:physicalRun.limitations,
  };
  console.info("EVAL-002 authentic independent research trajectory:",JSON.stringify(report));
});

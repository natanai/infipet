import test from "node:test";
import assert from "node:assert/strict";
import {
  createPhylogenyView, describeLifetimeDevelopmentalTrajectory,
  type SpeculativeBranchInput,
} from "../src/phylogeny";
import {
  compileMaterialDevelopment, materialSourceAncestry,
  SPECULATIVE_OPERATOR_MAP, SPECULATIVE_LIMITS,
  compileSpeculativeMaterialComposition, speculativePhysicalOutcomes,
  type SpeculativeMaterialComposition,
  type MaterialDevelopmentProgram,
} from "../src/development";
import { createUnifiedMaterialTimeline } from "../src/integration/unified-runtime";
import { createSimulation } from "../src/simulation";
import { drawing, fixtures, materialInputs } from "./alg-development-fixtures";

const branches: readonly SpeculativeBranchInput[] = [
  {
    id:"fiction:invented-filaments", parentId:"ott691846",
    name:"Speculative long-form tissues",
    rationale:"Hypothetical composable tissue outgrowth on arbitrary ink",
    operatorHints:["tip-extension","branch-axis","surface-expansion"],
  },
  {
    id:"fiction:invented-layered", parentId:"fiction:invented-filaments",
    name:"Speculative reorganizing material",
    rationale:"Demonstrates non-species-specific transformations",
    operatorHints:["wall-deposition","tissue-remodeling","appendage-extension"],
  },
];
const view = createPhylogenyView(branches);
const birthReference = "ott691846";
const waypoints = (second = false) =>
  describeLifetimeDevelopmentalTrajectory(view,birthReference,[
    {atHour:2,anatomicalReferenceId:"fiction:invented-filaments",
      influence:"combined"},
    ...(second?[{
      atHour:85,anatomicalReferenceId:"fiction:invented-layered" as const,
      influence:"environment" as const,
    }]:[]),
  ]);
function compose(rows:readonly string[],seed:string,
  trajectory=waypoints(),
  original=true) {
  const {atlas,genome}=materialInputs(drawing(rows),seed);
  const birth=compileMaterialDevelopment(atlas,genome);
  const base:MaterialDevelopmentProgram=original?birth:
    {...birth,operators:[],fingerprint:birth.fingerprint+"/isolated"};
  const composite=compileSpeculativeMaterialComposition(base,genome,view,trajectory);
  return {base,genome,composite,
    timeline:createUnifiedMaterialTimeline({program:composite.program,genome}),
    plain:createUnifiedMaterialTimeline({program:base,genome})};
}
const actualEvents=(c:SpeculativeMaterialComposition,
  graph:ReturnType<ReturnType<typeof createUnifiedMaterialTimeline>["at"]>["graph"])=>
  graph.events.filter(e=>c.bindings.some(b=>
    e.id.startsWith("operator/"+encodeURIComponent(b.operatorId)+"/unit/")));
const structuralChange=(g:ReturnType<typeof actualEvents>)=>
  g.some(e=>e.createdCellIds.length>0 || e.removedCellIds.length>0 ||
    e.kind==="remodel");

test("[DEV-005/A1] generic vocabulary maps to real existing material operators only",()=>{
  assert.deepEqual(SPECULATIVE_OPERATOR_MAP,{
    "tip-extension":["elongate"],
    "branch-axis":["branch"],
    "surface-expansion":["expand"],
    "tissue-remodeling":["remodel","resorb","fuse"],
    "appendage-extension":["bud"],
    "wall-deposition":["reinforce"],
  });
  assert.equal(SPECULATIVE_LIMITS.maximumPhysicalOperators,64);
  const {base,composite,genome}=compose([
    "..#####..",".#######.","..#####..","...###..."],"GENERIC-OPERATORS");
  assert.deepEqual(composite.program.source,base.source);
  assert.deepEqual(composite.program.signals,base.signals);
  assert.deepEqual(composite.program.operators.slice(0,base.operators.length),
    base.operators);
  assert.equal(composite.program.genomeFingerprint,genome.genotype.fingerprint);
  assert.ok(composite.bindings.length>=3);
  assert.ok(composite.bindings.some(b=>b.operatorHint.provenance==="fictional"));
  assert.ok(composite.bindings.every(b=>
    ["elongate","branch","bud","expand","reinforce","remodel","resorb","fuse"]
      .includes(b.materialKind)));
  assert.ok(composite.bindings.every(b=>b.geneticChannel>=0&&
    b.geneticChannel<=1 && b.durationHours===24));
  assert.ok(composite.program.operators.length<=64);
  assert.ok(composite.bindings.every(b=>
    base.source.tissues.some(t=>t.id===b.tissueId) &&
    base.source.sites.some(s=>s.id===b.siteId && s.tissueId===b.tissueId)));
});

test("[DEV-005/A1] multiple inspirations yield real source-connected material and auditable physical events",()=>{
  let witness:ReturnType<typeof compose>|null=null;
  let successful:ReturnType<typeof actualEvents>=[];
  let atHour=0;
  for(let i=0;i<20;i++){
    const candidate=compose(["..#####..","..#####..","...###..."],
      "COMPOSABLE-STRUCTURE-"+i,waypoints(),false);
    const graph=candidate.timeline.at(42).graph;
    const events=actualEvents(candidate.composite,graph);
    if(events.filter(e=>e.createdCellIds.length).length>=2){
      witness=candidate;successful=events;atHour=42;break;
    }
  }
  assert.ok(witness,"seeded source geometry must admit two physical composition steps");
  const graph=witness!.timeline.at(atHour).graph;
  const birth=witness!.base.source;
  const created=successful.flatMap(e=>e.createdCellIds);
  assert.ok(created.length>=2);
  assert.equal(graph.sourceFingerprint,birth.sourceFingerprint);
  assert.deepEqual(graph.sourceCells,birth.sourceCells);
  const removed=new Set(graph.events.flatMap(e=>e.removedCellIds));
  assert.ok(created.every(id=>graph.cells.some(c=>c.id===id) || removed.has(id)),
    "created cells survive actively or have recorded subsequent resorption");
  assert.equal(graph.cells.length,
    birth.cells.length +
    graph.events.reduce((n,e)=>n+e.createdCellIds.length-e.removedCellIds.length,0),
    "one shared material creation/removal conservation ledger");
  const sources=new Set(birth.sourceCells.map(c=>c.id));
  for(const id of created.filter(id=>!removed.has(id))){
    const cell=graph.cells.find(c=>c.id===id)!;
    assert.equal(cell.provenance,"generated");
    assert.ok(cell.operationId);
    assert.ok(cell.parentCellIds.length>0);
    assert.ok(cell.sourceIds.length>0);
    assert.ok(cell.sourceIds.every(s=>sources.has(s)));
    assert.ok(materialSourceAncestry(graph,id).length>0);
    assert.ok(graph.events.some(e=>e.id===cell.operationId &&
      e.createdCellIds.includes(id)));
  }
  for(const link of graph.links){
    assert.ok(graph.cells.some(c=>c.id===link.fromCellId));
    assert.ok(graph.cells.some(c=>c.id===link.toCellId));
  }
  assert.ok(graph.cells.length-birth.sourceCells.length<=3072);
  assert.ok(graph.cells.every(c=>Number.isInteger(c.x)&&Number.isInteger(c.y)&&
    c.x>=0&&c.x<64&&c.y>=0&&c.y<64));
  assert.ok(graph.cells.every(c=>
    !birth.protectedVoids.includes(c.x+","+c.y)));
  const results=speculativePhysicalOutcomes(witness!.composite,graph,
    witness!.timeline.at(atHour).material.decisions);
  assert.ok(results.some(o=>o.events.some(e=>e.createdCellIds.length>0)));
  assert.ok(results.flatMap(o=>o.events).every(e=>
    e.sourceCellIds.every(s=>sources.has(s))));
  console.log("DEV-005 structural witness "+JSON.stringify({
    seed:witness!.genome.seed,atHour,birthActive:birth.cells.length,
    afterActive:graph.cells.length,speculativeEvents:successful.length,
    speculativeCreated:created.length,
    speculativeRemoved:successful.reduce((n,e)=>n+e.removedCellIds.length,0),
    physicallyActiveSpeculative:created.filter(id=>
      graph.cells.some(c=>c.id===id)).length,
  }));
});

test("[DEV-005/A1] fiction changes physical material versus identical ordinary program",()=>{
  let found=false;
  for(let i=0;i<18;i++){
    const c=compose(["....###....","...#####...","....###...."],
      "PHYSICAL-DELTA-"+i);
    const altered=c.timeline.at(45).graph,baseline=c.plain.at(45).graph;
    const events=actualEvents(c.composite,altered);
    if(!structuralChange(events))continue;
    assert.ok(events.some(e=>e.createdCellIds.length>0 ||
      e.removedCellIds.length>0 || e.kind==="remodel"));
    const added=altered.cells.filter(c=>
      !baseline.cells.some(p=>p.id===c.id));
    assert.ok(added.length>0 ||
      events.some(e=>e.removedCellIds.length||e.kind==="remodel"),
      "difference must be physical, not simply a metadata tag");
    assert.ok(c.composite.bindings.some(b=>
      b.operatorHint.provenance==="fictional" &&
      events.some(e=>e.id.startsWith("operator/"+
        encodeURIComponent(b.operatorId)+"/unit/"))));
    assert.deepEqual(altered.sourceCells,baseline.sourceCells);
    found=true;break;
  }
  assert.ok(found,"fictional influences must produce a real material counterfactual");
});

test("[DEV-005/A1] chronological prefix unaffected by later speculative waypoint, replay and age-seeking",()=>{
  const rows=["..#####..","..#####..","...###..."],seed="FIXED-PATH-001";
  const earlier=compose(rows,seed,waypoints(),false);
  const later=compose(rows,seed,waypoints(true),false);
  for(const age of [0,1,2,5,10,28,45,70,84]){
    const a=earlier.timeline.at(age);
    const b=later.timeline.at(age);
    assert.deepEqual(a.graph,b.graph,"later inspiration cannot rewrite age "+age);
    assert.deepEqual(a.graph,earlier.timeline.replay(age).graph);
    assert.deepEqual(b.graph,later.timeline.replay(age).graph);
  }
  const oldBindings=earlier.composite.bindings;
  assert.deepEqual(later.composite.bindings.slice(0,oldBindings.length),
    oldBindings);
  const ages=[60,3,45,20,5,45,0,27,12,40,80,30];
  const signatures=ages.map(age=>earlier.timeline.at(age).graph);
  for(let i=ages.length-1;i>=0;i--)
    assert.deepEqual(earlier.timeline.at(ages[i]).graph,signatures[i]);
  assert.deepEqual(earlier.timeline.at(45),earlier.timeline.replay(45));
});

test("[DEV-005/A1] saved deterministic composition and scientific ancestry provenance do not mutate",()=>{
  const a=compose(["#...##","##...#",".###.."],"CLEAN-FICTION-SEED");
  const b=compose(["#...##","##...#",".###.."],"CLEAN-FICTION-SEED");
  assert.deepEqual(a.composite,b.composite);
  for(const age of [0,3,18,40,60])
    assert.deepEqual(a.timeline.replay(age),b.timeline.replay(age));
  assert.deepEqual(a.composite.trajectory.fixedBirthReferenceLineage,
    view.ancestry(birthReference).map(n=>n.id));
  assert.ok(!a.composite.trajectory.fixedBirthReferenceLineage
    .some(id=>id.startsWith("fiction:")));
  assert.ok(a.composite.bindings.some(b=>
    b.inspirationProvenance.kind==="fictional" &&
    b.operatorHint.provenance==="fictional"));
  for(const binding of a.composite.bindings){
    assert.equal(binding.hintProvenance.kind,binding.operatorHint.provenance);
    assert.deepEqual(binding.inspirationProvenance,
      view.getProvenance(binding.referenceId));
  }
  const poisoned=JSON.parse(JSON.stringify(waypoints()));
  poisoned.waypoints[0].inspiration.provenance.kind="scientific";
  assert.throws(()=>
    compileSpeculativeMaterialComposition(a.base,a.genome,view,poisoned),
    /provenance|altered/i);
});

test("[DEV-005/A2] sparse, dense, disconnected, asymmetric, invented and empty ink never require a named creature",()=>{
  const shapes=[
    drawing(["#"]),
    drawing(["########","########","########","########"]),
    fixtures.disconnected,
    fixtures.fantasy,
    drawing(["...#......",".###....#.","......###.","...#......"]),
    fixtures.empty,
  ];
  for(const [i,shape] of shapes.entries()){
    const {atlas,genome}=materialInputs(shape,"UNFAMILIAR-"+i);
    const base=compileMaterialDevelopment(atlas,genome);
    const composed=compileSpeculativeMaterialComposition(
      base,genome,view,waypoints());
    const graph=createUnifiedMaterialTimeline({
      program:composed.program,genome,
    }).at(20).graph;
    assert.deepEqual(graph.sourceCells,base.source.sourceCells);
    assert.equal(graph.sourceFingerprint,base.source.sourceFingerprint);
    assert.ok(graph.cells.every(c=>c.sourceIds.length &&
      c.sourceIds.every(id=>base.source.sourceCells.some(s=>s.id===id))));
    assert.ok(graph.cells.length-base.source.sourceCells.length<=3072);
    assert.ok(graph.cells.every(c=>!graph.protectedVoids.includes(
      c.x+","+c.y)));
    assert.equal(genome.genotype.fingerprint,composed.program.genomeFingerprint);
    if(!base.source.sourceCells.length) {
      assert.equal(graph.cells.length,0);
      assert.equal(composed.bindings.length,0);
      assert.ok(composed.suppressed.some(s=>s.reason==="no-source-material"));
    }
  }
});

test("[DEV-005/A2] unknown reference, nonexistent source and operation budget fail closed",()=>{
  const {base,genome}=compose(["###"],"FANTASY-GUARD");
  const forged=JSON.parse(JSON.stringify(waypoints()));
  forged.waypoints[0].inspiration.referenceId="fiction:not-represented";
  assert.throws(()=>compileSpeculativeMaterialComposition(
    base,genome,view,forged),/Unrepresented|altered/);
  const empty=compose([],"NO-CELL");
  assert.equal(empty.composite.bindings.length,0);
  assert.ok(empty.composite.suppressed.length>0);
  assert.ok(empty.timeline.at(45).graph.cells.length===0);
  const slots=Array.from({length:64},(_,i)=>({
    id:"preexisting/"+i,kind:"reinforce" as const,
    tissueId:base.source.tissues[0].id,atHour:150+i,
    durationHours:10,strength:1,
  }));
  const filled:MaterialDevelopmentProgram={...base,operators:slots,
    fingerprint:base.fingerprint+"/full"};
  const limit=compileSpeculativeMaterialComposition(filled,genome,view,waypoints());
  assert.equal(limit.program.operators.length,64);
  assert.equal(limit.bindings.length,0);
  assert.ok(limit.suppressed.every(s=>s.reason==="material-operator-budget"));
});

test("[DEV-005/A2] physical suppression blocks forbidden negative space and records the actual reason",()=>{
  // An existing authored cavity. Restrict a genuine inherited source site to a
  // known inward candidate and retain ORIGINAL source pixel identities.
  const {atlas,genome}=materialInputs(fixtures.cavity,"VOID-PHYSICAL-GUARD");
  const source=compileMaterialDevelopment(atlas,genome);
  assert.ok(source.source.protectedVoids.length>0);
  // Suppress all existing operations so they cannot claim the test site first.
  const forbidden=source.source.protectedVoids[0];
  const [vx,vy]=forbidden.split(",").map(Number);
  const near=source.source.cells.find(c=>
    Math.abs(c.x-vx)+Math.abs(c.y-vy)===1);
  assert.ok(near);
  const customSite={id:"source/cavity-inward",tissueId:near!.tissueId,
    rootCellId:near!.id,direction:{x:vx-near!.x,y:vy-near!.y}};
  const birth={...source.source,sites:[customSite],
    tissues:source.source.tissues.map(t=>t.id===near!.tissueId?
      {...t,growthSiteIds:[customSite.id]}:t)};
  const base:MaterialDevelopmentProgram={
    ...source,source:birth,operators:[],fingerprint:source.fingerprint+"/void",
  };
  const spec=compileSpeculativeMaterialComposition(base,genome,view,waypoints());
  // Some speculative hints are prevented; none can occupy any void.
  const state=createUnifiedMaterialTimeline({program:spec.program,genome}).at(40);
  assert.ok(state.graph.cells.every(c=>!birth.protectedVoids.includes(c.x+","+c.y)));
  const ledger=state.material.decisions.filter(d=>
    spec.bindings.some(b=>b.operatorId===d.operatorId));
  assert.ok(ledger.some(d=>d.status==="suppressed" || d.status==="deferred"),
    "a full cavity cannot always be filled by generic material operators");
  assert.ok(ledger.every(d=>d.reason===null || typeof d.reason==="string"));
  console.log("DEV-005 cavity counterexample "+JSON.stringify({
    protectedVoids:birth.protectedVoids.length,
    prevented:ledger.filter(d=>d.status==="suppressed" ||
      d.status==="deferred").length,
    reasons:[...new Set(ledger.map(d=>d.reason).filter(Boolean))],
    occupiedProtectedVoids:state.graph.cells.filter(c=>
      birth.protectedVoids.includes(c.x+","+c.y)).length,
  }));
  assert.deepEqual(state.graph.sourceCells,birth.sourceCells);
});

test("[DEV-005/A1] ordinary material renderer owns a speculative generated pixel",()=>{
  let found=false;
  const shape=drawing(["....######....","...########...","....######...."]);
  for(let i=0;i<10 && !found;i++){
    const seed="VISIBLE-FICTION-"+i;
    let compiled:SpeculativeMaterialComposition|null=null;
    const simulation=createSimulation(shape,seed,"infant",{
      verifyMaterialProgram(base,genome){
        // Preserve original renderer and care path; only adapt the real program.
        compiled=compileSpeculativeMaterialComposition(base,genome,view,
          waypoints());
        return {program:compiled.program};
      },
    });
    assert.ok(compiled);
    const frame=simulation.frameAt(36,{time:0,action:"idle"});
    const annotated=frame.parts.flatMap(part=>part.pixels)
      .filter(p=>typeof p.materialCellId==="string");
    const own=annotated.filter(p=>
      compiled!.bindings.some(binding=>
        p.materialOperationId?.startsWith("operator/"+
          encodeURIComponent(binding.operatorId)+"/unit/")));
    if(own.length){
      assert.ok(own.every(p=>p.materialSourceIds?.length &&
        p.materialParentCellIds?.length &&
        p.materialSourceIds.every(src=>
          compiled!.program.source.sourceCells.some(c=>c.id===src))));
      assert.ok(own.every(p=>typeof p.materialCellId==="string" &&
        Number.isInteger(p.x)&&Number.isInteger(p.y)));
      assert.deepEqual(simulation.frameAt(36,{time:0,action:"idle"}),frame);
      found=true;
    }
  }
  assert.ok(found,"a fiction-sourced physical cell must survive ordinary raster ownership");
});

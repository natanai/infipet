import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {morphologyCohort} from "../scripts/morphology-cohort";
import {morphologyMetrics,morphologyDelta} from "../scripts/morphology-metrics";
import {createSimulation} from "../src/simulation";

const root=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const cohort=morphologyCohort();
const inventory=JSON.parse(root("docs/morphology/capability-inventory.json"));
const plan=JSON.parse(root("roadmap/plan.json"));

test("[MORPH-001/A1] historical mechanisms distinguish dormant visuals, physical operators, and missing integration",()=>{
  assert.equal(inventory.schema,"infipet-historical-morphology-inventory-v1");
  assert.ok(inventory.capabilities.length>=15);
  for(const mechanism of inventory.capabilities){
    for(const key of ["sourcePath","purpose","equations","inputs","observableConsequences",
      "originalPhysicalAccountability","currentClassification","currentRendererExpression",
      "legitimatePhysicalAdaptation","permanentConcept"])
      assert.ok(typeof mechanism[key]==="string"&&mechanism[key].length>0,
        mechanism.id+" missing "+key);
    assert.ok(existsSync(new URL("../"+mechanism.sourcePath,import.meta.url)),
      mechanism.id+" missing source");
  }
  assert.ok(inventory.capabilities.some((x:{currentClassification:string})=>
    x.currentClassification==="dormant"));
  assert.ok(inventory.capabilities.some((x:{currentClassification:string})=>
    x.currentClassification==="weakened"));
  const old=inventory.capabilities.find((x:{id:string})=>x.id==="legacy-renderer");
  assert.equal(old.currentClassification,"lost-renderer-path");
  // Independent source-path boundary witness: the production renderer uses
  // active graph cell quadrilaterals; the old region compositor is no longer
  // its anatomical authority. This is NOT a visual outcome assertion.
  const live=root("src/simulation/growth.ts");
  assert.match(live,/const graph=physical\.graph/);
  assert.match(live,/rasterCellQuads\(material\)/);
  assert.match(live,/graph\.cells/);
  const daily=root("src/development/daily-step.ts");
  assert.match(daily,/stepIterativeChronology/);
  assert.match(daily,/stepMaterialOperatorChronology/);
});

test("[MORPH-001/A2] independent 30-source mathematical baseline covers all ten morphology families",()=>{
  assert.equal(cohort.length,30);
  assert.equal(new Set(cohort.map(c=>c.id)).size,30);
  const families=new Set(cohort.map(c=>c.family));
  for(const name of ["sparse","dense","hollow","asymmetric","articulated","compact",
    "elongated","plant-like","animal-like","abstract"])
    assert.ok(families.has(name));
  const sigs=new Set<string>(),measurements=new Map<string,ReturnType<typeof morphologyMetrics>[]>();
  for(const item of cohort){
    const p=item.source[0].pixels;
    assert.ok(p.length>0);
    const m=morphologyMetrics(p);
    assert.ok(m.occupiedArea<=1024 && m.components<=m.occupiedArea);
    assert.ok(m.compactness>=0 && m.cavities>=0);
    sigs.add(p.map(c=>c.x+","+c.y).sort().join("|"));
    const bucket=measurements.get(item.family)??[];
    bucket.push(m);measurements.set(item.family,bucket);
  }
  assert.equal(sigs.size,30,"the 30 source inputs must be geometrically independent");
  assert.ok(measurements.get("sparse")!.every(m=>m.occupiedArea<=5));
  assert.ok(measurements.get("dense")!.every(m=>m.occupiedArea>=100));
  assert.ok(measurements.get("hollow")!.every(m=>m.cavities===1));
  assert.ok(measurements.get("elongated")!.every(m=>m.aspectRatio<0.5));
  assert.ok(measurements.get("plant-like")!.every(m=>m.thinFraction>0.7));
  assert.ok(measurements.get("animal-like")!.every(m=>m.occupiedArea>30));
  assert.ok(measurements.get("compact")!.every(m=>m.localThickness.median>1));
});

test("[MORPH-001/A3] reference oracles falsify visual-only matter, topology, and unrooted physical cells",()=>{
  const square=[{x:1,y:1},{x:2,y:1},{x:1,y:2},{x:2,y:2}];
  const s=morphologyMetrics(square);
  assert.equal(s.occupiedArea,4);
  assert.equal(s.perimeter,8);
  assert.equal(s.components,1);
  assert.equal(s.cavities,0);
  assert.equal(s.compactness,Math.PI/4);
  const ring=[] as {x:number;y:number}[];
  for(let y=1;y<=3;y++)for(let x=1;x<=3;x++)
    if(x!==2||y!==2)ring.push({x,y});
  const r=morphologyMetrics(ring);
  assert.equal(r.occupiedArea,8);
  assert.equal(r.perimeter,16);
  assert.equal(r.cavities,1);
  assert.equal(morphologyMetrics([{x:0,y:0},{x:1,y:0},{x:2,y:0}]).branchLengthProxy,2);
  const diagonal=morphologyMetrics([{x:0,y:0},{x:1,y:1}]);
  assert.equal(diagonal.components,2);
  assert.equal(morphologyDelta(square,square).pixelJaccard,1);
  assert.equal(morphologyDelta(square,square.map(p=>({x:p.x+3,y:p.y}))).centerDisplacement,3);
  const birth={cells:[{id:"original",x:1,y:1,tissueId:"a",provenance:"authored",sourceIds:["original"]}],
    sourceCells:[{id:"original",x:1,y:1}],tissues:[{id:"a"}],links:[],
    events:[]};
  const withPhantom={...birth,cells:[...birth.cells,
    {id:"phantom",x:2,y:1,tissueId:"a",provenance:"generated",sourceIds:[]}]};
  assert.equal(morphologyMetrics(square).physical,null);
  assert.equal(morphologyMetrics(square,withPhantom).physical?.unrootedCells,1);
  assert.equal(morphologyMetrics(square,birth).physical?.unrootedCells,0);
  assert.equal(morphologyDelta(square,square,birth,withPhantom).physical?.generated,1);
});

test("[MORPH-001/A4] canonical numeric expressiveness contract has independent non-tendril and 365-check gates",()=>{
  const contract=plan.morphologicalExpressiveness;
  assert.equal(contract.version,"morphological-expressiveness-v1");
  assert.match(contract.principle,/No implementation may preserve physical correctness by reducing development to predominantly linear extensions/);
  assert.equal(contract.temporal.checks,365);
  assert.equal(contract.cohort.minimumIndependentDrawings,30);
  assert.ok(contract.measurements.includes("whole-body-proportion-change"));
  assert.ok(contract.measurements.includes("physical-source-relocation"));
  assert.ok(contract.measurements.includes("branch-prominence"));
  assert.ok(contract.measurements.includes("topology-change"));
  // A recovered capability may become in_progress without claiming full scientific qualification.
  for (const taskId of ["MORPH-002","MORPH-003"]) {
    const status=plan.tasks.find((t:{id:string})=>t.id===taskId)?.status;
    assert.ok(status==="todo"||status==="in_progress",
      taskId+" must remain unqualified until its production cohort passes");
  }
  assert.equal(plan.tasks.find((t:{id:string})=>t.id==="MORPH-004")?.status,"todo");
  for(const revision of Object.values(inventory.revisions) as string[])
    assert.match(root("scripts/morphology-compare.mjs"),new RegExp(revision));
  assert.match(root("scripts/morphology-replay.ts"),/normalizedProgress/);
  assert.match(root("AGENTS.md"),/Permanent Morphological Expressiveness Principle/);
});

test("[MORPH-001/A5] current live physical output is numeric and material-backed, not legacy visual truth",()=>{
  for(const item of [cohort[0],cohort[8],cohort[12]]){
    for(const seed of ["MORPH-A","MORPH-B"]){
      const sim=createSimulation(item.source,seed+"|"+item.id,"infant");
      const before=sim.frameAt(0,{action:"idle",time:0});
      const first=sim.frameAt(1,{action:"idle",time:0});
      const zero=sim.materialStateAt(0).graph;
      const after=sim.materialStateAt(1).graph;
      const birth=morphologyMetrics(before.pixels,zero);
      const current=morphologyMetrics(first.pixels,after,zero);
      const diff=morphologyDelta(before.pixels,first.pixels,zero,after);
      assert.ok(Number.isFinite(current.perimeter));
      assert.ok(Number.isFinite(current.branchLengthProxy));
      assert.ok(Number.isFinite(current.physical?.tissueConcentration));
      assert.ok(Number.isFinite(diff.regionFractionL1));
      assert.equal(birth.physical?.generated,0);
      assert.ok(current.physical!.unrootedCells===0);
      assert.ok(current.physical!.cells>=0);
      assert.ok(diff.occupiedAreaChange<=4096);
      // The output is observed, not required to be non-null at every check.
      assert.equal(first.age,1);
    }
  }
});

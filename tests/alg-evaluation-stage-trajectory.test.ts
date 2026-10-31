/**
 * Opt-in, independent whole-life STAGE qualification. This deliberately does
 * not fit to screenshots, starter sprite identities, or a final adult mask.
 * It examines consecutive physical snapshots of the ONE living pet.
 *
 * Opt in: MORPH_STAGE_COHORT=1 pnpm exec tsx --test tests/alg-evaluation-stage-trajectory.test.ts
 * Default skips so routine UI, build and gameplay tests stay fast.
 * This is a qualification GATE, not a passed claim about the current branch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {STARTER_PRESETS} from "../src/presets";
import {morphologySources} from "../src/evaluation/morphology-cohort";
import {createSimulation} from "../src/simulation";
import type {MaterialGraph} from "../src/development/material-graph";
import type {PreviewCareInputs} from "../src/integration/daily-runtime";

const checkpoints=[0,40,100,175,250,330,365] as const;
const lifeCare:readonly PreviewCareInputs[]=[
 {kind:"synthetic-needs-lab-v1",nutrition:0.92,timeline:[]},
 {kind:"synthetic-needs-lab-v1",nutrition:0.28,timeline:[
  {needId:"rest",tick:0,fulfillment:0.25},
  {needId:"security",tick:0,fulfillment:0.3},
  {needId:"physical-fitness",tick:0,fulfillment:0.2},
 ]},
];
const key=(c:Readonly<{x:number;y:number}>)=>c.x+","+c.y;
function pairFraction(a:MaterialGraph,b:MaterialGraph):number{
 // Physically persistent cell identities, not drawable coordinates. Use an
 // independent stratified sample (every ceil(N/48) IDs in sorted order).
 const old=new Map(a.cells.map(c=>[c.id,c]));
 const now=new Map(b.cells.map(c=>[c.id,c]));
 const shared=[...old.keys()].filter(id=>now.has(id)).sort();
 const stride=Math.max(1,Math.ceil(shared.length/48));
 const sample=shared.filter((_,i)=>i%stride===0).slice(0,48);
 let changed=0,total=0;
 for(let i=0;i<sample.length;i++)for(let j=0;j<i;j++){
  const x=old.get(sample[i])!,y=old.get(sample[j])!;
  const u=now.get(sample[i])!,v=now.get(sample[j])!;
  const before=Math.hypot(x.x-y.x,x.y-y.y);
  const after=Math.hypot(u.x-v.x,u.y-v.y);
  if(Math.abs(after-before)>=0.75)changed++;
  total++;
 }
 return total?changed/total:0;
}
function physicalContrast(a:MaterialGraph,b:MaterialGraph){
 const x=new Set(a.cells.map(key)),y=new Set(b.cells.map(key));
 const intersection=[...x].filter(v=>y.has(v)).length;
 const union=x.size+y.size-intersection;
 const silhouette=union?1-intersection/union:0;
 const before=new Map(a.cells.map(c=>[c.id,c]));
 const shared=b.cells.filter(c=>before.has(c.id));
 const relocated=shared.filter(c=>{
  const p=before.get(c.id)!;return p.x!==c.x||p.y!==c.y;
 }).length/Math.max(1,shared.length);
 const topology=a.links.length!==b.links.length||
  a.tissues.length!==b.tissues.length||
  a.tissues.some(t=>b.tissues.find(v=>v.id===t.id)?.functionalKind!==t.functionalKind);
 const previousTissues=new Map(a.tissues.map(t=>[t.id,t]));
 const previousLinks=new Map(a.links.map(l=>[l.id,l]));
 const reparented=b.tissues.some(t=>{
  const prior=previousTissues.get(t.id);
  return !!prior&&t.parentId!==prior.parentId;
 })||b.links.some(l=>{
  const prior=previousLinks.get(l.id);
  return !!prior&&prior.toTissueId!==l.toTissueId;
 });
 const internal=pairFraction(a,b);
 // GENUINE METAMORPHOSIS: new pixel mass, new branch names and a new tissue
 // link are NOT sufficient. Require reorganization of already living
 // material (persistent cell motion or source-relative distance change) OR
 // actual reparenting of an already existing anatomical tissue.
 const meaningful=silhouette>=0.17&&
  (internal>=0.08||relocated>=0.17||reparented);
 return {silhouette,relocated,internal,topology,reparented,meaningful,
  massRatio:b.cells.length/Math.max(1,a.cells.length)};
}
test("mass and new branches alone cannot be misclassified as metamorphosis",()=>{
 const original=Array.from({length:9},(_,i)=>({
  id:"source/"+i,tissueId:"body",x:30+i%3,y:30+Math.floor(i/3),
  color:"#184C52",provenance:"authored" as const,sourceIds:["source/"+i],
  parentCellIds:[] as string[],operationId:null,sourceKind:"body" as const,
  sourcePartId:"body",
 }));
 const core={id:"body",sourcePartId:"body",parentId:null,
  relationship:"floating" as const,sourceCellIds:original.map(c=>c.id),
  growthSiteIds:[] as string[],rigidity:0};
 const birth:MaterialGraph={
  version:1,sourceFingerprint:"independent/growth-only",
  sourceCells:original,cells:original,tissues:[core],sites:[],
  links:[],protectedVoids:[],events:[],
 };
 const appended=Array.from({length:9},(_,i)=>({
  id:"new/"+i,tissueId:"branch",x:33+i%3,y:30+Math.floor(i/3),
  color:"#184C52",provenance:"generated" as const,
  sourceIds:[original[i].id],parentCellIds:[original[i].id],
  operationId:"new-surface-growth",
 }));
 const after:MaterialGraph={...birth,cells:[...original,...appended],
  tissues:[core,{...core,id:"branch",sourcePartId:"body",
   parentId:"body",relationship:"joint",sourceCellIds:[original[0].id]}],
  links:[{id:"new/attachment",kind:"attachment",
   fromTissueId:"branch",toTissueId:"body",
   fromCellId:"new/0",toCellId:"source/2"}]};
 const evaluation=physicalContrast(birth,after);
 assert.ok(evaluation.silhouette>=0.17);
 assert.equal(evaluation.topology,true);
 assert.equal(evaluation.relocated,0);
 assert.equal(evaluation.internal,0);
 assert.equal(evaluation.reparented,false);
 assert.equal(evaluation.meaningful,false,
  "real growth and a new physical branch alone must not pass this metamorphosis gate");
});
test("source-general consecutive-stage physical metamorphosis cohort",{
 skip:process.env.MORPH_STAGE_COHORT!=="1",
},()=>{
 const freehand=morphologySources();
 const cohort=[
  ...STARTER_PRESETS.filter(p=>["dot","ribbon","fork","tripod"].includes(p.id))
   .map(p=>({id:"starter/"+p.id,parts:p.parts})),
  ...[0,3,7,11,16,20,24,29].map(i=>({
   id:"unknown/"+freehand[i].id,parts:freehand[i].parts,
  })),
 ];
 assert.equal(cohort.length,12);
 const perWindow=Array.from({length:checkpoints.length-1},()=>({
  eligible:0,qualifying:0,bodyOnly:0,typed:0,changed:false,
 }));
 const report:unknown[]=[];
 const operatorEvidence:unknown[]=[];
 for(const sample of cohort){
  for(const seed of ["8E8L8WRZ","8W8E8LRZ"])for(const care of lifeCare){
   const sim=createSimulation(sample.parts,seed,"infant",{
    previewCare:care,reuseLivingMaterial:false,
   });
   const states=checkpoints.map(day=>sim.materialStateAt(day));
   const stages=states.map(state=>state.graph);
   const adult=states.at(-1)!;
   const relevant=adult.remodeling.attempts.filter(a=>
    a.id.includes("shape-stage")||a.id.includes("migrate")||
    a.id.includes("topology/")||
    a.id.includes("terminal-physical-organization")||
    a.id.includes("developmental-repattern"));
   const families=new Map<string,{accepted:number;rejected:number;reasons:Record<string,number>}>();
   for(const attempt of relevant){
    const family=attempt.id.includes("terminal-physical-organization")?"terminal-slip":
     attempt.id.includes("topology/")?"reattachment":
     attempt.id.includes("migrate")?"joint":
     attempt.id.includes("developmental-repattern")?"whole-body":
     attempt.id.includes("/shape-stage/1/")?"bend":
     attempt.id.includes("/shape-stage/0/")||
     attempt.id.includes("/shape-stage/2/")?"slip":"reflow";
    const counts=families.get(family)??{accepted:0,rejected:0,reasons:{}};
    if(attempt.status==="accepted")counts.accepted++;
    else{
     counts.rejected++;
     const key=attempt.reason??"unspecified";
     counts.reasons[key]=(counts.reasons[key]??0)+1;
    }
    families.set(family,counts);
   }
   operatorEvidence.push({source:sample.id,seed,care:care.nutrition,
    families:Object.fromEntries(families)});
   assert.deepEqual(stages[0].sourceCells,stages.at(-1)!.sourceCells);
   assert.deepEqual(sim.materialStateAt(366).graph,stages.at(-1));
   for(let i=1;i<stages.length;i++){
    const before=stages[i-1],after=stages[i];
    const metric=physicalContrast(before,after);
    const eligible=before.sourceCells.length>=9;
    if(eligible){
     const row=perWindow[i-1];
     row.eligible++;
     if(metric.meaningful)row.qualifying++;
     if(before.sourceCells.every(c=>c.sourceKind==="body"))
      row.bodyOnly+=Number(metric.meaningful);
     if(before.sourceCells.some(c=>
      c.sourceKind&&c.sourceKind!=="body"&&c.sourceKind!=="decoration"))
      row.typed+=Number(metric.meaningful);
     row.changed ||=metric.meaningful;
    }
    report.push({source:sample.id,seed,care:care.nutrition,
     start:checkpoints[i-1],end:checkpoints[i],...metric});
   }
  }
 }
 console.info("INDEPENDENT_STAGE_CONTRAST",JSON.stringify({
  checkpoints,perWindow,operatorEvidence,report,
 }));
 // A meaningful stage is a trajectory property, NOT merely an adult that is
 // larger than its birth drawing. Thresholds are declared before outcomes.
 for(let i=0;i<perWindow.length;i++){
  const row=perWindow[i],fraction=row.qualifying/Math.max(1,row.eligible);
  assert.ok(row.eligible>=16,"Insufficient independent age-window coverage");
  assert.ok(fraction>=0.25,
   "Insufficient non-additive stage metamorphosis in window "+
   checkpoints[i]+".."+checkpoints[i+1]+" ("+fraction+")");
 }
 assert.ok(perWindow.filter(r=>r.bodyOnly>0).length>=4,
  "Body-only original ink must support genuine stage progression");
 assert.ok(perWindow.filter(r=>r.typed>0).length>=4,
  "Explicitly named anatomy must retain physical metamorphosis potential");
});

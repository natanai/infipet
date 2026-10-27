/**
 * DEV-006: independent source-preservation and physical diversity oracles.
 *
 * Birth oracle (screen lattice): each legal local (x,y) of a PetPart at
 * position (u,v) maps to (x+u+16,y+v+16). Overlap is resolved by descending
 * numeric pixel.z > part.layer > kind's documented rank*1000, then
 * kind-rank/id lexical tie. A screen cell is one colored 64x64 lattice point.
 *
 * Physical metrics operate on the ACTUAL MaterialGraph, never a frame hash:
 * occupancy = cardinality of unique integer (x,y) world cells;
 * C8 = disjoint-set count under 8-adjacency; H4 = unreachable empty
 * 4-connected lattice cells within a one-pixel padded bounding rectangle;
 * (w,h) = bounding extents in lattice cells, aspect=w/h for h>0;
 * graph degree = 2*number of physical attachment/fusion links;
 * live sites = active registered tips whose tissue matches the live cell;
 * branches = number of generated parented material tissues;
 * ancestry = exact set of birth-cell IDs transitively warranted by each
 * generated cell and its recorded creation event.
 *
 * Ranges: 0<=x,y<64; 0<=occupancy<=4096; 0<=C8<=occupancy;
 * 0<=H4<=4096-occupancy; degree>=0; 0<=site<=4096;
 * all counts are integers, aspect is finite or null for empty.
 * Metamorphic oracles detect duplicates, false ancestry, void filling,
 * invented historical parents, incorrect paint order and backward causation.
 * Real anatomical novelty is counted only by physical position/tissue/link
 * change, NEVER by color, animation or physiological state.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createSimulation } from "../src/simulation";
import { createUnifiedMaterialTimeline } from "../src/integration/unified-runtime";
import type { MaterialCell, MaterialGraph, MaterialDevelopmentProgram } from "../src/development";
import type { InheritedGenome } from "../src/simulation/genome";
import type { PetPart, Pixel, PartKind } from "../src/simulation/model";

type Shape={id:string;parts:PetPart[]};
const ranks:Readonly<Record<PartKind,number>>={
  tail:0,wing:1,leg:2,arm:3,body:4,egg:4,head:5,foot:6,hand:6,
  ear:7,horn:7,hair:8,decoration:8,eye:9,mouth:9,
};
const xy=(p:{x:number;y:number})=>p.x+","+p.y;
const byPoint=(a:{x:number;y:number},b:{x:number;y:number})=>
  a.y-b.y||a.x-b.x;
function part(id:string,rows:readonly string[],options:{
  position?:{x:number;y:number};kind?:PartKind;layer?:number;
  colors?:Readonly<Record<string,string>>;
}={}):PetPart {
  return {id,name:"uninterpreted ink",kind:options.kind??"decoration",
    parentId:null,position:options.position??{x:0,y:0},
    ...(options.layer===undefined?{}:{layer:options.layer}),
    pixels:rows.flatMap((line,y)=>Array.from(line).flatMap((ch,x)=>
      ch==="."?[]:[{x,y,color:options.colors?.[ch]??"#247bc1"}])),
  };
}
const solid=(w:number,h:number)=>Array.from({length:h},()=> "#".repeat(w));
const ring=(w:number,h:number)=>Array.from({length:h},(_,y)=>
  Array.from({length:w},(_,x)=>
    x===0||x===w-1||y===0||y===h-1?"#":".").join(""));
const curated:Shape[]=[
  {id:"empty",parts:[part("empty",[])]},
  {id:"single",parts:[part("single",["#"])]},
  {id:"filled-square",parts:[part("filled",solid(7,7),{kind:"body"})]},
  {id:"hollow-volume",parts:[part("hollow",ring(9,9),{kind:"body"})]},
  {id:"horizontal-filament",parts:[part("horizontal",["####################"])]},
  {id:"vertical-filament",parts:[part("vertical",Array.from({length:22},()=>"#"))]},
  {id:"disconnected-masses",parts:[part("islands",[
    "###...............##","###...............##",
    "....................","........#...........",
    ".......###..........","....................",
    "...#................"
  ])]},
  {id:"forked-plant",parts:[part("plant",[
    "#...........#",".#.........#","..#.......#.",
    "...#.....#..","....#...#...",".....#.#....",
    "......#.....","......#.....",".....###....",
    "....#####...",".....###...."
  ],{kind:"body"})]},
  {id:"sparse-constellation",parts:[part("scatter",[
    "#..................#","....................",
    ".......#............","....................",
    ".............#......","...#................"
  ])]},
  {id:"diagonal-asymmetry",parts:[part("asym",[
    "###..........","..#..........","...##........",
    ".....#.......","......##.....",".......#.....",
    ".......####..",".........#..."
  ])]},
  {id:"dense-oblong",parts:[part("dense",solid(17,6),{kind:"body"})]},
  {id:"strange-geometry",parts:[part("unknown",[
    ".##....#.......","##...#...##....",".#.#....#...#..",
    ".....#...#.....","..##.....##....","...#...#....#..",
    ".......###.....","..#....#....#..","##...#.....#..."
  ])]},
  {id:"overlap-layers",parts:[
    part("under",["AA","AA"],{kind:"body",position:{x:3,y:2},layer:15,
      colors:{A:"#111111"}}),
    part("upper",[".B","BB"],{kind:"eye",position:{x:3,y:2},layer:25,
      colors:{B:"#eeeeee"}}),
    part("front",["C."],{kind:"decoration",position:{x:3,y:2},layer:25,
      colors:{C:"#00ff00"}}),
  ]},
  {id:"part-pixel-depth",parts:[
    {...part("base",["AB","BA"],{kind:"body",position:{x:3,y:3},layer:20,
      colors:{A:"#aaaaaa",B:"#bbbbbb"}}),
      pixels:[{x:0,y:0,color:"#aaaaaa",z:35},
        {x:1,y:0,color:"#bbbbbb"},{x:0,y:1,color:"#bbbbbb"},
        {x:1,y:1,color:"#aaaaaa"}]},
    part("paint",["CD","DC"],{kind:"decoration",
      position:{x:3,y:3},layer:30,colors:{C:"#003300",D:"#006600"}}),
  ]},
  {id:"three-part-plant",parts:[
    part("stem",["..#..","..#..","..#..","..#..","..#.."],{kind:"body"}),
    part("roots",["#...#",".#.#.","..#.."],{kind:"leg",
      position:{x:0,y:5}}),
    part("leaves",["#...#",".#.#.","..#.."],{kind:"decoration",
      position:{x:0,y:0}}),
  ]},
];
// Fixed LCG of 2^32 integers, solely for fixture generation, NOT the engine.
// Independent random sparse and clustered ink broadens counterexample search.
let rng=0x159f071b;
const sample=()=>((rng=Math.imul(rng,1664525)+1013904223>>>0)/4294967296);
const generated:Shape[]=[];
for(let sampleIndex=0;sampleIndex<5;sampleIndex++) {
  const rows=Array.from({length:11},(_,y)=>Array.from({length:13},(_,x)=>{
    const bias=sampleIndex===0?0.09:sampleIndex===1?0.28:
      sampleIndex===2?0.48:sampleIndex===3?0.72:
      Math.abs(x-6)<=2&&Math.abs(y-5)<=3?0.83:0.11;
    return sample()<bias?"#":".";
  }).join(""));
  generated.push({id:"procedural-"+sampleIndex,parts:[
    part("hand-drawn-"+sampleIndex,rows)]});
}
const cohort=[...curated,...generated];
const seeds=["seed-amber-23","seed-violet-87"] as const;
const hours=[0,0.5,1,8,24,72] as const;

/** Independent local paint-layer oracle: never calls flattenAnatomy. */
function expectedBirth(parts:readonly PetPart[]):Pixel[] {
  type Painted={pixel:Pixel;depth:number;rank:number;id:string};
  const screen=new Map<string,Painted>();
  for(const p of parts)for(const c of p.pixels){
    const x=c.x+p.position.x,y=c.y+p.position.y;
    if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=32||y<0||y>=32)
      continue;
    const depth=c.z??p.layer??ranks[p.kind]*1000;
    const point:Pixel={x:x+16,y:y+16,color:c.color,
      ...(c.z===undefined?{}:{z:c.z})};
    const key=xy(point),old=screen.get(key);
    if(!old||depth>old.depth||(depth===old.depth&&
      (ranks[p.kind]>old.rank||(ranks[p.kind]===old.rank&&p.id>old.id))))
      screen.set(key,{pixel:point,depth,rank:ranks[p.kind],id:p.id});
  }
  return [...screen.values()].map(entry=>entry.pixel).sort(byPoint);
}
function actualScreen(frame:readonly Pixel[]):Pixel[] {
  return frame.map(p=>({x:p.x,y:p.y,color:p.color,
    ...(p.z===undefined?{}:{z:p.z})})).sort(byPoint);
}
function capture(shape:Shape,seed:string) {
  let retained:{program:MaterialDevelopmentProgram;genome:InheritedGenome}|null=null;
  const sim=createSimulation(shape.parts,seed,"infant",{
    verifyMaterialProgram:(program,genome)=>{
      retained={program,genome};return {program};
    },
  });
  if(!retained)throw Error("Expected actual canonical material program");
  const {program,genome}=retained as {
    program:MaterialDevelopmentProgram;genome:InheritedGenome};
  return {sim,program,timeline:createUnifiedMaterialTimeline({program,genome})};
}
function expectedSources(parts:readonly PetPart[]) {
  return parts.flatMap(p=>p.pixels.map(c=>({
    part:p.id,x:c.x+p.position.x+16,y:c.y+p.position.y+16,
    color:c.color,z:c.z??null,
  }))).sort((a,b)=>a.part.localeCompare(b.part)||byPoint(a,b));
}
function originalMaterial(g:MaterialGraph) {
  const lookup=new Map(g.tissues.map(t=>[t.id,t.sourcePartId]));
  return g.sourceCells.map(c=>({part:lookup.get(c.tissueId)!,
    x:c.x,y:c.y,color:c.color,z:c.z??null}))
    .sort((a,b)=>a.part.localeCompare(b.part)||byPoint(a,b));
}
type Metric=Readonly<{
  occupancy:number;components:number;cavities:number;
  width:number;height:number;aspect:number|null;
  links:number;degree:number;sites:number;branches:number;
  generated:number;authored:number;relocatedOriginal:number;
  sourceRoots:number;eventCount:number;
}>;
/** Disjoint-set component oracle, independent of source-atlas BFS. */
function componentCount(keys:ReadonlySet<string>):number {
  const parent=new Map([...keys].map(k=>[k,k]));
  function root(k:string):string {
    while(parent.get(k)!==k)k=parent.get(k)!;
    return k;
  }
  for(const k of keys) {
    const [x,y]=k.split(",").map(Number);
    for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]) {
      const other=(x+dx)+","+(y+dy);
      if(keys.has(other))parent.set(root(k),root(other));
    }
  }
  return new Set([...keys].map(root)).size;
}
/** 4-connected empty-space flood from padded rectangle perimeter. */
function cavityCount(keys:ReadonlySet<string>,bounds:{
  x0:number;y0:number;x1:number;y1:number;
}):number {
  if(!keys.size)return 0;
  const x0=Math.max(0,bounds.x0-1),x1=Math.min(63,bounds.x1+1),
    y0=Math.max(0,bounds.y0-1),y1=Math.min(63,bounds.y1+1);
  const outside=new Set<string>(),queue:[number,number][]=[];
  const add=(x:number,y:number)=>{
    const k=x+","+y;
    if(x>=x0&&x<=x1&&y>=y0&&y<=y1&&
      !outside.has(k)&&!keys.has(k)) {
      outside.add(k);queue.push([x,y]);
    }
  };
  for(let x=x0;x<=x1;x++){add(x,y0);add(x,y1);}
  for(let y=y0;y<=y1;y++){add(x0,y);add(x1,y);}
  for(let i=0;i<queue.length;i++){
    const [x,y]=queue[i];
    add(x+1,y);add(x-1,y);add(x,y+1);add(x,y-1);
  }
  let empty=0;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const k=x+","+y;
    if(!keys.has(k)&&!outside.has(k))empty++;
  }
  return empty;
}
function measure(g:MaterialGraph):Metric {
  const keys=new Set(g.cells.map(xy));
  const live=new Set(g.cells.map(c=>c.id));
  const sourceById=new Map(g.sourceCells.map(c=>[c.id,c]));
  const xs=g.cells.map(c=>c.x),ys=g.cells.map(c=>c.y);
  const box=keys.size?{
    x0:Math.min(...xs),x1:Math.max(...xs),
    y0:Math.min(...ys),y1:Math.max(...ys),
  }:null;
  const width=box?box.x1-box.x0+1:0,height=box?box.y1-box.y0+1:0;
  return {
    occupancy:keys.size,components:componentCount(keys),
    cavities:box?cavityCount(keys,box):0,
    width,height,aspect:height?width/height:null,
    links:g.links.length,degree:g.links.length*2,
    sites:g.sites.filter(s=>live.has(s.rootCellId)).length,
    branches:g.tissues.filter(t=>t.parentId!==null&&
      !new Set(g.sourceCells.map(c=>c.tissueId)).has(t.id)).length,
    generated:g.cells.filter(c=>c.provenance==="generated").length,
    authored:g.cells.filter(c=>c.provenance==="authored").length,
    relocatedOriginal:g.cells.filter(c=>c.provenance==="authored" &&
      ((sourceById.get(c.id)?.x!==c.x)||(sourceById.get(c.id)?.y!==c.y))).length,
    sourceRoots:new Set(g.cells.flatMap(c=>c.sourceIds)).size,
    eventCount:g.events.length,
  };
}
function geometry(g:MaterialGraph):string {
  return JSON.stringify({
    xyz:[...g.cells].map(c=>c.tissueId+"@"+xy(c)).sort(),
    topology:g.links.map(l=>[l.kind,l.fromTissueId,l.toTissueId].join(":")).sort(),
    sites:g.sites.map(s=>s.tissueId+":"+s.rootCellId).sort(),
  });
}
function physicalPositions(g:MaterialGraph):string {
  return [...g.cells].map(c=>xy(c)).sort().join("|");
}
/**
 * Audits only claims derivable from authoritative graph and birth witnesses.
 * Historical removed parent cells retain their creation EVENT and sourceIds;
 * generated material cannot spontaneously appear without a creation event.
 */
function audit(g:MaterialGraph,birth:MaterialGraph,cutoff:number):void {
  assert.deepEqual(g.sourceCells,birth.sourceCells,"permanent original ink witness");
  assert.deepEqual(g.protectedVoids,birth.protectedVoids);
  assert.equal(g.sourceFingerprint,birth.sourceFingerprint);
  const source=new Map(birth.sourceCells.map(c=>[c.id,c]));
  const active=new Map(g.cells.map(c=>[c.id,c]));
  assert.equal(active.size,g.cells.length,"duplicated material identity");
  const tissues=new Map(g.tissues.map(t=>[t.id,t]));
  assert.equal(tissues.size,g.tissues.length,"duplicate tissue ID");
  const sites=new Set(g.sites.map(s=>s.id));
  assert.equal(sites.size,g.sites.length,"duplicate site ID");
  const eventMap=new Map<string,MaterialGraph["events"][number]>();
  const creators=new Map<string,MaterialGraph["events"][number]>();
  const historicalCreated=new Set<string>();
  const removed=new Set<string>();
  for(const e of g.events) {
    assert.ok(e.atHour>=0&&e.atHour<=cutoff+1e-8,
      "future event at "+e.atHour+" > "+cutoff);
    assert.ok(!eventMap.has(e.id),"duplicate event ID "+e.id);
    eventMap.set(e.id,e);
    for(const id of e.createdCellIds){
      assert.ok(!historicalCreated.has(id),"material created twice "+id);
      historicalCreated.add(id);creators.set(id,e);
    }
    for(const id of e.removedCellIds){
      assert.ok(!removed.has(id),"material removed twice "+id);
      removed.add(id);
    }
    assert.ok(e.sourceCellIds.every(id=>source.has(id)),
      "event points at imaginary original ink");
  }
  const voids=new Set(birth.protectedVoids);
  const sourcePositions=new Map(birth.cells.map(c=>[c.id,xy(c)]));
  const positions=new Map<string,MaterialCell[]>();
  for(const c of g.cells) {
    assert.ok(Number.isSafeInteger(c.x)&&Number.isSafeInteger(c.y) &&
      c.x>=0&&c.x<64&&c.y>=0&&c.y<64,"non-lattice physical cell");
    assert.ok(tissues.has(c.tissueId),"orphan tissue "+c.id);
    assert.ok(c.sourceIds.length>0&&
      c.sourceIds.every(id=>source.has(id)),"missing original-cell ancestry "+c.id);
    assert.ok(!voids.has(xy(c)),"originally protected cavity filled "+c.id);
    assert.ok(!removed.has(c.id),"removed material resurrected");
    const overlapping=positions.get(xy(c))??[];
    assert.ok(overlapping.every(other=>
      sourcePositions.get(other.id)===xy(c)&&
      sourcePositions.get(c.id)===xy(c)),
      "unrecorded overlapping matter "+c.id);
    overlapping.push(c);positions.set(xy(c),overlapping);
    if(c.provenance==="authored") {
      assert.ok(source.has(c.id),"invented authored cell "+c.id);
      assert.deepEqual(c.sourceIds,[c.id]);
      assert.equal(c.operationId,null);
    }else{
      assert.equal(c.provenance,"generated");
      const event=creators.get(c.id);
      assert.ok(event,"generated anatomy lacks creating event "+c.id);
      assert.ok(c.operationId&&
        (event.id===c.operationId ||
          event.id.startsWith(c.operationId+"/unit/")),
        "generated anatomy lacks matching operation "+c.id);
      assert.ok(c.parentCellIds.length>0,"generated material without physical parent");
      for(const parent of c.parentCellIds){
        assert.notEqual(parent,c.id,"causal cycle");
        assert.ok(source.has(parent)||creators.has(parent),
          "generated cell has invented parent "+parent);
        const activeParent=active.get(parent)??source.get(parent);
        if(activeParent)
          assert.ok(activeParent.sourceIds.some(root=>c.sourceIds.includes(root)),
            "generated parent has unrelated original ink");
      }
      assert.ok(c.sourceIds.every(id=>event.sourceCellIds.includes(id)),
        "creation event lacks its actual source material");
    }
  }
  for(const link of g.links) {
    assert.ok(tissues.has(link.fromTissueId)&&tissues.has(link.toTissueId),
      "orphaned attachment/fusion tissue");
    for(const [id,t] of [[link.fromCellId,link.fromTissueId],
      [link.toCellId,link.toTissueId]] as const)
      if(id!==null)assert.equal(active.get(id)?.tissueId,t,
        "attachment/fusion refers to absent or wrong material");
  }
  for(const site of g.sites) {
    assert.ok(tissues.has(site.tissueId),"site on deleted tissue");
    // A stale site is forbidden as ACTIVE, but historical dormant pointers
    // can remain; the iterative state must mark these invalidated.
  }
  for(const t of g.tissues) {
    if(t.parentId)assert.ok(tissues.has(t.parentId),"orphaned parent tissue");
    assert.ok(t.growthSiteIds.every(id=>sites.has(id)),
      "tissue claims non-existent growth site");
  }
}
test("[DEV-006/A1] independent exact birth paint, depth, positioning and part identities",()=>{
  assert.ok(cohort.length>=18);
  let checked=0,overlaps=0;
  for(const item of cohort) {
    const {sim,program}=capture(item,"birth-cohort");
    const actual=actualScreen(sim.frameAt(0,{time:0,action:"idle"}).pixels);
    const expected=expectedBirth(item.parts);
    assert.deepEqual(actual,expected,item.id+" wrong birth color/layer/coordinate");
    assert.equal(sim.frameAt(0).cellCount,expected.length);
    assert.deepEqual(originalMaterial(program.source),expectedSources(item.parts),
      item.id+" original author-part identity lost in MaterialGraph");
    overlaps+=expectedSources(item.parts).length-expected.length;
    checked++;
  }
  assert.ok(overlaps>0,"cohort must actually test painter overlaps");
  console.log("DEV-006 BIRTH "+JSON.stringify({shapes:checked,
    partLayerOverlaps:overlaps,birthMismatchCount:0}));
});
test("[DEV-006/A1] independent painter-order metamorphisms and zero-material boundary",()=>{
  const overlap=curated.find(x=>x.id==="overlap-layers")!;
  const reference=expectedBirth(overlap.parts);
  assert.deepEqual(expectedBirth([...overlap.parts].reverse()),reference);
  const swapped=overlap.parts.map(p=>({...p,pixels:p.pixels.map(c=>({...c}))}));
  const top=swapped.find(p=>p.id==="front")!;
  top.layer=100;
  assert.notDeepEqual(expectedBirth(swapped),reference,
    "independent painter must notice changed upper pigment");
  const captured=capture(overlap,"paint-metamorph");
  assert.deepEqual(actualScreen(captured.sim.frameAt(0).pixels),reference);
  const zero=capture(curated[0],"empty-metamorph");
  assert.equal(zero.timeline.at(0).graph.cells.length,0);
  assert.equal(zero.sim.frameAt(0).pixels.length,0);
});
test("[DEV-006/A2] independent counterexamples catch material erasure, duplicate matter, false parents and protected voids",()=>{
  const target=curated.find(x=>x.id==="hollow-volume")!;
  const {program}=capture(target,"audit-counterexample");
  const born=program.source;
  const source=born.sourceCells[0]!;
  const bad=(g:MaterialGraph)=>assert.throws(()=>audit(g,born,0));
  bad({...born,sourceCells:born.sourceCells.slice(1)});
  bad({...born,cells:[...born.cells,{...source}]});
  const point=born.protectedVoids[0];
  assert.ok(point,"enclosed source must retain protected empty space");
  const [x,y]=point.split(",").map(Number);
  bad({...born,cells:[...born.cells,{...source,x,y,
    id:"phantom/void",provenance:"generated",
    sourceIds:[source.id],parentCellIds:["does-not-exist"],
    operationId:"invented"}]});
  const generated:MaterialCell={...source,id:"phantom/child",x:12,y:12,
    provenance:"generated",sourceIds:[source.id],
    parentCellIds:["unborn/parent"],operationId:"imaginary"};
  bad({...born,cells:[...born.cells,generated]});
  bad({...born,events:[{id:"future",kind:"bud",atHour:1,
    createdCellIds:[],removedCellIds:[],sourceCellIds:[source.id]}]});
});
test("[DEV-006/A2] bounded arbitrary-ink cohort audits causality and quantifies structural diversity",()=>{
  const withinSource:number[]=[];
  const signatureAtBirth=new Set<string>();
  const signatureAtEnd=new Set<string>();
  const occupiedAtEnd=new Set<string>();
  const metricFamilies=new Set<string>();
  let structuralSeedDifferences=0,physicalChanges=0,
    constrainedNulls=0,frames=0,generatedTotal=0,
    movedAuthoredTotal=0,suppressed=0,accepted=0;
  const sampled:Record<string,Metric[]>={};
  for(const item of cohort) {
    const endVariants:string[]=[];
    const birthGeometry:string[]=[];
    for(const seed of seeds) {
      const {program,timeline}=capture(item,seed);
      const born=timeline.birth().graph;
      audit(born,program.source,0);
      const sequence=hours.map(at=>timeline.at(at));
      for(let i=0;i<sequence.length;i++) {
        const snap=sequence[i];
        assert.equal(snap.atHour,hours[i]);
        audit(snap.graph,born,hours[i]);
        frames++;
        if(i>0) {
          const before=sequence[i-1].graph.events;
          assert.deepEqual(snap.graph.events.slice(0,before.length),before,
            item.id+" "+seed+" rewrote historical event");
        }
      }
      const end=sequence[sequence.length-1].graph;
      const bm=measure(born),em=measure(end);
      assert.ok(em.occupancy>=0&&em.occupancy<=4096);
      assert.ok(em.components<=em.occupancy);
      assert.ok(em.cavities<=4096-em.occupancy);
      if(bm.occupancy!==0)assert.ok(em.sourceRoots>=1);
      sampled[item.id]??=[];
      sampled[item.id].push(em);
      generatedTotal+=em.generated;
      movedAuthoredTotal+=em.relocatedOriginal;
      for(const decision of sequence[sequence.length-1].material.decisions){
        if(decision.status==="accepted")accepted++;
        else suppressed++;
      }
      const startKey=geometry(born),endKey=geometry(end);
      birthGeometry.push(startKey);endVariants.push(endKey);
      signatureAtBirth.add(startKey);signatureAtEnd.add(endKey);
      occupiedAtEnd.add(physicalPositions(end));
      metricFamilies.add([em.occupancy,em.components,em.cavities,
        em.width,em.height,em.links,em.sites,em.branches].join(":"));
      if(startKey===endKey)constrainedNulls++;else physicalChanges++;
      // Out-of-order frame requests must be exactly equivalent to an independent
      // fresh chronological replay, not to a mutable animation/cache state.
      const atOne=timeline.at(1);
      assert.deepEqual(atOne.graph,sequence[2].graph,item.id+" backwards anatomy");
      const replayOne=timeline.replay(1);
      assert.deepEqual(replayOne.graph,sequence[2].graph);
      assert.deepEqual(timeline.at(72).graph,end);
    }
    assert.equal(new Set(birthGeometry).size,1,
      "color-independent source geometry cannot depend on permanent seed");
    if(new Set(endVariants).size>1)structuralSeedDifferences++;
    withinSource.push(new Set(endVariants).size);
  }
  assert.ok(signatureAtBirth.size>=cohort.length-1,
    "independent drawings must not collapse to one structural birth plan");
  assert.ok(signatureAtEnd.size>=cohort.length-1);
  assert.ok(metricFamilies.size>=8,
    "diverse structural measurements must not collapse to one anatomy");
  assert.ok(physicalChanges>0,"some genuinely physical development required");
  const numerical={
    shapes:cohort.length,seedsPerShape:seeds.length,
    frameEvaluations:frames,latestHour:hours[hours.length-1],
    distinctBirthStructures:signatureAtBirth.size,
    distinctLaterStructures:signatureAtEnd.size,
    distinctOccupiedGeometries:occupiedAtEnd.size,
    distinctMetricVectors:metricFamilies.size,
    sourceShapesWithSeedSensitiveAnatomy:structuralSeedDifferences,
    sourceShapesWithIdenticalSeedAnatomy:cohort.length-structuralSeedDifferences,
    physicallyChangedLifetimes:physicalChanges,
    physicallyConstrainedOrDormantLifetimes:constrainedNulls,
    generatedLiveCellsSum:generatedTotal,
    relocatedLiveAuthoredCellsSum:movedAuthoredTotal,
    recordedAcceptedOperatorDecisions:accepted,
    recordedDeferredOrSuppressedOperatorDecisions:suppressed,
  };
  console.log("DEV-006 COHORT "+JSON.stringify(numerical));
});
test("[DEV-006/A2] pigment-only mutations do not count as an anatomical difference",()=>{
  const original=part("same-paint",ring(7,7),{kind:"body"});
  const changed:PetPart={...original,pixels:original.pixels.map(p=>({
    ...p,color:p.x%2===0?"#ffaabb":"#442299"}))};
  const a=capture({id:"repaint-a",parts:[original]},"same-genotype");
  const b=capture({id:"repaint-b",parts:[changed]},"same-genotype");
  assert.deepEqual(measure(a.program.source),measure(b.program.source));
  assert.equal(physicalPositions(a.program.source),physicalPositions(b.program.source));
  assert.notDeepEqual(expectedBirth([original]),expectedBirth([changed]));
});

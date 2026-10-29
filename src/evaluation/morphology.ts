/**
 * MORPH-003 independent physical expressiveness measurements.
 *
 * Domain: an authoritative MaterialGraph's integer [0,63]^2 material sites.
 * No rendered sprites, biological operator labels, color, pose or templates.
 * Finite limits: <=4096 active cells, <=4096 archived created IDs, <=365
 * chronologically ordered daily boundaries and <=4096 occupied lattice sites.
 * All counts are integers; ratios are finite IEEE754 divisions in [0,1].
 *
 * Equations (N is occupied lattice sites, E4 shared undirected 4-neighbor edges):
 * A=N; W=xmax-xmin+1; H=ymax-ymin+1; aspect=W/max(1,H).
 * P=4N-2E4; surface=P/max(1,A); solidity=A/max(1,W*H).
 * d(p)=min cardinal steps from p to an unoccupied lattice point; for an
 * occupied boundary cell d=1; thickness histogram counts d=1,2,3+.
 * Foreground components use 8 neighbors, background holes 4 neighbors.
 * Region size ratio=|region at t|/max(1,|region at birth|).
 * Structural change=|occupied_t symmetric_difference occupied_0| /
 *                   max(1,|occupied_t union occupied_0|).
 * Material transport and resorption are by permanent cell ID, never artwork.
 * Growth class is determined by geometry AFTER the operation: broad d>=2;
 * thin lateral if >=2 different 4-neighbor old material sites; otherwise
 * terminal thin if tip/chain degree <=2; remaining is other thin deposition.
 *
 * Blind spots: lattice erosion is Manhattan thickness, not an anatomical
 * radius; the 4/8 connectivity convention treats diagonal contact as attached;
 * skeleton runs estimate narrow path lengths rather than semantic appendages;
 * bounding-box solidity is not convex-hull solidity; event-only deltas cannot
 * prove which causal care exposure was consumed. Full daily auditors must
 * additionally verify authorized event chronology and exact inventory.
 */
import type {MaterialCell, MaterialGraph} from "../development/material-graph";
import {createAnatomicalAudit,verifyCoordinatedStrain,verifyAdvancingFront,verifyAxialSupport} from "../development/anatomical-audit";

export type PhysicalMetrics=Readonly<{
  occupiedArea:number;physicalCells:number;width:number;height:number;aspect:number;
  perimeter:number;perimeterPerArea:number;solidity:number;
  thickness:Readonly<{one:number;two:number;threePlus:number;mean:number}>;
  components:number;holes:number;adjacencies4:number;adjacencies8:number;
  thinPathLengths:readonly number[];
  tissueCount:number;specializedTissues:number;attachmentCount:number;
  quadrants:readonly [number,number,number,number];
}>;
export type MaterialChangeMetrics=Readonly<{
  created:number;removed:number;relocated:number;
  terminalExtension:number;lateralExpansion:number;broadDeposition:number;otherDeposition:number;
  terminalFraction:number;broadFraction:number;
  /** Exclusive physical-unit allocation; topology contributions count links/components/tissues as one unit each. */
  changeShares:Readonly<{terminal:number;lateral:number;broad:number;relocation:number;
    resorption:number;topology:number;other:number}>;
  distribution:readonly [number,number,number,number];
  sourceResorbed:number;sourceRelocated:number;
  /** Fraction of source-identity pairs whose distance changes by >=.75 cells. */
  sourcePairChange:number;
  newTissues:number;changedAttachments:number;
  componentDelta:number;holeDelta:number;topologyChanged:boolean;
  structuralChange:number;regionalAreaRatios:Readonly<Record<string,number>>;
}>;
const cardinal=[[1,0],[-1,0],[0,1],[0,-1]] as const;
const diagonal=[...cardinal,[1,1],[1,-1],[-1,1],[-1,-1]] as const;
const k=(x:number,y:number)=>x+","+y;
const pos=(p:{x:number;y:number})=>k(p.x,p.y);
const MAX=4096;
/** Translation- and added-mass-independent strain of source material. A live
 * original is its own representative; after real turnover use the nearest
 * pigment-matched descendant, ties by ID. Counts no renderer or pose changes. */
export function sourcePairChange(before:MaterialGraph,after:MaterialGraph):number{
 const live=new Map(after.cells.map(c=>[c.id,c]));
 const points=before.sourceCells.map(c=>({old:c,now:live.get(c.id)??after.cells
  .filter(p=>p.color===c.color&&p.sourceIds.includes(c.id)).sort((a,b)=>
   (a.x-c.x)**2+(a.y-c.y)**2-(b.x-c.x)**2-(b.y-c.y)**2||(a.id<b.id?-1:1))[0]}));
 let changed=0,total=0;
 for(let i=0;i<points.length;i++)for(let j=0;j<i;j++){
  const a=points[i],b=points[j];if(!a.now||!b.now)continue;
  if(Math.abs(Math.hypot(a.old.x-b.old.x,a.old.y-b.old.y)-Math.hypot(a.now.x-b.now.x,a.now.y-b.now.y))>=.75)changed++;
  total++;
 }
 return total?changed/total:0;
}
/**
 * Independent verification contract for the fourteen required dimensions.
 * Domain: integer physical MaterialGraph coordinates [0,63], 0..4096 cells,
 * chronological checkIndex 0..365. All definitions are pure and deterministic.
 * Sensitivity identifies a change detected; blind spots delimit what it cannot
 * establish. Numerical finite guarantees are enforced in validate().
 */
export const MORPHOLOGY_METRIC_CONTRACT={
  physicalArea:{equation:"A=number of unique occupied lattice sites",
    sensitivity:"Detects occupied-cell gain/loss",blindSpot:"Overlapping cells share one area unit"},
  wholeBodyBounds:{equation:"W=maxX-minX+1,H=maxY-minY+1,aspect=W/max(1,H)",
    sensitivity:"Detects extents and aspect change",blindSpot:"Identical bounds may hide internal remodeling"},
  localThickness:{equation:"d(p)=1+min four-connected erosion depth to exterior; count d=1,2,>=3",
    sensitivity:"Discriminates thick deposits from one-cell filaments",blindSpot:"Manhattan not Euclidean thickness"},
  perimeter:{equation:"P=4A-2E4; surface=P/max(1,A)",
    sensitivity:"Higher exposed-edge fraction for tendrils",blindSpot:"Cavities also increase perimeter"},
  solidity:{equation:"A/max(1,W*H)",
    sensitivity:"Detects spatially compact occupation",blindSpot:"Not convex-hull solidity; line can be box-solid"},
  regionalProportions:{equation:"per-tissue live physical count/max(1,birth tissue count)",
    sensitivity:"Detects nonuniform regional tissue growth",blindSpot:"Tissue ID persistence is not semantic identity"},
  branchLengths:{equation:"connected cardinal runs with d=1 and original graph degree<=2",
    sensitivity:"Detects narrow extended material trajectories",blindSpot:"Not a semantic skeleton or anatomical appendage classifier"},
  topology:{equation:"8-neighbor foreground components, 4-neighbor holes, E4/E8 and material links",
    sensitivity:"Detects attachment and cavity structure",blindSpot:"Diagonal touch is connected by convention"},
  tissueSpecialization:{equation:"distinct live tissue IDs, active rigidity>0 and attachment links",
    sensitivity:"Detects recorded material specialization",blindSpot:"Labels alone do not prove mechanical function"},
  depositionDistribution:{equation:"new cells classified by terminal/lateral/broad/other and 4 bbox sectors",
    sensitivity:"Detects where physical matter actually appears",blindSpot:"Relative sectors may blur fine gradients"},
  relocationResorption:{equation:"permanent source IDs absent or at changed (x,y); explicit event receipts",
    sensitivity:"Detects source rearrangement or loss",blindSpot:"Must additionally prove operation authorization"},
  birthChange:{equation:"|occupied_birth symmetric_difference occupied_now|/|union|",
    sensitivity:"Detects anatomy change independent of initial drawing diversity",blindSpot:"Exact swaps and rotations may exaggerate coordinate difference"},
  chronologicalTrajectory:{equation:"ordered physical metrics at k=0,1,7,30,90,180,365; daily-check causality",
    sensitivity:"Detects timing and diversity across one lifetime",blindSpot:"Sparse checkpoints can miss reversible transients"},
  counterfactuals:{equation:"difference of equal-time birth-relative physical deltas between fixed-drawing lives",
    sensitivity:"Detects seed and synthetic/recorded care influence",blindSpot:"Same magnitude different geometry needs additional topology metrics"},
} as const;
const bound=(cells:readonly {x:number;y:number}[])=>{
  if(!cells.length)return {minX:0,minY:0,maxX:-1,maxY:-1,width:0,height:0};
  const xs=cells.map(c=>c.x),ys=cells.map(c=>c.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return {minX,minY,maxX,maxY,width:maxX-minX+1,height:maxY-minY+1};
};
function validate(cells:readonly MaterialCell[]){
  if(cells.length>MAX)throw new RangeError("Physical cell measurement budget exceeded");
  const ids=new Set<string>();
  for(const c of cells){
    if(!c.id||ids.has(c.id)||!Number.isSafeInteger(c.x)||!Number.isSafeInteger(c.y)||
      c.x<0||c.y<0||c.x>=64||c.y>=64)throw new RangeError("Invalid or duplicate physical identity/coordinate");
    ids.add(c.id);
  }
}
const unique=(cells:readonly {x:number;y:number}[])=>new Set(cells.map(pos));
function components(occupied:ReadonlySet<string>,steps:readonly (readonly number[])[]) {
  const seen=new Set<string>();let count=0;
  for(const at of occupied){
    if(seen.has(at))continue;
    count++;const q=[at];seen.add(at);
    for(let i=0;i<q.length;i++){
      const [x,y]=q[i].split(",").map(Number);
      for(const [dx,dy] of steps){
        const next=k(x+dx,y+dy);
        if(occupied.has(next)&&!seen.has(next)){seen.add(next);q.push(next);}
      }
    }
  }
  return count;
}
function depths(occupied:ReadonlySet<string>):Map<string,number>{
  const d=new Map<string,number>();const q:string[]=[];
  for(const at of occupied){
    const [x,y]=at.split(",").map(Number);
    if(cardinal.some(([dx,dy])=>!occupied.has(k(x+dx,y+dy)))){d.set(at,1);q.push(at);}
  }
  for(let i=0;i<q.length;i++){
    const at=q[i],[x,y]=at.split(",").map(Number);
    for(const [dx,dy] of cardinal){const n=k(x+dx,y+dy);
      if(occupied.has(n)&&!d.has(n)){d.set(n,d.get(at)!+1);q.push(n);}}
  }
  return d;
}
function holes(occupied:ReadonlySet<string>,b:ReturnType<typeof bound>):number{
  if(!occupied.size)return 0;
  const seen=new Set<string>();let n=0;
  for(let y=b.minY;y<=b.maxY;y++)for(let x=b.minX;x<=b.maxX;x++){
    const a=k(x,y);if(occupied.has(a)||seen.has(a))continue;
    const q=[a];seen.add(a);let outside=false;
    for(let i=0;i<q.length;i++){
      const [cx,cy]=q[i].split(",").map(Number);
      if(cx===b.minX||cx===b.maxX||cy===b.minY||cy===b.maxY)outside=true;
      for(const [dx,dy] of cardinal){
        const nx=cx+dx,ny=cy+dy,next=k(nx,ny);
        if(nx<b.minX||nx>b.maxX||ny<b.minY||ny>b.maxY||occupied.has(next)||seen.has(next))continue;
        seen.add(next);q.push(next);
      }
    }if(!outside)n++;
  }return n;
}
function degree(occupied:ReadonlySet<string>,at:string,neighbors=cardinal):number{
  const [x,y]=at.split(",").map(Number);
  return neighbors.filter(([dx,dy])=>occupied.has(k(x+dx,y+dy))).length;
}
/** Maximal cardinal narrow-material runs; sorted lengths, not semantic limbs. */
function narrowRuns(occupied:ReadonlySet<string>,depth:ReadonlyMap<string,number>):number[]{
  const thin=new Set([...occupied].filter(at=>depth.get(at)===1&&degree(occupied,at)<=2));
  const junctions=new Set([...thin].filter(at=>degree(thin,at)>2));
  const seen=new Set<string>(),runs:number[]=[];
  for(const at of thin){
    if(junctions.has(at)||seen.has(at))continue;
    const queue=[at];seen.add(at);
    for(let i=0;i<queue.length;i++){
      const [x,y]=queue[i].split(",").map(Number);
      for(const [dx,dy] of cardinal){
        const next=k(x+dx,y+dy);
        if(thin.has(next)&&!junctions.has(next)&&!seen.has(next)){
          seen.add(next);queue.push(next);
        }
      }
    }
    runs.push(queue.length);
  }
  return runs.sort((a,b)=>b-a);
}
function sectors(cells:readonly {x:number;y:number}[],b:ReturnType<typeof bound>):[number,number,number,number]{
  const v:[number,number,number,number]=[0,0,0,0];
  if(!cells.length)return v;
  const midX=(b.minX+b.maxX)/2,midY=(b.minY+b.maxY)/2;
  for(const p of cells)v[Number(p.x>midX)+2*Number(p.y>midY)]++;
  return v;
}
export function measurePhysical(graph:MaterialGraph):PhysicalMetrics{
  validate(graph.cells);
  const occ=unique(graph.cells),b=bound(graph.cells),d=depths(occ),area=occ.size;
  let edges4=0,edges8=0;
  for(const at of occ){
    const [x,y]=at.split(",").map(Number);
    if(occ.has(k(x+1,y)))edges4++;
    if(occ.has(k(x,y+1)))edges4++;
    for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]])if(occ.has(k(x+dx,y+dy)))edges8++;
  }
  const values=[...d.values()];
  const tissues=new Set(graph.cells.map(c=>c.tissueId));
  return {
    occupiedArea:area,physicalCells:graph.cells.length,width:b.width,height:b.height,
    aspect:b.height?b.width/b.height:0,perimeter:4*area-2*edges4,
    perimeterPerArea:area?(4*area-2*edges4)/area:0,
    solidity:b.width*b.height?area/(b.width*b.height):0,
    thickness:{one:values.filter(v=>v===1).length,
      two:values.filter(v=>v===2).length,threePlus:values.filter(v=>v>=3).length,
      mean:area?values.reduce((s,v)=>s+v,0)/area:0},
    components:components(occ,diagonal),holes:holes(occ,b),
    adjacencies4:edges4,adjacencies8:edges8,thinPathLengths:narrowRuns(occ,d),
    tissueCount:tissues.size,
    specializedTissues:graph.tissues.filter(t=>t.rigidity>0&&tissues.has(t.id)).length,
    attachmentCount:graph.links.filter(l=>tissues.has(l.fromTissueId)&&tissues.has(l.toTissueId)).length,
    quadrants:sectors([...occ].map(at=>{const [x,y]=at.split(",").map(Number);return{x,y}}),b),
  };
}
/** A geometric comparison; denominators never depend on operator names. */
export function measureChange(before:MaterialGraph,after:MaterialGraph):MaterialChangeMetrics{
  validate(before.cells);validate(after.cells);
  const old=new Map(before.cells.map(c=>[c.id,c]));
  const next=new Map(after.cells.map(c=>[c.id,c]));
  const oldOcc=unique(before.cells),newOcc=unique(after.cells),d=depths(newOcc);
  const created=after.cells.filter(c=>!old.has(c.id));
  const removed=before.cells.filter(c=>!next.has(c.id));
  const moved=after.cells.filter(c=>{const p=old.get(c.id);return p&&(p.x!==c.x||p.y!==c.y);});
  let broad=0,lateral=0,terminal=0,other=0;
  for(const c of created){
    const at=pos(c),links=degree(oldOcc,at);
    if((d.get(at)??0)>=2)broad++;
    else if(links>=2)lateral++;
    else if(degree(newOcc,at)<=2)terminal++;
    else other++;
  }
  const oldM=measurePhysical(before),newM=measurePhysical(after);
  const union=new Set([...oldOcc,...newOcc]);
  const differ=[...union].filter(at=>oldOcc.has(at)!==newOcc.has(at)).length;
  const oldRegions=new Map<string,number>(),newRegions=new Map<string,number>();
  for(const c of before.cells)oldRegions.set(c.tissueId,(oldRegions.get(c.tissueId)??0)+1);
  for(const c of after.cells)newRegions.set(c.tissueId,(newRegions.get(c.tissueId)??0)+1);
  const regionalAreaRatios:Record<string,number>={};
  for(const id of new Set([...oldRegions.keys(),...newRegions.keys()]))
    regionalAreaRatios[id]=(newRegions.get(id)??0)/Math.max(1,oldRegions.get(id)??0);
  const oldLinks=new Set(before.links.map(l=>l.id+"|"+l.fromCellId+"|"+l.toCellId));
  const newLinks=new Set(after.links.map(l=>l.id+"|"+l.fromCellId+"|"+l.toCellId));
  const changedAttachments=[...new Set([...oldLinks,...newLinks])]
    .filter(a=>oldLinks.has(a)!==newLinks.has(a)).length;
  const topologicalUnits=changedAttachments+
    Math.abs(newM.components-oldM.components)+Math.abs(newM.holes-oldM.holes)+
    [...newRegions.keys()].filter(id=>!oldRegions.has(id)).length;
  const changeUnits=created.length+removed.length+moved.length+topologicalUnits;
  const share=(v:number)=>changeUnits?v/changeUnits:0;
  return {created:created.length,removed:removed.length,relocated:moved.length,
    terminalExtension:terminal,lateralExpansion:lateral,broadDeposition:broad,otherDeposition:other,
    terminalFraction:created.length?terminal/created.length:0,
    broadFraction:created.length?broad/created.length:0,
    changeShares:{terminal:share(terminal),lateral:share(lateral),
      broad:share(broad),relocation:share(moved.length),resorption:share(removed.length),
      topology:share(topologicalUnits),other:share(other)},
    distribution:sectors(created,bound(after.cells)),
    sourceResorbed:removed.filter(c=>c.provenance==="authored").length,
    sourceRelocated:moved.filter(c=>c.provenance==="authored").length,
    sourcePairChange:sourcePairChange(before,after),
    newTissues:[...newRegions.keys()].filter(id=>!oldRegions.has(id)).length,
    changedAttachments,componentDelta:newM.components-oldM.components,
    holeDelta:newM.holes-oldM.holes,
    topologyChanged:oldM.components!==newM.components||oldM.holes!==newM.holes||
      changedAttachments!==0,
    structuralChange:union.size?differ/union.size:0,regionalAreaRatios};
}
export type PhysicalProof=Readonly<{valid:boolean;errors:readonly string[]}>;
/**
 * Independent inventory replay from authored matter through archived events.
 * A forged attractive final shape with invented IDs/ancestry/creation fails.
 * Daily-time authorization of the actual operation schedule belongs to the
 * independent daily physical auditor, not to this geometric verifier.
 */
export function provePhysicalMaterial(graph:MaterialGraph):PhysicalProof{
  const errors:string[]=[];
  try{validate(graph.sourceCells);validate(graph.cells);}catch(e){
    return {valid:false,errors:[String(e)]};}
  let active=new Map(graph.sourceCells.map(c=>[c.id,c]));
  const sourceIds=new Set(active.keys()),createdEver=new Set(sourceIds);
  const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  const sources=new Map(graph.sourceCells.map(c=>[c.id,c]));
  const continuous=createAnatomicalAudit(graph.sourceCells);
  const birth=graph.birth;
  let protectedVoids=[...(birth?.protectedVoids??graph.protectedVoids)];
  const tissues=new Map((birth?.tissues??[]).map(t=>[t.id,t]));
  const links=new Map((birth?.links??[]).map(l=>[l.id,l]));
  const sites=new Map((birth?.sites??[]).map(t=>[t.id,t]));
  const applyChanges=<T extends {id:string}>(records:Map<string,T>,changes:readonly {
    id:string;before:T|null;after:T|null}[],kind:string)=>{
    for(const change of changes){
      const prior=records.get(change.id)??null;
      if(!same(prior,change.before)||change.after?.id!==change.id&&change.after!==null)
        errors.push("unauthorized-"+kind+":"+change.id);
      if(change.after)records.set(change.id,change.after);else records.delete(change.id);
    }
  };
  for(const cell of graph.sourceCells)
    if(cell.provenance!=="authored"||cell.sourceIds.length!==1||
      cell.sourceIds[0]!==cell.id||cell.operationId!==null)
      errors.push("invalid-authored-origin:"+cell.id);
  let lastCheck=0;
  for(const event of graph.events){
    const check=event.checkIndex;
    if(check===undefined||!Number.isSafeInteger(check)||check<1||check>365||
      check<lastCheck||event.atHour!==check*24||
      (event.atMs!==undefined&&!Number.isSafeInteger(event.atMs)))
      errors.push("invalid-daily-chronology:"+event.id);
    lastCheck=check??lastCheck;
    const before=new Map(active);
    const creationIds=new Set(event.createdCellIds);
    if(creationIds.size!==event.createdCellIds.length||
      new Set(event.removedCellIds).size!==event.removedCellIds.length)
      errors.push("duplicate-event-identity:"+event.id);
    const archived=event.createdCells??[];
    if(["elongate","extend","branch","bud"].includes(event.kind)){
      try{verifyAxialSupport([...before.values()],[...links.values()],archived,1);}catch{errors.push("unsupported-axial-material:"+event.id);}
    }
    let strainedVoids:readonly string[]|undefined;
    if(event.physical?.strain){
      try{strainedVoids=verifyCoordinatedStrain(before,archived,event.removedCellIds,event.physical,event.kind,new Set(protectedVoids));}
      catch{errors.push("invalid-coordinated-strain:"+event.id);}
    }
    if(event.physical?.system==="iterative"&&event.kind==="expand"&&event.physical.relocations.length){
      try{verifyAdvancingFront(graph.sourceCells,before,archived,event.removedCellIds,event.physical);}
      catch{errors.push("invalid-advancing-material-front:"+event.id);}
    }
    const currentVoids=strainedVoids??protectedVoids;
    const originalOverlay=(c:MaterialCell)=>c.sourceIds.every(id=>{
      const original=sources.get(id);return !!original&&(birth?.protectedVoids??[]).includes(pos(original))&&original.color===c.color;
    });
    const archive=new Map(archived.map(c=>[c.id,c]));
    if(!same(archived.map(c=>c.id),event.createdCellIds)||
      archive.size!==archived.length)
      errors.push("creation-archive-mismatch:"+event.id);
    // Creation FIRST, before relocation and deletion, as physical receipts
    // are sequenced. New cells must touch a live parent at creation time.
    for(const id of event.createdCellIds){
      const cell=archive.get(id);
      const parents=cell?.parentCellIds.map(p=>active.get(p));
      const inherited=[...new Set((parents??[]).flatMap(p=>p?.sourceIds??[]))].sort();
      if(!cell||active.has(id)||createdEver.has(id)||
        cell.provenance!=="generated"||
        !cell.operationId||!cell.sourceIds.length||
        (cell.operationId!==event.id&&cell.operationId!==event.physical?.operation.id)||
        cell.sourceIds.some(sourceId=>!sourceIds.has(sourceId))||
        !cell.parentCellIds.length||parents?.some(p=>!p)||
        !same([...cell.sourceIds].sort(),inherited)||
        !parents?.some(p=>p&&Math.max(Math.abs(cell.x-p.x),Math.abs(cell.y-p.y))<=1)||
        !Number.isSafeInteger(cell.x)||!Number.isSafeInteger(cell.y)||
        cell.x<0||cell.x>=64||cell.y<0||cell.y>=64)
        errors.push("invalid-material-creation:"+id);
      if(cell&&currentVoids.includes(pos(cell))&&!originalOverlay(cell))errors.push("creation-in-protected-void:"+id);
      if(cell)active.set(id,cell);
      createdEver.add(id);
    }
    const relocations=event.physical?.relocations??[];
    if(new Set(relocations.map(r=>r.cellId)).size!==relocations.length)
      errors.push("duplicated-relocation:"+event.id);
    for(const movement of relocations){
      const prior=before.get(movement.cellId);
      const dest=movement.to;
      const path=movement.path;
      const transport=["redistribute","repattern"].includes(event.kind)&&!!prior&&!!path&&
        path.length>=2&&path.length<=(event.kind==="repattern"?65:25)&&
        same(path[0],movement.from)&&same(path.at(-1),dest)&&
        path.every((p,i)=>Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)&&
          p.x>=0&&p.x<64&&p.y>=0&&p.y<64&&p.z===prior.z&&
          (i===0||Math.max(Math.abs(p.x-path[i-1].x),Math.abs(p.y-path[i-1].y))===1)&&
          (i===path.length-1||[...before.values()].some(c=>c.tissueId===prior.tissueId&&pos(c)===pos(p))));
      if(!prior||!same(movement.from,{
        x:prior.x,y:prior.y,...(prior.z===undefined?{}:{z:prior.z})})||
        movement.operationId!==event.physical?.operation.id||
        movement.checkIndex!==event.checkIndex||
        (movement.atMs!==undefined&&movement.atMs!==event.atMs)||
        !Number.isSafeInteger(dest.x)||!Number.isSafeInteger(dest.y)||
        dest.x<0||dest.x>=64||dest.y<0||dest.y>=64||
        dest.z!==prior.z||
        (currentVoids.includes(pos(dest))&&!!prior&&!originalOverlay(prior))||
        (event.physical?.strain?!strainedVoids:["redistribute","repattern"].includes(event.kind)?!transport:
          Math.max(Math.abs(dest.x-prior.x),Math.abs(dest.y-prior.y))!==1))
        errors.push("invalid-relocation:"+movement.cellId);
      else active.set(prior.id,{...prior,x:dest.x,y:dest.y});
    }
    for(const id of event.removedCellIds){
      if(!active.has(id)||relocations.some(r=>r.cellId===id))
        errors.push("unrecorded-removal:"+id);
      active.delete(id);
    }
    if(event.physical){
      applyChanges(tissues,event.physical.tissues,"tissue");
      applyChanges(sites,event.physical.sites,"site");
      applyChanges(links,event.physical.links,"link");
      if(event.physical.protectedVoids){
        const change=event.physical.protectedVoids;
        const occupied=new Set([...active.values()].map(pos)),outside=new Set<string>();
        const queue:{x:number;y:number}[]=[];
        for(let a=0;a<64;a++)queue.push({x:a,y:0},{x:a,y:63},{x:0,y:a},{x:63,y:a});
        for(let a=0;a<queue.length;a++){
          const p=queue[a],at=pos(p);
          if(p.x<0||p.x>=64||p.y<0||p.y>=64||outside.has(at)||occupied.has(at))continue;
          outside.add(at);for(const [dx,dy] of cardinal)queue.push({x:p.x+dx,y:p.y+dy});
        }
        const expected=strainedVoids??protectedVoids.filter(k=>!outside.has(k));
        if(event.kind!=="repattern"||!same(change.before,protectedVoids)||!same(change.after,expected))
          errors.push("unauthorized-protected-void-change:"+event.id);
        protectedVoids=[...change.after];
      }
    }
    try{continuous([...active.values()],{links:[...links.values()],protectedVoids});}catch{errors.push("lost-drawn-neighborhood:"+event.id);}
  }
  const live=new Map(graph.cells.map(c=>[c.id,c]));
  if(active.size!==live.size)errors.push("physical-inventory-count");
  for(const [id,cell] of live){
    if(!same(active.get(id),cell))errors.push("unauthorized-final-material:"+id);
    if(cell.sourceIds.some(sourceId=>!sources.has(sourceId)))
      errors.push("unknown-ancestry:"+id);
  }
  if(birth){
    for(const [name,expected,current] of [
      ["tissues",tissues,graph.tissues],["sites",sites,graph.sites],["links",links,graph.links],
    ] as const){
      if(expected.size!==current.length)errors.push("structural-count:"+name);
      for(const entity of current)if(!same(expected.get(entity.id),entity))
        errors.push("unauthorized-"+name+":"+entity.id);
    }
    if(!same([...protectedVoids].sort(),[...graph.protectedVoids].sort()))
      errors.push("unauthorized-protected-void-change");
  }
  return {valid:errors.length===0,errors};
}
export type Qualification=Readonly<{
  status:"pass"|"fail"|"null"|"unresolved";
  reasons:readonly string[];change:MaterialChangeMetrics;proof:PhysicalProof;
}>;
/**
 * Predeclared, production-agnostic thresholds:
 * 8 changed cells exceed a 2x2 cosmetic patch; broad>=0.20 is below a 5x5
 * deposited square's 9/25=0.36 thick interior, while a one-cell filament is 0.
 * terminal<=0.70 requires >=30% nonterminal creation; >=0.15 changed union
 * excludes single-pixel perturbations on ordinary >=9-cell eligible bodies.
 * Cohort >=30% independently broad lives guards against one lucky outcome;
 * requiring 2 topological/remodeling/proportion witnesses prevents a wholly
 * linear growth family from being certified. Eligibility MUST be established
 * independently before enforcing cohort coverage against production.
 */
export const EXPRESSIVENESS_GATE=Object.freeze({
  minCreatedForEligible:8,minBroadFraction:0.20,
  maxTerminalFraction:0.70,minStructuralChange:0.15,
  minIndependentBreadthExamples:2,minEligibleLives:6,
  minBreadthRate:0.30,minTopologicalLives:2,minRemodeledLives:2,
  minProportionalLives:2,minSpecializedLives:2,
  minSeedSensitiveSources:6,minCareSensitiveSources:6,
});
export function qualifyPhysicalChange(
  birth:MaterialGraph,adult:MaterialGraph,
  eligibility:"eligible"|"constrained"|"unknown",
):Qualification{
  const change=measureChange(birth,adult),proof=provePhysicalMaterial(adult),reasons:string[]=[];
  if(!proof.valid)return{status:"fail",reasons:proof.errors,change,proof};
  if(eligibility==="unknown")return{status:"unresolved",reasons:["Eligibility not established"],change,proof};
  if(eligibility==="constrained"&&change.created===0&&change.removed===0&&change.relocated===0)
    return{status:"null",reasons:[],change,proof};
  if(eligibility==="eligible"&&change.created===0&&change.removed===0&&change.relocated===0)
    return{status:"fail",reasons:["Eligible organism remained unchanged"],change,proof};
  if(eligibility==="constrained")
    return{status:"unresolved",reasons:["Constrained organism changed; eligibility for breadth is not established"],change,proof};
  if(change.created<EXPRESSIVENESS_GATE.minCreatedForEligible)
    reasons.push("Insufficient demonstrable material creation");
  if(change.broadFraction<EXPRESSIVENESS_GATE.minBroadFraction)
    reasons.push("Tendril-dominant: insufficient broad deposition");
  if(change.terminalFraction>EXPRESSIVENESS_GATE.maxTerminalFraction)
    reasons.push("Tendril-dominant: excessive terminal extension");
  if(change.structuralChange<EXPRESSIVENESS_GATE.minStructuralChange)
    reasons.push("Insufficient whole-body structural change");
  return{status:reasons.length?"fail":"pass",reasons,change,proof};
}
/** Delta vectors remove between-drawing birth differences from comparisons. */
export function compareCounterfactuals(
  first:readonly MaterialGraph[],second:readonly MaterialGraph[],
):Readonly<{checkpointChanges:readonly number[];divergentChecks:number}>{
  if(first.length!==second.length||first.length<2)throw new RangeError("Aligned birth and daily checkpoints required");
  const a=first.map((g,i)=>i?measureChange(first[0],g):null);
  const b=second.map((g,i)=>i?measureChange(second[0],g):null);
  const deltas=a.map((x,i)=>i?Math.abs(x!.structuralChange-b[i]!.structuralChange):0);
  return {checkpointChanges:deltas,divergentChecks:deltas.filter(n=>n>0).length};
}

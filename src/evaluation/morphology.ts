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
  distribution:readonly [number,number,number,number];
  sourceResorbed:number;sourceRelocated:number;
  newTissues:number;changedAttachments:number;
  componentDelta:number;holeDelta:number;topologyChanged:boolean;
  structuralChange:number;regionalAreaRatios:Readonly<Record<string,number>>;
}>;
const cardinal=[[1,0],[-1,0],[0,1],[0,-1]] as const;
const diagonal=[...cardinal,[1,1],[1,-1],[-1,1],[-1,-1]] as const;
const k=(x:number,y:number)=>x+","+y;
const pos=(p:{x:number;y:number})=>k(p.x,p.y);
const MAX=4096;
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
  const thin=new Set([...occupied].filter(at=>depth.get(at)===1));
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
  return {created:created.length,removed:removed.length,relocated:moved.length,
    terminalExtension:terminal,lateralExpansion:lateral,broadDeposition:broad,otherDeposition:other,
    terminalFraction:created.length?terminal/created.length:0,
    broadFraction:created.length?broad/created.length:0,
    distribution:sectors(created,bound(after.cells)),
    sourceResorbed:removed.filter(c=>c.provenance==="authored").length,
    sourceRelocated:moved.filter(c=>c.provenance==="authored").length,
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
  const source=new Map(graph.sourceCells.map(c=>[c.id,c]));
  let state=new Map(graph.sourceCells.map(c=>[c.id,c]));
  const birthIds=new Set(source.keys());
  for(const c of graph.sourceCells)if(c.provenance!=="authored"||
    c.sourceIds.length!==1||c.sourceIds[0]!==c.id||c.operationId!==null)
    errors.push("invalid-authored-origin:"+c.id);
  let lastCheck=0;
  const createdEver=new Set(birthIds);
  for(const event of graph.events){
    if(!Number.isSafeInteger(event.checkIndex)||event.checkIndex<1||event.checkIndex>365||
      event.checkIndex<lastCheck||event.atHour!==event.checkIndex*24)
      errors.push("invalid-daily-chronology:"+event.id);
    lastCheck=event.checkIndex??lastCheck;
    const archive=new Map((event.createdCells??[]).map(c=>[c.id,c]));
    for(const id of event.removedCellIds){
      if(!state.delete(id))errors.push("unrecorded-removal:"+id);
    }
    for(const movement of event.physical?.relocations??[]){
      const prior=state.get(movement.cellId);
      if(!prior||prior.x!==movement.from.x||prior.y!==movement.from.y||
        movement.operationId!==event.physical?.operation.id||
        movement.checkIndex!==event.checkIndex)
        errors.push("invalid-relocation:"+movement.cellId);
      else state.set(prior.id,{...prior,x:movement.to.x,y:movement.to.y,
        ...(movement.to.z===undefined?{}:{z:movement.to.z})});
    }
    for(const id of event.createdCellIds){
      const cell=archive.get(id);
      if(!cell||state.has(id)||createdEver.has(id)||cell.provenance!=="generated"||
        !cell.operationId||!cell.sourceIds.length||
        cell.sourceIds.some(sourceId=>!birthIds.has(sourceId))||
        !cell.parentCellIds.length||cell.parentCellIds.some(parent=>!createdEver.has(parent)))
        errors.push("invalid-material-creation:"+id);
      if(cell)state.set(id,cell);
      createdEver.add(id);
    }
    if(archive.size!==event.createdCellIds.length)errors.push("creation-archive-mismatch:"+event.id);
  }
  const live=new Map(graph.cells.map(c=>[c.id,c]));
  if(state.size!==live.size)errors.push("physical-inventory-count");
  for(const [id,c] of live){
    const reconstructed=state.get(id);
    if(!reconstructed||JSON.stringify(reconstructed)!==JSON.stringify(c))
      errors.push("unauthorized-final-material:"+id);
    if(c.sourceIds.some(s=>!birthIds.has(s)))errors.push("unknown-ancestry:"+id);
  }
  return {valid:errors.length===0,errors};
}
export type Qualification=Readonly<{
  status:"pass"|"fail"|"null"|"unresolved";
  reasons:readonly string[];change:MaterialChangeMetrics;proof:PhysicalProof;
}>;
/** Predeclared adversarial discrimination, not thresholds tuned to production. */
export const EXPRESSIVENESS_GATE=Object.freeze({
  minCreatedForEligible:8,minBroadFraction:0.20,
  maxTerminalFraction:0.70,minStructuralChange:0.15,
  minIndependentBreadthExamples:2,minEligibleLives:6,
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

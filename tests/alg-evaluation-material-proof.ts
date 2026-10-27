/**
 * Independent EVAL-002 material-evidence audit. This never calls the creator,
 * apply/step operations, or trusts a self-reported pass flag.
 *
 * Event ledger: initial active IDs are precisely sourceCells; traverse events
 * in supplied chronological order (same-time ties preserve array order).
 * Create requires a globally fresh ID and live parent at creation time.
 * Remove requires currently active matter. Final inventory must equal replay.
 * A child's source roots must agree with its parent and creation event; its
 * operation ID must identify that event. A source ID is not an event witness.
 *
 * Render witness: exact image metadata must identify an ACTIVE physical cell
 * and match its source/parents/operator. Projected material quad is in
 * world/pose coordinates, transformed by optional camera, and raster tested
 * separately. Unaccounted visible pixels conservatively yield "unavailable"
 * (legitimate cosmetic overlays/occlusion cannot certify material ownership).
 * Neither matching pigment nor raw unposed cell coordinates verify ownership.
 *
 * This audits consistency of submitted immutable witnesses. Without an
 * independently replayed seed/care/operator history no cryptographic claim
 * that an arbitrary submitted event *actually happened* is possible.
 */
import type { MaterialGraph, MaterialCell } from "../src/development";
import type { Point } from "../src/simulation/model";

export type RenderedInkPoint = Readonly<{x:number;y:number;
  materialCellId?:string; materialSourceIds?:readonly string[];
  materialParentCellIds?:readonly string[];
  materialOperationId?:string|null;
}>;
export type MaterialProjection = Readonly<{
  cellId:string;
  /** Four transported *pre-camera* material cell corners, counterclockwise. */
  quad:readonly Point[];
}>;
export type RenderWitness = Readonly<{
  projections:readonly MaterialProjection[];
  /** Camera transformation applied after pose (not to graph cell coords). */
  camera?:Readonly<{scale:number;offset:Readonly<Point>}>;
}>;
export type PhysicalEvidence = Readonly<{
  status:"verified"|"invalid"|"unavailable";
  sourceFingerprint:string|null;
  sourceAncestrySignature:string|null;
  authoredCells:number;generatedCells:number;
  attachmentLinks:number;fusionLinks:number;tissues:number;
  representedOriginals:number;
  errors:readonly string[];
}>;
export type RenderEvidence = Readonly<{
  status:"verified"|"invalid"|"unavailable";
  identifiedPixels:number;totalPixels:number;
  projectedPixels:number;
  errors:readonly string[];
}>;
const key=(p:Pick<Point,"x"|"y">)=>p.x+","+p.y;
const identical=(a:readonly string[],b:readonly string[]) =>
  a.length===b.length&&a.every((v,i)=>v===b[i]);
const signature=(g:MaterialGraph)=>g.sourceCells.map(c=>
  c.id+"@"+c.tissueId+"@"+c.x+","+c.y+"="+c.sourceIds.slice().sort().join("/"))
  .sort().join("|");
const error=(message:string,id:string)=>message+":"+id;
const sameRoots=(a:readonly string[],b:readonly string[])=>
  identical([...new Set(a)].sort(),[...new Set(b)].sort());
const SUPPORTED_CREATION_KINDS=new Set([
  "elongate","branch","bud","expand","remodel","extend","split",
  "thicken","tip-extension","appendage-extension","surface-expansion",
]);

export function auditPhysicalEvidence(graph?:MaterialGraph,cutoffHour=Infinity):PhysicalEvidence{
  if(!graph)return {status:"unavailable",sourceFingerprint:null,
    sourceAncestrySignature:null,authoredCells:0,generatedCells:0,
    attachmentLinks:0,fusionLinks:0,tissues:0,representedOriginals:0,
    errors:["material-graph-unavailable"]};
  const errors:string[]=[];
  const sources=new Map(graph.sourceCells.map(c=>[c.id,c]));
  const active=new Map(graph.cells.map(c=>[c.id,c]));
  const tissues=new Map(graph.tissues.map(t=>[t.id,t]));
  const birthPositions=new Map(graph.sourceCells.map(c=>[c.id,key(c)]));
  const validCutoff=Number.isFinite(cutoffHour)?cutoffHour>=0:cutoffHour===Infinity;
  if(!validCutoff)errors.push("invalid-query-cutoff");
  if(sources.size!==graph.sourceCells.length)errors.push("duplicate-source-cell-id");
  if(active.size!==graph.cells.length)errors.push("duplicate-material-cell-id");
  if(tissues.size!==graph.tissues.length)errors.push("duplicate-tissue-id");
  if(!graph.sourceFingerprint)errors.push("missing-birth-fingerprint");
  for(const tissue of graph.tissues){
    if(tissue.sourceCellIds.some(id=>!sources.has(id)))
      errors.push(error("tissue-with-unknown-birth-cell",tissue.id));
    if(tissue.parentId&&!tissues.has(tissue.parentId))
      errors.push(error("tissue-with-missing-parent",tissue.id));
  }
  const birth=new Map<string,{roots:readonly string[];born:number}>();
  for(const c of graph.sourceCells){
    if(c.provenance!=="authored"||!sameRoots(c.sourceIds,[c.id])||
       c.parentCellIds.length!==0||c.operationId!==null)
      errors.push(error("invalid-authored-source",c.id));
    if(!Number.isSafeInteger(c.x)||!Number.isSafeInteger(c.y))
      errors.push(error("invalid-original-lattice",c.id));
    birth.set(c.id,{roots:[c.id],born:0});
  }
  const living=new Map(birth);
  const creators=new Map<string,{eventId:string;kind:string;atHour:number;roots:readonly string[];parents:readonly string[]}>();
  const removed=new Set<string>(),eventIds=new Set<string>();
  let last=-Infinity;
  for(const e of graph.events){
    if(!e.id||eventIds.has(e.id))errors.push(error("duplicate-or-blank-event",e.id));
    eventIds.add(e.id);
    if(!Number.isFinite(e.atHour)||e.atHour<0||e.atHour<last-1e-10||
      e.atHour>cutoffHour+1e-10)errors.push(error("event-clock-out-of-order-or-future",e.id));
    last=e.atHour;
    if(new Set(e.createdCellIds).size!==e.createdCellIds.length||
       new Set(e.removedCellIds).size!==e.removedCellIds.length||
       new Set(e.sourceCellIds).size!==e.sourceCellIds.length)
      errors.push(error("duplicate-event-inventory",e.id));
    if(e.sourceCellIds.some(id=>!sources.has(id)))
      errors.push(error("unbacked-event-source",e.id));
    if(e.createdCellIds.length&&!SUPPORTED_CREATION_KINDS.has(e.kind))
      errors.push(error("unsupported-creation-operator",e.id));
    const preEvent=new Map(living);
    for(const id of e.removedCellIds){
      if(!preEvent.has(id))errors.push(error("removed-nonlive-material",id));
      if(e.createdCellIds.includes(id))errors.push(error("same-event-create-and-remove",id));
    }
    for(const id of e.createdCellIds){
      if(birth.has(id)||creators.has(id)||preEvent.has(id))
        errors.push(error("recreated-or-resurrected-material",id));
      const now=active.get(id);
      if(now&&now.provenance!=="generated")
        errors.push(error("event-creates-authored-material",id));
      const ancestry=now?.sourceIds??e.sourceCellIds;
      if(!ancestry.length||ancestry.some(root=>!sources.has(root))||
         !ancestry.every(root=>e.sourceCellIds.includes(root)))
        errors.push(error("creation-ancestry-not-in-event",id));
      const operation=now?.operationId;
      if(now && !(operation&&(e.id===operation||e.id.startsWith(operation+"/unit/"))))
        errors.push(error("creation-operation-mismatch",id));
      if(now){
        if(!now.parentCellIds.length)errors.push(error("generated-without-parent",id));
        for(const parentId of now.parentCellIds){
          const parent=preEvent.get(parentId);
          if(!parent)errors.push(error("parent-not-alive-at-creation",id));
          else if(!sameRoots(parent.roots,now.sourceIds))
            errors.push(error("parent-source-mismatch",id));
          if(parentId===id)errors.push(error("self-parent",id));
          if(parent?.born!==undefined&&parent.born>e.atHour)
            errors.push(error("parent-from-future",id));
        }
      }
      creators.set(id,{eventId:e.id,kind:e.kind,atHour:e.atHour,roots:ancestry,
        parents:now?.parentCellIds??[]});
    }
    for(const id of e.removedCellIds){living.delete(id);removed.add(id);}
    for(const id of e.createdCellIds){
      living.set(id,{roots:creators.get(id)?.roots??[],born:e.atHour});
    }
  }
  if(living.size!==active.size||[...active.keys()].some(id=>!living.has(id)))
    errors.push("event-ledger-active-inventory-mismatch");
  if(graph.cells.length>graph.sourceCells.length+4096)
    errors.push("material-growth-budget-exceeded");
  const occupancy=new Map<string,string[]>();
  const represented=new Set<string>();
  for(const c of graph.cells){
    if(!tissues.has(c.tissueId))errors.push(error("unknown-tissue",c.id));
    if(!Number.isSafeInteger(c.x)||!Number.isSafeInteger(c.y)||c.x<0||c.y<0||
       c.x>=64||c.y>=64)errors.push(error("invalid-cell-position",c.id));
    if(graph.protectedVoids.includes(key(c)))errors.push(error("protected-void-filled",c.id));
    if(!c.sourceIds.length||c.sourceIds.some(id=>!sources.has(id)))
      errors.push(error("orphan-source-ancestry",c.id));
    if(new Set(c.sourceIds).size!==c.sourceIds.length)
      errors.push(error("repeated-source-ancestry",c.id));
    if(!sameRoots(c.sourceIds,living.get(c.id)?.roots??[]))
      errors.push(error("active-cell-source-ledger-mismatch",c.id));
    if(removed.has(c.id))errors.push(error("resurrected-material",c.id));
    const co=creators.get(c.id);
    if(c.provenance==="generated"){
      if(!co)errors.push(error("generated-without-chronological-event",c.id));
      else if(!c.operationId||
         !(co.eventId===c.operationId||co.eventId.startsWith(c.operationId+"/unit/")))
        errors.push(error("generated-without-matching-operation",c.id));
      // A fabricated yet correctly labeled deposition cannot jump arbitrarily
      // far from its physical parent. Defer this spatial check when subsequent
      // remodeling makes creation-time positions unknowable from one snapshot.
      if(co&&["elongate","branch","bud","expand","extend"].includes(co.kind)){
        const lateReposition=graph.events.some(e=>e.atHour>=co.atHour &&
          e.id!==co.eventId &&
          ["remodel","translate","rotate","reattach","articulate"].includes(e.kind));
        if(!lateReposition){
          const parents=c.parentCellIds.map(id=>active.get(id)).filter(
            (v):v is MaterialCell=>v!==undefined);
          if(parents.length&&parents.every(parent=>
             Math.max(Math.abs(parent.x-c.x),Math.abs(parent.y-c.y))>1))
            errors.push(error("generated-nonadjacent-to-physical-parent",c.id));
        }
      }
    }else if(c.provenance==="authored"){
      if(!sources.has(c.id)||c.operationId!==null||c.parentCellIds.length||
         !sameRoots(c.sourceIds,[c.id]))
        errors.push(error("invalid-live-authored-cell",c.id));
    }else errors.push(error("unknown-material-provenance",c.id));
    const coLocated=occupancy.get(key(c))??[];
    for(const id of coLocated)if(birthPositions.get(id)!==key(c)||
       birthPositions.get(c.id)!==key(c))
      errors.push(error("unrecorded-material-overlap",c.id));
    coLocated.push(c.id);occupancy.set(key(c),coLocated);
    for(const id of c.sourceIds)if(sources.has(id))represented.add(id);
  }
  for(const link of graph.links){
    const a=link.fromCellId?active.get(link.fromCellId):undefined;
    const b=link.toCellId?active.get(link.toCellId):undefined;
    if(!tissues.has(link.fromTissueId)||!tissues.has(link.toTissueId)||
       (link.fromCellId!==null&&(!a||a.tissueId!==link.fromTissueId))||
       (link.toCellId!==null&&(!b||b.tissueId!==link.toTissueId))||
       (a&&b&&(a.x-b.x)**2+(a.y-b.y)**2>8))
      errors.push(error("invalid-material-link",link.id));
  }
  for(const site of graph.sites){
    if(!tissues.has(site.tissueId)||!active.has(site.rootCellId)||
       active.get(site.rootCellId)?.tissueId!==site.tissueId)
      errors.push(error("invalid-active-site",site.id));
  }
  return {status:errors.length?"invalid":"verified",
    sourceFingerprint:graph.sourceFingerprint,
    sourceAncestrySignature:signature(graph),authoredCells:graph.sourceCells.length,
    generatedCells:graph.cells.filter(c=>c.provenance==="generated").length,
    attachmentLinks:graph.links.filter(l=>l.kind==="attachment").length,
    fusionLinks:graph.links.filter(l=>l.kind==="fusion").length,
    tissues:graph.tissues.length,representedOriginals:represented.size,errors};
}

/**
 * A proper projection may freely translate, rotate, articulate and zoom.
 * All geometry is checked in the post-projection SCREEN frame. The evaluator
 * never demands raw graph x/y equals the pixel's final screen position.
 */
export function auditRenderedOwnership(
 pixels:readonly RenderedInkPoint[],
 graph?:MaterialGraph,
 witness?:RenderWitness,
):RenderEvidence{
 const errors:string[]=[];
 const missing={status:"unavailable" as const,identifiedPixels:0,
   totalPixels:pixels.length,projectedPixels:0,errors:["material-projection-unavailable"]};
 if(!graph||!witness)return missing;
 const cellById=new Map(graph.cells.map(c=>[c.id,c]));
 const camera=witness.camera??{scale:1,offset:{x:0,y:0}};
 if(!Number.isFinite(camera.scale)||camera.scale<=0||
    !Number.isFinite(camera.offset.x)||!Number.isFinite(camera.offset.y))
   errors.push("invalid-projection-camera");
 const transform=(p:Point)=>({
   x:p.x*camera.scale+camera.offset.x,
   y:p.y*camera.scale+camera.offset.y,
 });
 const projected=new Map<string,Point[][]>();
 for(const item of witness.projections){
   if(!cellById.has(item.cellId))errors.push(error("projected-nonlive-cell",item.cellId));
   if(item.quad.length!==4||item.quad.some(p=>
      !Number.isFinite(p.x)||!Number.isFinite(p.y)))
     errors.push(error("invalid-projection-quad",item.cellId));
   else{
     const q=item.quad.map(transform);
     projected.set(item.cellId,[...(projected.get(item.cellId)??[]),q]);
   }
 }
 const cross=(a:Point,b:Point,p:Point)=>
   (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
 const inside=(a:Point,b:Point,c:Point,p:Point)=>{
   if(Math.abs(cross(a,b,c))<1e-9)return false;
   const sides=[cross(a,b,p),cross(b,c,p),cross(c,a,p)];
   return sides.every(x=>x>=-1e-7)||sides.every(x=>x<=1e-7);
 };
 const covered=(q:readonly Point[],p:Point)=>
   inside(q[0],q[1],q[2],p)||inside(q[0],q[2],q[3],p)||
   // Subpixel cells legitimately rasterize as their transported center.
   (Math.abs(cross(q[0],q[1],q[2]))<1e-9&&
      Math.round(q.reduce((s,c)=>s+c.x,0)/4)===p.x&&
      Math.round(q.reduce((s,c)=>s+c.y,0)/4)===p.y);
 let identified=0,projectedPixels=0;
 for(const p of pixels){
   const id=p.materialCellId;
   if(!id)continue; // Some genuine pigment and facial overlays carry no ID.
   identified++;
   const cell=cellById.get(id);
   if(!cell){errors.push(error("rendered-nonlive-material",id));continue;}
   if(!p.materialSourceIds||!sameRoots(p.materialSourceIds,cell.sourceIds)||
      !p.materialParentCellIds||!identical(p.materialParentCellIds,cell.parentCellIds)||
      p.materialOperationId!==cell.operationId)
     errors.push(error("rendered-ancestry-mismatch",id));
   const quads=projected.get(id);
   if(!quads?.length)errors.push(error("rendered-without-material-projection",id));
   else if(!quads.some(q=>covered(q,p)))
     errors.push(error("rendered-outside-projected-material",id));
   else projectedPixels++;
 }
 if(errors.length)return {status:"invalid",identifiedPixels:identified,
   totalPixels:pixels.length,projectedPixels,errors};
 // A potentially legitimate composite with cosmetic/surface pixels needs an
 // explicit surface-carrier proof not yet provided by the live runtime.
 // Never award pass from even one pretty or incorrectly sourced pixel.
 if(identified!==pixels.length||!pixels.length)
   return {status:"unavailable",identifiedPixels:identified,
     totalPixels:pixels.length,projectedPixels,
     errors:["unattributed-visible-pixels"]};
 return {status:"verified",identifiedPixels:identified,
   totalPixels:pixels.length,projectedPixels,errors:[]};
}

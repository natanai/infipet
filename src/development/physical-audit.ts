/**
 * Daily physical ledger verifier.
 *
 * Inputs: authored source cells/topology, immutable creation/removal events,
 * one per-opportunity physical reconciliation, exact hatch time and check limit.
 * Output: throws at the first irreconcilable material transition, otherwise void.
 *
 * Invariant: live cells and topology are the independent fold of the BIRTH
 * state and the chronological event ledger. No final graph cell, link, site
 * or tissue may provide its own missing historical preimage.
 * Relocation requires a named accepted remodel/translate operation in the
 * same opportunity and may not enter a source-protected void. Bounds [0,63].
 */
import type {MaterialCell,MaterialGraph,MaterialTissue,MaterialSite,MaterialLink,MaterialChange} from "./material-graph";
import {dailyCheckTime,DAILY_HOURS,FINAL_ANATOMICAL_CHECK} from "./daily-contract";

type Identified={id:string};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const canonical=<T extends Identified>(x:Iterable<T>)=>[...x].sort((a,b)=>a.id.localeCompare(b.id));
const xy=(c:{x:number;y:number})=>c.x+","+c.y;
const bounds=(p:{x:number;y:number})=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<64&&p.y>=0&&p.y<64;
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>(a.x-b.x)**2+(a.y-b.y)**2;
const adjacent=(a:{x:number;y:number},b:{x:number;y:number})=>distance(a,b)<=2;
function applyChanges<T extends Identified>(target:Map<string,T>,edits:readonly MaterialChange<T>[],kind:string){
  const touched=new Set<string>();
  for(const edit of edits){
    if(!edit||(!edit.before&&!edit.after))throw new TypeError("Empty "+kind+" edit");
    const id=(edit.before??edit.after)!.id;
    if(touched.has(id)||edit.before&&edit.after&&edit.before.id!==edit.after.id||
       !same(target.get(id)??null,edit.before))throw new TypeError("Forged "+kind+" before-image");
    touched.add(id);
    if(edit.after)target.set(id,edit.after);
    else target.delete(id);
  }
}
function connected(cells:readonly MaterialCell[]):boolean {
  if(!cells.length)return true;
  const visited=new Set([cells[0].id]),queue=[cells[0]];
  for(let i=0;i<queue.length;i++)for(const cell of cells)
    if(!visited.has(cell.id)&&adjacent(queue[i],cell)){
      visited.add(cell.id);queue.push(cell);
    }
  return visited.size===cells.length;
}
function topologyIsPhysical(
  cells:Map<string,MaterialCell>,tissues:Map<string,MaterialTissue>,
  sites:Map<string,MaterialSite>,links:Map<string,MaterialLink>,
  voids:Set<string>,
) {
  for(const cell of cells.values())if(!bounds(cell)||!tissues.has(cell.tissueId)||
     (cell.provenance==="generated"&&voids.has(xy(cell))))
    throw new TypeError("Physical cell outside authorized tissue or protected void");
  for(const site of sites.values())if(!tissues.has(site.tissueId)||
      cells.get(site.rootCellId)?.tissueId!==site.tissueId||
      ![site.direction.x,site.direction.y].every(Number.isFinite))
    throw new TypeError("Invalid growth site ownership");
  for(const tissue of tissues.values()){
    if(tissue.parentId!==null&&!tissues.has(tissue.parentId))throw new TypeError("Lost tissue parent");
    for(const id of tissue.growthSiteIds)if(sites.get(id)?.tissueId!==tissue.id)
      throw new TypeError("Tissue site registry changed without matching transaction");
  }
  for(const link of links.values()){
    const a=link.fromCellId?cells.get(link.fromCellId):null;
    const b=link.toCellId?cells.get(link.toCellId):null;
    if(!tissues.has(link.fromTissueId)||!tissues.has(link.toTissueId)||
       (link.fromCellId!==null&&a?.tissueId!==link.fromTissueId)||
       (link.toCellId!==null&&b?.tissueId!==link.toTissueId)||
       (a&&b&&link.kind==="attachment"&&distance(a,b)>8))
      throw new TypeError("Invalid physical attachment endpoints");
  }
}
/** No comparison to the submitted graph is made until the full ledger fold ends. */
export function auditDailyPhysicalHistory(graph:MaterialGraph,hatchAtMs:number,throughCheck:number):void{
  dailyCheckTime(hatchAtMs,throughCheck);
  const birth=graph.birthStructure;
  if(!birth&&graph.events.length)throw new TypeError("Missing independent birth topology");
  const original=graph.sourceCells;
  const sources=new Map(original.map(c=>[c.id,c]));
  if(sources.size!==original.length||original.some(c=>c.provenance!=="authored"||
       c.parentCellIds.length>0||c.operationId!==null||!bounds(c)||
       !same(c.sourceIds,[c.id])))throw new TypeError("Invalid original source material");
  const active=new Map(sources),ever=new Set(sources.keys());
  const tissues=new Map((birth?.tissues??graph.tissues).map(x=>[x.id,x]));
  const sites=new Map((birth?.sites??graph.sites).map(x=>[x.id,x]));
  const links=new Map((birth?.links??graph.links).map(x=>[x.id,x]));
  const voids=new Set(graph.protectedVoids);
  if(tissues.size!==(birth?.tissues??graph.tissues).length||
      sites.size!==(birth?.sites??graph.sites).length||
      links.size!==(birth?.links??graph.links).length)
    throw new TypeError("Duplicate birth topology");
  topologyIsPhysical(active,tissues,sites,links,voids);
  const ids=new Set<string>();
  let previous=0, pending:string[]=[],reconciled=false;
  for(const event of graph.events){
    const k=event.checkIndex;
    if(k===undefined||!Number.isSafeInteger(k)||k<1||k>throughCheck||
       k>FINAL_ANATOMICAL_CHECK||event.atHour!==k*DAILY_HOURS||
       event.atMs!==dailyCheckTime(hatchAtMs,k)||k<previous)
      throw new RangeError("Material transaction is outside its daily opportunity");
    if(ids.has(event.id))throw new TypeError("Duplicate material transaction");
    ids.add(event.id);
    if(k!==previous){
      if(previous>0&&pending.length)throw new TypeError("Missing daily physical reconciliation");
      previous=k;reconciled=false;
    }
    if(event.kind==="daily-physical"){
      if(reconciled||!event.dailyPhysical||event.createdCellIds.length||
         event.removedCellIds.length||event.createdCells?.length||
         !pending.length||!same(event.dailyPhysical.authorizedEvents,pending))
        throw new TypeError("Forged daily physical transaction ownership");
      reconciled=true;
      const delta=event.dailyPhysical;
      const used=new Set<string>();
      const authorizations=graph.events.filter(e=>pending.includes(e.id));
      const allowed=authorizations.filter(e=>e.kind==="remodel"||e.kind==="translate");
      const byTissue=new Map<string,number>();
      for(const movement of delta.relocations){
        const prior=active.get(movement.cellId);
        const evidence=allowed.find(e=>e.id===movement.operationId);
        if(!prior||used.has(movement.cellId)||movement.checkIndex!==k||
           !evidence||!same(movement.from,{x:prior.x,y:prior.y})||
           !bounds(movement.to)||voids.has(xy(movement.to))||
           same(movement.from,movement.to))
          throw new TypeError("Unrecorded, forged or invalid relocation");
        const step=Math.max(Math.abs(movement.to.x-prior.x),Math.abs(movement.to.y-prior.y));
        // Multiple real same-day operators may each move a cell by one lattice step.
        if(step>allowed.length||!Number.isSafeInteger(step))throw new TypeError("Physically impossible relocation");
        used.add(movement.cellId);
        byTissue.set(prior.tissueId,(byTissue.get(prior.tissueId)??0)+1);
        active.set(prior.id,{...prior,x:movement.to.x,y:movement.to.y});
      }
      // New topology is an explicit finite transaction; every before-image
      // is independently checked against the state preceding this opportunity.
      const kinds=new Set(authorizations.map(e=>e.kind));
      for(const edit of delta.tissues){
        if(!edit.before&&!["branch","bud"].some(k=>kinds.has(k)))throw new TypeError("Unowned tissue birth");
        if(edit.before&&edit.after){
          const a=edit.before,b=edit.after;
          if(a.id!==b.id||a.sourcePartId!==b.sourcePartId||
             !same(a.sourceCellIds,b.sourceCellIds)||
             (a.rigidity!==b.rigidity&&!kinds.has("reinforce"))||
             (a.parentId!==b.parentId&&!kinds.has("reattach"))||
             (!same(a.growthSiteIds,b.growthSiteIds)&&
               !["resorb","branch","bud"].some(k=>kinds.has(k))))
            throw new TypeError("Unauthorized tissue mutation");
        }
      }
      for(const edit of delta.sites){
        if(!edit.before&&!["branch","bud"].some(k=>kinds.has(k))||
           edit.before&&!edit.after&&!kinds.has("resorb")||
           edit.before&&edit.after&&edit.before.tissueId!==edit.after.tissueId)
          throw new TypeError("Unauthorized site mutation");
      }
      for(const edit of delta.links){
        if(!edit.before&&!["branch","bud","fuse","reattach"].some(k=>kinds.has(k))||
           edit.before&&!edit.after&&!kinds.has("reattach"))
          throw new TypeError("Unauthorized attachment mutation");
      }
      applyChanges(tissues,delta.tissues,"tissue");
      applyChanges(sites,delta.sites,"site");
      applyChanges(links,delta.links,"link");
      topologyIsPhysical(active,tissues,sites,links,voids);
      for(const [tid,n] of byTissue){
        const group=[...active.values()].filter(c=>c.tissueId===tid);
        if(n&& !connected(group))throw new TypeError("Relocation severed a physical tissue");
      }
      pending=[];
      continue;
    }
    if(reconciled)throw new TypeError("Material operation after daily reconciliation");
    pending.push(event.id);
    if(event.dailyPhysical)throw new TypeError("Physical evidence attached to wrong operation");
    const made=event.createdCells??[];
    if(!same(made.map(c=>c.id),event.createdCellIds))
      throw new TypeError("Missing physical creation ownership");
    for(const cell of made){
      if(ever.has(cell.id)||!cell.operationId||cell.provenance!=="generated"||
         !cell.parentCellIds.length||cell.parentCellIds.some(id=>!active.has(id))||
         !cell.sourceIds.length||cell.sourceIds.some(id=>!sources.has(id))||
         !bounds(cell)||voids.has(xy(cell)))
        throw new TypeError("Invalid created material identity/position");
      const inherited=[...new Set(cell.parentCellIds.flatMap(id=>active.get(id)!.sourceIds))].sort();
      if(!same([...cell.sourceIds].sort(),inherited))throw new TypeError("Created material ancestry changed");
      active.set(cell.id,cell);ever.add(cell.id);
    }
    for(const id of event.removedCellIds){
      if(!active.has(id))throw new TypeError("Unrecorded removal");
      active.delete(id);
    }
  }
  if(pending.length)throw new TypeError("Unreconciled physical mutation");
  const cells=canonical(active.values()),actual=canonical(graph.cells);
  if(!same(cells,actual)||!same(canonical(tissues.values()),canonical(graph.tissues))||
     !same(canonical(sites.values()),canonical(graph.sites))||
     !same(canonical(links.values()),canonical(graph.links)))
    throw new TypeError("Final physical state differs from independent chronological reconstruction");
}

import {journalMaterialEvent} from "./material-journal";
/**
 * Composable DEV-004 remodeling transactions. This module never replays birth
 * anatomy or chooses the global order of heterogeneous development events.
 * The integration owner supplies one already-due proposal and the authoritative
 * MaterialGraph AFTER all earlier global operations (care, branching, etc.).
 *
 * For operator (t0,d,n,strength), genetic capacity c in [0,1]:
 *   N = floor(n * strength * c + 1e-10)
 *   step k (1<=k<=N) is due at t0+d*k/n.
 * A proposal is an atomic transaction, not a frame interpolant.
 * The caller orders ties with OTHER systems; our interval helper preserves the
 * supplied order for equal times, and rejects decreasing times.
 *
 * Rejects cause no graph mutation. The immutable attempt ledger separately
 * records each accepted/rejected decision (including absent materials). A
 * historical rejection is not silently retried. Immutable genotype signals are
 * read from the compiled program, never rewritten by anatomy or care.
 *
 * Numeric domain: integer lattice [0,63]^2; at most 3072 generated cells,
 * 64 operations, 12 steps each, clock [0,8192]. Chaotic steering is the
 * deterministic finite-torus cat-map (existing implementation, ±0.6 radians)
 * and is subordinate to occupancy, void, link and connectedness constraints.
 */
import { compareText, type Point } from "../simulation/model";
import type { MaterialCell, MaterialGraph, MaterialLink, MaterialSite } from "./material-graph";
import type { RemodelOperation, RemodelTransition, RemodelDeferral,
  LifetimeRemodelingProgram, MechanicalCapability, MechanicalRegion } from "./lifetime-remodeling";
import { mechanicalCapabilities, mechanicalRegions, REMODEL_LIMITS } from "./lifetime-remodeling";
import { chaoticTurn, validateMaterialChaos } from "./chaos";

export type RemodelingProposal = Readonly<{
  operation: RemodelOperation;
  unit: number;
  atHour: number;
}>;
export type RemodelingAttempt = Readonly<{
  id: string;
  atHour: number;
  status: "accepted" | "rejected";
  reason: string | null;
}>;
export type RemodelingHinge = Readonly<{
  tissueId: string;
  cellId: string;
  operationId: string;
}>;
export type RemodelingChronology = Readonly<{
  /** Exact order of all prior remodeling attempts. Unrelated graph events remain in graph. */
  attempts: readonly RemodelingAttempt[];
  hinges: readonly RemodelingHinge[];
}>;
export type RemodelingTransaction = Readonly<{
  graph: MaterialGraph;
  chronology: RemodelingChronology;
  attempt: RemodelingAttempt;
  transition: RemodelTransition | null;
  deferral: RemodelDeferral | null;
  /** Site roots or resolved world positions changed by this transaction. */
  siteChanges: readonly Readonly<{
    siteId: string; fromCellId: string; toCellId: string;
    from: Point; to: Point;
  }>[];
  capabilities: readonly MechanicalCapability[];
  regions: readonly MechanicalRegion[];
}>;
export type RemodelingInterval = Readonly<{
  graph: MaterialGraph;
  chronology: RemodelingChronology;
  transactions: readonly RemodelingTransaction[];
  capabilities: readonly MechanicalCapability[];
  regions: readonly MechanicalRegion[];
}>;
export const EMPTY_REMODELING_CHRONOLOGY: RemodelingChronology = {
  attempts: [], hinges: [],
};
const pointKey = (p: Point) => p.x + "," + p.y;
const bounded = (p: Point) =>
  Number.isInteger(p.x) && Number.isInteger(p.y) &&
  p.x >= 0 && p.y >= 0 &&
  p.x < REMODEL_LIMITS.world && p.y < REMODEL_LIMITS.world;
const near = (a: Point,b: Point) =>
  Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y)) <= 1;
const square = (a: Point,b: Point) =>
  (a.x-b.x)**2 + (a.y-b.y)**2;
const cmp = (a: MaterialCell,b: MaterialCell) => compareText(a.id,b.id);
const axial: readonly Point[] = [
  {x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1},
];
const uniqueSources = (xs: readonly MaterialCell[]) =>
  [...new Set(xs.flatMap(c=>c.sourceIds))].sort(compareText);
const clamp = (n:number) => Math.max(0,Math.min(1,n));
function direction(p: Point): Point {
  const norm=Math.hypot(p.x,p.y);
  return norm>1e-9 ? {x:p.x/norm,y:p.y/norm} : {x:0,y:-1};
}
function stepFor(p: Point): Point {
  const v=direction(p);
  const x=Math.round(v.x), y=Math.round(v.y);
  return x || y ? {x,y} : {x:0,y:-1};
}
function connected(group: readonly MaterialCell[]): boolean {
  if (!group.length) return false;
  const seen = new Set([group[0].id]), queue=[group[0]];
  for(let i=0;i<queue.length;i++)
    for(const c of group) if(!seen.has(c.id) && near(c,queue[i])) {
      seen.add(c.id);queue.push(c);
    }
  return seen.size === group.length;
}
function geneticCapacity(op: RemodelOperation, p: LifetimeRemodelingProgram): number {
  const c=p.signals.channels;
  switch(op.kind) {
    case "extend": return c.growth.elongation;
    case "reinforce": return c.support.rigidity;
    case "resorb": case "translate": return c.maturation.plasticity;
    case "reattach": case "articulate": return c.segmentation.boundaries;
  }
}
function checked(op: RemodelOperation): string | null {
  if (!op.id || !op.tissueId || !Number.isFinite(op.atHour) ||
    !Number.isFinite(op.durationHours) || op.atHour<0 ||
    op.durationHours<=0 || op.atHour+op.durationHours>REMODEL_LIMITS.maxAgeHours ||
    !Number.isInteger(op.units) || op.units<1 || op.units>REMODEL_LIMITS.maxUnits ||
    !Number.isFinite(op.strength) || op.strength<0 || op.strength>1 ||
    (op.direction && (!Number.isFinite(op.direction.x) ||
      !Number.isFinite(op.direction.y)))) return "invalid-operator";
  if(op.kind==="reattach" && !op.targetTissueId) return "missing-target-tissue";
  if(op.chaos) {
    try {validateMaterialChaos(op.chaos);}
    catch {return "invalid-chaos";}
  }
  return null;
}
function scheduled(op: RemodelOperation,unit:number,p:LifetimeRemodelingProgram): number|null {
  if(checked(op)||!Number.isInteger(unit)||unit<1) return null;
  const limit=Math.floor(op.units*op.strength*
    clamp(geneticCapacity(op,p))+1e-10);
  return unit<=limit ? op.atHour+op.durationHours*unit/op.units : null;
}

/**
 * Only schedules REMODELING proposals; not a global scheduler. Agent 9 may
 * interleave each proposal with care and iterative growth at equal timestamps.
 */
export function remodelingProposalsBetween(
  program: LifetimeRemodelingProgram, afterHour: number, throughHour: number,
  operations: readonly RemodelOperation[]=program.operations,
): readonly RemodelingProposal[] {
  if (![afterHour,throughHour].every(Number.isFinite) ||
      afterHour < 0 || throughHour < afterHour ||
      throughHour > REMODEL_LIMITS.maxAgeHours)
    throw new RangeError("Invalid remodeling chronological interval");
  if(operations.length>REMODEL_LIMITS.maxOperations)
    throw new RangeError("Remodeling operator limit exceeded");
  const ids=new Set<string>(), result:RemodelingProposal[]=[];
  for(const op of operations) {
    if(checked(op)) throw new RangeError("Invalid remodeling operation "+op.id);
    if(ids.has(op.id)) throw new RangeError("Duplicate remodeling operator "+op.id);
    ids.add(op.id);
    for(let k=1;k<=op.units;k++) {
      const atHour=scheduled(op,k,program);
      if(atHour!==null && atHour>afterHour && atHour<=throughHour)
        result.push({operation:op,unit:k,atHour});
    }
  }
  return result.sort((a,b)=>a.atHour-b.atHour ||
    compareText(a.operation.id,b.operation.id) || a.unit-b.unit);
}

/**
 * Checks an authoritative graph, not a hypothetical source-only replay.
 * Original source cells may overlap by authored choice; no newly generated
 * overlap or hidden discontinuity is accepted.
 */
function checkGraph(g:MaterialGraph):string|null {
  if(g.version!==1 || !g.sourceFingerprint) return "invalid-material-graph";
  const sources=new Set(g.sourceCells.map(c=>c.id));
  const active=new Map(g.cells.map(c=>[c.id,c]));
  if(active.size!==g.cells.length) return "duplicate-material-identity";
  const tissue=new Map(g.tissues.map(t=>[t.id,t]));
  if(tissue.size!==g.tissues.length) return "duplicate-tissue";
  const events=new Set(g.events.flatMap(e=>e.createdCellIds));
  const positions=new Map<string,MaterialCell>();
  let generated=0;
  for(const c of g.cells) {
    if(!bounded(c)) return "existing-outside-world";
    if(!tissue.has(c.tissueId)) return "unknown-active-tissue";
    if(!c.sourceIds.length||c.sourceIds.some(s=>!sources.has(s)))
      return "missing-source-ancestry";
    if(g.protectedVoids.includes(pointKey(c))) return "existing-protected-void";
    if(c.provenance==="generated") {
      generated++;
      if(!c.operationId||!events.has(c.id)||!c.parentCellIds.length)
        return "missing-generating-operation";
    }
    const k=pointKey(c), prior=positions.get(k);
    if(prior && (c.provenance==="generated" ||
      prior.provenance==="generated")) return "existing-material-overlap";
    positions.set(k,c);
  }
  if(generated>REMODEL_LIMITS.maxAdded) return "existing-material-limit";
  for(const t of g.tissues) {
    const group=g.cells.filter(c=>c.tissueId===t.id);
    if(group.length && !connected(group)) return "existing-tissue-disconnected";
    if(t.parentId && !tissue.has(t.parentId)) return "missing-parent-tissue";
    const visited=new Set<string>();
    let cursor: string|null=t.id;
    while(cursor) {
      if(visited.has(cursor)) return "parent-attachment-cycle";
      visited.add(cursor);
      cursor=tissue.get(cursor)?.parentId??null;
    }
  }
  for(const s of g.sites) {
    const root=active.get(s.rootCellId);
    if(!root || root.tissueId!==s.tissueId)
      return "dangling-growth-site";
  }
  for(const l of g.links) {
    const a=l.fromCellId ? active.get(l.fromCellId):undefined;
    const b=l.toCellId ? active.get(l.toCellId):undefined;
    if(!a||!b||a.tissueId!==l.fromTissueId ||
       b.tissueId!==l.toTissueId || square(a,b)>8)
      return "dangling-attachment";
  }
  return null;
}
/** Current 4-connected enclosed emptiness; fixed authored voids separately persist. */
function enclosed(cells:readonly MaterialCell[]):Set<string> {
  const occupied=new Set(cells.map(pointKey)), outside=new Set<string>(), q:Point[]=[];
  const add=(p:Point)=>{
    const key=pointKey(p);
    if(!bounded(p)||occupied.has(key)||outside.has(key)) return;
    outside.add(key);q.push(p);
  };
  for(let i=0;i<64;i++) {
    add({x:0,y:i});add({x:63,y:i});
    add({x:i,y:0});add({x:i,y:63});
  }
  for(let i=0;i<q.length;i++)
    for(const d of axial)add({x:q[i].x+d.x,y:q[i].y+d.y});
  const result=new Set<string>();
  for(let y=0;y<64;y++)for(let x=0;x<64;x++) {
    const key=x+","+y;
    if(!outside.has(key)&&!occupied.has(key))result.add(key);
  }
  return result;
}
function permittedDeposition(
  p:Point, tid:string,g:MaterialGraph, forbidden:ReadonlySet<string>,
):boolean {
  if(!bounded(p)||forbidden.has(pointKey(p)) ||
      g.cells.some(c=>pointKey(c)===pointKey(p)) ||
      g.cells.filter(c=>c.provenance==="generated").length>=REMODEL_LIMITS.maxAdded)
    return false;
  // Direct physical attachments authorize adjacency, but not arbitrary overlap.
  const linked=new Set(g.links.flatMap(l=>
    l.fromTissueId===tid?[l.toTissueId]:
    l.toTissueId===tid?[l.fromTissueId]:[]));
  return !g.cells.some(c=>c.tissueId!==tid && near(c,p) &&
    !linked.has(c.tissueId));
}
function newCell(id:string,op:RemodelOperation,p:Point,parent:MaterialCell):MaterialCell {
  return {
    id,tissueId:op.tissueId,x:p.x,y:p.y,color:parent.color,
    ...(parent.z===undefined?{}:{z:parent.z}),
    provenance:"generated",sourceIds:[...parent.sourceIds],
    parentCellIds:[parent.id],operationId:op.id,
  };
}
function mechanical(g:MaterialGraph, s:RemodelingChronology) {
  const pivots=new Map(s.hinges.map(h=>[h.tissueId,h.cellId]));
  return {capabilities:mechanicalCapabilities(g,pivots),
    regions:mechanicalRegions(g,pivots)};
}
export function remodelingMechanicalState(
  graph:MaterialGraph, chronology:RemodelingChronology=EMPTY_REMODELING_CHRONOLOGY,
):Readonly<{capabilities:readonly MechanicalCapability[];regions:readonly MechanicalRegion[]}> {
  return mechanical(graph,chronology);
}

/**
 * Atomic one-proposal transition. Source provenance, prior event order,
 * untouched tissues, site IDs and arbitrary previously generated branches are
 * all taken from graph, never from program.birth.
 *
 * Equal-time precedence is exactly call order. The chosen proposal succeeds
 * first; a competing proposal observes the committed new occupancy. Invalid
 * proposals append a rejection in chronology but preserve GRAPH BY REFERENCE.
 */
export function applyRemodelingProposal(
  graph:MaterialGraph, program:LifetimeRemodelingProgram,
  proposal:RemodelingProposal,
  chronology:RemodelingChronology=EMPTY_REMODELING_CHRONOLOGY,
  /** Daily callers commit an earned proposal only at ceil(nominal tick).
   * This changes the real transaction clock, not just its displayed sprite. */
  commitAtOpportunity?:number,
):RemodelingTransaction {
  const op=proposal.operation, k=proposal.unit, atHour=commitAtOpportunity??proposal.atHour;
  const id=op.id+"/unit/"+k;
  const priorTime=chronology.attempts.at(-1)?.atHour??0;
  const priorIds=new Set(chronology.attempts.map(a=>a.id));
  let reason:string|null=null;
  const due=scheduled(op,k,program);
  if(!Number.isFinite(atHour)||atHour<0||atHour>REMODEL_LIMITS.maxAgeHours ||
     due===null || proposal.atHour!==due ||
     (commitAtOpportunity===undefined ? atHour!==due :
       (!Number.isSafeInteger(atHour)||atHour!==Math.ceil(due)))) reason="not-due-or-invalid-proposal";
  else if(atHour<priorTime) reason="nonmonotone-remodel-chronology";
  else if(priorIds.has(id)||graph.events.some(e=>e.id===id))
    reason="duplicate-remodel-proposal";
  else if(graph.sourceFingerprint!==program.birth.sourceFingerprint ||
          JSON.stringify(graph.sourceCells)!==JSON.stringify(program.birth.sourceCells))
    reason="foreign-source-material";
  else if(graph.events.some(e=>e.atHour>atHour))
    reason="future-anatomy-in-transaction";
  else reason=checkGraph(graph);

  let next:MaterialGraph=graph;
  const created:MaterialCell[]=[], removed:MaterialCell[]=[];
  const relocated:{cellId:string;from:Point;to:Point}[]=[];
  const oldLinks:MaterialLink[]=[],newLinks:MaterialLink[]=[];
  const sitesChanged:{before:MaterialSite;after:MaterialSite}[]=[];
  let beforeRigidity:number|undefined,afterRigidity:number|undefined;
  let hinge:RemodelingHinge|undefined;
  if(!reason) {
    const tissue=graph.tissues.find(t=>t.id===op.tissueId);
    const group=graph.cells.filter(c=>c.tissueId===op.tissueId);
    const site=graph.sites.find(s=>s.tissueId===op.tissueId &&
      s.id===op.sourceSiteId) ??
      graph.sites.find(s=>s.tissueId===op.tissueId);
    const axis=direction(op.direction??site?.direction??{x:0,y:-1});
    const anchor=group.find(c=>c.id===site?.rootCellId) ??
      [...group].sort(cmp)[0];
    const forbidden=new Set([...graph.protectedVoids,...enclosed(graph.cells)]);
    if(!tissue||!anchor||!connected(group))reason="missing-or-invalid-tissue";
    else if(op.sourceSiteId && !graph.sites.some(s=>
      s.tissueId===op.tissueId && s.id===op.sourceSiteId))
      reason="missing-named-site";
    else if(op.kind==="extend") {
      // Existing growth tip first. If none named, use farthest projection from
      // active anchor; ties by persistent ID.
      const tip=site ? group.find(c=>c.id===site.rootCellId)! :
        [...group].sort((a,b)=>
          ((b.x-anchor.x)*axis.x+(b.y-anchor.y)*axis.y)-
          ((a.x-anchor.x)*axis.x+(a.y-anchor.y)*axis.y)||cmp(a,b))[0];
      const angle=Math.atan2(axis.y,axis.x)+
        (op.chaos?chaoticTurn(op.chaos,k-1):0);
      const step=stepFor({x:Math.cos(angle),y:Math.sin(angle)});
      const p={x:tip.x+step.x,y:tip.y+step.y};
      if(!permittedDeposition(p,op.tissueId,graph,forbidden))
        reason="extension-occupied-or-void";
      else {
        const child=newCell(id+"/cell",op,p,tip);
        created.push(child);
        const updatedSites=graph.sites.map(s=>{
          if(s.id!==site?.id||s.rootCellId!==tip.id)return s;
          const nextSite={...s,rootCellId:child.id};
          sitesChanged.push({before:s,after:nextSite});
          return nextSite;
        });
        next={...graph,cells:[...graph.cells,child],sites:updatedSites};
      }
    } else if(op.kind==="reinforce") {
      const eligible=group.flatMap(parent=>axial.map(d=>
        ({parent,p:{x:parent.x+d.x,y:parent.y+d.y}})))
        .filter(o=>permittedDeposition(o.p,op.tissueId,graph,forbidden))
        .sort((a,b)=>square(a.p,anchor)-square(b.p,anchor) ||
          a.p.y-b.p.y || a.p.x-b.p.x ||cmp(a.parent,b.parent));
      if(!eligible.length)reason="reinforcement-occupied-or-void";
      else {
        const {parent,p}=eligible[0];
        const child=newCell(id+"/cell",op,p,parent);
        created.push(child);
        beforeRigidity=tissue.rigidity;
        afterRigidity=clamp(tissue.rigidity+(1-tissue.rigidity)/op.units);
        next={...graph,cells:[...graph.cells,child],
          tissues:graph.tissues.map(t=>t.id===op.tissueId?
            {...t,rigidity:afterRigidity!}:t)};
      }
    } else if(op.kind==="resorb") {
      const protectedIds=new Set<string>(graph.sites.map(s=>s.rootCellId));
      for(const link of graph.links) {
        if(link.fromCellId)protectedIds.add(link.fromCellId);
        if(link.toCellId)protectedIds.add(link.toCellId);
      }
      for(const pivot of chronology.hinges)protectedIds.add(pivot.cellId);
      // A parent material cell may be removed only after every *active*
      // generated descendant can retain its own ancestry and physical contact.
      const candidates=[...group].sort((a,b)=>
        Number(b.provenance==="generated")-
        Number(a.provenance==="generated") ||
        square(b,anchor)-square(a,anchor)||cmp(a,b));
      const choice=candidates.find(c=>!protectedIds.has(c.id) &&
        group.length>1 &&
        connected(group.filter(other=>other.id!==c.id)) &&
        // Never remove last expressed source identity.
        group.some(other=>other.id!==c.id && other.sourceIds.some(s=>
          graph.sourceCells.some(src=>src.id===s))));
      if(!choice)reason="resorption-severs-site-or-attachment";
      else {
        removed.push(choice);
        next={...graph,cells:graph.cells.filter(c=>c.id!==choice.id)};
      }
    } else if(op.kind==="translate") {
      const step=stepFor(axis);
      const moved=group.map(c=>({cellId:c.id,
        from:{x:c.x,y:c.y},to:{x:c.x+step.x,y:c.y+step.y}}));
      const others=graph.cells.filter(c=>c.tissueId!==op.tissueId);
      const movingIds=new Set(group.map(c=>c.id));
      if(moved.some(m=>!bounded(m.to)||
         forbidden.has(pointKey(m.to))||
         others.some(c=>pointKey(c)===pointKey(m.to))))
        reason="translation-occupied-or-void";
      else {
        const coordinates=new Map(moved.map(m=>[m.cellId,m.to]));
        const shifted=graph.cells.map(c=>movingIds.has(c.id)?
          {...c,...coordinates.get(c.id)!}:c);
        const byId=new Map(shifted.map(c=>[c.id,c]));
        if(graph.links.some(l=>{
          const a=l.fromCellId?byId.get(l.fromCellId):undefined;
          const b=l.toCellId?byId.get(l.toCellId):undefined;
          return !a||!b||square(a,b)>8;
        })) reason="translation-breaks-attachment";
        else {
          const linked=new Set(graph.links.flatMap(l=>
            l.fromTissueId===op.tissueId?[l.toTissueId]:
            l.toTissueId===op.tissueId?[l.fromTissueId]:[]));
          if(moved.some(m=>others.some(c=>near(m.to,c) &&
            !linked.has(c.tissueId))))
            reason="translation-new-unlinked-contact";
          else {
            relocated.push(...moved);
            next={...graph,cells:shifted};
          }
        }
      }
    } else if(op.kind==="reattach") {
      const targetId=op.targetTissueId!;
      const other=graph.cells.filter(c=>c.tissueId===targetId);
      const lineage=new Set<string>();
      let parent:string|null=targetId;
      while(parent && !lineage.has(parent)) {
        lineage.add(parent);
        parent=graph.tissues.find(t=>t.id===parent)?.parentId??null;
      }
      const pairs=group.flatMap(a=>other.map(b=>
        ({a,b,d:square(a,b)})))
        .filter(pair=>near(pair.a,pair.b))
        .sort((a,b)=>a.d-b.d||cmp(a.a,b.a)||cmp(a.b,b.b));
      if(!other.length||!pairs.length||targetId===op.tissueId ||
         lineage.has(op.tissueId) || parent!==null)
        reason="reattachment-cycle-or-noncontact";
      else {
        const pair=pairs[0],prior=graph.links.find(l=>
          l.kind==="attachment" && l.fromTissueId===op.tissueId);
        if(prior)oldLinks.push(prior);
        const link:MaterialLink={
          id:prior?.id??op.id+"/attachment",kind:"attachment",
          fromTissueId:op.tissueId,toTissueId:targetId,
          fromCellId:pair.a.id,toCellId:pair.b.id,
        };
        newLinks.push(link);
        next={...graph,links:[...graph.links.filter(l=>l!==prior),link],
          tissues:graph.tissues.map(t=>t.id===op.tissueId?
            {...t,parentId:targetId,relationship:"joint"}:t)};
      }
    } else if(op.kind==="articulate") {
      const cut=[...group].sort(cmp).find(c=>group.length>=3 &&
        !connected(group.filter(a=>a.id!==c.id)));
      if(!cut)reason="no-supported-hinge";
      else if(chronology.hinges.some(h=>h.tissueId===op.tissueId))
        reason="already-articulated";
      else hinge={tissueId:op.tissueId,cellId:cut.id,operationId:op.id};
    }
  }
  // Postcondition verification is on tentative graph. Failure rolls
  // everything back; no partial changes, no failed event in graph.
  if(!reason) {
    const candidate:MaterialGraph={...next,events:[...next.events,{
      id,kind:op.kind,atHour,createdCellIds:created.map(c=>c.id),createdCells:created,
      removedCellIds:removed.map(c=>c.id),
      sourceCellIds:uniqueSources([...created,...removed]),
    }]};
    if((reason=checkGraph(candidate))) next=graph;
  }
  const attempt:RemodelingAttempt={
    id,atHour:Number.isFinite(atHour)?atHour:0,
    status:reason?"rejected":"accepted",reason,
  };
  const updated:RemodelingChronology={
    attempts:[...chronology.attempts,attempt],
    hinges:hinge&&!reason?[...chronology.hinges,hinge]:[...chronology.hinges],
  };
  let transition:RemodelTransition|null=null,deferral:RemodelDeferral|null=null;
  if(reason) {
    next=graph;
    deferral={id,atHour:attempt.atHour,reason};
  } else {
    transition={
      id,operationId:op.id,kind:op.kind,tissueId:op.tissueId,atHour,
      createdCellIds:created.map(c=>c.id),removedCellIds:removed.map(c=>c.id),
      relocated,oldLinks,newLinks,
      sourceCellIds:uniqueSources(
        created.length||removed.length?[...created,...removed]:
        graph.cells.filter(c=>c.tissueId===op.tissueId).slice(0,1)),
      ...(beforeRigidity===undefined?{}:
        {rigidityBefore:beforeRigidity,rigidityAfter:afterRigidity}),
    };
    const event=journalMaterialEvent(graph,next,{
      id,kind:op.kind,atHour,createdCells:created,createdCellIds:transition.createdCellIds,
      removedCellIds:transition.removedCellIds,sourceCellIds:transition.sourceCellIds,
    },"remodeling",{id:op.id,kind:op.kind,tissueId:op.tissueId,...(op.targetTissueId?{targetTissueId:op.targetTissueId}:{}),...(op.sourceSiteId?{sourceSiteId:op.sourceSiteId}:{}),...(op.direction?{direction:op.direction}:{})});
    next={...next,events:[...next.events,event]};
  }
  const beforeSites=new Map(graph.sites.map(site=>[site.id,site]));
  const beforeCells=new Map(graph.cells.map(cell=>[cell.id,cell]));
  const afterCells=new Map(next.cells.map(cell=>[cell.id,cell]));
  const siteChanges=next.sites.flatMap(site=>{
    const old=beforeSites.get(site.id);
    const from=old && beforeCells.get(old.rootCellId);
    const to=afterCells.get(site.rootCellId);
    if(!old||!from||!to||
      (from.x===to.x && from.y===to.y && old.rootCellId===site.rootCellId))
      return [];
    return [{siteId:site.id,fromCellId:old.rootCellId,
      toCellId:site.rootCellId,
      from:{x:from.x,y:from.y},to:{x:to.x,y:to.y}}];
  });
  const m=mechanical(next,updated);
  return {
    graph:next,chronology:updated,attempt,transition,deferral,siteChanges,
    capabilities:m.capabilities,regions:m.regions,
  };
}

/**
 * The integration owner passes proposals in its canonical global order.
 * We do NOT reorder equal-time proposals, so precedence is inspectable.
 * Validate monotonicity upfront: caller error cannot commit a prefix.
 */
export function applyRemodelingInterval(
  graph:MaterialGraph, program:LifetimeRemodelingProgram,
  proposals:readonly RemodelingProposal[],
  chronology:RemodelingChronology=EMPTY_REMODELING_CHRONOLOGY,
):RemodelingInterval {
  const previous=chronology.attempts.at(-1)?.atHour??0;
  let clock=previous;
  for(const proposal of proposals) {
    if(!Number.isFinite(proposal.atHour)||proposal.atHour<clock)
      throw new RangeError("Remodeling proposals must be supplied in global chronological order");
    clock=proposal.atHour;
  }
  let current=graph,state=chronology;
  const transactions:RemodelingTransaction[]=[];
  for(const proposal of proposals) {
    const result=applyRemodelingProposal(current,program,proposal,state);
    current=result.graph;
    state=result.chronology;
    transactions.push(result);
  }
  const m=mechanical(current,state);
  return {graph:current,chronology:state,transactions,
    capabilities:m.capabilities,regions:m.regions};
}

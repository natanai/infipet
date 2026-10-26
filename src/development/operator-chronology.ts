/**
 * DEV-002 incremental transactions on the ONE authoritative material graph.
 *
 * Expressions are chronological integrals supplied by Environment/Agent 5:
 *   E_i(t) = min(1, (1/d_i) integral_[s_i,min(t,s_i+d_i)]
 *                                  care_i(u) * chaoticRate_i(u) du).
 * care_i(u) in [0,1]; rate_i(u) in [0.6,1.4], exact one-hour constant
 * cat-torus rate from the permanently compiled operator chaos. With no chaos
 * rate=1. Expression input is cumulative E_i(t), NOT an instantaneous meter,
 * NOT a repeatedly applicable absolute strength. A producer splits its exact
 * integral at fractional care events and integer-hour sample boundaries.
 *
 * Physical credit C_i(t) = strength_i * inheritedPotential_i * E_i(t).
 * Quantum goal Q_i(t) = min(9, floor(7*C_i(t)+1e-10)), except
 * branch: min(9,floor(5*C_i(t)+1e-10)), fuse: min(1,floor(7*C_i(t)+1e-10)).
 * The state stores committed units k and never replays 1..k. At new cutoff t,
 * proposals (i,k+1)...(i,Q) are attempted on the LIVE graph and committed
 * atomically, subject to source/geometry limits. Conflicts defer until the
 * operator's finite window closes; expired operations are terminal. Multiple
 * newly-earned units at the same cutoff sort by op.startHour, op.id, then k.
 *
 * This is intentionally not equal to from-birth applyMaterialOperators:
 * repeated full-strength spatial dilation is not equivalent to one cumulative
 * distance-band calculation; changing anatomy also changes legal growth sites.
 * The earlier API remains untouched, and the difference is tested explicitly.
 *
 * Clock: [0,8192], half-open integration (start,end] for new earned credit.
 * Integer lattice: [0,63]^2; at most 3072 extra active cells, 64 operators,
 * <= 9 accepted quanta per operator, <= 2 branch cells per unit.
 * No PRNG draws, no rerolled chaotic initial states, no species targets.
 */
import { compareText, type Point } from "../simulation/model";
import { grownMaterialCells } from "../simulation/material-growth";
import type { Tissue } from "../simulation/material";
import {
  chaoticTurn, chaoticProgress, chaosAt,
  CHAOS_MAX_TICK, CHAOS_MODULUS, validateMaterialChaos,
} from "./chaos";
import type { MaterialCell, MaterialEvent, MaterialGraph, MaterialSite, MaterialTissue, MaterialLink } from "./material-graph";
import {
  createOperatorMaterialCell, materialOperatorPotential, MATERIAL_LIMITS,
  type MaterialDevelopmentProgram, type MaterialOperator,
} from "./operators";

export type MaterialCumulativeExpression = Readonly<{
  operatorId: string;
  /** E_i(toHour) in [0,1], integrated from its ORIGINAL scheduling window. */
  cumulative: number;
}>;
export type MaterialExpressionInterval = Readonly<{
  fromHour: number;
  toHour: number;
  /** Exactly one value per permanent scheduled operator; no unregistered ID. */
  expressions: readonly MaterialCumulativeExpression[];
}>;
export type MaterialExpressionRecord = Readonly<{
  operatorId: string;
  cumulative: number;
  committedUnits: number;
  /** Last actual generated tip(s), maintained by cell ID across translation. */
  tipCellIds: readonly string[];
  settled: boolean;
}>;
export type MaterialOperatorReason =
  | "missing-tissue" | "missing-site" | "site-root-removed" | "tip-removed"
  | "missing-target" | "already-connected" | "occupied" | "protected-void"
  | "outside-world" | "severed-tissue" | "link-endpoint" | "no-boundary"
  | "capacity" | "no-material" | "duplicate-event" | "invalid-structure"
  | "expired";
export type MaterialOperatorDecision = Readonly<{
  id: string;
  operatorId: string;
  unit: number;
  atHour: number;
  status: "accepted" | "deferred" | "suppressed";
  reason: MaterialOperatorReason | null;
}>;
export type MaterialOperatorChronologyState = Readonly<{
  version: 1;
  programFingerprint: string;
  genotypeFingerprint: string;
  nextHour: number;
  records: readonly MaterialExpressionRecord[];
  decisions: readonly MaterialOperatorDecision[];
}>;
export type MaterialOperatorTransaction = Readonly<{
  graph: MaterialGraph;
  state: MaterialOperatorChronologyState;
  events: readonly MaterialEvent[];
  decisions: readonly MaterialOperatorDecision[];
}>;
const EPS = 1e-10, WORLD = MATERIAL_LIMITS.world;
const xy = (p: Point) => p.x + "," + p.y;
const bounds = (p: Point) =>
  Number.isInteger(p.x) && Number.isInteger(p.y) &&
  p.x >= 0 && p.x < WORLD && p.y >= 0 && p.y < WORLD;
const touching = (a: Point, b: Point) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
const sq = (a: Point, b: Point) => (a.x-b.x)**2 + (a.y-b.y)**2;
const unit = (p: Point): Point => {
  const norm = Math.hypot(p.x,p.y);
  return norm > 1e-9 ? {x:p.x/norm,y:p.y/norm} : {x:0,y:-1};
};
const turn = (p: Point, a: number): Point => ({
  x:p.x*Math.cos(a)-p.y*Math.sin(a),
  y:p.x*Math.sin(a)+p.y*Math.cos(a),
});
const cellOrder = (a: MaterialCell,b:MaterialCell) => compareText(a.id,b.id);
const eventId = (op: MaterialOperator,k:number) =>
  "operator/" + encodeURIComponent(op.id) + "/unit/" + k;
const opAt = (program:MaterialDevelopmentProgram,id:string) =>
  program.operators.find(op=>op.id===id);
const remaining = (g: MaterialGraph,tissueId:string) =>
  g.cells.filter(c=>c.tissueId===tissueId);

function validateProgram(program: MaterialDevelopmentProgram):void {
  if (program.version!==1 || !program.fingerprint || !program.genomeFingerprint ||
      !program.source.sourceFingerprint ||
      program.operators.length>MATERIAL_LIMITS.operators)
    throw new TypeError("Invalid permanent material program");
  const seen=new Set<string>();
  for(const op of program.operators){
    if(!op.id || seen.has(op.id) || !op.tissueId ||
       !Number.isFinite(op.atHour) || !Number.isFinite(op.durationHours) ||
       op.atHour<0 || op.durationHours<=0 ||
       op.atHour+op.durationHours>CHAOS_MAX_TICK ||
       !Number.isFinite(op.strength) || op.strength<0 || op.strength>1 ||
       (op.direction && (![op.direction.x,op.direction.y].every(Number.isFinite))) ||
       (op.kind==="fuse" && !op.targetTissueId))
      throw new TypeError("Invalid immutable operator schedule");
    if(op.chaos) validateMaterialChaos(op.chaos);
    seen.add(op.id);
  }
}

/** Fail closed on source/genome substitution; old cell/linked event IDs remain causal. */
function validateGraph(g:MaterialGraph,program:MaterialDevelopmentProgram,cutoff:number):void {
  if(g.version!==1 || g.sourceFingerprint!==program.source.sourceFingerprint ||
     JSON.stringify(g.sourceCells)!==JSON.stringify(program.source.sourceCells))
    throw new TypeError("Original drawn material identity was changed");
  const active=new Map(g.cells.map(c=>[c.id,c]));
  const sources=new Set(g.sourceCells.map(c=>c.id));
  const tissues=new Set(g.tissues.map(t=>t.id));
  if(active.size!==g.cells.length || tissues.size!==g.tissues.length ||
     new Set(g.sites.map(s=>s.id)).size!==g.sites.length ||
     new Set(g.links.map(l=>l.id)).size!==g.links.length ||
     new Set(g.events.map(e=>e.id)).size!==g.events.length)
    throw new TypeError("Duplicate authoritative material identity");
  if(g.cells.length-g.sourceCells.length>MATERIAL_LIMITS.addedCells)
    throw new RangeError("Shared material budget exceeded");
  for(const c of g.cells)
    if(!bounds(c) || !tissues.has(c.tissueId) ||
       !c.sourceIds.length || c.sourceIds.some(id=>!sources.has(id)))
      throw new TypeError("Invalid active material");
  for(const l of g.links)
    if(!tissues.has(l.fromTissueId) || !tissues.has(l.toTissueId) ||
      (l.fromCellId!==null && active.get(l.fromCellId)?.tissueId!==l.fromTissueId) ||
      (l.toCellId!==null && active.get(l.toCellId)?.tissueId!==l.toTissueId))
      throw new TypeError("Invalid live attachment endpoints");
  for(const e of g.events)
    if(!Number.isFinite(e.atHour) || e.atHour<0 || e.atHour>cutoff+EPS)
      throw new RangeError("Graph contains a genuinely future-dated event");
}

/**
 * Agent 5 may sample the permanent chaos recurrence on integer-hour segments.
 * Within [n,n+1), c_i(u) is arbitrary bounded care; chaoticRate is constant:
 * R_i(n) = 1 + a_i(2*x_n/(p-1)-1), x_n=chaosAt(initial,n).x.
 * This function does not advance/reset the permanent orbit.
 */
export function materialOperatorChaosRate(
  op:MaterialOperator, atHour:number,
):number {
  if(!Number.isFinite(atHour)||atHour<0||atHour>=CHAOS_MAX_TICK)
    throw new RangeError("Chaotic expression rate outside the lifetime domain");
  if(!op.chaos)return 1;
  validateMaterialChaos(op.chaos);
  const state=chaosAt(op.chaos.initial,Math.floor(atHour));
  return 1+op.chaos.rateAmplitude*(2*state.x/(CHAOS_MODULUS-1)-1);
}

/** Upper bound from actual permanently seeded rhythm with maximal care=1. */
export function materialMaximumCumulativeExpression(
  op:MaterialOperator,atHour:number,
):number {
  if(!Number.isFinite(atHour)||atHour<0||atHour>CHAOS_MAX_TICK)
    throw new RangeError("Material expression query outside lifetime domain");
  if(op.chaos)
    return chaoticProgress(op.chaos,op.atHour,op.durationHours,atHour);
  return Math.min(1,Math.max(0,
    (Math.min(atHour,op.atHour+op.durationHours)-op.atHour)/op.durationHours));
}

export function initializeMaterialOperatorChronology(
  program: MaterialDevelopmentProgram,
  graph: MaterialGraph=program.source,
): MaterialOperatorChronologyState {
  validateProgram(program);
  validateGraph(graph,program,0);
  if(graph.events.length) throw new TypeError("Initialize chronology at birth only");
  return {
    version:1, programFingerprint:program.fingerprint,
    genotypeFingerprint:program.genomeFingerprint, nextHour:0,
    records:program.operators.map(op=>({
      operatorId:op.id,cumulative:0,committedUnits:0,
      tipCellIds:[],settled:false,
    })), decisions:[],
  };
}

function activeLinks(graph:MaterialGraph,id:string) {
  const byTissue=new Map<string,Set<string>>();
  for(const t of graph.tissues)byTissue.set(t.id,new Set([t.id]));
  for(const l of graph.links) {
    byTissue.get(l.fromTissueId)?.add(l.toTissueId);
    byTissue.get(l.toTissueId)?.add(l.fromTissueId);
  }
  const visited=new Set([id]),queue=[id];
  for(let i=0;i<queue.length;i++)
    for(const n of byTissue.get(queue[i])??[])
      if(!visited.has(n)){visited.add(n);queue.push(n);}
  return visited;
}
function canDeposit(g:MaterialGraph,p:Point,tissueId:string,provisional:readonly MaterialCell[], parentId?:string):
  MaterialOperatorReason|null {
  if(!bounds(p)) return "outside-world";
  if(g.protectedVoids.includes(xy(p))) return "protected-void";
  if(g.cells.length+provisional.length-g.sourceCells.length>=MATERIAL_LIMITS.addedCells)
    return "capacity";
  const all=[...g.cells,...provisional];
  if(all.some(c=>xy(c)===xy(p))) return "occupied";
  const connected=activeLinks(g,tissueId);
  if(parentId) {
    for(const id of activeLinks(g,parentId)) connected.add(id);
    for(const cell of provisional) connected.add(cell.tissueId);
  }
  for(const c of all)if(touching(c,p) && !connected.has(c.tissueId) &&
    c.tissueId!==tissueId) return "occupied";
  return null;
}
function contiguous(cells:readonly MaterialCell[]):boolean {
  if(!cells.length)return false;
  const visited=new Set([cells[0].id]),queue=[cells[0]];
  for(let i=0;i<queue.length;i++) for(const c of cells)
    if(!visited.has(c.id)&&touching(c,queue[i])) {
      visited.add(c.id);queue.push(c);
    }
  return visited.size===cells.length;
}
function liveSite(g:MaterialGraph,op:MaterialOperator) {
  const site = op.siteId ? g.sites.find(s=>s.id===op.siteId&&s.tissueId===op.tissueId)
    : g.sites.find(s=>s.tissueId===op.tissueId);
  const root=site && g.cells.find(c=>c.id===site.rootCellId&&c.tissueId===op.tissueId);
  return {site,root};
}
function orient(op:MaterialOperator,g:MaterialGraph,site:MaterialSite|undefined,
  index:number):Point {
  const source=unit(op.direction??site?.direction??{x:0,y:-1});
  const angle=op.chaos ? chaoticTurn(op.chaos,
    Math.min(CHAOS_MAX_TICK,Math.floor(op.atHour)+index-1)) : 0;
  return unit(turn(source,angle));
}
function stepVector(dir:Point):Point {
  let x=Math.round(dir.x),y=Math.round(dir.y);
  if(x===0 && y===0) { if(Math.abs(dir.x)>=Math.abs(dir.y)) x=dir.x<0?-1:1;
    else y=dir.y<0?-1:1; }
  return {x,y};
}
function tip(g:MaterialGraph,id:string,origin:MaterialCell,axis:Point) {
  return [...remaining(g,id)].sort((a,b)=>
    (b.x-origin.x)*axis.x+(b.y-origin.y)*axis.y-
    (a.x-origin.x)*axis.x-(a.y-origin.y)*axis.y ||
    compareText(a.id,b.id))[0];
}
const fail=(reason:MaterialOperatorReason) =>
  ({reason,graph:null as MaterialGraph|null,tips:[] as string[]});
const succeed=(graph:MaterialGraph,tips:readonly string[]) =>
  ({reason:null as MaterialOperatorReason|null,graph,tips:[...tips]});

function physicalUnit(
  graph:MaterialGraph,op:MaterialOperator,k:number,
  previous:MaterialExpressionRecord,program:MaterialDevelopmentProgram,
  atHour:number,
):{graph:MaterialGraph|null;reason:MaterialOperatorReason|null;tips:string[]} {
  const tissue=graph.tissues.find(t=>t.id===op.tissueId);
  if(!tissue || !remaining(graph,tissue.id).length)return fail("missing-tissue");
  const identifier=eventId(op,k);
  if(graph.events.some(e=>e.id===identifier))return fail("duplicate-event");
  const {site,root}=liveSite(graph,op);
  const siteRequired=["elongate","branch","bud","remodel"].includes(op.kind);
  if(siteRequired && !site)return fail("missing-site");
  if(siteRequired && !root)return fail("site-root-removed");
  if(previous.tipCellIds.some(id=>!graph.cells.some(c=>c.id===id)))
    return fail("tip-removed");
  const axis=orient(op,graph,site,k);
  const vector=stepVector(axis);
  const current=previous.tipCellIds[0] ?
    graph.cells.find(c=>c.id===previous.tipCellIds[0]) : (root && tip(graph,tissue.id,root,axis));
  const newCells:MaterialCell[]=[];
  const removed:MaterialCell[]=[];
  let tissues=[...graph.tissues],sites=[...graph.sites],links=[...graph.links];
  let cells=[...graph.cells];
  let tips:string[]=[];
  let rigidityOnly=false;
  const synth={...op,id:identifier};
  function deposit(owner:string,at:Point,parents:readonly MaterialCell[],parentId?:string) {
    const problem=canDeposit(graph,at,owner,newCells,parentId);
    if(problem)return problem;
    const next=createOperatorMaterialCell(synth,owner,at.x,at.y,parents);
    newCells.push(next);return null;
  }
  if(op.kind==="elongate"){
    if(!current)return fail("tip-removed");
    const at={x:current.x+vector.x,y:current.y+vector.y};
    const problem=deposit(tissue.id,at,[current]);
    if(problem)return fail(problem);
    tips=[newCells[0].id];
    if(site && root)
      sites=sites.map(s=>s.id===site.id?{...s,rootCellId:tips[0]}:s);
  }
  if(op.kind==="branch"||op.kind==="bud"){
    if(!current)return fail("tip-removed");
    const count=op.kind==="branch"?2:1;
    for(let b=0;b<count;b++){
      const childId=op.id+"/growth/"+b;
      const direction=unit(turn(unit(op.direction??site?.direction??{x:0,y:-1}),
        (op.kind==="branch" ? (b?1:-1)*(0.25+
          program.signals.channels.branching.divergence*0.85) :
          (program.signals.channels.symmetry.chirality-0.5)*0.8) +
          (op.chaos ? chaoticTurn(op.chaos,Math.min(CHAOS_MAX_TICK,
            Math.floor(op.atHour)+k-1)) : 0)));
      const delta=stepVector(direction);
      const child=graph.tissues.find(t=>t.id===childId);
      const source=child ? graph.cells.find(c=>c.id===previous.tipCellIds[b])
        : current;
      if(!source)return fail("tip-removed");
      const target={x:source.x+delta.x,y:source.y+delta.y};
      const problem=deposit(childId,target,[source],tissue.id);
      if(problem)return fail(problem);
      const newCell=newCells[newCells.length-1];
      tips.push(newCell.id);
      if(!child){
        if(tissues.some(t=>t.id===childId))return fail("invalid-structure");
        const childSiteId=childId+"/site/0";
        tissues.push({
          id:childId,sourcePartId:tissue.sourcePartId,parentId:tissue.id,
          relationship:"joint",sourceCellIds:source.sourceIds,
          growthSiteIds:[childSiteId],rigidity:0,
        });
        sites.push({id:childSiteId,tissueId:childId,
          rootCellId:newCell.id,direction});
        links.push({
          id:op.id+"/link/"+b,kind:"attachment",
          fromTissueId:childId,toTissueId:tissue.id,
          fromCellId:newCell.id,toCellId:source.id,
        });
      } else {
        sites=sites.map(s=>s.tissueId===childId?{...s,rootCellId:newCell.id}:s);
      }
    }
  }
  if(op.kind==="expand" || op.kind==="reinforce"){
    if(op.kind==="reinforce") {
      // Quantized material rigidity is a persistent, measurable trait; no
      // source cells are overwritten. The event is still a physical event.
      const quantized=Math.min(1.5,k/7);
      tissues=tissues.map(t=>t.id===tissue.id?
        {...t,rigidity:Math.max(t.rigidity,quantized)}:t);
      rigidityOnly=true;
    }else{
      const material=remaining(graph,tissue.id);
      const faux={cells:material.map(c=>({x:c.x,y:c.y,color:c.color,
        ...(c.z===undefined?{}:{z:c.z})}))} as Tissue;
      // The old exterior signed-distance material expansion primitive is
      // called on the CURRENT contour. Take one new lattice cell per quantum.
      const field=grownMaterialCells(faux,1.5,2)
        .filter(p=>!material.some(c=>xy(c)===xy(p)))
        .sort((a,b)=>a.y-b.y||a.x-b.x);
      let reason:MaterialOperatorReason="no-boundary",chosen=false;
      for(const candidate of field) {
        const parent=[...material].sort((a,b)=>sq(a,candidate)-sq(b,candidate) ||
          cellOrder(a,b))[0];
        if(!parent)break;
        const problem=deposit(tissue.id,candidate,[parent]);
        if(problem){reason=problem;continue;}
        chosen=true;break;
      }
      if(!chosen)return fail(reason);
    }
  }
  if(op.kind==="fuse"){
    if(!op.targetTissueId || op.targetTissueId===tissue.id)return fail("missing-target");
    const destination=remaining(graph,op.targetTissueId);
    if(!destination.length)return fail("missing-target");
    if(activeLinks(graph,tissue.id).has(op.targetTissueId))return fail("already-connected");
    let pair:{a:MaterialCell;b:MaterialCell;d:number}|null=null;
    for(const a of remaining(graph,tissue.id))for(const b of destination) {
      const d=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
      if(!pair || d<pair.d || (d===pair.d && compareText(a.id+b.id,pair.a.id+pair.b.id)<0))
        pair={a,b,d};
    }
    if(!pair || pair.d>12)return fail("no-boundary");
    const {a,b,d}=pair;let x=a.x,y=a.y;
    for(let i=1;i<d;i++){
      if(x!==b.x)x+=Math.sign(b.x-x);else y+=Math.sign(b.y-y);
      const at={x,y},parent=newCells[newCells.length-1]??a;
      const problem=deposit(tissue.id,at,[parent,b],op.targetTissueId);
      if(problem)return fail(problem);
    }
    links.push({
      id:op.id+"/fusion",kind:"fusion",fromTissueId:tissue.id,
      toTissueId:op.targetTissueId,fromCellId:a.id,toCellId:b.id,
    });
  }
  if(op.kind==="resorb" || op.kind==="remodel"){
    const all=remaining(graph,tissue.id);
    const rootPoint=root??all[0];
    const candidates=[...all].sort((a,b)=>
      Number(b.provenance==="generated")-Number(a.provenance==="generated") ||
      sq(b,rootPoint)-sq(a,rootPoint)||cellOrder(a,b));
    let chosen:MaterialCell|undefined;
    for(const candidate of candidates) {
      if(links.some(l=>l.fromCellId===candidate.id||l.toCellId===candidate.id))continue;
      if(all.length<2)break;
      const left=all.filter(c=>c.id!==candidate.id);
      if(!contiguous(left))continue;
      if(op.kind==="remodel"){
        const at={x:candidate.x+vector.x,y:candidate.y+vector.y};
        if(!bounds(at) || graph.protectedVoids.includes(xy(at)) ||
           graph.cells.some(c=>xy(c)===xy(at)) ||
           !left.some(c=>touching(c,at)))continue;
        // Explicitly relocate the SAME cell ID: no new genetic or material
        // origin, and no "birth graph" reset. Future site queries use its x/y.
        cells=cells.map(c=>c.id===candidate.id?{...c,x:at.x,y:at.y}:c);
        if(!contiguous(cells.filter(c=>c.tissueId===tissue.id)))continue;
        tips=[candidate.id];chosen=candidate;break;
      }
      removed.push(candidate);
      cells=cells.filter(c=>c.id!==candidate.id);
      // A resorbed site root must be removed, not silently attached to the
      // nearest surviving cell. Iterative chronology sees a removed site.
      const deleted=new Set(sites.filter(s=>s.rootCellId===candidate.id).map(s=>s.id));
      sites=sites.filter(s=>!deleted.has(s.id));
      tissues=tissues.map(t=>({...t,growthSiteIds:t.growthSiteIds.filter(id=>!deleted.has(id))}));
      chosen=candidate;break;
    }
    if(!chosen)return fail("no-material");
  }
  if(op.kind!=="reinforce" && !newCells.length && !removed.length &&
     op.kind!=="remodel" && op.kind!=="fuse")return fail("no-material");
  cells.push(...newCells);
  const currentIds=new Set(cells.map(c=>c.id));
  if(new Set(cells.map(c=>c.id)).size!==cells.length ||
      !cells.every(c=>bounds(c)) || 
      links.some(l=>(l.fromCellId && !currentIds.has(l.fromCellId))||
       (l.toCellId && !currentIds.has(l.toCellId))))return fail("invalid-structure");
  // Child branches are connected to their parent by a true live link;
  // existing tissue subgraphs must remain 8-connected.
  if(tissues.some(t=>remaining({ ...graph,cells },t.id).length &&
     !contiguous(remaining({ ...graph,cells },t.id))))return fail("severed-tissue");
  const event:MaterialEvent={
    id:identifier,kind:op.kind,atHour,
    createdCellIds:newCells.map(c=>c.id),
    removedCellIds:removed.map(c=>c.id),
    sourceCellIds:[...new Set([...newCells,...removed].flatMap(c=>c.sourceIds))].sort(compareText),
  };
  const next:MaterialGraph={...graph,cells,tissues,sites,links,
    events:[...graph.events,event]};
  return succeed(next,tips.length?tips:previous.tipCellIds);
}

/**
 * Atomic interval commit. Every accepted unit gets one immutable event and
 * the caller persists BOTH the returned graph and returned expression state.
 * A deferred unit consumes no physical credit; it may retry before expiry.
 */
export function stepMaterialOperatorChronology(
  graph:MaterialGraph,program:MaterialDevelopmentProgram,
  state:MaterialOperatorChronologyState,
  interval:MaterialExpressionInterval,
):MaterialOperatorTransaction {
  validateProgram(program);
  if(state.version!==1 || state.programFingerprint!==program.fingerprint ||
     state.genotypeFingerprint!==program.genomeFingerprint ||
     interval.fromHour!==state.nextHour ||
     ![interval.fromHour,interval.toHour].every(Number.isFinite) ||
     interval.fromHour<0 || interval.toHour<=interval.fromHour ||
     interval.toHour>CHAOS_MAX_TICK)
    throw new RangeError("Non-contiguous or invalid material interval/program");
  // The global scheduler may already have committed a 0.5h remodeling
  // event when settling [0,1]. A strict fromHour cutoff rejects that valid
  // same-interval chronology, so check against the COMMIT boundary instead.
  validateGraph(graph,program,interval.toHour);
  if(interval.expressions.length!==program.operators.length ||
     state.records.length!==program.operators.length)
    throw new TypeError("Incomplete operator-expression vector");
  const values=new Map<string,number>();
  for(const e of interval.expressions) {
    if(!opAt(program,e.operatorId) || values.has(e.operatorId) ||
       !Number.isFinite(e.cumulative) || e.cumulative<0 || e.cumulative>1)
      throw new RangeError("Unknown, duplicate or unbounded cumulative expression");
    values.set(e.operatorId,e.cumulative);
  }
  const records=new Map(state.records.map(r=>[r.operatorId,{...r}]));
  if(records.size!==program.operators.length)throw new TypeError("Duplicate expression state");
  for(const op of program.operators){
    const previous=records.get(op.id);
    if(!previous)throw new TypeError("Missing persistent operator state");
    const next=values.get(op.id)!;
    const upper=materialMaximumCumulativeExpression(op,interval.toHour);
    if(next>upper+EPS || next+EPS<previous.cumulative ||
      (previous.settled && Math.abs(next-previous.cumulative)>EPS))
      throw new RangeError("Noncausal expression, retroactive edit or missing integral");
  }
  // Atomic save/replay witness: a persisted ledger and its graph must agree.
  // A recovered graph cannot silently skip or duplicate already committed units.
  const historical=new Set(graph.events.map(e=>e.id));
  for(const op of program.operators) {
    const rec=records.get(op.id)!;
    if(!Number.isInteger(rec.committedUnits) ||
       rec.committedUnits<0 || rec.committedUnits>9 ||
       rec.tipCellIds.some(id=>typeof id!=="string") ||
       !Number.isFinite(rec.cumulative) || rec.cumulative<0 ||
       rec.cumulative>1 || rec.operatorId!==op.id)
      throw new TypeError("Invalid persisted operator-expression ledger");
    for(let unitNumber=1;unitNumber<=rec.committedUnits;unitNumber++)
      if(!historical.has(eventId(op,unitNumber)))
        throw new TypeError("Persisted expression ledger is ahead of the material graph");
    for(const event of graph.events)
      if(event.id.startsWith("operator/"+encodeURIComponent(op.id)+"/unit/") &&
        (!Number.isInteger(Number(event.id.slice(eventId(op,0).lastIndexOf("/")+1))) ||
         Number(event.id.slice(eventId(op,0).lastIndexOf("/")+1))>rec.committedUnits))
        throw new TypeError("Material graph contains unacknowledged operator units");
  }
  const ordered=[...program.operators].sort((a,b)=>a.atHour-b.atHour ||
    compareText(a.id,b.id));
  let current=graph;
  const emitted:MaterialEvent[]=[],decisions:MaterialOperatorDecision[]=[];
  for(const op of ordered){
    const previous=records.get(op.id)!;
    const cumulative=values.get(op.id)!;
    if(previous.settled){continue;}
    const end=op.atHour+op.durationHours;
    const capacity=materialOperatorPotential(op.kind,program.signals);
    const credit=op.strength*capacity*cumulative;
    const multiplier=op.kind==="branch"?5:7;
    const quota=op.kind==="fuse"?1:Math.min(9,Math.floor(multiplier*credit+EPS));
    let committed=previous.committedUnits, tips=[...previous.tipCellIds];
    let terminal=false;
    while(committed<quota){
      const unitNumber=committed+1;
      const attempt=physicalUnit(current,op,unitNumber,
        {...previous,committedUnits:committed,tipCellIds:tips},
        program,interval.toHour);
      const id=eventId(op,unitNumber);
      if(!attempt.graph){
        const settled=interval.toHour>=end;
        decisions.push({id,operatorId:op.id,unit:unitNumber,
          atHour:interval.toHour,status:settled?"suppressed":"deferred",
          reason:settled?"expired":attempt.reason});
        terminal=settled;
        break;
      }
      current=attempt.graph; committed++;tips=attempt.tips;
      emitted.push(current.events[current.events.length-1]);
      decisions.push({id,operatorId:op.id,unit:unitNumber,
        atHour:interval.toHour,status:"accepted",reason:null});
    }
    records.set(op.id,{
      operatorId:op.id,cumulative,committedUnits:committed,tipCellIds:tips,
      settled:terminal||interval.toHour>=end,
    });
  }
  return {
    graph:current,
    state:{version:1,programFingerprint:program.fingerprint,
      genotypeFingerprint:program.genomeFingerprint,nextHour:interval.toHour,
      records:program.operators.map(op=>records.get(op.id)!),
      decisions:[...state.decisions,...decisions]},
    events:emitted,decisions,
  };
}

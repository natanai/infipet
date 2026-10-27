/**
 * DEV-007: one atomic physical opportunity on [T_(k-1),T_k), committed at T_k.
 *
 * The shared geometric primitives use a dimensionless developmental tick.
 * In this API ONE tick means ONE daily opportunity, not one elapsed hour.
 * The inherited schedule's atHour/durationHours fields are interpreted as
 * opportunity coordinates; the unit conversion exists only inside this pure
 * transaction. No hourly or fractional physical scheduler is run. Every
 * emitted public MaterialEvent carries elapsed hours=24*k AND absolute T_k.
 *
 * E_i(k)=min(1,E_i(k-1)+overlap([k-1,k),[s_i,s_i+d_i))*q_i(k)*r_i(k-1)/d_i).
 * q_growth=nutrition*(.5+.5*rest)*(.5+.5*security), q_remodel=rest*(1-.35*threat),
 * q_reinforce=nutrition*(.75+.25*activity). Inherited strength/capacity is
 * applied once by the existing quantum allocator. r is the exact bounded
 * cat-map rate. Iterative sites advance their persistent torus orbit ONCE per
 * opportunity, allocating floor(4*resources) integer credits. Resources are
 * (integrated nutrition+security)/2; zero resources permit honest null steps.
 * Earned remodeling proposals are committed at ceil(nominal opportunity), in
 * nominal-time/ID/unit order, after material quanta and before iterative growth.
 * A care-resource veto is recorded, never silently retried or turned into care.
 *
 * State is serializable, immutable and birth-bound. Domain k=1..365; numeric
 * arithmetic uses bounded IEEE754 Numbers, exact safe-integer epoch ms, exact
 * integer torus arithmetic and lattice coordinates in [0,63]^2. The primitive
 * shared 3072-added-cell/64-operator/4096-site limits remain hard constraints.
 * The prior state is NEVER mutated; duplicate/out-of-sequence/mature steps
 * throw. Unknown care supplies no fabricated resource or directional light.
 */
import type {InheritedGenome} from "../simulation/genome";
import {compileLifetimeRemodeling,type LifetimeRemodelingProgram} from "./lifetime-remodeling";
import {type MaterialDevelopmentProgram} from "./operators";
import {initializeMaterialOperatorChronology,stepMaterialOperatorChronology,materialOperatorChaosRate,
  type MaterialOperatorChronologyState} from "./operator-chronology";
import {createIterativeChronologyState,stepIterativeChronology,type IterativeChronologyState} from "./iterative-chronology";
import {applyRemodelingProposal,remodelingProposalsBetween,EMPTY_REMODELING_CHRONOLOGY,type RemodelingChronology} from "./remodel-transactions";
import type {MaterialGraph,MaterialCell,MaterialEvent} from "./material-graph";
import {dailyCheckTime,validateDailyCareWindow,DAILY_HOURS,FINAL_ANATOMICAL_CHECK,type DailyCareWindowV1} from "./daily-contract";
export * from "./daily-contract";

export type DailyCheckRecord=Readonly<{
  checkIndex:number;atMs:number;careDigest:string;
  createdCellIds:readonly string[];removedCellIds:readonly string[];
  relocatedCellIds:readonly string[];
  acceptedEvents:readonly string[];
  nullEffect:boolean;
}>;
export type DailyMaterialState=Readonly<{
  version:1;clock:"daily-365-v1";hatchAtMs:number;
  programFingerprint:string;genomeFingerprint:string;completedChecks:number;
  graph:MaterialGraph;
  material:MaterialOperatorChronologyState;
  iterative:IterativeChronologyState;
  remodeling:RemodelingChronology;
  checks:readonly DailyCheckRecord[];
}>;
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const cap=(v:number)=>Math.max(0,Math.min(1,v));
function seal<T>(value:T):T {
  if(value&&typeof value==="object"&&!Object.isFrozen(value)){
    for(const child of Object.values(value))seal(child);
    Object.freeze(value);
  }
  return value;
}
/** Independent inventory reconstruction. Does NOT trust cell counts, operator
 * receipts or the graph's currently live list as the creation oracle. */
export function verifyDailyMaterialInventory(graph:MaterialGraph,hatchAtMs:number,throughCheck:number):void {
  dailyCheckTime(hatchAtMs,throughCheck);
  const source=new Map(graph.sourceCells.map(c=>[c.id,c]));
  const active=new Set(source.keys()),ever=new Set(source.keys());
  const archive=new Map<string,MaterialCell>(source);
  const events=new Set<string>();let previous=0;
  if(source.size!==graph.sourceCells.length)throw new TypeError("Duplicate original material");
  for(const event of graph.events){
    const k=event.checkIndex;
    if(k===undefined||!Number.isInteger(k)||k<1||k>throughCheck||k>FINAL_ANATOMICAL_CHECK||
        event.atHour!==k*DAILY_HOURS||event.atMs!==dailyCheckTime(hatchAtMs,k)||k<previous)
      throw new RangeError("Material transaction is outside its daily opportunity");
    if(events.has(event.id))throw new TypeError("Duplicate material transaction");
    events.add(event.id);previous=k;
    const made=event.createdCells??[];
    if(!equal(made.map(c=>c.id),event.createdCellIds))throw new TypeError("Missing physical creation ownership");
    for(const cell of made){
      if(ever.has(cell.id)||cell.provenance!=="generated"||!cell.operationId||
          !cell.parentCellIds.length||cell.parentCellIds.some(id=>!active.has(id))||
          !cell.sourceIds.length||cell.sourceIds.some(id=>!source.has(id)))
        throw new TypeError("Reused identity or invalid physical parent/source ancestry");
      const inherited=[...new Set(cell.parentCellIds.flatMap(id=>archive.get(id)!.sourceIds))].sort();
      if(!equal([...cell.sourceIds].sort(),inherited))throw new TypeError("Creation changed material ancestry");
      active.add(cell.id);ever.add(cell.id);archive.set(cell.id,cell);
    }
    for(const id of event.removedCellIds){
      if(!active.has(id))throw new TypeError("Removal lacks active physical inventory");
      active.delete(id);
    }
  }
  const actual=new Set(graph.cells.map(c=>c.id));
  if(actual.size!==graph.cells.length||actual.size!==active.size||[...active].some(id=>!actual.has(id)))
    throw new TypeError("Actual material inventory disagrees with creation/removal transactions");
  const tissues=new Set(graph.tissues.map(t=>t.id));
  for(const cell of graph.cells){
    const original=archive.get(cell.id);
    if(!original||!equal(cell.sourceIds,original.sourceIds)||!equal(cell.parentCellIds,original.parentCellIds)||
        cell.operationId!==original.operationId||cell.provenance!==original.provenance||
        !tissues.has(cell.tissueId)||![cell.x,cell.y].every(v=>Number.isInteger(v)&&v>=0&&v<64))
      throw new TypeError("Active material lost its original creation ancestry");
  }
  for(const link of graph.links)
    if(!tissues.has(link.fromTissueId)||!tissues.has(link.toTissueId)||
        (link.fromCellId!==null&&!active.has(link.fromCellId))||
        (link.toCellId!==null&&!active.has(link.toCellId)))
      throw new TypeError("Attachment lacks active physical endpoints");
}
export function createDailyMaterialState(program:MaterialDevelopmentProgram,hatchAtMs:number):DailyMaterialState {
  dailyCheckTime(hatchAtMs,FINAL_ANATOMICAL_CHECK);
  if(program.source.events.length)throw new TypeError("Daily birth must be original authored material");
  const state:DailyMaterialState={version:1,clock:"daily-365-v1",hatchAtMs,
    programFingerprint:program.fingerprint,genomeFingerprint:program.genomeFingerprint,
    completedChecks:0,graph:program.source,material:initializeMaterialOperatorChronology(program),
    iterative:createIterativeChronologyState(program),remodeling:EMPTY_REMODELING_CHRONOLOGY,checks:[]};
  verifyDailyMaterialInventory(state.graph,hatchAtMs,0);
  return seal(state);
}
export function applyDailyMaterialStep(
  program:MaterialDevelopmentProgram,genome:InheritedGenome,prior:DailyMaterialState,
  window:DailyCareWindowV1,remodelingProgram:LifetimeRemodelingProgram=compileLifetimeRemodeling(program,genome),
):DailyMaterialState {
  validateDailyCareWindow(window);
  const k=window.checkIndex,n=k-1,f=window.forcing;
  if(prior.version!==1||prior.clock!=="daily-365-v1"||prior.hatchAtMs!==window.hatchAtMs||
      prior.completedChecks!==n||prior.checks.length!==n||
      prior.material.nextHour!==n||prior.iterative.nextHour!==n||
      prior.programFingerprint!==program.fingerprint||prior.genomeFingerprint!==program.genomeFingerprint||
      genome.genotype.fingerprint!==program.genomeFingerprint||
      remodelingProgram.genomeFingerprint!==program.genomeFingerprint||
      !equal(prior.graph.sourceCells,program.source.sourceCells))
    throw new TypeError("Duplicate, out-of-sequence or incompatible daily material step");
  verifyDailyMaterialInventory(prior.graph,prior.hatchAtMs,n);
  // A unit adapter for geometric primitives, not an elapsed-hour replay.
  let graph:MaterialGraph={...prior.graph,events:prior.graph.events.map(e=>({...e,atHour:e.atHour/DAILY_HOURS}))};
  const growth=f.nutrition*(0.5+0.5*f.rest)*(0.5+0.5*f.security);
  const resources=cap((f.nutrition+f.security)/2);
  const expressions=program.operators.map((op,i)=>{
    const old=prior.material.records[i];
    const overlap=Math.max(0,Math.min(k,op.atHour+op.durationHours)-Math.max(n,op.atHour));
    const response=op.kind==="reinforce"?f.nutrition*(0.75+0.25*f.activity):
      ["resorb","remodel","fuse"].includes(op.kind)?f.rest*(1-0.35*f.threat):growth;
    return {operatorId:op.id,cumulative:old.settled?old.cumulative:
      cap(old.cumulative+overlap*response*materialOperatorChaosRate(op,n)/op.durationHours)};
  });
  const material=stepMaterialOperatorChronology(graph,program,prior.material,{fromHour:n,toHour:k,expressions});
  graph=material.graph;
  let remodeling=prior.remodeling;
  for(const proposal of remodelingProposalsBetween(remodelingProgram,n,k)){
    const allowed=proposal.operation.kind==="resorb"?f.observedFraction>0:
      resources>0&&f.rest>0;
    if(!allowed){
      remodeling={...remodeling,attempts:[...remodeling.attempts,{
        id:proposal.operation.id+"/unit/"+proposal.unit,atHour:k,status:"rejected",reason:"daily-resource-unavailable"}]};
      continue;
    }
    const applied=applyRemodelingProposal(graph,remodelingProgram,proposal,remodeling,k);
    graph=applied.graph;remodeling=applied.chronology;
  }
  const iterative=stepIterativeChronology(program,graph,prior.iterative,{atHour:n,resources,light:null});
  graph=iterative.graph;
  const added=graph.events.slice(prior.graph.events.length);
  if(added.some(e=>e.atHour!==k))throw new RangeError("Primitive attempted a between-check physical mutation");
  const events:MaterialEvent[]=added.map(e=>({...e,atHour:k*DAILY_HOURS,atMs:window.endMs,
    checkIndex:k,careDigest:window.provenanceDigest,genomeFingerprint:program.genomeFingerprint}));
  graph=events.length?{...graph,events:[...prior.graph.events,...events]}:prior.graph;
  const old=new Map(prior.graph.cells.map(c=>[c.id,c]));
  const record:DailyCheckRecord={checkIndex:k,atMs:window.endMs,careDigest:window.provenanceDigest,
    createdCellIds:events.flatMap(e=>e.createdCellIds),removedCellIds:events.flatMap(e=>e.removedCellIds),
    relocatedCellIds:graph.cells.filter(c=>{const b=old.get(c.id);return b&&(b.x!==c.x||b.y!==c.y);}).map(c=>c.id),
    acceptedEvents:events.map(e=>e.id),nullEffect:graph===prior.graph};
  // Sparse daily allocation archive: omitted sites received/spent ZERO.
  // Their permanent IDs/orbits remain in sites, so the full competition is
  // independently reconstructible without 365 copies of thousands of zeros.
  const compactLedger={...iterative.ledger,bySite:iterative.ledger.bySite.filter(s=>s.allocated>0||s.spent>0)};
  const compactIterative={...iterative.state,ledger:[...prior.iterative.ledger,compactLedger]};
  const next:DailyMaterialState={...prior,completedChecks:k,graph,material:material.state,
    iterative:compactIterative,remodeling,checks:[...prior.checks,record]};
  verifyDailyMaterialInventory(next.graph,prior.hatchAtMs,k);
  return seal(next);
}

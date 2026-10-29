import {reconstructDailyPhysicalState,type PhysicalOperatorAuthorization} from "./spatial-inventory";
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
 * Repatterning has floor(64*resources*(.5+.5*rest)) bounded physical work
 * real seam daughters; source-neighbor intercalation transports the coupled
 * existing sheet at most one cell (<=4096 unit moves). Its expressed field
 * also guides subsequent ordinary surface deposition. Apical succession
 * requires an explicit physical site journal; genetic and chaotic identity
 * continue without a reset.
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
import {REGIONAL_GROWTH_VERSION} from "./regional-regulation";
import {expressedRepatterningFields} from "./developmental-repatterning";
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
  /** Derived-cache identity, kept separate from the permanent birth orbit. */
  algorithmVersion:typeof REGIONAL_GROWTH_VERSION;
  programFingerprint:string;genomeFingerprint:string;completedChecks:number;
  graph:MaterialGraph;
  material:MaterialOperatorChronologyState;
  iterative:IterativeChronologyState;
  remodeling:RemodelingChronology;
  checks:readonly DailyCheckRecord[];
}>;
// Reference identity proves equality for this serializable data contract;
// independently allocated/reloaded values still receive full value comparison.
const equal=(a:unknown,b:unknown)=>a===b||JSON.stringify(a)===JSON.stringify(b);
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
const physicalProofs=new WeakMap<MaterialGraph,{basis:object;hatch:number;lastCheck:number;authorization:string}>();
const frozenDataProofs=new WeakSet<object>();
function deeplyFrozen(value:unknown,seen=new Set<object>()):boolean{
  if(!value||typeof value!=="object"||seen.has(value))return true;
  if(frozenDataProofs.has(value))return true;
  if(!Object.isFrozen(value))return false;seen.add(value);
  const complete=Object.values(value).every(v=>deeplyFrozen(v,seen));
  if(complete)frozenDataProofs.add(value);
  return complete;
}
export function verifyDailyMaterialInventory(graph:MaterialGraph,hatchAtMs:number,throughCheck:number,original?:MaterialGraph,authorization?:PhysicalOperatorAuthorization,previousGraph?:MaterialGraph):void {
  dailyCheckTime(hatchAtMs,throughCheck);
  const basis=original??graph.birth,prior=physicalProofs.get(graph),key=authorization?JSON.stringify(authorization):"";
  if(prior&&prior.basis===basis&&prior.hatch===hatchAtMs&&prior.lastCheck<=throughCheck&&prior.authorization===key)return;
  const proof=reconstructDailyPhysicalState(graph,hatchAtMs,throughCheck,original,authorization,previousGraph);
  if(basis&&deeplyFrozen(graph)&&(!original||deeplyFrozen(original)))physicalProofs.set(graph,{basis,hatch:hatchAtMs,lastCheck:proof.lastCheck,authorization:key});
}

export function createDailyMaterialState(program:MaterialDevelopmentProgram,hatchAtMs:number):DailyMaterialState {
  dailyCheckTime(hatchAtMs,FINAL_ANATOMICAL_CHECK);
  if(program.source.events.length)throw new TypeError("Daily birth must be original authored material");
  const origin={tissues:program.source.tissues,sites:program.source.sites,links:program.source.links,protectedVoids:program.source.protectedVoids};
  const birthGraph=equal(program.source.birth,origin)?program.source:{...program.source,birth:origin};
  const state:DailyMaterialState={version:1,clock:"daily-365-v1",hatchAtMs,
    algorithmVersion:REGIONAL_GROWTH_VERSION,
    programFingerprint:program.fingerprint,genomeFingerprint:program.genomeFingerprint,
    completedChecks:0,graph:birthGraph,material:initializeMaterialOperatorChronology(program),
    iterative:createIterativeChronologyState(program),remodeling:EMPTY_REMODELING_CHRONOLOGY,checks:[]};
  seal(state);
  verifyDailyMaterialInventory(state.graph,hatchAtMs,0,program.source);
  return state;
}
export function applyDailyMaterialStep(
  program:MaterialDevelopmentProgram,genome:InheritedGenome,prior:DailyMaterialState,
  window:DailyCareWindowV1,remodelingProgram:LifetimeRemodelingProgram=compileLifetimeRemodeling(program,genome),
):DailyMaterialState {
  validateDailyCareWindow(window);
  const k=window.checkIndex,n=k-1,f=window.forcing;
  if(prior.version!==1||prior.clock!=="daily-365-v1"||prior.algorithmVersion!==REGIONAL_GROWTH_VERSION||prior.hatchAtMs!==window.hatchAtMs||
      prior.completedChecks!==n||prior.checks.length!==n||
      prior.material.nextHour!==n||prior.iterative.nextHour!==n||
      prior.programFingerprint!==program.fingerprint||prior.genomeFingerprint!==program.genomeFingerprint||
      genome.genotype.fingerprint!==program.genomeFingerprint||
      remodelingProgram.genomeFingerprint!==program.genomeFingerprint||
      !equal(prior.graph.sourceCells,program.source.sourceCells))
    throw new TypeError("Duplicate, out-of-sequence or incompatible daily material step");
  const authorization={material:program.operators,remodeling:remodelingProgram.operations,
    structuralRigidity:program.signals.channels.support.rigidity,repatterning:{seed:remodelingProgram.seed,
      elongation:program.signals.channels.growth.elongation,expansion:program.signals.channels.growth.expansion,
      membrane:program.signals.channels.support.membrane}};
  verifyDailyMaterialInventory(prior.graph,prior.hatchAtMs,n,program.source,authorization);
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
    const applied=applyRemodelingProposal(graph,remodelingProgram,proposal,remodeling,k,
      Math.floor(64*resources*(.5+.5*f.rest)));
    graph=applied.graph;remodeling=applied.chronology;
  }
  const wave=graph.events.findLast(e=>e.kind==="repattern")?.physical?.operation.id;
  const iterative=stepIterativeChronology(program,graph,prior.iterative,{atHour:n,resources,light:null},
    {enablePhysicalFields:true,care:f,...(wave?{developmentalFields:
      expressedRepatterningFields(graph,program.signals.channels,remodelingProgram.seed,wave)}:{})});
  graph=iterative.graph;
  const added=graph.events.slice(prior.graph.events.length);
  if(added.some(e=>e.atHour!==k))throw new RangeError("Primitive attempted a between-check physical mutation");
  const events:MaterialEvent[]=added.map(e=>({...e,atHour:k*DAILY_HOURS,atMs:window.endMs,
    checkIndex:k,careDigest:window.provenanceDigest,genomeFingerprint:program.genomeFingerprint,
    ...(e.physical?{physical:{...e.physical,relocations:e.physical.relocations.map(m=>({...m,checkIndex:k,atMs:window.endMs}))}}:{})}));
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
  seal(next);
  verifyDailyMaterialInventory(next.graph,prior.hatchAtMs,k,program.source,authorization,prior.graph);
  return next;
}

/** Independent EVAL-004 falsifier. Clock expectations use integer BigInt
 * division, inventories/ownership use the independent EVAL-002 auditor, and
 * submitted cache state is compared to a fresh public production reconstruction.
 * Target silhouettes never enter reconstruction or operator compilation. */
import {createSimulation,type PetPart,type Pixel} from "../src/simulation";
import type {GameState} from "../src/gameplay";
import type {DailyMaterialState} from "../src/development";
import {auditPhysicalEvidence,auditRenderedOwnership,type RenderWitness} from "./alg-evaluation-material-proof";
export function evaluateDailyEvidence(args:Readonly<{
  source:PetPart[];game:GameState;atMs:number;state?:DailyMaterialState;
  pixels?:readonly Pixel[];renderWitness?:RenderWitness;
}>):Readonly<{status:"pass"|"fail"|"unresolved";reasons:readonly string[]}>{
  const {game,state,atMs}=args;const reasons:string[]=[];
  if(!Number.isSafeInteger(atMs)||atMs<game.clock.hatchAtMs||atMs>game.clock.nowMs)
    return {status:"fail",reasons:["invalid-absolute-timestamp"]};
  if(!state)return {status:"unresolved",reasons:["physical-state-unavailable"]};
  const hatch=game.clock.hatchAtMs;
  const quotient=(BigInt(atMs)-BigInt(hatch))/86_400_000n;
  const expected=Number(quotient>365n?365n:quotient);
  if(state.completedChecks!==expected||state.checks.length!==expected)reasons.push("daily-check-inventory");
  for(let i=0;i<state.checks.length;i++){
    const c=state.checks[i];
    if(c.checkIndex!==i+1||c.atMs!==hatch+(i+1)*86400000||c.checkIndex>365||c.atMs>atMs)
      reasons.push("fabricated-or-duplicate-check");
  }
  for(const e of state.graph.events){
    const k=e.checkIndex;
    if(!Number.isSafeInteger(e.atMs)||!Number.isInteger(k)||k!<1||k!>365||
        e.atMs!==hatch+k!*86400000||e.atHour!==k!*24||e.atMs!>atMs)
      reasons.push("unauthorized-physical-transaction-time");
    if(e.genomeFingerprint!==state.genomeFingerprint)reasons.push("transaction-genome-mismatch");
  }
  const physical=auditPhysicalEvidence(state.graph,(atMs-hatch)/3600000);
  // The ledger auditor withholds execution certification by itself. This
  // function supplies that missing evidence by exact fresh replay below.
  reasons.push(...physical.errors.filter(r=>r!=="operation-execution-not-independently-replayed"));
  try{
    const age=(atMs-game.clock.startedAtMs)/86400000;
    const reference=createSimulation(args.source,game.seed,game.mode,{careGame:game,reuseLivingMaterial:false});
    const replay=reference.materialStateAt(age);
    if(JSON.stringify(replay)!==JSON.stringify(state))reasons.push("cache-or-evidence-replay-disagrees");
  }catch{reasons.push("recorded-life-reconstruction-failed");}
  if(reasons.length)return {status:"fail",reasons:[...new Set(reasons)]};
  if(!args.pixels?.length||!args.renderWitness)return {status:"unresolved",reasons:["rendered-ownership-unavailable"]};
  const ownership=auditRenderedOwnership(args.pixels,state.graph,args.renderWitness);
  return {status:ownership.status==="verified"?"pass":ownership.status==="invalid"?"fail":"unresolved",
    reasons:ownership.errors};
}

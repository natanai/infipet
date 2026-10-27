/**
 * PERF-001: a bounded, content-verified chronology handoff for an ACTUAL
 * createSimulation() lifecycle. No App change is required. Each new GameState
 * has fresh Environment/needs computations; only already-completed physical
 * chronology may be transferred.
 *
 * Safety theorem: environmental pressure at t depends solely on birth seed,
 * source genotype, recorded commands with atHour <= t, and samples at
 * hour <= t. The need simulator processes canonical historical keyframes,
 * never future events. Equality of all older records, exact prefix ordering,
 * the birth clock, and pressure at imported integer checkpoints proves all
 * material and resource inputs to those checkpoints are unchanged.
 *
 * Newly appended evidence at u invalidates checkpoints AFTER floor(u).
 * Since integer-hour growth for [u-1,u) consumes pressure at u-1, a state at
 * integer u remains valid; pressure equality checks may conservatively reject
 * even that state. Edits, truncation or a regressed horizon reject ALL reuse.
 *
 * Checkpoints are defensively copied by unified-runtime. No mutable graph is
 * shared between simultaneous GameState snapshots or different organisms.
 */
import type { GameState } from "../gameplay";
import { compileLifetimeRemodeling, type MaterialDevelopmentProgram } from "../development";
import type { InheritedGenome } from "../simulation/genome";
import type { EnvironmentalHistory, CareOperatorChronology } from "../environment";
import {
  createUnifiedMaterialTimeline, type UnifiedMaterialTimeline,
} from "./unified-runtime";

const MAX_LIVES=3;
type Evidence = Readonly<{
  maxHour: number;
  seed: string;
  mode: GameState["mode"];
  startedAtMs: number;
  hatchAtMs: number;
  samples: readonly string[];
  commands: readonly string[];
}>;
type Entry = {
  program: MaterialDevelopmentProgram;
  genomeIdentity: string;
  remodelingIdentity: string;
  evidence: Evidence;
  history: EnvironmentalHistory;
  timeline: UnifiedMaterialTimeline;
};
const lives=new Map<string,Entry>();
let transfers=0,rejections=0, coldStarts=0;
export function getLivingTimelineCacheStats(){
  return Object.freeze({entries:lives.size,limit:MAX_LIVES,
    transfers,rejections,coldStarts});
}
function evidenceOf(game:GameState,history:EnvironmentalHistory):Evidence {
  return {
    maxHour:history.maxHour,seed:game.seed,mode:game.mode,
    startedAtMs:game.clock.startedAtMs,hatchAtMs:game.clock.hatchAtMs,
    samples:history.samples.map(s=>JSON.stringify(s)),
    commands:history.commands.map(c=>JSON.stringify(c)),
  };
}
function isPrefix(old:readonly string[], next:readonly string[]):boolean {
  return old.length<=next.length &&
    old.every((serialized,i)=>serialized===next[i]);
}
function consistentOrigin(a:Evidence,b:Evidence):boolean {
  return a.seed===b.seed&&a.mode===b.mode&&
    a.hatchAtMs===b.hatchAtMs&&a.startedAtMs===b.startedAtMs;
}
function earliestAdded(prior:Entry,next:Evidence,history:EnvironmentalHistory){
  const old=prior.evidence;
  let first=Math.min(old.maxHour,next.maxHour);
  for(let i=old.samples.length;i<next.samples.length;i++)
    first=Math.min(first,history.samples[i].hour);
  for(let i=old.commands.length;i<next.commands.length;i++)
    first=Math.min(first,history.commands[i].atHour);
  return Math.max(0,Math.floor(first));
}
/**
 * Cache identity includes the complete canonical drawing signature, permanent
 * seed/mode/genome, and the exact compiled material object. A custom test
 * program must bypass this helper altogether.
 */
export function createReusedLivingTimeline(args:Readonly<{
  birthKey:string;
  genomeIdentity:string;
  program:MaterialDevelopmentProgram;
  genome:InheritedGenome;
  game:GameState;
  history:EnvironmentalHistory;
  care:CareOperatorChronology;
}>):UnifiedMaterialTimeline {
  const {birthKey,genomeIdentity,program,genome,game,history,care}=args;
  const evidence=evidenceOf(game,history);
  // Verify the actual permanent remodeling schedule, not merely seed/hour.
  // The same program is otherwise compiled by createUnifiedMaterialTimeline.
  const remodelingProgram=compileLifetimeRemodeling(program,genome);
  const remodelingIdentity=JSON.stringify([
    remodelingProgram.version,remodelingProgram.seed,
    remodelingProgram.genomeFingerprint,remodelingProgram.signals,
    remodelingProgram.birth.sourceFingerprint,remodelingProgram.operations,
  ]);
  const prior=lives.get(birthKey);
  let states:ReturnType<UnifiedMaterialTimeline["exportCanonicalStates"]>=[];
  if(prior &&
     prior.program===program &&
     prior.genomeIdentity===genomeIdentity &&
     prior.remodelingIdentity===remodelingIdentity &&
     consistentOrigin(prior.evidence,evidence) &&
     evidence.maxHour>=prior.evidence.maxHour &&
     isPrefix(prior.evidence.samples,evidence.samples) &&
     isPrefix(prior.evidence.commands,evidence.commands)) {
    const cutoff=earliestAdded(prior,evidence,history);
    // Pressure equality defends against future-dependent implementations
    // accidentally introduced into EnvironmentalHistory in future releases.
    const newEvidenceAppended =
      evidence.samples.length!==prior.evidence.samples.length ||
      evidence.commands.length!==prior.evidence.commands.length;
    states=prior.timeline.exportCanonicalStates(cutoff).filter(s=>
      // With no new record, the byte-identical historical prefix is a
      // complete witness of equal EnvironmentPressure on [0, old.maxHour].
      // This is the overwhelmingly common one-second physiological tick.
      // New commands/samples additionally compare both boundary pressures.
      !newEvidenceAppended || (
        JSON.stringify(prior.history.atHour(s.atHour))===
          JSON.stringify(history.atHour(s.atHour)) &&
        JSON.stringify(prior.history.atHour(s.atHour-1))===
          JSON.stringify(history.atHour(s.atHour-1))
      ));
    if(states.length) transfers++;
  } else {
    if(prior)rejections++;
    coldStarts++;
  }
  let timeline:UnifiedMaterialTimeline;
  try {
    timeline=createUnifiedMaterialTimeline({
      program,genome,care,history,remodelingProgram,canonicalStates:states,
    });
  } catch(error) {
    // A stale or externally mutated checkpoint must NEVER crash the actual
    // player. Fail closed to the independently reconstructible birth state.
    // Preserve unrelated errors, including invalid care/genome contracts.
    if(!(error instanceof TypeError) ||
       !error.message.startsWith("Cannot import an incompatible or fractional material checkpoint"))
      throw error;
    rejections++;coldStarts++;
    timeline=createUnifiedMaterialTimeline({
      program,genome,care,history,remodelingProgram,
    });
  }
  lives.delete(birthKey);
  lives.set(birthKey,{program,genomeIdentity,remodelingIdentity,
    evidence,history,timeline});
  while(lives.size>MAX_LIVES)lives.delete(lives.keys().next().value!);
  return timeline;
}

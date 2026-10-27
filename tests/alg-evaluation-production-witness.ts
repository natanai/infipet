/**
 * EVAL-002 executable production witness, independent of target silhouettes.
 *
 * Only THIS constructor can grant an opaque evaluation witness. It calls
 * createSimulation on user ink/seed, intercepts the actual unmodified compiled
 * program + permanent genome, separately constructs a fresh unified timeline,
 * and independently replays every age from immutable birth. Frames come from
 * the real renderer, NEVER from a recreated template or an invented graph.
 *
 * No retro reference is imported here; arbitrary reference masks are supplied
 * later to the pure scoring library.
 */
import { createSimulation } from "../src/simulation";
import { createUnifiedMaterialTimeline } from "../src/integration/unified-runtime";
import type { PetPart, Pixel } from "../src/simulation/model";
import type { MaterialDevelopmentProgram } from "../src/development";
import type { InheritedGenome } from "../src/simulation/genome";
import type { StageSample, RenderWitness } from "./alg-evaluation-trajectory-metrics";
import { auditPhysicalEvidence, auditRenderedOwnership } from "./alg-evaluation-material-proof";

type Authenticated = Readonly<{ snapshot: string; programFingerprint: string; seed: string }>;
const authenticated = new WeakMap<object, Authenticated>();

function snapshot(sample: StageSample): string {
  return JSON.stringify([sample.atHour,sample.graph,sample.pixels,
    sample.renderWitness,sample.renderScope]);
}
/** Integrity-checked runtime-only brand. Caller-set flags, IDs or clone copies do not qualify. */
export function isIndependentlyReplayedProductionSample(sample: StageSample): boolean {
  const record=authenticated.get(sample);
  return record!==undefined && record.snapshot===snapshot(sample);
}
export type ProductionWitness = Readonly<{
  samples: readonly StageSample[];
  programFingerprint: string;
  genomeFingerprint: string;
  sourceFingerprint: string;
  seed: string;
  counts: Readonly<{
    stages:number; materialPixels:number; annotatedPixels:number;
    generatedCells:number; graphEvents:number; genuinelyVerifiedStages:number;
  }>;
  limitations: readonly string[];
}>;
type RuntimeQuad = Readonly<{ partId:string;cellId:string;quad:readonly {x:number;y:number}[] }>;
const identical=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
const copy=(parts:readonly PetPart[]):PetPart[]=>parts.map(p=>({
  ...p,position:{...p.position},pixels:p.pixels.map(x=>({...x})),
}));

/** Numbers are hours since hatching. Production frame age is hour/24 days. */
export function buildProductionTrajectoryWitness(
  authored:readonly PetPart[],seed:string,hours:readonly number[],
  options: Readonly<{renderScope?:"physical-material"|"composited-screen"}> = {},
):ProductionWitness{
  if(!seed||!hours.length||hours.length>16||
     hours.some(h=>!Number.isFinite(h)||h<0))
    throw new RangeError("Invalid seed or milestone hours");
  let program:MaterialDevelopmentProgram|undefined;
  let genome:InheritedGenome|undefined;
  const sim=createSimulation(copy(authored),seed,"infant",{
    verifyMaterialProgram:(canonical,inherited)=>{
      program=canonical;genome=inherited;
      return {program:canonical}; // no edits to the actual compiled program
    },
  });
  if(!program||!genome)throw new Error("Missing production genotype/program capture");
  const physical=program as MaterialDevelopmentProgram;
  const inherited=genome as InheritedGenome;
  if(physical.genomeFingerprint!==inherited.genotype.fingerprint)
    throw new TypeError("Birth genotype differs from development program");
  const primary=createUnifiedMaterialTimeline({program:physical,genome:inherited});
  const independent=createUnifiedMaterialTimeline({program:physical,genome:inherited});
  const birth=primary.birth().graph;
  if(!identical(birth,independent.replay(0).graph)||
     !identical(birth,physical.source))
    throw new TypeError("Development does not independently replay immutable birth");

  let materialPixels=0,annotatedPixels=0,generatedCells=0,graphEvents=0,verified=0;
  const limitations:string[]=[];
  const samples:StageSample[]=[];
  const ordered=[...hours].sort((a,b)=>a-b);
  if(new Set(ordered).size!==ordered.length)throw new RangeError("Duplicate milestone hour");
  for(const hour of ordered){
    if(hour>primary.maxHour)throw new RangeError("Milestone exceeds production chronology");
    const frame=sim.frameAt(hour/24,{time:0,action:"idle"});
    const a=primary.at(hour).graph,b=independent.replay(hour).graph;
    if(!identical(a,b))throw new TypeError("Live cached graph disagrees with independent chronological replay");
    const diag=(frame.interaction.diagnostics as
      {physicalMaterial?:{sourceFingerprint:string;generatedCells:number;graphEvents:number;
        renderedCellQuads?:readonly RuntimeQuad[]};
        camera?:{scale:number;offset:{x:number;y:number}}}|undefined);
    // The exact birth-paint bypass intentionally returns authored pixels
    // without physical quads. Keep that stage measurable but unresolved: it
    // cannot be falsely certified by provenance added after rendering.
    if(diag?.physicalMaterial){
      if(diag.physicalMaterial.sourceFingerprint!==a.sourceFingerprint||
         diag.physicalMaterial.generatedCells!==a.cells.filter(c=>c.provenance==="generated").length||
         diag.physicalMaterial.graphEvents!==a.events.length)
        throw new TypeError("Renderer's same-age graph diagnostics diverge at hour "+hour);
    }else if(hour!==0)
      throw new TypeError("Nonbirth frame lacks authoritative material diagnostics at hour "+hour);
    const quads=diag?.physicalMaterial?.renderedCellQuads??[];
    const renderWitness:RenderWitness|undefined=quads.length?{
      projections:quads.map(q=>({cellId:q.cellId,quad:q.quad.map(p=>({...p}))})),
      ...(diag?.camera?{camera:diag.camera}:{}),
    }:undefined;
    // Frame pixels are the composited *visible* screen. Part annotation alone
    // is not enough: an occluded cell does not become visible by fiat.
    const pixels:Pixel[]=frame.pixels
      .filter(p=>options.renderScope==="composited-screen"||!diag?.physicalMaterial||
        !!p.materialCellId).map(p=>({...p}));
    const sampled:StageSample={id:"production-"+hour,atHour:hour,
      pixels,renderScope:options.renderScope??"physical-material",
      graph:a,...(renderWitness?{renderWitness}:{})};
    const physicalResult=auditPhysicalEvidence(a,hour);
    const renderResult=auditRenderedOwnership(pixels,a,renderWitness);
    const frameIsTraceable=physicalResult.status!=="invalid"&&
      renderResult.status==="verified"&&pixels.length>0;
    // Successful independent replay of the SAME canonical program, seed and
    // input plus independently audited ledger and transported pixel ownership
    // is the additional execution evidence a bare graph cannot supply.
    if(frameIsTraceable){
      authenticated.set(sampled,{snapshot:snapshot(sampled),
        programFingerprint:physical.fingerprint,seed});
      verified++;
    }else limitations.push("age "+hour+": "+[
      ...physicalResult.errors,...renderResult.errors,
    ].join(","));
    samples.push(sampled);
    materialPixels+=pixels.filter(p=>p.materialCellId).length;
    annotatedPixels+=frame.parts.flatMap(p=>p.pixels.filter(cell=>cell.materialCellId)).length;
    generatedCells+=a.cells.filter(c=>c.provenance==="generated").length;
    graphEvents+=a.events.length;
  }
  return {samples,programFingerprint:physical.fingerprint,
    genomeFingerprint:inherited.genotype.fingerprint,
    sourceFingerprint:physical.source.sourceFingerprint,seed,
    counts:{stages:samples.length,materialPixels,annotatedPixels,
      generatedCells,graphEvents,genuinelyVerifiedStages:verified},limitations};
}

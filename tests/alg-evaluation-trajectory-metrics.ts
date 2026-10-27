/**
 * EVAL-002 independent, target-blind measurement. No imports of retro targets,
 * genome, generator, or growth code are permitted in this module.
 *
 * Inputs: raster cells at explicit hours; optional authoritative MaterialGraph.
 * Outputs: stage metrics, topology evidence, unresolved/failure reasons, whole
 * trajectory score. Pure and deterministic: no RNG, clock, I/O or mutation.
 *
 * Numerical contract v1:
 * - Pixel centers are signed safe integers; <=4096 unique cells, bounding
 *   dimensions <=128. Duplicates collapse; colors/layers/metadata are ignored.
 * - Normalization: translation by (minX,minY); isotropic scale
 *   s=(31/max(1,maxX-minX,maxY-minY)), centered residual padding. Coordinates
 *   are rasterized at floor(t+0.5) and clipped to [0,31]; no rotation or
 *   reflection alignment. These are finite integer sample points, not
 *   area-filling artwork. Uniform *coordinate* scaling preserves overlap,
 *   not necessarily raw connectedness of resampled discrete material.
 * - Raw topology: 8-neighbor foreground components, 4-neighbor exterior
 *   background cavities. Skeleton: simultaneous two-subpass Zhang-Suen
 *   deletion until stable, then crossing-number endpoints/junction groups.
 * - Major axis: covariance of occupied source centers with population /N,
 *   angle=0.5*atan2(2 covXY,covXX-covYY), modulo pi. If eigenvalue
 *   difference <=1e-10*max(1,sum) orientation=null, tie unresolved.
 * - All intermediate arithmetic IEEE 754 double. Ratios clamp to [0,1].
 *   Composite scores are rounded once to 12 decimal places, half-up via
 *   floor(x*1e12+0.5)/1e12 on nonnegative numbers (including exact 1);
 *   this eliminates accumulated weighting roundoff, not threshold failures.
 *   Sorting is by numeric y then x or by supplied chronological hour.
 *   Nonfinite values and duplicate stage timestamps are rejected.
 * - A reported "pass" is ONLY evidence of declared numerical geometry and
 *   valid recorded material ancestry, never historical-game parity. Full
 *   seed/command-history witnesses belong to EVAL-003.
 */
import type { MaterialGraph } from "../src/development";
import { isIndependentlyReplayedProductionSample } from "./alg-evaluation-production-witness";
import {
  auditPhysicalEvidence, auditRenderedOwnership,
  type PhysicalEvidence, type RenderEvidence,
  type RenderedInkPoint, type RenderWitness,
} from "./alg-evaluation-material-proof";
export { auditPhysicalEvidence, auditRenderedOwnership } from "./alg-evaluation-material-proof";
export type {
  PhysicalEvidence, RenderEvidence, RenderedInkPoint, RenderWitness,
} from "./alg-evaluation-material-proof";

export type InkPoint = Readonly<{ x: number; y: number }>;
export type StageSample = Readonly<{
  id: string; atHour: number; pixels: readonly RenderedInkPoint[];
  graph?: MaterialGraph; renderWitness?: RenderWitness;
}>;
export type ReferenceMilestone = Readonly<{ id: string; atHour: number; pixels: readonly InkPoint[]; metadata?: Readonly<Record<string, unknown>> }>;
export type EvaluationLimits = Readonly<{ resolution: 32; maxCells: 4096; maxWidth: 128; maxHeight: 128; maxStages: 16 }>;
export const EVALUATION_LIMITS: EvaluationLimits = {
  resolution: 32, maxCells: 4096, maxWidth: 128, maxHeight: 128, maxStages: 16,
};
/** Predeclared global gate, never dynamically adjusted per target. */
export const TRAJECTORY_GATE = Object.freeze({
  minStageScore: 0.8, minIoU: 0.65, minStructuralScore: 0.78,
  minAggregateScore: 0.82, minStages: 2,
});
export type ShapeMetrics = Readonly<{
  occupied: number; normalizedOccupancy: number; rawDensity: number;
  width: number; height: number; proportions: number;
  components: number; holes: number; orientationRadians: number | null;
  axialAnisotropy: number; skeletonEndpoints: number; skeletonJunctions: number;
}>;
export type StageEvaluation = Readonly<{
  id: string; atHour: number;
  status: "pass" | "fail" | "unresolved";
  shapeScore: number | null; silhouetteIoU: number | null;
  structuralScore: number | null;
  scores: Readonly<{
    occupancy: number; proportions: number; components: number; holes: number;
    orientation: number; elongation: number; branching: number;
  }> | null;
  observed: ShapeMetrics | null; reference: ShapeMetrics | null;
  physical: PhysicalEvidence;
  rendering: RenderEvidence;
  mismatches: readonly string[]; reasons: readonly string[];
}>;
export type TrajectoryEvaluation = Readonly<{
  version: "retro-trajectory-evaluation-v1";
  status: "pass" | "fail" | "unresolved";
  scope: "numerical-resemblance-not-hardware-parity";
  thresholds: typeof TRAJECTORY_GATE;
  stages: readonly StageEvaluation[];
  aggregateScore: number | null;
  weakestStageScore: number | null;
  reasons: readonly string[];
}>;

const clamp01 = (n:number) => Math.max(0,Math.min(1,n));
const round12 = (n:number) => Math.floor(clamp01(n)*1e12+0.5)/1e12;
const key = (p:InkPoint) => p.x+","+p.y;
const neighbors8 = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]] as const;
const neighbors4 = [[0,-1],[1,0],[0,1],[-1,0]] as const;
const sorted = (v:readonly InkPoint[]) => [...v].sort((a,b)=>a.y-b.y||a.x-b.x);

function canonical(points:readonly InkPoint[]):InkPoint[] {
  if(points.length>EVALUATION_LIMITS.maxCells) throw new RangeError("too many cells");
  const unique = new Map<string,InkPoint>();
  for(const p of points) {
    if(!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y))
      throw new RangeError("pixel coordinates must be safe integers");
    unique.set(key(p),{x:p.x,y:p.y});
  }
  const result=sorted([...unique.values()]);
  if(result.length) {
    const xs=result.map(p=>p.x),ys=result.map(p=>p.y);
    if(Math.max(...xs)-Math.min(...xs)+1>EVALUATION_LIMITS.maxWidth||
       Math.max(...ys)-Math.min(...ys)+1>EVALUATION_LIMITS.maxHeight)
      throw new RangeError("drawing bounds exceed evaluator limits");
  }
  return result;
}
function bbox(points:readonly InkPoint[]) {
  if(!points.length)return {x:0,y:0,width:0,height:0,spanX:0,spanY:0};
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const minX=Math.min(...xs),minY=Math.min(...ys);
  const spanX=Math.max(...xs)-minX,spanY=Math.max(...ys)-minY;
  return {x:minX,y:minY,width:spanX+1,height:spanY+1,spanX,spanY};
}
/** Normalize POINT SAMPLES (not sprite templates) without the object's origin or size. */
export function normalizedMask(points:readonly InkPoint[]):ReadonlySet<string> {
  const p=canonical(points); if(!p.length)return new Set();
  const b=bbox(p), extent=Math.max(1,b.spanX,b.spanY);
  const scale=(EVALUATION_LIMITS.resolution-1)/extent;
  const padX=((EVALUATION_LIMITS.resolution-1)-b.spanX*scale)/2;
  const padY=((EVALUATION_LIMITS.resolution-1)-b.spanY*scale)/2;
  return new Set(p.map(cell=>{
    const x=Math.min(31,Math.max(0,Math.floor((cell.x-b.x)*scale+padX+0.5)));
    const y=Math.min(31,Math.max(0,Math.floor((cell.y-b.y)*scale+padY+0.5)));
    return x+","+y;
  }));
}
export function silhouetteIoU(left:readonly InkPoint[],right:readonly InkPoint[]):number {
  const a=normalizedMask(left),b=normalizedMask(right);
  const both=[...a].filter(k=>b.has(k)).length;
  const union=a.size+b.size-both;
  return union===0?1:both/union;
}
function components(points:readonly InkPoint[]):number {
  const occupied=new Set(points.map(key)),seen=new Set<string>();
  let count=0;
  for(const p of points) {
    if(seen.has(key(p)))continue;
    count++;const q=[p];seen.add(key(p));
    for(let i=0;i<q.length;i++)for(const [dx,dy] of neighbors8){
      const n={x:q[i].x+dx,y:q[i].y+dy},k=key(n);
      if(occupied.has(k)&&!seen.has(k)){seen.add(k);q.push(n);}
    }
  }
  return count;
}
function holes(points:readonly InkPoint[]):number {
  if(!points.length)return 0;
  const b=bbox(points),occupied=new Set(points.map(key)),seen=new Set<string>();
  const xmin=b.x-1,xmax=b.x+b.width,ymin=b.y-1,ymax=b.y+b.height;
  let holes=0;
  for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
    const k=x+","+y;
    if(occupied.has(k)||seen.has(k))continue;
    const q=[{x,y}];seen.add(k);let exterior=false;
    for(let i=0;i<q.length;i++){
      const p=q[i];if(p.x===xmin||p.x===xmax||p.y===ymin||p.y===ymax)exterior=true;
      for(const [dx,dy] of neighbors4){
        const nx=p.x+dx,ny=p.y+dy,nk=nx+","+ny;
        if(nx<xmin||nx>xmax||ny<ymin||ny>ymax||seen.has(nk)||occupied.has(nk))continue;
        seen.add(nk);q.push({x:nx,y:ny});
      }
    }
    if(!exterior)holes++;
  }
  return holes;
}
function thin(points:readonly InkPoint[]):InkPoint[] {
  let active=new Set(points.map(key));
  const look=(x:number,y:number)=>[
    [x,y-1],[x+1,y-1],[x+1,y],[x+1,y+1],
    [x,y+1],[x-1,y+1],[x-1,y],[x-1,y-1]
  ].map(([a,b])=>active.has(a+","+b)?1:0);
  for(let iter=0;iter<2*EVALUATION_LIMITS.maxWidth;iter++){
    let changed=false;
    for(let phase=0;phase<2;phase++){
      const remove:string[]=[];
      for(const p of points){
        if(!active.has(key(p)))continue;
        const n=look(p.x,p.y),total=n.reduce<number>((a,b)=>a+b,0);
        const crossing=n.reduce<number>((a,b,i)=>a+(!b&&n[(i+1)%8]?1:0),0);
        if(total<2||total>6||crossing!==1)continue;
        const [N,,E,,S,,W]=n;
        if(phase===0?(N*E*S===0&&E*S*W===0):(N*E*W===0&&N*S*W===0))
          remove.push(key(p));
      }
      for(const k of remove)active.delete(k);
      if(remove.length)changed=true;
    }
    if(!changed)break;
  }
  return points.filter(p=>active.has(key(p)));
}
function topology(points:readonly InkPoint[]) {
  const skeleton=thin(points),set=new Set(skeleton.map(key));
  const junctionPoints:InkPoint[]=[];let endpoints=0;
  for(const p of skeleton){
    const n=[
      [0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]
    ].map(([dx,dy])=>set.has((p.x+dx)+","+(p.y+dy))?1:0);
    const cn=n.reduce<number>((a,b,i)=>a+(!b&&n[(i+1)%8]?1:0),0);
    if(cn===1)endpoints++;
    if(cn>=3)junctionPoints.push(p);
  }
  return {endpoints,junctions:components(junctionPoints)};
}
export function describeShape(input:readonly InkPoint[]):ShapeMetrics {
  const points=canonical(input),b=bbox(points);
  if(!points.length)return {
    occupied:0,normalizedOccupancy:0,rawDensity:0,width:0,height:0,
    proportions:1,components:0,holes:0,orientationRadians:null,
    axialAnisotropy:0,skeletonEndpoints:0,skeletonJunctions:0,
  };
  const n=points.length,cx=points.reduce((s,p)=>s+p.x,0)/n,
    cy=points.reduce((s,p)=>s+p.y,0)/n;
  const xx=points.reduce((s,p)=>s+(p.x-cx)**2,0)/n,
    yy=points.reduce((s,p)=>s+(p.y-cy)**2,0)/n,
    xy=points.reduce((s,p)=>s+(p.x-cx)*(p.y-cy),0)/n;
  const gap=Math.hypot(xx-yy,2*xy),trace=xx+yy;
  const angle=gap<=1e-10*Math.max(1,trace)?null:0.5*Math.atan2(2*xy,xx-yy);
  const t=topology(points);
  return {
    occupied:n,normalizedOccupancy:normalizedMask(points).size/1024,
    rawDensity:n/(b.width*b.height),
    width:b.width,height:b.height,
    proportions:Math.max(1,b.spanX)/Math.max(1,b.spanY),
    components:components(points),holes:holes(points),
    orientationRadians:angle,axialAnisotropy:trace?clamp01(gap/trace):0,
    skeletonEndpoints:t.endpoints,skeletonJunctions:t.junctions,
  };
}
const countSimilarity=(a:number,b:number)=>1/(1+Math.abs(a-b));
function scoreShape(a:ShapeMetrics,b:ShapeMetrics,iou:number){
  const occupancy=clamp01(1-Math.abs(a.normalizedOccupancy-b.normalizedOccupancy));
  const proportions=Math.min(a.proportions,b.proportions)/Math.max(a.proportions,b.proportions);
  const componentScore=countSimilarity(a.components,b.components),holeScore=countSimilarity(a.holes,b.holes);
  const orientation=a.orientationRadians===null&&b.orientationRadians===null?1:
    a.orientationRadians===null||b.orientationRadians===null?0:
    Math.abs(Math.cos(a.orientationRadians-b.orientationRadians));
  const elongation=clamp01(1-Math.abs(a.axialAnisotropy-b.axialAnisotropy));
  const branching=1/(1+Math.abs(a.skeletonJunctions-b.skeletonJunctions)+
    Math.abs(a.skeletonEndpoints-b.skeletonEndpoints)/2);
  const structuralScore=0.3*componentScore+0.3*holeScore+0.4*branching;
  const shapeScore=0.36*iou+0.10*occupancy+0.08*proportions+
    0.10*componentScore+0.10*holeScore+0.06*orientation+
    0.08*elongation+0.12*branching;
  return {shapeScore:round12(shapeScore),structuralScore:round12(structuralScore),
    scores:{occupancy,proportions,components:componentScore,holes:holeScore,
      orientation,elongation,branching}};
}
export function evaluateTrajectory(
  actual:readonly StageSample[],references:readonly ReferenceMilestone[],
  expectedSourceFingerprint?:string,
):TrajectoryEvaluation{
  if(!actual.length||actual.length>EVALUATION_LIMITS.maxStages||
    !references.length||references.length>EVALUATION_LIMITS.maxStages)
    throw new RangeError("stage count must be 1..16");
  const check=(items:readonly {id:string;atHour:number}[])=>{
    const names=new Set<string>(),hours=new Set<number>();
    for(const s of items){
      if(!s.id||!Number.isFinite(s.atHour)||s.atHour<0||names.has(s.id)||hours.has(s.atHour))
        throw new RangeError("stage IDs and nonnegative chronology must be unique");
      names.add(s.id);hours.add(s.atHour);
    }
  };
  check(actual);check(references);
  const byHour=new Map(actual.map(s=>[s.atHour,s]));
  const ordered=[...references].sort((a,b)=>a.atHour-b.atHour||a.id.localeCompare(b.id));
  const stages=ordered.map(reference=>{
    const frame=byHour.get(reference.atHour);
    const physical=auditPhysicalEvidence(frame?.graph,reference.atHour);
    const rendering=auditRenderedOwnership(frame?.pixels??[],frame?.graph,frame?.renderWitness);
    const independentlyReplayed=!!frame&&isIndependentlyReplayedProductionSample(frame);
    const physicalReplayed=independentlyReplayed&&physical.status!=="invalid"&&
      physical.errors.every(e=>e==="operation-execution-not-independently-replayed");
    if(!frame)return {
      id:reference.id,atHour:reference.atHour,status:"unresolved" as const,
      shapeScore:null,silhouetteIoU:null,structuralScore:null,
      scores:null,observed:null,reference:null,physical,rendering,
      mismatches:[],reasons:["missing-generated-milestone"],
    };
    const observed=describeShape(frame.pixels),target=describeShape(reference.pixels);
    const iou=silhouetteIoU(frame.pixels,reference.pixels),
      score=scoreShape(observed,target,iou),reasons:string[]=[],mismatches:string[]=[];
    if(!observed.occupied||!target.occupied)reasons.push("insufficient-ink-for-resemblance");
    if(iou<TRAJECTORY_GATE.minIoU)mismatches.push("silhouette");
    if(observed.components!==target.components)mismatches.push("components");
    if(observed.holes!==target.holes)mismatches.push("enclosed-voids");
    if(observed.skeletonJunctions!==target.skeletonJunctions||
       observed.skeletonEndpoints!==target.skeletonEndpoints)mismatches.push("branching-endpoints");
    if(score.structuralScore<TRAJECTORY_GATE.minStructuralScore)mismatches.push("structural-threshold");
    if(physical.status==="unavailable")reasons.push("material-ancestry-unavailable");
    if(physical.status==="invalid")reasons.push("material-ancestry-invalid");
    if(rendering.status==="unavailable")reasons.push("rendered-material-provenance-unavailable");
    if(rendering.status==="invalid")reasons.push("rendered-material-provenance-invalid");
    if(!independentlyReplayed)reasons.push("independent-production-replay-unavailable");
    if(!physicalReplayed&&physical.status==="unavailable")
      reasons.push("physical-execution-evidence-insufficient");
    if(expectedSourceFingerprint&&physical.sourceFingerprint!==expectedSourceFingerprint)
      reasons.push("unexpected-birth-source");
    const numericalPass=score.shapeScore>=TRAJECTORY_GATE.minStageScore&&
      iou>=TRAJECTORY_GATE.minIoU&&score.structuralScore>=TRAJECTORY_GATE.minStructuralScore;
    // Negative evidence is conclusive even without topology. Missing
    // material only prevents declaring an otherwise good match supported.
    const status=!observed.occupied||!target.occupied?"unresolved" as const:
      physical.status==="invalid"||rendering.status==="invalid"||
      (expectedSourceFingerprint&&physical.sourceFingerprint!==expectedSourceFingerprint)||
      !numericalPass?"fail" as const:
      !physicalReplayed||rendering.status==="unavailable"
        ?"unresolved" as const:"pass" as const;
    return {id:reference.id,atHour:reference.atHour,status,
      shapeScore:score.shapeScore,silhouetteIoU:iou,structuralScore:score.structuralScore,
      scores:score.scores,observed,reference:target,physical,rendering,mismatches,reasons};
  });
  const scores=stages.map(s=>s.shapeScore).filter((x):x is number=>x!==null);
  const min=scores.length?Math.min(...scores):null,
    mean=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null;
  const aggregate=mean===null||min===null?null:round12((mean+min)/2);
  const reasons:string[]=[];
  if(ordered.length<TRAJECTORY_GATE.minStages)reasons.push("insufficient-milestones");
  if(actual.length!==references.length||actual.some(a=>!references.some(r=>r.atHour===a.atHour)))
    reasons.push("milestone-coverage-mismatch");
  if(stages.some(s=>s.status==="unresolved"))reasons.push("unresolved-stage-evidence");
  const origins=stages.map(s=>s.physical).filter(p=>p.status!=="unavailable");
  if(new Set(origins.map(p=>p.sourceFingerprint)).size>1||
     new Set(origins.map(p=>p.sourceAncestrySignature)).size>1)
    reasons.push("material-origin-changed-over-lifetime");
  // All earlier event evidence must be a byte-identical chronological prefix
  // of every later snapshot: no revised past, omitted event or retroactive
  // creation can masquerade as the same physical lifetime.
  const chron=[...actual].filter(s=>s.graph).sort((a,b)=>a.atHour-b.atHour);
  for(let i=1;i<chron.length;i++){
    const earlier=chron[i-1].graph!,later=chron[i].graph!;
    if(earlier.events.length>later.events.length||
       earlier.events.some((e,k)=>JSON.stringify(e)!==JSON.stringify(later.events[k]))){
      reasons.push("chronological-event-prefix-changed");break;
    }
  }
  if(stages.some(s=>s.status==="fail"))reasons.push("failed-stage");
  if(aggregate!==null&&aggregate<TRAJECTORY_GATE.minAggregateScore)
    reasons.push("aggregate-threshold-failed");
  const unresolved=reasons.some(s=>["insufficient-milestones",
    "milestone-coverage-mismatch","unresolved-stage-evidence"].includes(s));
  const conclusiveFailure=reasons.some(s=>["failed-stage",
    "aggregate-threshold-failed","material-origin-changed-over-lifetime",
    "chronological-event-prefix-changed"].includes(s));
  const status=conclusiveFailure?"fail":unresolved?"unresolved":"pass";
  return {version:"retro-trajectory-evaluation-v1",status,
    scope:"numerical-resemblance-not-hardware-parity",
    thresholds:TRAJECTORY_GATE,stages,aggregateScore:aggregate,
    weakestStageScore:min,reasons};
}

import {journalMaterialEvent} from "./material-journal";
import {sourcePigmentSupport,advancingInteriorParent} from "./material-front";
import {anatomicalContinuityFailure} from "./anatomical-continuity";
import {growthSupportDistance} from "./material-support";
/**
 * Shared single-tick numerical primitive. The daily production transaction interprets one tick as one daily opportunity, commits at T_k, and never runs 24 hourly physical steps. The stand-alone hour-named API and its long-domain tests are legacy numerical coverage, not a player-life schedule.
 */
/**
 * Composable DEV-003 hourly transaction for the ONE authoritative organism.
 *
 * Global order for each integer completion hour n+1:
 *   1. Starting from graph committed at n, apply due external proposals in
 *      ascending chronological order with n < event.atHour <= n+1.
 *   2. At equal timestamp n+1, external proposals precede iterative growth.
 *   3. stepIterativeChronology() observes that completed graph, allocates
 *      resources sampled for [n,n+1), and commits its own events at n+1.
 * Never feed an age-T graph to iterativeGrowthAt() as birth. Events with
 * timestamps > n+1 are future-dated and rejected; the step's own growth
 * cannot be moved before fractional remodeling by rounding event times.
 * A new external site observed in this step is eligible in [n+1,n+2);
 * a child site made by this step likewise activates at n+1.
 *
 * The persistent site record includes direction, full exact torus state,
 * elapsed extension/fork/lateral counts, activation time and invalidations.
 * A relocated tip with its SAME cell ID follows the relocated cell; a removed
 * tip without a documented physical succession, removed site registration,
 * or missing tissue irreversibly invalidates the site. No nearest-tip guesses
 * or implicit joins. A documented succession preserves the existing orbit
 * and lifetime counters. External site additions
 * are admitted only when registered on the current MaterialGraph and backed
 * by a live source-traceable cell. Existing event and tissue arrays are never
 * reconstructed from birth. Source material and birth genotype are immutable.
 *
 * Per integer interval [n,n+1), budget B=floor(4*resources(n)).
 * Eligible site weight and Hamilton integer allocation are exactly DEV-003's
 * allocateGrowthCredits() model. A successful proposal consumes one credit
 * and generates ONE cell with a real immediate parent. Suppressed proposals
 * spend none; B=spent+unspent, B=allocated+unassigned.
 *
 * Chaotic recurrence is stepChaos(x,y)=((2x+y) mod 65521,
 * (x+y) mod 65521). Each eligible or dormant living site advances exactly
 * one integer torus step per elapsed interval; newborn sites do not advance
 * before their activation. Floating point affects only bounded steering and
 * finite weight calculation, never the recurrence or integer resource totals.
 *
 * Lifetime policy: this composable stepper advances real hourly state through
 * the inclusive age 8192, matching the verified remodeling chronological
 * horizon. Its last interval is [8191,8192). Each hour remains fully
 * deterministic, even if material is spatially blocked or resources are 0:
 * allocations remain exact, sites/orbits are NEVER reset or wrapped, and
 * unspent credits are recorded. An attempted step beyond age 8192 throws,
 * never silently clamps. The old birth-only DEV-003 512-hour evaluator is
 * deliberately unchanged. No special anatomy is invented after maturity.
 *
 * Light is optional and NOT inferred from care. If light=null, steering has
 * no directional-light term. Runtime adapters may supply resources derived
 * from actual, chronological EnvironmentPressure; this module does not
 * fabricate the history or change genome channels.
 */
import { compareText, type Point } from "../simulation/model";
import { CHAOS_MODULUS, seedChaos, stepChaos, type ChaosState } from "./chaos";
import {
  allocateGrowthCredits, assessIterativePlacement, ITERATIVE_LIMITS,
  type GrowthSuppression, type IterativeExposure,
  type IterativeGrowthLedger, type GrowthCreditAllocation,
} from "./iterative-growth";
import type { MaterialDevelopmentProgram } from "./operators";
import { REMODEL_LIMITS } from "./lifetime-remodeling";
import {chooseMorphologicalField,rankMorphologicalField,
  morphologicalVolumeCapacity} from "./morphological-fields";
import {regionalGrowthDemand,developmentalAllometry,selectRegionalGrammar,regionalSourceScale,
  type RegionalCare} from "./regional-regulation";
import type {RepatterningField} from "./developmental-repatterning";

/** Inclusive supported age. No modulo clock, implicit maturity reset, or clamp. */
export const ITERATIVE_CHRONOLOGY_MAX_HOURS = REMODEL_LIMITS.maxAgeHours;
import type {
  MaterialCell, MaterialEvent, MaterialGraph, MaterialSite, MaterialTissue,
} from "./material-graph";

export type PersistentGrowthSite = Readonly<{
  id: string;
  tissueId: string;
  tipCellId: string;
  parentSiteId: string | null;
  activationHour: number;
  direction: Readonly<Point>;
  depth: number;
  extensions: number;
  forks: number;
  lateralCells: number;
  orbit: ChaosState;
  status: "active" | "dormant" | "blocked" | "invalidated";
}>;

export type GrowthSiteChange = Readonly<{
  atHour: number;
  siteId: string;
  kind: "introduced" | "invalidated" | "renewed";
  reason:
    | "birth" | "external-site" | "branch-born"
    | "tip-removed" | "root-removed" | "site-removed" | "tissue-removed"
    | "site-tissue-changed" | "source-invalid" | "material-site-turnover";
}>;

export type IterativeChronologyState = Readonly<{
  version: 1;
  /** Prevents swapping an animal's permanent growth program mid-lifetime. */
  fingerprint: string;
  genomeFingerprint: string;
  /** Next interval to execute; required to be an exact integer. */
  nextHour: number;
  sites: readonly PersistentGrowthSite[];
  ledger: readonly IterativeGrowthLedger[];
  suppressions: readonly GrowthSuppression[];
  changes: readonly GrowthSiteChange[];
}>;

export type IterativeChronologyStep = Readonly<{
  graph: MaterialGraph;
  state: IterativeChronologyState;
  ledger: IterativeGrowthLedger;
  events: readonly MaterialEvent[];
  suppressions: readonly GrowthSuppression[];
  changes: readonly GrowthSiteChange[];
}>;

const xy = (x: number, y: number) => x + "," + y;
const unit = (p: Point): Point => {
  const d = Math.hypot(p.x, p.y);
  return d > 1e-9 ? { x: p.x / d, y: p.y / d } : { x: 0, y: -1 };
};
const turn = (p: Point, a: number): Point => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

function validateExposure(exposure: IterativeExposure, n: number): void {
  if (!exposure || exposure.atHour !== n ||
      !Number.isFinite(exposure.resources) ||
      exposure.resources < 0 || exposure.resources > 1)
    throw new RangeError("Interval must have genuine [0,1] resource input at its exact hour");
  if (exposure.light !== null) {
    const light = exposure.light;
    if (!light || ![light.x, light.y, light.intensity].every(Number.isFinite) ||
        Math.abs(light.x) > 1 || Math.abs(light.y) > 1 ||
        light.intensity < 0 || light.intensity > 1 ||
        (light.intensity > 0 && Math.hypot(light.x, light.y) < 1e-9))
      throw new RangeError("Directional light must be supplied explicitly and bounded");
  }
}

function validateGraph(
  graph: MaterialGraph, birth: MaterialDevelopmentProgram, completionHour = 0,
) {
  if (graph.version !== 1 || graph.sourceFingerprint !== birth.source.sourceFingerprint ||
      (graph.sourceCells!==birth.source.sourceCells&&
       JSON.stringify(graph.sourceCells) !== JSON.stringify(birth.source.sourceCells)))
    throw new TypeError("Chronological material cannot exchange or rewrite original ink");
  const cells = new Map<string, MaterialCell>();
  const tissueIds = new Set(graph.tissues.map(t => t.id));
  const sources = new Set(birth.source.sourceCells.map(c => c.id));
  const siteIds = new Set<string>();
  if (graph.sites.length > ITERATIVE_LIMITS.sites)
    throw new RangeError("Authoritative growth-site count exceeds the finite limit");
  for (const s of graph.sites) {
    if (siteIds.has(s.id)) throw new TypeError("Duplicate material growth site");
    siteIds.add(s.id);
  }
  const creationEvents = new Map<string, MaterialEvent>();
  for (const event of graph.events) {
    for (const id of event.createdCellIds) {
      if (creationEvents.has(id))
        throw new TypeError("Material cell has multiple independent creation events");
      creationEvents.set(id, event);
    }
  }
  for (const cell of graph.cells) {
    if (cell.provenance === "authored" && !sources.has(cell.id))
      throw new TypeError("Unaccounted authored material cannot be introduced after birth");
    const creatingEvent = creationEvents.get(cell.id);
    // Remodeling records one event per indivisible unit, while its deposited
    // cell retains the parent operation ID. Existing operator events use the
    // exact operation ID. Both are explicit, inspectable causal witnesses.
    if (cell.provenance === "generated" &&
        (!cell.operationId || !creatingEvent ||
          (creatingEvent.id !== cell.operationId &&
            !creatingEvent.id.startsWith(cell.operationId + "/unit/"))))
      throw new TypeError("Generated material requires its exact historical creation event");
    if (cells.has(cell.id) || !tissueIds.has(cell.tissueId) ||
        !Number.isInteger(cell.x) || !Number.isInteger(cell.y) ||
        cell.x < 0 || cell.x >= 64 || cell.y < 0 || cell.y >= 64 ||
        !cell.sourceIds.length || !cell.sourceIds.every(id => sources.has(id)))
      throw new TypeError("Material contains invalid cell, coordinates or source ancestry");
    cells.set(cell.id, cell);
  }
  if (graph.cells.length - graph.sourceCells.length > ITERATIVE_LIMITS.addedCells)
    throw new RangeError("Authoritative material exceeds the shared growth limit");
  if (graph.events.some(event =>
      !Number.isFinite(event.atHour) ||
      event.atHour < 0 || event.atHour > completionHour))
    throw new RangeError("Authoritative graph contains a future or invalid material event");
  for (const link of graph.links) {
    if (!tissueIds.has(link.fromTissueId) || !tissueIds.has(link.toTissueId))
      throw new TypeError("Link refers to a missing tissue");
    if ((link.fromCellId && !cells.has(link.fromCellId)) ||
        (link.toCellId && !cells.has(link.toCellId)))
      throw new TypeError("Link contains an absent live endpoint");
  }
  return cells;
}

type MutableSite = {
  -readonly [P in keyof PersistentGrowthSite]: PersistentGrowthSite[P];
};

function sourceRoots(graph: MaterialGraph): Map<string, string> {
  const byId = new Map(graph.tissues.map(t => [t.id, t]));
  const roots = new Map<string, string>();
  for (const tissue of graph.tissues) {
    let current = tissue.id;
    const seen = new Set<string>();
    while (byId.get(current)?.parentId) {
      if (seen.has(current)) throw new TypeError("Cyclic material parent tissues");
      seen.add(current);
      const next = byId.get(current)!.parentId!;
      if (!byId.has(next)) throw new TypeError("Orphaned parent tissue");
      current = next;
    }
    roots.set(tissue.id, current);
  }
  return roots;
}

/** Permanently bound to the canonical birth genotype and initial site IDs. */
export function createIterativeChronologyState(
  birth: MaterialDevelopmentProgram,
): IterativeChronologyState {
  validateGraph(birth.source, birth);
  const cells = new Map(birth.source.cells.map(c => [c.id, c]));
  const tissues = new Map(birth.source.tissues.map(t => [t.id, t]));
  const initial = [...birth.source.sites].sort((a, b) => compareText(a.id, b.id))
    .filter(site => cells.get(site.rootCellId)?.tissueId === site.tissueId &&
      tissues.has(site.tissueId)).map((site): PersistentGrowthSite => ({
      id: site.id, tissueId: site.tissueId, tipCellId: site.rootCellId,
      parentSiteId: null, activationHour: 0, direction: unit(site.direction),
      depth: 0, extensions: 0, forks: 0, lateralCells: 0,
      orbit: seedChaos((birth.iterativeSeedFingerprint ?? birth.fingerprint) + "|" + site.id), status: "dormant",
    }));
  return {
    version: 1, fingerprint: birth.fingerprint,
    genomeFingerprint: birth.genomeFingerprint, nextHour: 0,
    sites: initial, ledger: [], suppressions: [],
    changes: initial.map(s => ({
      atHour: 0, siteId: s.id, kind: "introduced", reason: "birth",
    })),
  };
}

/**
 * One pure chronological transaction. No frame-query side effects, no resets
 * to birth graph, no changes to other operators' events. Operator precedence:
 * supplied graph (including all external actions through n+1) -> reconcile
 * registered tips -> resource competition -> geometry at n+1 -> next state.
 * External fractional proposals must already be applied in chronological
 * order. Tie-breaking at n+1 is external actions first, this step second.
 * The completion-time validation accepts times <= n+1, never later.
 * Age n+1 sees genuine completed fractional events, not a future snapshot.
 */
export function stepIterativeChronology(
  birth: MaterialDevelopmentProgram,
  graph: MaterialGraph,
  state: IterativeChronologyState,
  exposure: IterativeExposure,
  /** The exact 365-opportunity daily engine explicitly opts into expanded
   * physical field families. Omitted means legacy hourly numerical semantics,
   * which continue to have independently established oracles. */
  policy: Readonly<{enablePhysicalFields:boolean;care?:RegionalCare;
    developmentalFields?:ReadonlyMap<string,RepatterningField>}>={enablePhysicalFields:false},
): IterativeChronologyStep {
  if (state.version !== 1 ||
      state.fingerprint !== birth.fingerprint ||
      state.genomeFingerprint !== birth.genomeFingerprint ||
      !Number.isSafeInteger(state.nextHour) ||
      state.nextHour < 0 ||
      state.nextHour >= ITERATIVE_CHRONOLOGY_MAX_HOURS)
    throw new TypeError("Incompatible immutable growth identity or bounded interval");
  const n = state.nextHour;
  validateExposure(exposure, n);
  const byId = validateGraph(graph, birth, n + 1);
  const roots = sourceRoots(graph);
  const parentTissues = new Map(graph.tissues.map(t => [t.id, t.parentId]));
  function tissueDepth(id: string): number {
    let depth = 0, current = id;
    const visited = new Set<string>();
    while (parentTissues.get(current)) {
      if (visited.has(current)) throw new TypeError("Cyclic material ancestry");
      visited.add(current);
      current = parentTissues.get(current)!;
      depth++;
    }
    return Math.min(ITERATIVE_LIMITS.depth, depth);
  }
  const cells = [...graph.cells], tissues = [...graph.tissues],
    sites = [...graph.sites], links = [...graph.links],
    events = [...graph.events];
  const occupied = new Map(cells.map(c => [xy(c.x, c.y), c]));
  const voids = new Set(graph.protectedVoids);
  const pigmentSupport=policy.enablePhysicalFields?sourcePigmentSupport(graph.sourceCells):new Map<string,number>();
  const registry = new Map(sites.map(s => [s.id, s]));
  const tissuesById = new Map(tissues.map(t => [t.id, t]));
  const lives: MutableSite[] = state.sites.map(s => ({
    ...s, direction: { ...s.direction }, orbit: { ...s.orbit },
  }));
  const known = new Set(lives.map(s => s.id));
  if (known.size !== lives.length) throw new TypeError("Repeated historic growth site IDs");
  const changes: GrowthSiteChange[] = [];
  const suppressions: GrowthSuppression[] = [];
  const createdEvents: MaterialEvent[] = [];

  // Explicit physical site succession may replace an apex. No nearest-cell
  // guess, resurrection, new orbit or reset of lifetime counters is allowed.
  // Ordinary unjournaled disappearance still permanently invalidates a site.
  for (const s of lives) {
    if (s.status === "invalidated") continue;
    const recorded = registry.get(s.id);
    if(recorded&&recorded.rootCellId!==s.tipCellId){
      let successor=s.tipCellId;
      for(const event of graph.events)if(event.atHour===n+1&&
        ["elongate","extend","branch","bud","repattern"].includes(event.kind))
        for(const change of event.physical?.sites??[])
          if(change.id===s.id&&change.before?.rootCellId===successor&&change.after)
            successor=change.after.rootCellId;
      if(successor===recorded.rootCellId&&byId.get(successor)?.tissueId===s.tissueId){
        s.tipCellId=recorded.rootCellId;
        changes.push({atHour:n+1,siteId:s.id,kind:"renewed",reason:"material-site-turnover"});
      }
    }
    const tip = byId.get(s.tipCellId);
    const reason: GrowthSiteChange["reason"] | null =
      !tissuesById.has(s.tissueId) ? "tissue-removed" :
      !recorded ? "site-removed" :
      recorded.tissueId !== s.tissueId ? "site-tissue-changed" :
      !tip || tip.tissueId !== s.tissueId ? "tip-removed" :
      !byId.has(recorded.rootCellId) ? "root-removed" : null;
    if (reason) {
      s.status = "invalidated";
      changes.push({ atHour: n, siteId: s.id, kind: "invalidated", reason });
    }
  }
  // Material operators may produce a new, source-derived site. Register it at
  // this boundary; it may not spend resources until the NEXT hour interval.
  for (const record of [...sites].sort((a, b) => compareText(a.id, b.id))) {
    if (known.has(record.id)) continue;
    const cell = byId.get(record.rootCellId);
    if (!cell || cell.tissueId !== record.tissueId ||
        !tissuesById.has(record.tissueId)) {
      changes.push({ atHour: n, siteId: record.id,
        kind: "invalidated", reason: "source-invalid" });
      lives.push({
        id: record.id, tissueId: record.tissueId,
        tipCellId: record.rootCellId, parentSiteId: null,
        activationHour: n + 1, direction: unit(record.direction),
        depth: 0, extensions: 0, forks: 0, lateralCells: 0,
        orbit: seedChaos((birth.iterativeSeedFingerprint ?? birth.fingerprint) + "|" + record.id),
        status: "invalidated",
      });
      known.add(record.id); // persistent tombstone; no later resurrection
      continue;
    }
    const depth = tissueDepth(record.tissueId);
    lives.push({
      id: record.id, tissueId: record.tissueId,
      tipCellId: record.rootCellId, parentSiteId: null,
      activationHour: n + 1, direction: unit(record.direction),
      depth, extensions: 0, forks: 0,
      lateralCells: 0,
      orbit: seedChaos((birth.iterativeSeedFingerprint ?? birth.fingerprint) + "|" + record.id),
      status: "dormant",
    });
    known.add(record.id);
    changes.push({ atHour: n, siteId: record.id,
      kind: "introduced", reason: "external-site" });
  }
  const active = lives.filter(s => s.status !== "invalidated" &&
    s.activationHour <= n && byId.has(s.tipCellId))
    .sort((a, b) => compareText(a.id, b.id));
  const available = Math.floor(ITERATIVE_LIMITS.creditsPerHour * exposure.resources);
  const bornSizes=new Map(birth.source.tissues.map(t=>[t.id,t.sourceCellIds.length]));
  const originById=new Map(birth.source.sourceCells.map(c=>[c.id,bornSizes.get(c.tissueId)??1]));
  const sourceMass=new Map(tissues.map(t=>{
    const own=Math.max(1,t.sourceCellIds.length),origin=Math.max(own,...t.sourceCellIds.map(id=>originById.get(id)??1));
    return [t.id,policy.enablePhysicalFields?regionalSourceScale(own,origin,!bornSizes.has(t.id)):own] as const;
  }));
  const liveMass=new Map<string,number>(),siteCount=new Map<string,number>();
  for(const cell of cells)liveMass.set(cell.tissueId,(liveMass.get(cell.tissueId)??0)+1);
  for(const s of active)siteCount.set(s.tissueId,(siteCount.get(s.tissueId)??0)+1);
  const capacities=new Map(policy.enablePhysicalFields?tissues.map(t=>[t.id,morphologicalVolumeCapacity(
    sourceMass.get(t.id)!,birth.signals.channels.growth.expansion,
    birth.signals.channels.support.membrane)] as const):[]);
  const birthSelectedKinds=new Map(graph.sourceCells.map(c=>[c.tissueId,c.sourceKind] as const));
  const originalPartKinds=new Map(graph.sourceCells.map(c=>
    [c.sourcePartId,c.sourceKind] as const));
  const tensors=new Map(policy.enablePhysicalFields?tissues.map(t=>[t.id,
    developmentalAllometry(
      birth.iterativeSeedFingerprint??birth.fingerprint,t.id,n,
      birth.signals.channels,
      policy.care??{rest:exposure.resources,activity:exposure.resources,security:exposure.resources},
    )] as const):[]);
  const weights = active.map(s => {
    const align = exposure.light && exposure.light.intensity > 0
      ? Math.max(0, dot(unit(s.direction), unit(exposure.light))) *
        exposure.light.intensity : 0;
    return { id: s.id, weight:
      (0.5 + birth.signals.channels.growth.rate) *
      (0.8 + 0.4 * s.orbit.x / (CHAOS_MODULUS - 1)) *
      (1 + 0.75 * align) / (1 + 0.25 * s.depth) *
      (policy.enablePhysicalFields?regionalGrowthDemand(sourceMass.get(s.tissueId)!,
        liveMass.get(s.tissueId)!,siteCount.get(s.tissueId)!,capacities.get(s.tissueId)!):1) };
  });
  const allocation = allocateGrowthCredits(available, weights);
  const awarded = new Map(allocation.bySite.map(a => [a.siteId, a.allocated]));
  const spending = new Map<string, number>();
  const steer = (s: MutableSite): Point => {
    const raw = turn(unit(s.direction),
      0.12 * (2 * s.orbit.y / (CHAOS_MODULUS - 1) - 1));
    if (!exposure.light || exposure.light.intensity === 0) return unit(raw);
    const strength = (0.65 + 0.55 *
      (1 - birth.signals.channels.support.rigidity)) * exposure.light.intensity;
    const light = unit(exposure.light);
    return unit({ x: raw.x + strength * light.x, y: raw.y + strength * light.y });
  };
  let placementBins:ReadonlyMap<string,readonly MaterialCell[]>=new Map();
  const interiorAt=(parent:MaterialCell,destination:Point)=>{
    const local:MaterialCell[]=[];for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)local.push(...(placementBins.get(xy(parent.x+x,parent.y+y))??[]));
    return advancingInteriorParent(graph.sourceCells,local,parent,destination,pigmentSupport);
  };
  const place = (tip: MaterialCell, tissueId: string, axis: Point,
    siteId: string, slot: number, kind: GrowthSuppression["kind"],
    coherentSurface=false,at?:Point,interiorHint?:MaterialCell|null): MaterialCell | null => {
    const direction = unit(axis);
    const destination = at ?? { x: tip.x + Math.round(direction.x),
      y: tip.y + Math.round(direction.y) };
    const reason = assessIterativePlacement(
      occupied, voids, tip, tissueId, destination,
      Math.max(0, cells.length - graph.sourceCells.length), roots, coherentSurface,
    );
    if (reason) {
      suppressions.push({ hour: n, siteId, kind, attempted: destination, reason });
      return null;
    }
    if(policy.enablePhysicalFields&&["elongate","branch","bud"].includes(kind)&&
      growthSupportDistance(cells,links,tip.tissueId,destination,birth.signals.channels.support.rigidity)===null){
      suppressions.push({hour:n,siteId,kind,attempted:destination,reason:"insufficient-support"});return null;
    }
    const operationId = "iterative-composed/" + (n + 1) + "/" +
      encodeURIComponent(siteId) + "/" + slot + "/" + kind;
    const id = "growth/" + encodeURIComponent(operationId) + "/" +
      xy(destination.x, destination.y);
    if (byId.has(id) || events.some(e => e.id === operationId))
      throw new TypeError("Repeated chronological growth transaction");
    const interior=coherentSurface&&policy.enablePhysicalFields?
      (interiorHint===undefined?interiorAt(tip,destination):interiorHint):null;
    const parent=interior??tip,position=interior?{x:tip.x,y:tip.y}:destination;
    const cell: MaterialCell = {
      id, tissueId, ...position, color: parent.color,
      ...(parent.z === undefined ? {} : { z: parent.z }),
      provenance: "generated", sourceIds: [...parent.sourceIds],
      parentCellIds: [parent.id], operationId,
    };
    if(!interior&&anatomicalContinuityFailure(graph.sourceCells,[...cells,cell],{links,protectedVoids:graph.protectedVoids})){
      suppressions.push({hour:n,siteId,kind,attempted:destination,reason:"anatomical-continuity"});return null;
    }
    if(interior){
      const advanced={...tip,...destination};
      const proposed=[...cells.map(c=>c.id===tip.id?advanced:c),cell];
      if(anatomicalContinuityFailure(graph.sourceCells,proposed,{links,protectedVoids:graph.protectedVoids}))return null;
      if(links.some(l=>{
        const a=l.fromCellId===tip.id?advanced:byId.get(l.fromCellId!),b=l.toCellId===tip.id?advanced:byId.get(l.toCellId!);
        return !a||!b||(a.x-b.x)**2+(a.y-b.y)**2>8;
      }))return null;
      const index=cells.findIndex(c=>c.id===tip.id);cells[index]=advanced;byId.set(tip.id,advanced);
      occupied.delete(xy(tip.x,tip.y));occupied.set(xy(advanced.x,advanced.y),advanced);
    }
    const event: MaterialEvent = {
      id: operationId, kind, atHour: n + 1,
      createdCellIds: [id], createdCells:[cell], removedCellIds: [],
      sourceCellIds: [...new Set([...cell.sourceIds,...(interior?tip.sourceIds:[])])].sort(),
    };
    cells.push(cell); byId.set(id, cell);
    occupied.set(xy(cell.x, cell.y), cell);
    events.push(event); createdEvents.push(event);
    return cell;
  };
  for (const s of active) {
    const share = awarded.get(s.id) ?? 0;
    s.status = share ? "active" : "dormant";
    let spent = 0;
    for (let slot = 0; slot < share; slot++) {
      const bins=new Map<string,MaterialCell[]>();
      for(const cell of cells){const k=xy(cell.x,cell.y),list=bins.get(k)??[];list.push(cell);bins.set(k,list);}
      placementBins=bins;
      const beforePhysical:MaterialGraph={...graph,cells:[...cells],tissues:[...tissues],sites:[...sites],links:[...links],events:[...events]};
      const tip = byId.get(s.tipCellId);
      if (!tip) { s.status = "invalidated"; break; }
      const axis = steer(s);
      let made: MaterialCell | null = null;
      const canFork = s.depth < ITERATIVE_LIMITS.depth &&
        s.forks < ITERATIVE_LIMITS.forksPerSite &&
        s.extensions >= 2 + s.forks * 3 &&
        birth.signals.channels.branching.initiation >= 0.2 &&
        lives.length < ITERATIVE_LIMITS.sites;
      let orbit=s.orbit;
      for(let step=0;step<slot;step++)orbit=stepChaos(orbit);
      const grammar=policy.enablePhysicalFields?selectRegionalGrammar(
        birth.signals.channels,orbit,policy.care??{
          rest:exposure.resources,activity:exposure.resources,security:exposure.resources,
        },canFork):null;
      if(policy.enablePhysicalFields&&grammar===null){s.status="dormant";break;}
      const fork=canFork&&(!policy.enablePhysicalFields||grammar==="branch");
      if (fork) {
        const sign = s.orbit.y % 2 ? -1 : 1;
        const angle = 0.6 + 0.6 * birth.signals.channels.branching.divergence;
        const childId = s.id + "/iterative/" + s.forks;
        for (const a of [sign * angle, -sign * angle,
          sign * (angle + 0.5), -sign * (angle + 0.5)]) {
          const direction = unit(turn(axis, a));
          made = place(tip, childId, direction, s.id, slot,
            s.forks % 2 ? "bud" : "branch");
          if (!made) continue;
          const parent = tissuesById.get(s.tissueId)!;
          const anchorId = childId + "/site/0";
          const child: MaterialTissue = {
            id: childId, sourcePartId: parent.sourcePartId,
            parentId: s.tissueId, relationship: "joint",
            // This is growth of the same existing tissue lineage, NOT a new
            // gene ticket. Preserve genetically authorized specialization
            // across physical branching with no fabricated new anatomy kind.
            ...(parent.developedKind?{developedKind:parent.developedKind,
              geneticInstructionId:parent.geneticInstructionId}:{}),
            sourceCellIds: [...tip.sourceIds],
            growthSiteIds: [anchorId], rigidity: Math.min(1,
              birth.signals.channels.support.rigidity * (0.5 + 0.1 * s.depth)),
          };
          if (tissuesById.has(childId) || registry.has(anchorId))
            throw new TypeError("Growth fork repeats an existing tissue");
          tissues.push(child); tissuesById.set(childId, child);
          roots.set(childId, roots.get(s.tissueId) ?? s.tissueId);
          const anchor: MaterialSite = {
            id: anchorId, tissueId: childId, rootCellId: made.id, direction,
          };
          sites.push(anchor); registry.set(anchorId, anchor);
          links.push({
            id: made.operationId + "/attachment",
            fromTissueId: childId, toTissueId: s.tissueId,
            kind: "attachment", fromCellId: made.id, toCellId: tip.id,
          });
          lives.push({
            id: anchorId, tissueId: childId, tipCellId: made.id,
            parentSiteId: s.id, activationHour: n + 1,
            direction, depth: s.depth + 1, extensions: 0,
            forks: 0, lateralCells: 0,
            orbit: seedChaos((birth.iterativeSeedFingerprint ?? birth.fingerprint) + "|" + anchorId),
            status: "dormant",
          });
          changes.push({ atHour: n + 1, siteId: anchorId,
            kind: "introduced", reason: "branch-born" });
          s.forks++;
          break;
        }
        // A rejected branch is an honest null for its selected grammar.
        // It cannot silently become an axial extension to manufacture change.
        if(policy.enablePhysicalFields&&!made){s.status="blocked";break;}
      }
      // Physical whole-region growth, not repeated tip extrusion. Select
      // from REAL current tissue material and a permanent seeded chaotic orbit.
      // Each accepted candidate is a one-credit, one-cell "expand" event with
      // its own live immediate parent and full material journal. A proposal
      // cannot create a new tissue, cross a protected void, or invent an organ.
      // The within-tissue contact rule differs from a free-standing branch:
      // touching several of one's own live cells is physically desirable.
      const expansion=birth.signals.channels.growth.expansion;
      const membrane=birth.signals.channels.support.membrane;
      let selectedField=false;
      if(policy.enablePhysicalFields && !made && grammar==="surface"){
        const mode=chooseMorphologicalField(expansion,membrane,orbit);
        if(mode){
            selectedField=true;
            // Source-derived growth capacity with increasing mass inertia:
            // extra=min(384,ceil(A*(4+8e+4m)/(1+(A/128)^2))),
            // A=permanent original tissue cell count, e=expansion, m=membrane.
            // Small source creatures can develop large proportional changes;
            // broad preexisting bodies are not forced to reproduce their full
            // 1024-cell surface scan hundreds of times each year.
            // This is bounded allometry, not a species- or target-shape rule.
            const area=sourceMass.get(s.tissueId)!;
            const capacity=morphologicalVolumeCapacity(area,expansion,membrane);
            const currentArea=cells.filter(c=>c.tissueId===s.tissueId).length;
            if(currentArea>=capacity){
              suppressions.push({hour:n,siteId:s.id,kind:"expand",
                attempted:{x:tip.x,y:tip.y},reason:"genetic-volume-cap"});
            }else{
              const tissue=tissuesById.get(s.tissueId);
              const actualKind=tissue?.developedKind??birthSelectedKinds.get(s.tissueId)??
                originalPartKinds.get(tissue?.sourcePartId??"");
              const candidates=rankMorphologicalField(cells,s.tissueId,mode,orbit,24,
                  tensors.get(s.tissueId),policy.developmentalFields?.get(s.tissueId),
                  actualKind?{kind:actualKind,direction:s.direction}:undefined)
                .map(candidate=>({candidate,interior:interiorAt(byId.get(candidate.parentId)!,candidate.destination)}))
                .sort((a,b)=>(b.candidate.score+Number(!!b.interior))-(a.candidate.score+Number(!!a.interior)));
              for(const {candidate,interior} of candidates){
                const parent=byId.get(candidate.parentId);
                if(!parent)continue;
                const destination=candidate.destination;
                made=place(parent,s.tissueId,
                  {x:destination.x-parent.x,y:destination.y-parent.y},
                  s.id,slot,"expand",true,destination,interior);
                if(made){s.lateralCells++;break;}
              }
            }
        }
      }
      const canSpread = !made && !selectedField && s.depth > 0 && s.extensions >= 2 &&
        birth.signals.channels.support.membrane *
        birth.signals.channels.appendages.extension >= 0.01 &&
        s.lateralCells < s.extensions * 2 &&
        (n + s.forks + s.extensions) % 3 === 0;
      if (canSpread) {
        const sign = s.orbit.y % 2 ? -1 : 1;
        for (const side of [sign, -sign]) {
          made = place(tip, s.tissueId,
            turn(axis, side * Math.PI / 2), s.id, slot, "expand");
          if (made) { s.lateralCells++; break; }
        }
      }
      if (!made && !selectedField) {
        made = place(tip, s.tissueId, axis, s.id, slot, "elongate");
        if (made) {
          s.tipCellId = made.id; s.direction = axis; s.extensions++;
          const registered=registry.get(s.id);
          if(registered){
            const updated={...registered,rootCellId:made.id};
            const index=sites.findIndex(site=>site.id===s.id);
            sites[index]=updated;registry.set(s.id,updated);
          }
        }
      }
      if (!made) { s.status = "blocked"; break; }
      const event=events[events.length-1];
      const recorded=journalMaterialEvent(beforePhysical,{...graph,cells,tissues,sites,links,events},event,"iterative",{
        id:event.id,kind:event.kind,tissueId:made.tissueId});
      events[events.length-1]=recorded;createdEvents[createdEvents.length-1]=recorded;
      spent++;
    }
    spending.set(s.id, spent);
  }
  const spent = [...spending.values()].reduce((sum, v) => sum + v, 0);
  const ledger: IterativeGrowthLedger = {
    hour: n, available, unassigned: allocation.unassigned,
    spent, unspent: available - spent,
    bySite: allocation.bySite.map((a: GrowthCreditAllocation) =>
      ({ ...a, spent: spending.get(a.siteId) ?? 0 })),
  };
  for (const s of lives) {
    if (s.status !== "invalidated" && s.activationHour <= n)
      s.orbit = stepChaos(s.orbit);
  }
  const output: MaterialGraph = {
    ...graph, cells, tissues, sites, links, events,
  };
  const next: IterativeChronologyState = {
    version: 1, fingerprint: birth.fingerprint,
    genomeFingerprint: birth.genomeFingerprint, nextHour: n + 1,
    sites: lives.map(s => ({ ...s })),
    ledger: [...state.ledger, ledger],
    suppressions: [...state.suppressions, ...suppressions],
    changes: [...state.changes, ...changes],
  };
  return { graph: output, state: next, ledger, events: createdEvents,
    suppressions, changes };
}

/**
 * Independent deterministic reconstruction helper; chronological external
 * reducer MUST be a pure function of (currentGraph, intervalStartHour).
 * Its output contains exactly the externally committed proposals through
 * intervalStartHour+1 (including fractional proposals), in chronological
 * order, with equal-time external changes before iterative growth. It cannot
 * draw material from later timestamps. This is a caller-side scheduling
 * contract: event cutoffs are validated, not source-specific proposal order.
 * Iterative resources use the recorded interval-start sample, while anatomy
 * is committed at the interval's end.
 */
export function replayIterativeChronology(
  birth: MaterialDevelopmentProgram,
  exposures: readonly IterativeExposure[],
  hour: number,
  applyDueExternal?: (graph: MaterialGraph, intervalHour: number) => MaterialGraph,
): Readonly<{ graph: MaterialGraph; state: IterativeChronologyState }> {
  if (!Number.isSafeInteger(hour) || hour < 0 || hour > ITERATIVE_CHRONOLOGY_MAX_HOURS)
    throw new RangeError("Chronological replay requires a bounded integer age");
  let previous = -1;
  for (const sample of exposures) {
    if (!Number.isSafeInteger(sample.atHour) ||
        sample.atHour < 0 || sample.atHour > ITERATIVE_CHRONOLOGY_MAX_HOURS ||
        sample.atHour <= previous)
      throw new RangeError("Historical exposures must be strictly increasing integer hours");
    validateExposure(sample, sample.atHour);
    previous = sample.atHour;
  }
  if (hour > 0 && exposures[0]?.atHour !== 0)
    throw new RangeError("Replay must begin with genuinely supplied hour-zero resources");
  let graph = birth.source;
  let state = createIterativeChronologyState(birth);
  for (let n = 0; n < hour; n++) {
    const exposure = exposures.findLast(s => s.atHour <= n);
    if (!exposure) throw new RangeError("Replay lacks the recorded resource prefix");
    if (applyDueExternal) graph = applyDueExternal(graph, n);
    const stepped = stepIterativeChronology(birth, graph, state,
      { ...exposure, atHour: n });
    graph = stepped.graph; state = stepped.state;
  }
  return { graph, state };
}

/**
 * Shared inherited proposal compiler. Daily production interprets proposal coordinates as dimensionless opportunity ticks and commits accepted proposals only at their daily check. The stand-alone hour-named domain is legacy primitive coverage, not permission for fractional anatomical changes.
 */
/**
 * DEV-004: source-preserving lifetime tissue remodeling.
 *
 * Discrete chronology: an operator (s,d,n) proposes at most n indivisible
 * transitions at t_k=s+d*k/n, k=1..n. Evaluation replays the canonical
 * (time, operation ID, k) ordering from the immutable birth graph. A failed
 * proposal is deferred; it NEVER partly commits. This makes queries
 * independent of evaluation order, frame rate, and earlier queries.
 *
 * All expressed positions are integer sites in [0,63]^2. An extension
 * adds one 8-neighbor cell; reinforcement deposits one supported neighbor;
 * resorption removes only a non-articulating non-cut cell; translation
 * moves every cell of one tissue by a single lattice step; reattachment
 * changes a documented physical endpoint, never a visual-only parent.
 *
 * Genetic channels and the permanent seed determine which operations may
 * express and bounded chaotic steering. The cat map cannot bypass occupancy,
 * connectivity, voids, material budget, or attachment checks.
 */
import { compareText, type Point } from "../simulation/model";
import type { InheritedGenome } from "../simulation/genome";
import type { DevelopmentGeneticSignals } from "../genetics";
import { chaoticTurn, CHAOS_VERSION, seedChaos, type MaterialChaos } from "./chaos";
import type {
  MaterialCell, MaterialGraph, MaterialLink, MaterialTissue,
} from "./material-graph";
import type { MaterialDevelopmentProgram } from "./operators";
import { MATERIAL_LIMITS } from "./operators";

export const REMODEL_LIMITS = {
  world: 64, maxOperations: 64, maxUnits: 12, maxAgeHours: 8192,
  maxAdded: MATERIAL_LIMITS.addedCells,
} as const;
export type RemodelKind =
  "extend" | "reinforce" | "resorb" | "translate" | "reattach" | "articulate" | "reshape" | "redistribute";
export type RemodelOperation = Readonly<{
  id: string;
  kind: RemodelKind;
  tissueId: string;
  targetTissueId?: string;
  sourceSiteId?: string;
  direction?: Readonly<Point>;
  atHour: number;
  durationHours: number;
  /** Maximum number of indivisible steps, 1..12. */
  units: number;
  /** Inherited capability multiplier. No environment or future care here. */
  strength: number;
  /** Existing bounded cat-map steering, only for extension geometry. */
  chaos?: MaterialChaos;
}>;
export type RemodelTransition = Readonly<{
  id: string;
  operationId: string;
  kind: RemodelKind;
  tissueId: string;
  atHour: number;
  createdCellIds: readonly string[];
  removedCellIds: readonly string[];
  /** Actual persistent IDs that changed location. */
  relocated: readonly Readonly<{ cellId: string; from: Point; to: Point }>[];
  oldLinks: readonly MaterialLink[];
  newLinks: readonly MaterialLink[];
  sourceCellIds: readonly string[];
  rigidityBefore?: number;
  rigidityAfter?: number;
}>;
export type RemodelDeferral = Readonly<{
  id: string; atHour: number; reason: string;
}>;
export type MechanicalCapability = Readonly<{
  id: string;
  kind: "joint" | "attachment" | "effector" | "flexible-span" | "support";
  tissueId: string;
  cellIds: readonly string[];
  /** [0,1]; actual deposited tissue rigidity, not a gait instruction. */
  stiffness: number;
  /** Remaining flex potential, not a commanded movement. */
  mobility: number;
}>;
/** Disjoint mechanically traceable spans separated only at actual cut vertices. */
export type MechanicalRegion = Readonly<{
  id: string;
  tissueId: string;
  cellIds: readonly string[];
  sourceCellIds: readonly string[];
  hingeCellId: string | null;
  rigidity: number;
}>;
export type LifetimeRemodelingProgram = Readonly<{
  version: 1;
  birth: MaterialGraph;
  seed: string;
  genomeFingerprint: string;
  signals: DevelopmentGeneticSignals;
  operations: readonly RemodelOperation[];
}>;
export type LifetimeRemodelingFrame = Readonly<{
  graph: MaterialGraph;
  transitions: readonly RemodelTransition[];
  deferred: readonly RemodelDeferral[];
  capabilities: readonly MechanicalCapability[];
  regions: readonly MechanicalRegion[];
}>;

const xy = (p: Point) => p.x + "," + p.y;
const around = (a: Point, b: Point) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
const dist2 = (a: Point, b: Point) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const within = (p: Point) =>
  Number.isInteger(p.x) && Number.isInteger(p.y) &&
  p.x >= 0 && p.x < REMODEL_LIMITS.world &&
  p.y >= 0 && p.y < REMODEL_LIMITS.world;
const cap = (n: number) => Math.max(0, Math.min(1, n));
const compareCell = (a: MaterialCell, b: MaterialCell) => compareText(a.id, b.id);
const DIRS: readonly Point[] = [
  { x: 1, y: 0 }, { x: 0, y: 1 },
  { x: -1, y: 0 }, { x: 0, y: -1 },
];
function unit(p: Point): Point {
  const n = Math.hypot(p.x, p.y);
  return n > 1e-9 ? { x: p.x / n, y: p.y / n } : { x: 0, y: -1 };
}
function lattice(p: Point): Point {
  const q = unit(p);
  const x = Math.round(q.x), y = Math.round(q.y);
  return x || y ? { x, y } : { x: 0, y: -1 };
}
function channel(kind: RemodelKind, g: DevelopmentGeneticSignals): number {
  const c = g.channels;
  switch (kind) {
    case "extend": return c.growth.elongation;
    case "reinforce": return c.support.rigidity;
    case "resorb": return c.maturation.plasticity;
    case "translate": return c.maturation.plasticity;
    case "reshape": return 0.7*c.growth.expansion+0.3*c.maturation.plasticity;
    case "redistribute": return 0.55*c.maturation.plasticity+0.45*c.growth.expansion;
    case "reattach": return c.segmentation.boundaries;
    case "articulate": return c.segmentation.boundaries;
  }
}
function validateOperation(op: RemodelOperation): void {
  if (!op.id || !op.tissueId || !Number.isFinite(op.atHour) ||
      !Number.isFinite(op.durationHours) || op.atHour < 0 ||
      op.durationHours <= 0 ||
      op.atHour + op.durationHours > REMODEL_LIMITS.maxAgeHours ||
      !Number.isInteger(op.units) || op.units < 1 ||
      op.units > REMODEL_LIMITS.maxUnits ||
      !Number.isFinite(op.strength) || op.strength < 0 || op.strength > 1 ||
      (op.direction && (!Number.isFinite(op.direction.x) ||
        !Number.isFinite(op.direction.y))))
    throw new RangeError("Invalid remodeling schedule or numerical limit: " + op.id);
  if (op.kind === "reattach" && !op.targetTissueId)
    throw new TypeError("Reattachment requires an existing target tissue");
}
function activeConnected(group: readonly MaterialCell[]): boolean {
  if (!group.length) return false;
  const seen = new Set<string>([group[0].id]);
  const queue = [group[0]];
  for (let i = 0; i < queue.length; i++)
    for (const c of group)
      if (!seen.has(c.id) && around(c, queue[i])) {
        seen.add(c.id); queue.push(c);
      }
  return seen.size === group.length;
}
function canDeposit(
  point: Point, tissueId: string, cells: readonly MaterialCell[],
  protectedVoids: ReadonlySet<string>, birthCount: number,
): boolean {
  if (!within(point) || protectedVoids.has(xy(point)) ||
      cells.length >= birthCount + REMODEL_LIMITS.maxAdded ||
      cells.some(c => c.x === point.x && c.y === point.y)) return false;
  // No new cross-tissue contact without an explicit link.
  return cells.every(c => c.tissueId === tissueId || !around(point, c));
}
/**
 * Four-connected background cavities of the CURRENT material. These are
 * protected in addition to authored voids, so a later unrelated deposition
 * cannot erase an opening that developed earlier.
 */
function enclosedHoles(cells: readonly MaterialCell[]): ReadonlySet<string> {
  const occupied = new Set(cells.map(xy));
  const exterior = new Set<string>();
  const queue: Point[] = [];
  const push = (p: Point) => {
    const k = xy(p);
    if (!within(p) || occupied.has(k) || exterior.has(k)) return;
    exterior.add(k);
    queue.push(p);
  };
  for (let i = 0; i < REMODEL_LIMITS.world; i++) {
    push({ x: i, y: 0 }); push({ x: i, y: REMODEL_LIMITS.world - 1 });
    push({ x: 0, y: i }); push({ x: REMODEL_LIMITS.world - 1, y: i });
  }
  for (let i = 0; i < queue.length; i++)
    for (const d of DIRS)
      push({ x: queue[i].x + d.x, y: queue[i].y + d.y });
  const holes = new Set<string>();
  for (let y = 0; y < REMODEL_LIMITS.world; y++)
    for (let x = 0; x < REMODEL_LIMITS.world; x++) {
      const k = x + "," + y;
      if (!occupied.has(k) && !exterior.has(k)) holes.add(k);
    }
  return holes;
}
function sourceIds(cells: readonly MaterialCell[]): string[] {
  return [...new Set(cells.flatMap(c => c.sourceIds))].sort(compareText);
}
function deposited(id: string, tissue: string, p: Point, parent: MaterialCell): MaterialCell {
  return {
    id, tissueId: tissue, x: p.x, y: p.y, color: parent.color,
    ...(parent.z === undefined ? {} : { z: parent.z }),
    provenance: "generated", sourceIds: [...parent.sourceIds],
    parentCellIds: [parent.id], operationId: id.split("/unit/")[0],
  };
}

/** A source-derived, seed-dependent plan; no animal, body-part, or sprite targets. */
export function compileLifetimeRemodeling(
  base: MaterialDevelopmentProgram, genome: InheritedGenome,
  override?: readonly RemodelOperation[],
): LifetimeRemodelingProgram {
  if (base.genomeFingerprint !== genome.genotype.fingerprint)
    throw new TypeError("Remodeling genotype does not match the material program");
  const tissues = [...base.source.tissues]
    .filter(t => t.sourceCellIds.length >= 2)
    .sort((a, b) => b.sourceCellIds.length - a.sourceCellIds.length ||
      compareText(a.id, b.id)).slice(0, 6);
  const operations: RemodelOperation[] = override ? [...override] : [];
  if (!override) for (const [index, tissue] of tissues.entries()) {
    const site = base.source.sites.find(s => s.tissueId === tissue.id);
    const steering = (tag: string): MaterialChaos => ({
      version: CHAOS_VERSION,
      initial: seedChaos([genome.seed, base.source.sourceFingerprint,
        tissue.id, tag].join("|")),
      rateAmplitude: 0,
      turnAmplitude: 0.6,
    });
    const slot = index * 0.125;
    operations.push({
      id: "remodel/" + index + "/extend",
      kind: "extend", tissueId: tissue.id, sourceSiteId: site?.id,
      atHour: 90 + slot, durationHours: 48, units: 7,
      strength: 1, chaos: steering("extend"),
    }, {
      id: "remodel/" + index + "/reinforce",
      kind: "reinforce", tissueId: tissue.id,
      atHour: 140 + slot, durationHours: 35, units: 4, strength: 1,
    }, {
      id: "remodel/" + index + "/articulate",
      kind: "articulate", tissueId: tissue.id,
      atHour: 190 + slot, durationHours: 5, units: 1, strength: 1,
    }, {
      id: "remodel/" + index + "/resorb",
      kind: "resorb", tissueId: tissue.id, sourceSiteId: site?.id,
      atHour: 235 + slot, durationHours: 24, units: 3, strength: 1,
    });
    // Coherent region fronts compete with previous tip growth. Four independent
    // permanent orientations are seeded once, rather than chosen from an
    // animal template or desired final silhouette. Their daily care gate is
    // applied only when the corresponding chronological opportunity is earned.
    const directions=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}] as const;
    for(const [stage,start] of [24,82,156,242].entries()){
      const orbit=seedChaos([genome.seed,base.source.sourceFingerprint,
        tissue.id,"regional-front",stage].join("|"));
      const axis=directions[orbit.x%4];
      operations.push({
        id:"remodel/"+index+"/shape-stage/"+stage,
        kind:stage===1?"reshape":"redistribute",
        tissueId:tissue.id,direction:axis,
        // Allometric regional inertia: (reference scale 8 lattice units)
        // expression = min(1, 8/sqrt(A_source)).
        // Wide dense ink has fewer opportunities than a 3x3 authored body.
        // Shape outcomes remain source/seed/care dependent, not species targets.
        atHour:start+slot,durationHours:32,units:12,
        strength:Math.min(1,8/Math.sqrt(Math.max(1,tissue.sourceCellIds.length))),
      });
    }
  }
  if (operations.length > REMODEL_LIMITS.maxOperations)
    throw new RangeError("Too many remodeling operations");
  const unique = new Set<string>();
  for (const op of operations) {
    validateOperation(op);
    if (unique.has(op.id)) throw new TypeError("Repeated remodeling operator ID: " + op.id);
    unique.add(op.id);
    if (op.chaos && (op.chaos.version !== CHAOS_VERSION ||
        !Number.isFinite(op.chaos.turnAmplitude) ||
        op.chaos.turnAmplitude < 0 || op.chaos.turnAmplitude > 0.6 ||
        op.chaos.rateAmplitude !== 0))
      throw new RangeError("Unsupported remodeling chaos configuration");
  }
  return {
    version: 1, birth: base.source, seed: genome.seed,
    genomeFingerprint: base.genomeFingerprint, signals: base.signals,
    operations: operations.sort((a, b) => compareText(a.id, b.id)),
  };
}

/** Pure evaluation of canonical atomic transitions from the exact birth graph. */
export function lifetimeRemodelingAt(
  program: LifetimeRemodelingProgram, atHour: number,
): LifetimeRemodelingFrame {
  if (!Number.isFinite(atHour) || atHour < 0 ||
      atHour > REMODEL_LIMITS.maxAgeHours)
    throw new RangeError("Invalid remodeling age");
  const birth = program.birth;
  let cells = [...birth.cells];
  let tissues = [...birth.tissues];
  let links = [...birth.links];
  const events = [...birth.events];
  const transitions: RemodelTransition[] = [];
  const deferred: RemodelDeferral[] = [];
  const articulations = new Map<string, string>();
  const voids = new Set(birth.protectedVoids);
  const sourceSet = new Set(birth.sourceCells.map(c => c.id));
  const proposals: { op: RemodelOperation; k: number; atHour: number }[] = [];
  for (const op of program.operations) {
    validateOperation(op);
    const count = Math.floor(op.units * cap(op.strength) *
      cap(channel(op.kind, program.signals)) + 1e-10);
    for (let k = 1; k <= count; k++) {
      const time = op.atHour + op.durationHours * k / op.units;
      if (time <= atHour) proposals.push({ op, k, atHour: time });
    }
  }
  proposals.sort((a, b) => a.atHour - b.atHour ||
    compareText(a.op.id, b.op.id) || a.k - b.k);
  for (const { op, k, atHour: time } of proposals) {
    const tid = op.tissueId, id = op.id + "/unit/" + k;
    const tissue = tissues.find(t => t.id === tid);
    const group = cells.filter(c => c.tissueId === tid);
    const site = birth.sites.find(s => s.id === op.sourceSiteId &&
      s.tissueId === tid) ?? birth.sites.find(s => s.tissueId === tid);
    const axis = unit(op.direction ?? site?.direction ?? { x: 0, y: -1 });
    const anchor = group.find(c => c.id === site?.rootCellId) ??
      group.slice().sort(compareCell)[0];
    const created: MaterialCell[] = [], removed: MaterialCell[] = [];
    const relocated: { cellId: string; from: Point; to: Point }[] = [];
    const oldLinks: MaterialLink[] = [], newLinks: MaterialLink[] = [];
    let beforeRigidity: number | undefined;
    let afterRigidity: number | undefined;
    let reason: string | null = null;
    const cavities = ["extend", "reinforce", "translate"].includes(op.kind)
      ? new Set([...voids, ...enclosedHoles(cells)]) : voids;
    if (!tissue || !group.length || !anchor) reason = "missing-source-tissue";
    else if (op.kind === "extend") {
      const tip = group.slice().sort((a, b) => {
        const pa = (a.x - anchor.x) * axis.x + (a.y - anchor.y) * axis.y;
        const pb = (b.x - anchor.x) * axis.x + (b.y - anchor.y) * axis.y;
        return pb - pa || compareCell(a, b);
      })[0];
      const angle = Math.atan2(axis.y, axis.x) +
        (op.chaos ? chaoticTurn(op.chaos, k - 1) : 0);
      const step = lattice({ x: Math.cos(angle), y: Math.sin(angle) });
      const p = { x: tip.x + step.x, y: tip.y + step.y };
      if (canDeposit(p, tid, cells, cavities, birth.sourceCells.length)) {
        const child = deposited(op.id + "/unit/" + k + "/cell", tid, p, tip);
        created.push(child);
        cells.push(child);
      } else reason = "extension-conflict";
    } else if (op.kind === "reinforce") {
      const candidates = group.flatMap(parent => DIRS.map(step => ({
        parent, p: { x: parent.x + step.x, y: parent.y + step.y },
      }))).filter(o => canDeposit(o.p, tid, cells, cavities, birth.sourceCells.length));
      candidates.sort((a, b) =>
        dist2(a.p, anchor) - dist2(b.p, anchor) ||
        a.p.y - b.p.y || a.p.x - b.p.x || compareCell(a.parent, b.parent));
      if (!candidates.length) reason = "reinforcement-conflict";
      else {
        const candidate = candidates[0];
        const child = deposited(op.id + "/unit/" + k + "/cell",
          tid, candidate.p, candidate.parent);
        created.push(child); cells.push(child);
        beforeRigidity = tissue.rigidity;
        afterRigidity = cap(tissue.rigidity + (1 - tissue.rigidity) / op.units);
        tissues = tissues.map(t => t.id === tid ?
          { ...t, rigidity: afterRigidity! } : t);
      }
    } else if (op.kind === "resorb") {
      const locked = new Set<string>();
      for (const link of links) {
        if (link.fromCellId) locked.add(link.fromCellId);
        if (link.toCellId) locked.add(link.toCellId);
      }
      if (site) locked.add(site.rootCellId);
      const candidates = group.slice().sort((a, b) =>
        Number(b.provenance === "generated") -
        Number(a.provenance === "generated") ||
        dist2(b, anchor) - dist2(a, anchor) || compareCell(a, b));
      const choice = candidates.find(c => !locked.has(c.id) &&
        group.length > 1 && group.some(p => p.id !== c.id &&
          sourceSet.has(p.id)) &&
        activeConnected(group.filter(p => p.id !== c.id)));
      if (!choice) reason = "resorption-would-sever-or-erase";
      else {
        removed.push(choice);
        cells = cells.filter(c => c.id !== choice.id);
      }
    } else if (op.kind === "reshape") {
      // This legacy fractional-hour evaluator is not an authorized daily
      // material transaction; refusing prevents a fake anatomical snapshot.
      reason="region-front-requires-daily-physical-transaction";
    } else if (op.kind === "translate") {
      const step = lattice(axis);
      const moved = group.map(c => ({
        cellId: c.id, from: { x: c.x, y: c.y },
        to: { x: c.x + step.x, y: c.y + step.y },
      }));
      const other = cells.filter(c => c.tissueId !== tid);
      const own = new Set(moved.map(m => xy(m.to)));
      if (own.size !== moved.length || moved.some(m =>
        !within(m.to) || cavities.has(xy(m.to)) ||
        other.some(c => c.x === m.to.x && c.y === m.to.y)))
        reason = "translation-collision-or-void";
      else {
        const nextById = new Map(moved.map(m => [m.cellId, m.to]));
        const displaced = cells.map(c => nextById.has(c.id)
          ? { ...c, ...nextById.get(c.id)! } : c);
        // Existing attachments must remain physically meaningful.
        const lookup = new Map(displaced.map(c => [c.id, c]));
        if (links.some(link => {
          if (!link.fromCellId || !link.toCellId) return false;
          const a = lookup.get(link.fromCellId), b = lookup.get(link.toCellId);
          return !a || !b || dist2(a, b) > 8;
        })) reason = "translation-breaks-attachment";
        else if (moved.some(m => other.some(c => around(m.to, c) &&
          !links.some(link => (link.fromTissueId === tid &&
          link.toTissueId === c.tissueId) || (link.toTissueId === tid &&
          link.fromTissueId === c.tissueId)))))
          reason = "unrecorded-cross-tissue-contact";
        else {
          relocated.push(...moved);
          cells = displaced;
        }
      }
    } else if (op.kind === "reattach") {
      const target = cells.filter(c => c.tissueId === op.targetTissueId);
      const child = group.slice().sort(compareCell);
      const pairs = child.flatMap(a => target.map(b => ({ a, b,
        d: dist2(a, b) }))).filter(p => around(p.a, p.b));
      pairs.sort((a, b) => a.d - b.d ||
        compareCell(a.a, b.a) || compareCell(a.b, b.b));
      const targetId = op.targetTissueId!;
      let ancestor: string | null = targetId;
      const seen = new Set<string>();
      while (ancestor && !seen.has(ancestor)) {
        seen.add(ancestor);
        if (ancestor === tid) break;
        ancestor = tissues.find(t => t.id === ancestor)?.parentId ?? null;
      }
      if (!target.length || !pairs.length || seen.has(tid) ||
          targetId === tid) reason = "invalid-reattachment-topology";
      else {
        const pair = pairs[0];
        const old = links.find(l => l.kind === "attachment" &&
          l.fromTissueId === tid);
        if (old) oldLinks.push(old);
        const next: MaterialLink = {
          id: old?.id ?? op.id + "/attachment",
          kind: "attachment", fromTissueId: tid, toTissueId: targetId,
          fromCellId: pair.a.id, toCellId: pair.b.id,
        };
        newLinks.push(next);
        links = [...links.filter(l => l !== old), next];
        tissues = tissues.map(t => t.id === tid ?
          { ...t, parentId: targetId, relationship: "joint" } : t);
      }
    } else if (op.kind === "articulate") {
      // An articulation requires a source-supported cut vertex. An arbitrary
      // blob is not a hinge. Endpoints of already recorded attachments remain.
      const bottleneck = group.slice().sort(compareCell).find(c =>
        group.length >= 3 && !activeConnected(group.filter(p => p.id !== c.id)));
      if (!bottleneck) reason = "no-structural-hinge";
      else if (articulations.has(tid)) reason = "already-articulated";
      else articulations.set(tid, bottleneck.id);
    }
    if (reason) {
      deferred.push({ id, atHour: time, reason });
      continue;
    }
    const changed = [...created, ...removed];
    const transition: RemodelTransition = {
      id, operationId: op.id, kind: op.kind, tissueId: tid, atHour: time,
      createdCellIds: created.map(c => c.id),
      removedCellIds: removed.map(c => c.id),
      relocated, oldLinks, newLinks,
      sourceCellIds: sourceIds(changed.length ? changed :
        (relocated.length ? group : group.slice(0, 1))),
      ...(beforeRigidity === undefined ? {} :
        { rigidityBefore: beforeRigidity, rigidityAfter: afterRigidity }),
    };
    transitions.push(transition);
    events.push({
      id, kind: op.kind, atHour: time,
      createdCellIds: transition.createdCellIds,
      removedCellIds: transition.removedCellIds,
      sourceCellIds: transition.sourceCellIds,
    });
  }
  const graph: MaterialGraph = { ...birth, cells, tissues, links, events };
  return {
    graph, transitions, deferred,
    capabilities: mechanicalCapabilities(graph, articulations),
    regions: mechanicalRegions(graph, articulations),
  };
}

/** Mechanical metadata is measurable geometry only. No motion controller. */
export function mechanicalCapabilities(
  graph: MaterialGraph, articulations: ReadonlyMap<string, string> = new Map(),
): readonly MechanicalCapability[] {
  const result: MechanicalCapability[] = [];
  for (const tissue of graph.tissues) {
    const group = graph.cells.filter(c => c.tissueId === tissue.id);
    if (!group.length) continue;
    const stiffness = cap(tissue.rigidity);
    if (group.length >= 3 && activeConnected(group)) {
      const hingeId = articulations.get(tissue.id);
      if (hingeId && group.some(c => c.id === hingeId) &&
          !activeConnected(group.filter(c => c.id !== hingeId))) {
        const hinge = group.find(c => c.id === hingeId)!;
        result.push({ id: tissue.id + "/joint", kind: "joint",
          tissueId: tissue.id, cellIds: group.filter(c =>
            c.id === hingeId || around(c, hinge)).map(c => c.id).sort(compareText),
          stiffness, mobility: 1 - stiffness });
      }
      if (stiffness > 0)
        result.push({ id: tissue.id + "/support", kind: "support",
          tissueId: tissue.id, cellIds: group.map(c => c.id).sort(compareText),
          stiffness, mobility: 1 - stiffness });
      if (stiffness < 1)
        result.push({ id: tissue.id + "/flexible", kind: "flexible-span",
          tissueId: tissue.id, cellIds: group.map(c => c.id).sort(compareText),
          stiffness, mobility: 1 - stiffness });
      const endpoints = group.filter(c =>
        group.filter(other => other.id !== c.id && around(c, other)).length === 1);
      for (const c of endpoints.slice().sort(compareCell))
        result.push({ id: c.id + "/effector", kind: "effector",
          tissueId: tissue.id, cellIds: [c.id], stiffness, mobility: 1 - stiffness });
    }
  }
  for (const link of graph.links) {
    if (!link.fromCellId || !link.toCellId ||
        !graph.cells.some(c => c.id === link.fromCellId) ||
        !graph.cells.some(c => c.id === link.toCellId)) continue;
    const a = graph.cells.find(c => c.id === link.fromCellId)!;
    const b = graph.cells.find(c => c.id === link.toCellId)!;
    if (dist2(a, b) > 2) continue;
    const tissue = graph.tissues.find(t => t.id === link.fromTissueId);
    const stiffness = cap(tissue?.rigidity ?? 0);
    result.push({
      id: link.id + "/mechanical",
      kind: link.kind === "attachment" && tissue?.relationship === "joint"
        ? "joint" : "attachment",
      tissueId: link.fromTissueId,
      cellIds: [link.fromCellId, link.toCellId],
      stiffness, mobility: 1 - stiffness,
    });
  }
  return result.sort((a, b) => compareText(a.id, b.id));
}

/**
 * Split a real tissue ONLY at a mechanically demonstrated cut vertex.
 * Region membership is a partition of active tissue minus the hinge material,
 * which is uniquely owned by the joint. No limb/head/tail labels or symmetry.
 */
export function mechanicalRegions(
  graph: MaterialGraph, articulations: ReadonlyMap<string, string> = new Map(),
): readonly MechanicalRegion[] {
  const regions: MechanicalRegion[] = [];
  for (const t of graph.tissues) {
    const group = graph.cells.filter(c => c.tissueId === t.id);
    if (!group.length) continue;
    const hingeId = articulations.get(t.id) ?? null;
    const isHinge = hingeId !== null &&
      group.some(c => c.id === hingeId) &&
      !activeConnected(group.filter(c => c.id !== hingeId));
    const remaining = group.filter(c => !isHinge || c.id !== hingeId);
    const unseen = new Map(remaining.map(c => [c.id, c]));
    const components: MaterialCell[][] = [];
    while (unseen.size) {
      const first = [...unseen.values()].sort(compareCell)[0];
      const queue = [first];
      unseen.delete(first.id);
      for (let i = 0; i < queue.length; i++) {
        for (const c of [...unseen.values()])
          if (around(c, queue[i])) {
            queue.push(c); unseen.delete(c.id);
          }
      }
      components.push(queue.sort(compareCell));
    }
    components.sort((a, b) => compareCell(a[0], b[0]));
    for (const [index, component] of components.entries())
      regions.push({
        id: t.id + "/region/" + index, tissueId: t.id,
        cellIds: component.map(c => c.id),
        sourceCellIds: sourceIds(component),
        hingeCellId: isHinge ? hingeId : null,
        rigidity: cap(t.rigidity),
      });
  }
  return regions.sort((a, b) => compareText(a.id, b.id));
}

/**
 * Independent audit, not a renderer: checks ancestry, expressible operations,
 * active link endpoints, tissue connectedness and protected negative space.
 * Birth drawings are allowed to have detached islands and stacked ink layers.
 */
export function auditRemodelLegibility(frame: LifetimeRemodelingFrame): readonly string[] {
  const g = frame.graph, faults: string[] = [];
  const sources = new Set(g.sourceCells.map(c => c.id));
  const active = new Map(g.cells.map(c => [c.id, c]));
  const recorded = new Set([
    ...g.sourceCells.map(c => c.id),
    ...g.events.flatMap(e => e.createdCellIds),
  ]);
  const created = new Map(g.events.flatMap(e => e.createdCellIds.map(id =>
    [id, e.id] as const)));
  const voids = new Set(g.protectedVoids);
  for (const cell of g.cells) {
    if (!within(cell)) faults.push("out-of-bounds:" + cell.id);
    if (voids.has(xy(cell))) faults.push("protected-void:" + cell.id);
    if (!cell.sourceIds.length ||
        cell.sourceIds.some(id => !sources.has(id)))
      faults.push("missing-source:" + cell.id);
    if (cell.provenance === "generated" &&
        (!cell.operationId || !recorded.has(cell.id) ||
          !cell.parentCellIds.length ||
          cell.parentCellIds.some(id => !recorded.has(id))))
      faults.push("unrecorded-generation:" + cell.id);
    if (cell.provenance === "generated" &&
        created.get(cell.id)?.split("/unit/")[0] !== cell.operationId)
      faults.push("misattributed-generation:" + cell.id);
  }
  for (const t of g.tissues) {
    const group = g.cells.filter(c => c.tissueId === t.id);
    if (group.length && !activeConnected(group))
      faults.push("disconnected-tissue:" + t.id);
  }
  for (const link of g.links) {
    const a = link.fromCellId ? active.get(link.fromCellId) : undefined;
    const b = link.toCellId ? active.get(link.toCellId) : undefined;
    if (!a || !b || a.tissueId !== link.fromTissueId ||
        b.tissueId !== link.toTissueId || dist2(a, b) > 8)
      faults.push("dangling-attachment:" + link.id);
  }
  for (const c of g.cells.filter(c => c.provenance === "generated")) {
    if (g.cells.some(other => other.id !== c.id &&
        c.x === other.x && c.y === other.y))
      faults.push("generated-cell-overlap:" + c.id);
    if (!created.has(c.id)) faults.push("no-operation-event:" + c.id);
  }
  for (const event of frame.transitions) {
    if (event.createdCellIds.some(id => !recorded.has(id)) ||
        event.sourceCellIds.some(id => !sources.has(id)))
      faults.push("invalid-event:" + event.id);
  }
  return faults.sort(compareText);
}


/**
 * Chronological composition adapter: Agent 9 owns global ordering and the
 * shared public index. Direct consumers may import these transactions from
 * this existing Development-owned module or from remodel-transactions.
 * The legacy birth-replay evaluator above remains unchanged and verified.
 */
export {
  remodelingProposalsBetween,
  applyRemodelingProposal,
  applyRemodelingInterval,
  remodelingMechanicalState,
  EMPTY_REMODELING_CHRONOLOGY,
} from "./remodel-transactions";
export type {
  RemodelingProposal, RemodelingAttempt, RemodelingChronology,
  RemodelingHinge, RemodelingTransaction, RemodelingInterval,
} from "./remodel-transactions";

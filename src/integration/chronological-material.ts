/**
 * INT-001 chronological composition kernel — not a replacement growth engine.
 *
 * Every accepted operation receives and returns ONE active MaterialGraph.
 * The adapters (owned by DEV/CARE) must retain their oscillator / resource /
 * articulation state between these calls. A complete runtime cannot be built
 * from the existing from-birth, cumulative snapshot functions: see issue #16.
 *
 * Time: nonnegative IEEE754 hours since hatching, never slider age/days.
 * Iterative interval [n,n+1) commits at n+1. Exact ties commit:
 *   0 canonical original-material interval completion,
 *   1 fractional remodeling transition,
 *   2 iterative-growth interval completion,
 *   3 recorded care boundary (which can affect only following intervals).
 * Within one kind, lexical event ID decides, no insertion-order dependency.
 * A failed transition is atomic: no cells, links, sites, spent resources or
 * controller state from a rejected event may be committed.
 *
 * All query results replay from immutable birth and the <=requested-hour
 * event prefix. Repeated and out-of-order queries cannot mutate a cache.
 * No numeric wrap, clamping of requested age, or silent extension of the
 * DEV-003 512-hour domain is allowed.
 */
import { compareText } from "../simulation/model";
import { MATERIAL_LIMITS, type MaterialGraph, type MaterialCell } from "../development";

export const CHRONOLOGICAL_LIMITS = Object.freeze({
  maxHour: 8192,
  maxEvents: 16384,
  maxAdditionalCells: MATERIAL_LIMITS.addedCells,
  world: MATERIAL_LIMITS.world,
});

export type ChronologicalKind =
  | "material-interval"
  | "iterative-interval"
  | "remodel-transition"
  | "care-boundary";
export type ChronologicalClock = Readonly<{
  atHour: number;
  kind: ChronologicalKind;
  id: string;
}>;
export type ChronologicalDelta = Readonly<{
  createdCellIds: readonly string[];
  removedCellIds: readonly string[];
  relocatedCellIds: readonly string[];
  updatedLinkIds: readonly string[];
}>;
/**
 * The callback must apply the REAL module-owned incremental transition, not
 * recompute a whole independent snapshot. Modules with persistent local state
 * capture/return that state as part of immutable `context`; its schema is
 * intentionally owned by the producing module.
 */
export type ChronologicalProposal<Context> = ChronologicalClock & Readonly<{
  apply: (graph: MaterialGraph, context: Context) => Readonly<{
    graph: MaterialGraph;
    context: Context;
    accepted: boolean;
    reason?: string;
  }>;
}>;
export type ChronologicalOutcome = Readonly<{
  id: string;
  atHour: number;
  kind: ChronologicalKind;
  accepted: boolean;
  reason: string | null;
  delta: ChronologicalDelta;
}>;
export type ChronologicalFrame<Context> = Readonly<{
  graph: MaterialGraph;
  context: Context;
  outcomes: readonly ChronologicalOutcome[];
  lastHour: number;
}>;

const priorities: Record<ChronologicalKind, number> = {
  "material-interval": 0,
  "iterative-interval": 2,
  "remodel-transition": 1,
  "care-boundary": 3,
};
export function compareChronologicalEvents(
  a: ChronologicalClock, b: ChronologicalClock,
): number {
  return a.atHour - b.atHour ||
    priorities[a.kind] - priorities[b.kind] ||
    compareText(a.id, b.id);
}
function cellKey(cell: Pick<MaterialCell, "x" | "y">): string {
  return cell.x + "," + cell.y;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Reject stale links/sites, resurrected material, non-source ancestry, protected
 * negative-space violations and numeric overflow BEFORE committing an event.
 * This is intentionally stricter than visual/silhouette comparison.
 */
export function validateChronologicalGraph(
  birth: MaterialGraph,
  graph: MaterialGraph,
  forbiddenResurrection: ReadonlySet<string> = new Set(),
): readonly string[] {
  const errors: string[] = [];
  if (graph.version !== birth.version ||
      graph.sourceFingerprint !== birth.sourceFingerprint ||
      !same(graph.sourceCells, birth.sourceCells) ||
      !same(graph.protectedVoids, birth.protectedVoids))
    errors.push("immutable-birth-metadata-changed");
  if (graph.cells.length > birth.sourceCells.length +
      CHRONOLOGICAL_LIMITS.maxAdditionalCells)
    errors.push("material-cell-budget");
  const sources = new Set(birth.sourceCells.map(c => c.id));
  const birthCells = new Map(birth.cells.map(c => [c.id, c]));
  const occupied = new Map<string, MaterialCell[]>();
  const live = new Map<string, MaterialCell>();
  const tissueIds = new Set<string>();
  for (const tissue of graph.tissues) {
    if (tissueIds.has(tissue.id)) errors.push("duplicate-tissue:" + tissue.id);
    tissueIds.add(tissue.id);
  }
  const voids = new Set(birth.protectedVoids);
  for (const cell of graph.cells) {
    if (live.has(cell.id)) errors.push("duplicate-cell:" + cell.id);
    live.set(cell.id, cell);
    const position = cellKey(cell);
    const neighbors = occupied.get(position) ?? [];
    for (const other of neighbors) {
      const oldA = birthCells.get(cell.id), oldB = birthCells.get(other.id);
      if (!(oldA && oldB && cellKey(oldA) === cellKey(oldB)))
        errors.push("unrecorded-material-overlap:" + cell.id + ":" + other.id);
    }
    neighbors.push(cell);
    occupied.set(position, neighbors);
    if (forbiddenResurrection.has(cell.id))
      errors.push("resurrected-cell:" + cell.id);
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) ||
        cell.x < 0 || cell.x >= CHRONOLOGICAL_LIMITS.world ||
        cell.y < 0 || cell.y >= CHRONOLOGICAL_LIMITS.world)
      errors.push("out-of-world:" + cell.id);
    if (voids.has(cellKey(cell))) errors.push("protected-void:" + cell.id);
    if (!tissueIds.has(cell.tissueId))
      errors.push("missing-owner:" + cell.id);
    if (!cell.sourceIds.length || cell.sourceIds.some(id => !sources.has(id)))
      errors.push("missing-authored-ancestry:" + cell.id);
    if (cell.provenance === "generated" && !cell.operationId)
      errors.push("missing-operator:" + cell.id);
    if (cell.provenance === "authored" && !sources.has(cell.id))
      errors.push("invented-authored-cell:" + cell.id);
  }
  // Active links require live, nearby endpoints owned by the named tissues.
  for (const link of graph.links) {
    const a = link.fromCellId ? live.get(link.fromCellId) : undefined;
    const b = link.toCellId ? live.get(link.toCellId) : undefined;
    if (link.fromCellId && (!a || a.tissueId !== link.fromTissueId))
      errors.push("stale-link-source:" + link.id);
    if (link.toCellId && (!b || b.tissueId !== link.toTissueId))
      errors.push("stale-link-destination:" + link.id);
    if (!tissueIds.has(link.fromTissueId) || !tissueIds.has(link.toTissueId))
      errors.push("missing-link-tissue:" + link.id);
    if (a && b && (a.x - b.x) ** 2 + (a.y - b.y) ** 2 > 8)
      errors.push("separated-link:" + link.id);
  }
  for (const tissue of graph.tissues) {
    if (tissue.parentId && !tissueIds.has(tissue.parentId))
      errors.push("stale-parent:" + tissue.id);
    // Historical site metadata may point at resorbed material, but must not
    // silently be considered active by a future growth step.
  }
  for (const site of graph.sites) {
    if (!tissueIds.has(site.tissueId))
      errors.push("orphaned-growth-site:" + site.id);
    // A source site may remain in the historical audit trail, but the active
    // graph MUST invalidate its live claim if its tip has been reabsorbed.
    const tip = live.get(site.rootCellId);
    if (!tip || tip.tissueId !== site.tissueId)
      errors.push("stale-active-growth-site:" + site.id);
  }
  return errors;
}
function delta(before: MaterialGraph, after: MaterialGraph): ChronologicalDelta {
  const old = new Map(before.cells.map(c => [c.id, c]));
  const now = new Map(after.cells.map(c => [c.id, c]));
  const oldLinks = new Map(before.links.map(l => [l.id, l]));
  return {
    createdCellIds: after.cells.filter(c => !old.has(c.id)).map(c => c.id).sort(compareText),
    removedCellIds: before.cells.filter(c => !now.has(c.id)).map(c => c.id).sort(compareText),
    relocatedCellIds: after.cells.filter(c => {
      const p = old.get(c.id);
      return !!p && (p.x !== c.x || p.y !== c.y);
    }).map(c => c.id).sort(compareText),
    updatedLinkIds: after.links.filter(link =>
      !same(oldLinks.get(link.id), link)).map(link => link.id).sort(compareText),
  };
}

/**
 * Pure reference replay scheduler. This is only usable when **incremental**
 * real Development/Care adapters are supplied; their existing from-birth
 * functions are NOT valid ChronologicalProposal.apply implementations.
 */
export function evaluateChronologicalMaterial<Context>(
  birth: MaterialGraph,
  initialContext: Context,
  proposals: readonly ChronologicalProposal<Context>[],
  requestedHour: number,
): ChronologicalFrame<Context> {
  if (!Number.isFinite(requestedHour) || requestedHour < 0 ||
      requestedHour > CHRONOLOGICAL_LIMITS.maxHour)
    throw new RangeError("Unified material age out of supported lifetime domain");
  if (proposals.length > CHRONOLOGICAL_LIMITS.maxEvents)
    throw new RangeError("Chronological event budget exceeded");
  const ids = new Set<string>();
  for (const proposal of proposals) {
    if (!Number.isFinite(proposal.atHour) || proposal.atHour < 0 ||
        proposal.atHour > CHRONOLOGICAL_LIMITS.maxHour ||
        !Object.hasOwn(priorities, proposal.kind) ||
        !proposal.id || ids.has(proposal.id))
      throw new RangeError("Invalid, duplicate or out-of-domain material event");
    ids.add(proposal.id);
    if (proposal.kind === "iterative-interval" &&
        (!Number.isSafeInteger(proposal.atHour) ||
         proposal.atHour < 1 || proposal.atHour > 512))
      throw new RangeError("Iterative interval exceeds DEV-003 chronological domain");
  }
  const history = proposals.filter(p => p.atHour <= requestedHour)
    .sort(compareChronologicalEvents);
  const birthErrors = validateChronologicalGraph(birth, birth);
  if (birthErrors.length) throw new TypeError("Invalid birth material: " +
    birthErrors[0]);
  let graph = birth, context = initialContext;
  const removedIds = new Set<string>();
  const outcomes: ChronologicalOutcome[] = [];
  for (const proposal of history) {
    const previously = graph;
    const previousJson = JSON.stringify(previously);
    const contextJson = JSON.stringify(context);
    const next = proposal.apply(previously, context);
    if (JSON.stringify(previously) !== previousJson ||
        JSON.stringify(context) !== contextJson)
      throw new TypeError("Material proposal mutated its input state: " + proposal.id);
    const change = delta(previously, next.graph);
    if (!next.accepted) {
      if (next.graph !== previously)
        throw new TypeError("Rejected proposal committed partial anatomy: " + proposal.id);
      // Persistent suppression and deferral ledgers legitimately advance.
      // Their immutable context can change without material being committed.
      context = next.context;
      outcomes.push({ id: proposal.id, atHour: proposal.atHour,
        kind: proposal.kind, accepted: false,
        reason: next.reason ?? "deferred", delta: change });
      continue;
    }
    const errors = validateChronologicalGraph(birth, next.graph, removedIds);
    if (errors.length)
      throw new TypeError("Invalid committed material event " + proposal.id +
        ": " + errors[0]);
    for (const id of change.removedCellIds) removedIds.add(id);
    graph = next.graph;
    context = next.context;
    outcomes.push({ id: proposal.id, atHour: proposal.atHour,
      kind: proposal.kind, accepted: true, reason: null, delta: change });
  }
  return { graph, context, outcomes, lastHour: requestedHour };
}

/** Historical from-birth functions remain noncomposable. The actual live
 * timeline now uses the merged incremental contracts in unified-runtime.ts. */
export const CHRONOLOGICAL_LEGACY_WARNINGS = Object.freeze([
  "Do not replay cumulative careMaterialOperatorsAt on already-grown material",
  "Do not use iterativeGrowthAt, whose legacy replay horizon is 512 hours",
  "Do not use lifetimeRemodelingAt as an overlay of an unrelated birth snapshot",
]);

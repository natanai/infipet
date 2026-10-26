/**
 * Physical eligibility of source-derived material, not an anatomical name classifier.
 *
 * Input coordinates are the 64-cell immutable material graph. Every accepted
 * attachment cites an active link, both active endpoint cells, an eight-connected
 * tissue path, its source cell ancestry, and a flexible downward span. The
 * presentation mapper is the same regional mapper used by growth.ts.
 *
 * This narrow adapter also consumes future DEV-003/004 child tissues without
 * importing their unmerged APIs. A child without an explicit valid material
 * attachment is never promoted to a locomotor controller.
 */
import { clamp, compareText, type Point } from "../simulation/model";
import { mapSourcePoint, type Region } from "../simulation/development";
import type { MaterialCell, MaterialGraph, MaterialLink } from "../development";
import type { MechanicalEvidence, RigNode } from "../simulation/locomotion";

export type MaterialMovementBinding = Readonly<{
  tissueId: string;
  rigId: string;
  sourcePartId: string;
  anchor: Point;
  tip: Point;
  evidence: MechanicalEvidence;
}>;
export type FunctionalMaterialResult = Readonly<{
  nodes: RigNode[];
  bindings: readonly MaterialMovementBinding[];
  evidence: readonly MechanicalEvidence[];
}>;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a: Point, b: Point) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1.001;
const sameCell = (a: MaterialCell, b: MaterialCell) => a.id === b.id;
const ordered = (cells: readonly MaterialCell[]) =>
  [...cells].sort((a, b) => compareText(a.id, b.id));

function connected(cells: readonly MaterialCell[], root: MaterialCell): number {
  if (!cells.some(cell => sameCell(cell, root))) return 0;
  const seen = new Set([root.id]), queue = [root];
  for (let i = 0; i < queue.length; i++) {
    for (const cell of cells) {
      if (!seen.has(cell.id) && near(queue[i], cell)) {
        seen.add(cell.id);
        queue.push(cell);
      }
    }
  }
  return seen.size;
}

function sourceList(cells: readonly MaterialCell[]) {
  return [...new Set(cells.flatMap(cell => cell.sourceIds))].sort(compareText);
}

/** Geometry and explicit material joints override a region's convenient 'leg' label. */
export function inferFunctionalMaterial(
  graph: MaterialGraph,
  regions: readonly Region[],
  input: readonly RigNode[],
): FunctionalMaterialResult {
  const live = new Map(graph.cells.map(cell => [cell.id, cell]));
  const source = new Set(graph.sourceCells.map(cell => cell.id));
  const byTissue = new Map<string, MaterialCell[]>();
  for (const cell of graph.cells) {
    const group = byTissue.get(cell.tissueId) ?? [];
    group.push(cell);
    byTissue.set(cell.tissueId, group);
  }
  const nodes = input.map(node => ({ ...node, sourceIds: [...node.sourceIds] }));
  const evidence: MechanicalEvidence[] = [];
  const bindings: MaterialMovementBinding[] = [];
  const roots = new Set(
    regions.filter(region => region.kind === "body" || region.kind === "egg")
      .flatMap(region => region.sourceIds),
  );
  // A link to another tissue is required, and its chain must eventually lead
  // to an original body. This prevents a floating mark from becoming a foot.
  const tissues = new Map(graph.tissues.map(t => [t.id, t]));
  const reachesBody = (id: string): boolean => {
    const seen = new Set<string>();
    let here: string | null | undefined = id;
    while (here && !seen.has(here)) {
      seen.add(here);
      const t = tissues.get(here);
      if (!t) return false;
      if (roots.has(t.sourcePartId)) return true;
      here = t.parentId;
    }
    return false;
  };
  const candidates = [...graph.tissues].sort((a, b) => compareText(a.id, b.id));
  for (const tissue of candidates) {
    const group = ordered(byTissue.get(tissue.id) ?? []);
    const links = [...graph.links].filter(link =>
      link.kind === "attachment" && link.fromTissueId === tissue.id &&
      link.fromCellId && link.toCellId &&
      live.get(link.fromCellId)?.tissueId === tissue.id &&
      live.get(link.toCellId)?.tissueId === link.toTissueId &&
      tissue.parentId === link.toTissueId &&
      near(live.get(link.fromCellId)!, live.get(link.toCellId)!),
    ).sort((a, b) => compareText(a.id, b.id));
    const link: MaterialLink | undefined = links[0];
    const root = link?.fromCellId ? live.get(link.fromCellId) : undefined;
    const tip = root ? [...group].sort((a, b) =>
      dist(b, root) - dist(a, root) || compareText(a.id, b.id))[0] : undefined;
    const span = root && tip ? dist(root, tip) : 0;
    const down = root && tip ? (tip.y - root.y) / Math.max(0.001, span) : 0;
    const intact = !!root && connected(group, root) === group.length;
    const flexible = clamp(1 - tissue.rigidity, 0, 1);
    const anchored = !!link && reachesBody(tissue.id);
    const eligible = anchored && intact && group.length >= 4 && span >= 2.5 &&
      down >= 0.5 && flexible >= 0.3 &&
      group.every(cell => cell.sourceIds.length > 0 &&
        cell.sourceIds.every(id => source.has(id)) &&
        (cell.provenance === "authored" || cell.operationId !== null));
    const record: MechanicalEvidence = {
      tissueId: tissue.id,
      linkIds: links.map(value => value.id),
      sourceCellIds: sourceList(group),
      cellCount: group.length,
      axialExtent: Math.round(span * 1024) / 1024,
      flexibility: flexible,
      supported: eligible,
      reason: !anchored ? "no-active-body-attachment" :
        !intact ? "disconnected-material" :
        down < 0.5 ? "no-ground-facing-span" :
        span < 2.5 || group.length < 4 ? "insufficient-material" :
        flexible < 0.3 ? "rigid-no-flexure" :
        eligible ? "linked-flexible-support" : "invalid-ancestry",
    };
    evidence.push(record);
    const region = regions.find(r => r.source?.id === tissue.sourcePartId);
    const existing = nodes.filter(node => node.kind === "leg" &&
      node.sourceIds.includes(tissue.sourcePartId));
    if (existing.length && !tissue.id.includes("/growth/")) {
      for (const node of existing) {
        node.mechanics = record;
        // Existing limb geometry still comes from its authoritative region.
      }
      continue;
    }
    if (!eligible || !region || !root || !tip ||
        !tissue.id.includes("/growth/")) continue;
    const anchor = mapSourcePoint(region, root);
    const end = mapSourcePoint(region, tip);
    if (dist(anchor, end) < 2) continue;
    const rigId = "material-support/" + tissue.id;
    // Two supports at effectively the same rest tip are not independent legs.
    const collision = bindings.some(binding =>
      dist(binding.tip, end) < 1.5 && dist(binding.anchor, anchor) < 2);
    if (collision) continue;
    const readiness = clamp((span - 2) / 3, 0, 1);
    const node: RigNode = {
      id: rigId, kind: "leg", role: "material-support",
      center: { x: (anchor.x + end.x) / 2, y: (anchor.y + end.y) / 2 },
      anchor, tip: end, sourceIds: record.sourceCellIds.slice(),
      parentId: region.id, readiness,
      mechanics: record,
    };
    nodes.push(node);
    bindings.push({ tissueId: tissue.id, rigId, sourcePartId: tissue.sourcePartId,
      anchor, tip: end, evidence: record });
  }
  // A synthetic region with a convenient limb kind but without independently
  // supported material is not granted a fictitious joint by default.
  for (const node of nodes) if (node.kind === "leg" && !node.mechanics)
    node.mechanics = { tissueId: "", linkIds: [], sourceCellIds: node.sourceIds,
      cellCount: 0, axialExtent: 0, flexibility: 0, supported: false,
      reason: "no-material-link" };
  return { nodes, bindings, evidence };
}

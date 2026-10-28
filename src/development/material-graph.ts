import { compareText, type Pixel, type Point, type Relationship } from "../simulation/model";
import type { SourceAtlas } from "../simulation/source-atlas";

/** World-space source cells are retained independently of any later remodeling. */
export type MaterialCell = Readonly<{
  id: string;
  tissueId: string;
  x: number;
  y: number;
  color: string;
  z?: number;
  provenance: "authored" | "generated";
  /** Authored cell IDs, never inferred species, template or destination IDs. */
  sourceIds: readonly string[];
  /** Immediate predecessors permit step-by-step inspection of generated matter. */
  parentCellIds: readonly string[];
  operationId: string | null;
}>;

export type MaterialTissue = Readonly<{
  id: string;
  sourcePartId: string;
  parentId: string | null;
  relationship: Relationship;
  sourceCellIds: readonly string[];
  /** Explicit retained site IDs; coordinates are resolved against active cells. */
  growthSiteIds: readonly string[];
  rigidity: number;
}>;
export type MaterialSite = Readonly<{
  id: string;
  tissueId: string;
  rootCellId: string;
  direction: Readonly<Point>;
}>;
export type MaterialLink = Readonly<{
  id: string;
  fromTissueId: string;
  toTissueId: string;
  kind: "attachment" | "fusion";
  /** May be null for a historically authored but now remodeled attachment. */
  fromCellId: string | null;
  toCellId: string | null;
}>;
/** Exact spatial/structural changes committed by a single daily opportunity.
 * The before-images are checked against independently replayed state. */
export type MaterialChange<T> = Readonly<{before:T|null;after:T|null}>;
export type DailyPhysicalEvidence = Readonly<{
  authorizedEvents:readonly string[];
  relocations:readonly Readonly<{
    cellId:string;from:Readonly<Point>;to:Readonly<Point>;
    operationId:string;checkIndex:number;
  }>[];
  tissues:readonly MaterialChange<MaterialTissue>[];
  sites:readonly MaterialChange<MaterialSite>[];
  links:readonly MaterialChange<MaterialLink>[];
}>;
export type MaterialEvent = Readonly<{
  id: string;
  kind: string;
  atHour: number;
  createdCellIds: readonly string[];
  removedCellIds: readonly string[];
  sourceCellIds: readonly string[];
  /** Daily runtime archives creation metadata even after later resorption. */
  createdCells?: readonly MaterialCell[];
  checkIndex?: number;
  atMs?: number;
  careDigest?: string;
  genomeFingerprint?: string;
  /** The final event of a changed daily opportunity, never a rendered snapshot. */
  dailyPhysical?: DailyPhysicalEvidence;
}>;
export type MaterialGraph = Readonly<{
  version: 1;
  sourceFingerprint: string;
  sourceCells: readonly MaterialCell[];
  cells: readonly MaterialCell[];
  tissues: readonly MaterialTissue[];
  sites: readonly MaterialSite[];
  links: readonly MaterialLink[];
  /** Exact original empty enclosed spaces (per source patch), not color masks. */
  protectedVoids: readonly string[];
  events: readonly MaterialEvent[];
  /** Immutable birth topology, independent of the mutable live structure. */
  birthStructure?: Readonly<{tissues:readonly MaterialTissue[];sites:readonly MaterialSite[];links:readonly MaterialLink[]}>;
}>;
const at = (p: Point) => p.x + "," + p.y;
const neighbor = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const sorted = <T extends { x: number; y: number }>(values: readonly T[]) =>
  [...values].sort((a, b) => a.y - b.y || a.x - b.x);
const distance = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Eight-connected authored islands are independent material identities. */
function islands(pixels: readonly Pixel[]): Pixel[][] {
  const cells = new Map(sorted(pixels).map(p => [at(p), p]));
  const seen = new Set<string>();
  const groups: Pixel[][] = [];
  for (const p of sorted(pixels)) {
    if (seen.has(at(p))) continue;
    const group: Pixel[] = [], queue = [p];
    seen.add(at(p));
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i];
      group.push(cell);
      for (const [dx, dy] of neighbor) {
        const k = at({ x: cell.x + dx, y: cell.y + dy });
        const adjacent = cells.get(k);
        if (adjacent && !seen.has(k)) {
          seen.add(k);
          queue.push(adjacent);
        }
      }
    }
    groups.push(sorted(group));
  }
  return groups;
}

/** Four-connected exterior flood: diagonal openings do not erase true cavities. */
function voids(pixels: readonly Pixel[]): string[] {
  if (!pixels.length) return [];
  const occupied = new Set(pixels.map(at));
  const minX = Math.max(0, Math.min(...pixels.map(p => p.x)) - 1);
  const maxX = Math.min(63, Math.max(...pixels.map(p => p.x)) + 1);
  const minY = Math.max(0, Math.min(...pixels.map(p => p.y)) - 1);
  const maxY = Math.min(63, Math.max(...pixels.map(p => p.y)) + 1);
  const outside = new Set<string>(), queue: Point[] = [];
  function push(x: number, y: number) {
    const k = x + "," + y;
    if (x < minX || x > maxX || y < minY || y > maxY ||
        occupied.has(k) || outside.has(k)) return;
    outside.add(k);
    queue.push({ x, y });
  }
  for (let x = minX; x <= maxX; x++) { push(x, minY); push(x, maxY); }
  for (let y = minY; y <= maxY; y++) { push(minX, y); push(maxX, y); }
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  const result: string[] = [];
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const k = x + "," + y;
      if (!outside.has(k) && !occupied.has(k)) result.push(k);
    }
  return result;
}
const unit = (p: Point): Point => {
  const size = Math.hypot(p.x, p.y);
  return size > 0.001 ? { x: p.x / size, y: p.y / size } : { x: 0, y: -1 };
};

/**
 * Reuses the actual SourceAtlas tissues and ports. The source never assumes
 * that an authored mark is an animal, a face or even one connected body.
 */
export function createMaterialGraph(atlas: SourceAtlas): MaterialGraph {
  const sourceCells: MaterialCell[] = [], tissues: MaterialTissue[] = [];
  const sites: MaterialSite[] = [], links: MaterialLink[] = [];
  const sourceOwners = new Map<string, string[]>();
  const patches = [...atlas.patches].sort((a, b) => compareText(a.id, b.id));
  for (const patch of patches) {
    const all = patch.source.cells;
    const groups = islands(all);
    const owned: string[] = [];
    groups.forEach((group, ordinal) => {
      const id = patch.id + "/island/" + ordinal;
      owned.push(id);
      const componentCells = group.map(cell => {
        const cellId = "ink/" + encodeURIComponent(patch.id) + "/" +
          cell.x + "," + cell.y;
        const authored: MaterialCell = {
          id: cellId, tissueId: id, x: cell.x, y: cell.y, color: cell.color,
          ...(cell.z === undefined ? {} : { z: cell.z }),
          provenance: "authored", sourceIds: [cellId], parentCellIds: [],
          operationId: null,
        };
        sourceCells.push(authored);
        return authored;
      });
      const centroid = {
        x: group.reduce((s, p) => s + p.x, 0) / group.length,
        y: group.reduce((s, p) => s + p.y, 0) / group.length,
      };
      const endpoints = patch.ports
        .filter(port => componentCells.some(cell => distance(cell, port.point) < 1))
        .map(port => ({ id: port.id, cell: componentCells.find(cell =>
          distance(cell, port.point) < 1)!, normal: port.normal }));
      if (!endpoints.length) {
        const tip = [...componentCells].sort((a, b) =>
          distance(b, centroid) - distance(a, centroid) || compareText(a.id, b.id))[0];
        endpoints.push({ id: "tip", cell: tip, normal: unit({
          x: tip.x - centroid.x, y: tip.y - centroid.y,
        }) });
      }
      const activeSites = endpoints.slice(0, 3).map((port, i) => ({
        id: id + "/site/" + port.id + "/" + i, tissueId: id,
        rootCellId: port.cell.id, direction: unit(port.normal),
      }));
      sites.push(...activeSites);
      tissues.push({
        id, sourcePartId: patch.id, parentId: null,
        relationship: patch.source.relationship,
        sourceCellIds: componentCells.map(cell => cell.id),
        growthSiteIds: activeSites.map(site => site.id), rigidity: 0,
      });
    });
    sourceOwners.set(patch.id, owned);
  }
  // Only actual joint/surface connections count as attachments. Floating
  // imported marks remain floating even when an annotation names a parent.
  const sourceById = new Map(sourceCells.map(cell => [cell.id, cell]));
  for (let i = 0; i < tissues.length; i++) {
    const node = tissues[i];
    const patch = patches.find(p => p.id === node.sourcePartId)!;
    if (!patch.source.parentId || !["surface", "joint"].includes(node.relationship))
      continue;
    const parentOptions = sourceOwners.get(patch.source.parentId) ?? [];
    const own = node.sourceCellIds.map(id => sourceById.get(id)!);
    const possible = parentOptions.flatMap(id =>
      tissues.filter(t => t.id === id).flatMap(t => t.sourceCellIds.map(cellId =>
        ({ cell: sourceById.get(cellId)!, tissueId: id }))));
    let best: typeof possible[number] | undefined;
    let child: MaterialCell | undefined, d = Infinity;
    for (const a of own) for (const b of possible) {
      const score = distance(a, b.cell);
      if (score < d || (score === d && compareText(b.cell.id, best?.cell.id ?? "") < 0)) {
        d = score; best = b; child = a;
      }
    }
    if (best && child && d <= 8) {
      tissues[i] = { ...node, parentId: best.tissueId };
      links.push({
        id: "attachment/" + node.id, fromTissueId: node.id,
        toTissueId: best.tissueId, kind: "attachment",
        fromCellId: child.id, toCellId: best.cell.id,
      });
    }
  }
  const protectedVoids = new Set<string>();
  for (const patch of patches)
    for (const key of voids(patch.source.cells)) protectedVoids.add(key);
  return {
    version: 1, sourceFingerprint: atlas.geometryHash,
    sourceCells, cells: [...sourceCells], tissues, sites, links,
    protectedVoids: [...protectedVoids].sort(),
    events: [],
  };
}

/** Generated cells remain traceable even if their direct predecessor was absorbed. */
export function materialSourceAncestry(graph: MaterialGraph, cellId: string): readonly MaterialCell[] {
  const cell = graph.cells.find(c => c.id === cellId) ??
    graph.sourceCells.find(c => c.id === cellId);
  if (!cell) return [];
  const byId = new Map(graph.sourceCells.map(c => [c.id, c]));
  return cell.sourceIds.map(id => byId.get(id)).filter((c): c is MaterialCell => !!c);
}

/** JSON-safe graph: no object cycles, process caches or hidden runtime identity. */
export function reconstructMaterialGraph(snapshot: MaterialGraph): MaterialGraph {
  if (snapshot.version !== 1) throw new TypeError("Unknown material graph version");
  return JSON.parse(JSON.stringify(snapshot)) as MaterialGraph;
}

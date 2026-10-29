/** Local load-bearing growth law, MORPH-007. An axial addition must be within
 * L=2+floor(6*rigidity) material steps of authored material, a real joint, or
 * a supported local cross section (>=3 cardinal neighbors, or >=2 cardinal
 * and >=3 eight-neighbors). Surface deposition can build a new cross section
 * and thereby permit further extension. No grammar is disabled or replaced.
 * Exact 8-neighbor shortest path, <=8 layers, 64² integer domain. */
import type { MaterialCell, MaterialLink } from "./material-graph";
export function materialSupportLimit(rigidity: number): number {
  if (!Number.isFinite(rigidity) || rigidity < 0 || rigidity > 1)
    throw new RangeError("Invalid structural rigidity");
  return 2 + Math.floor(6 * rigidity);
}
export function growthSupportDistance(
  cells: readonly MaterialCell[],
  links: readonly MaterialLink[],
  tissueId: string,
  target: { x: number; y: number },
  rigidity: number,
): number | null {
  const limit = materialSupportLimit(rigidity),
    own = new Map<number, MaterialCell[]>();
  for (const c of cells)
    if (c.tissueId === tissueId) {
      const k = c.y * 64 + c.x,
        list = own.get(k) ?? [];
      list.push(c);
      own.set(k, list);
    }
  const joints = new Set(
    links.flatMap((l) =>
      l.fromTissueId === tissueId && l.fromCellId
        ? [l.fromCellId]
        : l.toTissueId === tissueId && l.toCellId
          ? [l.toCellId]
          : [],
    ),
  );
  const queue: { k: number; distance: number }[] = [],
    seen = new Set<number>();
  const neighbors = (x: number, y: number) => {
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (
          (dx || dy) &&
          x + dx >= 0 &&
          x + dx < 64 &&
          y + dy >= 0 &&
          y + dy < 64
        )
          out.push((y + dy) * 64 + x + dx);
    return out;
  };
  for (const k of neighbors(target.x, target.y))
    if (own.has(k)) {
      queue.push({ k, distance: 1 });
      seen.add(k);
    }
  for (let i = 0; i < queue.length; i++) {
    const { k, distance } = queue[i],
      x = k % 64,
      y = Math.floor(k / 64),
      near = neighbors(x, y);
    const n8 = near.filter((k) => own.has(k)).length,
      n4 = [
        x ? k - 1 : -1,
        x < 63 ? k + 1 : -1,
        y ? k - 64 : -1,
        y < 63 ? k + 64 : -1,
      ].filter((k) => own.has(k)).length;
    if (
      own
        .get(k)!
        .some((c) => c.provenance === "authored" || joints.has(c.id)) ||
      n4 >= 3 ||
      (n4 >= 2 && n8 >= 3)
    )
      return distance;
    if (distance >= limit) continue;
    for (const next of near)
      if (own.has(next) && !seen.has(next)) {
        seen.add(next);
        queue.push({ k: next, distance: distance + 1 });
      }
  }
  return null;
}

/** Source-derived pigment stratification, MORPH-007. For each birth tissue
 * and pigment, mean eight-neighbor occupancy times sqrt(source pigment area) is its
 * interior support score. Sparse contrast marks cannot become body filler.
 * A surface cell may advance one cell outward while adjacent, better-supported
 * interior material divides into its vacated coordinate. Original pigment is
 * transported, never recolored. Daughter ancestry belongs to its REAL interior
 * parent. Monochrome/unsupported fronts use ordinary deposition.
 * Finite integer grid, immutable-source cache only, no labeled body parts. */
import type { MaterialCell } from "./material-graph";
const cache = new WeakMap<
  readonly MaterialCell[],
  ReadonlyMap<string, number>
>();
const key = (p: { x: number; y: number }) => p.x + "," + p.y;
export function sourcePigmentSupport(
  source: readonly MaterialCell[],
): ReadonlyMap<string, number> {
  const cached = cache.get(source);
  if (cached) return new Map(cached);
  const positions = new Map<string, Set<string>>(),
    totals = new Map<string, { n: number; sum: number }>();
  for (const c of source) {
    const own = positions.get(c.tissueId) ?? new Set();
    own.add(key(c));
    positions.set(c.tissueId, own);
  }
  for (const c of source) {
    const k = c.tissueId + "|" + c.color,
      v = totals.get(k) ?? { n: 0, sum: 0 },
      own = positions.get(c.tissueId)!;
    let support = 0;
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++)
        if ((x || y) && own.has(c.x + x + "," + (c.y + y))) support++;
    v.n++;
    v.sum += support;
    totals.set(k, v);
  }
  const result = new Map(
    [...totals].map(([k, v]) => [k, v.sum / Math.sqrt(v.n)]),
  );
  if (Object.isFrozen(source) && source.every(Object.isFrozen))
    cache.set(source, result);
  return new Map(result);
}
export function advancingInteriorParent(
  source: readonly MaterialCell[],
  live: readonly MaterialCell[],
  surface: MaterialCell,
  to: { x: number; y: number },
  support: ReadonlyMap<string, number>,
): MaterialCell | null {
  if (live.filter((c) => key(c) === key(surface)).length !== 1) return null;
  const score = (c: MaterialCell) =>
    support.get(c.tissueId + "|" + c.color) ?? -1;
  const dx = to.x - surface.x,
    dy = to.y - surface.y;
  return (
    live
      .filter(
        (c) =>
          c.tissueId === surface.tissueId &&
          c.color !== surface.color &&
          c.z === surface.z &&
          Math.max(Math.abs(c.x - surface.x), Math.abs(c.y - surface.y)) <= 1 &&
          (c.x - surface.x) * dx + (c.y - surface.y) * dy < 0 &&
          score(c) > score(surface) + 1,
      )
      .sort(
        (a, b) =>
          score(b) - score(a) ||
          a.y - b.y ||
          a.x - b.x ||
          (a.id < b.id ? -1 : 1),
      )[0] ?? null
  );
}

import type { MaterialCell } from "./material-graph";
export type AnatomicalBond = Readonly<{
  a: string;
  b: string;
  distance: number;
}>;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const caches = new WeakMap<
  readonly MaterialCell[],
  readonly AnatomicalBond[]
>();
export function sourceNeighborhood(
  source: readonly MaterialCell[],
): readonly AnatomicalBond[] {
  const cached = caches.get(source);
  if (cached) return cached;
  const parent = source.map((_, i) => i),
    root = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
  const positions = new Map<string, number[]>(),
    bonds: AnatomicalBond[] = [];
  source.forEach((c, i) => {
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++)
        for (const j of positions.get(c.x + x + "," + (c.y + y)) ?? []) {
          bonds.push({ a: source[j].id, b: c.id, distance: 2 });
          parent[root(i)] = root(j);
        }
    const k = c.x + "," + c.y,
      list = positions.get(k) ?? [];
    list.push(i);
    positions.set(k, list);
  });
  const groups = new Map<number, number[]>();
  source.forEach((_, i) => {
    const r = root(i),
      list = groups.get(r) ?? [];
    list.push(i);
    groups.set(r, list);
  });
  const islands = [...groups.values()].sort(
    (a, b) => b.length - a.length || a[0] - b[0],
  );
  if (islands.length > 1) {
    const reached = new Set<number>([0]),
      best = new Map<number, { a: number; b: number; d: number }>();
    let newest = 0;
    while (reached.size < islands.length) {
      for (let g = 0; g < islands.length; g++)
        if (!reached.has(g))
          for (const a of islands[newest])
            for (const b of islands[g]) {
              const d = distance(source[a], source[b]),
                old = best.get(g);
              if (
                !old ||
                d < old.d ||
                (d === old.d && (a < old.a || (a === old.a && b < old.b)))
              )
                best.set(g, { a, b, d });
            }
      const next = [...best]
        .filter(([g]) => !reached.has(g))
        .sort((a, b) => a[1].d - b[1].d || a[0] - b[0])[0];
      const [g, { a, b, d }] = next;
      bonds.push({ a: source[a].id, b: source[b].id, distance: d + 1 });
      reached.add(g);
      newest = g;
    }
  }
  const result = Object.freeze(bonds.map((b) => Object.freeze(b)));
  if (Object.isFrozen(source) && source.every(Object.isFrozen))
    caches.set(source, result);
  return result;
}

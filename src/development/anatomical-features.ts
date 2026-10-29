/** Immutable birth anatomy contract, MORPH-007. Features are inferred from
 * ink, not labels: pigment islands, authored material islands and contour
 * extrema with a geodesic collar. A feature needs ceil(sqrt(birth area))
 * occupied sites; an extremal port also retains an exposed descendant.
 * Pigment contacts and pigment enclosures describe anatomical relationships.
 * Cells may retire. These are feature requirements, never pixel quotas.
 * All floods use 8-connected material / 4-connected background on [0,63]^2.
 */
import type { MaterialCell } from "./material-graph";
import { sourceNeighborhood } from "./anatomical-neighborhood";
export type AnatomicalFeature = Readonly<{
  id: number;
  sourceIds: readonly string[];
  minimum: number;
  pigment: string | null;
  ports: readonly (readonly string[])[];
}>;
export type AnatomicalFeatures = Readonly<{
  features: readonly AnatomicalFeature[];
  bonds: readonly Readonly<{ a: number; b: number; distance: number }>[];
  enclosures: readonly Readonly<{ outer: number; inner: number }>[];
  membership: ReadonlyMap<string, readonly number[]>;
}>;
const cache = new WeakMap<readonly MaterialCell[], AnatomicalFeatures>();
const code = (p: { x: number; y: number }) => p.y * 64 + p.x;
const around = (k: number) => {
  const x = k % 64,
    y = Math.floor(k / 64),
    out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (
        (dx || dy) &&
        x + dx >= 0 &&
        x + dx < 64 &&
        y + dy >= 0 &&
        y + dy < 64
      )
        out.push(k + dy * 64 + dx);
  return out;
};
export function enclosedSites(
  occupied: ReadonlySet<number>,
): ReadonlySet<number> {
  if (!occupied.size) return new Set();
  let minX = 63,
    maxX = 0,
    minY = 63,
    maxY = 0;
  for (const k of occupied) {
    const x = k % 64,
      y = Math.floor(k / 64);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (maxX - minX < 2 || maxY - minY < 2) return new Set();
  const outside = new Uint8Array(4096),
    queue = new Uint16Array(4096);
  let tail = 0;
  const add = (k: number) => {
    if (!occupied.has(k) && !outside[k]) {
      outside[k] = 1;
      queue[tail++] = k;
    }
  };
  for (let x = minX; x <= maxX; x++) {
    add(minY * 64 + x);
    add(maxY * 64 + x);
  }
  for (let y = minY; y <= maxY; y++) {
    add(y * 64 + minX);
    add(y * 64 + maxX);
  }
  for (let head = 0; head < tail; head++) {
    const k = queue[head],
      x = k % 64,
      y = Math.floor(k / 64);
    if (x > minX) add(k - 1);
    if (x < maxX) add(k + 1);
    if (y > minY) add(k - 64);
    if (y < maxY) add(k + 64);
  }
  const inside = new Set<number>();
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const k = y * 64 + x;
      if (!occupied.has(k) && !outside[k]) inside.add(k);
    }
  return inside;
}
export function sourceFeatures(
  source: readonly MaterialCell[],
): AnatomicalFeatures {
  const cached = cache.get(source);
  if (cached) return { ...cached, membership: new Map(cached.membership) };
  const positions = new Map<number, MaterialCell[]>(),
    byId = new Map(source.map((c) => [c.id, c]));
  for (const c of source) {
    const k = code(c),
      list = positions.get(k) ?? [];
    list.push(c);
    positions.set(k, list);
  }
  const features: {
      id: number;
      sourceIds: string[];
      minimum: number;
      pigment: string | null;
      ports: string[][];
    }[] = [],
    duplicates = new Map<string, number>();
  const add = (
    ids: readonly string[],
    pigment: string | null,
    port?: readonly string[],
  ) => {
    const ordered = [...new Set(ids)].sort(),
      signature = ordered.join("|");
    let id = duplicates.get(signature);
    if (id === undefined) {
      id = features.length;
      duplicates.set(signature, id);
      features.push({
        id,
        sourceIds: ordered,
        minimum: Math.ceil(
          Math.sqrt(new Set(ordered.map((id) => code(byId.get(id)!))).size),
        ),
        pigment,
        ports: [],
      });
    } else if (pigment !== null) features[id].pigment = pigment;
    if (port) features[id].ports.push([...port].sort());
    return id;
  };
  const pigmentAt = new Map<string, number>(),
    tissueAt = new Map<string, number>(),
    seen = new Set<string>();
  for (const first of source)
    if (!seen.has(first.id)) {
      const queue = [first];
      seen.add(first.id);
      for (let i = 0; i < queue.length; i++)
        for (const k of [code(queue[i]), ...around(code(queue[i]))])
          for (const c of positions.get(k) ?? [])
            if (c.color === first.color && !seen.has(c.id)) {
              seen.add(c.id);
              queue.push(c);
            }
      const id = add(
        queue.map((c) => c.id),
        first.color,
      );
      for (const c of queue) pigmentAt.set(c.id, id);
    }
  const tissues = new Map<string, string[]>();
  for (const c of source) {
    const ids = tissues.get(c.tissueId) ?? [];
    ids.push(c.id);
    tissues.set(c.tissueId, ids);
  }
  for (const ids of tissues.values()) {
    const id = add(ids, null);
    for (const s of ids) tissueAt.set(s, id);
  }
  // Row/column contour extrema identify protrusions even in one-color freehand
  // ink. Flat contour plateaus form one port, not one protected pixel per row.
  const unseen = new Set(positions.keys()),
    wholeInside = enclosedSites(new Set(positions.keys()));
  while (unseen.size) {
    const first = unseen.values().next().value!,
      component = [first];
    unseen.delete(first);
    for (let i = 0; i < component.length; i++)
      for (const n of around(component[i]))
        if (unseen.delete(n)) component.push(n);
    const own = new Set(component),
      rows = new Map<number, { min: number; max: number }>(),
      cols = new Map<number, { min: number; max: number }>();
    for (const k of component) {
      const x = k % 64,
        y = Math.floor(k / 64),
        r = rows.get(y) ?? { min: x, max: x },
        c = cols.get(x) ?? { min: y, max: y };
      rows.set(y, { min: Math.min(r.min, x), max: Math.max(r.max, x) });
      cols.set(x, { min: Math.min(c.min, y), max: Math.max(c.max, y) });
    }
    const peaks = new Set(
      component.filter((k) => {
        const x = k % 64,
          y = Math.floor(k / 64),
          r = rows.get(y)!,
          c = cols.get(x)!;
        return (
          (x === r.min &&
            [y - 1, y + 1].every(
              (v) => !rows.has(v) || r.min <= rows.get(v)!.min,
            )) ||
          (x === r.max &&
            [y - 1, y + 1].every(
              (v) => !rows.has(v) || r.max >= rows.get(v)!.max,
            )) ||
          (y === c.min &&
            [x - 1, x + 1].every(
              (v) => !cols.has(v) || c.min <= cols.get(v)!.min,
            )) ||
          (y === c.max &&
            [x - 1, x + 1].every(
              (v) => !cols.has(v) || c.max >= cols.get(v)!.max,
            ))
        );
      }),
    );
    const radius = Math.max(1, Math.floor(Math.sqrt(component.length) / 6));
    while (peaks.size) {
      const start = peaks.values().next().value!,
        port = [start];
      peaks.delete(start);
      for (let i = 0; i < port.length; i++)
        for (const n of around(port[i])) if (peaks.delete(n)) port.push(n);
      if (
        !port.some((k) => {
          const x = k % 64,
            y = Math.floor(k / 64);
          return [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) => {
            const nx = x + dx,
              ny = y + dy,
              v = ny * 64 + nx;
            return (
              nx < 0 ||
              ny < 0 ||
              nx >= 64 ||
              ny >= 64 ||
              (!positions.has(v) && !wholeInside.has(v))
            );
          });
        })
      )
        continue;
      const collar = new Set(port);
      let front = port;
      for (let r = 0; r < radius; r++) {
        const next: number[] = [];
        for (const k of front)
          for (const n of around(k))
            if (own.has(n) && !collar.has(n)) {
              collar.add(n);
              next.push(n);
            }
        front = next;
      }
      add(
        [...collar].flatMap((k) => positions.get(k)!.map((c) => c.id)),
        null,
        port.flatMap((k) => positions.get(k)!.map((c) => c.id)),
      );
    }
  }
  const bonds = new Map<string, { a: number; b: number; distance: number }>();
  for (const b of sourceNeighborhood(source))
    for (const mapping of [pigmentAt, tissueAt]) {
      const left = mapping.get(b.a)!,
        right = mapping.get(b.b)!;
      if (left === right) continue;
      const a = Math.min(left, right),
        c = Math.max(left, right),
        k = a + "," + c,
        d = Math.max(2, 2 * (b.distance - 1)),
        old = bonds.get(k);
      if (!old || d < old.distance) bonds.set(k, { a, b: c, distance: d });
    }
  const enclosures: { outer: number; inner: number }[] = [];
  for (const outer of features)
    if (outer.pigment !== null) {
      const mask = new Set(
        outer.sourceIds
          .map((id) => byId.get(id)!)
          .filter(
            (c) =>
              !(positions.get(code(c)) ?? []).some((p) => p.color !== c.color),
          )
          .map(code),
      );
      if (mask.size < 4) continue;
      const inside = enclosedSites(mask);
      if (!inside.size) continue;
      for (const inner of features)
        if (
          inner.id !== outer.id &&
          inner.pigment !== null &&
          inner.sourceIds.every((id) => inside.has(code(byId.get(id)!)))
        )
          enclosures.push({ outer: outer.id, inner: inner.id });
    }
  const membership = new Map<string, number[]>();
  for (const f of features)
    for (const id of f.sourceIds) {
      const ids = membership.get(id) ?? [];
      ids.push(f.id);
      membership.set(id, ids);
    }
  const result: AnatomicalFeatures = {
    features: Object.freeze(
      features.map((f) =>
        Object.freeze({
          ...f,
          sourceIds: Object.freeze(f.sourceIds),
          ports: Object.freeze(f.ports.map((p) => Object.freeze(p))),
        }),
      ),
    ),
    bonds: Object.freeze([...bonds.values()].map((v) => Object.freeze(v))),
    enclosures: Object.freeze(enclosures.map((v) => Object.freeze(v))),
    membership: new Map(
      [...membership].map(([id, ids]) => [id, Object.freeze(ids)]),
    ),
  };
  // Membership never escapes to the game or renderer; clone its container for
  // callers so no mutable Map can poison the private immutable birth contract.
  if (Object.isFrozen(source) && source.every(Object.isFrozen))
    cache.set(source, result);
  return { ...result, membership: new Map(result.membership) };
}

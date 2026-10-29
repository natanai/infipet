/** MORPH-007: drawn FEATURES persist while constituent cells can retire.
 * Birth-defined pigment islands, source parts, contour ports, contacts and
 * enclosures are the units of continuity. No stationary/pixel ancestry quota.
 */
import type { MaterialCell, MaterialLink } from "./material-graph";
import {
  sourceFeatures,
  enclosedSites,
  type AnatomicalFeatures,
} from "./anatomical-features";
import { isLatticeConnected } from "./lattice-connectivity";
export {
  sourceNeighborhood,
  type AnatomicalBond,
} from "./anatomical-neighborhood";
/** Only a drawing's actual overlaid source layers can share a cell later.
 * Two descendants of the SAME source pixel cannot invent a second layer. */
export function sourceOverlay(
  a: MaterialCell,
  b: MaterialCell,
  source: ReadonlyMap<string, MaterialCell>,
): boolean {
  const paired = (p: MaterialCell, q: MaterialCell) =>
    p.sourceIds.every((id) => {
      const s = source.get(id);
      return (
        !!s &&
        s.color === p.color &&
        p.z === s.z &&
        q.sourceIds.some((other) => {
          const t = source.get(other);
          return (
            id !== other &&
            !!t &&
            t.x === s.x &&
            t.y === s.y &&
            t.color === q.color &&
            t.z === q.z
          );
        })
      );
    });
  return paired(a, b) && paired(b, a);
}

export type AnatomicalContext = Readonly<{
  links?: readonly MaterialLink[];
  protectedVoids?: readonly string[];
}>;
type SourceBasis = Readonly<{
  blueprint: AnatomicalFeatures;
  originals: ReadonlyMap<string, MaterialCell>;
  owned: readonly ReadonlySet<string>[];
  ports: readonly (readonly ReadonlySet<string>[])[];
}>;
const sourceBasisCache = new WeakMap<readonly MaterialCell[], SourceBasis>();
/** Only frozen birth primitives are prepared once. Every candidate's live
 * material, joints, exposure and cavities are still reconstructed below. */
function sourceBasis(source: readonly MaterialCell[]): SourceBasis {
  const cached = sourceBasisCache.get(source);
  if (cached) return cached;
  const blueprint = sourceFeatures(source);
  const result: SourceBasis = {
    blueprint,
    originals: new Map(source.map((c) => [c.id, c])),
    owned: blueprint.features.map((f) => new Set(f.sourceIds)),
    ports: blueprint.features.map((f) => f.ports.map((p) => new Set(p))),
  };
  if (Object.isFrozen(source) && source.every(Object.isFrozen))
    sourceBasisCache.set(source, result);
  return result;
}
const code = (p: { x: number; y: number }) => p.y * 64 + p.x;
export function anatomicalContinuityFailure(
  source: readonly MaterialCell[],
  live: readonly MaterialCell[],
  context: AnatomicalContext = {},
): string | null {
  const { blueprint, originals, owned, ports } = sourceBasis(source);
  const members = blueprint.features.map(() => new Map<string, MaterialCell>()),
    positions = new Map<number, MaterialCell[]>();
  for (const c of live) {
    const k = code(c),
      list = positions.get(k) ?? [];
    list.push(c);
    positions.set(k, list);
    for (const id of c.sourceIds)
      if (originals.get(id)?.color === c.color)
        for (const f of blueprint.membership.get(id) ?? []) {
          const feature = blueprint.features[f];
          if (
            feature.pigment !== null &&
            c.sourceIds.some((id) => !owned[f].has(id))
          )
            continue;
          members[f].set(c.id, c);
        }
  }
  const groups = members.map((m) => [...m.values()]),
    occupied = new Set(positions.keys());
  const emptyInside = enclosedSites(occupied);
  for (const k of context.protectedVoids ?? []) {
    const [x, y] = k.split(",").map(Number),
      v = y * 64 + x;
    if (!occupied.has(v) && !emptyInside.has(v))
      return "drawn-cavity-opened:" + k;
  }
  for (const f of blueprint.features) {
    const group = groups[f.id],
      own = new Set(group.map(code));
    if (own.size < f.minimum) return "drawn-feature-lost:" + f.id;
    if (f.pigment !== null && group.length > 1 && !isLatticeConnected(group)) {
      // A real joint may span the existing two-cell attachment tolerance.
      const ids = new Set(group.map((c) => c.id)),
        seen = new Set<string>(),
        queue = [group[0]];
      seen.add(group[0].id);
      const byId = new Map(group.map((c) => [c.id, c]));
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        for (const c of group)
          if (
            !seen.has(c.id) &&
            Math.max(Math.abs(c.x - p.x), Math.abs(c.y - p.y)) <= 1
          ) {
            seen.add(c.id);
            queue.push(c);
          }
        for (const link of context.links ?? []) {
          const next =
            link.fromCellId === p.id
              ? link.toCellId
              : link.toCellId === p.id
                ? link.fromCellId
                : null;
          if (next && ids.has(next) && !seen.has(next)) {
            seen.add(next);
            queue.push(byId.get(next)!);
          }
        }
      }
      if (seen.size !== group.length) return "drawn-feature-scattered:" + f.id;
    }
    for (const ids of ports[f.id]) {
      if (
        !group.some(
          (c) =>
            c.sourceIds.some((id) => ids.has(id)) &&
            [
              { x: 1, y: 0 },
              { x: -1, y: 0 },
              { x: 0, y: 1 },
              { x: 0, y: -1 },
            ].some((d) => {
              const x = c.x + d.x,
                y = c.y + d.y,
                k = y * 64 + x;
              return (
                x < 0 ||
                y < 0 ||
                x >= 64 ||
                y >= 64 ||
                (!occupied.has(k) && !emptyInside.has(k))
              );
            }),
        )
      )
        return "drawn-protrusion-buried:" + f.id;
    }
  }
  for (const b of blueprint.bonds) {
    const a = groups[b.a],
      c = groups[b.b];
    if (
      !a.some((p) =>
        c.some(
          (q) =>
            Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) <= b.distance,
        ),
      )
    )
      return "drawn-neighborhood-torn:" + b.a + ":" + b.b;
  }
  for (const { outer, inner } of blueprint.enclosures) {
    const carrier = new Set(
      groups[outer]
        .filter(
          (c) =>
            !(positions.get(code(c)) ?? []).some((p) => p.color !== c.color),
        )
        .map(code),
    );
    const inside = enclosedSites(carrier);
    if (groups[inner].some((c) => !inside.has(code(c))))
      return "drawn-enclosure-broken:" + outer + ":" + inner;
  }
  return null;
}
/** Candidate edits use the SAME feature contract; failed edits never commit.
 * The independent auditor separately reconstructs and checks the full result. */
export function anatomicalEditGuard(
  source: readonly MaterialCell[],
  live: readonly MaterialCell[],
  context: AnatomicalContext = {},
) {
  return (
    old: MaterialCell,
    replacement: MaterialCell | null,
    added: readonly MaterialCell[] = [],
  ): boolean =>
    !anatomicalContinuityFailure(
      source,
      [
        ...live.flatMap((c) =>
          c.id !== old.id ? [c] : replacement ? [replacement] : [],
        ),
        ...added,
      ],
      context,
    );
}

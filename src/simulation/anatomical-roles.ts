/** FUNCTIONAL POSE ORIENTATION ONLY. This module assigns spatial support
 * sides to ALREADY player-selected parts; its geometry NEVER identifies a
 * new PartKind, species, eyes, legs or wings. The selector's source labels
 * remain authoritative. Mechanically usable effectors additionally require
 * physical evidence and valid source-owned connections. */
import type { Point } from "./model";
import type { SourceAtlas, SourcePatch } from "./source-atlas";

const cache = new WeakMap<SourceAtlas, ReadonlyMap<string, string>>();
const dot = (p: Point, axis: Point) => p.x * axis.x + p.y * axis.y;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const close = (a: number, b: number) => Math.abs(a - b) < 1e-7;
const unit = (p: Point): Point => {
  const length = Math.hypot(p.x, p.y);
  return length > 1e-8 ? { x: p.x / length, y: p.y / length } : { x: 1, y: 0 };
};

function readOnlyMap(values: Map<string, string>): ReadonlyMap<string, string> {
  const view: ReadonlyMap<string, string> = Object.freeze({
    size: values.size,
    get: (key: string) => values.get(key),
    has: (key: string) => values.has(key),
    entries: () => values.entries(),
    keys: () => values.keys(),
    values: () => values.values(),
    [Symbol.iterator]: () => values[Symbol.iterator](),
    forEach: (
      callback: (
        value: string,
        key: string,
        map: ReadonlyMap<string, string>,
      ) => void,
      thisArg?: unknown,
    ) => {
      values.forEach((value, key) => callback.call(thisArg, value, key, view));
    },
  });
  return view;
}

function bodyAxis(
  body: SourcePatch | undefined,
  heads: SourcePatch[],
  center: Point,
): Point {
  const cells = body?.source.cells ?? [];
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const p of cells) {
    const d = sub(p, center);
    xx += d.x * d.x;
    yy += d.y * d.y;
    xy += d.x * d.y;
  }
  const facing = heads.length
    ? heads.reduce(
        (sum, head) => ({
          x: sum.x + (head.center.x - center.x) / heads.length,
          y: sum.y + (head.center.y - center.y) / heads.length,
        }),
        { x: 0, y: 0 },
      )
    : { x: 0, y: 0 };
  const anisotropy = Math.hypot(xx - yy, xy * 2) / Math.max(1e-8, xx + yy);
  const angle = 0.5 * Math.atan2(xy * 2, xx - yy);
  let axis =
    anisotropy > 0.4
      ? { x: Math.cos(angle), y: Math.sin(angle) }
      : Math.hypot(facing.x, facing.y) > 0.5
        ? unit(facing)
        : unit({ x: body?.axisWeight ?? 1, y: 1 - (body?.axisWeight ?? 1) });
  if (
    dot(axis, facing) < -1e-7 ||
    (Math.hypot(facing.x, facing.y) < 0.5 &&
      (axis.x < -1e-7 || (close(axis.x, 0) && axis.y > 0)))
  )
    axis = { x: -axis.x, y: -axis.y };
  return axis;
}

type Support = {
  patch: SourcePatch;
  longitudinal: number;
  signature: number[];
};
function signatureCompare(a: readonly number[], b: readonly number[]) {
  for (let i = 0; i < a.length; i++) if (!close(a[i], b[i])) return a[i] - b[i];
  return 0;
}

/** Distinct geometry gets distinct sides; truly coincident geometry shares a conservative phase. */
function assignSides(
  group: Support[],
  prefix: string,
  roles: Map<string, string>,
) {
  const unique: number[][] = [];
  for (const support of [...group].sort((a, b) =>
    signatureCompare(a.signature, b.signature),
  ))
    if (!unique.some((key) => signatureCompare(key, support.signature) === 0))
      unique.push(support.signature);
  for (const support of group) {
    const rank = unique.findIndex(
      (key) => signatureCompare(key, support.signature) === 0,
    );
    const side =
      unique.length < 2 || rank < Math.ceil(unique.length / 2)
        ? "left"
        : "right";
    roles.set(support.patch.id, `${prefix}${side}`);
  }
}

function longitudinalGroups(supports: Support[]): Support[][] {
  const sorted = [...supports].sort((a, b) => a.longitudinal - b.longitudinal);
  const span = sorted[sorted.length - 1].longitudinal - sorted[0].longitudinal;
  if (span < 0.4) return [sorted];
  // A middle pair is declared only when the original geometry has three clear clusters.
  const gaps = sorted.slice(1).map((value, i) => ({
    index: i + 1,
    gap: value.longitudinal - sorted[i].longitudinal,
  }));
  const largest = [...gaps].sort((a, b) => b.gap - a.gap || a.index - b.index);
  if (
    supports.length >= 6 &&
    largest.length >= 2 &&
    largest[1].gap >= span * 0.2
  ) {
    const cuts = [largest[0].index, largest[1].index].sort((a, b) => a - b);
    const groups = [
      sorted.slice(0, cuts[0]),
      sorted.slice(cuts[0], cuts[1]),
      sorted.slice(cuts[1]),
    ];
    if (groups.every((group) => group.length >= 2)) return groups;
  }
  const cut = largest[0].index;
  return [sorted.slice(0, cut), sorted.slice(cut)];
}

/**
 * Persistent authored support identities. Only original material geometry and
 * ownership participate: later poses, source names, pigment and insertion order do not.
 * Left/right is a drawing-plane convention, not a claim to recover hidden 3-D anatomy.
 */
export function compileAnatomicalRoles(
  atlas: SourceAtlas,
): ReadonlyMap<string, string> {
  const known = cache.get(atlas);
  if (known) return known;
  const patches = new Map(atlas.patches.map((patch) => [patch.id, patch]));
  const bodies = atlas.patches.filter(
    (p) => (p.kind === "body" || p.kind === "egg") && p.source.cells.length,
  );
  const owner = (patch: SourcePatch): SourcePatch | undefined => {
    let current: SourcePatch | undefined = patch;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (bodies.includes(current)) return current;
      visited.add(current.id);
      current = current.source.parentId
        ? patches.get(current.source.parentId)
        : undefined;
    }
    return [...bodies].sort(
      (a, b) =>
        Math.hypot(
          a.center.x - patch.source.pivot.x,
          a.center.y - patch.source.pivot.y,
        ) -
          Math.hypot(
            b.center.x - patch.source.pivot.x,
            b.center.y - patch.source.pivot.y,
          ) ||
        a.center.x - b.center.x ||
        a.center.y - b.center.y ||
        b.area - a.area,
    )[0];
  };
  const legs = atlas.patches.filter((p) => p.kind === "leg");
  const feet = atlas.patches.filter((p) => p.kind === "foot");
  const independent = [
    ...legs,
    ...feet.filter(
      (foot) => !legs.some((leg) => leg.id === foot.source.parentId),
    ),
  ];
  const groups = new Map<SourcePatch | undefined, SourcePatch[]>();
  for (const support of independent) {
    const host = owner(support),
      group = groups.get(host) ?? [];
    group.push(support);
    groups.set(host, group);
  }
  const roles = new Map<string, string>();
  for (const [body, supports] of groups) {
    const center = body?.center ?? atlas.center;
    const heads = atlas.patches.filter(
      (p) => p.kind === "head" && owner(p) === body,
    );
    const axis = bodyAxis(body, heads, center);
    let sideAxis = { x: -axis.y, y: axis.x };
    // Side-on quadrupeds use the lower/near layer; upright creatures use screen left.
    if (
      Math.abs(sideAxis.y) >= Math.abs(sideAxis.x)
        ? sideAxis.y < 0
        : sideAxis.x > 0
    )
      sideAxis = { x: -sideAxis.x, y: -sideAxis.y };
    const data: Support[] = supports.map((patch) => {
      const root = sub(patch.source.pivot, center);
      const endCells = feet
        .filter((foot) => foot.source.parentId === patch.id)
        .flatMap((foot) => foot.source.cells);
      const visible = endCells.length ? endCells : patch.source.cells;
      const endCross = Math.max(
        ...visible.map((p) => dot(sub(p, center), sideAxis)),
      );
      const endLong = visible.reduce(
        (sum, p) => sum + dot(sub(p, center), axis) / visible.length,
        0,
      );
      const local = sub(patch.center, center);
      const longitudinal = dot(root, axis);
      return {
        patch,
        longitudinal,
        signature: [
          -endCross,
          -dot(root, sideAxis),
          -dot(local, sideAxis),
          longitudinal,
          endLong,
          patch.width,
          patch.height,
          patch.area,
        ],
      };
    });
    if (data.length < 4) assignSides(data, "", roles);
    else {
      const longitudinal = longitudinalGroups(data);
      for (let i = 0; i < longitudinal.length; i++) {
        const prefix =
          longitudinal.length === 1 || i === longitudinal.length - 1
            ? "fore-"
            : i === 0
              ? "hind-"
              : "middle-";
        assignSides(longitudinal[i], prefix, roles);
      }
    }
  }
  for (const foot of feet) {
    const role = foot.source.parentId
      ? roles.get(foot.source.parentId)
      : undefined;
    if (role) roles.set(foot.id, role);
  }
  const result = readOnlyMap(roles);
  cache.set(atlas, result);
  return result;
}

/** Independent anatomical inventory oracle. The immutable feature definition
 * is shared birth input; this evaluator shares no live-state/proposal code.
 * It reconstructs source-owned feature membership, spatial union-find, ink
 * containment and four-connected exterior floods independently. */
import type {
  MaterialCell,
  MaterialPhysicalJournal,
  MaterialLink,
} from "./material-graph";
import { sourceFeatures } from "./anatomical-features";
import type { AnatomicalContext } from "./anatomical-continuity";
import { seedChaos, stepChaos, CHAOS_MODULUS } from "./chaos";
export type StrainAuthorization = Readonly<{
  seed: string;
  elongation: number;
  expansion: number;
  membrane: number;
}>;
/** Re-derive the genetic organizer, independently of sourceStrain(). */
export function verifyStrainProgram(
  source: readonly MaterialCell[],
  fingerprint: string,
  before: ReadonlyMap<string, MaterialCell>,
  wave: string,
  unit: number,
  declared: NonNullable<MaterialPhysicalJournal["strain"]>,
  parameters: StrainAuthorization,
): void {
  if (
    !parameters.seed ||
    ![parameters.elongation, parameters.expansion, parameters.membrane].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 1,
    )
  )
    throw new Error("Invalid permanent strain authorization");
  const ids = new Set(source.map((c) => c.id)),
    ink = [...before.values()].filter(
      (c) => c.provenance === "authored" && ids.has(c.id),
    );
  const live = ink.length ? ink : [...before.values()];
  const orbit = stepChaos(
      seedChaos(
        [parameters.seed, fingerprint, wave, "coherent-strain"].join("|"),
      ),
    ),
    u = orbit.x / (CHAOS_MODULUS - 1),
    v = orbit.y / (CHAOS_MODULUS - 1);
  const axis =
      u <
      (parameters.expansion + 0.1) /
        (parameters.expansion + parameters.elongation + 0.2)
        ? "x"
        : "y",
    cross = axis === "x" ? "y" : "x";
  const coordinates = live.map((c) => c[cross]).sort((a, b) => a - b),
    axial = live.map((c) => c[axis]).sort((a, b) => a - b);
  const center =
      coordinates[
        Math.min(
          coordinates.length - 1,
          Math.floor((0.15 + 0.7 * v) * coordinates.length),
        )
      ],
    radius = Math.max(
      2,
      Math.ceil(
        (coordinates.at(-1)! - coordinates[0] + 1) *
          (0.15 + 0.2 * parameters.membrane),
      ),
    );
  const mode = unit % 3 === 0 ? "shear" : "expand",
    side = mode === "shear" ? (v < 0.5 ? -1 : 1) : unit % 2 ? 1 : -1;
  const expected = {
    axis,
    mode,
    side,
    cut: axial[
      Math.floor(
        (side > 0 ? 0.5 + 0.2 * v : 0.5 - 0.2 * v) * (axial.length - 1),
      )
    ],
    low: Math.max(0, center - radius),
    high: Math.min(63, center + radius),
  };
  if (
    Object.entries(expected).some(
      ([k, value]) => declared[k as keyof typeof declared] !== value,
    )
  )
    throw new Error("Strain differs from permanent source/genetic organizer");
}
const position = (p: { x: number; y: number }) => p.y * 64 + p.x;
function interior(mask: ReadonlySet<number>): Set<number> {
  if (!mask.size) return new Set();
  const xs = [...mask].map((k) => k % 64),
    ys = [...mask].map((k) => Math.floor(k / 64)),
    left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  const reached = new Set<number>(),
    stack: number[] = [];
  for (let x = left; x <= right; x++) stack.push(top * 64 + x, bottom * 64 + x);
  for (let y = top; y <= bottom; y++) stack.push(y * 64 + left, y * 64 + right);
  while (stack.length) {
    const k = stack.pop()!;
    if (reached.has(k) || mask.has(k)) continue;
    reached.add(k);
    const x = k % 64,
      y = Math.floor(k / 64);
    if (x > left) stack.push(k - 1);
    if (x < right) stack.push(k + 1);
    if (y > top) stack.push(k - 64);
    if (y < bottom) stack.push(k + 64);
  }
  const inside = new Set<number>();
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const k = y * 64 + x;
      if (!mask.has(k) && !reached.has(k)) inside.add(k);
    }
  return inside;
}
function connected(
  group: readonly MaterialCell[],
  links: readonly MaterialLink[],
): boolean {
  if (group.length < 2) return true;
  const own = new Set(group.map(position)),
    parent = new Int16Array(4096).fill(-1),
    ids = new Map(group.map((c) => [c.id, c]));
  let components = own.size;
  const root = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a: number, b: number) => {
    const x = root(a),
      y = root(b);
    if (x !== y) {
      parent[x] = y;
      components--;
    }
  };
  for (const i of own) parent[i] = i;
  for (const i of own) {
    const x = i % 64,
      y = Math.floor(i / 64);
    for (const j of [
      x ? i - 1 : -1,
      y ? i - 64 : -1,
      x && y ? i - 65 : -1,
      x < 63 && y ? i - 63 : -1,
    ])
      if (j >= 0 && own.has(j)) join(i, j);
  }
  for (const link of links) {
    const a = ids.get(link.fromCellId!),
      b = ids.get(link.toCellId!);
    if (a && b) join(position(a), position(b));
  }
  return components === 1;
}
export function createAnatomicalAudit(
  source: readonly MaterialCell[],
): (live: readonly MaterialCell[], context?: AnatomicalContext) => void {
  const contract = sourceFeatures(source),
    birth = new Map(source.map((c) => [c.id, c]));
  const owned = contract.features.map((f) => new Set(f.sourceIds));
  return (live: readonly MaterialCell[], context: AnatomicalContext = {}) => {
    const groups = contract.features.map(() => [] as MaterialCell[]),
      occupancy = new Map<number, MaterialCell[]>();
    for (const c of live) {
      const k = position(c),
        list = occupancy.get(k) ?? [];
      list.push(c);
      occupancy.set(k, list);
      const features = new Set<number>();
      for (const id of c.sourceIds)
        if (birth.get(id)?.color === c.color)
          for (const f of contract.membership.get(id) ?? []) features.add(f);
      for (const i of features)
        if (
          contract.features[i].pigment === null ||
          c.sourceIds.every((id) => owned[i].has(id))
        )
          groups[i].push(c);
    }
    const all = new Set(occupancy.keys()),
      inside = interior(all);
    for (const k of context.protectedVoids ?? []) {
      const [x, y] = k.split(",").map(Number),
        v = y * 64 + x;
      if (!all.has(v) && !inside.has(v))
        throw new Error("Opened drawn cavity: " + k);
    }
    for (const feature of contract.features) {
      const group = groups[feature.id];
      if (new Set(group.map(position)).size < feature.minimum)
        throw new Error("Lost drawn feature: " + feature.id);
      if (feature.pigment !== null && !connected(group, context.links ?? []))
        throw new Error("Scattered drawn feature: " + feature.id);
      for (const sourcePort of feature.ports) {
        const ids = new Set(sourcePort);
        let exposed = false;
        for (const p of group)
          if (p.sourceIds.some((id) => ids.has(id)))
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]) {
              const x = p.x + dx,
                y = p.y + dy,
                v = y * 64 + x;
              if (
                x < 0 ||
                y < 0 ||
                x > 63 ||
                y > 63 ||
                (!all.has(v) && !inside.has(v))
              )
                exposed = true;
            }
        if (!exposed) throw new Error("Buried drawn protrusion: " + feature.id);
      }
    }
    for (const edge of contract.bonds) {
      let adjacent = false;
      search: for (const a of groups[edge.a])
        for (const b of groups[edge.b])
          if (
            Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= edge.distance
          ) {
            adjacent = true;
            break search;
          }
      if (!adjacent)
        throw new Error(
          "Torn drawn feature neighborhood: " + edge.a + ":" + edge.b,
        );
    }
    for (const enclosure of contract.enclosures) {
      const carrier = new Set(
        groups[enclosure.outer]
          .filter(
            (c) =>
              !(occupancy.get(position(c)) ?? []).some(
                (p) => p.color !== c.color,
              ),
          )
          .map(position),
      );
      const contained = interior(carrier);
      if (groups[enclosure.inner].some((c) => !contained.has(position(c))))
        throw new Error(
          "Broken drawn pigment enclosure: " +
            enclosure.outer +
            ":" +
            enclosure.inner,
        );
    }
  };
}
export function verifyAnatomicalContinuity(
  source: readonly MaterialCell[],
  live: readonly MaterialCell[],
  context: AnatomicalContext = {},
): void {
  createAnatomicalAudit(source)(live, context);
}
/** Independent exact coordinate/seam/cavity oracle for a declared strain.
 * Shared by two consumers, never by the material producer. */
export function verifyCoordinatedStrain(
  beforeCells: ReadonlyMap<string, MaterialCell>,
  made: readonly MaterialCell[],
  removed: readonly string[],
  p: MaterialPhysicalJournal,
  kind: string,
  voids: ReadonlySet<string>,
): readonly string[] {
  const strain = p.strain!;
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  const key = (p: { x: number; y: number }) => p.x + "," + p.y;
  const bounded = (p: { x: number; y: number }) =>
    Number.isSafeInteger(p.x) &&
    Number.isSafeInteger(p.y) &&
    p.x >= 0 &&
    p.y >= 0 &&
    p.x < 64 &&
    p.y < 64;
  let strainedVoids: readonly string[] = [];
  if (
    kind !== "repattern" ||
    p.system !== "remodeling" ||
    !["x", "y"].includes(strain.axis) ||
    !["expand", "shear"].includes(strain.mode) ||
    ![-1, 1].includes(strain.side) ||
    ![strain.cut, strain.low, strain.high].every(Number.isSafeInteger) ||
    strain.cut < 0 ||
    strain.cut > 63 ||
    strain.low < 0 ||
    strain.high > 63 ||
    strain.low > strain.high ||
    removed.length ||
    made.length + Math.ceil(p.relocations.length / 64) > 64 ||
    made.length > 64 ||
    p.relocations.length > 4096 ||
    p.tissues.length ||
    p.sites.length
  )
    throw new Error("Invalid coordinated strain declaration");
  const axis = strain.axis,
    cross = axis === "x" ? "y" : "x";
  const mapped = (q: { x: number; y: number }) => {
    const moves =
      q[cross] >= strain.low &&
      q[cross] <= strain.high &&
      (strain.mode === "shear" ||
        strain.side * q[axis] > strain.side * strain.cut);
    return {
      x: q.x + (moves && axis === "x" ? strain.side : 0),
      y: q.y + (moves && axis === "y" ? strain.side : 0),
    };
  };
  const expectedMoves = new Map(
    [...beforeCells.values()].flatMap((c) => {
      const q = mapped(c);
      if (!bounded(q)) throw new Error("Strain leaves physical world");
      return key(q) === key(c) ? [] : [[c.id, q] as const];
    }),
  );
  if (
    !expectedMoves.size ||
    expectedMoves.size !== p.relocations.length ||
    p.relocations.some(
      (m) =>
        !expectedMoves.has(m.cellId) ||
        key(expectedMoves.get(m.cellId)!) !== key(m.to) ||
        m.path,
    )
  )
    throw new Error("Incomplete or forged coordinated strain");
  const before = [...beforeCells.values()],
    occupied = new Set(before.map((c) => c.tissueId + "|" + key(mapped(c))));
  const expectedSeams = new Map<string, MaterialCell[]>();
  for (const a of before)
    if (expectedMoves.has(a.id)) {
      if (
        before.some(
          (b) =>
            a.id !== b.id &&
            a.tissueId === b.tissueId &&
            Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1 &&
            (Math.max(
              Math.abs(mapped(a).x - mapped(b).x),
              Math.abs(mapped(a).y - mapped(b).y),
            ) > 1 ||
              (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1 &&
                Math.abs(mapped(a).x - mapped(b).x) +
                  Math.abs(mapped(a).y - mapped(b).y) >
                  1)),
        ) &&
        !occupied.has(a.tissueId + "|" + key(a))
      ) {
        const k = a.tissueId + "|" + key(a),
          list = expectedSeams.get(k) ?? [];
        list.push(a);
        expectedSeams.set(k, list);
      }
    }
  if (expectedSeams.size !== made.length)
    throw new Error("Missing or fabricated physical strain seam");
  for (const [, parents] of expectedSeams) {
    const parent = [...parents].sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    const daughters = made.filter(
      (c) =>
        key(c) === key(parent) &&
        c.parentCellIds.length === 1 &&
        c.parentCellIds[0] === parent.id &&
        c.color === parent.color &&
        c.z === parent.z &&
        c.tissueId === parent.tissueId,
    );
    if (daughters.length !== 1)
      throw new Error("Strain changed a drawn feature or overlay");
  }
  const nextVoids = new Set<string>();
  for (const k of voids) {
    const [x, y] = k.split(",").map(Number),
      q = { x, y },
      v = mapped(q);
    nextVoids.add(key(v));
    if (key(v) !== k) {
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]) {
        const n = { x: x + dx, y: y + dy },
          m = mapped(n);
        if (voids.has(key(n)) && Math.abs(m.x - v.x) + Math.abs(m.y - v.y) > 1)
          nextVoids.add(k);
      }
    }
  }
  strainedVoids = [...nextVoids].sort();
  if (
    !same(strainedVoids, [...voids]) &&
    (!p.protectedVoids || !same(p.protectedVoids.after, strainedVoids))
  )
    throw new Error("Missing coordinated cavity movement");

  return strainedVoids;
}

/** Independent pigment/parent/contact oracle for an advancing surface. */
export function verifyAdvancingFront(
  sourceCells: readonly MaterialCell[],
  beforeCells: ReadonlyMap<string, MaterialCell>,
  made: readonly MaterialCell[],
  removed: readonly string[],
  p: MaterialPhysicalJournal,
): void {
  const key = (q: { x: number; y: number }) => q.x + "," + q.y;
  if (
    p.relocations.length !== 1 ||
    made.length !== 1 ||
    removed.length ||
    p.links.length ||
    p.sites.length ||
    p.tissues.length
  )
    throw new Error("Invalid advancing material front");
  const move = p.relocations[0],
    surface = beforeCells.get(move.cellId),
    daughter = made[0];
  const parent = beforeCells.get(daughter.parentCellIds[0]);
  if (
    !surface ||
    !parent ||
    daughter.parentCellIds.length !== 1 ||
    parent.tissueId !== surface.tissueId ||
    daughter.tissueId !== surface.tissueId ||
    key(daughter) !== key(surface) ||
    daughter.color !== parent.color ||
    daughter.z !== parent.z ||
    parent.z !== surface.z ||
    parent.color === surface.color ||
    Math.max(Math.abs(parent.x - surface.x), Math.abs(parent.y - surface.y)) >
      1 ||
    (parent.x - surface.x) * (move.to.x - surface.x) +
      (parent.y - surface.y) * (move.to.y - surface.y) >=
      0 ||
    [...beforeCells.values()].filter((c) => key(c) === key(surface)).length !==
      1
  )
    throw new Error("Advancing front changed pigment or material parent");
  const ink = sourceCells.filter((c) => c.tissueId === surface.tissueId);
  const score = (color: string) => {
    const colored = ink.filter((c) => c.color === color);
    return !colored.length
      ? -1
      : colored.reduce(
          (n, a) =>
            n +
            ink.filter(
              (b) =>
                a.id !== b.id &&
                Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1,
            ).length,
          0,
        ) / Math.sqrt(colored.length);
  };
  if (score(parent.color) <= score(surface.color) + 1)
    throw new Error(
      "Material front lacks source-derived interior stratification",
    );
}

/** Independent breadth-first support witness. Does not import the producer's
 * grid search; all contacts and cross sections are recomputed pairwise. */
export function verifyAxialSupport(
  before: readonly MaterialCell[],
  links: readonly MaterialLink[],
  created: readonly MaterialCell[],
  rigidity: number,
): void {
  if (!Number.isFinite(rigidity) || rigidity < 0 || rigidity > 1)
    throw new Error("Invalid authorized structural rigidity");
  const limit = 2 + Math.floor(6 * rigidity),
    active = new Map(before.map((c) => [c.id, c]));
  for (const cell of created) {
    const parent = active.get(cell.parentCellIds[0]);
    if (!parent) throw new Error("Axial support lacks its live parent");
    const group = [...active.values()].filter(
        (c) => c.tissueId === parent.tissueId,
      ),
      joints = new Set(
        links.flatMap((l) =>
          [l.fromCellId, l.toCellId].filter((id): id is string => !!id),
        ),
      );
    const q = group
        .filter(
          (c) => Math.max(Math.abs(c.x - cell.x), Math.abs(c.y - cell.y)) === 1,
        )
        .map((c) => ({ c, d: 1 })),
      seen = new Set(q.map((p) => p.c.id));
    let supported = false;
    for (let i = 0; i < q.length; i++) {
      const { c, d } = q[i],
        near = group.filter(
          (p) => Math.max(Math.abs(p.x - c.x), Math.abs(p.y - c.y)) === 1,
        ),
        n4 = near.filter(
          (p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) === 1,
        ).length;
      if (
        c.provenance === "authored" ||
        joints.has(c.id) ||
        n4 >= 3 ||
        (n4 >= 2 && near.length >= 3)
      ) {
        supported = true;
        break;
      }
      if (d < limit)
        for (const p of near)
          if (!seen.has(p.id)) {
            seen.add(p.id);
            q.push({ c: p, d: d + 1 });
          }
    }
    if (!supported)
      throw new Error("Axial growth exceeds local material support");
    active.set(cell.id, cell);
  }
}

import {
  clamp,
  compareText,
  flattenAnatomy,
  normalizeAnatomy,
  pixelPaintDepth,
  hash,
  type Pixel,
  type Point,
  type PetPart,
  type PartKind,
  type SourceMode,
  type FrameOptions,
  type PetSimulation,
  type PetFrame,
  type PartFrame,
  type Capabilities,
  type PetAction,
  type SimulationOptions,
  type DevelopmentProgram,
  type Milestone,
} from "./model";
import {
  createGroomingSimulation,
  GROOMING_RULES,
  type GroomStroke,
} from "./grooming";
import {
  compileSources,
  canonical,
  hatchling,
  bounds,
  capsulePixels,
  type Tissue,
} from "./material";
import {
  compileDevelopment,
  mapSourcePoint,
  resolveDevelopment,
  q,
  ease,
  type Region,
  type ResolvedDevelopment,
} from "./development";
import { compileGenome } from "./genome";
import {
  compileSurfaceExpression,
  surfaceExpressionAt,
  applySurfaceExpression,
} from "./surface-expression";
import { describeSource } from "./source-atlas";
import {
  buildFunctionalGraph,
  heldPoseTick,
  poseFunctionalGraph,
  transformLocomotionPoint,
  type PoseTransform,
} from "./locomotion";
import { createNeedsSimulation, MAX_SIMULATION_DAYS } from "../needs";
import { VARIATION_CHANNELS } from "./variation-channels";
import { buildEnclosure } from "./enclosure";
import { getMetamorphosisPhase } from "./metamorphosis";
import { grownMaterialCells } from "./material-growth";
import { compileAnatomicalRoles } from "./anatomical-roles";
import { createDevelopmentClock } from "../lineage/clock";
import { compileLineage, lineageAt, lineageTraitsAt } from "../lineage";
import {
  cellCorners,
  rasterCellQuads,
  type MaterialCellQuad,
} from "./material-raster";

const blueprints = new Map<
  string,
  {
    tissues: Tissue[];
    shell: Tissue[];
    genes: ReturnType<typeof compileDevelopment>;
    inherited: ReturnType<typeof compileGenome>;
    atlas: ReturnType<typeof describeSource>;
    hatchAt: number;
    embryoRecipe?: Record<string, unknown>;
  }
>();
let compilations = 0;
export const getBlueprintCacheStats = () =>
  Object.freeze({ size: blueprints.size, compilations });
function setLRU<K, V>(map: Map<K, V>, key: K, value: V, limit: number) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value!);
}
const copy = <T>(value: T): T =>
  Array.isArray(value)
    ? (value.map((v) => copy(v)) as T)
    : value && typeof value === "object"
      ? (Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, copy(v)]),
        ) as T)
      : value;
const freeze = <T>(v: T): T => {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
};
type Field = { distance: Float32Array; cells: Map<number, Pixel> };
const fieldCache = new WeakMap<Tissue, Field>();
const restCache = new WeakMap<Region, Pixel[]>();
const materialQuadCache = new WeakMap<Region, MaterialCellQuad[]>();
const generatedQuadCache = new WeakMap<Region, MaterialCellQuad[]>();
/** Two bounded chamfer passes preserve holes and disconnected source pixels. */
function sourceField(t: Tissue): Field {
  const hit = fieldCache.get(t);
  if (hit) return hit;
  const cells = new Map(t.cells.map((p) => [p.y * 64 + p.x, p])),
    inside = new Float32Array(4096),
    outside = new Float32Array(4096);
  for (let k = 0; k < 4096; k++) {
    inside[k] = cells.has(k) ? 0 : 128;
    outside[k] = cells.has(k) ? 128 : 0;
  }
  for (const a of [inside, outside]) {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const k = y * 64 + x;
        a[k] = Math.min(
          a[k],
          x ? a[k - 1] + 1 : 128,
          y ? a[k - 64] + 1 : 128,
          x && y ? a[k - 65] + 1.4142 : 128,
          x < 63 && y ? a[k - 63] + 1.4142 : 128,
        );
      }
    for (let y = 63; y >= 0; y--)
      for (let x = 63; x >= 0; x--) {
        const k = y * 64 + x;
        a[k] = Math.min(
          a[k],
          x < 63 ? a[k + 1] + 1 : 128,
          y < 63 ? a[k + 64] + 1 : 128,
          x < 63 && y < 63 ? a[k + 65] + 1.4142 : 128,
          x && y < 63 ? a[k + 63] + 1.4142 : 128,
        );
      }
  }
  const distance = new Float32Array(4096);
  for (let k = 0; k < 4096; k++)
    distance[k] = cells.has(k) ? -0.5 - outside[k] + 1 : inside[k] - 0.5;
  const result = { distance, cells };
  fieldCache.set(t, result);
  return result;
}
function sampleDistance(field: Field, x: number, y: number): number {
  if (x < 0 || x > 63 || y < 0 || y > 63) return 64;
  const xx = Math.floor(x),
    yy = Math.floor(y),
    dx = x - xx,
    dy = y - yy;
  const v = (a: number, b: number) =>
    field.distance[Math.min(63, b) * 64 + Math.min(63, a)];
  return (
    (v(xx, yy) * (1 - dx) + v(xx + 1, yy) * dx) * (1 - dy) +
    (v(xx, yy + 1) * (1 - dx) + v(xx + 1, yy + 1) * dx) * dy
  );
}
function inverseRegion(r: Region, p: Point): Point {
  const c = Math.cos(-r.angle),
    s = Math.sin(-r.angle),
    dx = p.x - r.center.x,
    dy = p.y - r.center.y;
  const raw = { x: dx * c - dy * s, y: dx * s + dy * c };
  let u = { ...raw };
  // Triangular material shear has determinant one: no folded inverse map or stray islands.
  if (r.deform)
    u = {
      x: raw.x,
      y: raw.y - r.deform * ((raw.x / Math.max(1, r.rx)) ** 2 - 0.25),
    };
  return u;
}
function primitiveDistance(r: Region, p: Point): number {
  if (r.shape === "membrane") {
    const a = r.anchor,
      b = r.tip,
      c = {
        x: r.tip.x * 0.55 + r.anchor.x * 0.45,
        y: Math.max(r.anchor.y, r.tip.y) + r.ry * 1.2,
      },
      points = [a, b, c];
    let d = Infinity,
      positive = false,
      negative = false;
    for (let i = 0; i < 3; i++) {
      const u = points[i],
        v = points[(i + 1) % 3],
        dx = v.x - u.x,
        dy = v.y - u.y,
        k = clamp(
          ((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy || 1),
          0,
          1,
        );
      d = Math.min(d, Math.hypot(p.x - u.x - k * dx, p.y - u.y - k * dy));
      const side = dx * (p.y - u.y) - dy * (p.x - u.x);
      positive ||= side > 0;
      negative ||= side < 0;
    }
    return positive && negative ? d : -d;
  }
  if (r.shape === "spine" && r.spine?.length) {
    let d = Infinity;
    for (let j = 1; j < r.spine.length; j++) {
      const a = r.spine[j - 1],
        b = r.spine[j],
        dx = b.x - a.x,
        dy = b.y - a.y,
        u = clamp(
          ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
          0,
          1,
        );
      const radius = r.ry * (0.65 + (0.35 * j) / r.spine.length);
      d = Math.min(
        d,
        Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy) - radius,
      );
    }
    return d;
  }
  const u = inverseRegion(r, p),
    n = Math.hypot(u.x / Math.max(0.05, r.rx), u.y / Math.max(0.05, r.ry));
  let d = (n - 1) * Math.min(r.rx, r.ry);
  if (r.contour === "tower") {
    const waist = 0.58 + 0.42 * Math.abs(u.y / Math.max(1, r.ry));
    d =
      (Math.hypot(u.x / (r.rx * waist), u.y / r.ry) - 1) * Math.min(r.rx, r.ry);
  } else if (r.contour === "aquatic")
    d =
      (Math.pow(Math.abs(u.x / r.rx), 1.2) +
        Math.pow(Math.abs(u.y / r.ry), 1.2) -
        1) *
      Math.min(r.rx, r.ry);
  else if (r.contour === "orb" || r.contour === "armored") {
    const theta = Math.atan2(u.y / r.ry, u.x / r.rx),
      edge =
        1 +
        (r.contour === "orb" ? 0.16 : 0.1) * Math.cos(theta * (r.lobes ?? 4));
    d = (n - edge) * Math.min(r.rx, r.ry);
    if (r.contour === "armored") {
      d = Math.max(d, u.y - r.ry * 0.48);
      // Explicit openings between shell plates; these are cavities, not recoloring.
      if (Math.abs(u.x) < r.rx * 0.65 && u.y < -r.ry * 0.05) {
        const notch = Math.abs(
          Math.sin((u.x / r.rx + 0.5) * Math.PI * (r.lobes ?? 4)),
        );
        d = Math.max(d, (0.16 - notch) * r.ry);
      }
    }
  }
  if (r.hollow && r.hollow > 0.01)
    d = Math.max(d, (r.hollow - n) * Math.min(r.rx, r.ry));
  return d;
}
function regionDistance(r: Region, p: Point): number {
  const next = primitiveDistance(r, p),
    from = r.previous,
    u = r.fieldProgress ?? 1;
  if (!from || u >= 0.999999 || from.rx < 0.05 || from.ry < 0.05) return next;
  const mapped = {
    x: from.center.x + ((p.x - r.center.x) * from.rx) / r.rx,
    y: from.center.y + ((p.y - r.center.y) * from.ry) / r.ry,
  };
  return (
    regionDistance(from, mapped) *
      Math.min(r.rx / from.rx, r.ry / from.ry) *
      (1 - u) +
    next * u
  );
}
function restPixels(r: Region): Pixel[] {
  const hit = restCache.get(r);
  if (hit) return hit;
  const pixels = drawRestPixels(r);
  restCache.set(r, pixels);
  return pixels;
}
function drawRestPixels(r: Region): Pixel[] {
  if (r.rx < 0.05 || r.ry < 0.05) return [];
  const out: Pixel[] = [],
    t = r.source;
  if (t && r.sourceWarp) return rasterMaterial(r, t);
  if (r.shape === "mask" && t) {
    const sx = r.rx / Math.max(0.5, t.bounds.width / 2),
      sy = r.ry / Math.max(0.5, t.bounds.height / 2);
    // Rigid small motifs use deliberate integer clusters rather than arbitrary rotation quads.
    for (const cell of t.cells) {
      const dx = (cell.x - t.center.x) * sx,
        dy = (cell.y - t.center.y) * sy,
        c = Math.cos(r.angle),
        s = Math.sin(r.angle);
      const px = r.center.x + dx * c - dy * s,
        py = r.center.y + dx * s + dy * c;
      const w = Math.max(1, Math.round(sx)),
        h = Math.max(1, Math.round(sy));
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          out.push({
            ...cell,
            x: Math.round(px + x - (w - 1) / 2),
            y: Math.round(py + y - (h - 1) / 2),
          });
    }
    return uniquePixels(out);
  }
  const radius = Math.max(r.rx, r.ry) + 2,
    field = t && r.material < 0.999 ? sourceField(t) : undefined;
  const triangle =
    r.shape === "membrane"
      ? [
          r.anchor,
          r.tip,
          {
            x: r.tip.x * 0.55 + r.anchor.x * 0.45,
            y: Math.max(r.anchor.y, r.tip.y) + r.ry * 1.2,
          },
        ]
      : undefined;
  const triangleAxes = triangle?.map((p, i) => {
    const next = triangle[(i + 1) % 3],
      axis = { x: -(next.y - p.y), y: next.x - p.x },
      values = triangle.map((v) => v.x * axis.x + v.y * axis.y);
    return {
      ...axis,
      min: Math.min(...values),
      max: Math.max(...values),
      half: (Math.abs(axis.x) + Math.abs(axis.y)) * 0.5,
    };
  });
  const b =
    r.shape === "membrane"
      ? bounds([
          r.anchor,
          r.tip,
          {
            x: r.tip.x * 0.55 + r.anchor.x * 0.45,
            y: Math.max(r.anchor.y, r.tip.y) + r.ry * 1.2,
          },
        ])
      : r.spine?.length
        ? bounds(r.spine)
        : {
            x: r.center.x - radius,
            y: r.center.y - radius,
            width: radius * 2,
            height: radius * 2,
          };
  for (
    let y = Math.max(-256, Math.floor(b.y - r.ry * (r.spine ? 1 : 0)));
    y <= Math.min(256, Math.ceil(b.y + b.height + (r.spine ? r.ry : 0)));
    y++
  )
    for (
      let x = Math.max(-256, Math.floor(b.x - r.ry * (r.spine ? 1 : 0)));
      x <= Math.min(256, Math.ceil(b.x + b.width + (r.spine ? r.ry : 0)));
      x++
    ) {
      let d = regionDistance(r, { x, y }),
        sourcePoint: Point | undefined;
      if (t) {
        const local = inverseRegion(r, { x, y });
        sourcePoint = {
          x: t.center.x + (local.x * Math.max(0.5, t.bounds.width / 2)) / r.rx,
          y: t.center.y + (local.y * Math.max(0.5, t.bounds.height / 2)) / r.ry,
        };
        if (field)
          d =
            sampleDistance(field, sourcePoint.x, sourcePoint.y) *
              Math.min(
                r.rx / Math.max(0.5, t.bounds.width / 2),
                r.ry / Math.max(0.5, t.bounds.height / 2),
              ) *
              (1 - r.material) +
            d * r.material;
      }
      const triangleHit =
        triangleAxes?.every((axis) => {
          const value = x * axis.x + y * axis.y;
          return (
            value + axis.half >= axis.min - 1e-8 &&
            value - axis.half <= axis.max + 1e-8
          );
        }) &&
        triangle &&
        x + 0.5 >= Math.min(...triangle.map((p) => p.x)) &&
        x - 0.5 <= Math.max(...triangle.map((p) => p.x)) &&
        y + 0.5 >= Math.min(...triangle.map((p) => p.y)) &&
        y - 0.5 <= Math.max(...triangle.map((p) => p.y));
      if (triangle ? triangleHit : q(d) <= 0) {
        const painted =
          t && sourcePoint
            ? sourceField(t).cells.get(
                Math.round(sourcePoint.y) * 64 + Math.round(sourcePoint.x),
              )
            : undefined;
        out.push({
          x,
          y,
          color: painted?.color ?? r.color,
          ...(painted?.z === undefined ? {} : { z: painted.z }),
        });
      }
    }
  return out;
}

/** Rasterize transported authored material, including its contour, pigment and gaps. */
function rasterMaterial(
  r: Region,
  tissue: Tissue,
  transport?: (point: Point) => Point,
): Pixel[] {
  let material = materialQuadCache.get(r);
  if (!material) {
    const sourceCells = r.materialGrowth
      ? grownMaterialCells(
          tissue,
          r.materialGrowth.radius,
          r.materialGrowth.maxRadius,
          r.materialGrowth.cavitySource,
        )
      : tissue.cells;
    material = sourceCells
      .filter(
        (cell) =>
          !r.sourceClip ||
          (cell[r.sourceClip.axis] >= r.sourceClip.min &&
            cell[r.sourceClip.axis] < r.sourceClip.max),
      )
      .map((cell) => ({
        cell,
        quad: cellCorners(cell).map((p) => mapSourcePoint(r, p)),
        center: mapSourcePoint(r, cell),
      }));
    materialQuadCache.set(r, material);
  }
  return rasterCellQuads(material, transport);
}
function poseGeneratedMaterial(r: Region, transform: PoseTransform): Pixel[] {
  let material = generatedQuadCache.get(r);
  if (!material) {
    material = restPixels(r).map((cell) => ({
      cell,
      quad: cellCorners(cell),
      center: cell,
    }));
    generatedQuadCache.set(r, material);
  }
  return rasterCellQuads(material, (p) =>
    poseAuthoredMaterial(r, p, transform),
  );
}
function uniquePixels(pixels: Pixel[], finalGrid = false): Pixel[] {
  const map = new Map<string, Pixel>();
  for (const p of pixels) {
    const x = Math.round(p.x),
      y = Math.round(p.y);
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Math.abs(x) <= 512 &&
      Math.abs(y) <= 512 &&
      (!finalGrid || (x >= 0 && y >= 0 && x < 64 && y < 64))
    )
      map.set(`${x},${y}`, { ...p, x, y });
  }
  return [...map.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Keep authored leg material while bending it through the functional knee/elbow. */
function poseAuthoredMaterial(
  r: Region,
  p: Point,
  transform: PoseTransform,
): Point {
  if (
    !transform.joint ||
    !["leg", "arm"].includes(r.kind) ||
    r.source?.relationship === "floating"
  )
    return transformLocomotionPoint(p, transform);
  const dx = r.tip.x - r.anchor.x,
    dy = r.tip.y - r.anchor.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.5) return transformLocomotionPoint(p, transform);
  const along =
    ((p.x - r.anchor.x) * dx + (p.y - r.anchor.y) * dy) / (length * length);
  const side = ((p.x - r.anchor.x) * -dy + (p.y - r.anchor.y) * dx) / length;
  const a = along < 0.5 ? transform.anchor : transform.joint;
  const b = along < 0.5 ? transform.joint : transform.tip;
  const u = along < 0.5 ? along * 2 : (along - 0.5) * 2;
  const bx = b.x - a.x,
    by = b.y - a.y,
    bone = Math.max(0.01, Math.hypot(bx, by));
  return {
    x: a.x + bx * u - (by / bone) * side,
    y: a.y + by * u + (bx / bone) * side,
  };
}
function capability(
  parts: PartFrame[],
  mode: PetFrame["movementMode"],
  family: string,
): Capabilities {
  const active = parts.filter(
      (p) => p.pixels.length && (p.readiness ?? 1) > 0.55,
    ),
    ids = (kind: PartKind) =>
      active.filter((p) => p.kind === kind).map((p) => p.id);
  const hands = ids("hand"),
    feet = ids("foot"),
    mouths = ids("mouth"),
    tails = ids("tail"),
    arms = ids("arm"),
    legs = ids("leg");
  return {
    canMove: active.length > 0,
    canPlay: active.length > 0,
    canGreet: active.length > 0,
    canSee: ids("eye").length > 0,
    canFly:
      family === "flutter" &&
      active.filter((p) => p.kind === "wing" && p.role === "membrane").length >=
        2,
    movementMode: mode,
    effectorIds: [
      ...hands,
      ...mouths,
      ...tails,
      ...active.filter((p) => p.kind === "body").map((p) => p.id),
    ].slice(0, 16),
    usableHands: hands,
    usableFeet: feet,
    usableMouths: mouths,
    canWalk: legs.length > 0,
    canCatch: hands.length + mouths.length + tails.length > 0,
    canTalk: mouths.length > 0,
    locomotion: mode,
    armCount: arms.length,
    legCount: legs.length,
    handCount: hands.length,
    footCount: feet.length,
  };
}
function composite(parts: PartFrame[]): Pixel[] {
  type Painted = { p: Pixel; depth: number; id: string; part: PartFrame };
  const cells = new Map<number, Painted>(),
    authored = new Map<number, Painted>();
  for (const part of parts)
    for (const p of part.pixels) {
      const depth = p.z ?? part.layer ?? 100,
        k = p.y * 64 + p.x,
        old = cells.get(k);
      if (
        !old ||
        depth > old.depth ||
        (depth === old.depth && part.id > old.id)
      )
        cells.set(k, { p, depth, id: part.id, part });
      if (part.sourcePartId) {
        const below = authored.get(k);
        if (
          !below ||
          depth > below.depth ||
          (depth === below.depth && part.id > below.id)
        )
          authored.set(k, { p, depth, id: part.id, part });
      }
    }
  // New skin may pass around an authored face, but it cannot paint over visible
  // facial landmarks. Resolve authored paint first so intentionally covered
  // source features stay covered by the player's own ink.
  for (const [key, paint] of authored) {
    const top = cells.get(key);
    if (
      top &&
      !top.part.sourcePartId &&
      ["eye", "mouth", "decoration"].includes(paint.part.kind)
    )
      cells.set(key, paint);
  }
  return [...cells.values()]
    .map((v) => v.p)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}
function bornParts(tissues: Tissue[]): PartFrame[] {
  return tissues.map((t) => ({
    id: t.id,
    kind: t.kind,
    name: t.name,
    parentId: t.parentId,
    sourcePartId: t.sourcePartId,
    sourcePartIds: [t.id],
    role: t.kind,
    readiness: 1,
    provenance: t.provenance,
    relationship: t.relationship,
    layer:
      t.part.layer ??
      (t.cells.length ? pixelPaintDepth(t.part, t.cells[0]) : 100),
    pixels: copy(t.cells),
    anchor: { ...t.pivot },
    tip: { ...t.tip },
    attachment: t.parentId ? { ...t.pivot } : null,
    attached: t.relationship === "joint" || t.relationship === "surface",
    scale: 1,
    growth: { x: 1, y: 1 },
    rotation: 0,
    planted: false,
    bounds: { ...t.bounds },
  }));
}

export function createSimulation(
  input: PetPart[],
  seed: string,
  mode: SourceMode = "infant",
  options: SimulationOptions = {},
): PetSimulation {
  const liveContext = options.liveContext
    ? {
        hatchAtHours: options.liveContext.hatchAtHours,
        stageEndHours: [...options.liveContext.stageEndHours],
        stagePoints: options.liveContext.stagePoints.map((point) => ({
          ...point,
        })),
      }
    : undefined;
  const source = normalizeAnatomy(input)
    .map((p) => ({
      ...p,
      pixels: [...p.pixels].sort((a, b) => a.y - b.y || a.x - b.x),
    }))
    .sort((a, b) => compareText(a.id, b.id));
  const signature = canonical(source),
    inherited = compileGenome(seed, mode),
    fingerprint = String(
      hash(
        inherited.fingerprint +
          "|" +
          inherited.proceduralGrammarVersion +
          "|" +
          inherited.surfaceExpressionVersion +
          "|" +
          inherited.somaticGrowthVersion +
          "|" +
          signature,
      ),
    ),
    cacheKey =
      mode +
      "|" +
      seed +
      "|" +
      inherited.proceduralGrammarVersion +
      "|" +
      inherited.surfaceExpressionVersion +
      "|" +
      inherited.somaticGrowthVersion +
      "|" +
      signature;
  let blueprint = blueprints.get(cacheKey);
  if (!blueprint) {
    const embryo =
      mode === "egg" && source.some((p) => p.pixels.length)
        ? hatchling(source, hash(inherited.fingerprint))
        : null;
    const developmentalSource = embryo?.parts ?? source;
    const tissues = compileSources(
      developmentalSource,
      hash(inherited.fingerprint),
      mode === "egg" ? "grown" : "authored",
    );
    const atlas = describeSource(tissues);
    blueprint = {
      tissues,
      shell: compileSources(source, hash(fingerprint), "shell"),
      genes: compileDevelopment(atlas, inherited),
      inherited,
      atlas,
      hatchAt:
        mode === "egg"
          ? 4 + (hash(inherited.fingerprint + "|incubation") % 601) / 100
          : 0,
      embryoRecipe: embryo?.recipe,
    };
    compilations++;
    setLRU(blueprints, cacheKey, blueprint, 8);
  } else setLRU(blueprints, cacheKey, blueprint, 8);
  const { tissues, genes } = blueprint,
    surfaceGenes = compileSurfaceExpression(inherited),
    hatchAt = liveContext
      ? Math.max(0, liveContext.hatchAtHours) / 24
      : blueprint.hatchAt,
    liveClock = createDevelopmentClock(liveContext),
    lineage = liveContext
      ? compileLineage(blueprint.atlas, inherited, liveContext.stagePoints)
      : undefined,
    programFingerprint = lineage
      ? String(
          hash(
            `${fingerprint}|${lineage.fingerprint}|${JSON.stringify(liveContext?.stageEndHours)}|${hatchAt}`,
          ),
        )
      : fingerprint,
    needs = createNeedsSimulation(seed, options.needTimeline),
    groomingSimulation = createGroomingSimulation(options.groomingTimeline),
    structural = new Map<number, ResolvedDevelopment>(),
    frames = new Map<string, PetFrame>();
  const careAt = (morphologyAge: number) =>
    needs.stateAt(liveClock.toChronological(morphologyAge));
  const morphologyAt = (morphologyAge: number) =>
    needs.morphologyAt(liveClock.toChronological(morphologyAge));
  const groomingAt: typeof groomingSimulation.stateAt = (
    morphologyAge,
    bindings,
  ) =>
    groomingSimulation.stateAt(
      liveClock.toChronological(morphologyAge),
      bindings,
    );
  const posedPixels = new Map<string, Pixel[]>();
  let posedAge: number | null = null,
    posedCost = 0,
    posedHits = 0,
    posedMisses = 0,
    maximumPosedPixels = 0;
  const posedPixelLimit = 240000,
    posedEntryLimit = 512;
  const anatomicalRoles = compileAnatomicalRoles(blueprint.atlas);
  const persistentRole = (r: Region) => {
    if (!["leg", "foot"].includes(r.kind)) return undefined;
    const sourceRole = r.source && anatomicalRoles.get(r.source.id);
    return (
      sourceRole ??
      (/^(?:(?:fore|hind|middle)-)?(?:left|right)$/.test(r.role)
        ? r.role
        : undefined)
    );
  };
  const rigNodes = (regions: readonly Region[]) =>
    regions.map((r) => ({ ...r, anatomicalRole: persistentRole(r) }));
  const maxAge = hatchAt + 240,
    milestones: Milestone[] = [
      ...(mode === "egg" ? [{ stage: "egg" as const, age: 0 }] : []),
      ...(["infant", "teen", "adult", "elderly"] as const).map((stage, i) => ({
        stage,
        age: hatchAt + liveClock.toChronological([0, 30, 75, 120][i]),
      })),
    ];
  const program: DevelopmentProgram = {
    version: 7,
    fingerprint: programFingerprint,
    mode,
    style: "Source-driven growth and adaptation",
    operators: genes.operators.map((op) => ({
      id: op.id,
      tissueId: op.hostIds[0] ?? "reference",
      kind: op.kind,
      start: liveClock.toChronological(op.start),
      end: liveClock.toChronological(op.end),
      strength: op.strength,
    })),
    tissueCount: tissues.length,
    sourcePartCount: source.length,
    milestones,
    maxAge,
    hatchAt,
    limits: {
      worldSize: 64,
      generatedTissues: 32,
      cachedFrames: 12,
      cachedPixels: 120000,
      poseCachedPixels: posedPixelLimit,
    },
    geneticProgram: genes,
    inheritedGenome: blueprint.inherited,
    proceduralGrammarVersion: inherited.proceduralGrammarVersion,
    surfaceExpressionVersion: inherited.surfaceExpressionVersion,
    surfaceExpressionGenes: surfaceGenes,
    somaticGrowthVersion: inherited.somaticGrowthVersion,
    somaticGrowthGenes: genes.somaticGrowth,
    sourceAtlas: blueprint.atlas,
    genomeFingerprint: blueprint.inherited.fingerprint,
    sourceFingerprint: String(hash(signature)),
    programFingerprint,
    ...(lineage
      ? { lineageProgram: lineage, lineageVersion: lineage.version }
      : {}),
    embryoRecipe: blueprint.embryoRecipe,
    graphs: ["material", "morphology", "functional"],
    variationChannels: VARIATION_CHANNELS,
    groomingRules: GROOMING_RULES,
  };
  function structure(dev: number) {
    let result = structural.get(dev);
    if (!result) {
      result = resolveDevelopment(
        genes,
        tissues,
        dev,
        careAt,
        morphologyAt,
        groomingAt,
        lineage
          ? lineageTraitsAt(lineage, liveClock.toChronological(dev) * 24)
          : undefined,
        liveContext
          ? 120 +
              Math.max(
                0,
                liveClock.toChronological(dev) -
                  liveContext.stageEndHours[2] / 24,
              )
          : undefined,
        liveContext
          ? {
              context: liveContext,
              careHours: liveClock.toChronological(dev) * 24,
            }
          : undefined,
      );
      if (result.regions.some((r) => r.repurpose)) {
        result.regions = result.regions.map((r) => {
          if (!r.repurpose) return r;
          const p = r.repurpose.progress;
          return {
            ...r,
            kind: p >= 0.55 ? r.repurpose.targetKind : r.kind,
            role: p >= 0.55 ? r.repurpose.targetKind : r.role,
            readiness:
              p >= 0.55
                ? clamp((p - 0.4) / 0.6, 0, 1)
                : Math.max(0.05, 1 - p * 1.6),
          };
        });
        const supports = result.regions.filter(
          (r) =>
            r.kind === "leg" &&
            r.readiness > 0.65 &&
            r.source?.relationship !== "floating",
        ).length;
        if (supports >= 2 && !["hop", "flutter"].includes(result.preferred))
          result.preferred = supports >= 4 ? "quadruped" : "biped";
        result.state.controllerFamily = result.preferred;
        result.state.anatomy = result.regions.map((r) => ({
          id: r.id,
          role: r.role,
          sourcePartIds: [...r.sourceIds],
          readiness: r.readiness,
        }));
      }
      const lifecycle = getMetamorphosisPhase(blueprint!.inherited, dev);
      if (lifecycle.enclosure > 0) {
        result.regions = result.regions.map((r) =>
          ["leg", "foot", "arm", "hand", "wing"].includes(r.kind)
            ? { ...r, readiness: r.readiness * (1 - lifecycle.retraction) }
            : r,
        );
        result.regions.push(
          ...buildEnclosure(
            result.regions,
            blueprint!.atlas,
            blueprint!.inherited,
            dev,
          ),
        );
        if (lifecycle.enclosure > 0.8) result.preferred = "float";
      }
      result.state.lifecycle = lifecycle;
      result.state.anatomy = result.regions.map((r) => ({
        id: r.id,
        role: persistentRole(r) ?? r.role,
        sourcePartIds: [...r.sourceIds],
        readiness: r.readiness,
      }));
      result.state.diagnostics = { ...result.state.diagnostics, lifecycle };
      if (lineage) {
        result.state.lineage = lineageAt(
          lineage,
          liveClock.toChronological(dev) * 24,
        );
        result.state.diagnostics = {
          ...result.state.diagnostics,
          lineage: result.state.lineage,
          lineageTraits: lineageTraitsAt(
            lineage,
            liveClock.toChronological(dev) * 24,
          ),
          chronologicalDevelopmentalDays: liveClock.toChronological(dev),
          morphologyDays: dev,
        };
      }
      setLRU(structural, dev, result, 12);
    }
    return result;
  }
  function developmentAt(age: number) {
    const result = copy(
      structure(
        liveClock.toMorphology(
          clamp(
            Number.isFinite(age) ? age - hatchAt : 0,
            0,
            MAX_SIMULATION_DAYS,
          ),
        ),
      ).state,
    );
    result.genomeFingerprint = blueprint!.inherited.fingerprint;
    result.sourceFingerprint = String(hash(signature));
    result.programFingerprint = programFingerprint;
    if (liveContext) {
      result.developmentalAge = Math.max(0, age - hatchAt);
      result.commitments = result.commitments.map((point) => ({
        ...point,
        tick: Math.round(liveClock.toChronological(point.tick / 24) * 24),
      }));
      if (mode === "egg" && age < hatchAt) delete result.lineage;
    }
    return freeze(result);
  }
  function frameAt(rawAge: number, opts: FrameOptions = {}): PetFrame {
    const age = Number.isFinite(rawAge)
        ? clamp(rawAge, 0, MAX_SIMULATION_DAYS)
        : rawAge === Infinity
          ? maxAge
          : 0,
      careAge = Math.max(0, age - hatchAt),
      rawDev = liveClock.toMorphology(careAge),
      dev =
        Math.abs(rawDev - Math.round(rawDev)) < 1e-10
          ? Math.round(rawDev)
          : rawDev,
      time = Number.isFinite(opts.time) ? Math.max(0, opts.time!) : 0,
      action = opts.action ?? "idle";
    const state = structure(dev),
      wellbeing = needs.stateAt(careAge),
      pace = q(
        clamp(
          genes.pace *
            (0.6 + 0.5 * state.recovery) *
            state.aging.paceFactor *
            (state.expression?.paceFactor ?? 1) *
            (1 -
              0.75 *
                getMetamorphosisPhase(blueprint!.inherited, dev).enclosure),
          0.15,
          3,
        ),
      ),
      motionAmplitude = q(
        (0.5 + state.recovery * 0.5) *
          state.aging.motionFactor *
          (state.expression?.motionFactor ?? 1) *
          (1 -
            0.65 * getMetamorphosisPhase(blueprint!.inherited, dev).enclosure),
      ),
      held = heldPoseTick(time, pace);
    const frameKey = JSON.stringify([
      age,
      held,
      time === 0,
      Math.floor(time * 8) % 43,
      action,
      opts.target,
    ]);
    const hit = frames.get(frameKey);
    if (hit) {
      const cached = copy(hit);
      freeze(cached.wellbeing);
      return cached;
    }
    let parts: PartFrame[],
      movementMode: PetFrame["movementMode"] = "drift",
      family = "float",
      groundY = 53,
      diagnostics: unknown;
    const birth =
        dev === 0 && age >= hatchAt && time === 0 && action === "idle",
      egg = mode === "egg" && age < hatchAt;
    if (birth || egg) {
      parts = bornParts(egg ? blueprint!.shell : tissues);
      if (!egg) {
        const rig = buildFunctionalGraph(rigNodes(state.regions));
        movementMode = rig.movementMode;
        family = rig.controllerFamily;
        groundY = rig.groundY;
      }
      if (egg) {
        const crack = ease((age / hatchAt - 0.58) / 0.4);
        if (crack > 0)
          for (const p of parts) {
            const mid = p.bounds.y + p.bounds.height * 0.43;
            p.pixels = p.pixels.filter(
              (c) =>
                !(
                  c.y === Math.round(mid + Math.sin(c.x * 1.7) * 1.2) &&
                  Math.abs(c.x - 32) < crack * 12
                ),
            );
          }
        const emergence = ease((age / hatchAt - 0.72) / 0.28);
        if (emergence > 0) {
          const baby = bornParts(tissues),
            babyBounds = bounds(baby.flatMap((p) => p.pixels)),
            shellBounds = bounds(parts.flatMap((p) => p.pixels));
          for (const part of parts)
            part.pixels = part.pixels.filter(
              (p) =>
                (p.y - shellBounds.y) / Math.max(1, shellBounds.height) >
                emergence * 0.98,
            );
          for (const part of baby) {
            part.pixels = uniquePixels(
              part.pixels
                .filter(
                  (p) =>
                    p.y <=
                    babyBounds.y +
                      babyBounds.height * Math.min(1, emergence * 1.7 + 0.15),
                )
                .map((p) => ({
                  ...p,
                  y: Math.round(p.y - (1 - emergence) * 3),
                })),
            );
            part.bounds = bounds(part.pixels);
            part.layer = (part.layer ?? 100) + 20000;
          }
          parts.push(...baby);
        }
      }
    } else {
      const nodes = state.regions.map((r) => ({
        id: r.id,
        kind: r.kind,
        role: r.role,
        anatomicalRole: persistentRole(r),
        center: r.center,
        anchor: r.anchor,
        tip: r.tip,
        sourceIds: r.sourceIds,
        readiness: r.readiness,
        parentId: r.parentId,
        spine: r.spine,
      }));
      const rig = buildFunctionalGraph(nodes, state.preferred),
        pose = poseFunctionalGraph(rig, {
          time,
          action,
          pace,
          amplitude: motionAmplitude,
        });
      movementMode = pose.movementMode;
      family = pose.controllerFamily;
      groundY = pose.groundY;
      diagnostics = {
        ...pose.diagnostics,
        contacts: pose.contacts,
        phase: pose.phase,
      };
      if (posedAge !== dev) {
        posedPixels.clear();
        posedCost = 0;
        posedAge = dev;
      }
      const regionById = new Map(state.regions.map((r) => [r.id, r]));
      const transformFor = (r: Region): PoseTransform | undefined => {
        const own = pose.transforms[r.id];
        if (
          (["eye", "mouth", "hair", "decoration"].includes(r.kind) ||
            (r.kind === "hand" && r.source?.relationship !== "floating")) &&
          r.parentId
        )
          return pose.transforms[r.parentId] ?? own;
        return own;
      };
      parts = state.regions.map((r) => {
        const transform = transformFor(r);
        const cacheable =
          transform &&
          r.role !== "neck" &&
          (r.sourceWarp || r.shape !== "limb") &&
          (!r.source || r.source.cells.length >= 4);
        const poseKey = cacheable
          ? JSON.stringify([r.id, transform])
          : undefined;
        const cachedPixels = poseKey ? posedPixels.get(poseKey) : undefined;
        if (poseKey) {
          if (cachedPixels) posedHits++;
          else posedMisses++;
        }
        let cells: Pixel[];
        let posedAnchor: Point | undefined, posedTip: Point | undefined;
        if (cachedPixels) cells = cachedPixels;
        else if (r.role === "neck" && !r.source) {
          const host = r.parentId ? regionById.get(r.parentId) : undefined;
          const successor = state.regions.find(
            (head) => head.id + "/neck" === r.id,
          );
          const a = host ? transformFor(host) : transform;
          const b = successor ? transformFor(successor) : transform;
          posedAnchor = a ? transformLocomotionPoint(r.anchor, a) : r.anchor;
          posedTip = b ? transformLocomotionPoint(r.tip, b) : r.tip;
          cells = uniquePixels(
            capsulePixels(posedAnchor, posedTip, Math.max(0.5, r.rx), r.color),
          );
        } else if (
          r.shape === "limb" &&
          !r.sourceWarp &&
          transform?.joint &&
          r.readiness > 0.6
        ) {
          const radius = Math.max(0.45, r.rx);
          cells = uniquePixels([
            ...capsulePixels(
              transform.anchor,
              transform.joint,
              radius,
              r.color,
            ),
            ...capsulePixels(
              transform.joint,
              transform.tip,
              radius * 0.85,
              r.color,
            ),
          ]);
        } else if (r.shape === "limb" && !r.sourceWarp) {
          cells =
            r.rx < 0.45
              ? []
              : uniquePixels(
                  capsulePixels(r.anchor, r.tip, r.rx, r.color).map((c) => ({
                    ...c,
                    ...(transform ? transformLocomotionPoint(c, transform) : c),
                  })),
                );
        } else if (r.sourceWarp && r.source) {
          cells = transform
            ? rasterMaterial(r, r.source, (p) =>
                poseAuthoredMaterial(r, p, transform),
              )
            : restPixels(r);
        } else {
          cells = transform
            ? poseGeneratedMaterial(r, transform)
            : restPixels(r);
        }
        if (poseKey && !cachedPixels && cells.length <= posedPixelLimit) {
          posedPixels.set(poseKey, cells);
          posedCost += cells.length;
          while (
            posedCost > posedPixelLimit ||
            posedPixels.size > posedEntryLimit
          ) {
            const oldest = posedPixels.keys().next().value!;
            posedCost -= posedPixels.get(oldest)!.length;
            posedPixels.delete(oldest);
          }
          maximumPosedPixels = Math.max(maximumPosedPixels, posedCost);
        }
        if (r.kind === "eye" && time > 0) {
          const blink = hash(seed + "|blink") % 9,
            cycle = Math.floor(time * 8) % 43;
          if (cycle === blink || cycle === blink + 1) {
            const b = bounds(cells),
              cx = Math.round(b.x + (b.width - 1) / 2),
              cy = Math.round(b.y + (b.height - 1) / 2);
            cells = [
              { x: cx - 1, y: cy, color: r.color },
              { x: cx, y: cy, color: r.color },
              { x: cx + 1, y: cy, color: r.color },
            ];
          }
        }
        const sourceT = r.source,
          anchor =
            posedAnchor ??
            (transform
              ? r.shape === "limb"
                ? transform.anchor
                : transformLocomotionPoint(r.anchor, transform)
              : r.anchor),
          tip =
            posedTip ??
            (transform
              ? r.shape === "limb"
                ? transform.tip
                : transformLocomotionPoint(r.tip, transform)
              : r.tip);
        return {
          id: r.id,
          kind: r.kind,
          name: sourceT?.name ?? r.role,
          parentId: r.parentId,
          sourcePartId: sourceT?.sourcePartId,
          sourcePartIds: [...r.sourceIds],
          role: persistentRole(r) ?? r.role,
          readiness: r.readiness,
          provenance: sourceT?.provenance ?? "grown",
          relationship:
            sourceT?.relationship ?? (r.parentId ? "joint" : "root"),
          layer: r.layer,
          pixels: cells,
          anchor: { ...anchor },
          tip: { ...tip },
          attachment: r.parentId ? { ...anchor } : null,
          attached: sourceT
            ? ["joint", "surface"].includes(sourceT.relationship)
            : !!r.parentId,
          scale: sourceT
            ? r.rx / Math.max(0.5, sourceT.bounds.width / 2)
            : r.readiness,
          growth: {
            x: sourceT ? r.rx / Math.max(0.5, sourceT.bounds.width / 2) : 1,
            y: sourceT ? r.ry / Math.max(0.5, sourceT.bounds.height / 2) : 1,
          },
          rotation: r.angle + (transform?.rotation ?? 0),
          planted: transform?.planted ?? false,
          bounds: bounds(cells),
        } satisfies PartFrame;
      });
      // A blended material field can depart from its analytic cage at intermediate ages.
      // Project attached painted roots onto the actual current host, without changing ownership.
      for (const part of parts.filter(
        (p) => ["ear", "horn", "tail", "hair"].includes(p.kind) && p.attached,
      )) {
        const host = parts.find((p) => p.id === part.parentId);
        if (!host?.pixels.length || !part.pixels.length) continue;
        let nearest = host.pixels[0],
          distance = Infinity;
        for (const p of host.pixels) {
          const d = (p.x - part.anchor.x) ** 2 + (p.y - part.anchor.y) ** 2;
          if (d < distance) {
            distance = d;
            nearest = p;
          }
        }
        if (distance <= 0.75 ** 2) continue;
        const dx = nearest.x - part.anchor.x,
          dy = nearest.y - part.anchor.y;
        const move = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
        part.pixels = uniquePixels(
          part.pixels.map((p) => ({ ...p, ...move(p) })),
        );
        part.anchor = move(part.anchor);
        part.tip = move(part.tip);
        if (part.attachment) part.attachment = move(part.attachment);
        part.bounds = bounds(part.pixels);
      }
      // Carry authored negative space with bright features drawn inside hollow outlines.
      // Carving their local material window preserves pigments and visible floating gaps.
      const sharedFaceSources = new Set(
        state.facialWindows.flatMap((window) => window.sourceIds),
      );
      const windowDiagnostics: {
        id: string;
        sourceCells: number;
        carvedPixels: number;
      }[] = [];
      for (const window of state.facialWindows) {
        const carrier = window.carrierRegionId
          ? regionById.get(window.carrierRegionId)
          : undefined;
        const transform = carrier ? transformFor(carrier) : undefined;
        const material: MaterialCellQuad[] = window.quads
          .filter((quad) => quad.length === 4)
          .map((quad) => {
            const center = {
              x: quad.reduce((sum, point) => sum + point.x, 0) / 4,
              y: quad.reduce((sum, point) => sum + point.y, 0) / 4,
            };
            return {
              quad,
              center,
              cell: { ...center, color: "#FFFFFF" },
            };
          });
        const empty = new Set(
          rasterCellQuads(
            material,
            transform
              ? (point) => transformLocomotionPoint(point, transform)
              : undefined,
          ).map((point) => `${point.x},${point.y}`),
        );
        let carvedPixels = 0;
        for (const part of parts) {
          const ancestry = [
            part.id,
            part.sourcePartId,
            ...(part.sourcePartIds ?? []),
          ];
          if (window.sourceIds.some((id) => ancestry.includes(id))) continue;
          const region = regionById.get(part.id);
          const hostMaterial =
            window.hostSourceId !== null &&
            ancestry.includes(window.hostSourceId);
          // Other authored features keep their own paint and gaps. Only the
          // window's material host and newly grown covering can obscure its void.
          if (!hostMaterial && region?.source) continue;
          if (!hostMaterial && ["eye", "mouth"].includes(part.kind)) continue;
          const before = part.pixels.length;
          part.pixels = part.pixels.filter(
            (point) => !empty.has(`${point.x},${point.y}`),
          );
          carvedPixels += before - part.pixels.length;
          if (before !== part.pixels.length) part.bounds = bounds(part.pixels);
        }
        windowDiagnostics.push({
          id: window.id,
          sourceCells: material.length,
          carvedPixels,
        });
      }
      if (windowDiagnostics.length)
        diagnostics = {
          ...(diagnostics as object),
          facialWindows: windowDiagnostics,
        };
      const negative = new Set<string>();
      for (const part of parts.filter((p) =>
        ["eye", "mouth", "hand"].includes(p.kind),
      )) {
        const original = tissues.find((t) => t.id === part.id),
          host = tissues.find((t) => t.id === original?.parentId);
        if (!original) continue;
        if (sharedFaceSources.has(original.id)) continue;
        // A repurposed foot is physical material, not a newly authored floating hand window.
        if (
          part.kind === "hand" &&
          (original.kind !== "hand" || original.relationship !== "floating")
        )
          continue;
        const sourceCells = host
            ? sourceField(host).cells
            : new Map<number, Pixel>(),
          bright = original.cells.every(
            (p) =>
              parseInt(p.color.slice(1, 3), 16) +
                parseInt(p.color.slice(3, 5), 16) +
                parseInt(p.color.slice(5, 7), 16) >
              500,
          );
        if (
          !bright ||
          original.cells.some((p) => sourceCells.has(p.y * 64 + p.x))
        )
          continue;
        for (const pixel of part.pixels)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              negative.add(`${pixel.x + dx},${pixel.y + dy}`);
      }
      if (negative.size)
        for (const part of parts)
          if (!["eye", "mouth", "hand", "decoration"].includes(part.kind)) {
            part.pixels = part.pixels.filter(
              (p) => !negative.has(`${p.x},${p.y}`),
            );
            part.bounds = bounds(part.pixels);
          }
      // Sheltered development keeps the authored face visible through a material opening.
      const facialGroups = new Map<string, PartFrame[]>();
      for (const part of parts.filter(
        (p) => ["eye", "mouth"].includes(p.kind) && p.pixels.length,
      )) {
        const key = part.parentId ?? "shared-face";
        const group = facialGroups.get(key) ?? [];
        group.push(part);
        facialGroups.set(key, group);
      }
      const windows = [...facialGroups].map(([hostId, features]) => {
        const host = parts.find((p) => p.id === hostId && p.kind === "head");
        const b = bounds(
          host?.pixels.length ? host.pixels : features.flatMap((p) => p.pixels),
        );
        return {
          x: b.x + b.width / 2,
          y: b.y + b.height / 2,
          rx: Math.max(2, b.width / 2 + 1.75),
          ry: Math.max(2, b.height / 2 + 1.75),
        };
      });
      for (const mark of parts.filter(
        (p) => p.kind === "decoration" && p.pixels.length,
      )) {
        const b = mark.bounds;
        windows.push({
          x: b.x + b.width / 2,
          y: b.y + b.height / 2,
          rx: Math.max(1.25, b.width / 2 + 1),
          ry: Math.max(1.25, b.height / 2 + 1),
        });
      }
      for (const coating of parts.filter((p) => p.role === "enclosure")) {
        coating.pixels = coating.pixels.filter(
          (p) =>
            !windows.some(
              (w) => ((p.x - w.x) / w.rx) ** 2 + ((p.y - w.y) / w.ry) ** 2 <= 1,
            ),
        );
        coating.bounds = bounds(coating.pixels);
      }
      // One pose-independent view transform for the entire creature and every attachment.
      const all = state.regions.flatMap((r) => [
        { x: r.center.x - r.rx - 3, y: r.center.y - r.ry - 3 },
        { x: r.center.x + r.rx + 3, y: r.center.y + r.ry + 3 },
        r.anchor,
        r.tip,
        ...(r.spine ?? []),
        ...(() => {
          const materialBounds = bounds(restPixels(r));
          return materialBounds.width
            ? [
                { x: materialBounds.x - 3, y: materialBounds.y - 3 },
                {
                  x: materialBounds.x + materialBounds.width + 3,
                  y: materialBounds.y + materialBounds.height + 3,
                },
              ]
            : [];
        })(),
      ]);
      const b = bounds(all),
        scale = Math.min(
          1,
          56 / Math.max(1, b.width),
          56 / Math.max(1, b.height),
        ),
        cx = b.x + b.width / 2,
        cy = b.y + b.height / 2;
      const offset = {
        x:
          scale < 1
            ? 32 - cx * scale
            : clamp(
                4 - b.x,
                Math.min(0, 60 - b.x - b.width),
                Math.max(0, 4 - b.x),
              ),
        y:
          scale < 1
            ? 32 - cy * scale
            : clamp(
                4 - b.y,
                Math.min(0, 60 - b.y - b.height),
                Math.max(0, 4 - b.y),
              ),
      };
      const view = (p: Point) => ({
        x: Math.round(p.x * scale + offset.x),
        y: Math.round(p.y * scale + offset.y),
      });
      diagnostics = {
        ...((diagnostics ?? {}) as Record<string, unknown>),
        camera: {
          scale,
          offset: { ...offset },
          center: { x: cx, y: cy },
          width: b.width,
          height: b.height,
          motionMargin: 3,
        },
      };
      if (scale < 1 || offset.x || offset.y) {
        for (const p of parts) {
          p.pixels = uniquePixels(p.pixels.map((c) => ({ ...c, ...view(c) })));
          p.anchor = view(p.anchor);
          p.tip = view(p.tip);
          if (p.attachment) p.attachment = view(p.attachment);
          p.bounds = bounds(p.pixels);
        }
        groundY = view({ x: 0, y: groundY }).y;
      }
    }
    const outsideByPart = parts
      .map((p) => ({
        id: p.id,
        count: p.pixels.filter(
          (c) => c.x < 0 || c.y < 0 || c.x >= 64 || c.y >= 64,
        ).length,
      }))
      .filter((p) => p.count > 0);
    diagnostics = {
      ...(diagnostics as Record<string, unknown>),
      viewportClipping: {
        outsidePixelCount: outsideByPart.reduce((sum, p) => sum + p.count, 0),
        parts: outsideByPart,
      },
    };
    for (const p of parts) {
      // The common camera must see distant floating ink before any viewport clipping.
      p.pixels = uniquePixels(p.pixels, true);
      p.bounds = bounds(p.pixels);
      const authored = source.find((s) => s.id === p.id);
      if (authored) p.name = authored.name;
    }
    const surfaceState = surfaceExpressionAt(
      surfaceGenes,
      egg || birth ? 0 : dev,
      careAge * 24,
      liveContext,
    );
    applySurfaceExpression(parts, surfaceGenes, surfaceState);
    diagnostics = {
      ...(diagnostics as Record<string, unknown>),
      surfaceExpression: surfaceState,
    };
    const capabilities = capability(parts, movementMode, family),
      interaction: PetFrame["interaction"] = {
        status: action === "idle" ? "resting" : action,
        action,
        groundY,
        diagnostics,
      };
    if (egg)
      Object.assign(capabilities, {
        canMove: false,
        canPlay: false,
        canGreet: false,
        canSee: false,
        canFly: false,
        canWalk: false,
        canCatch: false,
        canTalk: false,
        effectorIds: [],
        usableHands: [],
        usableFeet: [],
        usableMouths: [],
      });
    if (
      getMetamorphosisPhase(blueprint!.inherited, dev).enclosure > 0.8 &&
      !egg
    )
      Object.assign(capabilities, {
        canMove: false,
        canFly: false,
        canWalk: false,
        canCatch: false,
        canPlay: false,
      });
    if (action === "play" && opts.target) {
      const priorities = ["hand", "mouth", "tail", "body"];
      let chosen: PartFrame | undefined;
      for (const kind of priorities) {
        chosen = parts
          .filter((p) => p.kind === kind && p.pixels.length)
          .sort(
            (a, b) =>
              Math.hypot(a.tip.x - opts.target!.x, a.tip.y - opts.target!.y) -
              Math.hypot(b.tip.x - opts.target!.x, b.tip.y - opts.target!.y),
          )[0];
        if (chosen) break;
      }
      interaction.target = { ...opts.target };
      if (chosen) {
        const contact = [...chosen.pixels].sort(
          (a, b) =>
            Math.hypot(a.x - opts.target!.x, a.y - opts.target!.y) -
            Math.hypot(b.x - opts.target!.x, b.y - opts.target!.y),
        )[0];
        interaction.effectorId = chosen.id;
        interaction.contactPoint = { x: contact.x, y: contact.y };
        interaction.mode = chosen.kind as "hand" | "mouth" | "tail" | "body";
        interaction.status =
          chosen.kind === "body"
            ? "nudged"
            : Math.hypot(contact.x - opts.target.x, contact.y - opts.target.y) <
                6
              ? "caught"
              : "out-of-reach";
      } else interaction.status = "unavailable";
    }
    const evolution = {
      ...copy(developmentAt(age)),
      controllerFamily: family,
      surfaceExpression: surfaceState,
    };
    const pixels =
      age === 0 && time === 0 && action === "idle"
        ? flattenAnatomy(source).map((p) => ({
            ...p,
            x: p.x + 16,
            y: p.y + 16,
          }))
        : composite(parts);
    const result: PetFrame = {
      pixels,
      parts,
      age,
      developmentalAge: careAge,
      stage: egg
        ? "egg"
        : dev < 30
          ? "infant"
          : dev < 75
            ? "teen"
            : dev < 120
              ? "adult"
              : "elderly",
      movementMode,
      wellbeing,
      evolution,
      motionPace: pace,
      motionAmplitude,
      cellCount: pixels.length,
      generation: evolution.commitments.length,
      traits: [
        { label: "Form", value: evolution.bodyPlanId },
        { label: "Movement", value: movementMode },
        { label: "Inheritance", value: genes.protectionPreference },
      ],
      capabilities,
      interaction,
    };
    const cost = (f: PetFrame) =>
      f.parts.reduce((n, p) => n + p.pixels.length, 0);
    if (cost(result) <= 120000) {
      setLRU(frames, frameKey, copy(result), 12);
      let total = [...frames.values()].reduce((n, f) => n + cost(f), 0);
      while (total > 120000 && frames.size) {
        const k = frames.keys().next().value!;
        total -= cost(frames.get(k)!);
        frames.delete(k);
      }
    }
    return result;
  }
  return {
    genome: copy(blueprint.inherited),
    program: copy(program),
    milestones: copy(milestones),
    maxAge,
    initialPreviewEnd: maxAge,
    openEnded: true,
    hatchAt,
    stateAt: (age) =>
      needs.stateAt(
        clamp(Number.isFinite(age) ? age - hatchAt : 0, 0, MAX_SIMULATION_DAYS),
      ),
    developmentAt,
    frameAt,
    getRenderCacheStats: () =>
      Object.freeze({
        age: posedAge,
        hits: posedHits,
        misses: posedMisses,
        entries: posedPixels.size,
        pixels: posedCost,
        pixelLimit: posedPixelLimit,
        entryLimit: posedEntryLimit,
        maximumObservedPixels: maximumPosedPixels,
      }),
    groomingStrokeAt(age: number, from: Point, to: Point): GroomStroke | null {
      if (
        ![from.x, from.y, to.x, to.y].every(Number.isFinite) ||
        Math.hypot(to.x - from.x, to.y - from.y) < 0.75
      )
        return null;
      const frame = frameAt(age, { time: 0, action: "idle" });
      if (frame.stage === "egg") return null;
      const current = structure(liveClock.toMorphology(frame.developmentalAge)),
        birth = frame.developmentalAge === 0;
      const rig = buildFunctionalGraph(
        rigNodes(current.regions),
        current.preferred,
      );
      const pose = poseFunctionalGraph(rig, {
        time: 0,
        action: "idle",
        pace: frame.motionPace,
        amplitude: frame.motionAmplitude,
      });
      const camera = (
        frame.interaction.diagnostics as
          { camera?: { scale: number; offset: Point } } | undefined
      )?.camera;
      const view = (p: Point) =>
        birth
          ? p
          : {
              x: p.x * (camera?.scale ?? 1) + (camera?.offset.x ?? 0),
              y: p.y * (camera?.scale ?? 1) + (camera?.offset.y ?? 0),
            };
      const generatedHit = frame.parts
        .filter(
          (p) =>
            !p.sourcePartId &&
            p.pixels.some(
              (cell) => (cell.x - from.x) ** 2 + (cell.y - from.y) ** 2 <= 9,
            ),
        )
        .sort((a, b) => (b.layer ?? 0) - (a.layer ?? 0))[0];
      let best:
        | {
            distance: number;
            sourceId: string;
            anchor: Point;
            project: (point: Point) => Point;
          }
        | undefined;
      for (const region of current.regions) {
        if (
          !region.source ||
          ["eye", "mouth", "decoration"].includes(region.kind)
        )
          continue;
        const part = frame.parts.find((p) => p.id === region.id);
        if (!part?.pixels.length) continue;
        const transform =
          ["hair"].includes(region.kind) && region.parentId
            ? (pose.transforms[region.parentId] ?? pose.transforms[region.id])
            : pose.transforms[region.id];
        const materialPoint = (point: Point) => {
          const mapped = mapSourcePoint(region, point);
          return birth || !transform
            ? mapped
            : poseAuthoredMaterial(region, mapped, transform);
        };
        const anchor = view(
          materialPoint(region.anchorSourcePoint ?? region.source.pivot),
        );
        const correction = {
          x: part.anchor.x - Math.round(anchor.x),
          y: part.anchor.y - Math.round(anchor.y),
        };
        const project = (point: Point) => {
          const p = view(materialPoint(point));
          return { x: p.x + correction.x, y: p.y + correction.y };
        };
        for (const cell of region.source.cells) {
          const clip = region.sourceClip;
          if (
            clip &&
            (cell[clip.axis] < clip.min || cell[clip.axis] >= clip.max)
          )
            continue;
          const display = project(cell),
            distance = (display.x - from.x) ** 2 + (display.y - from.y) ** 2;
          if (
            (distance <= 9 ||
              generatedHit?.sourcePartIds?.includes(region.source.id)) &&
            (!best || distance < best.distance - 1e-9)
          )
            best = {
              distance,
              sourceId: region.source.id,
              anchor: { x: cell.x, y: cell.y },
              project,
            };
        }
      }
      if (!best) return null;
      const p = best.project(best.anchor),
        xx = best.project({ x: best.anchor.x + 0.5, y: best.anchor.y }),
        yy = best.project({ x: best.anchor.x, y: best.anchor.y + 0.5 });
      const ax = (xx.x - p.x) * 2,
        ay = (xx.y - p.y) * 2,
        bx = (yy.x - p.x) * 2,
        by = (yy.y - p.y) * 2,
        det = ax * by - ay * bx;
      if (Math.abs(det) < 1e-7) return null;
      const dx = to.x - from.x,
        dy = to.y - from.y;
      const direction = {
        x: (by * dx - bx * dy) / det,
        y: (ax * dy - ay * dx) / det,
      };
      const length = Math.hypot(direction.x, direction.y);
      if (length < 1e-7) return null;
      const touched = tissues.find((t) => t.id === best!.sourceId);
      const parent = touched?.parentId
        ? tissues.find((t) => t.id === touched.parentId)
        : undefined;
      const sourceId =
        (touched?.kind === "foot" && parent?.kind === "leg") ||
        (touched?.kind === "hand" && parent?.kind === "arm")
          ? parent.id
          : best.sourceId;
      return {
        tick: Math.round(frame.developmentalAge * 24),
        sourceId,
        materialAnchor: best.anchor,
        direction: { x: direction.x / length, y: direction.y / length },
        strength: clamp(Math.hypot(dx, dy) / 12, 0.1, 1),
      };
    },
  };
}
export function getCapabilities(parts: PetPart[]): Capabilities {
  return createSimulation(parts, "capabilities").frameAt(0).capabilities;
}
export function supportsAction(parts: PetPart[], action: PetAction) {
  const c = getCapabilities(parts);
  return (
    action === "idle" ||
    (action === "move" ? c.canMove : action === "play" ? c.canPlay : c.canGreet)
  );
}

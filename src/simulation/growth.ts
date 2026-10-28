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
  type GroomingBinding,
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
import { compileGenome, genomeCacheKey } from "./genome";
import {
  compileRuntimeBiology, compileRuntimeMaterialProgram,
  type RuntimeBiology,
} from "../integration";
import { type MaterialDevelopmentProgram, type MaterialGraph, type MaterialCell } from "../development";
import {careGamePresentation} from "../integration/care-game-pose";
import {recordedNeedsSimulation} from "../integration/living-physiology";
import {createDailyMaterialTimeline,createReusedDailyMaterialTimeline,type PreviewCareInputs} from "../integration/daily-runtime";
import { inferFunctionalMaterial, type MaterialMovementBinding } from "../integration/functional-material";
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
    biology: RuntimeBiology;
    material: MaterialDevelopmentProgram;
    hatchAt: number;
    embryoRecipe?: Record<string, unknown>;
  }
>();
type DailyRenderGeometry={byId:Map<string,MaterialCell>;tissueSource:Map<string,Tissue>;
  groups:Map<string,MaterialCell[]>;original:Set<string>;regions:Region[];
  functional:ReturnType<typeof inferFunctionalMaterial>;rig:ReturnType<typeof buildFunctionalGraph>};
const dailyRenderGeometry=new WeakMap<MaterialGraph,DailyRenderGeometry>();
const birthMetadata=new WeakMap<object,Map<string,ResolvedDevelopment>>();
const lineageMetadata=new WeakMap<object,Map<string,ReturnType<typeof compileLineage>>>();
const dailyStateMetadata=new WeakMap<object,{commitments:{id:string;tick:number;option:string}[];operations:{id:string;kind:string;progress:number}[];anatomy:{id:string;role:string;sourcePartIds:string[];readiness:number}[]}>();
const publicMetadata=new WeakMap<object,{genome:ReturnType<typeof compileGenome>;programs:Map<string,DevelopmentProgram>}>();
function cachedLineage(blueprint:object,atlas:ReturnType<typeof describeSource>,genome:ReturnType<typeof compileGenome>,points:NonNullable<SimulationOptions["liveContext"]>["stagePoints"]){
  const entries=lineageMetadata.get(blueprint)??new Map<string,ReturnType<typeof compileLineage>>();
  const key=JSON.stringify(points);let result=entries.get(key);
  if(!result){result=compileLineage(atlas,genome,points);setLRU(entries,key,result,8);lineageMetadata.set(blueprint,entries);}
  return result;
}
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
/** Distributed two-segment flexure of an explicitly linked, grown tissue. */
export function poseLinkedMaterial(
  p: Point, binding: MaterialMovementBinding, transform: PoseTransform,
): Point {
  if (!transform.joint) return transformLocomotionPoint(p, transform);
  const dx = binding.tip.x - binding.anchor.x,
    dy = binding.tip.y - binding.anchor.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return transformLocomotionPoint(p, transform);
  const along = ((p.x - binding.anchor.x) * dx +
    (p.y - binding.anchor.y) * dy) / (length * length);
  const side = ((p.x - binding.anchor.x) * -dy +
    (p.y - binding.anchor.y) * dx) / length;
  const start = along < 0.5 ? transform.anchor : transform.joint;
  const end = along < 0.5 ? transform.joint : transform.tip;
  const t = along < 0.5 ? along * 2 : (along - 0.5) * 2;
  const vx = end.x - start.x, vy = end.y - start.y;
  const size = Math.max(0.001, Math.hypot(vx, vy));
  return { x: start.x + vx * t - (vy / size) * side,
    y: start.y + vy * t + (vx / size) * side };
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
  const cells = new Map<string, Painted>(),
    authored = new Map<string, Painted>();
  for (const part of parts)
    for (const p of part.pixels) {
      const depth = p.z ?? part.layer ?? 100,
        k = p.x + "," + p.y,
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
  options: SimulationOptions & {previewCare?:PreviewCareInputs} = {},
): PetSimulation {
  if (options.careGame && options.previewCare)
    throw new TypeError("Synthetic Needs Lab care cannot enter a real saved life");
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
      genomeCacheKey(inherited) +
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
    // The hatched organism retains the player's EXACT original ink. Egg
    // incubation is presentation before this birth anchor, never a new sprite.
    const tissues = compileSources(source,hash(inherited.fingerprint),"authored");
    const atlas = describeSource(tissues);
    const shell = compileSources(source,hash(fingerprint),"shell");
    const biology = compileRuntimeBiology(atlas,inherited);
    blueprint = {
      tissues,
      shell,
      genes: compileDevelopment(atlas, inherited),
      biology,
      material: compileRuntimeMaterialProgram(atlas, inherited, biology),
      inherited,
      atlas,
      hatchAt:mode === "egg" ? 5/(60*24) : 0,
    };
    compilations++;
    setLRU(blueprints, cacheKey, blueprint, 8);
  } else setLRU(blueprints, cacheKey, blueprint, 8);
  const verified = options.verifyMaterialProgram?.(blueprint.material, inherited);
  if (verified && (verified.program.genomeFingerprint !== blueprint.material.genomeFingerprint ||
      verified.program.source.sourceFingerprint !== blueprint.material.source.sourceFingerprint ||
      JSON.stringify(verified.program.source.sourceCells) !==
        JSON.stringify(blueprint.material.source.sourceCells)))
    throw new TypeError("Verification must preserve actual birth material and genome");
  const physicalProgram = verified?.program ?? blueprint.material;
  const { tissues, genes } = blueprint,
    careMaterial = options.careGame ? {recorded:true} : undefined,
    unified = options.careGame && !verified && options.reuseLivingMaterial!==false
      ? createReusedDailyMaterialTimeline({birthKey:cacheKey,program:physicalProgram,
          genome:inherited,game:options.careGame,savedCheckpoint:options.anatomicalCheckpoint})
      : createDailyMaterialTimeline({program:physicalProgram,genome:inherited,birthKey:cacheKey,
          savedCheckpoint:options.anatomicalCheckpoint,
          ...(options.careGame?{game:options.careGame}:{}),
          ...(options.previewCare?{previewCare:options.previewCare}:{}),
          ...(verified?.remodelingProgram?{remodelingProgram:verified.remodelingProgram}:{})}),
    surfaceGenes = compileSurfaceExpression(inherited),
    hatchAt = liveContext
      ? Math.max(0, liveContext.hatchAtHours) / 24
      : blueprint.hatchAt,
    liveClock = createDevelopmentClock(liveContext),
    lineage = liveContext
      ? cachedLineage(blueprint,blueprint.atlas,inherited,liveContext.stagePoints)
      : undefined,
    programFingerprint = String(hash(JSON.stringify([
      fingerprint,
      blueprint.material.fingerprint,
      // A developmental PROGRAM is fixed at birth. Saved commands change
      // chronological expression, not the permanent program fingerprint;
      // including future care here would retroactively alter old frames.
      "daily-365-v1",
      hatchAt,
    ]))),
    needs = options.careGame?recordedNeedsSimulation(options.careGame):createNeedsSimulation(seed, options.needTimeline),
    groomingSimulation = createGroomingSimulation(options.groomingTimeline),
    structural = new Map<number, ResolvedDevelopment>(),
    frames = new Map<string, PetFrame>(),
    materialSnapshots = new Map<number, MaterialGraph>();
  // UI ages are days represented by IEEE754 Numbers. Correct only conversion
  // roundoff near an integer millisecond; never round a genuine sub-ms query
  // across a check. Persisted physical events still use exact epoch integers.
  const physicalHour=(age:number)=>{
    const ms=Math.max(0,(age-hatchAt)*86400000),nearest=Math.round(ms);
    const error=8*Number.EPSILON*Math.max(1,Math.abs(age),Math.abs(hatchAt))*86400000;
    return Math.min(unified.maxHour,(Math.abs(ms-nearest)<=error?nearest:ms)/3600000);
  };
  const materialAt = (chronologicalHour: number): MaterialGraph => {
    // Actual shared CARE + DEV-002/003/004 anatomy. Recorded care is finite:
    // beyond the observed horizon hold the graph, never invent future feeding.
    const hour = Math.min(unified.maxHour,
      Math.max(0, chronologicalHour));
    const hit = materialSnapshots.get(hour);
    if (hit) return hit;
    const graph = unified.at(hour).graph;
    setLRU(materialSnapshots, hour, graph, 8);
    return graph;
  };
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
  const maxAge = hatchAt + 365,
    milestones: Milestone[] = [
      ...(mode === "egg" ? [{ stage: "egg" as const, age: 0 }] : []),
      ...(["infant", "teen", "adult", "elderly"] as const).map((stage, i) => ({
        stage,
        age: hatchAt + liveClock.toChronological([0, 30, 75, 365][i]),
      })),
    ];
  const program: DevelopmentProgram = {
    version: 7,
    fingerprint: programFingerprint,
    mode,
    style: "Source-preserving daily material development",
    operators: physicalProgram.operators.map(op=>({
      id:op.id,tissueId:op.tissueId,kind:op.kind,
      start:Math.ceil(op.atHour),end:Math.ceil(op.atHour+op.durationHours),strength:op.strength,
    })),
    operatorScheduling:"Permanent material support in daily opportunity coordinates; all executed iterative/remodeling/material operators are in materialStateAt().graph.events",
    tissueCount:physicalProgram.source.tissues.length,
    sourcePartCount: source.length,
    milestones,
    maxAge,
    hatchAt,
    limits: {
      worldSize: 64,
      generatedTissues: 3072,
      cachedFrames: 0,
      cachedPixels: 0,
      poseCachedPixels: 0,
    },
    geneticProgram: genes,
    inheritedGenome: blueprint.inherited,
    proceduralGrammarVersion: inherited.proceduralGrammarVersion,
    surfaceExpressionVersion: inherited.surfaceExpressionVersion,
    surfaceExpressionGenes: surfaceGenes,
    somaticGrowthVersion: inherited.somaticGrowthVersion,
    somaticGrowthGenes: genes.somaticGrowth,
    sourceAtlas: blueprint.atlas,
    // Read-only merged scientific/genetic evidence; no replacement renderer.
    biologicalPotential: {
      ...blueprint.biology,
      physicalOperatorsConnected: true,
      chronologicalExposureConnected: Boolean(careMaterial),
    },
    materialProgramFingerprint: physicalProgram.fingerprint,
    authoredInkSignature: signature,
    genomeIdentity: blueprint.biology.genomeIdentity,
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
  // Export a defensive immutable metadata copy ONCE per exact program.
  // Recopying the entire atlas/genetic program on every one-second tick was
  // both wasteful and unrelated to a new developmental opportunity.
  let publicEntry=publicMetadata.get(blueprint);
  if(!publicEntry){publicEntry={genome:freeze(copy(blueprint.inherited)),programs:new Map()};publicMetadata.set(blueprint,publicEntry);}
  const publicKey=JSON.stringify([programFingerprint,lineage?.fingerprint,Boolean(careMaterial)]);
  let exposedProgram=publicEntry.programs.get(publicKey);
  if(!exposedProgram){exposedProgram=freeze(copy(program));setLRU(publicEntry.programs,publicKey,exposedProgram,8);}
  function structure(dev: number) {
    const birthKey=dev===0?JSON.stringify([hatchAt,liveContext?.stagePoints[0],
      options.careGame?.careSamples[0],options.careGame?null:(Array.isArray(options.needTimeline)?options.needTimeline.filter(f=>f.tick===0):options.needTimeline)]):"";
    const stored=dev===0?birthMetadata.get(blueprint!)?.get(birthKey):undefined;
    if(stored)return stored;
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
      if(dev===0){const records=birthMetadata.get(blueprint!)??new Map<string,ResolvedDevelopment>();
        setLRU(records,birthKey,result,4);birthMetadata.set(blueprint!,records);}
    }
    return result;
  }
  function developmentAt(age: number) {
    const result = copy(structure(0).state);
    result.genomeFingerprint = blueprint!.inherited.fingerprint;
    result.diagnostics = {
      ...result.diagnostics,
      biologicalComposition: {
        version: blueprint!.biology.version,
        genomeIdentity: blueprint!.biology.genomeIdentity,
        sourceGeometryHash: blueprint!.biology.sourceGeometryHash,
        candidateReferenceCount: blueprint!.biology.references.length,
        scientificPetAssignment: null,
        physicalOperatorsConnected: true,
        materialProgramFingerprint: physicalProgram.fingerprint,
        chronologicalExposureConnected: Boolean(careMaterial),
      },
    };
    result.sourceFingerprint = String(hash(signature));
    result.programFingerprint = programFingerprint;
    const physical=unified.at(physicalHour(age));
    let metadata=dailyStateMetadata.get(physical);
    if(!metadata){
      const active=new Set(physical.graph.cells.map(c=>c.tissueId));
      metadata=freeze({
        commitments:physical.checks.map(c=>({id:"daily/"+c.checkIndex,tick:c.checkIndex*24,option:c.nullEffect?"no-physical-change":"physical-transaction"})),
        operations:physical.graph.events.map(e=>({id:e.id,kind:e.kind,progress:1})),
        anatomy:physical.graph.tissues.filter(t=>active.has(t.id)).map(t=>({id:t.id,role:physical.graph.sourceCells.some(c=>c.tissueId===t.id)?"source-material":"generated-material",sourcePartIds:[t.sourcePartId],readiness:1})),
      });dailyStateMetadata.set(physical,metadata);
    }
    result.developmentalAge=Math.max(0,age-hatchAt);
    result.transitionId=physical.completedChecks===0?"birth":physical.completedChecks===365?"mature":"daily/"+physical.completedChecks;
    result.progress=physical.completedChecks/365;
    result.commitments=metadata.commitments;result.operations=metadata.operations;result.anatomy=metadata.anatomy;
    result.controllerFamily=dailyRenderGeometry.get(physical.graph)?.rig.controllerFamily??"unresolved";
    delete result.lifecycle;
    result.diagnostics={...result.diagnostics,dailyAnatomy:{completedChecks:physical.completedChecks,mature:physical.completedChecks===365,clock:"daily-365-v1"}};
    if(mode==="egg"&&age<hatchAt)delete result.lineage;
    return freeze(result);
  }
  /** Draw only ACTIVE authoritative cells. Pose transports their quadrilaterals;
   * no legacy contour, generated silhouette, stage sprite or surface expansion
   * can paint an anatomical pixel without physical ownership. */
  function frameAt(rawAge: number, opts: FrameOptions = {}): PetFrame {
    const age=Number.isFinite(rawAge)?clamp(rawAge,0,MAX_SIMULATION_DAYS):maxAge;
    const careAge=Math.max(0,age-hatchAt),time=Math.max(0,opts.time??0),action=opts.action??"idle";
    const egg=mode==="egg"&&age<hatchAt;
    const physical=unified.at(physicalHour(age));
    const graph=physical.graph;
    const wellbeing=needs.stateAt(careAge);
    const pace=clamp(genes.pace*(0.6+0.5*wellbeing.development.recovery),0.15,3);
    const amplitude=0.5+0.5*wellbeing.development.recovery;
    let geometry=dailyRenderGeometry.get(graph);
    if(!geometry){
    const byId=new Map(graph.cells.map(c=>[c.id,c]));
    const tissueSource=new Map(tissues.map(t=>[t.id,t]));
    const groups=new Map<string,MaterialCell[]>();
    for(const cell of graph.cells){const g=groups.get(cell.tissueId)??[];g.push(cell);groups.set(cell.tissueId,g);}
    const original=new Set(graph.sourceCells.map(c=>c.tissueId));
    const regions:Region[]=graph.tissues.filter(t=>original.has(t.id)).flatMap(t=>{
      const source=tissueSource.get(t.sourcePartId),cells=groups.get(t.id)??[];
      if(!source||!cells.length)return [];
      const center={x:cells.reduce((n,c)=>n+c.x,0)/cells.length,y:cells.reduce((n,c)=>n+c.y,0)/cells.length};
      const link=graph.links.find(l=>l.fromTissueId===t.id&&l.kind==="attachment");
      const anchor=link?.fromCellId?byId.get(link.fromCellId)??center:source.pivot;
      const tip=[...cells].sort((a,b)=>(b.x-anchor.x)**2+(b.y-anchor.y)**2-
        ((a.x-anchor.x)**2+(a.y-anchor.y)**2)||compareText(a.id,b.id))[0];
      const box=bounds(cells);
      return [{id:t.id,kind:source.kind,role:source.kind,parentId:t.parentId,
        sourceIds:[source.id],center,anchor:{x:anchor.x,y:anchor.y},tip:{x:tip.x,y:tip.y},
        rx:box.width/2,ry:box.height/2,angle:0,readiness:1,material:cells.length,
        shape:"mask" as const,color:cells[0].color,layer:source.part.layer??100,source}];
    });
    const functional=inferFunctionalMaterial(graph,regions,rigNodes(regions));
    const rig=buildFunctionalGraph(functional.nodes);
      geometry={byId,tissueSource,groups,original,regions,functional,rig};
      dailyRenderGeometry.set(graph,geometry);
    }
    const {byId,tissueSource,groups,original,regions,functional,rig}=geometry;
    const pose=poseFunctionalGraph(rig,{time,action,pace,amplitude});
    const presentedGame=options.careGame&&options.careGame.commandHistory.at(-1)?.atMs!<=options.careGame.clock.startedAtMs+age*86400000?options.careGame:undefined;
    const carePose=careGamePresentation(presentedGame,time);
    const express=(p:Point):Point=>{
      if(carePose.kind==="idle")return p;
      const x=p.x-rig.center.x,y=p.y-rig.center.y,c=Math.cos(carePose.rotation),s=Math.sin(carePose.rotation);
      return {x:rig.center.x+x*c-y*s+carePose.offset.x,y:rig.center.y+x*s+y*c+carePose.offset.y};
    };
    const bindings=new Map(functional.bindings.map(b=>[b.tissueId,b]));
    // Brushing poses existing authored hair; it never lengthens it or changes
    // material inventory. The existing bounded relaxation law controls bend.
    const groomBindings:GroomingBinding[]=regions.filter(r=>r.kind==="hair").map(r=>({
      id:r.id,kind:r.kind,parentId:r.parentId,sourceIds:r.sourceIds,
      materialAnchor:r.source!.pivot,growthAxis:{x:r.tip.x-r.anchor.x,y:r.tip.y-r.anchor.y},
      influenceRadius:Math.max(1,Math.hypot(r.rx,r.ry)),
      geneticOpportunity:{length:0,bend:1},
    }));
    const groom=groomingSimulation.stateAt(careAge,groomBindings);

    const regionsBySource=new Map(regions.map(r=>[r.source!.id,r]));
    const quads:{partId:string;cellId:string;quad:Point[]}[]=[];
    const parts:PartFrame[]=graph.tissues.flatMap(t=>{
      const all=groups.get(t.id);if(!all?.length)return [];
      const partitions=original.has(t.id)?[all.filter(c=>c.provenance==="authored"),all.filter(c=>c.provenance==="generated")]:[all];
      return partitions.filter(c=>c.length).flatMap(cells=>{
      const authored=cells[0].provenance==="authored";
      const source=tissueSource.get(t.sourcePartId),region=regionsBySource.get(t.sourcePartId);
      const binding=bindings.get(t.id);
      const transform=pose.transforms[binding?.rigId??(original.has(t.id)?t.id:region?.id??"")];
      const transport=(p:Point):Point=>{
        let point=p;
        const bend=source?.kind==="hair"?groom.byRegion[region?.id??t.id]?.bendRadians??0:0;
        if(bend&&region){const dx=p.x-region.anchor.x,dy=p.y-region.anchor.y,c=Math.cos(bend),s=Math.sin(bend);
          point={x:region.anchor.x+dx*c-dy*s,y:region.anchor.y+dx*s+dy*c};}
        return express(time===0&&action==="idle"||!transform?{...point}:
          binding?poseLinkedMaterial(point,binding,transform):transformLocomotionPoint(point,transform));
      };
      const partId=authored?t.id:"material-growth/"+t.id;
      const material=cells.map(cell=>({cell:{x:cell.x,y:cell.y,color:cell.color,...(cell.z===undefined?{}:{z:cell.z}),materialCellId:cell.id,
          materialSourceIds:cell.sourceIds,materialParentCellIds:cell.parentCellIds,
          materialOperationId:cell.operationId},quad:cellCorners(cell).map(transport),center:transport(cell)}));
      quads.push(...material.map(q=>({partId,cellId:q.cell.materialCellId,quad:q.quad})));
      const pixels=rasterCellQuads(material),box=bounds(pixels);
      const anchor=region?.anchor??cells[0],tip=region?.tip??cells[cells.length-1];
      return [{id:partId,kind:source?.kind??"decoration",name:source?.name??"Growing material",
        parentId:t.parentId,sourcePartIds:[t.sourcePartId],role:authored?source?.kind??"source":"material-growth",
        readiness:1,provenance:authored?"authored":"grown",relationship:t.relationship,
        layer:source?.part.layer??100,pixels,anchor:transport(anchor),tip:transport(tip),
        attachment:transport(anchor),attached:t.parentId!==null,scale:1,growth:{x:1,y:1},rotation:0,
        planted:!pose.locomotionSupported,bounds:box}];
      });
    });
    // Every authoritative physical cell must have one material-to-quad
    // ownership mapping, irrespective of its morphology, origin or rig.
    const quadOwnerCounts=new Map<string,number>();
    for(const q of quads)quadOwnerCounts.set(q.cellId,(quadOwnerCounts.get(q.cellId)??0)+1);
    const missingPhysicalOwnerIds=graph.cells.filter(c=>quadOwnerCounts.get(c.id)!==1).map(c=>c.id);
    if(missingPhysicalOwnerIds.length)
      throw new TypeError("Authoritative material omitted or duplicated during rendering: "+
        missingPhysicalOwnerIds.slice(0,4).join(","));
    const pixels=composite(parts);
    const diagnostics={...pose.diagnostics,careGame:carePose,camera:{scale:1,offset:{x:0,y:0}},worldPosition:pose.worldPosition,
      worldCameraX:pose.cameraWorldX,materialLocomotionEvidence:functional.evidence,
      groomingPose:{appliedStrokes:groom.input.appliedStrokes,regions:groom.byRegion},
      physicalMaterial:{version:graph.version,sourceFingerprint:graph.sourceFingerprint,
        generatedCells:graph.cells.filter(c=>c.provenance==="generated").length,
        graphEvents:graph.events.length,completedChecks:physical.completedChecks,mature:physical.completedChecks===365,
        visibleGrowthParts:parts.filter(p=>p.role==="material-growth").length,
        unmappedGeneratedTissues:[],renderedPhysicalCells:quadOwnerCounts.size,
        missingPhysicalOwnerIds,remodeledAuthoredCells:graph.sourceCells.filter(c=>{
          const active=byId.get(c.id);return !active||c.x!==active.x||c.y!==active.y;}).length,
        renderedCellQuads:quads},
    };
    const evolution={...developmentAt(age)};
    evolution.diagnostics={...evolution.diagnostics,dailyAnatomy:{completedChecks:physical.completedChecks,
      mature:physical.completedChecks===365,clock:"daily-365-v1"}};
    evolution.controllerFamily=pose.controllerFamily;
    const capabilities=capability(parts,pose.movementMode,pose.controllerFamily);
    capabilities.canMove=pose.locomotionSupported;
    const interaction:PetFrame["interaction"]={status:opts.target?"out-of-reach":"idle",action,
      ...(opts.target?{target:{...opts.target}}:{}),groundY:pose.groundY,diagnostics};
    if(opts.target&&parts.length){
      let nearest=parts[0].pixels[0];let distance=Infinity;
      for(const p of pixels){const d=(p.x-opts.target.x)**2+(p.y-opts.target.y)**2;if(d<distance){distance=d;nearest=p;}}
      if(nearest){interaction.contactPoint={x:nearest.x,y:nearest.y};interaction.mode="body";
        interaction.status=distance<36?"nudged":"out-of-reach";}
    }
    // Incubation is a presentation state preceding the identical authored
    // organism; it consumes no anatomical opportunity.
    return {pixels,parts,age,developmentalAge:careAge,stage:egg?"egg":careAge<30?"infant":careAge<75?"teen":careAge<365?"adult":"elderly",
      movementMode:pose.movementMode,wellbeing,evolution,motionPace:pace,motionAmplitude:amplitude,
      cellCount:pixels.length,generation:physical.completedChecks,traits:[],capabilities,interaction};
  }
  return {
    genome: publicEntry.genome,
    program: exposedProgram,
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
    exportAnatomicalCheckpoint:()=>unified.exportSavedCheckpoint(),
    materialStateAt:(age:number)=>unified.at(physicalHour(age)),
    getMaterialRuntimeStats: () => unified.evaluationStats(),
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
      const physical=unified.at(physicalHour(age)),byId=new Map(physical.graph.cells.map(c=>[c.id,c]));
      const allowed=new Set(frame.parts.filter(p=>!["eye","mouth","decoration"].includes(p.kind)).map(p=>p.id));
      const nearest=frame.parts.filter(p=>allowed.has(p.id)).flatMap(p=>p.pixels)
        .filter(p=>p.materialCellId&&((p.x-from.x)**2+(p.y-from.y)**2<=9))
        .sort((a,b)=>(a.x-from.x)**2+(a.y-from.y)**2-((b.x-from.x)**2+(b.y-from.y)**2)||compareText(a.materialCellId!,b.materialCellId!))[0];
      const cell=nearest?.materialCellId?byId.get(nearest.materialCellId):undefined;
      const root=cell?.sourceIds.map(id=>physical.graph.sourceCells.find(c=>c.id===id)).find(Boolean);
      const sourceId=root&&physical.graph.tissues.find(t=>t.id===root.tissueId)?.sourcePartId;
      if(!root||!sourceId)return null;
      const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
      return {tick:Math.round(frame.developmentalAge*86400000)/3600000,sourceId,
        materialAnchor:{x:root.x,y:root.y},direction:{x:dx/length,y:dy/length},
        strength:clamp(length/12,0.1,1)};
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

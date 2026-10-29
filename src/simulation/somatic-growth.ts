/** IMPORTED LEGACY SOMATIC/POSE MATHEMATICS. Retained for compatibility
 * with existing derived displays. Do not restore this module's continuous
 * projected silhouettes as physical material, and do not infer anatomical
 * kinds from geometric shape. Canonical physical growth: daily-step.ts. */
import {
  geneRandom,
  SOMATIC_GROWTH_VERSION,
  type InheritedGenome,
} from "./genome";
import { clamp, type Point, type PartKind } from "./model";
import type { SourceAtlas } from "./source-atlas";
import type { Tissue } from "./material";
import type {
  LiveDevelopmentContext,
  LineageTraitModifiers,
} from "../lineage/types";
import type {
  GeneticProgram,
  MaterialWarp,
  Region,
  ResolvedDevelopment,
} from "./development";
import type { WellbeingState, NeedMorphologySignals } from "../needs";
import { compileMorphogenesis } from "./morphogenesis";

type Goal = Readonly<{
  size: number;
  aspect: number;
  rounding: number;
  curvature: number;
  spacing: number;
  faceScale: number;
  faceLift: number;
  superellipsePower: number;
}>;
export type SomaticGrowthGenes = Readonly<{
  version: typeof SOMATIC_GROWTH_VERSION;
  enabled: boolean;
  stages: readonly Goal[];
}>;
export type SomaticTransport = Readonly<{
  center: Point;
  sourceSpan: Point;
  radius: number;
  profile: readonly number[];
  targetAreaScale: number;
  goal: Goal;
}>;
const identity: Goal = {
  size: 1,
  aspect: 1,
  rounding: 0,
  curvature: 0,
  spacing: 1,
  faceScale: 1,
  faceLift: 0,
  superellipsePower: 2,
};
const smooth = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const blend = (a: Goal, b: Goal, t: number): Goal =>
  Object.fromEntries(
    Object.keys(identity).map((key) => [
      key,
      a[key as keyof Goal] + (b[key as keyof Goal] - a[key as keyof Goal]) * t,
    ]),
  ) as Goal;

/** Potentials contain no source descriptors, names, care, target images or future stage identifiers. */
export function compileSomaticGrowth(
  genome: InheritedGenome,
): SomaticGrowthGenes {
  const r = (key: string) =>
    geneRandom(genome.fingerprint, `${SOMATIC_GROWTH_VERSION}/${key}`);
  return {
    version: SOMATIC_GROWTH_VERSION,
    enabled: r("family") < 0.38,
    stages: [0, 1, 2, 3].map((stage) => ({
      size: 0.85 + r(`${stage}/size`) * 1.55,
      aspect: 0.68 + r(`${stage}/aspect`) * 0.88,
      rounding: 0.25 + r(`${stage}/rounding`) * 0.7,
      curvature: (r(`${stage}/curvature`) - 0.5) * 0.16,
      spacing: 0.4 + r(`${stage}/face-spacing`) * 0.95,
      faceScale: 0.8 + r(`${stage}/face-scale`) * 0.8,
      faceLift: (r(`${stage}/face-lift`) - 0.5) * 0.4,
      superellipsePower: 1.5 + r(`${stage}/superellipse-power`) * 2.5,
    })),
  };
}

/** Direct, simple body drawings use this family; complex/authored anatomy retains its ordinary resolver. */
export function somaticSource(
  atlas: SourceAtlas,
  genome: InheritedGenome,
): Tissue | null {
  if (
    genome.lifeProgram.kind !== "direct" ||
    !compileSomaticGrowth(genome).enabled
  )
    return null;
  const bodies = atlas.patches.filter((patch) => patch.kind === "body");
  if (
    bodies.length !== 1 ||
    atlas.patches.some(
      (patch) => !["body", "eye", "mouth", "decoration"].includes(patch.kind),
    )
  )
    return null;
  const body = bodies[0],
    aspect = body.width / Math.max(1, body.height);
  if (
    body.area < 8 ||
    body.area > 600 ||
    body.components !== 1 ||
    aspect < 0.55 ||
    aspect > 1.8 ||
    (body.density < 0.3 && !body.holes)
  )
    return null;
  return body.source;
}

function selectedGoal(
  genes: SomaticGrowthGenes,
  index: number,
  care = 0.5,
  training = 0,
  battle = 0,
): Goal {
  const inherited = genes.stages[index % genes.stages.length];
  return {
    ...inherited,
    size: inherited.size * (0.92 + clamp(care, 0, 1) * 0.16),
    aspect:
      inherited.aspect *
      (1 + (clamp(training, 0, 1) - clamp(battle, 0, 1)) * 0.06),
    rounding: clamp(
      inherited.rounding + (clamp(care, 0, 1) - 0.5) * 0.08,
      0,
      0.97,
    ),
  };
}
export function somaticGrowthAt(
  genes: SomaticGrowthGenes,
  age: number,
  careHours: number,
  context?: LiveDevelopmentContext,
  labCare?: (age: number) => number,
) {
  let goal = identity;
  const progress: number[] = [0, 0, 0, 0];
  if (age > 0) {
    if (context) {
      const points = [...context.stagePoints]
        .filter((point) => point.atHour > 0 && point.atHour <= careHours)
        .sort(
          (a, b) =>
            a.atHour - b.atHour || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        );
      for (const [index, point] of points.slice(0, 4).entries()) {
        progress[index] = smooth(careHours - point.atHour);
        goal = blend(
          goal,
          selectedGoal(genes, index, point.care, point.training, point.battle),
          progress[index],
        );
      }
    } else {
      const ends = [10, 30, 75, 120];
      for (let index = 0; index < ends.length; index++) {
        const start = index ? ends[index - 1] : 0;
        if (age <= start) break;
        progress[index] = smooth((age - start) / (ends[index] - start));
        goal = blend(
          goal,
          selectedGoal(genes, index, labCare?.(start) ?? 0.5),
          progress[index],
        );
      }
    }
  }
  return {
    version: SOMATIC_GROWTH_VERSION,
    goal,
    progress,
    transitionHours: 1 as const,
  };
}

const angularRadius = (profile: readonly number[], angle: number) => {
  const at =
    (((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * profile.length;
  const index = Math.floor(at),
    t = at - index;
  return (
    profile[index % profile.length] * (1 - t) +
    profile[(index + 1) % profile.length] * t
  );
};
const superellipseRadius = (angle: number, power: number) =>
  (Math.abs(Math.cos(angle)) ** power + Math.abs(Math.sin(angle)) ** power) **
  (-1 / power);
type SourceRadialGeometry = Readonly<{
  center: Readonly<Point>;
  sourceSpan: Readonly<Point>;
  radius: number;
  profile: readonly number[];
}>;
const radialGeometryCache = new Map<string, SourceRadialGeometry>();
let radialGeometryCompilations = 0,
  radialGeometryHits = 0;
export const getSomaticProfileCacheStats = () =>
  Object.freeze({
    size: radialGeometryCache.size,
    limit: 64,
    compilations: radialGeometryCompilations,
    hits: radialGeometryHits,
  });
function sourceGeometryKey(source: Tissue) {
  return JSON.stringify([
    source.bounds.x,
    source.bounds.y,
    source.bounds.width,
    source.bounds.height,
    source.cells
      .map(({ x, y }) => [x, y])
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]),
  ]);
}
/** Exact ray/occupied-cell-quad intersections measure the source contour; no image or target contour enters. */
function sourceRadialGeometry(source: Tissue): SourceRadialGeometry {
  const signature = sourceGeometryKey(source);
  const cached = radialGeometryCache.get(signature);
  if (cached) {
    radialGeometryHits++;
    radialGeometryCache.delete(signature);
    radialGeometryCache.set(signature, cached);
    return cached;
  }
  const center = {
    x: source.bounds.x + (source.bounds.width - 1) / 2,
    y: source.bounds.y + (source.bounds.height - 1) / 2,
  };
  const count = 128,
    profile = Array<number>(count).fill(0),
    tau = Math.PI * 2;
  for (let index = 0; index < count; index++) {
    const dx = Math.cos((index / count) * tau),
      dy = Math.sin((index / count) * tau);
    for (const cell of source.cells) {
      let entry = 0,
        exit = Infinity;
      for (const [direction, low, high] of [
        [dx, cell.x - 0.5 - center.x, cell.x + 0.5 - center.x],
        [dy, cell.y - 0.5 - center.y, cell.y + 0.5 - center.y],
      ]) {
        if (Math.abs(direction) < 1e-12) {
          if (low > 0 || high < 0) {
            exit = -1;
            break;
          }
        } else {
          const a = low / direction,
            b = high / direction;
          entry = Math.max(entry, Math.min(a, b));
          exit = Math.min(exit, Math.max(a, b));
        }
      }
      if (exit >= entry && exit >= 0)
        profile[index] = Math.max(profile[index], exit);
    }
  }
  const radius = Math.sqrt(
    profile.reduce((sum, value) => sum + value * value, 0) / count,
  );
  const geometry = Object.freeze({
    center: Object.freeze(center),
    sourceSpan: Object.freeze({
      x: source.bounds.width,
      y: source.bounds.height,
    }),
    radius,
    profile: Object.freeze(profile),
  });
  radialGeometryCompilations++;
  radialGeometryCache.set(signature, geometry);
  if (radialGeometryCache.size > 64)
    radialGeometryCache.delete(radialGeometryCache.keys().next().value!);
  return geometry;
}
export function somaticTransport(source: Tissue, goal: Goal): SomaticTransport {
  const geometry = sourceRadialGeometry(source);
  const count = geometry.profile.length;
  const targetAreaScale = Math.sqrt(
    Array.from(
      { length: count },
      (_, index) =>
        superellipseRadius(
          (index / count) * Math.PI * 2,
          goal.superellipsePower,
        ) ** 2,
    ).reduce((sum, value) => sum + value, 0) / count,
  );
  return {
    ...geometry,
    targetAreaScale,
    goal,
  };
}
export function transportSomaticPoint(
  transport: SomaticTransport,
  point: Point,
): Point {
  const { center, radius, profile, goal } = transport;
  const dx = point.x - center.x,
    dy = point.y - center.y;
  const theta = Math.atan2(dy, dx);
  const sourceRadius = angularRadius(profile, theta);
  const targetRadius =
    (radius * superellipseRadius(theta, goal.superellipsePower)) /
    transport.targetAreaScale;
  const radial =
    1 + (targetRadius / Math.max(0.5, sourceRadius) - 1) * goal.rounding;
  const aspect = Math.sqrt(goal.aspect);
  // A source-relative growth limit leaves space for rooted appendages without a camera-scale substitute.
  const width =
    transport.sourceSpan.x * (1 - goal.rounding) +
    ((2 * radius) / transport.targetAreaScale) * goal.rounding;
  const height =
    transport.sourceSpan.y * (1 - goal.rounding) +
    ((2 * radius) / transport.targetAreaScale) * goal.rounding;
  const size = Math.min(
    goal.size,
    35 / Math.max(1, width * aspect, height / aspect),
  );
  return {
    x: center.x + dx * radial * size * aspect,
    y:
      center.y +
      (dy * radial * size) / aspect +
      goal.curvature * radius * (dx / Math.max(1, radius)) ** 2,
  };
}

/** Keep a feature's carrier inside the current source-derived exterior, with space for its own glyph. */
export function fitSomaticCarrier(
  transport: SomaticTransport,
  desired: Point,
  margin: number,
): Point {
  const { center, profile, goal } = transport;
  const dx = desired.x - center.x,
    dy = desired.y - center.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return { ...desired };
  const aspect = Math.sqrt(goal.aspect),
    angle = Math.atan2(dy * aspect, dx / aspect);
  const sourceRadius = angularRadius(profile, angle);
  const boundary = transportSomaticPoint(transport, {
    x: center.x + Math.cos(angle) * sourceRadius,
    y: center.y + Math.sin(angle) * sourceRadius,
  });
  const available = Math.max(
    0,
    Math.hypot(boundary.x - center.x, boundary.y - center.y) - margin,
  );
  const scale = Math.min(1, available / length);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

type SourceFactory = (
  source: Tissue,
  steps: MaterialWarp[],
  role?: string,
  boundary?: readonly Point[],
) => Region;
type GeneratedFactory = (
  id: string,
  host: Region,
  kind: PartKind,
  role: string,
  anchor: Point,
  tip: Point,
  width: number,
  ready: number,
  shape?: Region["shape"],
) => Region;
export function resolveSomaticGrowth(
  program: GeneticProgram,
  source: Tissue,
  age: number,
  stateAt: (age: number) => WellbeingState,
  signalsAt: ((age: number) => NeedMorphologySignals) | undefined,
  live: { context: LiveDevelopmentContext; careHours: number } | undefined,
  biologicalAge: number | undefined,
  sourceFactory: SourceFactory,
  generatedFactory: GeneratedFactory,
  lineageTraits?: LineageTraitModifiers,
): ResolvedDevelopment {
  const genes = compileSomaticGrowth(program.genome);
  const state = somaticGrowthAt(
    genes,
    age,
    live?.careHours ?? age * 24,
    live?.context,
    (at) => {
      const needs = stateAt(at).needs;
      return (
        Object.values(needs).reduce((sum, need) => sum + need.fulfillment, 0) /
        Math.max(1, Object.keys(needs).length)
      );
    },
  );
  const wellbeing = stateAt(age),
    signals = signalsAt?.(age);
  const rest = signals?.rest.load ?? wellbeing.needDrivers.rest.load;
  const fitness =
    signals?.["physical-fitness"].opportunity ??
    wellbeing.needDrivers["physical-fitness"].opportunity;
  const guarding = wellbeing.needDrivers.safety.shortage;
  const security = wellbeing.needDrivers.security.shortage;
  const trust = wellbeing.needDrivers.trust;
  const relaxation = wellbeing.needDrivers.relaxation;
  const ageExpression = smooth(age / 10);
  const goal: Goal = {
    ...state.goal,
    size:
      state.goal.size *
      (1 - 0.1 * rest + 0.06 * fitness) ** ageExpression *
      (1 +
        ((lineageTraits?.widening ?? 1) +
          (lineageTraits?.elongation ?? 1) -
          2) *
          0.08 *
          ageExpression),
    aspect:
      state.goal.aspect *
      (1 +
        (clamp(
          Math.sqrt(
            (lineageTraits?.widening ?? 1) /
              Math.max(0.1, lineageTraits?.elongation ?? 1),
          ),
          0.85,
          1.15,
        ) -
          1) *
          ageExpression) *
      (1 + security * 0.06 * ageExpression),
    spacing:
      state.goal.spacing *
      (1 + (trust.opportunity * 0.06 - trust.shortage * 0.12) * ageExpression),
    curvature:
      state.goal.curvature *
        (1 - relaxation.opportunity * 0.2 * ageExpression) +
      (guarding * 0.06 + relaxation.shortage * 0.04) * ageExpression,
  };
  const transport = somaticTransport(source, goal);
  const step: MaterialWarp = {
    origin: transport.center,
    target: transport.center,
    scale: { x: 1, y: 1 },
    angle: 0,
    span: { x: source.bounds.width / 2, y: source.bounds.height / 2 },
    bend: 0,
    waist: 0,
    wave: 0,
    phase: 0,
    somatic: transport,
  };
  const face = program.atlas.patches.filter(
    (patch) => patch.kind === "eye" || patch.kind === "mouth",
  );
  const faceCenter = face.length
    ? {
        x: face.reduce((sum, patch) => sum + patch.center.x, 0) / face.length,
        y: face.reduce((sum, patch) => sum + patch.center.y, 0) / face.length,
      }
    : transport.center;
  const mappedFace = transportSomaticPoint(transport, faceCenter);
  const regions = program.atlas.patches.map((patch) => {
    let steps = [step];
    if (patch.kind === "eye" || patch.kind === "mouth") {
      const mapped = transportSomaticPoint(transport, patch.center);
      const carrier: MaterialWarp = {
        ...step,
        somatic: undefined,
        origin: patch.center,
        target: {
          x: mappedFace.x + (mapped.x - mappedFace.x) * goal.spacing,
          y:
            mappedFace.y +
            (mapped.y - mappedFace.y) * Math.sqrt(goal.spacing) +
            goal.faceLift * transport.radius * goal.size,
        },
        scale: {
          x: goal.faceScale,
          y:
            patch.kind === "mouth" ? Math.sqrt(goal.faceScale) : goal.faceScale,
        },
      };
      const fitted = fitSomaticCarrier(
        transport,
        carrier.target,
        Math.hypot(
          patch.width * carrier.scale.x,
          patch.height * carrier.scale.y,
        ) /
          2 +
          0.7,
      );
      carrier.target = {
        x: carrier.target.x + (fitted.x - carrier.target.x) * state.progress[0],
        y: carrier.target.y + (fitted.y - carrier.target.y) * state.progress[0],
      };
      steps = [carrier];
    }
    return sourceFactory(
      patch.source,
      steps,
      patch.kind === "body" ? "trunk" : patch.kind,
      patch.boundary,
    );
  });
  const body = regions.find((region) => region.source === source)!;
  const nearest = (point: Point) =>
    source.cells.reduce(
      (best, cell) =>
        Math.hypot(cell.x - point.x, cell.y - point.y) <
        Math.hypot(best.x - point.x, best.y - point.y)
          ? cell
          : best,
      source.cells[0],
    );
  const inheritedBuds = compileMorphogenesis(program.genome).buds;
  for (const bud of inheritedBuds) {
    if (!bud.enabled || (bud.family === "support" && program.genome.limbless))
      continue;
    const stage = Math.min(
      3,
      bud.stage + (["support", "manipulator"].includes(bud.family) ? 1 : 0),
    );
    const ready = state.progress[stage];
    if (ready <= 0) continue;
    const sides =
      bud.family === "tail" || bud.family === "crest" ? [0] : [-1, 1];
    for (
      let pair = 0;
      pair < (bud.family === "support" ? bud.pairs : 1);
      pair++
    )
      for (const side of sides) {
        const upper = ["horn", "ear", "crest"].includes(bud.family),
          lower = bud.family === "support";
        const desired = {
          x:
            transport.center.x +
            (lower
              ? side * source.bounds.width * (0.18 + pair * 0.12)
              : upper
                ? side * source.bounds.width * 0.24
                : (side || -1) * source.bounds.width * 0.48),
          y:
            transport.center.y +
            source.bounds.height * (upper ? -0.45 : lower ? 0.45 : 0.12),
        };
        const root = transportSomaticPoint(transport, nearest(desired));
        const length =
          Math.min(8, Math.max(1, source.bounds.height * 0.34) * bud.length) *
          ready;
        const direction = upper
          ? { x: side * 0.22, y: -1 }
          : lower
            ? { x: side * 0.12, y: 1 }
            : { x: side || -1, y: bud.bend };
        const tip = {
          x: root.x + direction.x * length,
          y: root.y + direction.y * length,
        };
        const kind: PartKind = lower
          ? "leg"
          : bud.family === "manipulator"
            ? "arm"
            : bud.family === "crest"
              ? "horn"
              : bud.family;
        const id = `bud/${bud.family}/${pair}/${side}`,
          width =
            Math.min(
              1.8,
              Math.max(0.5, source.bounds.width * 0.055) * bud.thickness,
            ) * ready;
        const region = generatedFactory(
          id,
          body,
          kind,
          bud.family,
          root,
          tip,
          width,
          ready,
          bud.family === "ear" ? "membrane" : "limb",
        );
        regions.push(region);
        if (lower || bud.family === "manipulator") {
          const terminal = generatedFactory(
            `${id}/terminal`,
            region,
            lower ? "foot" : "hand",
            bud.family,
            tip,
            tip,
            width * 1.3,
            ready,
            "ellipse",
          );
          terminal.ry = Math.max(0.15, width * 0.6);
          regions.push(terminal);
        }
      }
  }
  const senescence =
    1 - 1 / (1 + Math.max(0, (biologicalAge ?? age) - 120) / 720);
  const preferred = regions.some(
    (region) => region.kind === "leg" && region.readiness > 0.65,
  )
    ? "biped"
    : "float";
  return {
    regions,
    facialWindows: [],
    preferred,
    protection: wellbeing.development.protection,
    vigor: wellbeing.development.vigor,
    recovery: wellbeing.development.recovery,
    expression: {
      paceFactor: 1 - guarding * 0.2 - security * 0.08,
      motionFactor: 1 - rest * 0.2 - relaxation.shortage * 0.12,
    },
    aging: {
      senescence,
      paceFactor: 1 - senescence * 0.72,
      motionFactor: 1 - senescence * 0.62,
      remodelingRate: 1 / (90 + Math.max(0, age - 120)),
    },
    state: {
      developmentalAge: age,
      transitionId: `somatic/${state.progress.filter((progress) => progress > 0).length}`,
      progress: Math.max(
        0,
        ...state.progress.filter((progress) => progress < 1),
      ),
      bodyPlanId:
        age === 0 ? "authored" : `somatic/${program.genome.fingerprint}`,
      controllerFamily: preferred,
      commitments: state.progress.flatMap((progress, index) =>
        progress > 0
          ? [
              {
                id: `somatic/${index}`,
                tick: live
                  ? Math.round(
                      live.context.stagePoints.filter(
                        (point) => point.atHour > 0,
                      )[index].atHour,
                    )
                  : [0, 10, 30, 75][index] * 24,
                option: "source-relative-ovoid",
              },
            ]
          : [],
      ),
      operations: state.progress.flatMap((progress, index) =>
        progress > 0 && progress < 1
          ? [{ id: `somatic/${index}`, kind: "material-transport", progress }]
          : [],
      ),
      anatomy: regions.map((region) => ({
        id: region.id,
        role: region.role,
        sourcePartIds: [...region.sourceIds],
        readiness: region.readiness,
      })),
      diagnostics: {
        somaticGrowth: {
          ...state,
          eligible: true,
          inheritedFamily: genes.enabled,
          inheritedLifeProgram: program.genome.lifeProgram.kind,
          sourceId: source.id,
          sourceRelativeGoal: goal,
          radius: transport.radius,
        },
        sourceDescriptors: program.atlas.descriptors,
        sourceFingerprint: program.sourceFingerprint,
        geneticFingerprint: program.fingerprint,
      },
    },
  };
}

import { clamp, type Point } from "./model";
import { geneRandom, type InheritedGenome } from "./genome";
import { compileMorphogenesis } from "./morphogenesis";
import { ADAPTATION_RULES, appliedCareSensitivity } from "./adaptation-rules";
import type { LineageTraitModifiers } from "../lineage/types";
import {
  sourceCenterlineU,
  transportRegionalPoint,
  type FaceIsland,
  type SourceAtlas,
  type SourcePatch,
} from "./source-atlas";

export type RegionalAxisConfiguration =
  "axial" | "stacked" | "folded" | "radial" | "clustered";
export type RegionalFunctionalStrategy =
  "four-support" | "rear-support" | "spring-support" | "coil" | "drift";
export type RegionalCareSignals = Partial<
  Record<
    | "safety"
    | "security"
    | "trust"
    | "rest"
    | "relaxation"
    | "physical-fitness",
    { load: number; opportunity: number }
  >
>;
export type RegionalSourceFrame = {
  origin: Point;
  axis: Point;
  normal: Point;
  min: number;
  max: number;
  centerline: Point[];
};
export type RegionalSourceDomain = {
  id: string;
  sourceId: string;
  uMin: number;
  uMax: number;
  sourceCenter: Point;
  sourceRadius: Point;
  sourceArea: number;
  role: "chest" | "abdomen" | "pelvis" | "anterior" | "middle" | "posterior";
};
export type RegionalMassFrame = RegionalSourceDomain & {
  center: Point;
  radius: Point;
  /** World rotation relative to the program's common source axis; exactly zero at birth. */
  angle: number;
  roundness?: number;
  massShare: number;
};
/** An authored patch of facial skin may become a distinct cranial mass. It is
 * material from the drawing, not a generated head or an inherited body plan. */
export type RegionalCraniumSource = {
  id: string;
  faceId: string;
  sourceCenter: Point;
  sourceRadius: Point;
  outward: Point;
  hostDomainId: string;
};
export type RegionalCraniumFrame = RegionalCraniumSource & {
  center: Point;
  radius: Point;
  angle: number;
  sourceAnchor: Point;
  targetAnchor: Point;
  activation: number;
};
export type RegionalPort = {
  id: string;
  sourceId: string;
  sourcePoint: Point;
  targetPoint: Point;
  domainId: string;
  angle: number;
  kind: "head" | "support" | "appendage" | "face";
  role: string;
  supportWeight: number;
  manipulationWeight: number;
  /** Minimum readable head volume, not permission to scale facial landmarks independently. */
  minimumRadius?: number;
  maximumNeckLength?: number;
};
type SourcePort = Omit<
  RegionalPort,
  "targetPoint" | "domainId" | "angle" | "supportWeight" | "manipulationWeight"
> & {
  u: number;
  fore: boolean;
};
export type RegionalStageGenes = {
  axis: number;
  balance: number;
  function: number;
  spread: number;
  depth: number;
  shear: number;
};
export type RegionalStage = {
  age: 30 | 75 | 120;
  windows: [number, number, number];
  /** Hour-quantized activation days, matching the developmental operation clock. */
  operationStarts: [number, number, number];
  axisConfiguration: RegionalAxisConfiguration;
  functionalStrategy: RegionalFunctionalStrategy;
  massBalance: number[];
  spread: number;
  depth: number;
  shear: number;
};
export type RegionalLayoutProgram = {
  version: 1;
  sourceRetention: number;
  sourceHash: string;
  genomeFingerprint: string;
  protectionPreference: InheritedGenome["protectionPreference"];
  careSensitivity: number;
  genes: { chirality: -1 | 1; stages: RegionalStageGenes[] };
  source: null | {
    id: string;
    frame: RegionalSourceFrame;
    domains: RegionalSourceDomain[];
    center: Point;
    size: number;
    frontAtHighU: boolean;
    headSourceIds: string[];
    ports: SourcePort[];
    holes: number;
    aspect: number;
    density: number;
    widthProfile: number[];
    cranium?: RegionalCraniumSource;
  };
  eligibility: {
    supported: boolean;
    limbless: boolean;
    supportCount: number;
    ring: boolean;
  };
  stages: RegionalStage[];
};
export type RegionalLayout = {
  sourceId: string | null;
  sourceFrame: RegionalSourceFrame | null;
  age: number;
  stage: number;
  progress: number;
  axisProgress: number;
  massProgress: number;
  contourProgress: number;
  expression: number;
  axisConfiguration: RegionalAxisConfiguration | "authored";
  functionalStrategy: RegionalFunctionalStrategy;
  domains: RegionalMassFrame[];
  connections: {
    fromDomainId: string;
    toDomainId: string;
    from: Point;
    to: Point;
    radius: number;
    expression: number;
  }[];
  ports: Record<string, RegionalPort>;
  cranium?: RegionalCraniumFrame;
  negativeSpace: { preserveAuthored: true; openCenter: boolean };
};

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const pointMix = (a: Point, b: Point, t: number): Point => ({
  x: mix(a.x, b.x, t),
  y: mix(a.y, b.y, t),
});
const smooth = (n: number) => {
  const t = clamp(n, 0, 1);
  return t * t * (3 - 2 * t);
};
const delta = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const angleMix = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const area = (r: Point) => r.x * r.y;

function project(frame: RegionalSourceFrame, p: Point): number {
  const line = frame.centerline;
  if (line.length < 2)
    return clamp(
      (dot(delta(p, frame.origin), frame.axis) - frame.min) /
        Math.max(1e-8, frame.max - frame.min),
      0,
      1,
    );
  return sourceCenterlineU(line, p);
}

/** The exact material classifier shared by the planner and mask partitioner. */
export function sourceUAt(
  program: RegionalLayoutProgram,
  point: Point,
): number {
  return program.source ? project(program.source.frame, point) : 0;
}

export function sourceDomainAt(
  program: RegionalLayoutProgram,
  point: Point,
): RegionalSourceDomain | undefined {
  const u = sourceUAt(program, point),
    domains = program.source?.domains ?? [];
  return domains.find(
    (domain, i) =>
      u >= domain.uMin && (u < domain.uMax || i === domains.length - 1),
  );
}

function makeFrame(patch: SourcePatch): RegionalSourceFrame {
  const first = patch.centerline[0],
    last = patch.centerline[patch.centerline.length - 1];
  const direction =
    first && last
      ? delta(last, first)
      : { x: patch.axisWeight, y: 1 - patch.axisWeight };
  const length = Math.hypot(direction.x, direction.y);
  const axis =
    length > 1e-8
      ? { x: direction.x / length, y: direction.y / length }
      : { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const normal = { x: -axis.y, y: axis.x };
  const values = patch.source.cells.map((p) =>
    dot(delta(p, patch.center), axis),
  );
  return {
    origin: { ...patch.center },
    axis,
    normal,
    min: Math.min(...values),
    max: Math.max(...values),
    centerline: patch.centerline.map((p) => ({ ...p })),
  };
}

function selectBody(atlas: SourceAtlas): SourcePatch | null {
  const bodies = atlas.patches.filter(
    (p) => (p.kind === "body" || p.kind === "egg") && p.source.cells.length,
  );
  return (
    [...bodies].sort(
      (a, b) =>
        b.area - a.area ||
        a.center.x - b.center.x ||
        a.center.y - b.center.y ||
        a.width - b.width ||
        a.height - b.height,
    )[0] ?? null
  );
}

function sourceDomains(
  patch: SourcePatch,
  frame: RegionalSourceFrame,
  frontAtHighU: boolean,
  supported: boolean,
): RegionalSourceDomain[] {
  const count = patch.area >= 9 ? 3 : patch.area >= 2 ? 2 : 1;
  return Array.from({ length: count }, (_, i) => {
    const uMin = i / count,
      uMax = (i + 1) / count;
    const cells = patch.source.cells.filter((p) => {
      const u = project(frame, p);
      return u >= uMin && (u < uMax || i === count - 1);
    });
    const along = cells.map((p) => dot(delta(p, frame.origin), frame.axis));
    const across = cells.map((p) => dot(delta(p, frame.origin), frame.normal));
    const fallbackAlong = mix(frame.min, frame.max, (uMin + uMax) / 2);
    const lo = cells.length ? Math.min(...along) : fallbackAlong,
      hi = cells.length ? Math.max(...along) : fallbackAlong;
    const left = cells.length ? Math.min(...across) : -0.5,
      right = cells.length ? Math.max(...across) : 0.5;
    const c = mix(lo, hi, 0.5),
      n = mix(left, right, 0.5);
    const front = frontAtHighU ? i === count - 1 : i === 0;
    const rear = frontAtHighU ? i === 0 : i === count - 1;
    return {
      id: `${patch.id}/domain${i}`,
      sourceId: patch.id,
      uMin,
      uMax,
      sourceCenter: {
        x: frame.origin.x + frame.axis.x * c + frame.normal.x * n,
        y: frame.origin.y + frame.axis.y * c + frame.normal.y * n,
      },
      sourceRadius: {
        x: Math.max(0.5, (hi - lo + 1) / 2),
        y: Math.max(0.5, (right - left + 1) / 2),
      },
      sourceArea: cells.length,
      role: supported
        ? front
          ? "chest"
          : rear
            ? "pelvis"
            : "abdomen"
        : front
          ? "anterior"
          : rear
            ? "posterior"
            : "middle",
    };
  });
}

function sourceCranium(
  faces: readonly FaceIsland[],
  patch: SourcePatch,
  frame: RegionalSourceFrame,
  domains: RegionalSourceDomain[],
): RegionalCraniumSource | undefined {
  const face = faces.find(
    (candidate) =>
      candidate.hostId === patch.id && candidate.material?.cells.length,
  );
  if (!face?.material) return undefined;
  const material = face.material,
    u = project(frame, material.center);
  const domain = domains.find(
    (d, i) => u >= d.uMin && (u < d.uMax || i === domains.length - 1),
  );
  if (!domain) return undefined;
  const radii = material.cells.reduce(
    (radius, p) => {
      const relative = delta(p, material.center);
      return {
        x: Math.max(radius.x, Math.abs(dot(relative, frame.axis)) + 0.5),
        y: Math.max(radius.y, Math.abs(dot(relative, frame.normal)) + 0.5),
      };
    },
    { x: 0.5, y: 0.5 },
  );
  const length = Math.hypot(material.outward.x, material.outward.y);
  const outward =
    length > 1e-8
      ? { x: material.outward.x / length, y: material.outward.y / length }
      : { ...frame.normal };
  return {
    id: `${patch.id}/cranium`,
    faceId: face.id,
    sourceCenter: { ...material.center },
    sourceRadius: radii,
    outward,
    hostDomainId: domain.id,
  };
}

/** Inherited operator controls use seed channels only; source geometry constrains their expression. */
export function compileRegionalLayout(
  atlas: SourceAtlas,
  genome: InheritedGenome,
): RegionalLayoutProgram {
  const r = (key: string) =>
    geneRandom(genome.fingerprint, `regional-layout/${key}`);
  // A simple uncommitted body can retain its infant envelope. Authored heads
  // and load-bearing supports already declare regional commitments to develop.
  const sourceRetention =
    atlas.descriptors.headCount === 0 && atlas.descriptors.supportCount === 0
      ? compileMorphogenesis(genome).sourceRetention
      : 0;
  const genes = {
    chirality: r("chirality") < 0.5 ? (-1 as const) : (1 as const),
    stages: [0, 1, 2].map((i) => ({
      axis: r(`${i}/axis`),
      balance: r(`${i}/balance`),
      function: r(`${i}/function`),
      spread: r(`${i}/spread`),
      depth: r(`${i}/depth`),
      shear: r(`${i}/shear`),
    })),
  };
  const patch = selectBody(atlas);
  const attached = patch
    ? atlas.patches.filter(
        (p) => p.id !== patch.id && p.source.parentId === patch.id,
      )
    : [];
  const supportCount = attached.filter(
    (p) => p.kind === "leg" && p.source.relationship !== "floating",
  ).length;
  const supported = supportCount > 0;
  const ring =
    !supported &&
    !!patch &&
    (patch.holes > 0 ||
      patch.width / Math.max(1, patch.height) > 1.8 ||
      patch.height / Math.max(1, patch.width) > 1.8);
  const configurations: RegionalAxisConfiguration[] = supported
    ? ["axial", "stacked", "folded", "clustered"]
    : ring
      ? ["axial", "radial", "stacked", "clustered"]
      : ["clustered", "stacked", "folded", "axial"];
  const base = Math.floor(genes.stages[0].axis * configurations.length);
  const stride = r("axis-stride") < 0.5 ? 1 : 3;
  const balanceOffset = Math.floor(r("balance-offset") * 3);
  const stages: RegionalStage[] = genes.stages.map((g, i) => {
    const axisConfiguration =
      configurations[(base + i * stride) % configurations.length];
    const functionalStrategy: RegionalFunctionalStrategy = !supported
      ? ring
        ? "coil"
        : "drift"
      : axisConfiguration === "stacked"
        ? "rear-support"
        : axisConfiguration === "clustered" ||
            (supportCount === 2 && g.function > 0.45)
          ? "spring-support"
          : "four-support";
    // Differential allocation rotates among stable material domains, rather than uniformly inflating the pet.
    const heavy = (balanceOffset + i) % 3;
    const massBalance = [0, 1, 2].map((index) =>
      index === heavy
        ? 1.7 + g.balance * 0.25
        : index === (heavy + 1) % 3
          ? 0.65 + g.balance * 0.08
          : 1.02 + g.balance * 0.1,
    );
    return {
      age: [30, 75, 120][i] as 30 | 75 | 120,
      windows: [...genome.stages[i].windows] as [number, number, number],
      operationStarts: genome.stages[i].windows.map(
        (window) =>
          Math.round(
            (genome.stages[i].start +
              (genome.stages[i].end - genome.stages[i].start) * window) *
              24,
          ) / 24,
      ) as [number, number, number],
      axisConfiguration,
      functionalStrategy,
      massBalance,
      spread: 0.85 + g.spread * 0.3,
      depth: 0.8 + g.depth * 0.4,
      shear: (g.shear - 0.5) * 0.5,
    };
  });
  if (!patch)
    return {
      version: 1,
      sourceRetention,
      sourceHash: atlas.geometryHash,
      genomeFingerprint: genome.fingerprint,
      protectionPreference: genome.protectionPreference,
      careSensitivity: appliedCareSensitivity(genome.sensitivity),
      genes,
      source: null,
      eligibility: {
        supported: false,
        limbless: true,
        supportCount: 0,
        ring: false,
      },
      stages,
    };
  const frame = makeFrame(patch);
  const heads = attached.filter((p) => p.kind === "head");
  const headAverage = heads.length
    ? heads.reduce(
        (sum, p) => ({
          x: sum.x + p.center.x / heads.length,
          y: sum.y + p.center.y / heads.length,
        }),
        { x: 0, y: 0 },
      )
    : null;
  const frontAtHighU = headAverage
    ? dot(delta(headAverage, patch.center), frame.axis) >= 0
    : true;
  const ports: SourcePort[] = attached
    .filter((p) => !["eye", "mouth", "decoration", "hair"].includes(p.kind))
    .map((p) => {
      const sourcePoint = { ...p.source.pivot },
        u = project(frame, sourcePoint);
      const fore = frontAtHighU ? u >= 0.5 : u < 0.5;
      return {
        id: p.id,
        sourceId: p.id,
        sourcePoint,
        u,
        fore,
        kind:
          p.kind === "head"
            ? "head"
            : p.kind === "leg"
              ? "support"
              : "appendage",
        role:
          p.kind === "head"
            ? "head"
            : p.kind === "leg"
              ? fore
                ? "fore"
                : "hind"
              : p.kind,
        ...(p.kind === "head"
          ? {
              minimumRadius: Math.max(
                1.5,
                Math.min(p.width, p.height) * 0.38,
                clamp(Math.sqrt(patch.width * patch.height) / 2.3, 1, 5.5) *
                  0.48,
              ),
              maximumNeckLength: Math.max(
                1.25,
                Math.min(p.width, p.height) * 0.3,
              ),
            }
          : {}),
      };
    });
  for (const face of atlas.faceIslands.filter(
    (f) => f.hostId === patch.id || !f.hostId,
  ))
    ports.push({
      id: face.id,
      sourceId: face.sourceIds[0] ?? patch.id,
      sourcePoint: { ...face.carrierPoint },
      u: project(frame, face.carrierPoint),
      fore: true,
      kind: "face",
      role: "face",
      minimumRadius: Math.max(1.5, face.radius),
      maximumNeckLength: 0,
    });
  const domains = sourceDomains(patch, frame, frontAtHighU, supported);
  const cranium = sourceCranium(atlas.faceIslands, patch, frame, domains);
  return {
    version: 1,
    sourceRetention,
    sourceHash: atlas.geometryHash,
    genomeFingerprint: genome.fingerprint,
    protectionPreference: genome.protectionPreference,
    careSensitivity: appliedCareSensitivity(genome.sensitivity),
    genes,
    source: {
      id: patch.id,
      frame,
      domains,
      center: { ...patch.center },
      size: clamp(Math.sqrt(patch.width * patch.height) / 2.3, 1, 5.5),
      frontAtHighU,
      headSourceIds: heads.map((p) => p.id),
      ports,
      holes: patch.holes,
      aspect: patch.width / Math.max(1, patch.height),
      density: patch.density,
      widthProfile: [...patch.widthProfile],
      ...(cranium ? { cranium } : {}),
    },
    eligibility: { supported, limbless: !supported, supportCount, ring },
    stages,
  };
}

function sourceMass(domain: RegionalSourceDomain): RegionalMassFrame {
  return {
    ...domain,
    sourceCenter: { ...domain.sourceCenter },
    sourceRadius: { ...domain.sourceRadius },
    center: { ...domain.sourceCenter },
    radius: { ...domain.sourceRadius },
    angle: 0,
    massShare: area(domain.sourceRadius),
  };
}

function projectedRadius(
  program: RegionalLayoutProgram,
  mass: RegionalMassFrame,
  direction: Point,
  sourceBand = 0,
): number {
  const sourceAxis = program.source!.frame.axis,
    c = Math.cos(mass.angle),
    s = Math.sin(mass.angle);
  const axis = {
    x: sourceAxis.x * c - sourceAxis.y * s,
    y: sourceAxis.x * s + sourceAxis.y * c,
  };
  const normal = { x: -axis.y, y: axis.x };
  return Math.hypot(
    dot(direction, axis) *
      mass.radius.x *
      (1 + sourceBand / mass.sourceRadius.x),
    dot(direction, normal) *
      mass.radius.y *
      (1 + sourceBand / mass.sourceRadius.y),
  );
}

/** Keep substantial source regions visible instead of nesting them inside the largest cage. */
function exposeMasses(
  program: RegionalLayoutProgram,
  masses: RegionalMassFrame[],
  configuration: RegionalAxisConfiguration,
  age: number,
): RegionalMassFrame[] {
  // Neutral renderer skin grows in original material units before cage transport.
  const sourceBand = smooth(age / 120);
  const total = masses.reduce((sum, mass) => sum + mass.massShare, 0);
  const centroid = () =>
    masses.reduce(
      (sum, mass) => ({
        x: sum.x + (mass.center.x * mass.massShare) / total,
        y: sum.y + (mass.center.y * mass.massShare) / total,
      }),
      { x: 0, y: 0 },
    );
  const originalCenter = centroid();
  if (
    (configuration === "folded" || configuration === "clustered") &&
    masses.length === 3
  ) {
    const normal = program.source!.frame.normal;
    const ends = pointMix(masses[0].center, masses[2].center, 0.5);
    const rise = dot(delta(ends, masses[1].center), normal);
    const outer =
      (projectedRadius(program, masses[0], normal, sourceBand) +
        projectedRadius(program, masses[2], normal, sourceBand)) /
      2;
    const middle = projectedRadius(program, masses[1], normal, sourceBand);
    const visibleRise =
      configuration === "folded"
        ? middle + outer + program.source!.size
        : 0.95 * (middle + outer);
    const extra = Math.max(0, visibleRise - rise);
    masses[1].center.x -= normal.x * extra;
    masses[1].center.y -= normal.y * extra;
  }
  const sourceAspect = Math.abs(
    Math.log(Math.max(0.1, program.source!.aspect)),
  );
  const separation =
    (
      {
        axial: 0.96,
        stacked: 0.86,
        clustered: 0.86,
        folded: 0.9,
        radial: 0.88,
      } as const
    )[configuration] +
    Math.min(1, sourceAspect) * 0.015;
  // Fixed bounded relaxation; geometry, not source IDs or array-dependent random draws, sets direction.
  for (let pass = 0; pass < 16; pass++)
    for (let i = 0; i < masses.length; i++)
      for (let j = i + 1; j < masses.length; j++) {
        const a = masses[i],
          b = masses[j];
        const d = delta(b.center, a.center),
          distance = Math.hypot(d.x, d.y);
        const direction =
          distance > 1e-8
            ? { x: d.x / distance, y: d.y / distance }
            : program.source!.frame.axis;
        const ra = projectedRadius(program, a, direction, sourceBand),
          rb = projectedRadius(program, b, direction, sourceBand);
        const minimum = Math.max(
          (configuration === "folded" && j - i > 1 ? 1.08 : separation) *
            (ra + rb),
          Math.abs(ra - rb) + Math.min(ra, rb) * 0.4,
        );
        const push = Math.max(0, minimum - distance) / 2;
        a.center.x -= direction.x * push;
        a.center.y -= direction.y * push;
        b.center.x += direction.x * push;
        b.center.y += direction.y * push;
      }
  const shifted = centroid();
  for (const mass of masses) {
    mass.center.x += originalCenter.x - shifted.x;
    mass.center.y += originalCenter.y - shifted.y;
  }
  return masses;
}

function stageMasses(
  program: RegionalLayoutProgram,
  stage: number,
): RegionalMassFrame[] {
  const source = program.source!;
  const plan = program.stages[stage],
    n = source.domains.length;
  if (n < 2) {
    const domain = source.domains[0],
      genes = program.genes.stages[stage];
    const radius = {
      x: 1.4 + stage * 0.4 + genes.spread * 0.5,
      y: 1.2 + stage * 0.4 + genes.depth * 0.5,
    };
    return [
      {
        ...domain,
        center: { ...domain.sourceCenter },
        radius,
        angle: program.genes.chirality * (genes.shear - 0.5) * 0.6,
        massShare: area(radius),
      },
    ];
  }
  const weights = source.domains.map((_, i) => plan.massBalance[i]);
  const normalize = Math.sqrt(n / weights.reduce((sum, w) => sum + w * w, 0));
  const basisAngle = Math.atan2(source.frame.axis.y, source.frame.axis.x);
  const side = program.genes.chirality;
  const heading = source.frontAtHighU ? 1 : -1;
  const radius = source.size;
  const masses = source.domains.map((domain, i) => {
    const q = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const front = q * heading;
    const w = weights[i] * normalize;
    let x = q * radius * plan.spread,
      y = -Math.sin(((q + 1) * Math.PI) / 2) * radius * 0.15;
    let rx = radius * 0.94 * w,
      ry = radius * 0.75 * w,
      targetAngle = basisAngle + side * plan.shear;
    switch (plan.axisConfiguration) {
      case "stacked":
        x = side * (1 - Math.abs(q)) * radius * 0.4;
        y = -front * radius * plan.spread;
        rx = radius * 0.86 * w;
        ry = radius * 1.08 * w;
        targetAngle = -Math.PI / 2 + side * q * 0.18;
        break;
      case "folded":
        x = q * radius * 1.05 * plan.spread;
        y = -Math.sin(((q + 1) * Math.PI) / 2) * radius * plan.depth;
        rx = radius * 1.04 * w;
        ry = radius * 0.78 * w;
        targetAngle = basisAngle + side * q * 0.65;
        break;
      case "radial": {
        const angle = -Math.PI / 2 + (side * i * Math.PI * 2) / Math.max(3, n);
        x = Math.cos(angle) * radius * 1.25 * plan.spread;
        y = Math.sin(angle) * radius * 1.25 * plan.depth;
        rx = radius * 0.92 * w;
        ry = radius * 0.8 * w;
        targetAngle = angle + Math.PI / 2;
        break;
      }
      case "clustered":
        x = q * radius * 0.55 * plan.spread;
        y = (i % 2 ? -0.5 : 0.3) * radius * plan.depth;
        rx = radius * 1.15 * w;
        ry = radius * 0.92 * w;
        targetAngle = basisAngle + side * q * 0.35;
        break;
    }
    // Retain each authored region's slenderness/fullness, rather than replacing all
    // source shapes with the same circular lobes. Reciprocal factors preserve allocation.
    const authoredAspect = clamp(
      domain.sourceRadius.x / domain.sourceRadius.y,
      0.35,
      6,
    );
    const aspectInfluence = Math.pow(authoredAspect, 0.24);
    rx *= aspectInfluence;
    ry /= aspectInfluence;
    // Source orientation determines heading; stacking is explicitly upright in world space.
    const center =
      plan.axisConfiguration === "stacked"
        ? { x: source.center.x + x, y: source.center.y + y }
        : {
            x:
              source.center.x +
              source.frame.axis.x * x +
              source.frame.normal.x * y,
            y:
              source.center.y +
              source.frame.axis.y * x +
              source.frame.normal.y * y,
          };
    return {
      ...domain,
      center,
      radius: { x: rx, y: ry },
      angle: Math.atan2(
        Math.sin(targetAngle - basisAngle),
        Math.cos(targetAngle - basisAngle),
      ),
      massShare: rx * ry,
    };
  });
  return exposeMasses(program, masses, plan.axisConfiguration, plan.age);
}

function selectedDomain(
  layout: RegionalLayout,
  u: number,
): RegionalMassFrame | undefined {
  return layout.domains.find(
    (d, i) => u >= d.uMin && (u < d.uMax || i === layout.domains.length - 1),
  );
}

/** Map a source point through its persistent domain cage. Connectors close inter-cage tissue waists. */
export function mapRegionalPoint(
  program: RegionalLayoutProgram,
  layout: RegionalLayout,
  p: Point,
): Point {
  if (!program.source) return { ...p };
  const frame = program.source.frame;
  return transportRegionalPoint(
    {
      axis: frame.axis,
      normal: frame.normal,
      centerline: frame.centerline,
      cages: layout.domains,
    },
    p,
  );
}

function cranialFrame(
  program: RegionalLayoutProgram,
  layout: RegionalLayout,
): RegionalCraniumFrame | undefined {
  const source = program.source,
    cranium = source?.cranium;
  if (!source || !cranium) return undefined;
  const host = layout.domains.find((d) => d.id === cranium.hostDomainId);
  if (!host) return undefined;
  const activation = layout.expression;
  const sourceAnchor = { ...cranium.sourceCenter };
  if (activation === 0)
    return {
      ...cranium,
      center: { ...cranium.sourceCenter },
      radius: { ...cranium.sourceRadius },
      angle: 0,
      sourceAnchor,
      targetAnchor: { ...sourceAnchor },
      activation,
    };
  // The body cage already contains all applied care responses. Carry that
  // relationship without multiplying raw signals or sensitivity a second time.
  const c = Math.cos(host.angle),
    s = Math.sin(host.angle);
  const outward = {
    x: cranium.outward.x * c - cranium.outward.y * s,
    y: cranium.outward.x * s + cranium.outward.y * c,
  };
  const radius = {
    x: cranium.sourceRadius.x * (1 + activation * 0.2),
    y: cranium.sourceRadius.y * (1 + activation * 0.2),
  };
  const angle = clamp(host.angle, -Math.PI / 6, Math.PI / 6);
  const sourceAxis = source.frame.axis,
    cc = Math.cos(angle),
    ss = Math.sin(angle);
  const cranialAxis = {
    x: sourceAxis.x * cc - sourceAxis.y * ss,
    y: sourceAxis.x * ss + sourceAxis.y * cc,
  };
  const cranialNormal = { x: -cranialAxis.y, y: cranialAxis.x };
  const rayRadius = (axis: Point, normal: Point, rx: number, ry: number) =>
    1 / Math.hypot(dot(outward, axis) / rx, dot(outward, normal) / ry);
  const headRadius = rayRadius(cranialAxis, cranialNormal, radius.x, radius.y);
  const hostAxis = {
    x: sourceAxis.x * c - sourceAxis.y * s,
    y: sourceAxis.x * s + sourceAxis.y * c,
  };
  const sourceBand = smooth(layout.age / 120);
  const bodyRadius = rayRadius(
    hostAxis,
    { x: -hostAxis.y, y: hostAxis.x },
    host.radius.x * (1 + sourceBand / host.sourceRadius.x),
    host.radius.y * (1 + sourceBand / host.sourceRadius.y),
  );
  // A broad overlap keeps the cranial material joined while the rest of the
  // source body remains free to reorganize; it is not a long thin neck.
  const distance = bodyRadius + headRadius * 0.45;
  const exterior = {
    x: host.center.x + outward.x * distance,
    y: host.center.y + outward.y * distance,
  };
  const mappedSourceCenter = mapRegionalPoint(
    program,
    layout,
    cranium.sourceCenter,
  );
  const center = pointMix(mappedSourceCenter, exterior, activation);
  return {
    ...cranium,
    center,
    radius,
    angle,
    sourceAnchor,
    targetAnchor: { ...center },
    activation,
  };
}

/** Continuous cage geometry; no sprite crossfade and no access to future care or mutable RNG. */
export function regionalLayoutAt(
  program: RegionalLayoutProgram,
  rawAge: number,
  care: RegionalCareSignals = {},
  current: RegionalCareSignals = {},
  lineageTraits?: LineageTraitModifiers,
): RegionalLayout {
  const age = Math.max(0, Number.isFinite(rawAge) ? rawAge : 0);
  const stage = age < 30 ? 0 : age < 75 ? 1 : 2;
  const plan = program.stages[stage];
  const fieldProgress = (field: 0 | 1 | 2) =>
    smooth(
      (age - plan.operationStarts[field]) /
        (plan.age - plan.operationStarts[field]),
    );
  const axisProgress = fieldProgress(0),
    massProgress = fieldProgress(1),
    contourProgress = fieldProgress(2);
  const progress = axisProgress;
  const expression = smooth(
    (age - program.stages[0].operationStarts[0]) /
      (30 - program.stages[0].operationStarts[0]),
  );
  const previousPlan = stage ? program.stages[stage - 1] : null;
  const currentPlan = previousPlan && axisProgress < 0.5 ? previousPlan : plan;
  const currentFunctionPlan =
    previousPlan && massProgress < 0.5 ? previousPlan : plan;
  const source = program.source;
  const layout: RegionalLayout = {
    sourceId: source?.id ?? null,
    sourceFrame: source?.frame ?? null,
    age,
    stage,
    progress,
    axisProgress,
    massProgress,
    contourProgress,
    expression,
    axisConfiguration: expression ? currentPlan.axisConfiguration : "authored",
    functionalStrategy: currentFunctionPlan.functionalStrategy,
    domains: [],
    connections: [],
    ports: {},
    negativeSpace: {
      preserveAuthored: true,
      openCenter: currentPlan.axisConfiguration === "radial",
    },
  };
  if (!source) return layout;
  const before = stage
    ? stageMasses(program, stage - 1)
    : source.domains.map(sourceMass);
  const after = stageMasses(program, stage);
  const signal = (
    signals: RegionalCareSignals,
    id: keyof RegionalCareSignals,
    key: "load" | "opportunity",
  ) => clamp(signals[id]?.[key] ?? 0, 0, 1);
  const slow = (
    id: keyof RegionalCareSignals,
    key: "load" | "opportunity" = "load",
  ) => signal(care, id, key) * expression;
  // Fast posture is a six-hour response, not new tissue or a genetic operation.
  // Its birth fade is continuous even if a caller supplies a nonzero artificial signal at age0.
  const fastExpression = smooth(age / 0.25);
  const fast = (
    id: keyof RegionalCareSignals,
    key: "load" | "opportunity" = "load",
  ) => signal(current, id, key) * fastExpression;
  const axialSpan = Math.max(1, source.frame.max - source.frame.min + 1);
  const frontSign = source.frontAtHighU ? 1 : -1;
  const anySignals = [care, current].some((signals) =>
    Object.values(signals).some(
      (value) => value && (value.load > 0 || value.opportunity > 0),
    ),
  );
  layout.domains = source.domains.map((domain, i) => {
    const a = before[i],
      b = after[i];
    const expressionRange = 1 - program.sourceRetention;
    const center = pointMix(
      domain.sourceCenter,
      pointMix(a.center, b.center, axisProgress),
      expressionRange,
    );
    const radius = pointMix(
      domain.sourceRadius,
      pointMix(a.radius, b.radius, massProgress),
      expressionRange,
    );
    if (lineageTraits) {
      // Affinity reshapes the existing material cages. Their ports and facial
      // carriers are then resolved from these same cages below.
      radius.x *= clamp(lineageTraits.elongation, 0.75, 1.35);
      radius.y *= clamp(
        lineageTraits.widening * (1 + (lineageTraits.enclosure - 1) * 0.25),
        0.75,
        1.4,
      );
    }
    const front = source.frontAtHighU
      ? i === source.domains.length - 1
      : i === 0;
    let angle = angleMix(
      0,
      angleMix(a.angle, b.angle, axisProgress),
      expressionRange,
    );
    if (anySignals) {
      const q =
        source.domains.length > 1
          ? (i / (source.domains.length - 1)) * 2 - 1
          : 0;
      const anterior = front ? 1 : Math.abs(q) < 0.5 ? 0.3 : 0.1;
      const loadBearing =
        Math.abs(q) > 0.5 || source.domains.length === 1 ? 1 : 0.25;
      const abdominal = Math.abs(q) < 0.5 ? 1 : 0.8;
      const shift = (direction: Point, amount: number) => {
        center.x += direction.x * amount;
        center.y += direction.y * amount;
      };
      const rules = ADAPTATION_RULES;
      // Raw fulfillment/filter/memory inputs are unchanged. Scale each applied
      // coefficient once; derived compact/openness values must not be scaled again.
      const magnitude = (coefficient: number) =>
        coefficient * program.careSensitivity;

      // Rest fills/repairs cross-sections; fitness allocates tissue to existing
      // load-bearing chest/pelvis regions rather than uniformly scaling the creature.
      const rest =
        magnitude(rules.rest.slowFullnessGain) * slow("rest", "opportunity") -
        magnitude(rules.rest.slowFullnessLoss) * slow("rest");
      const fitness =
        magnitude(rules["physical-fitness"].slowLoadBearingGain) *
          slow("physical-fitness", "opportunity") -
        magnitude(rules["physical-fitness"].slowLoadBearingLoss) *
          slow("physical-fitness");
      const retainedOpenness =
        magnitude(rules.trust.slowOpenness) *
        (slow("trust", "opportunity") - slow("trust"));
      radius.x *= clamp(
        1 +
          rest * abdominal * 0.2 +
          fitness * loadBearing * 0.9 +
          magnitude(rules.security.slowBraceThickness) *
            slow("security") *
            loadBearing *
            0.25 +
          retainedOpenness * anterior * 0.5,
        0.65,
        1.55,
      );
      radius.y *= clamp(
        1 +
          rest * abdominal +
          fitness * loadBearing * 0.7 +
          magnitude(rules.safety.slowReinforcement) *
            slow("safety") *
            (0.35 + 0.65 * Math.abs(q)) +
          magnitude(rules.security.slowBraceThickness) *
            slow("security") *
            loadBearing,
        0.65,
        1.55,
      );

      // Security spreads the original material roots into a braced stance quickly;
      // thicker support tissue remains in the separate slow response above.
      shift(
        source.frame.axis,
        q *
          axialSpan *
          0.5 *
          magnitude(rules.security.fastBraceSpread) *
          fast("security"),
      );

      // Safety expresses a compatible inherited defense. It never selects a new body plan.
      const guard = fast("safety"),
        compact = magnitude(rules.safety.fastCompaction) * guard;
      const relative = delta(center, source.center);
      shift(
        source.frame.axis,
        -dot(relative, source.frame.axis) * compact * (0.6 + 0.4 * Math.abs(q)),
      );
      if (program.protectionPreference === "withdraw") {
        shift(source.frame.axis, -frontSign * axialSpan * compact * anterior);
        angle -=
          program.genes.chirality *
          magnitude(rules.safety.fastCurlRadians) *
          guard *
          anterior;
      } else if (program.protectionPreference === "reinforce") {
        shift(source.frame.normal, source.size * compact * (0.25 + anterior));
        angle +=
          program.genes.chirality *
          q *
          magnitude(rules.safety.fastCurlRadians) *
          guard *
          0.4;
      } else {
        const enclosing = program.protectionPreference === "enclose";
        shift(
          source.frame.normal,
          (q * q - 0.5) *
            source.size *
            magnitude(rules.safety.fastCurlRadians) *
            guard *
            (enclosing ? 1.5 : 1),
        );
        if (enclosing)
          shift(
            source.frame.normal,
            -dot(relative, source.frame.normal) * compact,
          );
        angle +=
          program.genes.chirality *
          q *
          magnitude(rules.safety.fastCurlRadians) *
          guard;
      }

      // Openness changes the exposed anterior relationship. The head and effectors
      // use this same current/slow split in their own material carriers.
      const openness =
        magnitude(rules.trust.positiveOpenness) * fast("trust", "opportunity") -
        magnitude(rules.trust.fastOpenness) * fast("trust");
      shift(
        source.frame.axis,
        frontSign * axialSpan * 0.5 * (openness + retainedOpenness) * anterior,
      );
      angle -= program.genes.chirality * openness * anterior * 0.35;

      // Tension bends regional relationships without creating instant body mass.
      const tension =
        magnitude(rules.relaxation.fastCurvature) * fast("relaxation") +
        magnitude(rules.relaxation.slowCurvature) * slow("relaxation");
      angle += program.genes.chirality * q * tension;
      shift(source.frame.normal, (q * q - 0.5) * source.size * tension);

      // Fatigue/recruitment changes support posture immediately; muscle and repair
      // volume still come only from the accumulated Rest/Fitness signals above.
      const fatigue =
        magnitude(rules.rest.fastSag) *
        (fast("rest") - 0.4 * fast("rest", "opportunity"));
      shift({ x: 0, y: 1 }, source.size * fatigue * (0.25 + 0.75 * anterior));
      const recruitment =
        magnitude(rules["physical-fitness"].fastRecruitment) *
        (fast("physical-fitness", "opportunity") - fast("physical-fitness"));
      shift(
        { x: 0, y: -1 },
        source.size * recruitment * loadBearing * (0.3 + 0.7 * anterior),
      );
      angle -= program.genes.chirality * q * recruitment * 0.3;
    }
    return {
      ...domain,
      center,
      radius,
      angle,
      roundness:
        expression *
        mix(
          stage
            ? clamp(
                0.45 +
                  0.1 * (1 - source.density) +
                  program.genes.stages[stage - 1].depth * 0.08,
                0.45,
                0.65,
              )
            : 0,
          clamp(
            0.45 +
              0.1 * (1 - source.density) +
              program.genes.stages[stage].depth * 0.08,
            0.45,
            0.65,
          ),
          contourProgress,
        ),
      massShare: area(radius),
    };
  });
  const links = layout.domains
    .slice(1)
    .map((domain, i) => [layout.domains[i], domain] as const);
  layout.connections = links.map(([a, b]) => ({
    fromDomainId: a.id,
    toDomainId: b.id,
    from: { ...a.center },
    to: { ...b.center },
    radius: Math.max(
      0.65,
      Math.min(a.radius.x, a.radius.y, b.radius.x, b.radius.y) * 0.78,
    ),
    expression,
  }));
  const ringExpression =
    expression *
    mix(
      previousPlan?.axisConfiguration === "radial" ? 1 : 0,
      plan.axisConfiguration === "radial" ? 1 : 0,
      axisProgress,
    );
  if (ringExpression > 0 && layout.domains.length > 2) {
    const a = layout.domains[layout.domains.length - 1],
      b = layout.domains[0];
    layout.connections.push({
      fromDomainId: a.id,
      toDomainId: b.id,
      from: { ...a.center },
      to: { ...b.center },
      radius: Math.max(
        0.65,
        Math.min(a.radius.x, a.radius.y, b.radius.x, b.radius.y) * 0.78,
      ),
      expression: ringExpression,
    });
  }
  for (const port of source.ports) {
    const owner = selectedDomain(layout, port.u) ?? layout.domains[0];
    const targetPoint = mapRegionalPoint(program, layout, port.sourcePoint);
    const previousSupport =
      port.kind !== "support"
        ? 0
        : previousPlan?.functionalStrategy === "rear-support" && port.fore
          ? 0.05
          : 1;
    const targetSupport =
      port.kind !== "support"
        ? 0
        : plan.functionalStrategy === "rear-support" && port.fore
          ? 0.05
          : 1;
    const supportWeight = mix(previousSupport, targetSupport, massProgress);
    layout.ports[port.id] = {
      id: port.id,
      sourceId: port.sourceId,
      sourcePoint: { ...port.sourcePoint },
      targetPoint,
      domainId: owner.id,
      angle: owner.angle,
      kind: port.kind,
      role: port.role,
      supportWeight,
      manipulationWeight:
        port.kind === "support" && port.fore ? 1 - supportWeight : 0,
      ...(port.minimumRadius === undefined
        ? {}
        : {
            minimumRadius: port.minimumRadius,
            maximumNeckLength: port.maximumNeckLength,
          }),
    };
  }
  const cranium = cranialFrame(program, layout);
  if (cranium) layout.cranium = cranium;
  return layout;
}

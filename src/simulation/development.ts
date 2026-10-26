import {
  clamp,
  hash,
  compareText,
  pixelPaintDepth,
  type PartKind,
  type Point,
  type DevelopmentState,
} from "./model";
import {
  bounds as materialBounds,
  center as materialCenter,
  type Tissue,
} from "./material";
import type { WellbeingState } from "../needs";
import type {
  LineageTraitModifiers,
  LiveDevelopmentContext,
} from "../lineage/types";
import {
  compileSomaticGrowth,
  somaticSource,
  transportSomaticPoint,
  resolveSomaticGrowth,
  type SomaticTransport,
  type SomaticGrowthGenes,
} from "./somatic-growth";
import type {
  GroomingBinding,
  GroomingState,
  GroomModifier,
  GroomSourceAlias,
} from "./grooming";
import {
  describeSource,
  type SourceAtlas,
  type SourcePatch,
  type FaceIsland,
  transportCenterlinePoint,
  transportRegionalPoint,
  guardMaterialVoids,
  type CenterlineTransport,
  type RegionalMaterialTransport,
} from "./source-atlas";
import { getMetamorphosisPhase } from "./metamorphosis";
import { grownMaterialCells } from "./material-growth";
import {
  compileMorphogenesis,
  facialTraitsAt,
  type MorphogenesisGenes,
} from "./morphogenesis";
import {
  ADAPTATION_RULES,
  ADAPTATION_RULES_VERSION,
  appliedCareSensitivity,
} from "./adaptation-rules";
import {
  compileRegionalLayout,
  regionalLayoutAt,
  sourceDomainAt,
  type RegionalLayoutProgram,
} from "./regional-layout";
import {
  compileGenome,
  materialGene,
  geneRandom,
  type InheritedGenome,
} from "./genome";
export { describeSource, compileGenome, materialGene };
export type { SourceAtlas, InheritedGenome };

export const q = (v: number) => Math.round(v * 256) / 256;
export const ease = (v: number) => {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const pt = (x: number, y: number): Point => ({ x: q(x), y: q(y) });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const modeled = [
  "safety",
  "security",
  "trust",
  "rest",
  "relaxation",
  "physical-fitness",
] as const;
type NeedName = (typeof modeled)[number];
type Signals = Record<NeedName, { load: number; opportunity: number }>;
export type MorphologySignals = Signals;
/** Separate clocks leave room for future biological-age rules without adding de-aging. */
export function developmentClock(rawAge: number) {
  const chronologicalAge = Math.max(0, Number.isFinite(rawAge) ? rawAge : 0);
  const remodelingAge = Math.max(0, chronologicalAge - 120);
  return {
    chronologicalAge,
    developmentalAge: chronologicalAge,
    maturationAge: Math.min(120, chronologicalAge),
    remodelingAge,
    remodelingPhase: Math.log1p(remodelingAge / 90),
    senescence: 1 - 1 / (1 + remodelingAge / 720),
  };
}

/** Each step maps material world coordinates to deformed world coordinates. */
export type MaterialWarp = {
  origin: Point;
  target: Point;
  scale: Point;
  angle: number;
  span: Point;
  bend: number;
  waist: number;
  wave: number;
  phase: number;
  rooted?: boolean;
  retraction?: { basisAngle: number; factor: number; foldAngle: number };
  centerline?: CenterlineTransport;
  regional?: RegionalMaterialTransport;
  faceVoids?: NonNullable<RegionalMaterialTransport["voids"]>;
  supportWidth?: { axis: Point; factor: number };
  carePose?: { axis: Point; length: number; angle: number };
  somatic?: SomaticTransport;
  grooming?: {
    focus: Point;
    radius: number;
    basisAngle: number;
    lengthDelta: number;
    bendRadians: number;
  };
  partition?: {
    axis: "x" | "y";
    at: number;
    gap: number;
    direction?: Point;
    classification?: Point;
  };
};
export type Region = {
  id: string;
  kind: PartKind;
  role: string;
  parentId: string | null;
  sourceIds: string[];
  center: Point;
  anchor: Point;
  tip: Point;
  rx: number;
  ry: number;
  angle: number;
  readiness: number;
  material: number;
  shape: "mask" | "ellipse" | "limb" | "membrane" | "spine";
  color: string;
  layer: number;
  source?: Tissue;
  spine?: Point[];
  hollow?: number;
  previous?: Region;
  fieldProgress?: number;
  contour?: string;
  lobes?: number;
  deform?: number;
  sourceWarp?: { steps: MaterialWarp[] };
  /** Original 64-world cell-center coordinates, half-open [min,max). */
  sourceClip?: { axis: "x" | "y"; min: number; max: number };
  sourceDomain?: {
    id: string;
    sourceId: string;
    uMin: number;
    uMax: number;
    role: string;
  };
  materialGrowth?: {
    radius: number;
    maxRadius: number;
    sourceDomainId: string;
    cavitySource?: Tissue;
  };
  lineage?: string[];
  operationId?: string;
  anchorSourcePoint?: Point;
  topologyGroup?: string;
  repurpose?: {
    targetKind: "arm" | "hand";
    progress: number;
    sourceId: string;
    originalKind: PartKind;
    stage: number;
    materialRoot?: Point;
  };
};
export type DevelopmentRule = {
  id: string;
  kind: "redistribute" | "replace" | "enclose";
  start: number;
  end: number;
  strength: number;
  hostIds: string[];
  stage: number;
};
export type GeneticProgram = {
  version: 7;
  fingerprint: string;
  sourceFingerprint: string;
  atlas: SourceAtlas;
  genome: InheritedGenome;
  morphogenesis: MorphogenesisGenes;
  somaticGrowth: SomaticGrowthGenes;
  regionalLayout: RegionalLayoutProgram;
  pace: number;
  sensitivity: number;
  protectionPreference: string;
  stages: {
    id: string;
    start: number;
    end: number;
    operations: DevelopmentRule[];
  }[];
  operators: DevelopmentRule[];
  limits: { generated: 32; bones: 64; activeOperators: 8 };
  lifeProgram: {
    kind: InheritedGenome["lifeProgram"]["kind"];
    inheritedKind: InheritedGenome["lifeProgram"]["kind"];
    sourceCompatible: boolean;
    hostIds: string[];
  };
};
export type ResolvedDevelopment = {
  regions: Region[];
  facialWindows: {
    id: string;
    hostSourceId: string | null;
    carrierRegionId: string | null;
    sourceIds: string[];
    /** Original empty source cell areas carried into structural world space. */
    quads: Point[][];
  }[];
  state: DevelopmentState;
  preferred: string;
  protection: number;
  vigor: number;
  recovery: number;
  expression: { paceFactor: number; motionFactor: number };
  aging: {
    senescence: number;
    paceFactor: number;
    motionFactor: number;
    remodelingRate: number;
  };
};
export function compileDevelopment(
  atlas: SourceAtlas,
  genome: InheritedGenome,
): GeneticProgram {
  const hostIds = atlas.patches.filter((p) => p.source.bulk).map((p) => p.id);
  const stages = genome.stages.map((s, i) => ({
    id: s.id,
    start: s.start,
    end: s.end,
    operations: (["redistribute", "replace", "enclose"] as const).map(
      (kind, j) => ({
        id: `${s.id}.${kind}`,
        kind,
        stage: i,
        strength: 1,
        hostIds,
        start:
          Math.round((s.start + (s.end - s.start) * s.windows[j]) * 24) / 24,
        end: s.end,
      }),
    ),
  }));
  return {
    version: 7,
    fingerprint: hash(
      `${genome.fingerprint}|${genome.proceduralGrammarVersion}|${genome.somaticGrowthVersion}`,
    ).toString(16),
    sourceFingerprint: atlas.geometryHash,
    atlas,
    genome,
    morphogenesis: compileMorphogenesis(genome),
    somaticGrowth: compileSomaticGrowth(genome),
    regionalLayout: compileRegionalLayout(atlas, genome),
    stages,
    operators: stages.flatMap((s) => s.operations),
    pace: genome.pace,
    sensitivity: genome.sensitivity,
    protectionPreference: genome.protectionPreference,
    limits: { generated: 32, bones: 64, activeOperators: 8 },
    lifeProgram: {
      kind: hostIds.length ? genome.lifeProgram.kind : "direct",
      inheritedKind: genome.lifeProgram.kind,
      sourceCompatible: hostIds.length > 0,
      hostIds,
    },
  };
}
function mapStep(step: MaterialWarp, p: Point, original: Point): Point {
  if (step.somatic) {
    const mapped = transportSomaticPoint(step.somatic, p);
    return pt(mapped.x, mapped.y);
  }
  if (step.faceVoids) {
    const mapped = guardMaterialVoids(step.faceVoids, original, p);
    return pt(mapped.x, mapped.y);
  }
  if (step.regional) {
    const mapped = transportRegionalPoint(step.regional, p);
    return pt(mapped.x, mapped.y);
  }
  if (step.centerline) {
    const mapped = transportCenterlinePoint(step.centerline, p);
    return pt(mapped.x, mapped.y);
  }
  const dx = p.x - step.origin.x,
    dy = p.y - step.origin.y;
  if (step.carePose) {
    const { axis, length, angle } = step.carePose,
      along = (dx * axis.x + dy * axis.y) * length,
      across = -dx * axis.y + dy * axis.x;
    const x = axis.x * along - axis.y * across,
      y = axis.y * along + axis.x * across,
      c = Math.cos(angle),
      s = Math.sin(angle);
    return pt(step.target.x + x * c - y * s, step.target.y + x * s + y * c);
  }
  if (step.supportWidth) {
    const { axis, factor } = step.supportWidth,
      along = dx * axis.x + dy * axis.y,
      across = (-dx * axis.y + dy * axis.x) * factor;
    return pt(
      step.target.x + axis.x * along - axis.y * across,
      step.target.y + axis.y * along + axis.x * across,
    );
  }
  if (step.retraction) {
    const r = step.retraction,
      c = Math.cos(r.basisAngle),
      s = Math.sin(r.basisAngle);
    const x = dx * c + dy * s,
      y = (-dx * s + dy * c) * r.factor;
    const angle = r.basisAngle + r.foldAngle,
      ca = Math.cos(angle),
      sa = Math.sin(angle);
    return pt(step.target.x + x * ca - y * sa, step.target.y + x * sa + y * ca);
  }
  if (step.grooming) {
    const g = step.grooming,
      radius = Math.max(1, g.radius);
    const weight = Math.exp(
      -((p.x - g.focus.x) ** 2 + (p.y - g.focus.y) ** 2) /
        (2 * radius * radius),
    );
    const cb = Math.cos(g.basisAngle),
      sb = Math.sin(g.basisAngle);
    const x = dx * cb + dy * sb,
      y = (-dx * sb + dy * cb) * (1 + g.lengthDelta * weight);
    const angle = g.basisAngle + g.bendRadians * weight,
      c = Math.cos(angle),
      s = Math.sin(angle);
    return pt(step.target.x + x * c - y * s, step.target.y + x * s + y * c);
  }
  const u = clamp(dx / Math.max(0.5, step.span.x), -3, 3),
    v = clamp(dy / Math.max(0.5, step.span.y), -3, 3);
  // Bounded strain: distant child landmarks must not acquire exponential cage stretch.
  const cross = (v * v) / (1 + v * v);
  const width = clamp(
    1 +
      step.waist * (cross - 0.25) +
      step.wave * (Math.cos(v * 4 + step.phase) - Math.cos(step.phase)),
    0.78,
    1.22,
  );
  let x = dx * step.scale.x * width;
  let y =
    dy * step.scale.y +
    step.bend * step.span.y * (u * u - (step.rooted ? 0 : 0.15));
  if (step.partition) {
    const classifier = step.partition.classification ?? original;
    const k = step.partition.axis === "x" ? classifier.x : classifier.y;
    const shift = (k < step.partition.at ? -0.5 : 0.5) * step.partition.gap;
    const direction =
      step.partition.direction ??
      (step.partition.axis === "x" ? { x: 1, y: 0 } : { x: 0, y: 1 });
    x += direction.x * shift;
    y += direction.y * shift;
  }
  const c = Math.cos(step.angle),
    s = Math.sin(step.angle);
  return pt(step.target.x + x * c - y * s, step.target.y + x * s + y * c);
}
function apply(
  steps: readonly MaterialWarp[],
  p: Point,
  classification = p,
): Point {
  let result = { x: p.x, y: p.y };
  for (const s of steps) result = mapStep(s, result, classification);
  return result;
}
export function mapSourcePoint(region: Region, p: Point): Point {
  const classification = { ...p },
    clip = region.sourceClip;
  if (clip)
    classification[clip.axis] = clamp(
      classification[clip.axis],
      clip.min + 0.001,
      clip.max - 0.001,
    );
  return region.sourceWarp
    ? apply(region.sourceWarp.steps, p, classification)
    : { ...p };
}
function identity(origin: Point, span: Point): MaterialWarp {
  return {
    origin: { ...origin },
    target: { ...origin },
    scale: { x: 1, y: 1 },
    angle: 0,
    span,
    bend: 0,
    waist: 0,
    wave: 0,
    phase: 0,
  };
}
/** A physical child inherits the host frame at its root, not host strain at
 * distant pixels. Its own material/growth still deforms independently. */
export function rigidMaterialCarrier(
  steps: readonly MaterialWarp[],
  origin: Point,
  span: Point,
  maxTurn?: number,
): MaterialWarp {
  const target = apply(steps, origin),
    x = apply(steps, { x: origin.x + 0.5, y: origin.y });
  const carrier = identity(origin, span);
  carrier.target = target;
  carrier.angle = Math.atan2(x.y - target.y, x.x - target.x);
  if (maxTurn !== undefined) carrier.angle = maxTurn * Math.sin(carrier.angle);
  return carrier;
}
function signals(state: WellbeingState): Signals {
  return Object.fromEntries(
    modeled.map((id) => {
      const n = state.needs[id],
        driver = state.needDrivers?.[id];
      return [
        id,
        {
          load:
            driver?.load ??
            clamp(0.55 * (1 - n.shortTerm / 0.75) + 0.45 * n.memory, 0, 1),
          opportunity:
            driver?.opportunity ?? clamp((n.shortTerm - 0.75) / 0.25, 0, 1),
        },
      ];
    }),
  ) as Signals;
}
/** Current expression uses continuous fulfillment averages, never raw dial
 * jumps or the additional days-long structural mediator. */
function currentSignals(state: WellbeingState, age: number): Signals {
  return Object.fromEntries(
    modeled.map((id) => {
      const driver = state.needDrivers?.[id],
        average = state.needs[id].shortTerm;
      return [
        id,
        {
          load:
            age <= 0 ? 0 : clamp(driver?.shortage ?? 1 - average / 0.75, 0, 1),
          opportunity:
            age <= 0 || !ADAPTATION_RULES[id].positiveStructuralResponse
              ? 0
              : clamp(driver?.opportunity ?? (average - 0.75) / 0.25, 0, 1),
        },
      ];
    }),
  ) as Signals;
}
function responseMagnitudes(input: Signals, multiplier: number): Signals {
  return Object.fromEntries(
    modeled.map((id) => [
      id,
      {
        load: input[id].load * multiplier,
        opportunity: ADAPTATION_RULES[id].positiveStructuralResponse
          ? input[id].opportunity * multiplier
          : 0,
      },
    ]),
  ) as Signals;
}
type Replay = { checkpoints: Map<number, Signals> };
const replayCaches = new WeakMap<
  GeneticProgram,
  WeakMap<(age: number) => WellbeingState, Replay>
>();
export function getDevelopmentCacheStats(
  program: GeneticProgram,
  stateAt: (age: number) => WellbeingState,
) {
  return Object.freeze({
    dailyCheckpoints:
      replayCaches.get(program)?.get(stateAt)?.checkpoints.size ?? 0,
    limit: 33,
  });
}
function contextAt(
  program: GeneticProgram,
  age: number,
  stateAt: (age: number) => WellbeingState,
  signalsAt?: (age: number) => Signals,
): Signals {
  if (signalsAt) return signalsAt(age);
  if (age > 240) {
    // Standalone callers without the needs engine's exact analytic mediator use
    // a bounded causal convolution. Production passes needs.morphologyAt.
    const prior = contextAt(program, 240, stateAt),
      elapsed = age - 240;
    return Object.fromEntries(
      modeled.map((id, index) => {
        const tau = ([4, 9, 7, 2, 3, 8][index] * 2.8) / Math.LN2;
        const oldWeight = Math.exp(-elapsed / tau),
          mass = 1 - oldWeight;
        let load = prior[id].load * oldWeight,
          opportunity = prior[id].opportunity * oldWeight;
        for (let sample = 0; sample < 24; sample++) {
          const probability = (sample + 0.5) / 24;
          const lag = -tau * Math.log1p(-probability * mass);
          const target = signals(stateAt(Math.max(240, age - lag)))[id];
          load += (target.load * mass) / 24;
          opportunity += (target.opportunity * mass) / 24;
        }
        return [id, { load, opportunity }];
      }),
    ) as Signals;
  }
  let byHistory = replayCaches.get(program);
  if (!byHistory) {
    byHistory = new WeakMap();
    replayCaches.set(program, byHistory);
  }
  let replay = byHistory.get(stateAt);
  if (!replay) {
    const zero = Object.fromEntries(
      modeled.map((id) => [id, { load: 0, opportunity: 0 }]),
    ) as Signals;
    replay = { checkpoints: new Map([[0, zero]]) };
    byHistory.set(stateAt, replay);
  }
  const tick = Math.floor(clamp(age, 0, 240) * 24 + 1e-8),
    fraction = clamp(age * 24 - tick, 0, 1);
  let start = 0;
  for (const n of replay.checkpoints.keys())
    if (n <= tick && n > start) start = n;
  let current = replay.checkpoints.get(start)!;
  const advance = (prior: Signals, n: number, dt: number): Signals => {
    // A tick's care drives the following interval, never the interval before it.
    const target = signals(stateAt(n / 24));
    const elder = ease((n / 24 - 100) / 60);
    return Object.fromEntries(
      modeled.map((id, i) => {
        const halfLife = [4, 9, 7, 2, 3, 8][i] * (1 + elder * 1.8);
        const w = 1 - Math.exp((-Math.LN2 * dt) / (halfLife * 24));
        return [
          id,
          {
            load: mix(prior[id].load, target[id].load, w),
            opportunity: mix(prior[id].opportunity, target[id].opportunity, w),
          },
        ];
      }),
    ) as Signals;
  };
  for (let n = start; n < tick; n++) {
    current = advance(current, n, 1);
    if ((n + 1) % 24 === 0) {
      replay.checkpoints.set(n + 1, current);
      while (replay.checkpoints.size > 33) {
        const oldest = Math.min(
          ...[...replay.checkpoints.keys()].filter((k) => k !== 0),
        );
        replay.checkpoints.delete(oldest);
      }
    }
  }
  return fraction > 1e-8 ? advance(current, tick, fraction) : current;
}
function materialPosition(program: GeneticProgram, patch: SourcePatch): Point {
  const b = program.atlas.bounds;
  return {
    x: (patch.center.x - program.atlas.center.x) / Math.max(4, b.width * 0.5),
    y: (patch.center.y - program.atlas.center.y) / Math.max(4, b.height * 0.5),
  };
}
function localGene(
  program: GeneticProgram,
  patch: SourcePatch,
  channel: string,
) {
  const p = materialPosition(program, patch);
  return materialGene(program.genome, `${patch.kind}/${channel}`, p.x, p.y);
}
/** Geometry determines anatomical choices; labels are only provenance. */
const patchGeometryCache = new WeakMap<SourcePatch, string>();
function patchGeometry(p: SourcePatch): string {
  let value = patchGeometryCache.get(p);
  if (value === undefined) {
    value = [...p.source.cells]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((cell) => `${cell.x},${cell.y}`)
      .join(";");
    patchGeometryCache.set(p, value);
  }
  return value;
}
const patchOrder = (a: SourcePatch, b: SourcePatch) =>
  b.area - a.area ||
  a.center.x - b.center.x ||
  a.center.y - b.center.y ||
  a.width - b.width ||
  a.height - b.height ||
  compareText(a.kind, b.kind) ||
  compareText(patchGeometry(a), patchGeometry(b));
type SourceHeadContact = { headPoint: Point; hostPoint: Point; gap: number };
const sourceHeadContacts = new WeakMap<
  Tissue,
  WeakMap<Tissue, SourceHeadContact>
>();
function sourceHeadContact(head: Tissue, host: Tissue): SourceHeadContact {
  let hosts = sourceHeadContacts.get(head);
  if (!hosts) {
    hosts = new WeakMap();
    sourceHeadContacts.set(head, hosts);
  }
  const hit = hosts.get(host);
  if (hit) return hit;
  const occupied = new Map(host.cells.map((p) => [`${p.x},${p.y}`, p]));
  const overlap = head.cells
    .filter((p) => occupied.has(`${p.x},${p.y}`))
    .sort(
      (a, b) =>
        distance(a, head.center) - distance(b, head.center) ||
        a.y - b.y ||
        a.x - b.x,
    )[0];
  let hp: Point = overlap ?? head.cells[0] ?? head.center,
    bp: Point = overlap ?? host.cells[0] ?? host.center,
    gap = overlap ? 0 : Infinity;
  if (!overlap)
    for (const a of head.cells)
      for (const b of host.cells) {
        const d = distance(a, b);
        if (
          d < gap - 1e-10 ||
          (Math.abs(d - gap) < 1e-10 &&
            distance(a, head.center) < distance(hp, head.center))
        ) {
          gap = d;
          hp = a;
          bp = b;
        }
      }
  const result = {
    headPoint: { x: hp.x, y: hp.y },
    hostPoint: { x: bp.x, y: bp.y },
    gap: Math.max(0, gap - Math.SQRT2),
  };
  hosts.set(host, result);
  return result;
}
const headAttachmentSkinCache = new WeakMap<
  SourceAtlas,
  WeakMap<Tissue, WeakMap<Tissue, Set<string>>>
>();
/** A diagonal-only skin corner behind a facial glyph is not a finite-area
 * attachment port. Follow the authored contact's edge-connected material,
 * without painting over the glyph or closing the head's negative space. */
function headAttachmentSkin(
  atlas: SourceAtlas,
  head: Tissue,
  host: Tissue,
): Set<string> {
  let heads = headAttachmentSkinCache.get(atlas);
  if (!heads) headAttachmentSkinCache.set(atlas, (heads = new WeakMap()));
  let hosts = heads.get(head);
  if (!hosts) heads.set(head, (hosts = new WeakMap()));
  const cached = hosts.get(host);
  if (cached) return cached;
  const key = (p: Point) => `${p.x},${p.y}`;
  const faceIds = new Set(
    atlas.faceIslands
      .filter((island) => island.hostId === head.id)
      .flatMap((island) => island.sourceIds),
  );
  const glyphs = new Set(
    atlas.patches
      .filter((patch) => faceIds.has(patch.id))
      .flatMap((patch) => patch.source.cells.map(key)),
  );
  const skin = head.cells.filter((cell) => !glyphs.has(key(cell)));
  const contact = sourceHeadContact(head, host).headPoint;
  const root = [...skin].sort(
    (a, b) =>
      distance(a, contact) - distance(b, contact) || a.y - b.y || a.x - b.x,
  )[0];
  const available = new Set(skin.map(key)),
    connected = new Set<string>(),
    queue: Point[] = root ? [root] : [];
  if (root) connected.add(key(root));
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (const [x, y] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const next = { x: p.x + x, y: p.y + y },
        id = key(next);
      if (available.has(id) && !connected.has(id)) {
        connected.add(id);
        queue.push(next);
      }
    }
  }
  hosts.set(host, connected);
  return connected;
}
function progress(op: DevelopmentRule, age: number) {
  return ease((age - op.start) / Math.max(0.001, op.end - op.start));
}
function protectedDescendant(atlas: SourceAtlas, host: string): boolean {
  const byId = new Map(atlas.patches.map((p) => [p.id, p]));
  return atlas.patches.some((p) => {
    if (!p.protected) return false;
    const seen = new Set<string>();
    let parent = p.source.parentId;
    while (parent && !seen.has(parent)) {
      if (parent === host) return true;
      seen.add(parent);
      parent = byId.get(parent)?.source.parentId ?? null;
    }
    return false;
  });
}
function splitCut(
  program: GeneticProgram,
  patch: SourcePatch,
): { axis: "x" | "y"; at: number } | undefined {
  if (patch.area < 10 || patch.width < 3 || patch.height < 3) return undefined;
  const axis = patch.axis,
    b = patch.source.bounds;
  const marks = program.atlas.patches.filter(
    (p) => p.protected && p.source.parentId === patch.id,
  );
  for (const f of [0.42, 0.62, 0.28, 0.74]) {
    const at = axis === "x" ? b.x + b.width * f : b.y + b.height * f;
    if (
      marks.some((p) => {
        const lo = axis === "x" ? p.source.bounds.x : p.source.bounds.y;
        const hi = lo + (axis === "x" ? p.width : p.height);
        return at > lo - 1.2 && at < hi + 1.2;
      })
    )
      continue;
    const lower = patch.source.cells.filter(
      (p) => (axis === "x" ? p.x : p.y) < at,
    ).length;
    if (lower >= 2 && lower <= patch.area - 2) return { axis, at };
  }
  return undefined;
}
function stateVector(c: Signals) {
  return {
    safety: c.safety.load,
    security: c.security.load,
    trust: c.trust.load,
    rest: c.rest.load,
    relaxation: c.relaxation.load,
    fitness: c["physical-fitness"].load,
    restOpportunity: c.rest.opportunity,
    fitnessOpportunity: c["physical-fitness"].opportunity,
    trustOpportunity: c.trust.opportunity,
    relaxationOpportunity: ADAPTATION_RULES.relaxation
      .positiveStructuralResponse
      ? c.relaxation.opportunity
      : 0,
  };
}
function resourceBudget(c: ReturnType<typeof stateVector>) {
  return clamp(
    0.78 +
      c.restOpportunity * 0.12 +
      c.fitnessOpportunity * 0.1 -
      c.rest * 0.23 -
      c.fitness * 0.13,
    0.42,
    1.1,
  );
}
function allocate(
  program: GeneticProgram,
  c: ReturnType<typeof stateVector>,
  grooming?: GroomingState,
) {
  const physical = program.atlas.patches.filter((p) => !p.protected);
  const weights = physical.reduce((s, p) => s + Math.sqrt(p.area), 0) || 1;
  const regions = physical.map((p) => {
    const pressure =
      p.kind === "head"
        ? c.trust
        : p.source.bulk
          ? c.safety * 0.6 + c.security * 0.45
          : ["leg", "arm", "foot"].includes(p.kind)
            ? c.fitness * 0.5 + c.rest * 0.3
            : c.relaxation * 0.5;
    const opportunity = p.source.bulk
      ? c.restOpportunity * 0.3
      : ["leg", "arm", "foot"].includes(p.kind)
        ? c.fitnessOpportunity
        : c.relaxationOpportunity;
    const requested =
      (Math.sqrt(p.area) / weights) *
      (1.05 + pressure * 0.7 + opportunity * 0.35);
    return {
      id: p.id,
      role: p.kind,
      requested,
      priority:
        (1 + pressure * 0.7 + opportunity * 0.2) *
        (1 + clamp(grooming?.byRegion[p.id]?.priorityBias ?? 0, 0, 0.08)),
      allocated: 0,
      expression: 1,
      pressure,
      opportunity,
    };
  });
  const budget = resourceBudget(c);
  let remaining = budget;
  for (let pass = 0; pass < 3 && remaining > 1e-9; pass++) {
    const active = regions.filter((r) => r.allocated < r.requested - 1e-9);
    const total = active.reduce(
      (s, r) => s + (r.requested - r.allocated) * r.priority,
      0,
    );
    if (!total) break;
    let spent = 0;
    for (const r of active) {
      const amount = Math.min(
        r.requested - r.allocated,
        (remaining * (r.requested - r.allocated) * r.priority) / total,
      );
      r.allocated += amount;
      spent += amount;
    }
    remaining = Math.max(0, remaining - spent);
  }
  for (const r of regions)
    r.expression =
      0.62 + 0.38 * Math.min(1, r.allocated / Math.max(1e-9, r.requested));
  return {
    budget,
    requested: regions.reduce((s, r) => s + r.requested, 0),
    spent: budget - remaining,
    unspent: remaining,
    costUnits: "relative material remodeling per interval",
    regions,
  };
}
type Decisions = { mass: string; functional: string; surface: string };
function choose(
  program: GeneticProgram,
  stage: number,
  stateAt: (age: number) => WellbeingState,
  age: number,
): Decisions {
  const s = program.stages[stage],
    g = program.genome.stages[stage];
  const eligible = program.atlas.patches.filter(
    (p) => p.source.bulk && p.kind !== "head",
  );
  let mass = "restructure",
    functional = "articulate",
    surface = "contour";
  if (age >= s.operations[0].start) {
    const c = stateVector(signals(stateAt(s.operations[0].start)));
    const nearbyPair = eligible.some((a, ia) =>
      eligible.some(
        (b, ib) =>
          ia < ib &&
          distance(a.center, b.center) - (a.width + b.width) * 0.25 <= 14,
      ),
    );
    const inheritedDivision =
      stage > 0 &&
      program.stages
        .slice(0, stage)
        .some((_, i) => choose(program, i, stateAt, age).mass === "split");
    if (
      (nearbyPair && g.fusion + c.security * 0.22 > 0.73) ||
      (inheritedDivision && g.fusion + c.security * 0.15 > 0.55)
    )
      mass = "fuse";
    else if (
      eligible.some((p) => splitCut(program, p)) &&
      g.division + c.fitnessOpportunity * 0.14 - c.security * 0.12 > 0.4
    )
      mass =
        program.stages
          .slice(0, stage)
          .filter((_, i) => choose(program, i, stateAt, age).mass === "split")
          .length < eligible.filter((p) => !!splitCut(program, p)).length
          ? "split"
          : "reshape-divided";
  }
  if (age >= s.operations[1].start) {
    const c = stateVector(signals(stateAt(s.operations[1].start)));
    const host = eligible.some(
      (p) => p.area >= 8 && p.width >= 3 && p.height >= 3,
    );
    if (
      stage === 1 &&
      program.genome.lifeProgram.kind === "sheltered" &&
      program.atlas.descriptors.supportCount >= 4 &&
      resourceBudget(c) > 0.45
    )
      functional = "repurpose";
    else if (
      host &&
      resourceBudget(c) > 0.55 &&
      program.genome.membranePotential + c.trustOpportunity * 0.16 > 0.76 &&
      g.membrane > 0.4
    )
      functional = "membrane";
    else if (
      host &&
      resourceBudget(c) > 0.45 &&
      !program.genome.limbless &&
      program.genome.supportPotential + c.fitnessOpportunity * 0.12 > 0.58 &&
      program.atlas.descriptors.supportCount < 2
    )
      functional = "support";
    else if (mass === "fuse" && program.atlas.descriptors.supportCount >= 4)
      functional = "repurpose";
    else if (
      stage === 2 &&
      g.fusion + c.rest * 0.15 > 0.72 &&
      program.atlas.patches.some(
        (p) =>
          !p.protected &&
          !p.source.bulk &&
          !protectedDescendant(program.atlas, p.id) &&
          ["arm", "leg", "foot", "horn", "tail"].includes(p.kind) &&
          localGene(program, p, "absorption") > 0.48,
      )
    )
      functional = "absorb";
  }
  if (age >= s.operations[2].start) {
    const c = stateVector(signals(stateAt(s.operations[2].start)));
    surface =
      c.safety + 0.7 * c.security > 0.35
        ? "reinforce"
        : c.trustOpportunity + c.relaxationOpportunity > 0.4
          ? "display"
          : "contour";
  }
  return { mass, functional, surface };
}
function absorptionAt(
  program: GeneticProgram,
  decisions: Decisions[],
  age: number,
) {
  const result = new Map<string, number>();
  for (const p of program.atlas.patches) {
    if (
      p.protected ||
      p.source.bulk ||
      protectedDescendant(program.atlas, p.id) ||
      !["arm", "leg", "foot", "horn", "tail"].includes(p.kind)
    )
      continue;
    for (let i = 0; i < 3; i++)
      if (
        decisions[i].functional === "absorb" &&
        localGene(program, p, "absorption") > 0.48
      )
        result.set(p.id, progress(program.stages[i].operations[1], age));
  }
  for (let pass = 0; pass < 3; pass++)
    for (const p of program.atlas.patches) {
      const inherited = result.get(p.source.parentId ?? "");
      if (inherited && !p.protected)
        result.set(p.id, Math.max(result.get(p.id) ?? 0, inherited));
    }
  return result;
}
function patchGrowthAxis(p: SourcePatch): Point {
  const axis = { x: p.source.tip.x - p.pivot.x, y: p.source.tip.y - p.pivot.y };
  return Math.hypot(axis.x, axis.y) >= 0.1
    ? axis
    : p.axis === "x"
      ? { x: 1, y: 0 }
      : { x: 0, y: -1 };
}
/** Current source material domains, with inherited opportunities and explicit successor aliases. */
export function groomingBindings(
  program: GeneticProgram,
  absorption = new Map<string, number>(),
): GroomingBinding[] {
  const patches = program.atlas.patches,
    byId = new Map(patches.map((p) => [p.id, p]));
  const aliases = new Map<string, GroomSourceAlias[]>();
  for (const [sourceId, amount] of absorption) {
    if (amount <= 0) continue;
    const source = byId.get(sourceId);
    if (!source) continue;
    let successor = source.source.parentId,
      seen = new Set<string>([sourceId]);
    while (
      successor &&
      (absorption.get(successor) ?? 0) > 0 &&
      !seen.has(successor)
    ) {
      seen.add(successor);
      successor = byId.get(successor)?.source.parentId ?? null;
    }
    const host = successor ? byId.get(successor) : undefined;
    if (!host) continue;
    const entries = aliases.get(host.id) ?? [];
    const oldAxis = patchGrowthAxis(source),
      newAxis = patchGrowthAxis(host);
    entries.push({
      sourceId,
      sourceAnchor: { ...source.center },
      targetAnchor: { ...host.center },
      weight: amount,
      rotation:
        Math.atan2(newAxis.y, newAxis.x) - Math.atan2(oldAxis.y, oldAxis.x),
    });
    aliases.set(host.id, entries);
  }
  return patches
    .filter((p) => (absorption.get(p.id) ?? 0) < 0.9999)
    .map((p) => {
      const protectedLayer = ["eye", "mouth", "decoration"].includes(p.kind);
      const available = 1 - (absorption.get(p.id) ?? 0);
      const length = protectedLayer
        ? 0
        : (p.kind === "hair" ? 0.58 : 0.3) +
          localGene(program, p, "groom-length") * 0.4;
      const bend = protectedLayer
        ? 0
        : 0.35 + localGene(program, p, "groom-bend") * 0.5;
      const growthAxis = patchGrowthAxis(p);
      return {
        id: p.id,
        kind: p.kind,
        parentId: p.source.parentId,
        sourceIds: [p.id],
        materialAnchor: { ...p.center },
        growthAxis,
        influenceRadius: Math.max(2, Math.max(p.width, p.height) * 0.6),
        geneticOpportunity: {
          length: length * available,
          bend: bend * available,
        },
        sourceAliases: aliases.get(p.id),
      };
    });
}
function sourceRegion(
  t: Tissue,
  steps: MaterialWarp[],
  role = t.kind as string,
  boundary?: readonly Point[],
): Region {
  const mapped = (p: Point) => apply(steps, p),
    center = mapped(t.center),
    anchor = mapped(t.pivot),
    tip = mapped(t.tip);
  const b = t.bounds,
    corners = [
      { x: b.x - 0.5, y: b.y - 0.5 },
      { x: b.x + b.width - 0.5, y: b.y - 0.5 },
      { x: b.x - 0.5, y: b.y + b.height - 0.5 },
      { x: b.x + b.width - 0.5, y: b.y + b.height - 0.5 },
    ].map(mapped);
  if (boundary)
    for (const p of boundary)
      for (const x of [-0.5, 0.5])
        for (const y of [-0.5, 0.5])
          corners.push(mapped({ x: p.x + x, y: p.y + y }));
  return {
    id: t.id,
    kind: t.kind,
    role,
    parentId: t.parentId,
    sourceIds: [t.id],
    source: t,
    center,
    anchor,
    tip,
    rx: Math.max(
      0.1,
      (Math.max(...corners.map((p) => p.x)) -
        Math.min(...corners.map((p) => p.x))) *
        0.5,
    ),
    ry: Math.max(
      0.1,
      (Math.max(...corners.map((p) => p.y)) -
        Math.min(...corners.map((p) => p.y))) *
        0.5,
    ),
    angle: Math.atan2(
      mapped({ x: t.center.x + 1, y: t.center.y }).y - center.y,
      mapped({ x: t.center.x + 1, y: t.center.y }).x - center.x,
    ),
    readiness: 1,
    material: 0,
    shape: "mask",
    color: t.cells[0]?.color ?? "#AAAAAA",
    layer:
      t.part.layer ?? (t.cells[0] ? pixelPaintDepth(t.part, t.cells[0]) : 100),
    sourceWarp: { steps },
    lineage: [t.id],
  };
}
function generated(
  id: string,
  host: Region,
  kind: PartKind,
  role: string,
  anchor: Point,
  tip: Point,
  width: number,
  ready: number,
  shape: Region["shape"] = "limb",
): Region {
  let color = host.color,
    bestDistance = Infinity,
    bestX = Infinity,
    bestY = Infinity;
  for (const cell of host.source?.cells ?? []) {
    const clip = host.sourceClip;
    if (clip && (cell[clip.axis] < clip.min || cell[clip.axis] >= clip.max))
      continue;
    const point = mapSourcePoint(host, cell),
      distanceSquared = (point.x - anchor.x) ** 2 + (point.y - anchor.y) ** 2;
    if (
      distanceSquared < bestDistance - 1e-10 ||
      (Math.abs(distanceSquared - bestDistance) <= 1e-10 &&
        (cell.y < bestY || (cell.y === bestY && cell.x < bestX)))
    ) {
      bestDistance = distanceSquared;
      bestX = cell.x;
      bestY = cell.y;
      color = cell.color;
    }
  }
  return {
    id,
    kind,
    role,
    parentId: host.id,
    sourceIds: [...host.sourceIds],
    lineage: [...host.sourceIds, id],
    center: pt((anchor.x + tip.x) / 2, (anchor.y + tip.y) / 2),
    anchor,
    tip,
    rx: width,
    ry: Math.max(0.05, distance(anchor, tip) / 2),
    angle: -Math.atan2(tip.x - anchor.x, tip.y - anchor.y),
    readiness: ready,
    material: 1,
    shape,
    color,
    layer: 90,
  };
}

type DomainMaterial = {
  id: string;
  tissue: Tissue;
  boundary: Point[];
  cranial?: boolean;
};
const domainMaterialCache = new WeakMap<GeneticProgram, DomainMaterial[]>();
/** Source subsets are immutable and reused, so source-distance fields need not
 * be rebuilt while seeking ages or changing care. */
function domainMaterials(program: GeneticProgram): DomainMaterial[] {
  let cached = domainMaterialCache.get(program);
  if (cached) return cached;
  const source = program.regionalLayout.source,
    patch = source && program.atlas.patches.find((p) => p.id === source.id);
  if (!source || !patch) return [];
  const face =
      source.cranium &&
      program.atlas.faceIslands.find((f) => f.id === source.cranium!.faceId),
    cranialCells = new Set(
      face?.material?.cells.map((cell) => `${cell.x},${cell.y}`) ?? [],
    );
  cached = source.domains
    .map((domain) => {
      const cells = patch.source.cells.filter(
        (cell) =>
          !cranialCells.has(`${cell.x},${cell.y}`) &&
          sourceDomainAt(program.regionalLayout, cell)?.id === domain.id,
      );
      const occupied = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
      const boundary = cells.filter((cell) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => !occupied.has(`${cell.x + dx},${cell.y + dy}`)),
      );
      const closest = (point: Point) =>
        cells.reduce(
          (best, cell) =>
            distance(cell, point) < distance(best, point) ? cell : best,
          cells[0] ?? point,
        );
      return {
        id: domain.id,
        boundary,
        tissue: {
          ...patch.source,
          cells,
          center: materialCenter(cells),
          bounds: materialBounds(cells),
          pivot: { ...closest(patch.pivot) },
          tip: { ...closest(patch.source.tip) },
        },
      };
    })
    .filter((domain) => domain.tissue.cells.length > 0);
  if (face?.material && source.cranium) {
    const cells = patch.source.cells.filter((cell) =>
        cranialCells.has(`${cell.x},${cell.y}`),
      ),
      occupied = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
    cached.push({
      id: source.cranium.id,
      cranial: true,
      boundary: cells.filter((cell) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([x, y]) => !occupied.has(`${cell.x + x},${cell.y + y}`)),
      ),
      tissue: {
        ...patch.source,
        id: source.cranium.id,
        kind: "head",
        part: { ...patch.source.part, id: source.cranium.id, kind: "head" },
        parentId: patch.id,
        relationship: "surface",
        sourcePartId: patch.id,
        cells,
        center: materialCenter(cells),
        bounds: materialBounds(cells),
        pivot: { ...source.cranium.sourceCenter },
        tip: { ...source.cranium.sourceCenter },
      },
    });
  }
  domainMaterialCache.set(program, cached);
  return cached;
}
function domainRegionId(program: GeneticProgram, id: string): string {
  const source = program.regionalLayout.source;
  if (!source) return id;
  return source.domains[Math.floor(source.domains.length / 2)]?.id === id
    ? source.id
    : id;
}
type MaterialSeam = { pairs: { a: Point; b: Point }[]; halfThickness: number };
const seamCache = new WeakMap<GeneticProgram, Map<string, MaterialSeam[]>>();
/** Only actual authored contact can require a tissue waist. Separate contacts
 * around a cavity stay separate, rather than filling the hollow center. */
function materialSeams(
  program: GeneticProgram,
  aId: string,
  bId: string,
): MaterialSeam[] {
  let cache = seamCache.get(program);
  if (!cache) {
    cache = new Map();
    seamCache.set(program, cache);
  }
  const key = `${aId}\0${bId}`,
    hit = cache.get(key);
  if (hit) return hit;
  const domains = domainMaterials(program),
    a = domains.find((d) => d.id === aId),
    b = domains.find((d) => d.id === bId);
  if (!a || !b) return [];
  const occupied = new Map(b.tissue.cells.map((p) => [`${p.x},${p.y}`, p]));
  const contacts: { a: Point; b: Point }[] = [];
  for (const p of a.tissue.cells)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const q = occupied.get(`${p.x + dx},${p.y + dy}`);
        if (q) contacts.push({ a: p, b: q });
      }
  const unseen = new Set(contacts.map((_, i) => i)),
    seams: MaterialSeam[] = [];
  while (unseen.size) {
    const first = unseen.values().next().value!,
      indices = [first];
    unseen.delete(first);
    for (let i = 0; i < indices.length; i++) {
      const p = contacts[indices[i]];
      for (const j of unseen) {
        const q = contacts[j];
        if (
          Math.max(
            Math.abs(p.a.x - q.a.x),
            Math.abs(p.a.y - q.a.y),
            Math.abs(p.b.x - q.b.x),
            Math.abs(p.b.y - q.b.y),
          ) <= 1
        ) {
          unseen.delete(j);
          indices.push(j);
        }
      }
    }
    const pairs = indices.map((i) => contacts[i]),
      points = pairs.flatMap((p) => [p.a, p.b]);
    const width =
      Math.max(...points.map((p) => p.x)) -
      Math.min(...points.map((p) => p.x)) +
      1;
    const height =
      Math.max(...points.map((p) => p.y)) -
      Math.min(...points.map((p) => p.y)) +
      1;
    seams.push({
      pairs,
      halfThickness: Math.max(0.5, (Math.max(width, height) - 1) / 2),
    });
  }
  cache.set(key, seams);
  return seams;
}

/** Resolve the causal program, preserving authored material rather than morphing to stock bodies. */
export function resolveDevelopment(
  program: GeneticProgram,
  tissues: Tissue[],
  rawAge: number,
  stateAt: (age: number) => WellbeingState,
  signalsAt?: (age: number) => Signals,
  groomAt?: (
    age: number,
    bindings: readonly GroomingBinding[],
  ) => GroomingState,
  lineageTraits?: LineageTraitModifiers,
  biologicalAge?: number,
  liveSomatic?: { context: LiveDevelopmentContext; careHours: number },
): ResolvedDevelopment {
  const compactSource = somaticSource(program.atlas, program.genome);
  if (compactSource)
    return resolveSomaticGrowth(
      program,
      compactSource,
      Math.max(0, Number.isFinite(rawAge) ? rawAge : 0),
      stateAt,
      signalsAt,
      liveSomatic,
      biologicalAge,
      sourceRegion,
      generated,
      lineageTraits,
    );
  const clock = {
      ...developmentClock(rawAge),
      ...(biologicalAge === undefined
        ? {}
        : { senescence: developmentClock(biologicalAge).senescence }),
    },
    age = clock.developmentalAge,
    atlas = program.atlas;
  const metamorphosisPhase = getMetamorphosisPhase(program.genome, age);
  const careSensitivity = appliedCareSensitivity(program.sensitivity);
  const context = contextAt(program, age, stateAt, signalsAt),
    appliedContext = responseMagnitudes(context, careSensitivity),
    care = stateVector(appliedContext);
  const activeNeedSignals = currentSignals(stateAt(age), age);
  const appliedActiveSignals = responseMagnitudes(
    activeNeedSignals,
    careSensitivity,
  );
  const regionalLayout = regionalLayoutAt(
    program.regionalLayout,
    age,
    context,
    activeNeedSignals,
    lineageTraits,
  );
  const regionalSourceId = regionalLayout.sourceId;
  const plannedFunctionalStrategy = regionalLayout.functionalStrategy;
  const decisions = program.stages.map((_, i) =>
    choose(program, i, stateAt, age),
  );
  const coordinatedSupports =
    program.regionalLayout.eligibility.supportCount >= 4;
  const supportRoleTargets = program.regionalLayout.stages.map((stage) =>
    coordinatedSupports && stage.functionalStrategy === "rear-support" ? 1 : 0,
  );
  if (coordinatedSupports)
    for (let i = 0; i < decisions.length; i++) {
      if (age < program.stages[i].operations[1].start) continue;
      if (supportRoleTargets[i] > 0) decisions[i].functional = "repurpose";
      else if (supportRoleTargets.slice(0, i).some((target) => target > 0))
        decisions[i].functional = "restore-support";
      else if (decisions[i].functional === "repurpose")
        decisions[i].functional = "articulate";
    }
  const absorption = absorptionAt(program, decisions, age);
  const groomBindings = groomAt ? groomingBindings(program, absorption) : [];
  const grooming = groomAt?.(age, groomBindings);
  const groomBindingById = new Map(
    groomBindings.map((binding) => [binding.id, binding]),
  );
  const allocation = allocate(program, care, grooming),
    allocationById = new Map(
      allocation.regions.map((r) => [r.id, r.expression]),
    );
  const springStage = regionalLayout.stage;
  const springExpression = mix(
    springStage > 0 &&
      program.regionalLayout.stages[springStage - 1].functionalStrategy ===
        "spring-support"
      ? 1
      : 0,
    program.regionalLayout.stages[springStage].functionalStrategy ===
      "spring-support"
      ? 1
      : 0,
    regionalLayout.massProgress,
  );
  const springAllocation =
    springExpression * (allocationById.get(regionalSourceId ?? "") ?? 1);
  for (const domain of regionalLayout.domains)
    if (domain.role === "pelvis" || domain.role === "posterior") {
      domain.radius = {
        x: domain.radius.x * (1 + 0.12 * springAllocation),
        y: domain.radius.y * (1 + 0.18 * springAllocation),
      };
    }
  const materialBandRadius = (center: Point, sourceId: string) =>
    ease(age / 120) *
    (0.65 +
      materialGene(
        program.genome,
        "body-material-band",
        (center.x - atlas.center.x) / 8,
        (center.y - atlas.center.y) / 8,
      ) *
        0.65) *
    (1 + 0.35 * care.safety + 0.2 * care.security) *
    (allocationById.get(sourceId) ?? 1);
  const resourceExpression = allocation.regions.length
    ? allocation.regions.reduce((s, r) => s + r.expression * r.requested, 0) /
      Math.max(0.001, allocation.requested)
    : 1;
  const commitments: DevelopmentState["commitments"] = [],
    operations: DevelopmentState["operations"] = [];
  let transitionId = "birth",
    transitionProgress = 0;
  for (const s of program.stages) {
    if (age < s.start) continue;
    transitionId = s.id;
    transitionProgress = ease((age - s.start) / (s.end - s.start));
    s.operations.forEach((op, j) => {
      if (age < op.start) return;
      const option = [
        regionalSourceId
          ? `regional-${program.regionalLayout.stages[op.stage].axisConfiguration}`
          : decisions[op.stage].mass,
        decisions[op.stage].functional,
        decisions[op.stage].surface,
      ][j];
      commitments.push({ id: op.id, tick: Math.round(op.start * 24), option });
      const p = progress(op, age);
      if (p < 1) operations.push({ id: op.id, kind: option, progress: p });
    });
  }
  const common: MaterialWarp[] = [];
  const frameSpan = {
    x: Math.max(2, atlas.bounds.width / 2),
    y: Math.max(2, atlas.bounds.height / 2),
  };
  let runningCenter = { ...atlas.center };
  const bulk = atlas.patches.filter((p) => p.source.bulk);
  const main = [...bulk].sort(patchOrder)[0];
  const axisWeight = ease(
    ((main?.width ?? atlas.bounds.width) /
      Math.max(1, main?.height ?? atlas.bounds.height) -
      1.2) /
      1.05,
  );
  let cumulativeScale = { x: 1, y: 1 },
    cumulativeTurn = 0;
  for (let i = 0; i < program.stages.length; i++) {
    const s = program.stages[i],
      g = program.genome.stages[i];
    const base = ease((age - s.start) / (s.end - s.start)),
      u = progress(s.operations[0], age);
    if (base <= 0) continue;
    const tiny = atlas.cellCount <= 2 ? 3.5 : 1;
    const scalar = 1.13 + i * 0.17;
    const corners = [
      { x: atlas.bounds.x, y: atlas.bounds.y },
      { x: atlas.bounds.x + atlas.bounds.width, y: atlas.bounds.y },
      { x: atlas.bounds.x, y: atlas.bounds.y + atlas.bounds.height },
      {
        x: atlas.bounds.x + atlas.bounds.width,
        y: atlas.bounds.y + atlas.bounds.height,
      },
    ].map((p) => apply(common, p));
    const currentSpan = {
      x: Math.max(
        2,
        (Math.max(...corners.map((p) => p.x)) -
          Math.min(...corners.map((p) => p.x))) /
          2,
      ),
      y: Math.max(
        2,
        (Math.max(...corners.map((p) => p.y)) -
          Math.min(...corners.map((p) => p.y))) /
          2,
      ),
    };
    const step = identity(runningCenter, currentSpan);
    const targetScale = {
      x: clamp(
        mix(
          1,
          mix(
            g.widen * (lineageTraits?.widening ?? 1),
            g.stretch * (lineageTraits?.elongation ?? 1),
            axisWeight,
          ) *
            scalar *
            tiny,
          resourceExpression,
        ),
        0.75,
        tiny > 1 ? 9 : 3.1,
      ),
      y: clamp(
        mix(
          1,
          mix(
            g.stretch * (lineageTraits?.elongation ?? 1),
            g.widen * (lineageTraits?.widening ?? 1),
            axisWeight,
          ) *
            scalar *
            tiny,
          resourceExpression,
        ),
        0.75,
        tiny > 1 ? 9 : 3.1,
      ),
    };
    const precursor = Math.min(base, 1 - u) * 0.08;
    step.scale = {
      x: mix(1, targetScale.x / cumulativeScale.x, u) * (1 + precursor),
      y: mix(1, targetScale.y / cumulativeScale.y, u) * (1 + precursor),
    };
    step.angle = (g.turn * 0.64 - cumulativeTurn) * u;
    // Every inherited interval has a substantive non-affine core operation. A nearly
    // neutral sampled coefficient becomes a compatible axial fold, not a seed reroll.
    const bendSign = g.bend < 0 ? -1 : 1;
    const fold =
      bendSign *
      (0.32 + Math.abs(g.bend) * 0.36) *
      (lineageTraits?.curvature ?? 1);
    step.bend =
      fold * u +
      (care.safety * 0.11 - care.relaxationOpportunity * 0.08) * base;
    step.waist = g.pinch * u * 0.26 + care.security * base * 0.08;
    step.wave = g.wave * u * 0.13;
    step.phase =
      geneRandom(program.genome.fingerprint, `axis/${i}`) * Math.PI * 2;
    step.scale.x *=
      1 +
      (care.safety * 0.08 +
        care.security * 0.08 -
        care.fitness * 0.04 +
        care.fitnessOpportunity * 0.07) *
        base;
    step.scale.y *=
      1 +
      (-care.rest * 0.035 - care.trust * 0.04 + care.restOpportunity * 0.025) *
        base;
    common.push(step);
    runningCenter = apply([step], runningCenter);
    cumulativeScale = {
      x: cumulativeScale.x * step.scale.x,
      y: cumulativeScale.y * step.scale.y,
    };
    cumulativeTurn += step.angle;
  }
  const patchById = new Map(atlas.patches.map((p) => [p.id, p]));
  const faceBySource = new Map(
    atlas.faceIslands.flatMap((island) =>
      island.sourceIds.map((id) => [id, island] as const),
    ),
  );
  // A fused axial body can repurpose its existing leading support pair as
  // reaching effectors. Selection follows source facial orientation, never IDs.
  const facingMarks = atlas.patches.filter(
    (p) => p.kind === "head" && p.source.relationship !== "floating",
  );
  const referenceFace = facingMarks.length
    ? {
        x:
          facingMarks.reduce((sum, p) => sum + p.center.x, 0) /
          facingMarks.length,
        y:
          facingMarks.reduce((sum, p) => sum + p.center.y, 0) /
          facingMarks.length,
      }
    : {
        x: (main?.center.x ?? atlas.center.x) + 1,
        y: main?.center.y ?? atlas.center.y,
      };
  const facingRaw = {
    x: referenceFace.x - (main?.center.x ?? atlas.center.x),
    y: referenceFace.y - (main?.center.y ?? atlas.center.y),
  };
  const facingLength = Math.max(0.001, Math.hypot(facingRaw.x, facingRaw.y));
  const facing =
    facingLength > 0.1
      ? { x: facingRaw.x / facingLength, y: facingRaw.y / facingLength }
      : { x: 1, y: 0 };
  const foreLegs = atlas.patches
    .filter((p) => p.kind === "leg" && p.source.relationship !== "floating")
    .sort(
      (a, b) =>
        (b.center.x - a.center.x) * facing.x +
          (b.center.y - a.center.y) * facing.y ||
        a.center.y - b.center.y ||
        a.center.x - b.center.x,
    )
    .slice(0, 2);
  const repurposed = new Map<
    string,
    {
      targetKind: "arm" | "hand";
      progress: number;
      sourceId: string;
      originalKind: PartKind;
      stage: number;
      materialRoot?: Point;
    }
  >();
  // Replay successive role operations rather than taking the maximum of all
  // preceding transformations. Later support goals can release a reaching bias.
  let manipulation = 0,
    firstRoleStage = -1,
    activeRoleStage = -1;
  const roleSuccession: {
    stage: number;
    start: number;
    target: number;
    progress: number;
    from: number;
    to: number;
  }[] = [];
  for (let i = 0; i < 3; i++) {
    const op = program.stages[i].operations[1];
    if (age < op.start) break;
    const target = coordinatedSupports
      ? supportRoleTargets[i]
      : decisions[i].functional === "repurpose"
        ? 1
        : manipulation;
    const from = manipulation,
      u = progress(op, age);
    manipulation = mix(from, target, u);
    if (target > 0 && firstRoleStage < 0) firstRoleStage = i;
    activeRoleStage = i;
    roleSuccession.push({
      stage: i,
      start: op.start,
      target,
      progress: u,
      from,
      to: manipulation,
    });
  }
  for (const leg of foreLegs) {
    const port = regionalLayout.ports[leg.id];
    if (port && coordinatedSupports) {
      port.manipulationWeight = manipulation;
      port.supportWeight = 1 - manipulation;
    }
    if (manipulation <= 1e-10 || firstRoleStage < 0) continue;
    repurposed.set(leg.id, {
      targetKind: "arm",
      progress: manipulation,
      sourceId: leg.id,
      originalKind: "leg",
      stage: firstRoleStage,
    });
    for (const foot of atlas.patches.filter(
      (p) => p.kind === "foot" && p.source.parentId === leg.id,
    ))
      repurposed.set(foot.id, {
        targetKind: "hand",
        progress: manipulation,
        sourceId: foot.id,
        originalKind: "foot",
        stage: firstRoleStage,
      });
  }
  if (coordinatedSupports)
    regionalLayout.functionalStrategy =
      manipulation >= 0.55
        ? "rear-support"
        : plannedFunctionalStrategy === "spring-support"
          ? "spring-support"
          : "four-support";
  const headClearances: {
    sourceId: string;
    hostId: string;
    amount: number;
    direction: Point;
    projectedOverlap: number;
    authoredGap: number;
    maximumNeckLength: number;
  }[] = [];
  const activeRegionResponses: {
    sourceId: string;
    kind: string;
    length: number;
    angle: number;
    thickness: number;
  }[] = [];
  const occupiedHostCache = new Map<string, Point[]>();
  const maps = new Map<string, MaterialWarp[]>(),
    visiting = new Set<string>();
  const facialFrames = new Map<string, MaterialWarp>();
  const inheritedFace = facialTraitsAt(program.morphogenesis, age);
  const facialFrame = (
    face: FaceIsland,
    hostSteps: readonly MaterialWarp[],
  ) => {
    let frame = facialFrames.get(face.id);
    if (!frame) {
      frame = rigidMaterialCarrier(
        hostSteps,
        face.carrierPoint,
        {
          x: Math.max(1, (face.bounds?.width ?? 2) / 2),
          y: Math.max(1, (face.bounds?.height ?? 2) / 2),
        },
        Math.PI / 6,
      );
      const growth = 1 + 0.15 * ease(age / 120);
      frame.scale = { x: growth, y: growth };
      facialFrames.set(face.id, frame);
    }
    return frame;
  };
  const make = (p: SourcePatch): MaterialWarp[] => {
    const hit = maps.get(p.id);
    if (hit) return hit;
    if (visiting.has(p.id)) return common;
    visiting.add(p.id);
    const parent = p.source.parentId
      ? patchById.get(p.source.parentId)
      : undefined;
    const regionalBody =
      p.id === regionalSourceId && regionalLayout.domains.length > 0;
    let steps = parent ? [...make(parent)] : [...common];
    if (regionalBody && regionalLayout.sourceFrame) {
      const frame = regionalLayout.sourceFrame;
      const warp = identity(p.center, {
        x: Math.max(1, p.width / 2),
        y: Math.max(1, p.height / 2),
      });
      warp.regional = {
        centerline: frame.centerline,
        axis: frame.axis,
        normal: frame.normal,
        cages: regionalLayout.domains,
        carriers: atlas.faceIslands
          .filter(
            (island) =>
              island.hostId === p.id && !island.floating && !island.material,
          )
          .map((island) => ({
            anchor: island.center,
            radius: island.radius + 0.8,
            maxTurn: Math.PI / 6,
          })),
      };
      const cranium = regionalLayout.cranium,
        faceMaterial =
          cranium &&
          atlas.faceIslands.find((face) => face.id === cranium.faceId)
            ?.material;
      if (cranium && faceMaterial)
        warp.regional.cranium = {
          ...cranium,
          uMin: 0,
          uMax: 1,
          cells: faceMaterial.cells,
        };
      steps = [warp];
    }
    const sharedFace = faceBySource.get(p.id);
    if (sharedFace?.floating) {
      steps = [facialFrame(sharedFace, parent ? make(parent) : common)];
    } else if (p.source.relationship === "floating" && parent) {
      const face = faceBySource.get(p.id);
      const carrier =
        face?.carrierPoint ?? p.source.carrierPoint ?? parent.center;
      steps = [
        rigidMaterialCarrier(
          steps,
          carrier,
          {
            x: p.width / 2,
            y: p.height / 2,
          },
          p.kind === "head" || face ? Math.PI / 6 : undefined,
        ),
      ];
    } else if (
      parent &&
      [
        "head",
        "leg",
        "arm",
        "ear",
        "tail",
        "horn",
        "hair",
        "hand",
        "foot",
        "wing",
      ].includes(p.kind)
    ) {
      steps = [
        rigidMaterialCarrier(
          steps,
          p.pivot,
          {
            x: p.width / 2,
            y: p.height / 2,
          },
          p.kind === "head" ? Math.PI / 6 : undefined,
        ),
      ];
    }
    if ((!p.protected || p.kind === "hair") && !regionalBody) {
      let cumulativeExtension = 1,
        cumulativeLocalTurn = 0,
        cumulativeHeadScale = 1;
      for (let i = 0; i < 3; i++) {
        const s = program.stages[i],
          g = program.genome.stages[i],
          u = progress(s.operations[1], age),
          surface = progress(s.operations[2], age);
        if (u <= 0 && surface <= 0) continue;
        const origin = apply(steps, p.source.bulk ? p.center : p.pivot);
        const local = localGene(program, p, `growth/${i}`),
          expression = allocationById.get(p.id) ?? 1;
        const left = apply(steps, { x: p.source.bounds.x, y: p.center.y }),
          right = apply(steps, {
            x: p.source.bounds.x + p.width,
            y: p.center.y,
          });
        const top = apply(steps, { x: p.center.x, y: p.source.bounds.y }),
          bottom = apply(steps, {
            x: p.center.x,
            y: p.source.bounds.y + p.height,
          });
        const step = identity(origin, {
          x: Math.max(1.5, distance(left, right) / 2),
          y: Math.max(1.5, distance(top, bottom) / 2),
        });
        step.rooted = !p.source.bulk;
        const long = ["arm", "leg", "tail", "horn", "hair", "ear"].includes(
          p.kind,
        );
        const desiredExtension = long
          ? 1 +
            (0.25 + i * 0.24 + g.limb * 0.3 + (local - 0.5) * 0.3) *
              (["arm", "leg"].includes(p.kind)
                ? (lineageTraits?.support ?? 1)
                : 1) *
              expression *
              (parent?.id === regionalSourceId ? 0.28 : 1)
          : 1;
        const extension = mix(1, desiredExtension / cumulativeExtension, u);
        cumulativeExtension *= extension;
        step.scale = {
          x:
            (1 + (local - 0.45) * 0.36 * surface) *
            (p.kind === "wing" ? (lineageTraits?.membrane ?? 1) : 1) *
            (1 + ((lineageTraits?.enclosure ?? 1) - 1) * surface * 0.25),
          y: extension,
        };
        if (p.kind === "head") {
          const openness = 0.14 * care.trustOpportunity - 0.17 * care.trust;
          const direction = parent
            ? {
                x: p.center.x - parent.center.x,
                y: p.center.y - parent.center.y,
              }
            : { x: 0, y: -1 };
          const norm = Math.max(0.1, Math.hypot(direction.x, direction.y));
          const ahead = apply(steps, {
            x: p.center.x + direction.x / norm,
            y: p.center.y + direction.y / norm,
          });
          const here = apply(steps, p.center),
            worldNorm = Math.max(0.1, distance(here, ahead));
          const extension =
            (parent?.id === regionalSourceId
              ? 0
              : Math.max(1, p.height * 0.36)) *
            g.neck *
            u *
            (1 + openness);
          step.target = pt(
            origin.x + ((ahead.x - here.x) / worldNorm) * extension,
            origin.y + ((ahead.y - here.y) / worldNorm) * extension,
          );
          // A head is a readable material island: its source face and skin grow
          // together, rather than being pinched by a torso waist operation.
          const desiredScale = 1.12 + i * 0.13 + local * 0.16;
          const headScale = mix(1, desiredScale / cumulativeHeadScale, u);
          step.scale.x = step.scale.y = headScale;
          cumulativeHeadScale *= headScale;
        }
        if (["leg", "arm", "wing"].includes(p.kind)) {
          const side =
            p.center.x < (parent?.center.x ?? atlas.center.x) ? -1 : 1;
          const developmentalStance =
            (i % 2 === 0 ? 1 : -1) * (0.28 + local * 0.34);
          const targetTurn = side * (developmentalStance + g.turn * 0.3);
          step.angle = (targetTurn - cumulativeLocalTurn) * u;
          cumulativeLocalTurn += step.angle;
        }
        step.bend =
          (long
            ? (local - 0.5) * 0.65 * u + care.relaxation * 0.06 * u
            : g.bend * 0.12 * surface) * expression;
        step.waist = p.source.bulk
          ? (decisions[i].surface === "reinforce" ? -1 : i % 2 === 0 ? 1 : -1) *
            (0.4 + g.pinch * 0.3) *
            surface
          : 0;
        step.wave = p.source.bulk ? (local - 0.5) * 0.2 * surface : 0;
        step.phase = local * 6.283185307179586;
        if (p.kind === "head") {
          step.bend = 0;
          step.waist = 0;
          step.wave = 0;
        }
        const retract = absorption.get(p.id) ?? 0;
        if (retract) {
          const keep = 1 - retract;
          step.scale.x *= keep;
          step.scale.y *= keep;
          if (parent)
            step.target = pt(
              mix(origin.x, apply(make(parent), parent.center).x, retract),
              mix(origin.y, apply(make(parent), parent.center).y, retract),
            );
        }
        steps.push(step);
      }
    }
    const loadBearing =
      ["leg", "arm", "hand", "foot", "wing", "tail"].includes(p.kind) &&
      p.source.relationship !== "floating";
    const springWidth =
      p.kind === "leg" &&
      (regionalLayout.ports[p.id]?.role === "hind" ||
        program.regionalLayout.eligibility.supportCount <= 2)
        ? 0.16 * springAllocation
        : 0;
    const chronicWidth = loadBearing
      ? -ADAPTATION_RULES.rest.slowFullnessLoss * appliedContext.rest.load +
        ADAPTATION_RULES.rest.slowFullnessGain *
          appliedContext.rest.opportunity +
        (p.kind === "tail" ? 0.6 : 1) *
          (-ADAPTATION_RULES["physical-fitness"].slowLoadBearingLoss *
            appliedContext["physical-fitness"].load +
            ADAPTATION_RULES["physical-fitness"].slowLoadBearingGain *
              appliedContext["physical-fitness"].opportunity)
      : 0;
    if (Math.abs(springWidth + chronicWidth) > 1e-12) {
      const root = apply(steps, p.pivot),
        tip = apply(steps, p.source.tip),
        norm = Math.max(0.001, distance(root, tip));
      const step = identity(root, {
        x: Math.max(1, p.width / 2),
        y: Math.max(1, p.height / 2),
      });
      step.supportWidth = {
        axis: { x: (tip.x - root.x) / norm, y: (tip.y - root.y) / norm },
        factor: clamp(1 + springWidth + chronicWidth, 0.6, 1.45),
      };
      steps.push(step);
    }
    const conversion = repurposed.get(p.id);
    if (conversion?.targetKind === "arm" && parent) {
      const parentSteps = make(parent),
        foreIndex = foreLegs.findIndex((leg) => leg.id === p.id),
        nearFar = foreIndex % 2 ? 1 : -1;
      const desiredSourceRoot = {
        x:
          parent.center.x +
          facing.x * parent.width * 0.32 -
          facing.y * nearFar * parent.width * 0.12,
        y:
          parent.center.y +
          facing.y * parent.height * 0.32 +
          facing.x * nearFar * parent.height * 0.16,
      };
      const sourceRoot = parent.source.cells.reduce((best, cell) =>
        distance(cell, desiredSourceRoot) < distance(best, desiredSourceRoot) ||
        (distance(cell, desiredSourceRoot) ===
          distance(best, desiredSourceRoot) &&
          (cell.y < best.y || (cell.y === best.y && cell.x < best.x)))
          ? cell
          : best,
      );
      conversion.materialRoot = { x: sourceRoot.x, y: sourceRoot.y };
      const shoulder = apply(parentSteps, sourceRoot),
        origin = apply(steps, p.pivot),
        tip = apply(steps, p.source.tip);
      const carrier = apply(parentSteps, parent.center),
        ahead = apply(parentSteps, {
          x: parent.center.x + facing.x,
          y: parent.center.y + facing.y,
        });
      const norm = Math.max(0.001, distance(carrier, ahead)),
        forward = {
          x: (ahead.x - carrier.x) / norm,
          y: (ahead.y - carrier.y) / norm,
        };
      const desired = {
        x: forward.x * 0.94 + forward.y * 0.34,
        y: forward.y * 0.94 - forward.x * 0.34,
      };
      const turn =
        Math.atan2(desired.y, desired.x) -
        Math.atan2(tip.y - origin.y, tip.x - origin.x);
      const step = identity(origin, {
        x: Math.max(1, p.width / 2),
        y: Math.max(1, p.height / 2),
      });
      step.rooted = true;
      step.target = pt(
        mix(origin.x, shoulder.x, conversion.progress),
        mix(origin.y, shoulder.y, conversion.progress),
      );
      step.angle =
        Math.atan2(Math.sin(turn), Math.cos(turn)) * conversion.progress;
      steps.push(step);
    }
    if (clock.remodelingAge > 0 && !p.protected && p.kind !== "head") {
      const origin = apply(steps, p.source.bulk ? p.center : p.pivot);
      const left = apply(steps, { x: p.source.bounds.x, y: p.center.y });
      const right = apply(steps, {
        x: p.source.bounds.x + p.width,
        y: p.center.y,
      });
      const top = apply(steps, { x: p.center.x, y: p.source.bounds.y });
      const bottom = apply(steps, {
        x: p.center.x,
        y: p.source.bounds.y + p.height,
      });
      const late = identity(origin, {
        x: Math.max(1.5, distance(left, right) / 2),
        y: Math.max(1.5, distance(top, bottom) / 2),
      });
      late.rooted = !p.source.bulk;
      const local = localGene(program, p, "lifelong-remodel"),
        ramp = ease(clock.remodelingAge / 30);
      const phase = clock.remodelingPhase,
        amplitude = ramp * (0.14 - clock.senescence * 0.04);
      // Bounded, slowing material change continues; no new organs or pigment mutations.
      late.waist = amplitude * Math.sin(phase * (1.3 + local * 0.7));
      late.bend = amplitude * 0.55 * Math.sin(phase * (2.17 + local * 0.6));
      late.wave = amplitude * 0.3 * Math.sin(phase * (3.07 + local * 0.4));
      late.phase = local * 6.283185307179586;
      late.scale = {
        x: 1 + amplitude * 0.25 * Math.sin(phase * 1.71),
        y: 1 + amplitude * 0.2 * Math.sin(phase * 2.39),
      };
      steps.push(late);
    }
    // Regional mass cages are the primary anatomy transform. The centerline
    // transport helper remains available for local interpolation and poses.
    if (
      metamorphosisPhase.enclosure > 0 &&
      parent &&
      p.source.relationship !== "floating" &&
      ["arm", "leg", "hand", "foot", "tail", "wing", "horn", "hair"].includes(
        p.kind,
      )
    ) {
      const root = apply(steps, p.pivot),
        tip = apply(steps, p.source.tip);
      const axis = { x: tip.x - root.x, y: tip.y - root.y };
      const body = apply(make(parent), parent.center),
        toward = { x: body.x - root.x, y: body.y - root.y };
      const currentAngle = Math.atan2(axis.y, axis.x),
        targetAngle = Math.atan2(toward.y, toward.x);
      const fold = Math.atan2(
        Math.sin(targetAngle - currentAngle),
        Math.cos(targetAngle - currentAngle),
      );
      const step = identity(root, {
        x: Math.max(1, p.width / 2),
        y: Math.max(1, p.height / 2),
      });
      step.retraction = {
        basisAngle: currentAngle - Math.PI / 2,
        factor: 1 - 0.8 * metamorphosisPhase.enclosure,
        foldAngle: fold * 0.9 * metamorphosisPhase.enclosure,
      };
      steps.push(step);
    }
    const groom = grooming?.byRegion[p.id],
      binding = groomBindingById.get(p.id);
    if (
      groom &&
      binding &&
      !["eye", "mouth", "decoration"].includes(p.kind) &&
      (Math.abs(groom.lengthDelta) > 1e-12 ||
        Math.abs(groom.bendRadians) > 1e-12)
    ) {
      const root = apply(steps, p.pivot),
        center = apply(steps, p.center);
      const axis = binding.growthAxis,
        norm = Math.max(0.001, Math.hypot(axis.x, axis.y));
      const probe = apply(steps, {
        x: p.pivot.x + axis.x / norm,
        y: p.pivot.y + axis.y / norm,
      });
      const basisAngle =
        Math.atan2(probe.y - root.y, probe.x - root.x) - Math.PI / 2;
      const weights = groom.influences.reduce(
        (sum, influence) => sum + influence.weight,
        0,
      );
      const focusSource =
        groom.materialFocus ??
        (weights > 1e-12
          ? {
              x:
                groom.influences.reduce(
                  (sum, influence) =>
                    sum + influence.materialAnchor.x * influence.weight,
                  0,
                ) / weights,
              y:
                groom.influences.reduce(
                  (sum, influence) =>
                    sum + influence.materialAnchor.y * influence.weight,
                  0,
                ) / weights,
            }
          : p.center);
      const focus = apply(steps, focusSource);
      const edge = apply(steps, {
        x: p.center.x + binding.influenceRadius,
        y: p.center.y,
      });
      const edgeY = apply(steps, {
        x: p.center.x,
        y: p.center.y + binding.influenceRadius,
      });
      const radius = Math.max(
        1.5,
        Math.sqrt(distance(center, edge) * distance(center, edgeY)),
      );
      const step = identity(root, { x: radius, y: radius });
      step.grooming = {
        focus,
        radius,
        basisAngle,
        lengthDelta: clamp(
          groom.lengthDelta,
          -0.25 * binding.geneticOpportunity.length,
          0.25 * binding.geneticOpportunity.length,
        ),
        bendRadians: clamp(
          groom.bendRadians,
          (-Math.PI / 9) * binding.geneticOpportunity.bend,
          (Math.PI / 9) * binding.geneticOpportunity.bend,
        ),
      };
      steps.push(step);
    }
    if (
      p.kind === "head" &&
      parent &&
      p.source.relationship !== "floating" &&
      age > 1
    ) {
      const tiltSignal =
        ADAPTATION_RULES.trust.headTiltDeficit *
          appliedActiveSignals.trust.load -
        ADAPTATION_RULES.trust.headTiltOpportunity *
          appliedActiveSignals.trust.opportunity;
      if (Math.abs(tiltSignal) > 1e-12) {
        const center = apply(steps, p.center),
          probe = apply(steps, { x: p.center.x + 0.5, y: p.center.y });
        const angle = Math.atan2(probe.y - center.y, probe.x - center.x),
          side = p.center.x < (parent?.center.x ?? atlas.center.x) ? -1 : 1;
        const tilt =
          clamp(angle + side * tiltSignal, -Math.PI / 6, Math.PI / 6) - angle;
        if (Math.abs(tilt) > 1e-12) {
          const step = identity(center, {
            x: Math.max(1, p.width / 2),
            y: Math.max(1, p.height / 2),
          });
          step.angle = tilt;
          steps.push(step);
        }
      }
      const parentSteps = make(parent),
        regionalParent = parent.id === regionalSourceId;
      const sourceContact = sourceHeadContact(p.source, parent.source);
      const owner = regionalParent
        ? sourceDomainAt(program.regionalLayout, sourceContact.hostPoint)
        : undefined;
      const fixedParent = owner
        ? parentSteps.map((step) =>
            step.regional
              ? {
                  ...step,
                  regional: { ...step.regional, fixedDomainId: owner.id },
                }
              : step,
          )
        : parentSteps;
      const sourceCenter = sourceContact.hostPoint;
      let authored = {
        x: p.center.x - sourceCenter.x,
        y: p.center.y - sourceCenter.y,
      };
      if (Math.hypot(authored.x, authored.y) < 0.1)
        authored = {
          x: p.center.x - (owner?.sourceCenter.x ?? parent.center.x),
          y: p.center.y - (owner?.sourceCenter.y ?? parent.center.y),
        };
      if (Math.hypot(authored.x, authored.y) < 0.1) authored = { x: 0, y: -1 };
      const originalLength = Math.hypot(authored.x, authored.y);
      if (originalLength > 0.1) {
        const chest = apply(fixedParent, sourceCenter),
          probe = apply(fixedParent, {
            x: sourceCenter.x + authored.x / originalLength,
            y: sourceCenter.y + authored.y / originalLength,
          });
        const norm = Math.max(0.001, distance(chest, probe)),
          direction = {
            x: (probe.x - chest.x) / norm,
            y: (probe.y - chest.y) / norm,
          },
          across = { x: -direction.y, y: direction.x };
        let skin = occupiedHostCache.get(parent.id);
        if (!skin) {
          const materials = regionalParent
            ? domainMaterials(program)
            : [{ id: parent.id, tissue: parent.source }];
          skin = [];
          for (const material of materials) {
            const domain = regionalLayout.domains.find(
              (domain) => domain.id === material.id,
            );
            const hostMap = domain
              ? parentSteps.map((step) =>
                  step.regional
                    ? {
                        ...step,
                        regional: {
                          ...step.regional,
                          fixedDomainId: domain.id,
                        },
                      }
                    : step,
                )
              : parentSteps;
            const radius = domain
              ? materialBandRadius(domain.sourceCenter, parent.id)
              : 0;
            for (const cell of grownMaterialCells(
              material.tissue,
              radius,
              2.5,
              parent.source,
            )) {
              skin.push(apply(hostMap, cell));
              for (const dx of [-0.5, 0.5])
                for (const dy of [-0.5, 0.5])
                  skin.push(apply(hostMap, { x: cell.x + dx, y: cell.y + dy }));
            }
          }
          occupiedHostCache.set(parent.id, skin);
        }
        const center = apply(steps, p.center),
          dot = (point: Point, axis: Point) =>
            point.x * axis.x + point.y * axis.y;
        const projected = p.source.cells.flatMap((cell) =>
          [-0.5, 0.5].flatMap((dx) =>
            [-0.5, 0.5].map((dy) =>
              apply(steps, { x: cell.x + dx, y: cell.y + dy }),
            ),
          ),
        );
        const along = projected.map((point) =>
          dot({ x: point.x - center.x, y: point.y - center.y }, direction),
        );
        const side = projected.map((point) =>
          dot({ x: point.x - center.x, y: point.y - center.y }, across),
        );
        const headRadius = Math.max(
            0.5,
            (Math.max(...along) - Math.min(...along)) / 2,
          ),
          crossRadius = Math.max(
            0.5,
            (Math.max(...side) - Math.min(...side)) / 2,
          );
        const corridor = skin.filter(
          (point) =>
            Math.abs(
              dot({ x: point.x - chest.x, y: point.y - chest.y }, across),
            ) <=
            crossRadius * 0.85 + 0.5,
        );
        if (corridor.length) {
          const outer = Math.max(
            ...corridor.map((point) =>
              dot({ x: point.x - chest.x, y: point.y - chest.y }, direction),
            ),
          );
          const current = dot(
              { x: center.x - chest.x, y: center.y - chest.y },
              direction,
            ),
            exposureBias =
              ADAPTATION_RULES.trust.headOverlapDeficit *
                appliedActiveSignals.trust.load -
              ADAPTATION_RULES.trust.headOverlapOpportunity *
                appliedActiveSignals.trust.opportunity,
            overlap = headRadius * (0.35 + exposureBias);
          const sourceGap = sourceContact.gap * norm;
          // Resolve both burial and unintended tethering. Explicit authored
          // neck tissue remains part of the host; its occupied tip is the root.
          const maximumNeckLength = Math.max(
            sourceGap,
            regionalLayout.ports[p.id]?.maximumNeckLength ?? headRadius * 0.4,
          );
          const contact =
            outer - Math.min(...along) + Math.min(sourceGap, maximumNeckLength);
          const desired = clamp(
            current,
            contact - headRadius * clamp(0.4 + exposureBias, 0.05, 0.75),
            contact - headRadius * clamp(0.2 + exposureBias, -0.08, 0.6),
          );
          const needed = desired - current;
          const onset = regionalParent
            ? program.stages[0].operations[0].start
            : 1;
          const activation = ease((age - onset) / 7),
            amount = needed * activation;
          const lateral =
            -dot({ x: center.x - chest.x, y: center.y - chest.y }, across) *
            activation;
          if (Math.abs(amount) + Math.abs(lateral) > 1e-6) {
            const step = identity(center, {
              x: Math.max(1, p.width / 2),
              y: Math.max(1, p.height / 2),
            });
            step.target = pt(
              center.x + direction.x * amount + across.x * lateral,
              center.y + direction.y * amount + across.y * lateral,
            );
            steps.push(step);
          }
          headClearances.push({
            sourceId: p.id,
            hostId: owner ? domainRegionId(program, owner.id) : parent.id,
            amount,
            direction,
            projectedOverlap: overlap,
            authoredGap: sourceGap,
            maximumNeckLength,
          });
        }
      }
    }
    const a = appliedActiveSignals,
      hasParentArm = parent?.kind === "arm";
    const isEffector =
      ["arm", "tail", "wing"].includes(p.kind) ||
      (p.kind === "hand" && !hasParentArm);
    const isSupport = p.kind === "leg";
    if (p.source.relationship !== "floating" && (isEffector || isSupport)) {
      const length = isSupport
        ? clamp(
            1 -
              ADAPTATION_RULES.rest.supportLengthLoss * a.rest.load -
              ADAPTATION_RULES["physical-fitness"].supportLengthLoss *
                a["physical-fitness"].load +
              ADAPTATION_RULES.rest.supportLengthGain * a.rest.opportunity +
              ADAPTATION_RULES["physical-fitness"].supportLengthGain *
                a["physical-fitness"].opportunity,
            0.72,
            1.18,
          )
        : clamp(
            1 -
              ADAPTATION_RULES.safety.effectorRetraction * a.safety.load -
              ADAPTATION_RULES.security.effectorRetraction * a.security.load -
              ADAPTATION_RULES.trust.effectorRetraction * a.trust.load -
              ADAPTATION_RULES.relaxation.effectorRetraction *
                a.relaxation.load +
              ADAPTATION_RULES.trust.effectorExtension * a.trust.opportunity,
            0.45,
            1.25,
          );
      const tension = isSupport
        ? 0.18 * a.rest.load +
          0.14 * a["physical-fitness"].load +
          0.12 * a.relaxation.load +
          0.12 * a.security.load
        : 0.25 * a.safety.load + 0.22 * a.trust.load + 0.16 * a.relaxation.load;
      if (Math.abs(length - 1) > 1e-12 || tension > 1e-12) {
        const root = apply(steps, p.pivot),
          tip = apply(steps, p.source.tip),
          norm = distance(root, tip);
        if (norm > 0.01) {
          const axis = {
            x: (tip.x - root.x) / norm,
            y: (tip.y - root.y) / norm,
          };
          let turn = 0;
          if (isSupport) {
            const host = parent
              ? apply(make(parent), parent.center)
              : atlas.center;
            turn = (root.x < host.x ? 1 : -1) * tension;
          } else if (parent) {
            const host = apply(make(parent), parent.center),
              desired = Math.atan2(host.y - root.y, host.x - root.x),
              angle = Math.atan2(axis.y, axis.x);
            turn =
              Math.atan2(Math.sin(desired - angle), Math.cos(desired - angle)) *
              Math.min(0.5, tension);
          }
          const step = identity(root, {
            x: Math.max(1, p.width / 2),
            y: Math.max(1, p.height / 2),
          });
          step.carePose = { axis, length, angle: turn };
          steps.push(step);
          activeRegionResponses.push({
            sourceId: p.id,
            kind: p.kind,
            length,
            angle: turn,
            thickness: clamp(1 + springWidth + chronicWidth, 0.6, 1.45),
          });
        }
      }
    }
    if (
      (p.kind === "eye" || p.kind === "mouth") &&
      parent &&
      parent.kind !== "head" &&
      !sharedFace?.floating &&
      age > 0 &&
      program.morphogenesis.facialPlasticity > 0
    ) {
      const center = apply(steps, p.center);
      const carrier = apply(steps, sharedFace?.center ?? parent.center);
      const step = identity(center, {
        x: Math.max(1, p.width / 2),
        y: Math.max(1, p.height / 2),
      });
      const desired = pt(
        carrier.x + (center.x - carrier.x) * inheritedFace.spacing,
        carrier.y +
          (center.y - carrier.y) * inheritedFace.spacing +
          inheritedFace.lift * Math.min(4, parent.height * 0.2),
      );
      let skin = occupiedHostCache.get(`facial/${parent.id}`);
      if (!skin) {
        skin = parent.source.cells.map((cell) => apply(make(parent), cell));
        occupiedHostCache.set(`facial/${parent.id}`, skin);
      }
      const nearest = skin.reduce(
        (best, cell) =>
          distance(cell, desired) < distance(best, desired) ? cell : best,
        skin[0] ?? desired,
      );
      // A feature can move across its own skin, but does not jump off a parent
      // into empty world space. Deliberately floating faces retain their carrier.
      step.target = distance(nearest, desired) > 1.5 ? nearest : desired;
      const scale =
        p.kind === "eye" ? inheritedFace.eyeScale : inheritedFace.mouthScale;
      step.scale = {
        x: scale,
        y: p.kind === "mouth" ? Math.sqrt(scale) : scale,
      };
      steps.push(step);
    }
    if (regionalBody) {
      const voids = atlas.faceIslands
        .filter(
          (face) =>
            face.hostId === p.id && face.floating && face.voidCells?.length,
        )
        .map((face) => {
          const frame = facialFrame(face, steps);
          return {
            sourceCenter: face.center,
            center: apply([frame], face.center),
            angle: frame.angle,
            scale: frame.scale.x,
            cells: face.voidCells!,
          };
        });
      if (voids.length) {
        const guard = identity(p.center, { x: p.width / 2, y: p.height / 2 });
        guard.faceVoids = voids;
        steps.push(guard);
      }
    }
    visiting.delete(p.id);
    maps.set(p.id, steps);
    return steps;
  };
  let regions = atlas.patches
    .filter((p) => (absorption.get(p.id) ?? 0) < 0.9999)
    .flatMap((p) => {
      if (p.id === regionalSourceId && age > 0) {
        const steps = make(p);
        return domainMaterials(program)
          .map((material) => {
            const cranial = material.cranial
              ? regionalLayout.cranium
              : undefined;
            const domain = regionalLayout.domains.find(
              (domain) => domain.id === material.id,
            );
            if (!domain && !cranial) return undefined;
            const fixed = steps.map((step) =>
              step.regional
                ? {
                    ...step,
                    regional: { ...step.regional, fixedDomainId: material.id },
                  }
                : step,
            );
            const r = sourceRegion(
              material.tissue,
              fixed,
              cranial ? "cranium" : domain!.role,
              material.boundary,
            );
            r.id = cranial ? cranial.id : domainRegionId(program, domain!.id);
            r.parentId = cranial
              ? domainRegionId(program, cranial.hostDomainId)
              : r.id === p.id
                ? p.source.parentId
                : p.id;
            r.sourceIds = [p.id];
            r.sourceDomain = {
              id: material.id,
              sourceId: p.id,
              uMin: domain?.uMin ?? 0,
              uMax: domain?.uMax ?? 1,
              role: cranial ? "cranium" : domain!.role,
            };
            r.lineage = [...new Set([p.id, r.id])];
            r.materialGrowth = {
              radius: cranial
                ? 0.35 * cranial.activation
                : materialBandRadius(domain!.sourceCenter, p.id),
              maxRadius: 2.5,
              sourceDomainId: material.id,
              cavitySource: p.source,
            };
            r.spine = p.centerline
              .filter((point) => {
                const owner = sourceDomainAt(program.regionalLayout, point);
                return !cranial && owner?.id === domain!.id;
              })
              .map((point) => mapSourcePoint(r, point));
            return r;
          })
          .filter((r): r is Region => !!r);
      }
      const r = sourceRegion(
        p.source,
        make(p),
        p.kind === "body" || p.kind === "egg" ? "trunk" : p.kind,
        p.boundary,
      );
      // An enclosed outline can carry facial ink through empty interior space.
      // The face island controls that geometry; keep the authored ownership
      // relationship so enclosed head features remain surface attachments.
      r.readiness = 1 - (absorption.get(p.id) ?? 0);
      const conversion = repurposed.get(p.id);
      if (conversion) r.repurpose = { ...conversion };
      if (p.source.bulk)
        r.spine = p.centerline.map((point) => mapSourcePoint(r, point));
      return [r];
    });
  if (age > 0 && regionalSourceId) {
    for (const r of regions) {
      if (!r.source || r.sourceDomain || r.parentId !== regionalSourceId)
        continue;
      const p = patchById.get(r.source.id);
      if (!p) continue;
      const face = faceBySource.get(p.id);
      if (face?.material && regionalLayout.cranium?.faceId === face.id) {
        r.parentId = regionalLayout.cranium.id;
        continue;
      }
      const root =
        (p.kind === "head" &&
        p.source.relationship !== "floating" &&
        p.source.parentId &&
        patchById.get(p.source.parentId)
          ? sourceHeadContact(
              p.source,
              patchById.get(p.source.parentId)!.source,
            ).hostPoint
          : undefined) ??
        (face?.floating ? face.carrierPoint : undefined) ??
        repurposed.get(p.id)?.materialRoot ??
        (p.source.relationship === "floating"
          ? (p.source.carrierPoint ?? p.center)
          : p.pivot);
      const owner = sourceDomainAt(program.regionalLayout, root);
      if (owner) r.parentId = domainRegionId(program, owner.id);
    }
  }
  const byId = new Map(regions.map((r) => [r.id, r]));
  const facialWindows = atlas.faceIslands
    .filter((face) => face.floating && face.voidCells?.length)
    .map((face) => {
      const parent = face.hostId ? patchById.get(face.hostId) : undefined;
      const frame = facialFrame(face, parent ? make(parent) : common);
      const carrierRegionId =
        regions.find((r) => face.primarySourceIds?.includes(r.id))?.parentId ??
        null;
      return {
        id: face.id,
        hostSourceId: face.hostId,
        carrierRegionId,
        sourceIds: [...face.sourceIds],
        quads: face.voidCells!.map((cell) =>
          [
            [-0.5, -0.5],
            [0.5, -0.5],
            [0.5, 0.5],
            [-0.5, 0.5],
          ].map(([x, y]) => apply([frame], { x: cell.x + x, y: cell.y + y })),
        ),
      };
    });
  const resorptionRecords = [...absorption.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => {
      const p = patchById.get(id)!;
      let successor = p.source.parentId;
      const seen = new Set<string>([id]);
      while (successor && !byId.has(successor) && !seen.has(successor)) {
        seen.add(successor);
        successor = patchById.get(successor)?.source.parentId ?? null;
      }
      successor =
        successor && byId.has(successor) ? successor : (main?.id ?? null);
      const host = successor ? byId.get(successor) : undefined;
      if (host) {
        host.sourceIds = [...new Set([...host.sourceIds, id])].sort(
          compareText,
        );
        host.lineage = [...new Set([...(host.lineage ?? []), id])];
      }
      const stage = decisions.findIndex((d) => d.functional === "absorb");
      return {
        sourceId: id,
        successorId: successor,
        progress: amount,
        committedBy: stage >= 0 ? program.stages[stage].operations[1].id : null,
        reason:
          "inherited absorption with material lineage transferred to surviving carrier",
      };
    });
  const generatedRegions: Region[] = [];
  const generatedLimit = metamorphosisPhase.enclosure > 0 ? 30 : 32;
  const push = (r: Region) => {
    if (
      generatedRegions.length < generatedLimit &&
      r.readiness > 0.0001 &&
      r.rx > 0.04
    )
      generatedRegions.push(r);
  };
  if (regionalLayout.cranium && age > 0) {
    const cranium = byId.get(regionalLayout.cranium.id),
      material = domainMaterials(program).find((d) => d.cranial);
    if (cranium?.source && material) {
      let best:
        | { host: Region; sourceHead: Point; a: Point; b: Point; gap: number }
        | undefined;
      for (const domain of domainMaterials(program).filter((d) => !d.cranial)) {
        const host = byId.get(domainRegionId(program, domain.id));
        if (!host?.source) continue;
        for (const seam of materialSeams(program, material.id, domain.id))
          for (const pair of seam.pairs) {
            const a = mapSourcePoint(host, pair.b),
              b = mapSourcePoint(cranium, pair.a),
              gap = distance(a, b);
            if (!best || gap < best.gap)
              best = { host, sourceHead: pair.a, a, b, gap };
          }
      }
      if (best) {
        cranium.parentId = best.host.id;
        cranium.anchor = best.b;
        cranium.anchorSourcePoint = { ...best.sourceHead };
        if (best.gap > 0.8) {
          const neck = generated(
            `${cranium.id}/neck`,
            best.host,
            "body",
            "neck",
            best.a,
            best.b,
            Math.max(
              0.65,
              Math.min(4, Math.min(cranium.rx, cranium.ry) * 0.45),
            ),
            1,
          );
          neck.sourceIds = [...cranium.sourceIds];
          neck.lineage = [
            ...new Set([...cranium.sourceIds, cranium.id, neck.id]),
          ];
          push(neck);
        }
      }
    }
  }
  // Broad tissue waists connect actual occupied skins of neighboring source
  // masses. They are material relationships, not a global axis-bending trick.
  const regionalConnections: {
    id: string;
    from: string;
    to: string;
    radius: number;
    gap: number;
  }[] = [];
  for (const connection of regionalLayout.connections) {
    if (connection.expression <= 0 || age === 0) continue;
    const a = byId.get(domainRegionId(program, connection.fromDomainId)),
      b = byId.get(domainRegionId(program, connection.toDomainId));
    if (!a?.source || !b?.source) continue;
    for (const seam of materialSeams(
      program,
      connection.fromDomainId,
      connection.toDomainId,
    )) {
      let start = mapSourcePoint(a, seam.pairs[0].a),
        end = mapSourcePoint(b, seam.pairs[0].b),
        best = Infinity;
      for (const pair of seam.pairs) {
        const p = mapSourcePoint(a, pair.a),
          q = mapSourcePoint(b, pair.b);
        const gap = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
        if (gap < best) {
          best = gap;
          start = p;
          end = q;
        }
      }
      if (best <= 0.25) continue;
      const da = regionalLayout.domains.find(
          (d) => d.id === connection.fromDomainId,
        )!,
        db = regionalLayout.domains.find(
          (d) => d.id === connection.toDomainId,
        )!;
      const scale = Math.min(
        5,
        (Math.sqrt(
          (da.radius.x * da.radius.y) /
            Math.max(0.25, da.sourceRadius.x * da.sourceRadius.y),
        ) +
          Math.sqrt(
            (db.radius.x * db.radius.y) /
              Math.max(0.25, db.sourceRadius.x * db.sourceRadius.y),
          )) /
          2,
      );
      const radius =
        Math.max(
          0.4,
          Math.min(
            3.6,
            connection.radius,
            seam.halfThickness * scale * 0.7 + 0.25,
          ),
        ) * connection.expression;
      const bridge = generated(
        `${regionalSourceId}/waist/${regionalConnections.length}`,
        a,
        "body",
        "bridge",
        start,
        end,
        radius,
        1,
      );
      bridge.sourceIds = [...new Set([...a.sourceIds, ...b.sourceIds])];
      bridge.lineage = [
        ...new Set([...(a.lineage ?? []), ...(b.lineage ?? []), bridge.id]),
      ];
      bridge.topologyGroup = `${regionalSourceId}/regional-body`;
      a.topologyGroup = b.topologyGroup = bridge.topologyGroup;
      push(bridge);
      regionalConnections.push({
        id: bridge.id,
        from: a.id,
        to: b.id,
        radius,
        gap: Math.sqrt(best),
      });
    }
  }
  const splitDone = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const s = program.stages[i],
      u = progress(s.operations[0], age);
    if (u <= 0 || decisions[i].mass !== "split") continue;
    const candidate = [...bulk]
      .filter(
        (p) =>
          p.kind !== "head" &&
          p.id !== regionalSourceId &&
          !splitDone.has(p.id),
      )
      .sort(patchOrder)
      .find((p) => splitCut(program, p));
    if (!candidate) continue;
    const cut = splitCut(program, candidate)!,
      r = byId.get(candidate.id);
    if (!r) continue;
    splitDone.add(candidate.id);
    // Material halves are disjoint. A narrow living isthmus retains intentional structural contact.
    const origin = mapSourcePoint(r, candidate.center),
      step = identity(origin, { x: 1, y: 1 });
    const transformedCut = mapSourcePoint(
      r,
      cut.axis === "x"
        ? { x: cut.at, y: candidate.center.y }
        : { x: candidate.center.x, y: cut.at },
    );
    const tangent = mapSourcePoint(
      r,
      cut.axis === "x"
        ? { x: cut.at + 1, y: candidate.center.y }
        : { x: candidate.center.x, y: cut.at + 1 },
    );
    const length = Math.max(0.01, distance(transformedCut, tangent));
    const extent = cut.axis === "x" ? r.rx : r.ry;
    const laterFusion = Math.max(
      0,
      ...program.stages
        .slice(i + 1)
        .map((later, offset) =>
          decisions[i + 1 + offset].mass === "fuse"
            ? progress(later.operations[0], age)
            : 0,
        ),
    );
    step.partition = {
      axis: cut.axis,
      at: cut.at,
      gap: Math.min(6, Math.max(1.8, extent * 0.42)) * u * (1 - laterFusion),
      direction: {
        x: (tangent.x - transformedCut.x) / length,
        y: (tangent.y - transformedCut.y) / length,
      },
    };
    // Apply the same split step to descendants; their landmark identity remains single.
    for (const p of atlas.patches) {
      let parent: SourcePatch | undefined = p;
      const seen = new Set<string>();
      let belongs = false;
      while (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        if (parent.id === candidate.id) {
          belongs = true;
          break;
        }
        parent = patchById.get(parent.source.parentId ?? "");
      }
      const rr = byId.get(p.id);
      if (belongs && rr?.sourceWarp) {
        let conversionCarrier: SourcePatch | undefined = p,
          materialRoot: Point | undefined;
        const seenCarrier = new Set<string>();
        while (conversionCarrier && !seenCarrier.has(conversionCarrier.id)) {
          seenCarrier.add(conversionCarrier.id);
          materialRoot = repurposed.get(conversionCarrier.id)?.materialRoot;
          if (materialRoot) break;
          conversionCarrier = patchById.get(
            conversionCarrier.source.parentId ?? "",
          );
        }
        const extra =
          p.source.relationship === "floating" || materialRoot
            ? {
                ...step,
                partition: {
                  ...step.partition!,
                  classification:
                    materialRoot ?? p.source.carrierPoint ?? candidate.center,
                },
              }
            : step;
        rr.sourceWarp = { steps: [...rr.sourceWarp.steps, extra] };
        rr.center = mapSourcePoint(rr, p.center);
        rr.anchor = mapSourcePoint(rr, p.pivot);
        rr.tip = mapSourcePoint(rr, p.source.tip);
      }
    }
    r.sourceClip = { axis: cut.axis, min: -Infinity, max: cut.at };
    r.role = "divided-trunk";
    r.operationId = s.operations[0].id;
    const half: Region = {
      ...r,
      id: `${candidate.id}/division`,
      parentId: r.id,
      sourceClip: { axis: cut.axis, min: cut.at, max: Infinity },
      sourceIds: [...r.sourceIds],
      lineage: [...r.sourceIds, `${candidate.id}/division`],
      role: "segment",
      readiness: u,
    };
    push(half);
    if (laterFusion > 0) {
      r.topologyGroup =
        half.topologyGroup = `${candidate.id}/reunified-material`;
      r.lineage = [...new Set([...(r.lineage ?? []), half.id])];
    }
    for (const rr of regions) {
      const child = rr.source;
      const classification =
        repurposed.get(child?.id ?? "")?.materialRoot ??
        (child?.relationship === "floating"
          ? (child.carrierPoint ?? child.center)
          : child?.center);
      if (
        rr.parentId === candidate.id &&
        classification &&
        (cut.axis === "x" ? classification.x : classification.y) >= cut.at
      )
        rr.parentId = half.id;
    }
    const coordinate = (p: Point) => (cut.axis === "x" ? p.x : p.y);
    const candidatesAtCut = (lower: boolean) =>
      candidate.source.cells
        .filter((p) => coordinate(p) < cut.at === lower)
        .sort(
          (a, b) =>
            Math.abs(coordinate(a) - cut.at) -
              Math.abs(coordinate(b) - cut.at) ||
            distance(a, candidate.center) - distance(b, candidate.center) ||
            a.y - b.y ||
            a.x - b.x,
        )
        .slice(0, 16);
    const left = candidatesAtCut(true),
      right = candidatesAtCut(false);
    let pair: [Point, Point] = [left[0], right[0]],
      gap = Infinity;
    for (const l of left)
      for (const rr of right) {
        const score =
          distance(l, rr) +
          0.02 *
            (distance(l, candidate.center) + distance(rr, candidate.center));
        if (score < gap) {
          gap = score;
          pair = [l, rr];
        }
      }
    // Each endpoint belongs to its own clipped half. Clamping both through the
    // first half would silently put the whole bridge on one side of the seam.
    const a = mapSourcePoint(r, pair[0]);
    const b = mapSourcePoint(half, pair[1]);
    push(
      generated(
        `${candidate.id}/isthmus`,
        r,
        "body",
        "bridge",
        a,
        b,
        Math.max(0.72, Math.min(r.rx, r.ry) * 0.12 * u),
        u,
      ),
    );
  }
  // Fusion preserves both source domains; the new bridge has genuine many-to-many lineage.
  for (let i = 0; i < 3; i++) {
    const u = progress(program.stages[i].operations[0], age);
    if (!u || decisions[i].mass !== "fuse") continue;
    const candidates = bulk.filter((p) => p.kind !== "head").sort(patchOrder);
    let pair: [SourcePatch, SourcePatch] | undefined,
      best = Infinity;
    for (let a = 0; a < candidates.length; a++)
      for (let b = a + 1; b < candidates.length; b++) {
        const gap =
          distance(candidates[a].center, candidates[b].center) -
          (candidates[a].width + candidates[b].width) * 0.25;
        if (gap < best) {
          best = gap;
          pair = [candidates[a], candidates[b]];
        }
      }
    if (!pair || best > 14) continue;
    const a = byId.get(pair[0].id),
      b = byId.get(pair[1].id);
    if (!a || !b) continue;
    const bridge = generated(
      `fusion/${i}`,
      a,
      "body",
      "bridge",
      a.center,
      b.center,
      Math.max(0.55, Math.min(a.rx, b.rx) * 0.22) * u,
      u,
    );
    bridge.sourceIds = [...new Set([...a.sourceIds, ...b.sourceIds])].sort(
      compareText,
    );
    bridge.lineage = [...bridge.sourceIds, bridge.id];
    a.topologyGroup = b.topologyGroup = bridge.id;
    push(bridge);
  }
  const host = main && byId.get(main.id);
  const inheritedGroom = host
    ? grooming?.byRegion[host.source?.id ?? host.sourceIds[0]]
    : undefined;
  const appendageFactor = 1 - 0.8 * metamorphosisPhase.enclosure;
  const inheritedTip = (anchor: Point, tip: Point) => {
    let result = tip;
    if (
      inheritedGroom &&
      (Math.abs(inheritedGroom.lengthDelta) > 1e-12 ||
        Math.abs(inheritedGroom.bendRadians) > 1e-12)
    ) {
      const angle = inheritedGroom.bendRadians * 0.55,
        factor = 1 + inheritedGroom.lengthDelta * 0.55;
      const c = Math.cos(angle),
        s = Math.sin(angle),
        x = (tip.x - anchor.x) * factor,
        y = (tip.y - anchor.y) * factor;
      result = pt(anchor.x + x * c - y * s, anchor.y + x * s + y * c);
    }
    if (metamorphosisPhase.enclosure <= 0 || !host) return result;
    const dx = result.x - anchor.x,
      dy = result.y - anchor.y;
    const target = Math.atan2(
        host.center.y - anchor.y,
        host.center.x - anchor.x,
      ),
      current = Math.atan2(dy, dx);
    const angle =
      Math.atan2(Math.sin(target - current), Math.cos(target - current)) *
      0.9 *
      metamorphosisPhase.enclosure;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    return pt(
      anchor.x + (dx * c - dy * s) * appendageFactor,
      anchor.y + (dx * s + dy * c) * appendageFactor,
    );
  };
  const occupiedRoot = (point: Point): Point =>
    main
      ? main.source.cells.reduce((best, p) =>
          distance(p, point) < distance(best, point) ||
          (distance(p, point) === distance(best, point) &&
            (p.y < best.y || (p.y === best.y && p.x < best.x)))
            ? p
            : best,
        )
      : point;
  let addedSupport = false,
    addedMembrane = false;
  if (host && main && main.area >= 8)
    for (let i = 0; i < 3; i++) {
      const s = program.stages[i],
        ready = progress(s.operations[1], age),
        choice = decisions[i].functional;
      if (!ready) continue;
      if (choice === "support" && !addedSupport) {
        addedSupport = true;
        for (const side of [-1, 1]) {
          const sourceRoot = {
            x: main.center.x + side * main.width * 0.22,
            y: main.source.bounds.y + main.height * 0.76,
          };
          const a = mapSourcePoint(host, occupiedRoot(sourceRoot)),
            length =
              (Math.max(3.5, host.ry * 0.9 + host.rx * 0.12) + i * 0.8) * ready;
          const b = inheritedTip(
            a,
            pt(a.x + side * length * 0.23, a.y + length),
          );
          const role = side < 0 ? "left" : "right";
          const leg = generated(
            `support/${role}`,
            host,
            "leg",
            role,
            a,
            b,
            Math.max(0.6, host.rx * 0.12) * ready * appendageFactor,
            ready,
          );
          leg.operationId = s.operations[1].id;
          push(leg);
          const foot = generated(
            `support/${role}/foot`,
            leg,
            "foot",
            role,
            b,
            b,
            Math.max(0.7, host.rx * 0.18) * ready * appendageFactor,
            ready,
            "ellipse",
          );
          foot.ry =
            Math.max(0.45, main.height * 0.07) * ready * appendageFactor;
          push(foot);
        }
      }
      if (choice === "membrane" && !addedMembrane) {
        addedMembrane = true;
        for (const side of [-1, 1]) {
          const sourceRoot = {
            x: main.center.x + side * main.width * 0.26,
            y: main.center.y - main.height * 0.14,
          };
          const a = mapSourcePoint(host, occupiedRoot(sourceRoot)),
            length = Math.max(5, host.rx * 1.2 + host.ry * 0.4) * ready;
          const b = inheritedTip(
            a,
            pt(a.x + side * length, a.y - length * 0.45),
          );
          const wing = generated(
            `membrane/${side}`,
            host,
            "wing",
            "membrane",
            a,
            b,
            length * 0.55 * appendageFactor,
            ready,
            "membrane",
          );
          wing.ry = length * 0.42 * appendageFactor;
          wing.layer = 50;
          wing.operationId = s.operations[1].id;
          push(wing);
        }
      }
    }
  // A shared developmental grammar supplies rooted anatomy even when the player
  // drew only a body and face. These potentials are seeded; they never read
  // character names, reference sprites or an evaluator's target geometry.
  if (host && main && main.area >= 12) {
    const authored = new Set(atlas.patches.map((patch) => patch.kind));
    const allNow = () => [...regions, ...generatedRegions];
    const frameAngle = Math.atan2(facing.y, facing.x);
    const direction = (x: number, y: number) => ({
      x: x * Math.cos(frameAngle) - y * Math.sin(frameAngle),
      y: x * Math.sin(frameAngle) + y * Math.cos(frameAngle),
    });
    for (const bud of program.morphogenesis.buds) {
      if (!bud.enabled) continue;
      if (bud.family === "support" && program.genome.limbless) continue;
      const operation = program.stages[bud.stage].operations[1];
      const ready = progress(operation, age);
      if (ready <= 0) continue;
      const kind: PartKind =
        bud.family === "support"
          ? "leg"
          : bud.family === "manipulator"
            ? "arm"
            : bud.family === "crest"
              ? "horn"
              : bud.family;
      if (authored.has(kind)) continue;
      // Legacy support growth is the same semantic tissue, not a second pair
      // superimposed on it. Extra pairs are available through their own genes.
      const legacyPair =
        bud.family === "support" &&
        allNow().some((r) => r.id.startsWith("support/"));
      const pairCount = bud.family === "support" ? bud.pairs : 1;
      const entries =
        bud.family === "tail" || bud.family === "crest" ? [0] : [-1, 1];
      const extension =
        Math.max(2, Math.min(10, Math.sqrt(main.area) * 0.7)) *
        bud.length *
        ready *
        (1 + care.fitnessOpportunity * 0.14 - care.rest * 0.08);
      const baseWidth =
        Math.max(0.55, Math.min(2.5, Math.sqrt(main.area) * 0.09)) *
        bud.thickness *
        ready;
      for (let pair = 0; pair < pairCount; pair++) {
        if (legacyPair && pair === 0) continue;
        for (const side of entries) {
          const support = bud.family === "support";
          const anterior = ["horn", "ear", "crest"].includes(bud.family);
          const longitudinal =
            bud.family === "tail"
              ? -0.48
              : anterior
                ? 0.34
                : support
                  ? -0.24 + pair * 0.42
                  : 0.19;
          const transverse = support
            ? side * 0.18
            : anterior
              ? side * 0.2
              : side * 0.35;
          const offset = direction(
            longitudinal * main.width,
            transverse * main.height,
          );
          const root = mapSourcePoint(
            host,
            occupiedRoot({
              x: main.center.x + offset.x,
              y: main.center.y + offset.y,
            }),
          );
          const vector =
            bud.family === "tail"
              ? direction(-1, bud.bend)
              : anterior
                ? direction(0.45 + side * bud.spread * 0.2, -0.8 + side * 0.25)
                : support
                  ? { x: side * bud.spread * 0.25, y: 1 }
                  : { x: side * (0.7 + bud.spread * 0.3), y: 0.2 + bud.bend };
          const norm = Math.max(0.01, Math.hypot(vector.x, vector.y));
          const tip = inheritedTip(
            root,
            pt(
              root.x + (vector.x / norm) * extension,
              root.y + (vector.y / norm) * extension,
            ),
          );
          const id = `bud/${bud.family}/${pair}/${side}`;
          const role = support
            ? `${pair ? "fore" : "hind"}-${side < 0 ? "left" : "right"}`
            : side < 0
              ? "left"
              : "right";
          const region = generated(
            id,
            host,
            kind,
            role,
            root,
            tip,
            baseWidth * (bud.family === "ear" ? 1.5 : 1),
            ready,
            bud.family === "ear" ? "membrane" : "limb",
          );
          region.operationId = operation.id;
          region.layer = anterior ? 88 : 89;
          push(region);
          if (support || bud.family === "manipulator") {
            const terminal = generated(
              `${id}/terminal`,
              region,
              support ? "foot" : "hand",
              role,
              tip,
              tip,
              baseWidth * (support ? 1.45 : 1.2),
              ready,
              "ellipse",
            );
            terminal.ry = Math.max(0.5, baseWidth * 0.6);
            terminal.operationId = operation.id;
            push(terminal);
          }
        }
      }
    }
  }
  // Structural necks bind occupied current host material to occupied head skin;
  // extrapolated original pivots can sit beside a coiled or divided body.
  const currentRegions = new Map(
    [...regions, ...generatedRegions].map((r) => [r.id, r]),
  );
  for (const p of atlas.patches.filter(
    (p) =>
      p.kind === "head" &&
      p.source.parentId &&
      p.source.relationship !== "floating",
  )) {
    const head = currentRegions.get(p.id),
      parent = head?.parentId ? currentRegions.get(head.parentId) : undefined;
    if (!head?.source || !parent?.source) continue;
    const occupied = (r: Region) =>
      r.source!.cells.filter(
        (cell) =>
          !r.sourceClip ||
          (cell[r.sourceClip.axis] >= r.sourceClip.min &&
            cell[r.sourceClip.axis] < r.sourceClip.max),
      );
    const headCells = occupied(head),
      hostCells = occupied(parent);
    if (!headCells.length || !hostCells.length) continue;
    const headSkin = headCells.map((cell) => ({
      cell,
      point: mapSourcePoint(head, cell),
    }));
    const hostSkin = hostCells.map((cell) => ({
      cell,
      point: mapSourcePoint(parent, cell),
    }));
    let headEnd = headSkin[0],
      hostEnd = hostSkin[0],
      bestGap = Infinity;
    // Exact nearest occupied pair avoids routing a neck through an outlined
    // head's empty center, and does not add tissue when the masks already touch.
    for (const hp of headSkin) {
      for (const bp of hostSkin) {
        const d =
          (hp.point.x - bp.point.x) ** 2 + (hp.point.y - bp.point.y) ** 2;
        if (d < bestGap - 1e-10) {
          bestGap = d;
          headEnd = hp;
          hostEnd = bp;
        }
      }
      if (bestGap <= 1e-10) break;
    }
    if (bestGap > 1) {
      const authoredHost = atlas.patches.find(
        (patch) => patch.id === p.source.parentId,
      )?.source;
      if (authoredHost) {
        const connectedSkin = headAttachmentSkin(atlas, p.source, authoredHost);
        if (
          connectedSkin.size &&
          !connectedSkin.has(`${headEnd.cell.x},${headEnd.cell.y}`)
        ) {
          const contact = sourceHeadContact(p.source, authoredHost).headPoint;
          const candidates = headSkin.filter((hp) =>
            connectedSkin.has(`${hp.cell.x},${hp.cell.y}`),
          );
          // Retain the authored attachment side rather than selecting another
          // front-facing corner merely because the new chest is close to it.
          candidates.sort(
            (a, b) =>
              distance(a.cell, contact) - distance(b.cell, contact) ||
              a.cell.y - b.cell.y ||
              a.cell.x - b.cell.x,
          );
          headEnd = candidates[0] ?? headEnd;
          hostEnd = hostSkin.reduce((best, hp) =>
            distance(hp.point, headEnd.point) <
            distance(best.point, headEnd.point)
              ? hp
              : best,
          );
        }
      }
    }
    const anchorCell = headEnd.cell,
      b = headEnd.point,
      a = hostEnd.point;
    head.anchor = b;
    head.anchorSourcePoint = { x: anchorCell.x, y: anchorCell.y };
    if (distance(a, b) > 1) {
      const neck = generated(
        `${p.id}/neck`,
        parent,
        "body",
        "neck",
        a,
        b,
        Math.max(0.6, Math.min(4, Math.min(head.rx, head.ry) * 0.4)),
        1,
      );
      neck.sourceIds = [
        ...new Set([...parent.sourceIds, ...head.sourceIds]),
      ].sort(compareText);
      neck.lineage = [...neck.sourceIds, neck.id];
      push(neck);
    }
  }
  regions = [...regions, ...generatedRegions];
  let preferred = "";
  const legs = regions.filter(
    (r) =>
      r.kind === "leg" &&
      r.readiness > 0.65 &&
      (!r.repurpose || r.repurpose.progress < 0.22) &&
      distance(r.anchor, r.tip) > 0.6 &&
      r.source?.relationship !== "floating",
  );
  const wings = regions.filter(
    (r) => r.kind === "wing" && r.role === "membrane" && r.readiness > 0.8,
  );
  if (
    springExpression > 0.55 &&
    legs.length >= 2 &&
    metamorphosisPhase.enclosure < 0.8
  )
    preferred = "hop";
  else if (wings.length >= 2) preferred = "flutter";
  else if (legs.length >= 4)
    preferred = atlas.descriptors.aspect > 1.2 ? "quadruped" : "crawler";
  else if (legs.length) preferred = "biped";
  else if (main && main.width > main.height * 1.5) preferred = "serpentine";
  else if (main && main.height > main.width * 1.8) preferred = "swim";
  else preferred = "float";
  const fingerprints = program.stages.map(
    (_, i) =>
      `${regionalSourceId ? `regional-${program.regionalLayout.stages[i].axisConfiguration}` : decisions[i].mass}/${decisions[i].functional}/${decisions[i].surface}`,
  );
  const bodyPlanId =
    age === 0 ? "authored" : `material/${fingerprints.join("|")}`;
  return {
    regions,
    facialWindows,
    preferred,
    expression: {
      paceFactor: clamp(
        1 -
          ADAPTATION_RULES.safety.paceLoss * appliedActiveSignals.safety.load -
          ADAPTATION_RULES.security.paceLoss *
            appliedActiveSignals.security.load -
          ADAPTATION_RULES.rest.paceLoss * appliedActiveSignals.rest.load -
          ADAPTATION_RULES.relaxation.paceLoss *
            appliedActiveSignals.relaxation.load -
          ADAPTATION_RULES["physical-fitness"].paceLoss *
            appliedActiveSignals["physical-fitness"].load +
          ADAPTATION_RULES.rest.paceGain *
            appliedActiveSignals.rest.opportunity +
          ADAPTATION_RULES["physical-fitness"].paceGain *
            appliedActiveSignals["physical-fitness"].opportunity,
        0.4,
        1.3,
      ),
      motionFactor: clamp(
        1 -
          ADAPTATION_RULES.rest.motionLoss * appliedActiveSignals.rest.load -
          ADAPTATION_RULES.relaxation.motionLoss *
            appliedActiveSignals.relaxation.load -
          ADAPTATION_RULES["physical-fitness"].motionLoss *
            appliedActiveSignals["physical-fitness"].load,
        0.45,
        1,
      ),
    },
    aging: {
      senescence: clock.senescence,
      paceFactor: 1 - clock.senescence * 0.72,
      motionFactor: 1 - clock.senescence * 0.62,
      remodelingRate: 1 / (90 + clock.remodelingAge),
    },
    protection: clamp(
      0.55 * care.safety + 0.3 * care.security + 0.15 * care.trust,
      0,
      1,
    ),
    vigor: clamp(
      0.75 -
        care.fitness * 0.35 -
        care.rest * 0.18 +
        care.fitnessOpportunity * 0.16,
      0,
      1,
    ),
    recovery: clamp(
      0.75 -
        care.rest * 0.4 -
        care.relaxation * 0.16 +
        care.restOpportunity * 0.2,
      0,
      1,
    ),
    state: {
      developmentalAge: age,
      transitionId,
      progress: transitionProgress,
      bodyPlanId,
      controllerFamily: preferred,
      commitments,
      operations: operations.slice(0, 8),
      anatomy: regions.map((r) => ({
        id: r.id,
        role: r.role,
        sourcePartIds: [...r.sourceIds],
        readiness: r.readiness,
      })),
      diagnostics: {
        clocks: clock,
        senescence: clock.senescence,
        lifelongRemodeling: true,
        futureChannels: [
          "pigment-expression",
          "hair-expression",
          "additional-need-profiles",
        ],
        sourceFingerprint: program.sourceFingerprint,
        geneticFingerprint: program.fingerprint,
        sourceDescriptors: atlas.descriptors,
        lifeProgram: program.lifeProgram,
        regionalAnatomy: {
          sourceId: regionalLayout.sourceId,
          axisConfiguration: regionalLayout.axisConfiguration,
          functionalStrategy: regionalLayout.functionalStrategy,
          plannedFunctionalStrategy,
          springSupport: {
            expression: springExpression,
            allocation: springAllocation,
            minimumReadySupports: 2,
            existingMaterialOnly: true,
          },
          phaseProgress: {
            axis: regionalLayout.axisProgress,
            mass: regionalLayout.massProgress,
            contour: regionalLayout.contourProgress,
          },
          functionalRoleSuccession: {
            stages: roleSuccession,
            activeStage: activeRoleStage,
            manipulation,
            support: 1 - manipulation,
          },
          domains: regionalLayout.domains,
          connections: regionalConnections,
          ports: regionalLayout.ports,
          primaryCenterlineMacro: false,
          sourceMaterialPartition: true,
          headClearances,
        },
        appendageRetraction: {
          amount: metamorphosisPhase.enclosure,
          minimumLengthFactor: 0.2,
          sourcePixelsRetained: true,
        },
        materialTransport: {
          kind: "independent-source-material-cages",
          count: regionalLayout.domains.length,
          parts: regionalLayout.domains.map((domain) => ({
            sourceId: domain.sourceId,
            domainId: domain.id,
            sourceCenter: domain.sourceCenter,
            targetCenter: domain.center,
            sourceRadius: domain.sourceRadius,
            targetRadius: domain.radius,
            angle: domain.angle,
            roundness: domain.roundness,
          })),
          faceIslands: atlas.faceIslands.map((island) => ({
            id: island.id,
            hostId: island.hostId,
            sourceIds: island.sourceIds,
            floating: island.floating,
          })),
          articulatedChildren: "local-rigid-root-carriers",
        },
        needSignals: context,
        activeNeedSignals,
        needResponseSensitivity: {
          inherited: program.sensitivity,
          applied: careSensitivity,
        },
        appliedNeedMagnitudes: {
          slow: appliedContext,
          current: appliedActiveSignals,
        },
        adaptationRulesVersion: ADAPTATION_RULES_VERSION,
        activeRegionResponses,
        regionalAllocation: allocation,
        grooming: {
          input: grooming?.input ?? {
            appliedStrokes: 0,
            acceptedStrength: 0,
            cappedStrength: 0,
            days: [],
          },
          regions: grooming?.byRegion ?? {},
          bindings: groomBindings.map((binding) => ({
            id: binding.id,
            sourceIds: binding.sourceIds,
            materialAnchor: binding.materialAnchor,
            growthAxis: binding.growthAxis,
            influenceRadius: binding.influenceRadius,
            geneticOpportunity: binding.geneticOpportunity,
            sourceAliases: binding.sourceAliases ?? [],
          })),
          generatedInheritance: generatedRegions
            .filter((region) => ["leg", "foot", "wing"].includes(region.kind))
            .map((region) => ({
              id: region.id,
              parentId: region.parentId,
              sourceIds: region.sourceIds,
              parentStrength: 0.55,
              mode: "parent-material-history",
            })),
          changesNeeds: false,
          changesInheritedGenome: false,
          directPaint: false,
        },
        resorptions: resorptionRecords,
        functionalConversions: [...repurposed.values()].map((conversion) => ({
          ...conversion,
          reason: coordinatedSupports
            ? "inherited regional support-role succession; later operations can restore source supports"
            : "inherited axial fusion repurposes the source-leading support pair into reaching effectors",
          committedBy: program.stages[conversion.stage].operations[1].id,
          activeOperationId:
            activeRoleStage >= 0
              ? program.stages[activeRoleStage].operations[1].id
              : null,
          returningToSupport: roleSuccession.length
            ? roleSuccession[roleSuccession.length - 1].target <
              roleSuccession[roleSuccession.length - 1].from
            : false,
        })),
        generatedRegions: generatedRegions.length,
        operationDecisions: program.stages.flatMap((s, i) =>
          s.operations
            .filter((op) => age >= op.start)
            .map((op) => ({
              id: op.id,
              origin: {
                sourceIds: op.hostIds,
                port:
                  op.kind === "replace"
                    ? "support/terminal"
                    : op.kind === "enclose"
                      ? "surface"
                      : "material-domain",
              },
              selected:
                op.kind === "redistribute"
                  ? regionalSourceId
                    ? `regional-${program.regionalLayout.stages[i].axisConfiguration}`
                    : decisions[i].mass
                  : op.kind === "replace"
                    ? decisions[i].functional
                    : decisions[i].surface,
              reason:
                op.kind === "redistribute"
                  ? regionalSourceId
                    ? "source-derived regional mass reorganization with original material domains and anatomical ports"
                    : "inherited strain, source partitions and nearby material domains"
                  : op.kind === "replace"
                    ? "inherited functional potential, usable host ports and resource cost"
                    : "ongoing need-specific protection/display pressure on existing material",
              alternatives:
                op.kind === "replace"
                  ? [
                      {
                        option: "support",
                        inherited: program.genome.supportPotential,
                        permitted:
                          !program.genome.limbless &&
                          !!main &&
                          main.area >= 8 &&
                          atlas.descriptors.supportCount < 2,
                        minimumBudget: 0.45,
                      },
                      {
                        option: "membrane",
                        inherited: program.genome.membranePotential,
                        permitted: !!main && main.area >= 8,
                        minimumBudget: 0.55,
                      },
                      {
                        option: "articulate",
                        permitted: true,
                        minimumBudget: 0,
                      },
                      {
                        option: "repurpose",
                        permitted:
                          (decisions[i].mass === "fuse" ||
                            (program.genome.lifeProgram.kind === "sheltered" &&
                              i === 1)) &&
                          atlas.descriptors.supportCount >= 4,
                        minimumBudget: 0,
                        utility:
                          "redundant source supports become reaching effectors during inherited axial fusion",
                      },
                    ]
                  : op.kind === "redistribute"
                    ? [
                        {
                          option: `regional-${program.regionalLayout.stages[i].axisConfiguration}`,
                          permitted: !!regionalSourceId,
                        },
                        {
                          option: "split",
                          permitted: bulk.some(
                            (p) =>
                              p.id !== regionalSourceId &&
                              !!splitCut(program, p),
                          ),
                        },
                        { option: "fuse", permitted: bulk.length >= 2 },
                        { option: "restructure", permitted: true },
                      ]
                    : [
                        { option: "reinforce", permitted: true },
                        { option: "display", permitted: true },
                        { option: "contour", permitted: true },
                      ],
              readiness: progress(op, age),
            })),
        ),
        materialPreserved: true,
        familyEndpoints: false,
        sourceClipConvention: "original-world-half-open",
        activeOperators: operations.length,
      },
    },
  };
}

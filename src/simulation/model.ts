import type { NeedKeyframe, WellbeingState } from "../needs";
import type { GameState } from "../gameplay";
import type { MaterialDevelopmentProgram, LifetimeRemodelingProgram } from "../development";
import type { InheritedGenome } from "./genome";
import type { GroomStroke } from "./grooming";
import type { LiveDevelopmentContext, LineageState } from "../lineage/types";
/** Shared authored pixels and deterministic development API. */
export type Pixel = { x: number; y: number; color: string; z?: number;
  /** Live physical cell ancestry; absent on procedural/surface-only pixels. */
  materialCellId?: string;
  materialSourceIds?: readonly string[];
  materialParentCellIds?: readonly string[];
  materialOperationId?: string | null;
};
export type Point = { x: number; y: number };
export const PART_KINDS = [
  "body",
  "head",
  "arm",
  "hand",
  "leg",
  "foot",
  "eye",
  "mouth",
  "ear",
  "tail",
  "wing",
  "horn",
  "egg",
  "hair",
  "decoration",
] as const;
export type PartKind = (typeof PART_KINDS)[number];
export const PART_LABELS: Record<PartKind, string> = {
  body: "Body",
  head: "Head",
  arm: "Arm",
  hand: "Hand",
  leg: "Leg",
  foot: "Foot",
  eye: "Eye",
  mouth: "Mouth",
  ear: "Ear",
  tail: "Tail",
  wing: "Wing",
  horn: "Horn",
  egg: "Egg",
  hair: "Hair",
  decoration: "Details",
};
export const PART_SIZE = 32,
  DRAW_SIZE = 32,
  ASSEMBLY_SIZE = 32,
  WORLD_SIZE = 64,
  MAX_AGE = 240;
export type PetPart = {
  id: string;
  kind: PartKind;
  name: string;
  pixels: Pixel[];
  position: Point;
  parentId: string | null;
  layer?: number;
};
export type SourceMode = "infant" | "egg";
export type PetAction = "idle" | "move" | "play" | "greet";
export type LifeStage = "egg" | "infant" | "teen" | "adult" | "elderly";
export type MovementMode =
  | "walk"
  | "crawl"
  | "slither"
  | "undulate"
  | "hop"
  | "roll"
  | "flutter"
  | "drift";
export type Relationship = "surface" | "joint" | "floating" | "root";
export type Provenance = "authored" | "grown" | "shell";
export type Milestone = { stage: LifeStage; age: number };
export type Capabilities = {
  canMove: boolean;
  canPlay: boolean;
  canGreet: boolean;
  canSee: boolean;
  canFly: boolean;
  movementMode: MovementMode;
  effectorIds: string[];
  usableHands: string[];
  usableFeet: string[];
  usableMouths: string[];
  canWalk: boolean;
  canCatch: boolean;
  canTalk: boolean;
  locomotion: string;
  armCount: number;
  legCount: number;
  handCount: number;
  footCount: number;
};
/** A pigment change on the same source-derived material, never a replacement feature. */
export type SurfaceExpressionMetadata = {
  version: string;
  operation: "interior-pigment" | "facial-contrast";
  expression: number;
  sourcePartIds: string[];
  originalColors: string[];
  expressedColors: string[];
  changedPixelCount: number;
  carrierId?: string;
  /** Mean absolute luminance difference against the expressed carrier, normalized to 0..1. */
  contrastBefore?: number;
  contrastAfter?: number;
};
export type PartFrame = {
  id: string;
  kind: PartKind;
  name: string;
  parentId: string | null;
  sourcePartId?: string;
  sourcePartIds?: string[];
  role?: string;
  readiness?: number;
  provenance: Provenance;
  relationship: Relationship;
  layer?: number;
  pixels: Pixel[];
  anchor: Point;
  tip: Point;
  attachment: Point | null;
  attached: boolean;
  scale: number;
  growth: Point;
  rotation: number;
  planted: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  surfaceExpression?: SurfaceExpressionMetadata;
};
export type DevelopmentOperator = {
  id: string;
  tissueId: string;
  kind:
    | "redistribute"
    | "replace"
    | "enclose"
    | "bend"
    | "thicken"
    | "elongate"
    | "taper"
    | "segment"
    | "bud"
    | "branch"
    | "split"
    | "fuse"
    | "resorb"
    | "curl"
    | "mature";
  start: number;
  end: number;
  strength: number;
};
export type DevelopmentProgram = {
  version: 7;
  fingerprint: string;
  mode: SourceMode;
  style: string;
  operators: DevelopmentOperator[];
  tissueCount: number;
  sourcePartCount: number;
  milestones: Milestone[];
  hatchAt: number;
  maxAge: number;
  limits: {
    worldSize: number;
    generatedTissues: number;
    cachedFrames: number;
    cachedPixels: number;
    poseCachedPixels: number;
  };
  [key: string]: unknown;
};
export type Genome = {
  seed: string;
  fingerprint: string;
  version: 7;
  [key: string]: unknown;
};
export type PetFrame = {
  pixels: Pixel[];
  parts: PartFrame[];
  age: number;
  developmentalAge: number;
  stage: LifeStage;
  movementMode: MovementMode;
  evolution?: DevelopmentState;
  readonly wellbeing: WellbeingState;
  motionPace: number;
  motionAmplitude: number;
  cellCount: number;
  generation: number;
  traits: { label: string; value: string }[];
  capabilities: Capabilities;
  interaction: {
    status: string;
    action: PetAction;
    target?: Point;
    contactPoint?: Point;
    effectorId?: string;
    mode?: "hand" | "mouth" | "tail" | "body";
    groundY?: number;
    [key: string]: unknown;
  };
};
export type FrameOptions = {
  time?: number;
  action?: PetAction;
  target?: Point;
};
export type SimulationOptions = {
  /** Integration-verification seam: transform the compiled program, never source/genome.
   * Only an explicitly supplied callback can select a different real transaction
   * program. Normal save files and gameplay do not provide this option. */
  verifyMaterialProgram?: (base: MaterialDevelopmentProgram, genome: InheritedGenome) => Readonly<{
    program: MaterialDevelopmentProgram;
    remodelingProgram?: LifetimeRemodelingProgram;
  }>;
  /** Recorded canonical game history, supplying material-operator care effects. */
  careGame?: GameState;
  /** Test/profiler oracle: force independent from-birth material replay. */
  reuseLivingMaterial?: boolean;
  needTimeline?: readonly NeedKeyframe[];
  groomingTimeline?: readonly GroomStroke[];
  liveContext?: LiveDevelopmentContext;
};
export type PetSimulation = {
  genome: Genome;
  program: DevelopmentProgram;
  milestones: Milestone[];
  maxAge: number;
  /** Initial slider range; development has no terminal lifecycle age. */
  initialPreviewEnd: number;
  openEnded: true;
  hatchAt: number;
  stateAt(age: number): WellbeingState;
  developmentAt(age: number): DevelopmentState;
  frameAt(age: number, options?: FrameOptions): PetFrame;
  /** Backend-only chronology instrumentation; never part of creature state. */
  getMaterialRuntimeStats?(): Readonly<{
    cold: number;
    resumed: number;
    imported: number;
  }>;
  /** Bind an idle display gesture to authored material; does not change the simulation. */
  groomingStrokeAt(age: number, from: Point, to: Point): GroomStroke | null;
  /** Runtime telemetry is separate from deterministic frame/development output. */
  getRenderCacheStats?(): Readonly<{
    age: number | null;
    hits: number;
    misses: number;
    entries: number;
    pixels: number;
    pixelLimit: number;
    entryLimit: number;
    maximumObservedPixels: number;
  }>;
};
export type DevelopmentState = {
  lineage?: LineageState;
  developmentalAge: number;
  transitionId: string;
  progress: number;
  bodyPlanId: string;
  controllerFamily: string;
  commitments: { id: string; tick: number; option: string }[];
  operations: { id: string; kind: string; progress: number }[];
  anatomy: {
    id: string;
    role: string;
    sourcePartIds: string[];
    readiness: number;
  }[];
  genomeFingerprint?: string;
  sourceFingerprint?: string;
  programFingerprint?: string;
  diagnostics?: Record<string, unknown>;
  [key: string]: unknown;
};
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export const compareText = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;
export function hash(text: string): number {
  let v = 2166136261;
  for (let i = 0; i < text.length; i++)
    v = Math.imul(v ^ text.charCodeAt(i), 16777619);
  v ^= v >>> 16;
  v = Math.imul(v, 0x7feb352d);
  v ^= v >>> 15;
  v = Math.imul(v, 0x846ca68b);
  return (v ^ (v >>> 16)) >>> 0;
}
export function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}
const LAYERS: Record<PartKind, number> = {
  tail: 0,
  wing: 1,
  leg: 2,
  arm: 3,
  body: 4,
  egg: 4,
  head: 5,
  foot: 6,
  hand: 6,
  ear: 7,
  horn: 7,
  hair: 8,
  decoration: 8,
  eye: 9,
  mouth: 9,
};
const depth = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? clamp(Math.round(v), 0, 1e9)
    : undefined;
export function pixelPaintDepth(part: PetPart, pixel: Pixel): number {
  return depth(pixel.z) ?? depth(part.layer) ?? LAYERS[part.kind] * 1000;
}
export function compareAnatomyLayer(a: PetPart, b: PetPart): number {
  return LAYERS[a.kind] - LAYERS[b.kind] || compareText(a.id, b.id);
}
export function anatomyPaintOrder(parts: PetPart[]): PetPart[] {
  return [...parts].sort(
    (a, b) =>
      (depth(a.layer) ?? LAYERS[a.kind] * 1000) -
        (depth(b.layer) ?? LAYERS[b.kind] * 1000) || compareAnatomyLayer(a, b),
  );
}
export function normalizeAnatomy(parts: PetPart[]): PetPart[] {
  const result: PetPart[] = [],
    ids = new Set<string>();
  for (const raw of Array.isArray(parts) ? parts : []) {
    if (
      !raw ||
      typeof raw.id !== "string" ||
      !raw.id.trim() ||
      ids.has(raw.id.trim())
    )
      continue;
    const id = raw.id.trim();
    ids.add(id);
    const kind = PART_KINDS.includes(raw.kind) ? raw.kind : "decoration";
    const position = {
        x: clamp(
          Math.round(Number.isFinite(raw.position?.x) ? raw.position.x : 0),
          0,
          31,
        ),
        y: clamp(
          Math.round(Number.isFinite(raw.position?.y) ? raw.position.y : 0),
          0,
          31,
        ),
      },
      layer = depth(raw.layer),
      fallback = layer ?? LAYERS[kind] * 1000,
      map = new Map<number, Pixel>();
    for (const p of Array.isArray(raw.pixels) ? raw.pixels : []) {
      if (
        !p ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        typeof p.color !== "string" ||
        !p.color.trim()
      )
        continue;
      const x = Math.round(p.x),
        y = Math.round(p.y),
        z = depth(p.z),
        color = p.color.trim();
      if (
        x < 0 ||
        y < 0 ||
        x >= 32 ||
        y >= 32 ||
        x + position.x > 31 ||
        y + position.y > 31
      )
        continue;
      const key = y * 32 + x,
        old = map.get(key);
      if (
        !old ||
        (z ?? fallback) > (old.z ?? fallback) ||
        ((z ?? fallback) === (old.z ?? fallback) &&
          (color < old.color ||
            (color === old.color && z !== undefined && old.z === undefined)))
      )
        map.set(key, { x, y, color, ...(z === undefined ? {} : { z }) });
    }
    result.push({
      id,
      kind,
      name:
        typeof raw.name === "string" && raw.name.trim()
          ? raw.name.trim()
          : PART_LABELS[kind],
      position,
      pixels: [...map.values()].sort((a, b) => a.y - b.y || a.x - b.x),
      parentId:
        typeof raw.parentId === "string" && raw.parentId !== id
          ? raw.parentId
          : null,
      ...(layer === undefined ? {} : { layer }),
    });
  }
  const byId = new Map(result.map((p) => [p.id, p]));
  for (const p of result)
    if (!p.parentId || !byId.has(p.parentId)) p.parentId = null;
  const cycles = new Set<string>();
  for (const p of result) {
    const path: string[] = [];
    let q: PetPart | undefined = p;
    while (q) {
      const i = path.indexOf(q.id);
      if (i >= 0) {
        for (const id of path.slice(i)) cycles.add(id);
        break;
      }
      path.push(q.id);
      q = q.parentId ? byId.get(q.parentId) : undefined;
    }
  }
  for (const p of result) if (cycles.has(p.id)) p.parentId = null;
  return result;
}
export function flattenAnatomy(parts: PetPart[]): Pixel[] {
  const map = new Map<number, { pixel: Pixel; part: PetPart; depth: number }>();
  for (const part of normalizeAnatomy(parts))
    for (const p of part.pixels) {
      const pixel = {
          ...p,
          x: p.x + part.position.x,
          y: p.y + part.position.y,
        },
        key = pixel.y * 32 + pixel.x,
        d = pixelPaintDepth(part, p),
        old = map.get(key);
      if (
        !old ||
        d > old.depth ||
        (d === old.depth && compareAnatomyLayer(part, old.part) > 0)
      )
        map.set(key, { pixel, part, depth: d });
    }
  return [...map.values()]
    .map((v) => v.pixel)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}
function sprite(rows: string[], color: string): Pixel[] {
  return rows.flatMap((row, y) =>
    [...row].flatMap((c, x) => (c === "." ? [] : [{ x, y, color }])),
  );
}
/** Editable templates; no hidden anatomy or predefined adult sprites. */
export function createStarterAnatomy(
  kind: "biped" | "crawler" | "winged" | "egg" = "biped",
): PetPart[] {
  const parts: PetPart[] = [];
  const add = (
    id: string,
    partKind: PartKind,
    name: string,
    x: number,
    y: number,
    rows: string[],
    color: string,
    parentId: string | null,
  ) =>
    parts.push({
      id,
      kind: partKind,
      name,
      position: { x, y },
      parentId,
      pixels: sprite(rows, color),
    });
  if (kind === "egg") {
    add(
      "egg",
      "egg",
      "Your egg",
      11,
      9,
      [
        "....aa....",
        "...aaaa...",
        "..aaaaaa..",
        ".aaaaaaaa.",
        ".aaaaaaaa.",
        "aaaaaaaaaa",
        "aaaaaaaaaa",
        "aaaaaaaaaa",
        ".aaaaaaaa.",
        "..aaaaaa..",
        "...aaaa...",
      ],
      "#AAAAAA",
      null,
    );
    return parts;
  }
  const bodyColor = "#AAAAAA";
  add(
    "body",
    "body",
    "Body",
    12,
    13,
    [".aaaaaa.", "aaaaaaaa", "aaaaaaaa", "aaaaaaaa", "aaaaaaaa", ".aaaaaa."],
    bodyColor,
    null,
  );
  add(
    "head",
    "head",
    "Head",
    12,
    7,
    [
      "..aaaa..",
      ".aaaaaa.",
      "aaaaaaaa",
      "aaaaaaaa",
      "aaaaaaaa",
      ".aaaaaa.",
      "..aaaa..",
    ],
    "#DDDDDD",
    "body",
  );
  add("eye-left", "eye", "Left eye", 14, 10, ["a", "a"], "#000000", "head");
  add("eye-right", "eye", "Right eye", 17, 10, ["a", "a"], "#000000", "head");
  add("mouth", "mouth", "Mouth", 15, 12, ["aa"], "#444444", "head");
  add(
    "ear-left",
    "ear",
    "Left ear",
    12,
    4,
    ["aa", "aa", "aa", ".a"],
    bodyColor,
    "head",
  );
  add(
    "ear-right",
    "ear",
    "Right ear",
    18,
    4,
    ["aa", "aa", "aa", "a."],
    bodyColor,
    "head",
  );
  const count = kind === "crawler" ? 4 : 2;
  for (let i = 0; i < count; i++) {
    // Distinct same-kind limbs need a transparent gap on the shared canvas;
    // otherwise the next stroke's region inference would merge the four legs.
    const x = count === 4 ? 11 + i * 3 : 13 + i * 4;
    add(
      `leg-${i}`,
      "leg",
      `${count === 4 ? i + 1 : i === 0 ? "Left" : "Right"} leg`,
      x,
      18,
      ["aa", "aa", "aa", "aa"],
      bodyColor,
      "body",
    );
    add(
      `foot-${i}`,
      "foot",
      `${count === 4 ? i + 1 : i === 0 ? "Left" : "Right"} foot`,
      count === 4 ? x : x - (i === 0 ? 1 : 0),
      22,
      count === 4 ? ["aa"] : ["aaa"],
      "#777777",
      `leg-${i}`,
    );
  }
  if (kind === "winged") {
    add(
      "wing-left",
      "wing",
      "Left wing",
      6,
      12,
      ["a.....", "aa....", "aaaa..", ".aaaaa", "..aaaa"],
      "#777777",
      "body",
    );
    add(
      "wing-right",
      "wing",
      "Right wing",
      20,
      12,
      [".....a", "....aa", "..aaaa", "aaaaa.", "aaaa.."],
      "#777777",
      "body",
    );
  } else {
    add(
      "arm-left",
      "arm",
      "Left arm",
      10,
      14,
      ["aa", "aa", "aa", "aa"],
      bodyColor,
      "body",
    );
    add(
      "arm-right",
      "arm",
      "Right arm",
      20,
      14,
      ["aa", "aa", "aa", "aa"],
      bodyColor,
      "body",
    );
    add(
      "hand-left",
      "hand",
      "Left hand",
      9,
      18,
      ["aaa", "aaa"],
      "#DDDDDD",
      "arm-left",
    );
    add(
      "hand-right",
      "hand",
      "Right hand",
      20,
      18,
      ["aaa", "aaa"],
      "#DDDDDD",
      "arm-right",
    );
  }
  add(
    "tail",
    "tail",
    "Tail",
    19,
    15,
    ["....aa", "...aa.", ".aaa..", "aa...."],
    bodyColor,
    "body",
  );
  return parts;
}

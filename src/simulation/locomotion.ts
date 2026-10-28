import {
  clamp,
  compareText,
  type MovementMode,
  type PartKind,
  type PetAction,
  type Point,
} from "./model";

/** One deliberate LCD pose per phase; explicit time is the only clock. */
export const POSE_PHASES = 8;
/** Seconds are limited to avoid unsafe integer ticks or unbounded numerical drift. */
export const MAX_MOTION_TIME = 4096;
export const MOTION_PRECISION = 1 / 1024;
/** Shared by the solver and frame cache so boundary rounding cannot disagree. */
export function heldPoseTick(time: number, pace = 1): number {
  const clock = Number.isFinite(time) ? Math.min(MAX_MOTION_TIME, Math.max(0, time)) : 0;
  const rate = Number.isFinite(pace) ? clamp(pace, 0.15, 3) : 1;
  return Math.floor(clock * rate * POSE_PHASES + 1e-9);
}
export const MAX_LIMB_CONTROLLERS = 32;
export type ControllerFamily =
  | "quadruped"
  | "biped"
  | "crawler"
  | "hop"
  | "serpentine"
  | "swim"
  | "flutter"
  | "roll"
  | "float";
/** A material-level causal witness, never a body-plan or sprite classification. */
export type MechanicalEvidence = Readonly<{
  tissueId: string;
  linkIds: readonly string[];
  sourceCellIds: readonly string[];
  cellCount: number;
  axialExtent: number;
  flexibility: number;
  supported: boolean;
  reason: string;
}>;
export type RigNode = {
  id: string;
  kind: PartKind;
  role: string;
  /** Compiled once in authored anatomy coordinates; never inferred from a pose. */
  anatomicalRole?: string;
  center: Point;
  anchor: Point;
  tip: Point;
  sourceIds: string[];
  readiness: number;
  parentId?: string | null;
  /** Optional ordered material centerline, used instead of screen x for waves. */
  spine?: readonly Point[];
  bendSign?: number;
  mechanics?: MechanicalEvidence;
};
type Limb = {
  id: string;
  footId?: string;
  role: string;
  anchor: Point;
  restFoot: Point;
  upper: number;
  lower: number;
  phaseOffset: number;
  bendSign: number;
  readiness: number;
};
export type FunctionalGraph = {
  nodes: RigNode[];
  limbs: Limb[];
  controllerFamily: ControllerFamily;
  movementMode: MovementMode;
  center: Point;
  axis: Point;
  groundY: number;
  stride: number;
  span: number;
  sharedControls: Record<string, string>;
};
export type PoseTransform = {
  offset: Point;
  rotation: number;
  anchor: Point;
  tip: Point;
  planted: boolean;
  joint?: Point;
  pivot?: Point;
  /** Intrinsic material wave, consumed by transformLocomotionPoint. */
  wave?: {
    amplitude: number;
    wavelength: number;
    phase: number;
    axis: Point;
    origin: Point;
    spine?: readonly Point[];
  };
};
export type Contact = {
  id: string;
  role: string;
  planted: boolean;
  supportWeight: number;
  localPoint: Point;
  worldPoint: Point;
  desiredWorldPoint: Point;
  step: number;
};
export type FunctionalPose = {
  transforms: Record<string, PoseTransform>;
  movementMode: MovementMode;
  controllerFamily: ControllerFamily;
  groundY: number;
  phase: number;
  contacts: Contact[];
  /** World state is distinct from the camera-following LCD coordinates. */
  worldPosition: Point;
  cameraWorldX: number;
  cameraLagX: number;
  locomotionSupported: boolean;
  diagnostics: {
    worldAdvance: number;
    cameraWorldX: number;
    cameraLagX: number;
    locomotionSupported: boolean;
    heldCycle: number;
    maximumBoneError: number;
    maximumContactError: number;
    maximumGroundPenetration: number;
    boneLengths: {
      id: string;
      upper: number;
      lower: number;
      actualUpper: number;
      actualLower: number;
    }[];
  };
};
const TAU = Math.PI * 2;
const q = (value: number) => Math.round(value * 1024) / 1024;
const point = (x: number, y: number): Point => ({ x: q(x), y: q(y) });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const plus = (a: Point, b: Point) => point(a.x + b.x, a.y + b.y);
const mod = (value: number, size = 1) => ((value % size) + size) % size;
const smooth = (value: number) => {
  const v = clamp(value, 0, 1);
  return v * v * (3 - 2 * v);
};
const copy = (p: Point) => ({ x: p.x, y: p.y });
const normalized = (p: Point): Point => {
  const d = Math.hypot(p.x, p.y);
  return d > 0.001 ? point(p.x / d, p.y / d) : { x: 1, y: 0 };
};

function preferredFamily(
  value: string | undefined,
): ControllerFamily | undefined {
  const aliases: Record<string, ControllerFamily> = {
    walk: "biped",
    quadruped: "quadruped",
    canine: "quadruped",
    biped: "biped",
    upright: "biped",
    crawler: "crawler",
    crawl: "crawler",
    beetle: "crawler",
    hop: "hop",
    hopper: "hop",
    serpentine: "serpentine",
    serpent: "serpentine",
    slither: "serpentine",
    ribbon: "serpentine",
    swim: "swim",
    swimmer: "swim",
    aquatic: "swim",
    undulate: "swim",
    flutter: "flutter",
    winged: "flutter",
    roll: "roll",
    roller: "roll",
    float: "float",
    floating: "float",
    drift: "float",
    wisp: "float",
  };
  return value ? aliases[value.toLowerCase()] : undefined;
}
function modeFor(family: ControllerFamily): MovementMode {
  return (
    {
      quadruped: "walk",
      biped: "walk",
      crawler: "crawl",
      hop: "hop",
      serpentine: "slither",
      swim: "undulate",
      flutter: "flutter",
      roll: "roll",
      float: "drift",
    } as const
  )[family];
}

/** Infer roles once in body coordinates; neither input order nor absolute canvas position matters. */
export function buildFunctionalGraph(
  input: readonly RigNode[],
  preferred?: string,
): FunctionalGraph {
  const nodes = [...input]
    .map((node) => ({
      ...node,
      sourceIds: [...node.sourceIds],
      center: copy(node.center),
      anchor: copy(node.anchor),
      tip: copy(node.tip),
      readiness: clamp(node.readiness, 0, 1),
    }))
    .sort((a, b) => compareText(a.id, b.id));
  const body = nodes.filter(
    (node) =>
      node.kind === "body" || node.role === "trunk" || node.kind === "egg",
  );
  const reference = body.length ? body : nodes;
  const center = reference.length
    ? point(
        reference.reduce((s, node) => s + node.center.x, 0) / reference.length,
        reference.reduce((s, node) => s + node.center.y, 0) / reference.length,
      )
    : { x: 32, y: 32 };
  const allPoints = nodes.flatMap((node) => [
    node.center,
    node.anchor,
    node.tip,
  ]);
  const minX = Math.min(...allPoints.map((p) => p.x), center.x),
    maxX = Math.max(...allPoints.map((p) => p.x), center.x);
  const minY = Math.min(...allPoints.map((p) => p.y), center.y),
    maxY = Math.max(...allPoints.map((p) => p.y), center.y);
  const span = Math.max(2, maxX - minX, maxY - minY);
  const mainSpine = body.find(
    (node) => node.spine && node.spine.length > 1,
  )?.spine;
  let axis = mainSpine
    ? normalized({
        x: mainSpine[mainSpine.length - 1].x - mainSpine[0].x,
        y: mainSpine[mainSpine.length - 1].y - mainSpine[0].y,
      })
    : maxX - minX >= maxY - minY
      ? { x: 1, y: 0 }
      : { x: 0, y: 1 };
  const heads = nodes.filter((node) => node.kind === "head");
  const facing =
    heads.length && Math.abs(heads[0].center.x - center.x) > 0.5
      ? Math.sign(heads[0].center.x - center.x)
      : 1;
  if (axis.x !== 0) axis = { x: facing, y: 0 };
  const legNodes = nodes.filter(
    (node) => node.kind === "leg" && node.readiness > 0.03 &&
      node.mechanics?.supported !== false,
  );
  // Standalone feet have no proven load-bearing chain; never invent one.
  const standaloneFeet: RigNode[] = [];
  const allSupportNodes = [...legNodes, ...standaloneFeet].sort(
    (a, b) =>
      (a.center.x - b.center.x) * facing ||
      a.center.y - b.center.y ||
      compareText(a.id, b.id),
  );
  const supportNodes =
    allSupportNodes.length <= MAX_LIMB_CONTROLLERS
      ? allSupportNodes
      : Array.from(
          { length: MAX_LIMB_CONTROLLERS },
          (_, index) =>
            allSupportNodes[
              Math.floor(
                (index * allSupportNodes.length) / MAX_LIMB_CONTROLLERS,
              )
            ],
        );
  const supportIds = new Set(supportNodes.map((node) => node.id));
  const sharedControls: Record<string, string> = {};
  for (const fragment of allSupportNodes.filter(
    (node) => !supportIds.has(node.id),
  )) {
    const controller = [...supportNodes].sort(
      (a, b) =>
        distance(fragment.center, a.center) -
          distance(fragment.center, b.center) || compareText(a.id, b.id),
    )[0];
    if (controller) {
      sharedControls[fragment.id] = controller.id;
      for (const child of nodes.filter(
        (node) => node.kind === "foot" && node.parentId === fragment.id,
      ))
        sharedControls[child.id] = controller.id;
    }
  }
  const footNodes = nodes.filter((node) => node.kind === "foot");
  const groundY = q(
    Math.max(
      ...supportNodes.map((node) => {
        const foot = footNodes.find(
          (candidate) => candidate.parentId === node.id,
        );
        return foot?.tip.y ?? node.tip.y;
      }),
      ...body.map((node) => node.tip.y),
      center.y,
    ),
  );
  const limbs: Limb[] = supportNodes.map((node, index) => {
    const foot = footNodes.find((candidate) => candidate.parentId === node.id);
    const roleText = (
      node.anatomicalRole ?? `${node.role} ${node.id}`
    ).toLowerCase();
    const explicitFront = /fore|front/.test(roleText),
      explicitHind = /hind|rear|back/.test(roleText);
    const middle = /middle|mid-/.test(roleText);
    const front =
      explicitFront ||
      (!explicitHind &&
        !node.anatomicalRole &&
        index >= supportNodes.length / 2);
    let left = /left|near/.test(roleText);
    if (!/left|right|near|far/.test(roleText)) {
      const group = supportNodes.filter((candidate) => {
        const text = `${candidate.role} ${candidate.id}`.toLowerCase();
        return front ? /fore|front/.test(text) : /hind|rear|back/.test(text);
      });
      left = group.length
        ? group
            .sort((a, b) => a.center.y - b.center.y || compareText(a.id, b.id))
            .findIndex((candidate) => candidate.id === node.id) %
            2 ===
          0
        : index % 2 === 0;
    }
    const role =
      node.anatomicalRole ??
      (supportNodes.length >= 4
        ? `${middle ? "middle" : front ? "fore" : "hind"}-${left ? "left" : "right"}`
        : `${index === 0 ? "left" : "right"}`);
    const anchor =
      node.kind === "foot"
        ? point(node.anchor.x, Math.min(node.anchor.y, center.y + 1))
        : copy(node.anchor);
    const readiness = Math.min(node.readiness, foot?.readiness ?? 1);
    const groundBlend = smooth((readiness - 0.65) / 0.25);
    const developingTip = foot?.center ?? node.tip;
    const restFoot = point(
      developingTip.x,
      developingTip.y + (groundY - developingTip.y) * groundBlend,
    );
    const reach = Math.max(1.5, distance(anchor, restFoot) * 1.22);
    return {
      id: node.id,
      footId: foot?.id,
      role,
      anchor,
      restFoot,
      upper: reach * 0.5,
      lower: reach * 0.5,
      phaseOffset:
        supportNodes.length >= 4
          ? front
            ? left
              ? 0.25
              : 0.75
            : left
              ? 0
              : 0.5
          : node.anatomicalRole
            ? left
              ? 0
              : 0.5
            : (index % 2) * 0.5,
      bendSign: node.bendSign ?? (front ? 1 : -1) * facing,
      readiness,
    };
  });
  const usableLegs = limbs.filter((limb) => limb.readiness >= 0.9).length;
  let family = preferredFamily(preferred);
  const flightWings = nodes.filter(
    (node) =>
      node.kind === "wing" &&
      !/fin/.test(node.role) &&
      node.readiness >= 0.8 &&
      distance(node.anchor, node.tip) >= span * 0.15,
  );
  if (family === "flutter" && flightWings.length < 2)
    family =
      usableLegs >= 2 ? (usableLegs >= 4 ? "quadruped" : "biped") : "float";
  if (
    (family === "biped" ||
      family === "quadruped" ||
      family === "crawler" ||
      family === "hop") &&
    usableLegs < 2
  )
    family = "float";
  if (!family)
    family =
      usableLegs >= 4
        ? "quadruped"
        : usableLegs >= 2
          ? "biped"
          : mainSpine
            ? "serpentine"
            : "float";
  if (family === "crawler" && limbs.length >= 6)
    for (const limb of limbs)
      limb.phaseOffset = limb.role.includes("middle")
        ? limb.role.includes("left")
          ? 0.5
          : 0
        : limb.role.includes("left")
          ? 0
          : 0.5;
  const stride = limbs.length
    ? Math.max(
        0.2,
        Math.min(
          span * 0.24,
          4.5,
          ...(limbs.some((limb) => limb.readiness >= 0.9)
            ? limbs.filter((limb) => limb.readiness >= 0.9)
            : limbs
          ).map((limb) => {
            const vertical = groundY - limb.anchor.y + 0.35;
            const horizontalReach = Math.sqrt(
              Math.max(
                0,
                (limb.upper + limb.lower - 0.02) ** 2 - vertical ** 2,
              ),
            );
            return Math.max(
              0.2,
              (horizontalReach - Math.abs(limb.restFoot.x - limb.anchor.x)) *
                1.8,
            );
          }),
        ),
      )
    : Math.min(3, span * 0.15);
  return {
    nodes,
    limbs,
    controllerFamily: family,
    movementMode: modeFor(family),
    center,
    axis,
    groundY,
    stride: q(stride),
    span,
    sharedControls,
  };
}

/** Analytic two-link IK; unreachable targets are clamped, never lengthened. */
export function solveTwoLink(
  hip: Point,
  target: Point,
  upper: number,
  lower: number,
  bendSign = 1,
): { joint: Point; tip: Point; error: number } {
  const dx = target.x - hip.x,
    dy = target.y - hip.y,
    original = Math.hypot(dx, dy);
  const d = clamp(
    original,
    Math.abs(upper - lower) + 0.001,
    Math.max(0.002, upper + lower - 0.001),
  );
  const ux = original > 0.0001 ? dx / original : 0,
    uy = original > 0.0001 ? dy / original : 1;
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const tip = point(hip.x + ux * d, hip.y + uy * d);
  const joint = point(
    hip.x + ux * along - uy * height * Math.sign(bendSign || 1),
    hip.y + uy * along + ux * height * Math.sign(bendSign || 1),
  );
  return { joint, tip, error: distance(tip, target) };
}

export function poseFunctionalGraph(
  graph: FunctionalGraph,
  options: {
    time: number;
    action: PetAction;
    pace?: number;
    amplitude?: number;
    target?:Point;
  },
): FunctionalPose {
  const time = Number.isFinite(options.time)
    ? Math.min(MAX_MOTION_TIME, Math.max(0, options.time)) : 0;
  const pace = Number.isFinite(options.pace)
    ? clamp(options.pace!, 0.15, 3)
    : 1;
  const heldCycle = heldPoseTick(time, pace) / POSE_PHASES;
  const amplitude = Number.isFinite(options.amplitude)
    ? clamp(options.amplitude!, 0.15, 1.25)
    : 1;
  const stride = graph.stride * amplitude;
  const phase = Math.round(mod(heldCycle) * POSE_PHASES) % POSE_PHASES;
  const cyclePhase = phase / POSE_PHASES;
  const angle = cyclePhase * TAU;
  const moving = options.action === "move" || options.action === "play";
  const family = graph.controllerFamily;
  const groundedFamily = ["quadruped", "biped", "crawler"].includes(family);
  const locomotor = moving && groundedFamily &&
    graph.limbs.filter(limb => limb.readiness >= 0.9).length >= 2;
  // Cumulative ground travel is evaluated directly from birth, never integrated
  // from the previously rendered frame. Camera lag is a bounded screen offset.
  const heading=options.action==="move"&&options.target&&options.target.x<graph.center.x?-1:1;
  const worldAdvance = locomotor ? heading*q(heldCycle * stride) : 0;
  const cameraLagX = locomotor ? q(3 * Math.tanh(worldAdvance / 9)) : 0;
  const cameraWorldX = q(worldAdvance - cameraLagX);
  let rootOffset = { x: 0, y: 0 },
    rootRotation = 0;
  if (moving) {
    if (family === "hop")
      rootOffset = point(
        0,
        -Math.sin(Math.PI * cyclePhase) * Math.min(5, graph.span * 0.2),
      );
    else if (family === "float" || family === "flutter")
      rootOffset = point(Math.sin(angle) * 0.65 * heading, Math.cos(angle) * 0.8);
    else if (family === "roll") rootRotation = angle;
    else if (
      family === "quadruped" ||
      family === "biped" ||
      family === "crawler"
    )
      rootOffset = point(0, -0.18 - Math.cos(angle * 2) * 0.12);
  } else if (options.action === "greet")
    rootOffset = point(0, -Math.abs(Math.sin(angle)) * 0.5);
  rootOffset = point(rootOffset.x * amplitude + cameraLagX,
    rootOffset.y * amplitude);
  const transforms: Record<string, PoseTransform> = {};
  for (const node of graph.nodes) {
    const rotated = (p: Point) =>
      rootRotation
        ? point(
            graph.center.x +
              (p.x - graph.center.x) * Math.cos(rootRotation) -
              (p.y - graph.center.y) * Math.sin(rootRotation),
            graph.center.y +
              (p.x - graph.center.x) * Math.sin(rootRotation) +
              (p.y - graph.center.y) * Math.cos(rootRotation),
          )
        : p;
    const transform: PoseTransform = {
      offset: copy(rootOffset),
      rotation: rootRotation,
      anchor: plus(rotated(node.anchor), rootOffset),
      tip: plus(rotated(node.tip), rootOffset),
      planted: false,
      ...(rootRotation ? { pivot: graph.center } : {}),
    };
    if (
      moving &&
      (family === "serpentine" || family === "swim") &&
      !["eye", "mouth"].includes(node.kind)
    ) {
      transform.wave = {
        amplitude:
          Math.min(family === "swim" ? 1.2 : 2, graph.span * 0.09) * amplitude,
        wavelength: Math.max(7, graph.span * 0.85),
        phase: angle,
        axis: graph.axis,
        origin: graph.center,
        ...(node.spine ? { spine: node.spine } : {}),
      };
    }
    if (
      moving &&
      node.kind === "wing" &&
      !/fin/.test(node.role) &&
      family === "flutter"
    ) {
      const side = node.center.x < graph.center.x ? -1 : 1;
      transform.rotation =
        Math.sin(angle) * 0.75 * side * node.readiness * amplitude;
      transform.anchor = plus(node.anchor, rootOffset);
    }
    if (moving && family === "swim" && /fin/.test(node.role))
      transform.rotation =
        Math.sin(angle + (node.center.x < graph.center.x ? Math.PI : 0)) *
        0.15 *
        amplitude;
    if (
      options.action === "greet" &&
      (node.kind === "hand" || node.kind === "arm" || node.kind === "tail")
    )
      transform.rotation = Math.sin(angle * 2) * 0.3 * amplitude;
    transforms[node.id] = transform;
  }
  const contacts: Contact[] = [],
    boneLengths: FunctionalPose["diagnostics"]["boneLengths"] = [];
  const stanceFraction = family === "biped" ? 0.625 : 0.75;
  let maximumBoneError = 0,
    maximumContactError = 0,
    maximumGroundPenetration = 0;
  for (const limb of graph.limbs) {
    if (family === "roll") continue;
    const localCycle = heldCycle + limb.phaseOffset;
    const phaseInCycle = mod(localCycle);
    const inStance = phaseInCycle < stanceFraction;
    const planted =
      limb.readiness >= 0.9 &&
      (groundedFamily
        ? !locomotor || inStance
        : family === "hop" && (!moving || phase === 0));
    const step = Math.floor(localCycle);
    let target = groundedFamily
      ? copy(limb.restFoot)
      : plus(limb.restFoot, rootOffset);
    if (locomotor) {
      const activation = smooth((limb.readiness - 0.4) / 0.5);
      if (inStance)
        target.x += activation * stride * (stanceFraction / 2 - phaseInCycle);
      else {
        const swing = (phaseInCycle - stanceFraction) / (1 - stanceFraction);
        target.x +=
          activation *
          stride *
          (smooth(swing) * stanceFraction - stanceFraction / 2);
        target.y -=
          activation *
          Math.sin(swing * Math.PI) *
          Math.min(2.5, (limb.upper + limb.lower) * 0.23) *
          amplitude;
      }
    }
    target.x += cameraLagX;
    const hip = plus(limb.anchor, rootOffset);
    const solved = solveTwoLink(
      hip,
      target,
      limb.upper,
      limb.lower,
      limb.bendSign,
    );
    transforms[limb.id] = {
      offset: point(
        solved.tip.x - limb.restFoot.x,
        solved.tip.y - limb.restFoot.y,
      ),
      rotation: 0,
      anchor: hip,
      tip: solved.tip,
      joint: solved.joint,
      planted,
    };
    if (limb.footId && transforms[limb.footId]) {
      const footNode = graph.nodes.find((node) => node.id === limb.footId)!;
      const offset = point(
        solved.tip.x - footNode.center.x,
        solved.tip.y - footNode.center.y,
      );
      transforms[limb.footId] = {
        offset,
        rotation: 0,
        anchor: plus(footNode.anchor, offset),
        tip: plus(footNode.tip, offset),
        planted,
      };
    }
    const actualUpper = distance(hip, solved.joint),
      actualLower = distance(solved.joint, solved.tip);
    maximumBoneError = Math.max(
      maximumBoneError,
      Math.abs(actualUpper - limb.upper),
      Math.abs(actualLower - limb.lower),
    );
    maximumContactError = Math.max(
      maximumContactError,
      planted ? solved.error : 0,
    );
    maximumGroundPenetration = Math.max(
      maximumGroundPenetration,
      solved.tip.y - graph.groundY,
    );
    boneLengths.push({
      id: limb.id,
      upper: limb.upper,
      lower: limb.lower,
      actualUpper,
      actualLower,
    });
    contacts.push({
      id: limb.id,
      role: limb.role,
      planted,
      supportWeight: planted ? smooth((limb.readiness - 0.35) / 0.55) : 0,
      localPoint: solved.tip,
      worldPoint: point(solved.tip.x + cameraWorldX, solved.tip.y),
      desiredWorldPoint: point(target.x + cameraWorldX, target.y),
      step,
    });
  }
  for (const [fragmentId, controllerId] of Object.entries(
    graph.sharedControls,
  )) {
    const fragment = graph.nodes.find((node) => node.id === fragmentId)!;
    const limb = graph.limbs.find(
      (candidate) => candidate.id === controllerId,
    )!;
    const controller = transforms[controllerId];
    if (!fragment || !limb || !controller) continue;
    const fraction =
      fragment.kind === "foot"
        ? 1
        : clamp(
            distance(limb.anchor, fragment.center) /
              Math.max(0.001, distance(limb.anchor, limb.restFoot)),
            0,
            1,
          );
    const delta = point(
      (controller.anchor.x - limb.anchor.x) * (1 - fraction) +
        (controller.tip.x - limb.restFoot.x) * fraction,
      (controller.anchor.y - limb.anchor.y) * (1 - fraction) +
        (controller.tip.y - limb.restFoot.y) * fraction,
    );
    // Fragments share motion, not a replacement capsule: their own pixels and gaps survive.
    transforms[fragmentId] = {
      offset: delta,
      rotation: 0,
      anchor: plus(fragment.anchor, delta),
      tip: plus(fragment.tip, delta),
      planted: controller.planted,
    };
  }
  return {
    transforms,
    movementMode: graph.movementMode,
    controllerFamily: family,
    groundY: graph.groundY,
    phase,
    contacts,
    worldPosition: point(graph.center.x + worldAdvance, graph.center.y),
    cameraWorldX,
    cameraLagX,
    locomotionSupported: locomotor,
    diagnostics: {
      worldAdvance,
      cameraWorldX,
      cameraLagX,
      locomotionSupported: locomotor,
      heldCycle,
      maximumBoneError,
      maximumContactError,
      maximumGroundPenetration: Math.max(0, maximumGroundPenetration),
      boneLengths,
    },
  };
}

/** Wave coordinates follow arclength where a developed spine is available. */
export function transformLocomotionPoint(
  p: Point,
  transform: PoseTransform,
): Point {
  let value = copy(p);
  if (transform.wave) {
    const wave = transform.wave;
    let along =
      (p.x - wave.origin.x) * wave.axis.x + (p.y - wave.origin.y) * wave.axis.y;
    let normal = { x: -wave.axis.y, y: wave.axis.x };
    if (wave.spine && wave.spine.length > 1) {
      let best = Infinity,
        arc = 0;
      for (let i = 1; i < wave.spine.length; i++) {
        const a = wave.spine[i - 1],
          b = wave.spine[i],
          dx = b.x - a.x,
          dy = b.y - a.y,
          length = Math.hypot(dx, dy);
        const t = clamp(
          ((p.x - a.x) * dx + (p.y - a.y) * dy) /
            Math.max(0.001, length * length),
          0,
          1,
        );
        const d = Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
        if (d < best) {
          best = d;
          along = arc + t * length;
          normal = {
            x: -dy / Math.max(0.001, length),
            y: dx / Math.max(0.001, length),
          };
        }
        arc += length;
      }
    }
    const displacement =
      Math.sin((along / wave.wavelength) * TAU - wave.phase) * wave.amplitude;
    value = point(
      value.x + normal.x * displacement,
      value.y + normal.y * displacement,
    );
  }
  if (transform.rotation) {
    // anchor already contains offset; rotate around the unshifted hinge once.
    const anchor = transform.pivot ?? {
      x: transform.anchor.x - transform.offset.x,
      y: transform.anchor.y - transform.offset.y,
    };
    const x = value.x - anchor.x,
      y = value.y - anchor.y,
      c = Math.cos(transform.rotation),
      s = Math.sin(transform.rotation);
    value = point(anchor.x + x * c - y * s, anchor.y + x * s + y * c);
  }
  return plus(value, transform.offset);
}

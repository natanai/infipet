/** HISTORICAL METAMORPHOSIS/POSE COMPATIBILITY. Its continuous age fields
 * and original stage markers do not schedule the living pet's anatomy.
 * All physical change commits only at the 365 daily source-owned checks.
 * See docs/ARCHITECTURE.md before modifying this imported module. */
import { clamp, type Point } from "./model";
import { geneRandom, type InheritedGenome } from "./genome";
import { inheritedSourceRetention } from "./morphogenesis";
import type { SourcePatch } from "./source-atlas";

export type MetamorphosisKind = "direct" | "sheltered" | "metamorphic";
export type MetamorphosisPhase = {
  kind: MetamorphosisKind;
  phase:
    "infant" | "reorganization" | "enclosure" | "emergence" | "adult" | "elder";
  enclosure: number;
  emergence: number;
  retraction: number;
  stage: number;
  progress: number;
};
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mode = (genome: InheritedGenome): MetamorphosisKind => {
  const declared = (
    genome as InheritedGenome & { lifeProgram?: { kind?: MetamorphosisKind } }
  ).lifeProgram?.kind;
  return (
    declared ??
    (["direct", "sheltered", "metamorphic"] as const)[
      Math.floor(geneRandom(genome.fingerprint, "life-program") * 3)
    ]
  );
};
/** A coordinated sequence, rather than unrelated feature growth at milestone boundaries. */
export function getMetamorphosisPhase(
  genome: InheritedGenome,
  age: number,
): MetamorphosisPhase {
  const kind = mode(genome),
    wrap = smooth((age - 12) / 18),
    emergence = smooth((age - 36) / 34);
  const enclosure = kind === "sheltered" ? wrap * (1 - emergence) : 0;
  const stage = age < 30 ? 0 : age < 75 ? 1 : 2;
  const start = [0, 30, 75][stage],
    end = [30, 75, 120][stage];
  return {
    kind,
    phase:
      age < 3
        ? "infant"
        : enclosure > 0.8
          ? "enclosure"
          : enclosure > 0.01 && age > 30
            ? "emergence"
            : age >= 120
              ? "elder"
              : age >= 75
                ? "adult"
                : "reorganization",
    enclosure,
    emergence,
    retraction: enclosure * 0.84,
    stage,
    progress: smooth((age - start) / (end - start)),
  };
}
type CareSignals = Record<string, { load: number; opportunity: number }>;
type Goal = {
  length: number;
  width: number;
  curve: number;
  raise: number;
  bulge: number;
};
function goal(
  genome: InheritedGenome,
  kind: MetamorphosisKind,
  stage: number,
): Goal {
  if (stage < 0) return { length: 1, width: 1, curve: 0, raise: 0, bulge: 0 };
  const r = (channel: string) =>
    geneRandom(genome.fingerprint, `metamorphosis/${stage}/${channel}`);
  const sign =
    geneRandom(genome.fingerprint, "metamorphosis/side") < 0.5 ? -1 : 1;
  const plans: Record<MetamorphosisKind, Goal[]> = {
    direct: [
      { length: 1.2, width: 1.5, curve: 1.5, raise: 0.15, bulge: 0.4 },
      { length: 1.55, width: 0.95, curve: 3.3, raise: -0.65, bulge: -0.28 },
      { length: 1.05, width: 1.8, curve: -2.3, raise: 0.5, bulge: 0.55 },
    ],
    sheltered: [
      { length: 0.92, width: 1.35, curve: 4.1, raise: 0.35, bulge: 0.3 },
      { length: 1.65, width: 1.15, curve: 0.65, raise: -0.55, bulge: -0.25 },
      { length: 1.15, width: 1.7, curve: 2.8, raise: 0.45, bulge: 0.5 },
    ],
    metamorphic: [
      { length: 1.1, width: 1.7, curve: -2.4, raise: -0.3, bulge: 0.45 },
      { length: 1.7, width: 1, curve: 2.2, raise: 0.65, bulge: -0.3 },
      { length: 1.25, width: 1.6, curve: -3.4, raise: -0.55, bulge: 0.5 },
    ],
  };
  const base = plans[kind][stage];
  const expression = 1 - inheritedSourceRetention(genome);
  return {
    length: mix(1, base.length * (0.82 + r("length") * 0.36), expression),
    width: mix(1, base.width * (0.84 + r("width") * 0.32), expression),
    curve: base.curve * sign * (0.8 + r("curvature") * 0.4) * expression,
    raise: (base.raise * sign + (r("raise") - 0.5) * 0.3) * expression,
    bulge: base.bulge * (0.8 + r("bulge") * 0.4) * expression,
  };
}
const arcLength = (points: readonly Point[]) =>
  points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y),
      0,
    );
function sampleArc(points: readonly Point[], u: number): Point {
  let remaining = arcLength(points) * clamp(u, 0, 1);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length || i === points.length - 1) {
      const t = length ? clamp(remaining / length, 0, 1) : 0;
      return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) };
    }
    remaining -= length;
  }
  return { ...points[0] };
}

/** Source-normal offsets are retained by the transport kernel, including irregular authored edges. */
export function buildBodyMetamorphosis(
  patch: SourcePatch,
  genome: InheritedGenome,
  age: number,
  currentLine: Point[],
  care: CareSignals = {},
) {
  if (age <= 3 || currentLine.length < 2 || patch.area < 2) return undefined;
  const phase = getMetamorphosisPhase(genome, age),
    stage = phase.stage;
  const start = [3, 33, 78][stage],
    end = [30, 75, 120][stage],
    t = smooth((age - start) / (end - start));
  const previous = goal(genome, phase.kind, stage - 1),
    next = goal(genome, phase.kind, stage);
  const g = Object.fromEntries(
    Object.keys(next).map((key) => [
      key,
      mix(previous[key as keyof Goal], next[key as keyof Goal], t),
    ]),
  ) as Goal;
  const load = (id: string) => care[id]?.load ?? 0,
    opportunity = (id: string) => care[id]?.opportunity ?? 0;
  const source = patch.centerline,
    first = source[0],
    last = source.at(-1)!;
  const axis = Math.atan2(last.y - first.y, last.x - first.x) + g.raise;
  const c = Math.cos(axis),
    s = Math.sin(axis);
  const sourceLength = Math.max(2, arcLength(source));
  const length =
    sourceLength *
    g.length *
    (1 + 0.08 * opportunity("physical-fitness") - 0.06 * load("rest"));
  const center = currentLine.reduce(
    (p, q) => ({
      x: p.x + q.x / currentLine.length,
      y: p.y + q.y / currentLine.length,
    }),
    { x: 0, y: 0 },
  );
  const curvature =
    g.curve +
    (load("safety") * 0.3 + load("relaxation") * 0.22) *
      Math.sign(g.curve || 1);
  const target: Point[] = [],
    widths: number[] = [];
  for (let i = 0; i < 11; i++) {
    const u = i / 10 - 0.5,
      theta = curvature * u;
    const x =
      Math.abs(curvature) < 0.001
        ? u * length
        : (Math.sin(theta) / curvature) * length;
    const y =
      Math.abs(curvature) < 0.001
        ? 0
        : ((1 - Math.cos(theta)) / curvature) * length;
    const authored = sampleArc(source, i / 10),
      onAxis = {
        x: mix(first.x, last.x, i / 10),
        y: mix(first.y, last.y, i / 10),
      };
    const baseAngle = Math.atan2(last.y - first.y, last.x - first.x);
    const intrinsic =
      ((authored.x - onAxis.x) * -Math.sin(baseAngle) +
        (authored.y - onAxis.y) * Math.cos(baseAngle)) *
      0.55;
    target.push({
      x: center.x + x * c - y * s - intrinsic * s,
      y: center.y + x * s + y * c + intrinsic * c,
    });
    const regional =
      1 + g.bulge * Math.sin((u + 0.5) * Math.PI) * Math.cos(u * Math.PI * 1.4);
    widths.push(
      clamp(
        g.width *
          regional *
          (1 +
            0.12 * load("security") +
            0.15 * opportunity("physical-fitness") -
            0.08 * load("rest")),
        0.55,
        2.9,
      ),
    );
  }
  const average = target.reduce(
    (p, q) => ({ x: p.x + q.x / target.length, y: p.y + q.y / target.length }),
    { x: 0, y: 0 },
  );
  for (const p of target) {
    p.x += center.x - average.x;
    p.y += center.y - average.y;
  }
  if (stage === 0 && t < 1)
    for (let i = 0; i < target.length; i++) {
      const baseline = sampleArc(currentLine, i / (target.length - 1));
      target[i] = {
        x: mix(baseline.x, target[i].x, t),
        y: mix(baseline.y, target[i].y, t),
      };
      widths[i] = mix(1, widths[i], t);
    }
  return {
    kernel: {
      source: currentLine.map((p) => ({ ...p })),
      target,
      widths,
      strength: stage === 0 ? t : 1,
    },
    phase,
    operations: ["centerline-reorganization", "regional-mass-specialization"],
    sourceId: patch.id,
  };
}

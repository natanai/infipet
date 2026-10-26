import { hash, clamp, type SourceMode } from "./model";
import {
  compileDevelopmentalGenotype,
  type DevelopmentalGenotype,
  type GeneticCoordinates,
} from "../genetics";

/** General developmental grammar; independent of reference catalogs and character identities. */
export const PROCEDURAL_GRAMMAR_VERSION = "morphogenesis-v1" as const;
/** Independent pigment-expression channels leave the existing inherited geometry unchanged. */
export const SURFACE_EXPRESSION_VERSION = "surface-expression-v1" as const;
export const SOMATIC_GROWTH_VERSION = "somatic-growth-v1" as const;

/** Inherited potential. Neither pixels, identifiers, pigment nor care enter this key. */
export type InheritedGenome = {
  version: 7;
  proceduralGrammarVersion: typeof PROCEDURAL_GRAMMAR_VERSION;
  surfaceExpressionVersion: typeof SURFACE_EXPRESSION_VERSION;
  somaticGrowthVersion: typeof SOMATIC_GROWTH_VERSION;
  seed: string;
  mode: SourceMode;
  fingerprint: string;
  /** Quantitative inherited developmental capability channels. */
  genotype: DevelopmentalGenotype;
  pace: number;
  sensitivity: number;
  protectionPreference: "curl" | "enclose" | "reinforce" | "withdraw";
  supportPotential: number;
  membranePotential: number;
  divisionPotential: number;
  limbless: boolean;
  futurePotential: { pigmentExpression: number; hairExpression: number };
  lifeProgram: {
    kind: "direct" | "sheltered" | "metamorphic";
    curvature: [number, number, number];
    foldDirection: -1 | 1;
    maturationBias: number;
    shelterPotential: number;
    regionalReorganization: number;
  };
  stages: StageGenes[];
};
export type StageGenes = {
  id: string;
  start: number;
  end: number;
  stretch: number;
  widen: number;
  turn: number;
  bend: number;
  pinch: number;
  wave: number;
  neck: number;
  limb: number;
  division: number;
  fusion: number;
  membrane: number;
  windows: [number, number, number];
};
export const geneRandom = (key: string, channel: string) =>
  hash(`${key}|life-v7|${channel}`) / 4294967296;
export function compileGenome(
  seed: string,
  mode: SourceMode = "infant",
  coordinates?: GeneticCoordinates,
): InheritedGenome {
  const actual = String(seed ?? "").trim() || "little-world";
  const fingerprint = hash(`${actual}|${mode}|life-v7`)
    .toString(16)
    .padStart(8, "0");
  const r = (key: string) => geneRandom(fingerprint, key);
  const lifeKind = (["direct", "sheltered", "metamorphic"] as const)[
    Math.floor(r("life-program") * 3)
  ];
  const foldDirection =
    r("life-program/direction") < 0.5 ? (-1 as const) : (1 as const);
  return {
    version: 7,
    proceduralGrammarVersion: PROCEDURAL_GRAMMAR_VERSION,
    surfaceExpressionVersion: SURFACE_EXPRESSION_VERSION,
    somaticGrowthVersion: SOMATIC_GROWTH_VERSION,
    seed: actual,
    mode,
    fingerprint,
    genotype: compileDevelopmentalGenotype(fingerprint, coordinates),
    pace: 0.7 + r("pace") * 0.6,
    sensitivity: 0.7 + r("sensitivity") * 0.6,
    protectionPreference: (
      ["curl", "enclose", "reinforce", "withdraw"] as const
    )[Math.floor(r("protection") * 4)],
    supportPotential: r("support"),
    membranePotential: r("membrane"),
    divisionPotential: r("division"),
    limbless: r("limbless") < 0.25,
    futurePotential: {
      pigmentExpression: r("pigment-expression"),
      hairExpression: r("hair-expression"),
    },
    lifeProgram: {
      kind: lifeKind,
      foldDirection,
      curvature: [0, 1, 2].map(
        (i) =>
          foldDirection *
          (0.9 + r(`life-program/${i}/curvature`) * 1.5 + i * 0.3),
      ) as [number, number, number],
      maturationBias: r("life-program/maturation"),
      shelterPotential: r("life-program/shelter"),
      regionalReorganization: 0.55 + r("life-program/reorganization") * 0.45,
    },
    stages: [30, 75, 120].map((end, i) => ({
      id: `evolution.${i + 1}`,
      start: [0, 30, 75][i],
      end,
      stretch: 0.72 + r(`${i}/stretch`) * 1.72,
      widen: 0.67 + r(`${i}/widen`) * 0.95,
      turn: (r(`${i}/turn`) - 0.5) * 1.7,
      bend: (r(`${i}/bend`) - 0.5) * 1.7,
      pinch: 0.18 + r(`${i}/pinch`) * 0.5,
      wave: (r(`${i}/wave`) - 0.5) * 0.75,
      neck: 0.55 + r(`${i}/neck`) * 1.5,
      limb: 0.7 + r(`${i}/limb`) * 1.1,
      division: r(`${i}/division`),
      fusion: r(`${i}/fusion`),
      membrane: r(`${i}/membrane`),
      windows: [0.1, 0.3, 0.5].map((v, j) =>
        clamp(v + (r(`${i}/window/${j}`) - 0.5) * 0.06, 0.04, 0.65),
      ) as [number, number, number],
    })),
  };
}
const smooth = (v: number) => {
  const t = clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};
/** Smooth low-frequency material field: nearby edits do not avalanche into a new genome. */
export function materialGene(
  genome: InheritedGenome,
  channel: string,
  u: number,
  v: number,
): number {
  const x = clamp(u, -4, 4) * 0.7,
    y = clamp(v, -4, 4) * 0.7;
  const ix = Math.floor(x),
    iy = Math.floor(y),
    tx = smooth(x - ix),
    ty = smooth(y - iy);
  const at = (xx: number, yy: number) =>
    geneRandom(genome.fingerprint, `${channel}/${xx}/${yy}`);
  return (
    (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) +
    (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty
  );
}

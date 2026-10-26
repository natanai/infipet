import {
  geneRandom,
  PROCEDURAL_GRAMMAR_VERSION,
  type InheritedGenome,
} from "./genome";

export type BudFamily =
  "support" | "manipulator" | "tail" | "horn" | "ear" | "crest";
export type BudGenes = Readonly<{
  family: BudFamily;
  stage: number;
  enabled: boolean;
  pairs: number;
  length: number;
  thickness: number;
  spread: number;
  bend: number;
}>;
export type MorphogenesisGenes = Readonly<{
  version: typeof PROCEDURAL_GRAMMAR_VERSION;
  /** The conservative population keeps its source body envelope while still growing ordinary features. */
  sourceRetention: number;
  facialPlasticity: number;
  faceStages: readonly {
    eyeScale: number;
    mouthScale: number;
    spacing: number;
    lift: number;
  }[];
  buds: readonly BudGenes[];
}>;

export function inheritedSourceRetention(genome: InheritedGenome): number {
  const r = (channel: string) =>
    geneRandom(genome.fingerprint, `${PROCEDURAL_GRAMMAR_VERSION}/${channel}`);
  return r("body-habit") < 0.2 ? 0.86 + r("source-retention") * 0.1 : 0;
}

/** All potentials are inherited. Neither names, source IDs, target masks nor care enter these draws. */
export function compileMorphogenesis(
  genome: InheritedGenome,
): MorphogenesisGenes {
  const r = (channel: string) =>
    geneRandom(genome.fingerprint, `${PROCEDURAL_GRAMMAR_VERSION}/${channel}`);
  const probabilities: Record<BudFamily, number> = {
    support: 0.48,
    manipulator: 0.38,
    tail: 0.42,
    horn: 0.28,
    ear: 0.32,
    crest: 0.25,
  };
  return {
    version: PROCEDURAL_GRAMMAR_VERSION,
    sourceRetention: inheritedSourceRetention(genome),
    facialPlasticity: r("facial-plasticity") < 0.4 ? 1 : 0,
    faceStages: [0, 1, 2].map((stage) => ({
      eyeScale: 0.8 + r(`face/${stage}/eye-scale`) * 1.1,
      mouthScale: 0.8 + r(`face/${stage}/mouth-scale`) * 1.2,
      spacing: 0.65 + r(`face/${stage}/spacing`) * 0.8,
      lift: (r(`face/${stage}/lift`) - 0.5) * 0.3,
    })),
    buds: (Object.keys(probabilities) as BudFamily[]).map((family) => ({
      family,
      stage: Math.floor(r(`${family}/stage`) * 3),
      enabled: r(`${family}/enabled`) < probabilities[family],
      pairs:
        family === "support" ? 1 + Math.floor(r(`${family}/pairs`) * 2) : 1,
      length: 0.65 + r(`${family}/length`) * 1.25,
      thickness: 0.65 + r(`${family}/thickness`) * 0.8,
      spread: 0.35 + r(`${family}/spread`) * 0.8,
      bend: (r(`${family}/bend`) - 0.5) * 0.9,
    })),
  };
}

export function facialTraitsAt(genes: MorphogenesisGenes, age: number) {
  const identity = { eyeScale: 1, mouthScale: 1, spacing: 1, lift: 0 };
  if (age <= 0 || genes.facialPlasticity === 0) return identity;
  const stage = age < 30 ? 0 : age < 75 ? 1 : 2;
  const start = [0, 30, 75][stage],
    end = [30, 75, 120][stage];
  const t = Math.max(0, Math.min(1, (age - start) / (end - start)));
  const blend = t * t * (3 - 2 * t) * genes.facialPlasticity;
  const before = stage ? genes.faceStages[stage - 1] : identity;
  const after = genes.faceStages[stage];
  return Object.fromEntries(
    Object.keys(identity).map((key) => [
      key,
      before[key as keyof typeof identity] +
        (after[key as keyof typeof identity] -
          before[key as keyof typeof identity]) *
          blend,
    ]),
  ) as typeof identity;
}

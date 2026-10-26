import {
  type DevelopmentalChannels,
  type GeneticGroup,
} from "./channels";
import {
  PRIOR_OPERATORS,
  type GeneticExpression,
  type OperatorEvidence,
  type PriorOperator,
} from "./constraints";

export type DevelopmentConsumer =
  | "src/simulation/development.ts"
  | "src/simulation/morphogenesis.ts"
  | "src/simulation/material-growth.ts"
  | "src/simulation/regional-layout.ts"
  | "src/simulation/somatic-growth.ts"
  | "src/simulation/surface-expression.ts"
  | "src/simulation/metamorphosis.ts";

/**
 * Intended recipients. Each gene controls a measurable capability; none names
 * a species or author-drawn component. A Development agent can map these
 * scalar signals onto source-material growth operators, not new anatomy templates.
 * This table is a handoff contract, NOT evidence of visual growth effects yet.
 */
export const DEVELOPMENT_CONSUMERS = {
  growth: {
    elongation: { module: "src/simulation/somatic-growth.ts", effect: "axial extension factor" },
    expansion: { module: "src/simulation/material-growth.ts", effect: "lateral material expansion" },
    rate: { module: "src/simulation/development.ts", effect: "developmental growth rate" },
  },
  symmetry: {
    bilateral: { module: "src/simulation/regional-layout.ts", effect: "mirror-linked sites" },
    radial: { module: "src/simulation/regional-layout.ts", effect: "radial growth-site coupling" },
    chirality: { module: "src/simulation/regional-layout.ts", effect: "asymmetric placement bias" },
  },
  segmentation: {
    repetition: { module: "src/simulation/regional-layout.ts", effect: "serial domain propensity" },
    boundaries: { module: "src/simulation/regional-layout.ts", effect: "boundary retention" },
  },
  appendages: {
    initiation: { module: "src/simulation/morphogenesis.ts", effect: "eligible bud activation" },
    repetition: { module: "src/simulation/morphogenesis.ts", effect: "eligible bud repetition" },
    extension: { module: "src/simulation/morphogenesis.ts", effect: "bud length potential" },
  },
  branching: {
    initiation: { module: "src/simulation/morphogenesis.ts", effect: "growth-tip branching potential" },
    divergence: { module: "src/simulation/morphogenesis.ts", effect: "branch angle divergence" },
  },
  pigmentation: {
    contrast: { module: "src/simulation/surface-expression.ts", effect: "surface pigment contrast" },
    repetition: { module: "src/simulation/surface-expression.ts", effect: "pattern spatial frequency" },
  },
  support: {
    rigidity: { module: "src/simulation/material-growth.ts", effect: "structural reinforcement" },
    membrane: { module: "src/simulation/development.ts", effect: "membrane areal growth" },
  },
  maturation: {
    onset: { module: "src/simulation/development.ts", effect: "developmental onset timing" },
    plasticity: { module: "src/simulation/metamorphosis.ts", effect: "remodeling capacity" },
  },
  sensitivity: {
    nutrition: { module: "src/simulation/development.ts", effect: "nutrition response coefficient" },
    activity: { module: "src/simulation/development.ts", effect: "mechanical activity response" },
    threat: { module: "src/simulation/development.ts", effect: "protective response coefficient" },
  },
} as const satisfies {
  readonly [G in GeneticGroup]: {
    readonly [C in keyof DevelopmentalChannels[G]]: {
      readonly module: DevelopmentConsumer;
      readonly effect: string;
    };
  };
};

export type DevelopmentOperatorSignal = Readonly<{
  /** [0,1] inherited potential. Never a scientific plausibility judgment. */
  potential: number;
  /** Scientific, fictional, or unknown hints, preserving source provenance. */
  evidence: OperatorEvidence;
}>;
export type DevelopmentGeneticSignals = Readonly<{
  channels: DevelopmentalChannels;
  operators: Readonly<Record<PriorOperator, DevelopmentOperatorSignal>>;
  biologicalPrior: GeneticExpression["lineage"];
}>;

/** Pure projection of inherited potential into a typed Development handoff. */
export function compileDevelopmentGeneticSignals(
  expression: GeneticExpression,
): DevelopmentGeneticSignals {
  const c = expression.channels;
  const potential: Record<PriorOperator, number> = {
    "tip-extension": c.growth.elongation,
    "branch-axis": c.branching.initiation,
    "surface-expansion": c.growth.expansion,
    "tissue-remodeling": c.maturation.plasticity,
    "appendage-extension": c.appendages.extension,
    "wall-deposition": c.support.rigidity,
  };
  const operators = {} as Record<PriorOperator, DevelopmentOperatorSignal>;
  for (const operator of PRIOR_OPERATORS) {
    operators[operator] = {
      potential: potential[operator],
      evidence: expression.lineage?.operators[operator] ?? { status: "unknown" },
    };
  }
  return { channels: c, operators, biologicalPrior: expression.lineage };
}

import { clamp, hash } from "../simulation/model";

/** Quantitative developmental capabilities, not preselected adult forms. */
export const DEVELOPMENTAL_CHANNELS = {
  growth: {
    elongation: "Axial tissue extension potential",
    expansion: "Transverse tissue expansion potential",
    rate: "Rate of somatic tissue accumulation",
  },
  symmetry: {
    bilateral: "Coupling of mirrored growth sites",
    radial: "Coupling of growth sites around a central axis",
    chirality: "Directional bias in otherwise paired growth",
  },
  segmentation: {
    repetition: "Capacity for serially repeated body regions",
    boundaries: "Persistence of boundaries between repeated regions",
  },
  appendages: {
    initiation: "Activation potential of eligible appendage buds",
    repetition: "Number potential of repeated eligible appendage sites",
    extension: "Elongation of supported appendage buds",
  },
  branching: {
    initiation: "Activation potential of branching growth tips",
    divergence: "Divergence of daughter growth axes",
  },
  pigmentation: {
    contrast: "Contrast of produced pigment patterning",
    repetition: "Spatial frequency of recurring pigment markings",
  },
  support: {
    rigidity: "Reinforcement potential in supporting material",
    membrane: "Expansion potential of membrane-like material",
  },
  maturation: {
    onset: "Relative timing of developmental onset",
    plasticity: "Amount of later-stage anatomical remodeling available",
  },
  sensitivity: {
    nutrition: "Responsiveness of growth rate to nutrition",
    activity: "Responsiveness of support growth to activity",
    threat: "Responsiveness of protective remodeling to threat",
  },
} as const;

export const GENOTYPE_SCHEMA_VERSION = 1 as const;
export type GeneticGroup = keyof typeof DEVELOPMENTAL_CHANNELS;
export type DevelopmentalChannels = {
  readonly [G in GeneticGroup]: {
    readonly [C in keyof (typeof DEVELOPMENTAL_CHANNELS)[G]]: number;
  };
};
export type GeneticCoordinates = Partial<Record<GeneticGroup, number>>;
export type DevelopmentalGenotype = Readonly<{
  schemaVersion: typeof GENOTYPE_SCHEMA_VERSION;
  fingerprint: string;
  coordinates: Readonly<Record<GeneticGroup, number>>;
  channels: DevelopmentalChannels;
}>;

const uniform = (key: string) => hash(key) / 4294967296;
const groupNames = Object.keys(DEVELOPMENTAL_CHANNELS) as GeneticGroup[];
const sample = (fingerprint: string, channel: string) =>
  uniform(fingerprint + "|genotype-1|" + channel);

/**
 * Nearby coordinates produce nearby potentials for a fixed fingerprint.
 * Independent seed-specific allele draws preserve diversity between seeds.
 * Editing one group coordinate cannot perturb a different group.
 */
export function compileDevelopmentalGenotype(
  fingerprint: string,
  coordinates: GeneticCoordinates = {},
): DevelopmentalGenotype {
  const loci = {} as Record<GeneticGroup, number>;
  const channels = {} as Record<GeneticGroup, Record<string, number>>;
  for (const group of groupNames) {
    const supplied = coordinates[group];
    if (supplied !== undefined &&
        (!Number.isFinite(supplied) || supplied < 0 || supplied > 1))
      throw new RangeError("Invalid genetic coordinate " + group + ": expected [0,1]");
    const locus = supplied ?? sample(fingerprint, "locus/" + group);
    loci[group] = locus;
    channels[group] = {};
    for (const trait of Object.keys(DEVELOPMENTAL_CHANNELS[group])) {
      const allele = sample(fingerprint, "allele/" + group + "/" + trait);
      channels[group][trait] = clamp(0.67 * locus + 0.33 * allele, 0, 1);
    }
  }
  return {
    schemaVersion: GENOTYPE_SCHEMA_VERSION,
    fingerprint,
    coordinates: loci,
    channels: channels as DevelopmentalChannels,
  };
}

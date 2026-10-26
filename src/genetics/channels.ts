import { clamp, hash, type SourceMode } from "../simulation/model";

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
  /** Identifies the complete seed-derived or explicitly Lab-derived genotype. */
  fingerprint: string;
  coordinates: Readonly<Record<GeneticGroup, number>>;
  channels: DevelopmentalChannels;
}>;
const groupNames = Object.keys(DEVELOPMENTAL_CHANNELS) as GeneticGroup[];
const sample = (key: string, channel: string) =>
  hash(key + "|genotype-1|" + channel) / 4294967296;

/** The sole compiler for ordinary born pets. No externally supplied coordinates. */
export function compileDevelopmentalGenotype(
  seedFingerprint: string,
): DevelopmentalGenotype {
  return assemble(seedFingerprint, seedFingerprint);
}

/**
 * Explicit, non-runtime Lab neighborhood variant. Genetic identity contains a
 * lossless ordered encoding of all effective coordinates plus normalized seed
 * and mode. Seed-derived alleles keep a *stable* sampling key while moving
 * within the neighborhood, avoiding a random avalanche between neighbors.
 */
export function compileExperimentalGenotype(
  seedFingerprint: string,
  normalizedSeed: string,
  mode: SourceMode,
  requested: GeneticCoordinates,
): DevelopmentalGenotype {
  if (!requested || typeof requested !== "object" || Array.isArray(requested))
    throw new TypeError("Lab coordinates must be a genetic group map");
  for (const group of Object.keys(requested))
    if (!groupNames.includes(group as GeneticGroup))
      throw new TypeError("Unknown genetic coordinate: " + group);
  const coordinates = {} as Record<GeneticGroup, number>;
  for (const group of groupNames) {
    const value = requested[group] ?? sample(seedFingerprint, "locus/" + group);
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw new RangeError("Invalid genetic coordinate " + group + ": expected [0,1]");
    coordinates[group] = value;
  }
  const identity = seedFingerprint + "|lab-v1|" +
    JSON.stringify([normalizedSeed, mode, ...groupNames.map(g => coordinates[g])]);
  return assemble(identity, seedFingerprint, coordinates);
}

function assemble(
  fingerprint: string,
  inheritedAlleleKey: string,
  selected?: Readonly<Record<GeneticGroup, number>>,
): DevelopmentalGenotype {
  const coordinates = {} as Record<GeneticGroup, number>;
  const channels = {} as Record<GeneticGroup, Record<string, number>>;
  for (const group of groupNames) {
    const locus = selected?.[group] ?? sample(inheritedAlleleKey, "locus/" + group);
    coordinates[group] = locus;
    channels[group] = {};
    for (const trait of Object.keys(DEVELOPMENTAL_CHANNELS[group])) {
      const allele = sample(inheritedAlleleKey, "allele/" + group + "/" + trait);
      channels[group][trait] = clamp(0.67 * locus + 0.33 * allele, 0, 1);
    }
  }
  return { schemaVersion: GENOTYPE_SCHEMA_VERSION, fingerprint,
    coordinates, channels: channels as DevelopmentalChannels };
}

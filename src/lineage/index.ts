import {
  animalProfiles,
  datasetVersion,
  profileVersion,
  isDescendant,
} from "../phylogeny";
import type { SourceAtlas } from "../simulation/source-atlas";
import type { InheritedGenome } from "../simulation/genome";
import { geneRandom } from "../simulation/genome";
import { hash } from "../simulation/model";
import type {
  DevelopmentStagePoint,
  LineagePlacement,
  LineageProgram,
  LineageTraitModifiers,
} from "./types";

export type {
  DevelopmentStagePoint,
  LiveDevelopmentContext,
  LineagePlacement,
  LineageProgram,
  LineageTraitModifiers,
} from "./types";
export { createDevelopmentClock } from "./clock";
export const LINEAGE_RULES_VERSION = "animal-affinity-v1";
const neutral: LineageTraitModifiers = {
  elongation: 1,
  widening: 1,
  curvature: 1,
  support: 1,
  membrane: 1,
  enclosure: 1,
};
const modifiers: Record<string, Partial<LineageTraitModifiers>> = {
  Porifera: { widening: 1.25, elongation: 0.88, support: 0.8, enclosure: 1.2 },
  Placozoa: { widening: 1.3, elongation: 0.78, curvature: 0.85 },
  Ctenophora: {
    widening: 1.16,
    elongation: 1.12,
    curvature: 1.25,
    membrane: 1.3,
  },
  Cnidaria: { widening: 1.18, elongation: 1.15, curvature: 1.3, membrane: 1.2 },
  Bilateria: { elongation: 1.12, widening: 0.97 },
  Annelida: { elongation: 1.3, widening: 0.82, curvature: 1.3 },
  Nematoda: { elongation: 1.35, widening: 0.75, curvature: 1.35 },
  Mollusca: { elongation: 1.1, widening: 1.2, enclosure: 1.3, curvature: 1.15 },
  Arthropoda: {
    elongation: 1.18,
    widening: 0.88,
    support: 1.3,
    enclosure: 1.2,
  },
  Echinodermata: { elongation: 0.85, widening: 1.3, enclosure: 1.2 },
  Chordata: { elongation: 1.25, widening: 0.9, curvature: 1.15 },
  Actinopterygii: { elongation: 1.3, widening: 0.84, membrane: 1.3 },
  Tetrapoda: { elongation: 1.14, widening: 1.1, support: 1.3 },
  Amphibia: { elongation: 1.22, widening: 0.95, support: 1.2, membrane: 1.1 },
  Mammalia: { elongation: 1.16, widening: 1.16, support: 1.3 },
  Lepidosauria: {
    elongation: 1.3,
    widening: 0.85,
    curvature: 1.25,
    enclosure: 1.1,
  },
  Testudines: { elongation: 0.88, widening: 1.3, enclosure: 1.4, support: 1.2 },
  Crocodylia: { elongation: 1.3, widening: 1.06, enclosure: 1.2, support: 1.2 },
  Aves: { elongation: 1.12, widening: 0.9, membrane: 1.35, support: 1.2 },
};
const root = () =>
  animalProfiles.find((profile) => profile.name === "Metazoa")!;
const profile = (id: string) =>
  animalProfiles.find((item) => item.id === id) ?? root();
const unit = (value: number) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smooth = (value: number) => {
  const v = unit(value);
  return v * v * (3 - 2 * v);
};

/** Conservative game affinity from visible geometry; never a claim of genetic identification. */
export function classifySource(atlas: SourceAtlas): LineagePlacement {
  const evidence: string[] = [];
  const { headCount, supportCount, aspect, holes, floatingCount } =
    atlas.descriptors;
  if (headCount) evidence.push(`${headCount} authored head region(s)`);
  if (supportCount) evidence.push(`${supportCount} authored support region(s)`);
  if (aspect > 1.5) evidence.push("elongated body geometry");
  if (holes) evidence.push("authored negative spaces preserved");
  if (floatingCount) evidence.push("detached material preserved");
  const bilateral =
    atlas.cellCount > 0 && (headCount > 0 || supportCount > 0 || aspect > 1.5);
  const anchor = bilateral
    ? (animalProfiles.find((item) => item.name === "Bilateria") ?? root())
    : root();
  if (!evidence.length)
    evidence.push(
      atlas.cellCount
        ? "insufficient visible anatomy for narrower affinity"
        : "empty source; neutral animal affinity",
    );
  if (headCount > 1)
    evidence.push("fantastical anatomy; broad affinity retained");
  return {
    nodeId: anchor.id,
    profileId: anchor.id,
    confidence: bilateral && headCount <= 1 ? "supported" : "broad",
    evidence,
  };
}

/** The next supported anchors are contracted paths through the actual reference tree. */
export function lineageCandidates(nodeId: string) {
  const descendants = animalProfiles.filter(
    (item) => item.id !== nodeId && isDescendant(item.id, nodeId),
  );
  return descendants
    .filter(
      (item) =>
        !descendants.some(
          (middle) => middle.id !== item.id && isDescendant(item.id, middle.id),
        ),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function sourceAffinity(atlas: SourceAtlas, name: string): number {
  const supports = atlas.descriptors.supportCount;
  const long = atlas.descriptors.aspect > 1.5;
  if (["Annelida", "Nematoda"].includes(name))
    return !supports && long ? 0.65 : -0.15;
  if (name === "Arthropoda")
    return supports >= 6 ? 0.65 : supports > 0 ? 0.15 : -0.1;
  if (
    [
      "Chordata",
      "Tetrapoda",
      "Mammalia",
      "Amphibia",
      "Lepidosauria",
      "Crocodylia",
    ].includes(name)
  )
    return supports > 0 && supports <= 4 ? 0.4 : long ? 0.18 : 0;
  if (["Cnidaria", "Ctenophora", "Echinodermata"].includes(name))
    return !supports && !atlas.descriptors.headCount ? 0.3 : -0.2;
  if (["Porifera", "Placozoa"].includes(name))
    return !supports && !atlas.descriptors.headCount ? 0.25 : -0.25;
  if (name === "Aves")
    return atlas.patches.some((patch) => patch.kind === "wing") ? 0.65 : 0;
  if (name === "Testudines") return atlas.descriptors.holes ? 0.15 : 0;
  return 0;
}

export function compileLineage(
  atlas: SourceAtlas,
  genome: InheritedGenome,
  points: readonly DevelopmentStagePoint[],
): LineageProgram {
  const placement = classifySource(atlas);
  let current = placement.nodeId;
  const commitments = [...points]
    .sort((a, b) => a.atHour - b.atHour || (a.id < b.id ? -1 : 1))
    .map((point) => {
      const candidates = point.atHour > 0 ? lineageCandidates(current) : [];
      const scored = candidates
        .map((candidate) => {
          const traits = { ...neutral, ...modifiers[candidate.name] };
          const seedPotential = geneRandom(
            genome.fingerprint,
            `${LINEAGE_RULES_VERSION}/${current}/${point.id}/${candidate.id}`,
          );
          const careContribution =
            (unit(point.care) - 0.5) *
              (traits.membrane - traits.enclosure) *
              1.4 +
            unit(point.training) * (traits.support - 1) * 1.2 +
            unit(point.battle) * (traits.enclosure - 1) * 1.2;
          return {
            candidate,
            seedPotential,
            careContribution,
            score:
              seedPotential * 0.7 +
              sourceAffinity(atlas, candidate.name) +
              careContribution,
          };
        })
        .sort(
          (a, b) =>
            b.score - a.score || (a.candidate.id < b.candidate.id ? -1 : 1),
        );
      const selected = scored[0];
      if (selected) current = selected.candidate.id;
      return {
        stageId: point.id,
        atHour: Math.max(0, point.atHour),
        nodeId: current,
        profileId: current,
        seedPotential: selected?.seedPotential ?? 0,
        careContribution: selected?.careContribution ?? 0,
      };
    });
  return {
    version: `${datasetVersion}|${profileVersion}|${LINEAGE_RULES_VERSION}`,
    fingerprint: hash(
      `${datasetVersion}|${profileVersion}|${LINEAGE_RULES_VERSION}|${atlas.geometryHash}|${genome.fingerprint}|${JSON.stringify(points)}`,
    ).toString(16),
    placement,
    commitments,
  };
}

/** Smooth each commitment into existing material over eight biological hours. */
export function lineageTraitsAt(
  program: LineageProgram,
  hour: number,
): LineageTraitModifiers {
  let result = { ...neutral };
  const blend = (id: string, amount: number) => {
    const target = { ...neutral, ...modifiers[profile(id).name] };
    for (const key of Object.keys(neutral) as (keyof LineageTraitModifiers)[])
      result[key] += (target[key] - result[key]) * amount;
  };
  blend(program.placement.profileId, smooth(hour / 8));
  for (const point of program.commitments) {
    if (point.atHour > hour) break;
    blend(point.profileId, smooth((hour - point.atHour) / 8));
  }
  return result;
}

export function lineageAt(program: LineageProgram, hour: number) {
  const reached = program.commitments.filter((point) => point.atHour <= hour);
  return {
    ...program.placement,
    ...(reached.length
      ? {
          nodeId: reached[reached.length - 1].nodeId,
          profileId: reached[reached.length - 1].profileId,
        }
      : {}),
    name: profile(
      reached.length
        ? reached[reached.length - 1].profileId
        : program.placement.profileId,
    ).name,
    commitments: reached,
    version: program.version,
  };
}

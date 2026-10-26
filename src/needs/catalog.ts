import snapshot from "./catalog-data.json";

export const NEEDS_CATALOG_VERSION =
  "0c5b73e19f6963a0d38332aafbdfb72149fb0ce5" as const;
export const NEEDS_RULES_VERSION = 2 as const;
export const NEED_IDS = Object.freeze([
  "love-caring",
  "nurturing",
  "connection",
  "belonging",
  "support",
  "consideration",
  "need-for-all-living-things-to-flourish",
  "inclusion",
  "community",
  "safety",
  "contribution",
  "peer-respect",
  "respect",
  "autonomy",
  "to-be-seen",
  "acknowledgement",
  "appreciation",
  "trust",
  "dependability",
  "honesty",
  "honor",
  "commitment",
  "clarity",
  "accountability",
  "causality",
  "fairness",
  "justice",
  "choice",
  "freedom",
  "reliability",
  "act-freely",
  "choose-freely",
  "understanding",
  "recognition",
  "non-judgmental-communication",
  "need-to-matter",
  "friendship",
  "space",
  "peace",
  "serenity",
  "do-things-at-my-own-pace-and-in-my-own-way",
  "calm",
  "participation",
  "to-be-heard",
  "equality",
  "empowerment",
  "consistency",
  "genuineness",
  "mattering",
  "rest",
  "mutuality",
  "relaxation",
  "closeness",
  "authenticity",
  "self-expression",
  "integrity",
  "empathy",
  "privacy",
  "order",
  "beauty",
  "control",
  "predictability",
  "accomplishment",
  "physical-fitness",
  "acceptance",
  "growth",
  "security",
] as const);
export type NeedId = (typeof NEED_IDS)[number];
export type FeelingSatisfaction = "met" | "unmet" | "both";
export type AppearanceStatus = "modeled" | "not-yet-modeled";
export const APPEARANCE_NEED_IDS = Object.freeze([
  "safety",
  "security",
  "trust",
  "rest",
  "relaxation",
  "physical-fitness",
] as const satisfies readonly NeedId[]);

export type CatalogNeed = {
  id: NeedId;
  title: string;
  category: string;
  definition: string;
  narrative: string;
  sources: readonly { url: string; description: string }[];
  feelingIds: readonly string[];
  fauxFeelingIds: readonly string[];
  appearance: AppearanceStatus;
};
export type CatalogFeeling = {
  id: string;
  title: string;
  definition: string;
  satisfaction: FeelingSatisfaction;
  bodySignals: readonly string[];
  needIds: readonly NeedId[];
  fauxFeelingIds: readonly string[];
};
export type CatalogFauxFeeling = {
  id: string;
  title: string;
  feelingIds: readonly string[];
  needIds: readonly NeedId[];
};
export type FeelingNeedEdge = {
  feelingId: string;
  needId: NeedId;
  fromFeeling: boolean;
  fromNeed: boolean;
};

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function readonlyMap<K, V>(
  entries: readonly (readonly [K, V])[],
): ReadonlyMap<K, V> {
  const map = new Map(entries);
  const result: ReadonlyMap<K, V> = Object.freeze({
    get: (key: K) => map.get(key),
    has: (key: K) => map.has(key),
    get size() {
      return map.size;
    },
    entries: () => map.entries(),
    keys: () => map.keys(),
    values: () => map.values(),
    forEach: (
      callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
      thisArg?: unknown,
    ) =>
      map.forEach((value, key) => callback.call(thisArg, value, key, result)),
    [Symbol.iterator]: () => map[Symbol.iterator](),
  }) as ReadonlyMap<K, V>;
  return result;
}

const appearanceIds: ReadonlySet<string> = new Set(APPEARANCE_NEED_IDS);
export const needs: readonly CatalogNeed[] = freeze(
  snapshot.needs.map((need) => ({
    ...need,
    id: need.id as NeedId,
    appearance: appearanceIds.has(need.id)
      ? ("modeled" as const)
      : ("not-yet-modeled" as const),
  })),
);
export const feelings: readonly CatalogFeeling[] = freeze(
  snapshot.feelings as CatalogFeeling[],
);
export const fauxFeelings: readonly CatalogFauxFeeling[] = freeze(
  snapshot.fauxFeelings as CatalogFauxFeeling[],
);
export const feelingNeedEdges: readonly FeelingNeedEdge[] = freeze(
  snapshot.edges as FeelingNeedEdge[],
);
export const catalogProvenance = freeze(snapshot.provenance);
export const needsById = readonlyMap<NeedId, CatalogNeed>(
  needs.map((need) => [need.id, need]),
);
export const feelingsById = readonlyMap<string, CatalogFeeling>(
  feelings.map((feeling) => [feeling.id, feeling]),
);
export const fauxFeelingsById = readonlyMap<string, CatalogFauxFeeling>(
  fauxFeelings.map((feeling) => [feeling.id, feeling]),
);
export const appearanceProfiles = freeze(
  APPEARANCE_NEED_IDS.map((needId) => ({
    needId,
    status: "modeled" as const,
    channels:
      needId === "physical-fitness"
        ? ["vigor", "noveltyDrive"]
        : needId === "rest"
          ? ["recovery", "vigor", "noveltyDrive"]
          : needId === "relaxation"
            ? ["recovery", "noveltyDrive"]
            : [
                "protection",
                "vigilance",
                "guarding",
                "defensiveDisplay",
                "noveltyDrive",
              ],
  })),
);
export function isNeedId(value: unknown): value is NeedId {
  return typeof value === "string" && needsById.has(value as NeedId);
}

/** Explicit prototype hypotheses for canonical catalog gaps; not part of its 540 edges. */
export const feelingRuleFallbacks = freeze([
  {
    needId: "order",
    feelingIds: ["tense", "frustrated"],
    provenance: "prototype-rule",
  },
  {
    needId: "beauty",
    feelingIds: ["sad", "disappointment"],
    provenance: "prototype-rule",
  },
  {
    needId: "control",
    feelingIds: ["powerless", "helpless"],
    provenance: "prototype-rule",
  },
  {
    needId: "predictability",
    feelingIds: ["anxious", "tense"],
    provenance: "prototype-rule",
  },
  {
    needId: "acceptance",
    feelingIds: ["lonely", "hurt"],
    provenance: "prototype-rule",
  },
] as const);

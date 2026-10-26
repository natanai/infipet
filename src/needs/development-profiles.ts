import type { ModeledNeedId } from "./types";

export const DEVELOPMENT_PROFILES_VERSION =
  "regional-need-profiles-v1" as const;
export type DevelopmentRegion =
  "head" | "trunk" | "spine" | "support" | "effectors" | "covering";
export type RegionalNeedProfile = Readonly<{
  needId: ModeledNeedId;
  fictional: true;
  purpose: string;
  mediator: string;
  regions: Readonly<Partial<Record<DevelopmentRegion, number>>>;
  shortageResponse: string;
  tendedResponse: string;
  functionalCosts: readonly string[];
}>;

/** Declared game rules, separate from the canonical feelings/needs associations. */
export const REGIONAL_NEED_PROFILES: Readonly<
  Record<ModeledNeedId, RegionalNeedProfile>
> = {
  safety: {
    needId: "safety",
    fictional: true,
    purpose: "Protection of exposed authored regions",
    mediator: "protective allocation",
    regions: { covering: 1, trunk: 0.8, head: 0.35 },
    shortageResponse:
      "Favor enclosing curvature or reinforcement around existing exposed tissue.",
    tendedResponse:
      "Relax reversible guarding and permit the inherited exposed contour.",
    functionalCosts: [
      "Reinforcement consumes tissue allocation.",
      "Enclosure can reduce reach or movement amplitude.",
    ],
  },
  security: {
    needId: "security",
    fictional: true,
    purpose: "Stable support and predictable load distribution",
    mediator: "support stabilization",
    regions: { support: 1, trunk: 0.7, spine: 0.35 },
    shortageResponse:
      "Favor lower load placement and broader existing support regions.",
    tendedResponse:
      "Permit the inherited elevation and narrower support configuration.",
    functionalCosts: [
      "Broader support requires material.",
      "A stabilizing stance trades some stride or flexibility for contact area.",
    ],
  },
  trust: {
    needId: "trust",
    fictional: true,
    purpose: "Openness and accessible interaction surfaces",
    mediator: "withdrawal versus extension",
    regions: { head: 0.8, effectors: 0.9, spine: 0.3 },
    shortageResponse:
      "Draw existing interaction regions inward while preserving their ownership.",
    tendedResponse:
      "Permit inherited extension and more open head-to-trunk relationships.",
    functionalCosts: [
      "Withdrawal reduces available reach.",
      "Extension exposes more surface and requires structural support.",
    ],
  },
  rest: {
    needId: "rest",
    fictional: true,
    purpose: "Repair and allocation capacity during remodeling",
    mediator: "restorative capacity",
    regions: { trunk: 0.9, effectors: 0.7, support: 0.6 },
    shortageResponse:
      "Reduce reversible tissue fullness and pace without stalling inherited milestones.",
    tendedResponse:
      "Support slow restoration of tissue and remodeling capacity.",
    functionalCosts: [
      "Restoration occupies material and time that cannot all support motion.",
      "Low restorative capacity reduces pace and remodeling expression.",
    ],
  },
  relaxation: {
    needId: "relaxation",
    fictional: true,
    purpose: "Released versus held curvature of existing tissue",
    mediator: "postural tension",
    regions: { spine: 1, head: 0.45, support: 0.35 },
    shortageResponse:
      "Hold tighter curvature and a more constrained existing posture.",
    tendedResponse:
      "Release reversible tension toward the inherited resting curve.",
    functionalCosts: [
      "Held tension reduces bend range and movement amplitude.",
      "Released posture trades some bracing for flexibility.",
    ],
  },
  "physical-fitness": {
    needId: "physical-fitness",
    fictional: true,
    purpose: "Usable existing tissue and effector reinforcement",
    mediator: "functional tissue investment",
    regions: { effectors: 1, support: 1, trunk: 0.7 },
    shortageResponse:
      "Reduce existing functional fullness and usable movement capacity.",
    tendedResponse:
      "Reinforce inherited muscles, effectors and supporting tissue.",
    functionalCosts: [
      "Reinforcement requires material and restorative capacity.",
      "Greater fullness changes load and support demands.",
    ],
  },
};

for (const profile of Object.values(REGIONAL_NEED_PROFILES)) {
  Object.freeze(profile.regions);
  Object.freeze(profile.functionalCosts);
  Object.freeze(profile);
}
Object.freeze(REGIONAL_NEED_PROFILES);

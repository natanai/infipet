/** Independent expression channels. Availability does not imply a need-to-trait rule. */
export const VARIATION_CHANNELS = Object.freeze({
  tissueProportions: { status: "active", domain: "anatomy" },
  axialCurvature: { status: "active", domain: "anatomy" },
  reinforcement: { status: "active", domain: "anatomy" },
  infantEnvelopeRetention: { status: "inherited", domain: "anatomy" },
  rootedAppendageBudding: { status: "inherited", domain: "anatomy" },
  bodyFacePlasticity: { status: "inherited", domain: "anatomy" },
  hairLength: { status: "inherited", domain: "hair" },
  hairCurvature: { status: "inherited", domain: "hair" },
  hairDensity: { status: "reserved", domain: "hair" },
  pigmentSaturation: { status: "reserved", domain: "pigment" },
  pigmentHue: { status: "reserved", domain: "pigment" },
  pigmentBrightness: { status: "reserved", domain: "pigment" },
  movementPace: { status: "active", domain: "function" },
  movementAmplitude: { status: "active", domain: "function" },
} as const);

export type VariationChannel = keyof typeof VARIATION_CHANNELS;

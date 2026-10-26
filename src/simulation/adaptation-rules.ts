/** Fictional gameplay response magnitudes. These are expression bounds, not
 * biological claims or new inherited genes. Zero signals preserve geometry. */
export const ADAPTATION_RULES_VERSION = 2;
/** The inherited trait changes response amplitude, never the clocks or inputs. */
export function appliedCareSensitivity(raw: number): number {
  const inherited = Number.isFinite(raw) ? raw : 1;
  return Math.max(0.85, Math.min(1.15, 1 + (inherited - 1) * 0.5));
}
export const ADAPTATION_RULES = Object.freeze({
  safety: Object.freeze({
    fastCompaction: 0.2,
    fastCurlRadians: 0.4,
    slowReinforcement: 0.18,
    effectorRetraction: 0.22,
    paceLoss: 0.08,
    positiveStructuralResponse: false,
  }),
  security: Object.freeze({
    fastBraceSpread: 0.3,
    slowBraceThickness: 0.2,
    effectorRetraction: 0.12,
    paceLoss: 0.08,
    positiveStructuralResponse: false,
  }),
  trust: Object.freeze({
    fastOpenness: 0.24,
    positiveOpenness: 0.22,
    slowOpenness: 0.12,
    headOverlapDeficit: 0.34,
    headOverlapOpportunity: 0.24,
    effectorRetraction: 0.3,
    effectorExtension: 0.24,
    headTiltDeficit: 0.12,
    headTiltOpportunity: 0.06,
    positiveStructuralResponse: true,
  }),
  rest: Object.freeze({
    slowFullnessLoss: 0.45,
    slowFullnessGain: 0.3,
    paceLoss: 0.32,
    paceGain: 0.16,
    motionLoss: 0.22,
    fastSag: 0.28,
    supportLengthLoss: 0.12,
    supportLengthGain: 0.04,
    positiveStructuralResponse: true,
  }),
  relaxation: Object.freeze({
    fastCurvature: 0.32,
    slowCurvature: 0.14,
    effectorRetraction: 0.14,
    paceLoss: 0.08,
    motionLoss: 0.2,
    positiveStructuralResponse: false,
  }),
  "physical-fitness": Object.freeze({
    slowLoadBearingLoss: 0.45,
    slowLoadBearingGain: 0.32,
    paceLoss: 0.22,
    paceGain: 0.2,
    motionLoss: 0.18,
    fastRecruitment: 0.28,
    supportLengthLoss: 0.1,
    supportLengthGain: 0.12,
    positiveStructuralResponse: true,
  }),
});

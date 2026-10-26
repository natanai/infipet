export type HumanFeedback = {
  humanVisualGate?: string;
  summary?: string;
  frameLevelHumanScoresAssigned?: boolean;
  humanFrameReviewCount?: number | null;
  [key: string]: unknown;
};
export function acceptanceStatus(
  agentGatePassed: boolean,
  feedback?: HumanFeedback | null,
  candidate?: { createdAt?: string },
) {
  const priorHumanGateFailed =
    feedback?.humanVisualGate?.toUpperCase() === "FAILED";
  const priorAt =
      typeof feedback?.recordedAt === "string"
        ? Date.parse(feedback.recordedAt)
        : NaN,
    newAt = candidate?.createdAt ? Date.parse(candidate.createdAt) : NaN;
  const humanBenchmarkPending =
    priorHumanGateFailed &&
    Number.isFinite(priorAt) &&
    Number.isFinite(newAt) &&
    newAt > priorAt;
  const humanGateFailed = priorHumanGateFailed && !humanBenchmarkPending;
  return {
    agentGatePassed,
    priorHumanGateFailed,
    humanGateFailed,
    humanBenchmarkPending,
    overallGatePassed: agentGatePassed && !priorHumanGateFailed,
    status: humanBenchmarkPending
      ? "PROVISIONAL CANDIDATE — HUMAN BENCHMARK REVIEW PENDING"
      : humanGateFailed
        ? "FAILED HUMAN VISUAL GATE"
        : agentGatePassed
          ? "Agent criteria passed; human acceptance unreviewed"
          : "Unreviewed or failed agent criteria",
    feedbackSummary: feedback?.summary ?? null,
    humanFrameScoresCreated: 0,
  };
}
export function acceptanceBanner(
  feedback?: HumanFeedback | null,
  candidate?: { createdAt?: string },
) {
  const status = acceptanceStatus(false, feedback, candidate);
  if (status.humanBenchmarkPending)
    return `**PROVISIONAL CANDIDATE — HUMAN BENCHMARK REVIEW PENDING.** The earlier result failed the user's visual gate: ${feedback?.summary ?? "mostly deformation rather than metamorphosis"} This later candidate may be assessed for improvement but is not human accepted. No per-frame human scores are inferred, and no large expansion follows automatically.\n\n`;
  if (!status.humanGateFailed) return "";
  return `**PROVISIONAL — FAILED HUMAN VISUAL GATE.** ${feedback?.summary ?? "The user rejected the current visual result."} Earlier agent scores do not override this feedback. This is untargeted verbal feedback; no per-frame human scores or human image-coverage counts are inferred. Expanded collection remains on hold.\n\n`;
}

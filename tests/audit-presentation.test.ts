import test from "node:test";
import assert from "node:assert/strict";
import { reviewCoverage } from "../tools/audit/presentation";
import type {
  Manifest,
  ReviewSchedule,
  VisualReview,
} from "../tools/audit/types";

const ages = [0, 30, 75, 120, 240];
const lifecycle = ages.map((age) => `test-pet/s000/neutral/d${age}`);
const overview = "test-pet/s001/neutral/d75";
const manifest: Manifest = {
  protocolVersion: "test",
  metricVersion: "test",
  runId: "test",
  createdAt: "test",
  seedCount: 2,
  seeds: ["a", "b"],
  ages,
  render: { action: "idle", time: 0 },
  presets: [
    {
      id: "test-pet",
      name: "Test",
      parts: [],
      sourceHash: "test",
      cues: [],
      hosts: {},
      limitations: [],
    },
  ],
  histories: [
    { id: "neutral", label: "Neutral", group: "neutral", timeline: [] },
  ],
  versions: {},
  engineHashes: {},
  engineHash: "test",
  runtime: {},
  expected: { cases: 2, frames: 10, scheduledReviewFrames: 6 },
};
const row = {
  id: "L",
  frameIds: lifecycle,
  kind: "lifecycle" as const,
  atlas: "test.png",
  seedIndex: 0,
  ageIndices: [0, 1, 2, 3, 4],
};
const schedule: ReviewSchedule = {
  version: "test",
  frameCount: 6,
  secondaryFrameCount: 5,
  pages: [
    {
      id: "P",
      path: "P.png",
      secondary: false,
      rows: [
        row,
        {
          id: "O",
          frameIds: [overview],
          kind: "overview",
          atlas: "test.png",
          seedIndex: 1,
          ageIndices: [2],
        },
      ],
    },
    { id: "S", path: "S.png", secondary: true, rows: [row] },
  ],
  frameKey: Object.fromEntries(
    [...lifecycle, overview].map((id) => [
      id,
      {
        presetId: "test-pet",
        historyId: "neutral",
        seedIndex: id === overview ? 1 : 0,
        age: Number(id.split("/d")[1]),
      },
    ]),
  ),
};
function receipt(
  pageId: string,
  reviewer: string,
  score = 2,
  rowIds = ["L"],
): VisualReview {
  return {
    reviewer,
    kind: "agent",
    pageId,
    rowIds,
    scores: {
      distinctiveness: score,
      coherence: score,
      richness: score,
      continuity: score,
    },
    notes: "Synthetic coverage-test fixture.",
    defects: [],
    reviewedAt: "2026-10-23T00:00:00Z",
  };
}

test("primary and independent second coverage require their actual page receipts", () => {
  const primary = reviewCoverage(manifest, schedule, [receipt("P", "primary")]);
  assert.equal(primary.primaryReviewed.length, 5);
  assert.equal(primary.secondaryRead.length, 0);
  assert.equal(primary.secondaryReviewed.length, 0);
  const secondary = reviewCoverage(manifest, schedule, [
    receipt("S", "secondary"),
  ]);
  assert.equal(secondary.primaryReviewed.length, 0);
  assert.equal(secondary.secondaryRead.length, 5);
  assert.equal(secondary.secondaryReviewed.length, 0);
  const same = reviewCoverage(manifest, schedule, [
    receipt("P", "same"),
    receipt("S", "same"),
  ]);
  assert.equal(same.secondaryReviewed.length, 0);
  const independent = reviewCoverage(manifest, schedule, [
    receipt("P", "primary"),
    receipt("S", "secondary"),
  ]);
  assert.equal(independent.secondaryReviewed.length, 5);
});

test("visual scores count rows once and exclude lifecycle-only scores from overviews", () => {
  const coverage = reviewCoverage(manifest, schedule, [
    receipt("P", "reviewer", 3),
    receipt("P", "reviewer", 1, ["O"]),
  ]);
  assert.equal(coverage.scored.distinctiveness.observations, 2);
  assert.equal(coverage.scored.distinctiveness.weightedSum / 2, 2);
  assert.equal(coverage.scored.distinctiveness.meets, 1);
  assert.equal(coverage.scored.distinctiveness.frames.size, 6);
  assert.equal(coverage.scored.richness.observations, 1);
  assert.equal(coverage.scored.richness.weightedSum, 3);
  assert.equal(coverage.scored.richness.frames.size, 5);
});

test("agreement uses matched row contexts and independent reviewers", () => {
  const coverage = reviewCoverage(manifest, schedule, [
    receipt("P", "first", 3),
    receipt("S", "second", 1),
  ]);
  assert.deepEqual(coverage.agreement.distinctiveness, {
    jointRows: 1,
    disagreements: 1,
  });
  assert.deepEqual(coverage.agreement.continuity, {
    jointRows: 1,
    disagreements: 1,
  });
  const same = reviewCoverage(manifest, schedule, [
    receipt("P", "same", 3),
    receipt("S", "same", 1),
  ]);
  assert.equal(same.agreement.distinctiveness.jointRows, 0);
});

test("duplicate receipts do not multiply row scores and latest applicable score wins", () => {
  const old = receipt("P", "reviewer", 1);
  const latest = {
    ...receipt("P", "reviewer", 3),
    reviewedAt: "2026-10-24T00:00:00Z",
  };
  const coverage = reviewCoverage(manifest, schedule, [old, latest, latest]);
  assert.equal(coverage.scored.coherence.observations, 1);
  assert.equal(coverage.scored.coherence.weightedSum, 3);
  assert.equal(coverage.primaryReviewed.length, 5);
  assert.equal(coverage.statuses[lifecycle[0]].agent, 1);
});

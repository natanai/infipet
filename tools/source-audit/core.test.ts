import assert from "node:assert/strict";
import test from "node:test";
import { coreOccupancy, coreHash, regionalMasks } from "./core";
import {
  inventorySupportsEvolution,
  reviewSummary,
  reviewTemplates,
  validateReviews,
} from "./reviews";
import { acceptanceStatus, acceptanceBanner } from "./acceptance";
import { report } from "./report";
import { stageCounts, PROTOCOL_VERSION, METRIC_VERSION } from "./protocol";
import { rate } from "./metrics";
import type { CaseResult, Manifest, Review, View } from "./types";
const p = (x: number, y: number, color = "#DDAA33") => ({ x, y, color });
test("core occupancy uses actual body/head/enclosure material and preserves gaps, excluding dramatic appendages and markings", () => {
  const body = { kind: "body", pixels: [p(1, 1), p(3, 1), p(1, 3), p(3, 3)] },
    head = { kind: "head", pixels: [p(8, 1)] },
    shell = { kind: "body", role: "cocoon", pixels: [p(9, 4)] };
  const excluded = [
    "eye",
    "mouth",
    "ear",
    "tail",
    "hair",
    "arm",
    "hand",
    "leg",
    "foot",
    "wing",
    "horn",
    "decoration",
  ].map((kind, i) => ({ kind, pixels: [p(2, 2), p(20 + i, 20)] }));
  const core = coreOccupancy([body, head, shell, ...excluded]);
  assert.equal(core.length, 6);
  assert.ok(core.every((p) => p.color === "#FFFFFF"));
  assert.ok(!core.some((p) => p.x === 2 && p.y === 2));
  const longer = coreOccupancy([
    body,
    head,
    shell,
    {
      kind: "tail",
      pixels: Array.from({ length: 25 }, (_, i) => p(20 + i, 10)),
    },
  ]);
  assert.equal(coreHash(core), coreHash(longer));
});
test("scaling, long appendages, global rotation or posture alone cannot pass even with optimistic metadata scores", () => {
  const onlyLength = {
    coreOrganization: [],
    functionalRoles: [],
    enclosure: [],
    sourceContinuity: ["same face"],
    scalingAppendageRotationOrPostureOnly: true,
  };
  assert.equal(inventorySupportsEvolution(onlyLength), false);
  assert.equal(
    inventorySupportsEvolution({
      ...onlyLength,
      scalingAppendageRotationOrPostureOnly: false,
      functionalRoles: [
        {
          from: "leg",
          to: "arm",
          evidence: "Controller labels changed; torso is unchanged",
        },
      ],
    }),
    false,
  );
  assert.equal(
    inventorySupportsEvolution({
      ...onlyLength,
      scalingAppendageRotationOrPostureOnly: false,
      coreOrganization: [
        { kind: "mass-redistribution", evidence: "Taller body only" },
      ],
    }),
    false,
  );
});
test("audit1-style12/12 metadata without core images and inventory is not audit2 acceptance", () => {
  const c = {
      plan: { id: "fixture", group: "primary", ages: [0, 30, 75, 120] },
      views: [0, 30, 75, 120].map(
        (age) =>
          ({
            id: `v${age}`,
            age,
            kind: "endpoint",
            hash: `h${age}`,
            coreHash: `c${age}`,
          }) as View,
      ),
    } as CaseResult,
    templates = reviewTemplates([c]);
  const old = templates.flatMap((t) =>
    ["primary", "secondary"].map(
      (role) =>
        ({
          ...t,
          reviewer: role,
          reviewerKind: "agent",
          role,
          status: "reviewed",
          evolution: 2,
          descent: 2,
          continuity: 2,
          featureCoherence: 2,
          inspectedViewIds: t.requiredViewIds,
          evidenceHashes: Object.fromEntries(
            c.views.map((v) => [v.id, v.hash]),
          ),
          changeInventory: null,
        }) as Review,
    ),
  );
  assert.equal(reviewSummary(old, templates, 4, 4).gatePassed, false);
  assert.throws(
    () => validateReviews(old, templates, [c]),
    /visual change inventory/,
  );
});
test("human feedback survives report generation and overrides a permissive agent gate without inventing human frame ratings", () => {
  const feedback = {
    humanVisualGate: "FAILED",
    summary: "Still mostly stretching; meaningful metamorphosis wanted.",
    frameLevelHumanScoresAssigned: false,
    humanFrameReviewCount: null,
  };
  const status = acceptanceStatus(true, feedback);
  assert.equal(status.overallGatePassed, false);
  assert.equal(status.humanFrameScoresCreated, 0);
  assert.match(acceptanceBanner(feedback), /FAILED HUMAN VISUAL GATE/);
  const m = {
    runId: "synthetic-test-only",
    protocolVersion: PROTOCOL_VERSION,
    metricVersion: METRIC_VERSION,
    captureHash: "synthetic",
    expected: stageCounts("proof"),
  } as Manifest;
  const s = {
    actual: {
      cases: 0,
      failures: 0,
      views: 0,
      endpoints: 0,
      interiors: 0,
      poses: 0,
      sourceViews: 0,
      careViews: 0,
      coreDiagnosticViews: 0,
    },
    reliability: {},
    performance: {
      p50Ms: null,
      p95Ms: null,
      within16Ms: rate(0, 0, "synthetic", "all"),
      within50Ms: rate(0, 0, "synthetic", "all"),
    },
    geneticSeparation: [],
    coreTransitionSeparation: [],
    sourceCounterfactuals: [],
    careResponses: [],
    variance: [],
    cycles: [],
    limitations: [],
    failures: [],
  } as unknown as Parameters<typeof report>[1];
  const coverage = { ...reviewSummary([], [], 0, 0), gatePassed: true };
  const text = report(m, s, coverage, [], { unchanged: true }, feedback);
  assert.match(text, /PROVISIONAL — FAILED HUMAN VISUAL GATE/);
  assert.match(text, /Overall acceptance: \*\*FAILED HUMAN VISUAL GATE/);
  assert.match(text, /no per-frame human scores/);
});
test("a later candidate is human-benchmark-pending rather than silently accepted or falsely human-rated", () => {
  const feedback = {
    humanVisualGate: "FAILED",
    recordedAt: "2026-10-24T05:00:00Z",
    summary: "Old version mostly stretches",
  };
  const old = acceptanceStatus(true, feedback, {
      createdAt: "2026-10-24T04:59:00Z",
    }),
    candidate = acceptanceStatus(true, feedback, {
      createdAt: "2026-10-24T06:00:00Z",
    });
  assert.equal(old.humanGateFailed, true);
  assert.equal(candidate.humanBenchmarkPending, true);
  assert.equal(candidate.overallGatePassed, false);
  assert.equal(candidate.humanFrameScoresCreated, 0);
  assert.match(
    acceptanceBanner(feedback, { createdAt: "2026-10-24T06:00:00Z" }),
    /BENCHMARK REVIEW PENDING/,
  );
});
test("a second independent regional anatomical change can qualify without requiring new limbs/functions", () => {
  const coreOrganization = [
    {
      kind: "axial-reorganization" as const,
      evidence:
        "Torso divides its anterior/posterior mass around a new axial arrangement.",
    },
  ];
  const valid = {
    coreOrganization,
    functionalRoles: [],
    enclosure: [],
    sourceContinuity: ["Authored head markings remain on the head mass."],
    scalingAppendageRotationOrPostureOnly: false,
    regionalAnatomy: [
      {
        kind: "regional-occupancy" as const,
        regions: ["head", "trunk"],
        evidence:
          "Head fraction becomes smaller while the posterior torso develops a broad abdomen; visible in regional masks.",
        independentOfCoreOrganization: true,
        normalizedEvidence: {
          from: 0.45,
          to: 0.22,
          unit: "fraction-of-core-union" as const,
        },
      },
    ],
  };
  assert.equal(inventorySupportsEvolution(valid), true);
  assert.equal(
    inventorySupportsEvolution({
      ...valid,
      regionalAnatomy: [
        { ...valid.regionalAnatomy[0], evidence: coreOrganization[0].evidence },
      ],
    }),
    false,
  );
  assert.equal(
    inventorySupportsEvolution({
      ...valid,
      regionalAnatomy: [
        { ...valid.regionalAnatomy[0], independentOfCoreOrganization: false },
      ],
    }),
    false,
  );
});
test("regional evidence is derived from occupied masks with explicit overlap, not pigment or an assumed physical-mass conservation law", () => {
  const regions = regionalMasks([
    { kind: "body", pixels: [p(1, 1), p(2, 1)] },
    { kind: "head", pixels: [p(2, 1), p(3, 1)] },
    { kind: "body", role: "enclosure", pixels: [p(4, 1)] },
  ]);
  assert.equal(regions.regionalOccupancy.coreUnion, 4);
  assert.equal(regions.regionalOccupancy.head, 2);
  assert.equal(regions.regionalOccupancy.trunk, 2);
  assert.equal(regions.regionalOccupancy.headTrunkOverlap, 1);
  assert.equal(regions.regionalOccupancy.headFraction, 0.5);
  assert.equal(regions.regionalOccupancy.headToTrunk, 1);
  assert.ok(
    regions.regionalPixels.some((p) => p.x === 2 && p.color === "#FFE08A"),
  );
});

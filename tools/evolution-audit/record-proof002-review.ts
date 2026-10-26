/** Receipt of actual image inspection; these scores are not inferred metrics. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { VisualReview } from "./types";

const run = resolve("docs/audits/life-v6/v6-proof-002");
const cases = [
  "bean__s01__neutral",
  "bean__s02__neutral",
  "bean__s03__neutral",
  "bean__s04__neutral",
];
const observations = [
  [
    [
      2,
      2,
      2,
      2,
      "Birth face separates into a small head above a round/lobed body mass. This is more than uniform enlargement and reads as an evolved pod creature.",
    ],
    [
      2,
      2,
      2,
      2,
      "Round head/body arrangement becomes a long quadruped-like body with changed facial position and support anatomy. Root-growing limbs are more integrated than001.",
    ],
    [
      1,
      2,
      1,
      1,
      "Elder still largely repeats adult's long body and adds wings/extra support elements. Wing development shows a detached plate/line above the body around97.5–105 (B00017–18).",
    ],
  ],
  [
    [
      2,
      3,
      2,
      2,
      "Birth becomes a tall biped with distinct small head and feet. Material/face identity is clearer than001.",
    ],
    [
      2,
      2,
      2,
      2,
      "Tall biped becomes a wide pod/floating mass with absorbed support feet and a preserved top head.",
    ],
    [
      3,
      2,
      3,
      2,
      "Central cavity opens into a ring body while the facial island survives at the upper rim. Substantial new form and markedly improved facial protection.",
    ],
  ],
  [
    [
      2,
      3,
      2,
      2,
      "Infant differentiates into a squat quadruped with small raised head. Feet develop at the host rather than as long detached wires.",
    ],
    [
      2,
      2,
      2,
      2,
      "Quadruped reorganizes into a diagonal/diamond-shaped floating or swimming mass, retiring support legs and changing head/body layout.",
    ],
    [
      2,
      2,
      2,
      2,
      "Compact diagonal form develops a distinct long tapering rear body with raised anterior head mass. Motion is substantially cleaner than001; some crowded dark detail remains.",
    ],
  ],
  [
    [
      1,
      2,
      1,
      2,
      "Birth to teen remains mainly an enlarged flattened blob with facial details shifted right. No two independent major anatomical changes are clearly visible.",
    ],
    [
      2,
      1,
      2,
      1,
      "Wide blob reorganizes into an upright narrow body with small top head. A detached white vertical fragment is visible far right at75 in endpoint and every pose (B00156/B00189–196), reducing coherence.",
    ],
    [
      2,
      2,
      2,
      2,
      "Upright body becomes a low extended tapering body with a raised anterior head region. More differentiated than001, though it approaches the third lineage's elder form.",
    ],
  ],
] as const;

async function main() {
  const path = resolve(run, "visual-reviews.json"),
    previous: VisualReview[] = JSON.parse(await readFile(path, "utf8"));
  const reviewer = "/root/audit_v6",
    records: VisualReview[] = [];
  for (let seed = 0; seed < cases.length; seed++)
    for (let stage = 0; stage < 3; stage++) {
      const [
        distinctiveness,
        featureCoherence,
        transformationRichness,
        continuity,
        notes,
      ] = observations[seed][stage];
      records.push({
        caseId: cases[seed],
        fromAge: [0, 30, 75][stage],
        toAge: [30, 75, 120][stage],
        reviewer,
        reviewerKind: "agent",
        status: "reviewed",
        distinctiveness,
        featureCoherence,
        transformationRichness,
        continuity,
        notes,
      });
    }
  await writeFile(
    path,
    JSON.stringify(
      [
        ...previous.filter(
          (r) => r.reviewer !== reviewer && r.status === "reviewed",
        ),
        ...records,
      ],
      null,
      2,
    ),
  );
  await writeFile(
    resolve(run, "review-audit-v6.json"),
    JSON.stringify(
      {
        reviewer,
        reviewerKind: "agent",
        runId: "v6-proof-002",
        conclusion:
          "Improved, but visual gate remains failed; do not expand this candidate.",
        inspected: {
          endpointViews: 16,
          intermediateViews: 60,
          poseViews: 128,
          totalScheduledViews: 204,
        },
        evidence: [
          "atlases/endpoint-001.png",
          "atlases/interior-001.png",
          "atlases/pose-001.png",
          "atlases/pose-002.png",
        ],
        limitations: [
          "Actual contact-sheet images reviewed; motion judged from complete held-pose sequences rather than physical-device playback.",
          "No human review performed.",
          "Blind labels viewed before mapping cases for diagnosis.",
        ],
        clearEvolution: {
          numerator: 10,
          denominator: 12,
          percent: (100 * 10) / 12,
          condition:
            "Agent distinctiveness>=2; all adjacent milestone comparisons",
          ages: "0→30,30→75,75→120",
        },
        defects: [
          {
            id: "EV6-006",
            caseId: cases[0],
            ages: [75, 120],
            issue:
              "Adult-to-elder chiefly repeats long body with added wings/support structures.",
          },
          {
            id: "EV6-007",
            caseId: cases[0],
            ages: [97.5, 105],
            issue:
              "Developing wing appears as a detached plate/line above body.",
          },
          {
            id: "EV6-008",
            caseId: cases[3],
            ages: [0, 30],
            issue: "Mostly an enlarged flattened blob.",
          },
          {
            id: "EV6-009",
            caseId: cases[3],
            ages: [75],
            issue:
              "Detached white vertical fragment far right remains visible throughout motion cycle.",
          },
        ],
        improvements: [
          "Facial island survives ring-body cavity.",
          "Early support anatomy grows nearer its host.",
          "Raised facial masses make several silhouettes more differentiated.",
          "Serpentine motion has fewer severe contour pinches than001.",
        ],
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

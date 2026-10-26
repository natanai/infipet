/** Explicit review receipt for the inspected first candidate, not a generated score. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { VisualReview } from "./types";

const run = resolve("docs/audits/life-v6/v6-proof-001");
const cases = [
  "bean__s01__neutral",
  "bean__s02__neutral",
  "bean__s03__neutral",
  "bean__s04__neutral",
];
const observations = [
  [
    [
      1,
      3,
      1,
      2,
      "Birth to teen remains the same round smiling mass at larger size. No two independent major anatomical changes are visually apparent.",
    ],
    [
      2,
      2,
      2,
      1,
      "Teen to adult becomes a long quadruped-like mass with repositioned face and support anatomy. Thin wire-like legs are visibly detached during early intermediate growth (B00010–11).",
    ],
    [
      1,
      2,
      1,
      2,
      "Adult and elder retain almost the same elongated body and facial layout; elder mainly adds/thickens legs. Does not read as a major evolved form.",
    ],
  ],
  [
    [
      2,
      2,
      2,
      1,
      "Birth to teen becomes a tall biped with feet. Early growth displays detached wire limbs below body and speckled facial pixels (B00056–58).",
    ],
    [
      2,
      3,
      2,
      2,
      "Biped becomes a wider floating round mass and absorbs support feet; facial arrangement remains readable at endpoint.",
    ],
    [
      3,
      0,
      2,
      1,
      "Elder opens a major central cavity, but the face loses readability and appears swallowed by the cavity. Strong topology change fails feature coherence.",
    ],
  ],
  [
    [
      2,
      2,
      2,
      1,
      "Birth to teen develops a squat quadruped-like support plan. Intermediate wire limbs and stippled face are visible before integration.",
    ],
    [
      2,
      2,
      2,
      2,
      "Support limbs are absorbed into a round floating mass. Face is readable at adult endpoint but less stable during intermediate reshaping.",
    ],
    [
      1,
      1,
      1,
      1,
      "Adult becomes a flattened ribbon-like body, chiefly through mass stretching/compression. Facial pixels become scattered; motion pinches material into noisy separated-looking bulges.",
    ],
  ],
  [
    [
      1,
      3,
      1,
      2,
      "Birth to teen is primarily an enlarged flattened ellipse with the same face. Does not establish a new anatomical organization.",
    ],
    [
      1,
      2,
      1,
      2,
      "Wide ellipse becomes a tall narrow ellipse with little independent anatomical structure. Large proportion change alone does not meet the visual criterion.",
    ],
    [
      1,
      1,
      1,
      1,
      "Tall ellipse becomes a flattened ribbon. Looks like another axis/proportion transform; the face becomes speckled and motion introduces severe contour pinching.",
    ],
  ],
] as const;

async function main() {
  const path = resolve(run, "visual-reviews.json");
  const previous: VisualReview[] = JSON.parse(await readFile(path, "utf8"));
  const reviewer = "/root/audit_v6";
  const records: VisualReview[] = [];
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
  const retained = previous.filter(
    (r) => r.reviewer !== reviewer && r.status === "reviewed",
  );
  await writeFile(path, JSON.stringify([...retained, ...records], null, 2));
  await writeFile(
    resolve(run, "review-audit-v6.json"),
    JSON.stringify(
      {
        reviewer,
        reviewerKind: "agent",
        runId: "v6-proof-001",
        conclusion: "Visual gate failed; do not expand this candidate.",
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
          "Reviewed actual contact-sheet images; motion timing was assessed from held pose sequences rather than physical-device playback.",
          "No human review was performed.",
          "The reviewer saw blind frame labels first, then mapped labels to case IDs for diagnosis.",
        ],
        clearEvolution: {
          numerator: 6,
          denominator: 12,
          percent: 50,
          condition:
            "Agent distinctiveness>=2, all adjacent milestone comparisons",
          ages: "0→30,30→75,75→120",
        },
        defects: [
          {
            id: "EV6-001",
            caseId: cases[0],
            ages: [75, 120],
            issue: "Adult-to-elder repeats body plan with appendage changes.",
          },
          {
            id: "EV6-002",
            caseId: cases[1],
            ages: [105, 120],
            issue: "Central cavity swallows facial region.",
          },
          {
            id: "EV6-003",
            caseId: cases[0],
            ages: [37.5, 45],
            issue:
              "New support limbs appear as detached wires before integrating.",
          },
          {
            id: "EV6-004",
            caseId: cases[3],
            ages: [0, 30, 75, 120],
            issue:
              "Most development remains ellipse scaling, axis change and compression.",
          },
          {
            id: "EV6-005",
            caseId: cases[2],
            ages: [120],
            issue:
              "Serpentine motion pinches contours and scatters facial detail.",
          },
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

import { STARTER_PRESETS } from "../../src/presets";
import type { PetPart } from "../../src/simulation";
import { digest, type AuditStage } from "./protocol";
import type { Source } from "./types";

const clone = (parts: readonly PetPart[]): PetPart[] =>
  JSON.parse(JSON.stringify(parts));
export const PROOF_SOURCE_ID = "canine-cub";
const cues: Record<string, string[]> = {
  "canine-cub": [
    "Long horizontal trunk and smaller offset head",
    "Four authored legs and feet",
    "Pointed paired ears",
    "Upturned bent tail",
    "Unequal eye clusters and dark flank marking",
  ],
  bean: [
    "Limbless rounded authored body",
    "Paired black eyes",
    "U-shaped mouth and cheek markings",
  ],
  sprout: [
    "Separate head and body",
    "Paired curved hair shoots",
    "Two arms and two legs",
  ],
  ribbon: [
    "Coiled elongated centerline",
    "Terminal face",
    "Authored loop and negative spaces",
  ],
  beetle: [
    "Segmented authored trunk",
    "Paired protrusions",
    "Small facial clusters",
  ],
  wisp: [
    "Hollow body",
    "Deliberately detached facial/hand features",
    "Floating ornament",
  ],
};
export function primarySources(stage: AuditStage): Source[] {
  const ids =
    stage === "proof"
      ? [PROOF_SOURCE_ID]
      : stage === "three"
        ? [PROOF_SOURCE_ID, "bean", "wisp"]
        : STARTER_PRESETS.map((p) => p.id);
  return ids.map((id) => {
    const preset = STARTER_PRESETS.find((p) => p.id === id);
    if (!preset) throw new Error(`Missing audit source ${id}`);
    const parts = clone(preset.parts);
    return {
      id,
      name: preset.name,
      parts,
      sourceHash: digest(parts),
      expectations: cues[id] ?? [],
    };
  });
}
function mapAbsolute(
  parts: PetPart[],
  ids: Set<string>,
  fn: (x: number, y: number) => { x: number; y: number },
) {
  for (const part of parts.filter((p) => ids.has(p.id))) {
    const cells = new Map<string, (typeof part.pixels)[number]>();
    for (const p of part.pixels) {
      const mapped = fn(p.x + part.position.x, p.y + part.position.y);
      const x = Math.round(mapped.x),
        y = Math.round(mapped.y);
      if (x < 0 || x > 31 || y < 0 || y > 31)
        throw new Error(`Counterfactual ${part.id} leaves drawing canvas`);
      cells.set(`${x},${y}`, { ...p, x, y });
    }
    part.position = { x: 0, y: 0 };
    part.pixels = [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  }
}
export function counterfactualSources(base: Source): Source[] {
  const variants: {
    id: string;
    expectation: string;
    edit: (parts: PetPart[]) => void;
  }[] = [
    {
      id: "body-ratio",
      expectation:
        "Authored trunk proportions alter descendant trunk proportions; inherited genes stay fixed. Pixel area is recorded, not assumed conserved after rasterization.",
      edit: (parts) =>
        mapAbsolute(parts, new Set(["body", "flank-mark"]), (x, y) => ({
          x: 16 + (x - 16) * 1.18,
          y: 17 + (y - 17) * 0.82,
        })),
    },
    {
      id: "body-bend",
      expectation:
        "Authored trunk curvature influences descendant centerline or material contour, without rerolling unrelated genes.",
      edit: (parts) =>
        mapAbsolute(parts, new Set(["body", "flank-mark"]), (x, y) => ({
          x,
          y: y + 3 * ((x - 16) / 9) ** 2 - 1,
        })),
    },
    {
      id: "attachment-length",
      expectation:
        "Longer authored tail has a measurable corresponding descendant effect while retaining its source identity and root.",
      edit: (parts) =>
        mapAbsolute(parts, new Set(["tail"]), (x, y) => ({
          x: 9 + (x - 9) * 1.3,
          y: 16 + (y - 16) * 1.1,
        })),
    },
    {
      id: "face-spacing",
      expectation:
        "Wider authored eye spacing remains distinguishable on descendant hosts; unrelated anatomy does not reroll.",
      edit: (parts) => {
        for (const p of parts.filter((p) => p.kind === "eye"))
          p.position.x += p.id.includes("left") ? -1 : 1;
      },
    },
    {
      id: "palette-control",
      expectation:
        "Recoloring changes pigments but not anatomy, inherited genes, or structural descriptors.",
      edit: (parts) => {
        for (const p of parts)
          for (const cell of p.pixels)
            cell.color =
              cell.color.toLowerCase() === "#ffffff" ? "#B9D8C5" : "#17251D";
      },
    },
    {
      id: "ordering-control",
      expectation:
        "Source array ordering with unchanged IDs, depths and pixels must not change output or genes.",
      edit: (parts) => parts.reverse(),
    },
  ];
  return variants.map((v) => {
    const parts = clone(base.parts);
    v.edit(parts);
    return {
      id: `${base.id}--${v.id}`,
      name: `${base.name}: ${v.id}`,
      parts,
      sourceHash: digest(parts),
      variant: v.id,
      parentSourceId: base.id,
      expectations: [v.expectation],
    };
  });
}

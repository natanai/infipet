import type { PetPart } from "./simulation/model";

export const DRAWING_FEATURE_HINTS_VERSION =
  "authored-brush-only-v2" as const;

/**
 * Convert rows of unlabelled monochrome ink into the one part that an
 * unselected drawing brush is allowed to create: BODY.
 *
 * A cavity is empty space, not an eye. Two marks are not automatically eyes,
 * a mouth, horns, or limbs. Only a player-selected anatomical brush can assign
 * those kinds. Geometry remains available to physical topology and material
 * constraints, never to semantic classification.
 */
export function drawingFromMonochromeRows(rows: readonly string[]): PetPart[] {
  const height = rows.length;
  const width = Math.max(0, ...rows.map(row => row.length));
  if (!height || !width || width > 32 || height > 32 ||
      rows.some(row => row.length !== width || /[^.#]/.test(row)))
    throw new Error(
      "Drawings must be rectangular monochrome ink within the shared 32-cell canvas.",
    );
  const pixels = rows.flatMap((row, y) =>
    [...row].flatMap((mark, x) =>
      mark === "#" ? [{ x, y, color: "#FFFFFF" }] : []),
  );
  if (!pixels.length) throw new Error("A drawing needs visible ink.");
  return [{
    id: "body",
    kind: "body",
    name: "Body",
    parentId: null,
    position: {
      x: Math.floor((32 - width) / 2),
      y: Math.floor((32 - height) / 2),
    },
    pixels,
  }];
}

import type { SpeculativeBranchInput } from "./index";

/**
 * Fictional anatomical possibility overlays, never scientific taxa.
 * Their parents are reference inspirations; the pet does not biologically
 * acquire ancestry by moving along these paths.
 *
 * These are generic growth-operator priors, NOT species-shaped sprites,
 * forced adult designs, or predetermined development destinations.
 */
export const FANTASY_PATHS: readonly SpeculativeBranchInput[] = Object.freeze([
  { id: "fiction:dragon", parentId: "ott35881", name: "Dragon",
    rationale: "Mythological winged, horned reptilian possibilities",
    operatorHints: ["appendage-extension", "surface-expansion", "tissue-remodeling"] },
  { id: "fiction:griffin", parentId: "ott81461", name: "Griffin",
    rationale: "Mythological bird and mammal anatomical combinations",
    operatorHints: ["appendage-extension", "tissue-remodeling"] },
  { id: "fiction:phoenix", parentId: "ott81461", name: "Phoenix",
    rationale: "Mythological avian transformations",
    operatorHints: ["appendage-extension", "surface-expansion", "tissue-remodeling"] },
  { id: "fiction:unicorn", parentId: "ott244265", name: "Unicorn",
    rationale: "Mythological horned mammalian possibilities",
    operatorHints: ["appendage-extension", "tissue-remodeling"] },
  { id: "fiction:merfolk", parentId: "ott125642", name: "Merfolk",
    rationale: "Mythological aquatic and appendicular transformation",
    operatorHints: ["tissue-remodeling", "appendage-extension"] },
  { id: "fiction:dryad", parentId: "ncbi:3193", name: "Dryad",
    rationale: "Mythological plant-like creature development",
    operatorHints: ["branch-axis", "surface-expansion", "tissue-remodeling"] },
  { id: "fiction:mycelial-spirit", parentId: "ncbi:4751", name: "Mycelial spirit",
    rationale: "Fictional fungal body architecture",
    operatorHints: ["branch-axis", "surface-expansion", "tissue-remodeling"] },
  { id: "fiction:chimera", parentId: "ott229562", name: "Chimera",
    rationale: "Mythological composite tetrapod developmental possibilities",
    operatorHints: ["appendage-extension", "tissue-remodeling"] },
]);

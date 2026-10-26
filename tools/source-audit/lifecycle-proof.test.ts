import assert from "node:assert/strict";
import test from "node:test";
import { firstSheltered, LIFECYCLE_AGES } from "./lifecycle-proof";
test("sheltered coverage chooses the first genotype metadata match, not a later visually preferred seed", () => {
  const rows = ["direct", "metamorphic", "sheltered", "sheltered"].map(
    (kind, seedIndex) => ({
      seed: `fixed-${seedIndex}`,
      seedIndex,
      kind,
      genomeHash: `g${seedIndex}`,
    }),
  );
  assert.equal(firstSheltered(rows)?.seedIndex, 2);
  assert.equal(firstSheltered(rows.slice(0, 2)), null);
  assert.deepEqual(
    LIFECYCLE_AGES,
    [0, 12, 18, 24, 30, 36, 45, 60, 70, 75, 120],
  );
});

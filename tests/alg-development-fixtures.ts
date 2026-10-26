import { describeSource } from "../src/simulation/source-atlas";
import { compileSources } from "../src/simulation/material";
import { compileGenome } from "../src/simulation/genome";
import type { PetPart, PartKind } from "../src/simulation/model";

export function drawing(rows: readonly string[], kind: PartKind = "decoration"): PetPart[] {
  return [{
    id: "original", kind, name: "Unlabeled art",
    parentId: null, position: { x: 0, y: 0 },
    pixels: rows.flatMap((row, y) => [...row].flatMap((mark, x) =>
      mark === "." ? [] : [{ x, y, color: "#184c52" }])),
  }];
}
export const fixtures = {
  blob: drawing([".....", ".###.", ".###.", ".###.", "....."]),
  symmetric: drawing(["..#.#..", ".#####.", "#######", "..#.#..", "..#.#.."]),
  branching: drawing(["#...#", ".#.#.", "..#..", "..#..", "..#.."]),
  disconnected: drawing(["#.......#", ".........", "....#...."]),
  cavity: drawing(["#####", "#...#", "#...#", "#...#", "#####"]),
  fantasy: drawing([".#...##.", "##..#...", ".#.#..#.", "....#.#.", "##...##."]),
  empty: drawing([]),
};
export function materialInputs(parts: PetPart[], seed = "source-seed") {
  const genome = compileGenome(seed);
  const atlas = describeSource(compileSources(parts, 0));
  return { atlas, genome };
}

import assert from "node:assert/strict";
import test from "node:test";
import { createSimulation, type Point } from "../src/simulation";
import { clonePreset } from "../src/presets";

function reachable(start: Point, points: Point[]) {
  const cells = new Set(points.map((p) => `${p.x},${p.y}`));
  const key = `${start.x},${start.y}`,
    visited = new Set([key]),
    queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) {
        const q = { x: p.x + x, y: p.y + y },
          next = `${q.x},${q.y}`;
        if (cells.has(next) && !visited.has(next)) {
          visited.add(next);
          queue.push(q);
        }
      }
  }
  return visited;
}

test("physical authored heads remain joined through actual rasterized core material", () => {
  for (let seed = 1; seed <= 4; seed++) {
    const sim = createSimulation(
      clonePreset("canine-cub"),
      `life-v7-genome-0${seed}`,
    );
    for (const age of [
      5, 10, 15, 20, 25, 30, 37.5, 45, 52.5, 60, 67.5, 75, 82.5, 90, 105, 120,
    ]) {
      const f = sim.frameAt(age),
        head = f.parts.find((p) => p.id === "head")!,
        body = f.parts.find((p) => p.id === "body")!;
      const core = f.parts
        .filter((p) => ["body", "head"].includes(p.kind))
        .flatMap((p) => p.pixels);
      assert.ok(head.pixels.length && body.pixels.length);
      const connected = reachable(head.pixels[0], core);
      assert.ok(
        body.pixels.some((p) => connected.has(`${p.x},${p.y}`)),
        `seed${seed}/day${age}: head is a separate painted component`,
      );
      for (const domain of f.parts.filter(
        (p) =>
          p.kind === "body" &&
          p.sourcePartIds?.includes("body") &&
          p.role !== "enclosure" &&
          p.pixels.length,
      ))
        assert.ok(
          domain.pixels.some((p) => connected.has(`${p.x},${p.y}`)),
          `seed${seed}/day${age}: material domain ${domain.id} is disconnected`,
        );
    }
  }
});

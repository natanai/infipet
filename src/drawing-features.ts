import type { PetPart } from "./simulation/model";

export const DRAWING_FEATURE_HINTS_VERSION =
  "drawing-feature-hints-v1" as const;

/** Only the selected drawing's visible ink enters the simulation. No later form is read. */
export function drawingFromMonochromeRows(rows: readonly string[]): PetPart[] {
  const height = rows.length,
    width = Math.max(0, ...rows.map((row) => row.length));
  if (
    !height ||
    !width ||
    width > 32 ||
    height > 32 ||
    rows.some((row) => row.length !== width || /[^.#]/.test(row))
  )
    throw new Error(
      "Drawings must be rectangular monochrome ink within the shared 32-cell canvas.",
    );
  const ink = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && rows[y][x] === "#";
  const pixels = rows.flatMap((row, y) =>
    [...row].flatMap((c, x) => (c === "#" ? [{ x, y, color: "#FFFFFF" }] : [])),
  );
  if (!pixels.length) throw new Error("A drawing needs visible ink.");
  const inkTop = Math.min(...pixels.map((p) => p.y));
  const inkHeight = Math.max(...pixels.map((p) => p.y)) - inkTop + 1;
  const offset = {
    x: Math.floor((32 - width) / 2),
    y: Math.floor((32 - height) / 2),
  };
  const parts: PetPart[] = [
    {
      id: "body",
      kind: "body",
      name: "Body",
      parentId: null,
      position: offset,
      pixels,
      layer: 0,
    },
  ];
  // Optional brush hints inferred solely from small enclosed holes in this drawing.
  const visited = new Set<string>();
  const holes: { x: number; y: number }[][] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (ink(x, y) || visited.has(`${x},${y}`)) continue;
      const queue = [{ x, y }],
        component: { x: number; y: number }[] = [];
      visited.add(`${x},${y}`);
      let exterior = false;
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        component.push(p);
        if (!p.x || !p.y || p.x === width - 1 || p.y === height - 1)
          exterior = true;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const xx = p.x + dx,
            yy = p.y + dy,
            key = `${xx},${yy}`;
          if (
            xx >= 0 &&
            yy >= 0 &&
            xx < width &&
            yy < height &&
            !ink(xx, yy) &&
            !visited.has(key)
          ) {
            visited.add(key);
            queue.push({ x: xx, y: yy });
          }
        }
      }
      if (!exterior && component.length <= 6) holes.push(component);
    }
  holes.sort(
    (a, b) =>
      Math.min(...a.map((p) => p.y)) - Math.min(...b.map((p) => p.y)) ||
      a[0].x - b[0].x,
  );
  // Bright islands inside an enclosed dark cavity are the same visible feature
  // arrangement with reversed pigment. Only actually drawn cells become hints.
  const inkVisited = new Set<string>();
  const islands: { x: number; y: number }[][] = [];
  for (const start of pixels) {
    if (inkVisited.has(`${start.x},${start.y}`)) continue;
    const component = [{ x: start.x, y: start.y }];
    inkVisited.add(`${start.x},${start.y}`);
    for (let i = 0; i < component.length; i++) {
      const p = component[i];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = p.x + dx,
            y = p.y + dy,
            key = `${x},${y}`;
          if (ink(x, y) && !inkVisited.has(key)) {
            inkVisited.add(key);
            component.push({ x, y });
          }
        }
    }
    islands.push(component);
  }
  const outer = [...islands].sort((a, b) => b.length - a.length)[0];
  const cavityAt = (start: { x: number; y: number }) => {
    const reached = new Set<string>(),
      queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i],
        key = `${p.x},${p.y}`;
      if (reached.has(key) || ink(p.x, p.y)) continue;
      if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) return false;
      reached.add(key);
      queue.push(
        { x: p.x - 1, y: p.y },
        { x: p.x + 1, y: p.y },
        { x: p.x, y: p.y - 1 },
        { x: p.x, y: p.y + 1 },
      );
    }
    return true;
  };
  const bright = islands
    .filter((component) => {
      if (component === outer || component.length > 6) return false;
      const p = component[0];
      return (
        cavityAt({ x: p.x - 1, y: p.y }) &&
        cavityAt({ x: p.x + 1, y: p.y }) &&
        cavityAt({ x: p.x, y: p.y - 1 }) &&
        cavityAt({ x: p.x, y: p.y + 1 })
      );
    })
    .sort((a, b) => a[0].y - b[0].y || a[0].x - b[0].x);
  const candidates = bright.length >= 2 ? bright : holes;
  const color = candidates === bright ? "#FFFFFF" : "#000000";
  const upper = candidates
    .filter(
      (hole) =>
        hole.reduce((n, p) => n + p.y, 0) / hole.length <
        inkTop + inkHeight * 0.67,
    )
    .slice(0, 2);
  upper.forEach((hole, i) =>
    parts.push({
      id: `eye-${i + 1}`,
      name: "Eye",
      kind: "eye",
      parentId: "body",
      position: { ...offset },
      pixels: hole.map((p) => ({ ...p, color })),
      layer: i + 1,
    }),
  );
  const mouth = candidates.find(
    (hole) => !upper.includes(hole) && hole[0].y >= inkTop + inkHeight * 0.4,
  );
  if (mouth)
    parts.push({
      id: "mouth",
      name: "Mouth",
      kind: "mouth",
      parentId: "body",
      position: { ...offset },
      pixels: mouth.map((p) => ({ ...p, color })),
      layer: 3,
    });
  if (color === "#FFFFFF") {
    const hinted = new Set(
      [...upper, ...(mouth ? [mouth] : [])].flatMap((island) =>
        island.map((p) => `${p.x},${p.y}`),
      ),
    );
    parts[0].pixels = pixels.filter((p) => !hinted.has(`${p.x},${p.y}`));
  }
  return parts;
}

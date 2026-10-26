/** Copy only observed starting ink into the player-facing drawing library. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

type Character = {
  id: string;
  deviceId: string;
  name: string;
  stage: string;
  root: boolean;
  target: { width: number; height: number; rows: string[] } | null;
  referenceStatus?: string;
  targetStatus?: string;
  sprite: {
    sourceUrl?: string;
    available?: boolean;
    verification?: string;
    referenceStatus?: string;
  };
};
const raw = readFileSync("data/retro-reference/catalog.json", "utf8");
const catalog = JSON.parse(raw) as { version: string; characters: Character[] };
const drawings = catalog.characters
  .filter((c) => c.target && c.sprite.available)
  .map((c) => {
    const target = c.target!;
    if (
      !target.width ||
      !target.height ||
      target.width > 32 ||
      target.height > 32 ||
      target.rows.length !== target.height ||
      target.rows.some(
        (row) => row.length !== target.width || /[^.#]/.test(row),
      )
    )
      throw new Error(`Invalid starting ink for ${c.id}`);
    return {
      referenceId: c.id,
      deviceId: c.deviceId,
      name: c.name,
      stage: c.stage,
      root: c.root,
      width: target.width,
      height: target.height,
      rows: target.rows,
      sourceUrl: c.sprite.sourceUrl ?? "",
      referenceStatus:
        c.targetStatus ??
        c.referenceStatus ??
        c.sprite.referenceStatus ??
        "unverified",
    };
  });
const value = {
  version: "retro-ink-v2",
  referenceCatalogVersion: catalog.version,
  referenceCatalogHash: createHash("sha256").update(raw).digest("hex"),
  drawings,
  roster: catalog.characters.map((c) => ({
    referenceId: c.id,
    deviceId: c.deviceId,
    name: c.name,
    stage: c.stage,
    root: c.root,
    available: drawings.some((d) => d.referenceId === c.id),
    referenceStatus:
      c.targetStatus ??
      c.referenceStatus ??
      c.sprite.referenceStatus ??
      "unverified",
  })),
};
writeFileSync(
  "src/retro/preset-data.json",
  JSON.stringify(value, null, 2) + "\n",
);
console.log(
  `Published ${drawings.length}/${catalog.characters.length} observed starting drawings; no growth paths or future poses enter the source API.`,
);

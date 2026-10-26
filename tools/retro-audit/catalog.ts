import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateBitmap } from "./metrics";
import type {
  RetroCase,
  RetroCatalog,
  RetroSource,
  ReferenceStatus,
} from "./types";
import type { GameStage } from "../../src/gameplay";
import { RETRO_AUDIT_SCHEDULE } from "./schedule";
import { listNativeP1HistoryRoutes } from "../../src/gameplay/native-p1";

export function catalogPaths(catalog: RetroCatalog) {
  const characters = new Map(
    catalog.characters.map((character) => [character.id, character]),
  );
  const ordinary = enumeratePaths(catalog)
    .filter((ids) => characters.get(ids[0])?.deviceId !== "p1")
    .map((ids) => ({
      id:
        characters.get(ids[0])!.deviceId +
        "__" +
        ids.map((value) => value.split(".").at(-1)).join("--"),
      deviceId: characters.get(ids[0])!.deviceId,
      characterIds: ids,
      rootCharacterId: ids[0],
      nativeHistory: undefined as RetroCase["nativeHistory"],
    }));
  if (catalog.devices.some((device) => device.id === "p1")) {
    for (const route of listNativeP1HistoryRoutes()) {
      if (route.characters.some((id) => !characters.has(id)))
        throw new Error(
          "Native P1 history route references an unavailable character.",
        );
      ordinary.push({
        id: `p1__${route.id}`,
        deviceId: "p1",
        characterIds: [...route.characters],
        rootCharacterId: route.characters[0],
        nativeHistory: {
          editionId: "p1-world-5c864cb1",
          routeId: route.id,
          teenHistoryKind: route.teenHistoryKind,
          adultHistoryKind: route.adultHistoryKind,
          commandHistoryStatus: "unverified-controller-mapping",
        },
      });
    }
  }
  const deviceOrder=new Map(catalog.devices.map((device,index)=>[device.id,index]));
  return ordinary.sort((a,b)=>(deviceOrder.get(a.deviceId)??0)-(deviceOrder.get(b.deviceId)??0));
}

export const STAGE_HOURS: Record<GameStage, number> = {
  egg: 0,
  hatchling: 0,
  infant: 1,
  juvenile: 49,
  adult: 121,
  advanced: 193,
};
export function loadCatalog(
  file = path.resolve("data/retro-reference/catalog.json"),
): RetroCatalog {
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as RetroCatalog;
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.devices) ||
    !Array.isArray(value.characters) ||
    !Array.isArray(value.edges)
  )
    throw new Error("Unsupported retro reference catalog.");
  const characters = new Map(
    value.characters.map((character) => [character.id, character]),
  );
  if (characters.size !== value.characters.length)
    throw new Error("Duplicate reference character IDs.");
  for (const character of value.characters) {
    if (
      !character.id ||
      !character.deviceId ||
      !character.name ||
      (character.gameStage &&
        !Object.keys(STAGE_HOURS).includes(character.gameStage))
    )
      throw new Error("Invalid reference character.");
    if (character.target) validateBitmap(character.target);
  }
  const edges = new Set<string>();
  for (const edge of value.edges) {
    if (
      !characters.has(edge.from) ||
      !characters.has(edge.to) ||
      characters.get(edge.from)!.deviceId !== edge.deviceId ||
      characters.get(edge.to)!.deviceId !== edge.deviceId
    )
      throw new Error(
        "Reference edge has an unknown or cross-device endpoint.",
      );
    const key = edge.from + "|" + edge.to;
    if (edges.has(key)) throw new Error("Duplicate reference edge.");
    edges.add(key);
  }
  for (const device of value.devices)
    if (
      !characters.has(device.rootCharacterId) ||
      characters.get(device.rootCharacterId)!.deviceId !== device.id
    )
      throw new Error("Reference device has no valid root.");
  return value;
}
export async function loadRetroSources(): Promise<Map<string, RetroSource>> {
  const location = pathToFileURL(path.resolve("src/retro/index.ts")).href;
  const module = (await import(location)) as {
    RETRO_PRESETS: readonly {
      id: string;
      referenceId: string;
      root: boolean;
      parts: RetroSource["parts"];
      mode: RetroSource["mode"];
    }[];
  };
  if (!Array.isArray(module.RETRO_PRESETS))
    throw new Error(
      "src/retro must expose ordinary editable starting drawings.",
    );
  return new Map(
    module.RETRO_PRESETS.filter((preset) => preset.root).map((preset) => [
      preset.referenceId,
      {
        id: preset.id,
        parts: structuredClone(preset.parts),
        mode: preset.mode,
      },
    ]),
  );
}
export function enumeratePaths(
  catalog: RetroCatalog,
  maximum = 2048,
): string[][] {
  const children = new Map<string, string[]>();
  for (const edge of catalog.edges)
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
  const result: string[][] = [];
  const visit = (id: string, prefix: string[]) => {
    if (prefix.includes(id))
      throw new Error("Reference lifecycle contains a cycle.");
    const next = [...prefix, id],
      outgoing = children.get(id) ?? [];
    if (!outgoing.length) {
      result.push(next);
      if (result.length > maximum)
        throw new Error("Reference path budget exceeded.");
      return;
    }
    for (const child of outgoing) visit(child, next);
  };
  for (const device of catalog.devices) visit(device.rootCharacterId, []);
  return result;
}
function confidence(
  character: RetroCatalog["characters"][number],
): ReferenceStatus {
  if (!character.target) return "unavailable";
  if (
    [
      character.targetStatus,
      character.sprite?.verification,
      character.sprite?.referenceStatus,
    ].some(
      (value) =>
        typeof value === "string" &&
        /provisional|unverified|uncertain|mixed|unavailable/i.test(value),
    )
  )
    return "provisional";
  if (
    character.sprite?.verification === "provisional" ||
    character.sprite?.verification === "unavailable"
  )
    return "provisional";
  return character.sprite?.verification === "observed"
    ? "observed"
    : "community-extracted-reference";
}
export function casesFromCatalog(
  catalog: RetroCatalog,
  sources: Map<string, RetroSource>,
  options: { skipMissingSources?: boolean } = {},
): RetroCase[] {
  const characters = new Map(
    catalog.characters.map((character) => [character.id, character]),
  );
  return catalogPaths(catalog)
    .filter(
      (entry) =>
        !options.skipMissingSources || sources.has(entry.rootCharacterId),
    )
    .map((entry) => {
      const ids = entry.characterIds;
      const source = sources.get(ids[0]);
      if (!source)
        throw new Error(`No ordinary starting drawing exists for ${ids[0]}.`);
      const deviceId = characters.get(ids[0])!.deviceId;
      const id = entry.id;
      return {
        id,
        deviceId,
        rootCharacterId: ids[0],
        characterIds: ids,
        source: structuredClone(source),
        ...(entry.nativeHistory ? { nativeHistory: entry.nativeHistory } : {}),
        checkpoints: ids.map((characterId, index) => {
          const character = characters.get(characterId)!;
          const stage =
            character.gameStage ??
            (["hatchling", "infant", "juvenile", "adult", "advanced"][
              Math.min(index, 4)
            ] as GameStage);
          const edge = index
            ? catalog.edges.find(
                (edge) =>
                  edge.from === ids[index - 1] && edge.to === characterId,
              )
            : undefined;
          const evidence =
            edge?.eligibilityStatus === "documented-primary-predicate"
              ? ("documented" as const)
              : index
                ? ("provisional" as const)
                : ("documented" as const);
          return {
            id: `${id}/${characterId}`,
            characterId,
            name: character.name,
            atHour:
              STAGE_HOURS[stage] +
              (index ? RETRO_AUDIT_SCHEDULE.nonbirthReferenceOffsetHours : 0),
            expectedStage: stage,
            target: character.target
              ? structuredClone(character.target)
              : undefined,
            referenceStatus: confidence(character),
            referenceTiming: "combined-clock-adaptation" as const,
            careEvidence: evidence,
            animationTime: 0,
            sampleKind: "reference" as const,
            action: "idle" as const,
            ...(deviceId === "dm1"
              ? { expectedBranch: characterId.slice(4) }
              : {}),
          };
        }),
      };
    });
}

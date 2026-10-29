/** Producer-side instrumentation at an individual executed operator boundary.
 * The independent auditor does not call this diff function. It replays these
 * persistent records against the original birth topology and immutable cells.
 * Missing/duplicate records are errors, never inferred from a final graph. */
import type {
  MaterialGraph,
  MaterialEvent,
  MaterialPhysicalJournal,
  MaterialChange,
} from "./material-graph";
const same = (a: unknown, b: unknown) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);
function changes<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
): MaterialChange<T>[] {
  const a = new Map(before.map((v) => [v.id, v])),
    b = new Map(after.map((v) => [v.id, v]));
  return [...new Set([...a.keys(), ...b.keys()])].sort().flatMap((id) => {
    const x = a.get(id) ?? null,
      y = b.get(id) ?? null;
    return same(x, y) ? [] : [{ id, before: x, after: y }];
  });
}
export function journalMaterialEvent(
  before: MaterialGraph,
  after: MaterialGraph,
  event: MaterialEvent,
  system: MaterialPhysicalJournal["system"],
  operation: MaterialPhysicalJournal["operation"],
  /** Explicit producer route is verified independently against birth-state occupancy. */
  routes?:ReadonlyMap<string,readonly Readonly<{x:number;y:number}>[]>,
): MaterialEvent {
  if (!same(before.protectedVoids, after.protectedVoids)&&operation.kind!=="repattern")
    throw new Error("No operator authorizes changing protected voids");
  const a = new Map(before.cells.map((c) => [c.id, c]));
  const relocations = after.cells.flatMap((c) => {
    const old = a.get(c.id);
    if (!old || old === c) return [];
    if (!same({ ...old, x: c.x, y: c.y }, c))
      throw new Error(
        "No operator authorizes mutating surviving-cell identity or material",
      );
    return old.x === c.x && old.y === c.y
      ? []
      : [
          {
            cellId: c.id,
            from: {
              x: old.x,
              y: old.y,
              ...(old.z === undefined ? {} : { z: old.z }),
            },
            to: { x: c.x, y: c.y, ...(c.z === undefined ? {} : { z: c.z }) },
            operationId: operation.id,
            ...(routes?.has(c.id)?{path:routes.get(c.id)!.map(p=>({...p}))}:{}),
          },
        ];
  });
  return {
    ...event,
    physical: {
      version: 1,
      system,
      operation: { ...operation },
      relocations,
      tissues: changes(before.tissues, after.tissues),
      sites: changes(before.sites, after.sites),
      links: changes(before.links, after.links),
      ...(!same(before.protectedVoids,after.protectedVoids)?
        {protectedVoids:{before:before.protectedVoids,after:after.protectedVoids}}:{}),
    },
  };
}

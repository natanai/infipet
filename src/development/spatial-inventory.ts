/** DEV-008 independent physical reconstruction. Starts with original source
 * cells/topology, not the final graph. Each event is atomic: validate before
 * values, create fresh identities, apply explicit surviving-cell moves, remove
 * active identities, then commit topology deltas. Validate mechanical state
 * after every transaction. The producer's journal/diff code is not imported.
 *
 * Domain: integer x/y in [0,63], immutable z/color/ancestry/tissue ownership;
 * unit-lattice translate/remodel/reshape and recorded tissue-local transport
 * paths may relocate existing identities. Never infer a route from the final image.
 * Parent topology is acyclic, tissues 8-connected, new overlaps/void entries
 * forbidden, live attachment endpoints within squared distance 8. Fusion
 * links require an actual continuous material bridge, not distant endpoints.
 * This proves recorded execution and structural admissibility, not a secure
 * signature against deliberate replacement of both source and history.
 */
import type {PartKind} from "../simulation/model";
import type {
  MaterialCell,
  MaterialGraph,
  MaterialStructure,
  MaterialChange,
  MaterialTissue,
  MaterialSite,
  MaterialLink,
} from "./material-graph";
import { dailyCheckTime } from "./daily-contract";
import {createAnatomicalAudit,verifyCoordinatedStrain,verifyAdvancingFront,verifyAxialSupport,verifyStrainProgram,type StrainAuthorization} from "./anatomical-audit";
export type PhysicalOperatorAuthorization = Readonly<{
  structuralRigidity?:number;
  repatterning?:StrainAuthorization;
  material: readonly Readonly<{
    id: string;
    kind: string;
    tissueId: string;
    targetTissueId?: string;
    targetKind?:PartKind;
    direction?: Readonly<{ x: number; y: number }>;
    atHour: number;
    durationHours: number;
  }>[];
  remodeling: readonly Readonly<{
    id: string;
    kind: string;
    tissueId: string;
    targetTissueId?: string;
    targetKind?:PartKind;
    direction?: Readonly<{ x: number; y: number }>;
    sourceSiteId?: string;
    atHour: number;
    durationHours: number;
    units: number;
  }>[];
}>;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const key = (p: { x: number; y: number }) => p.x + "," + p.y;
const bounded = (p: { x: number; y: number }) =>
  Number.isInteger(p.x) &&
  Number.isInteger(p.y) &&
  p.x >= 0 &&
  p.y >= 0 &&
  p.x < 64 &&
  p.y < 64;
function unique<T extends { id: string }>(xs: readonly T[], label: string) {
  const m = new Map(xs.map((x) => [x.id, x]));
  if (m.size !== xs.length) throw new Error("Duplicate " + label);
  return m;
}
function patch<T extends { id: string }>(
  m: Map<string, T>,
  changes: readonly MaterialChange<T>[],
  label: string,
) {
  const ids = new Set<string>();
  for (const c of changes) {
    if (
      ids.has(c.id) ||
      !same(m.get(c.id) ?? null, c.before) ||
      same(c.before, c.after) ||
      (c.after && c.after.id !== c.id)
    )
      throw new Error("Inconsistent before/after " + label);
    ids.add(c.id);
    if (c.after) m.set(c.id, c.after);
    else m.delete(c.id);
  }
}
function connected(cells:readonly MaterialCell[],a?:MaterialCell,b?:MaterialCell):boolean{
  if(!cells.length)return true;
  if(cells.length===1)return !b||a?.id===b.id||cells[0].id===b.id;
  // Independent union-find over integer positions; overlays share a vertex.
  // Unlike the producer reachability helper, this unions left/up diagonals.
  const positions=new Set(cells.map(c=>c.y*64+c.x)),parent=new Int16Array(4096).fill(-1);
  const root=(v:number):number=>{while(parent[v]!==v){parent[v]=parent[parent[v]];v=parent[v];}return v;};
  for(const v of positions)parent[v]=v;
  let count=positions.size;
  for(const v of positions){
    const x=v%64,y=Math.floor(v/64);
    for(const n of [x>0?v-1:-1,y>0?v-64:-1,x>0&&y>0?v-65:-1,x<63&&y>0?v-63:-1]){
      if(n<0||!positions.has(n))continue;const i=root(v),j=root(n);if(i!==j){parent[i]=j;count--;}
    }
  }
  if(b){const origin=a??cells[0],u=origin.y*64+origin.x,v=b.y*64+b.x;
    return positions.has(u)&&positions.has(v)&&root(u)===root(v);}
  return count===1;
}
/** Independent union-find of cardinal contacts. Co-located authored cells
 * occupy one vertex; each left/up edge removes at most one component. */
function cardinalComponents(cells:readonly MaterialCell[]):number{
  if(!cells.length)return 0;
  if(cells.length===1)return 1;
  const occupied=new Set(cells.map(c=>c.y*64+c.x)),parent=new Int16Array(4096).fill(-1);
  let count=occupied.size;
  const root=(v:number):number=>{while(parent[v]!==v){parent[v]=parent[parent[v]];v=parent[v];}return v;};
  for(const v of occupied)parent[v]=v;
  for(const v of occupied)for(const next of [v%64?v-1:-1,v>=64?v-64:-1]){
    if(next<0||!occupied.has(next))continue;const a=root(v),b=root(next);
    if(a!==b){parent[a]=b;count--;}
  }
  return count;
}
function mechanical(
  cells: Map<string, MaterialCell>,
  tissues: Map<string, MaterialTissue>,
  sites: Map<string, MaterialSite>,
  links: Map<string, MaterialLink>,
  voids: Set<string>,
  source: Map<string, MaterialCell>,
  originalVoids:ReadonlySet<string>,
) {
  const occupied = new Map<string, MaterialCell[]>(),
    groups = new Map<string, MaterialCell[]>();
  for (const c of cells.values()) {
    if (!bounded(c) || !tissues.has(c.tissueId))
      throw new Error("Invalid physical cell position or tissue");
    const original = source.get(c.id);
    if (voids.has(key(c)) && (!original || key(original) !== key(c))&&
      !c.sourceIds.every(id=>{const a=source.get(id);return !!a&&originalVoids.has(key(a))&&a.color===c.color;}))
      throw new Error("Protected-void violation");
    const others = occupied.get(key(c))??[];
    for(const other of others)if(c.provenance!=="authored"||other.provenance!=="authored"){
      // Independently inspect original coordinate/pigment/layer pairs. A
      // duplicated descendant of one source cannot authorize an overlay.
      const sharesLayer=(a:MaterialCell,b:MaterialCell)=>a.sourceIds.every(id=>{
        const first=source.get(id);return !!first&&first.color===a.color&&first.z===a.z&&b.sourceIds.some(j=>{
          const second=source.get(j);return id!==j&&!!second&&second.x===first.x&&second.y===first.y&&
            second.color===b.color&&second.z===b.z;
        });
      });
      if(!sharesLayer(c,other)||!sharesLayer(other,c))throw new Error("Physical material overlap");
    }
    occupied.set(key(c),[...others,c]);
    const g = groups.get(c.tissueId) ?? [];
    g.push(c);
    groups.set(c.tissueId, g);
  }
  for (const t of tissues.values()) {
    if (
      !Number.isFinite(t.rigidity) ||
      t.rigidity < 0 ||
      t.rigidity > 1 ||
      !connected(groups.get(t.id) ?? [])
    )
      throw new Error("Disconnected or invalid physical tissue");
    const visited = new Set<string>();
    let current: MaterialTissue | undefined = t;
    while (current) {
      if (visited.has(current.id)) throw new Error("Attachment parent cycle");
      visited.add(current.id);
      if (!current.parentId) break;
      current = tissues.get(current.parentId);
      if (!current) throw new Error("Missing parent tissue");
    }
  }
  for (const s of sites.values()) {
    const c = cells.get(s.rootCellId);
    if (
      !c ||
      c.tissueId !== s.tissueId ||
      ![s.direction.x, s.direction.y].every(Number.isFinite)
    )
      throw new Error("Invalid physical growth site");
  }
  for (const l of links.values()) {
    const a = l.fromCellId ? cells.get(l.fromCellId) : undefined,
      b = l.toCellId ? cells.get(l.toCellId) : undefined;
    if (
      !a ||
      !b ||
      a.tissueId !== l.fromTissueId ||
      b.tissueId !== l.toTissueId
    )
      throw new Error("Invalid attachment endpoints");
    if (l.kind === "attachment") {
      if (
        (a.x - b.x) ** 2 + (a.y - b.y) ** 2 > 8 ||
        tissues.get(a.tissueId)?.parentId !== b.tissueId
      )
        throw new Error("Physically impossible attachment");
    } else if (
      l.kind !== "fusion" ||
      !connected(
        [...(groups.get(a.tissueId) ?? []), ...(groups.get(b.tissueId) ?? [])],
        a,
        b,
      )
    )
      throw new Error("Fusion lacks physical bridge");
  }
  for (const t of tissues.values())
    if (
      t.parentId &&
      !Array.from(links.values()).some(
        (l) =>
          l.kind === "attachment" &&
          l.fromTissueId === t.id &&
          l.toTissueId === t.parentId,
      )
    )
      throw new Error("Parent tissue lacks attachment evidence");
}
type Reconstructed=Readonly<{
 cells:Map<string,MaterialCell>;tissues:Map<string,MaterialTissue>;
 sites:Map<string,MaterialSite>;links:Map<string,MaterialLink>;lastCheck:number;
}>;
type VerifiedPrefix=Reconstructed&Readonly<{
 original:object|undefined;hatch:number;authorization:string;
 ever:ReadonlySet<string>;events:ReadonlySet<string>;
 voids:ReadonlySet<string>;
}>;
// Only independently reconstructed, deeply frozen journals qualify. Private
// maps never escape this module. Continuing a proven prefix verifies EVERY
// new transaction with exactly the same mechanical and ancestry algorithm;
// JSON restoration, changed histories and mutable graphs use full replay.
const verifiedPrefixes=new WeakMap<MaterialGraph,VerifiedPrefix>();
// A frozen serializable data object's bindings and all already-proven frozen
// descendants cannot change. Prove each new object fully once; every new
// physical transaction is still reconstructed below. Mutable JSON restores
// and shallow-frozen containers never receive this credential.
const immutableDataProofs=new WeakSet<object>();
function immutable(value:unknown,seen=new Set<object>()):boolean{
 if(!value||typeof value!=="object"||seen.has(value))return true;
 if(immutableDataProofs.has(value))return true;
 if(!Object.isFrozen(value))return false;
 seen.add(value);const complete=Object.values(value).every(v=>immutable(v,seen));
 if(complete)immutableDataProofs.add(value);
 return complete;
}
/**
 * Independent pre-event anatomical carrier oracle. No producer proposal,
 * rendered pose, or declared relocation destination is consulted.
 *
 * For a root median slip or opposite-third bend, each dependent tissue is
 * translated by the exact displacement of its parent attachment CELL. For
 * a joint turn, all descendants use the same quarter-turn about the current
 * child-side attachment coordinate. Returns every identity that MUST move.
 */
function expectedAttachedDeformation(
 kind:string,tissueId:string,axis:Readonly<{x:number;y:number}>|undefined,
 before:ReadonlyMap<string,MaterialCell>,links:ReadonlyMap<string,MaterialLink>,
):Map<string,Readonly<{x:number;y:number}>>{
 const compass=!!axis&&[[1,0],[-1,0],[0,1],[0,-1]]
  .some(([x,y])=>axis.x===x&&axis.y===y);
 const rotation=kind==="articulate";
 if(rotation?!axis||(axis.x!==1&&axis.x!==-1)||axis.y!==0:!compass)
  throw new Error("Missing physical attachment deformation direction");
 const edges=[...links.values()].filter(l=>l.kind==="attachment");
 const joints=edges.filter(l=>l.fromTissueId===tissueId&&l.fromCellId)
  .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 const pivot=rotation?before.get(joints[0]?.fromCellId??""):undefined;
 if(rotation&&!pivot)throw new Error("Missing original anatomical rotation joint");
 const root=[...before.values()].filter(c=>c.tissueId===tissueId);
 if(root.length<(rotation?2:4))throw new Error("Insufficient original material for deformation");
 const cross=axis?.y===0?"y":"x";
 const tiers=[...new Set(root.map(c=>c[cross]))].sort((a,b)=>a-b);
 const cut=tiers[Math.floor((tiers.length-1)/2)];
 const low=tiers[Math.floor((tiers.length-1)/3)];
 const high=tiers[Math.ceil(2*(tiers.length-1)/3)];
 if((kind==="slip"&&tiers.length<2)||
   (kind==="bend"&&(tiers.length<3||low>=high)))
  throw new Error("Invalid region organizer at this material age");
 const expected=new Map<string,Readonly<{x:number;y:number}>>();
 const locate=(c:MaterialCell,p:Readonly<{x:number;y:number}>)=>{
  if(p.x!==c.x||p.y!==c.y)expected.set(c.id,p);
 };
 for(const c of root){
  if(rotation){
   locate(c,{x:pivot!.x-axis!.x*(c.y-pivot!.y),
     y:pivot!.y+axis!.x*(c.x-pivot!.x)});
  }else if(kind==="slip"){
   const upper=axis!.y===0?axis!.x>0:axis!.y>0;
   if(upper?c[cross]<=cut:c[cross]>cut)
    locate(c,{x:c.x+axis!.x,y:c.y+axis!.y});
  }else if(kind==="bend"){
   const sign=c[cross]<=low?1:c[cross]>=high?-1:0;
   if(sign)locate(c,{x:c.x+sign*axis!.x,y:c.y+sign*axis!.y});
  }
 }
 const visited=new Set<string>([tissueId]),queue=[tissueId];
 for(let i=0;i<queue.length;i++){
  const parent=queue[i];
  const children=edges.filter(l=>l.toTissueId===parent)
   .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  for(const link of children){
   if(visited.has(link.fromTissueId)||!link.toCellId||!link.fromCellId)
    throw new Error("Unsupported or cyclic anatomical child relation");
   const contact=before.get(link.toCellId),childContact=before.get(link.fromCellId);
   if(!contact||contact.tissueId!==parent||!childContact||
      childContact.tissueId!==link.fromTissueId)
    throw new Error("Forged anatomical attachment endpoint");
   visited.add(link.fromTissueId);queue.push(link.fromTissueId);
   const current=expected.get(contact.id)??contact;
   const dx=current.x-contact.x,dy=current.y-contact.y;
   for(const c of before.values())if(c.tissueId===link.fromTissueId){
    if(rotation){
     locate(c,{x:pivot!.x-axis!.x*(c.y-pivot!.y),
       y:pivot!.y+axis!.x*(c.x-pivot!.x)});
    }else locate(c,{x:c.x+dx,y:c.y+dy});
   }
  }
 }
 return expected;
}
export function reconstructDailyPhysicalState(
  graph: MaterialGraph,
  hatchAtMs: number,
  throughCheck: number,
  original?: MaterialGraph,
  authorization?: PhysicalOperatorAuthorization,
  previousGraph?:MaterialGraph,
) {
  dailyCheckTime(hatchAtMs, throughCheck);
  const birth: MaterialStructure | undefined = original
    ? {
        tissues: original.tissues,
        sites: original.sites,
        links: original.links,
        protectedVoids: original.protectedVoids,
      }
    : graph.birth;
  if (
    !birth ||
    !graph.birth ||
    !same(graph.birth, birth) ||
    (original &&
      (!same(original.sourceCells, graph.sourceCells) ||
        original.sourceFingerprint !== graph.sourceFingerprint))
  )
    throw new Error("Missing or changed original physical topology");
  const authorizationKey=authorization?JSON.stringify(authorization):"";
  const candidate=previousGraph?verifiedPrefixes.get(previousGraph):undefined;
  const prefix=candidate&&candidate.original===(original??graph.birth)&&
    candidate.hatch===hatchAtMs&&candidate.authorization===authorizationKey&&
    candidate.lastCheck<=throughCheck&&previousGraph!.sourceCells===graph.sourceCells&&
    previousGraph!.birth===graph.birth&&previousGraph!.events.length<=graph.events.length&&
    previousGraph!.events.every((e,i)=>e===graph.events[i])?candidate:undefined;
  const source = unique(graph.sourceCells, "source identity"),
    active = new Map(prefix?.cells??source),
    ever = new Set(prefix?.ever??source.keys());
  const tissues = prefix?new Map(prefix.tissues):unique(birth.tissues, "birth tissue"),
    sites = prefix?new Map(prefix.sites):unique(birth.sites, "birth site"),
    links = prefix?new Map(prefix.links):unique(birth.links, "birth attachment"),
    voids = new Set(prefix?.voids??birth.protectedVoids);
  const events = new Set<string>(prefix?.events);
  let previous = prefix?.lastCheck??0;
  const birthVoids=new Set(birth.protectedVoids),continuousAnatomy=createAnatomicalAudit(graph.sourceCells);
  mechanical(active, tissues, sites, links, voids, source,birthVoids);
  continuousAnatomy([...active.values()],{links:[...links.values()],protectedVoids:[...voids]});
  for (const e of graph.events.slice(prefix?previousGraph!.events.length:0)) {
    const k = e.checkIndex,
      p = e.physical;
    if (
      k === undefined ||
      !Number.isInteger(k) ||
      k < 1 ||
      k > throughCheck ||
      k > 365 ||
      k < previous ||
      e.atHour !== 24 * k ||
      e.atMs !== dailyCheckTime(hatchAtMs, k)
    )
      throw new Error("Material transaction outside daily opportunity");
    if (events.has(e.id)) throw new Error("Duplicate material transaction");
    events.add(e.id);
    previous = k;
    if (
      !p ||
      p.version !== 1 ||
      p.operation.kind !== e.kind ||
      !p.operation.id ||
      (!tissues.has(p.operation.tissueId) && p.system !== "iterative") ||
      (p.system === "iterative"
        ? p.operation.id !== e.id
        : p.system === "material"
          ? !e.id.startsWith(
              "operator/" + encodeURIComponent(p.operation.id) + "/unit/",
            )
          : !e.id.startsWith(p.operation.id + "/unit/"))
    )
      throw new Error("Missing or forged physical operation evidence");
    if (!["material", "iterative", "remodeling"].includes(p.system))
      throw new Error("Unknown physical operator system");
    if (authorization && p.system !== "iterative") {
      const candidates =
        p.system === "material"
          ? authorization.material
          : authorization.remodeling;
      const op = candidates.find((op) => op.id === p.operation.id);
      if (
        !op ||
        op.kind !== p.operation.kind ||
        op.tissueId !== p.operation.tissueId ||
        op.targetTissueId !== p.operation.targetTissueId ||
        op.targetKind !== p.operation.targetKind ||
        !same(op.direction, p.operation.direction)
      )
        throw new Error(
          "Physical operation differs from permanent authorization",
        );
      if (p.system === "remodeling") {
        const unit = Number(e.id.slice(e.id.lastIndexOf("/unit/") + 6)),
          scheduled = op as PhysicalOperatorAuthorization["remodeling"][number];
        if (
          !Number.isInteger(unit) ||
          unit < 1 ||
          unit > scheduled.units ||
          k !==
            Math.ceil(
              op.atHour + (op.durationHours * unit) / scheduled.units,
            ) ||
          scheduled.sourceSiteId !== p.operation.sourceSiteId
        )
          throw new Error("Forged chronological remodeling opportunity");
      } else if (k <= op.atHour || k > Math.ceil(op.atHour + op.durationHours))
        throw new Error("Material transaction outside permanent support");
    }
    if (
      p.system === "iterative" &&
      !e.id.startsWith("iterative-composed/" + k + "/")
    )
      throw new Error("Forged iterative opportunity");
    const beforeCells = new Map(active),
      beforeTissues = new Map(tissues);
    // A legacy articulation with no directional gene is ONLY a hinge
    // landmark; it does not move cells or trigger the physical turn oracle.
    const coupled=(e.kind==="slip"||e.kind==="bend"||
      e.kind==="articulate"&&!!p.operation.direction)?
      expectedAttachedDeformation(e.kind,p.operation.tissueId,
        p.operation.direction,beforeCells,links):null;
    const made = e.createdCells ?? [];
    if(["elongate","extend","branch","bud"].includes(e.kind))
      verifyAxialSupport([...beforeCells.values()],[...links.values()],made,authorization?.structuralRigidity??1);
    // Independently evaluate the declared lattice strain on EVERY prior cell
    // and empty protected site. The producer's mapper/proposer is not used.
    const strain=p.strain;
    if(e.kind==="repattern"&&!strain)throw new Error("Missing coordinated developmental strain");
    const advancingFront=p.system==="iterative"&&e.kind==="expand"&&p.relocations.length>0;
    if(advancingFront)verifyAdvancingFront(graph.sourceCells,beforeCells,made,e.removedCellIds,p);
    let strainedVoids:readonly string[]|undefined;
    if(strain)strainedVoids=verifyCoordinatedStrain(beforeCells,made,e.removedCellIds,p,e.kind,voids);
    if(strain&&authorization?.repatterning)verifyStrainProgram(graph.sourceCells,graph.sourceFingerprint,beforeCells,p.operation.id,
      Number(e.id.slice(e.id.lastIndexOf("/unit/")+6)),strain,authorization.repatterning);
    if (
      !same(
        made.map((c) => c.id),
        e.createdCellIds,
      )
    )
      throw new Error("Missing physical creation ownership");
    for (const c of made) {
      if (
        ever.has(c.id) ||
        c.provenance !== "generated" ||
        (c.operationId !== e.id && c.operationId !== p.operation.id) ||
        !c.parentCellIds.length ||
        c.parentCellIds.some((id) => !active.has(id)) ||
        !c.sourceIds.length ||
        c.sourceIds.some((id) => !source.has(id))
      )
        throw new Error(
          "Reused identity or invalid physical parent/source ancestry",
        );
      if (
        !c.parentCellIds.some((id) => {
          const a = active.get(id)!;
          return Math.max(Math.abs(c.x - a.x), Math.abs(c.y - a.y)) <= 1;
        })
      )
        throw new Error("Creation lacks physical parent contact");
      const inherited = [
        ...new Set(c.parentCellIds.flatMap((id) => active.get(id)!.sourceIds)),
      ].sort();
      if (!same([...c.sourceIds].sort(), inherited))
        throw new Error("Creation changed material ancestry");
      active.set(c.id, c);
      ever.add(c.id);
    }
    const moves = new Set<string>(),
      movingIds = new Set(p.relocations.map((m) => m.cellId));
    const moveDestinations=new Set<string>();
    let step: { x: number; y: number } | undefined;
    if (movingIds.size !== p.relocations.length)
      throw new Error("Duplicate relocation identity");
    for (const m of p.relocations) {
      const c = beforeCells.get(m.cellId);
      if (
        !c ||
        moves.has(m.cellId) ||
        m.operationId !== p.operation.id ||
        m.checkIndex !== k ||
        m.atMs !== e.atMs ||
        !same(m.from, {
          x: c.x,
          y: c.y,
          ...(c.z === undefined ? {} : { z: c.z }),
        }) ||
        !bounded(m.to) ||
        m.to.z !== c.z ||
        (c.tissueId !== p.operation.tissueId && e.kind!=="repattern" && !coupled)
      )
        throw new Error("Inconsistent or forged relocation evidence");
      if (
        (!strain&&voids.has(key(m.to))) ||
        [...beforeCells.values()].some(
          (other) => !movingIds.has(other.id) && key(other) === key(m.to),
        )
      )
        throw new Error(
          "Relocation enters occupied material or protected void",
        );
      const d = { x: m.to.x - c.x, y: m.to.y - c.y };
      if(strain){
        if(Math.max(Math.abs(d.x),Math.abs(d.y))!==1)throw new Error("Strain exceeds one physical lattice step");
      }else if(e.kind==="repattern"){
        // Independently reconstruct a simultaneous, bounded tissue-local
        // transport. This does not import the producer's field or path finder.
        const path=m.path,group=[...beforeCells.values()].filter(a=>a.tissueId===c.tissueId);
        const own=new Set(group.map(key));
        if(p.system!=="remodeling"||made.length||
          p.relocations.length+e.removedCellIds.length>64||!path||path.length<2||path.length>65||
          !same(path[0],m.from)||!same(path.at(-1),m.to)||own.has(key(m.to))||moveDestinations.has(key(m.to)))
          throw new Error("Forged developmental transport: "+JSON.stringify({
            cell:m.cellId,system:p.system,made:made.length,
            budget:p.relocations.length+e.removedCellIds.length,pathLength:path?.length,
            from:!!path&&same(path[0],m.from),to:!!path&&same(path.at(-1),m.to),
            targetOccupied:own.has(key(m.to))}));
        for(let i=1;i<path.length;i++){
          const a=path[i-1],b=path[i];
          if(!bounded(b)||b.z!==c.z||Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))!==1||
            (i<path.length-1&&!own.has(key(b))))throw new Error("Broken developmental transport route");
        }
        const supported=group.filter(a=>Math.max(Math.abs(a.x-m.to.x),Math.abs(a.y-m.to.y))===1);
        if(!supported.length||group.length>=3&&(supported.length<2||
          !supported.some(a=>Math.abs(a.x-m.to.x)+Math.abs(a.y-m.to.y)===1)))
          throw new Error("Unsupported developmental transport endpoint");
        const linked=new Set([...links.values()].flatMap(l=>l.fromTissueId===c.tissueId?[l.toTissueId]:l.toTissueId===c.tissueId?[l.fromTissueId]:[]));
        if([...beforeCells.values()].some(other=>other.tissueId!==c.tissueId&&!linked.has(other.tissueId)&&
          Math.max(Math.abs(other.x-m.to.x),Math.abs(other.y-m.to.y))<=1))
          throw new Error("Developmental transport creates unlinked contact");
        moveDestinations.add(key(m.to));
      }else if(e.kind==="intercalate"){
        // This is not a one-cell leap. Every source-owned material identity
        // must move exactly one neighboring site; the complete vacancy
        // chain is independently reconstructed AFTER the event loop.
        if(p.system!=="remodeling"||made.length||e.removedCellIds.length||
          Math.max(Math.abs(d.x),Math.abs(d.y))!==1||m.path)
          throw new Error("Forged dense material intercalation step");
      }else if(e.kind==="redistribute"){
        // An entire tissue can change its mass distribution without adding a
        // child at the donor coordinate. Independently inspect every recorded
        // passage through the PRE-transaction tissue, not the final geometry.
        const path=m.path;
        const axis=p.operation.direction;
        const donor=beforeCells.get(m.cellId)!;
        const group=[...beforeCells.values()].filter(c=>c.tissueId===donor.tissueId);
        const positions=new Set(group.map(key));
        if(p.system!=="remodeling"||!axis||
          ![[1,0],[-1,0],[0,1],[0,-1]].some(([x,y])=>axis.x===x&&axis.y===y)||
          p.relocations.length!==1||made.length||e.removedCellIds.length||
          !path||path.length<3||path.length>25||
          !same(path[0],m.from)||!same(path.at(-1),m.to)||
          (m.to.x-m.from.x)*axis.x+(m.to.y-m.from.y)*axis.y<2||
          positions.has(key(m.to))||
          positions.has((donor.x+axis.y)+","+(donor.y-axis.x))||
          [...sites.values()].some(s=>s.rootCellId===donor.id)||
          [...links.values()].some(l=>l.fromCellId===donor.id||l.toCellId===donor.id))
          throw new Error("Forged or unsupported tissue reflow");
        for(let i=1;i<path.length;i++){
          const a=path[i-1],b=path[i];
          if(!bounded(b)||Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))!==1||
            (i<path.length-1&&!positions.has(key(b))))
            throw new Error("Broken physical migration route");
        }
        const support=[...beforeCells.values()].filter(c=>
          c.tissueId===donor.tissueId&&
          Math.max(Math.abs(c.x-m.to.x),Math.abs(c.y-m.to.y))===1);
        if(support.length<2||!support.some(c=>Math.abs(c.x-m.to.x)+Math.abs(c.y-m.to.y)===1))
          throw new Error("Tissue reflow deposited into unsupported tip");
      }else if(coupled){
        const expected=coupled.get(c.id);
        if(!expected||p.system!=="remodeling"||made.length||
          e.removedCellIds.length||!same(
            {x:m.to.x,y:m.to.y},expected))
          throw new Error("Forged or partial attachment-coupled deformation");
      } else if (
        (!advancingFront&&!["translate", "reposition", "remodel", "reshape", "slip", "bend"].includes(e.kind)) ||
        (p.system === "iterative"&&!advancingFront) ||
        !Math.max(Math.abs(d.x), Math.abs(d.y)) ||
        Math.max(Math.abs(d.x), Math.abs(d.y)) > 1
      )
        throw new Error("Physically impossible relocation");
      if (e.kind === "translate" || e.kind === "reposition" || e.kind === "reshape" || e.kind === "slip") {
        const axis = p.operation.direction ??
          [...sites.values()].find(
            (s) =>
              s.tissueId === p.operation.tissueId &&
              (!p.operation.sourceSiteId || s.id === p.operation.sourceSiteId),
          )?.direction ?? { x: 0, y: -1 };
        const norm = Math.hypot(axis.x, axis.y),
          expected = {
            x: Math.round(axis.x / norm) || 0,
            y: Math.round(axis.y / norm) || 0,
          };
        if (!same(d, expected)) throw new Error("Forged relocation direction");
      }
      if (!["repattern","articulate","bend","slip","intercalate"].includes(e.kind) && step && !same(step, d))
        throw new Error("Nonrigid tissue translation");
      step = d;
      moves.add(c.id);
      active.set(c.id, { ...c, x: m.to.x, y: m.to.y });
    }
    if (
      e.kind === "translate" &&
      (moves.size !==
        [...beforeCells.values()].filter(
          (c) => c.tissueId === p.operation.tissueId,
        ).length ||
        !moves.size)
    )
      throw new Error("Incomplete tissue translation");
    if(e.kind==="intercalate"){
      // Independent decomposition of every declared move into up to EIGHT
      // nonbranching, vertex-disjoint directed vacancy chains. Reconstruct
      // from PRE-EVENT original IDs and coordinates only; no producer BFS,
      // preferred route, intended silhouette or final event visual.
      const axis=p.operation.direction;
      const original=[...beforeCells.values()];
      const own=original.filter(c=>c.tissueId===p.operation.tissueId);
      const origins=new Map<string,string>();
      const destinations=new Map<string,string>();
      const movements=new Map(p.relocations.map(m=>[m.cellId,m]));
      const anchored=new Set([...sites.values()].map(s=>s.rootCellId));
      for(const link of links.values()){
        if(link.fromCellId)anchored.add(link.fromCellId);
        if(link.toCellId)anchored.add(link.toCellId);
      }
      const occupancy=new Map<string,number>();
      for(const cell of original)occupancy.set(key(cell),
        (occupancy.get(key(cell))??0)+1);
      if(p.system!=="remodeling"||made.length||e.removedCellIds.length||
        !axis||![[1,0],[-1,0],[0,1],[0,-1]]
          .some(([x,y])=>axis.x===x&&axis.y===y)||
        moves.size<3||moves.size>256||moves.size!==p.relocations.length)
        throw new Error("Invalid physical vacancy-chain operation");
      for(const m of p.relocations){
        const prior=beforeCells.get(m.cellId)!;
        if(prior.tissueId!==p.operation.tissueId||anchored.has(prior.id)||
          occupancy.get(key(prior))!==1||
          origins.has(key(prior))||destinations.has(key(m.to)))
          throw new Error("Forged intercalation overlay or repeated material");
        origins.set(key(prior),prior.id);
        destinations.set(key(m.to),prior.id);
      }
      const donors=[...origins].filter(([xy])=>!destinations.has(xy));
      const exits=[...destinations].filter(([xy])=>!origins.has(xy));
      if(donors.length<1||donors.length>8||donors.length!==exits.length)
        throw new Error("Invalid number of conservative vacancy corridors");
      const originalOwn=new Set(own.map(key));
      const linked=new Set<string>();
      for(const link of links.values()){
        linked.add(link.fromTissueId+"|"+link.toTissueId);
        linked.add(link.toTissueId+"|"+link.fromTissueId);
      }
      const visited=new Set<string>();
      for(const [,startId] of donors){
        const first=beforeCells.get(startId)!;
        const backward={x:first.x-axis.x,y:first.y-axis.y};
        if(originalOwn.has(key(backward)))
          throw new Error("Intercalation donor is not original perimeter");
        let current=startId,length=0;
        let final:{x:number;y:number}|null=null;
        while(!visited.has(current)){
          visited.add(current);length++;
          const m=movements.get(current);
          if(!m)throw new Error("Broken physical source-owned corridor");
          const next=origins.get(key(m.to));
          if(!next){final=m.to;break;}
          current=next;
        }
        if(!final||length<3||length>64||
          occupancy.has(key(final))||
          (final.x-first.x)*axis.x+(final.y-first.y)*axis.y<3)
          throw new Error("Malformed or non-reshaping material corridor");
        const support=([
          [1,0],[-1,0],[0,1],[0,-1],
          [1,1],[-1,-1],[1,-1],[-1,1],
        ] as const).filter(([dx,dy])=>
          originalOwn.has((final!.x+dx)+","+(final!.y+dy)));
        if(support.length<2||!support.some(([dx,dy])=>dx===0||dy===0))
          throw new Error("Material corridor requires original boundary support");
        for(const c of original){
          if(c.tissueId===p.operation.tissueId||
            linked.has(p.operation.tissueId+"|"+c.tissueId))continue;
          if(Math.max(Math.abs(c.x-final.x),Math.abs(c.y-final.y))<=1)
            throw new Error("Material corridor creates unrelated tissue contact");
        }
      }
      if(visited.size!==moves.size)
        throw new Error("Material corridor contains an unaccounted cycle or branch");
    }
    if(coupled){
      if(p.system!=="remodeling"||made.length||e.removedCellIds.length||
        !coupled.size||moves.size!==coupled.size||
        [...coupled].some(([id])=>!moves.has(id)))
        throw new Error("Incomplete or fabricated attached-anatomy movement");
      const planned=new Map([...beforeCells].map(([id,c])=>{
        const p=coupled.get(id);
        return [id,p?{...c,x:p.x,y:p.y}:c] as const;
      }));
      const linked=new Set<string>();
      const parent=new Map<string,string>();
      for(const joint of links.values()){
        linked.add(joint.fromTissueId+"|"+joint.toTissueId);
        linked.add(joint.toTissueId+"|"+joint.fromTissueId);
        if(joint.kind==="attachment")parent.set(joint.fromTissueId,joint.toTissueId);
      }
      // Independently derive ancestry from the ORIGINAL contact graph:
      // adjacent grandparent/child contact is not automatically a new joint.
      // It is legitimate only through a complete, acyclic attachment chain.
      for(const id of beforeTissues.keys()){
        const visited=new Set<string>([id]);
        let ancestor=parent.get(id);
        while(ancestor&&!visited.has(ancestor)){
          linked.add(id+"|"+ancestor);
          linked.add(ancestor+"|"+id);
          visited.add(ancestor);
          ancestor=parent.get(ancestor);
        }
        if(ancestor)throw new Error("Cyclic attached anatomy in deformation");
      }
      const bins=new Map<string,MaterialCell[]>();
      for(const cell of planned.values()){
        const bucket=bins.get(key(cell))??[];
        bucket.push(cell);bins.set(key(cell),bucket);
      }
      for(const [id,target] of coupled){
        const old=beforeCells.get(id)!;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
          for(const other of bins.get((target.x+dx)+","+(target.y+dy))??[]){
            if(other.id===id||other.tissueId===old.tissueId||
              linked.has(old.tissueId+"|"+other.tissueId))continue;
            const was=beforeCells.get(other.id)!;
            if(Math.max(Math.abs(old.x-was.x),Math.abs(old.y-was.y))>1)
              throw new Error("Attachment-coupled movement creates unlinked contact");
          }
      }
    }
    if(e.kind==="reposition"){
      const own=[...beforeCells.values()].filter(c=>c.tissueId===p.operation.tissueId);
      const d=p.operation.direction;
      if(p.system!=="remodeling"||made.length||e.removedCellIds.length||
        !d||![[1,0],[-1,0],[0,1],[0,-1]].some(([x,y])=>d.x===x&&d.y===y)||
        !own.length||moves.size!==own.length||
        own.some(c=>!moves.has(c.id)))
        throw new Error("Reposition must move exactly every source-owned cell in one connected tissue");
    }
    if (e.kind === "remodel" && moves.size > 1)
      throw new Error("Remodel quantum relocated excess material");
    if(e.kind==="reshape"){
      // Independently require one replacement daughter at each vacated
      // coordinate. Creation occurs before relocation, so parent contact is
      // tested against its PRE-operation position (not a fabricated source).
      if(p.system!=="remodeling"||!p.operation.direction||
         !moves.size||moves.size>16||made.length!==moves.size||
         e.removedCellIds.length)
        throw new Error("Unowned regional remodeling material");
      const createdParents=new Set<string>();
      for(const m of p.relocations){
        const prior=beforeCells.get(m.cellId)!;
        const daughters=made.filter(c=>c.parentCellIds.length===1&&
          c.parentCellIds[0]===prior.id &&
          c.x===m.from.x&&c.y===m.from.y &&
          c.tissueId===prior.tissueId &&
          c.color===prior.color && c.z===prior.z);
        if(daughters.length!==1||createdParents.has(prior.id))
          throw new Error("Regional source material lacks exact parent replacement");
        createdParents.add(prior.id);
      }
    }
    if(e.kind==="repattern"&&!strain){
      if(p.system!=="remodeling"||made.length||
        !e.removedCellIds.length&&!moves.size||e.removedCellIds.length+moves.size>64)
        throw new Error("Invalid developmental turnover budget");
      for(const id of e.removedCellIds){
        const donor=beforeCells.get(id);
        const own=new Set([...beforeCells.values()].filter(a=>a.tissueId===donor?.tissueId).map(key));
        if(!donor||![-1,0,1].some(y=>[-1,0,1].some(x=>
          (x||y)&&!own.has((donor.x+x)+","+(donor.y+y)))))
          throw new Error("Developmental resorption lacks an exposed boundary");
      }
    }
    for (const id of e.removedCellIds) {
      if (!active.has(id) || moves.has(id))
        throw new Error("Removal lacks active physical inventory");
      active.delete(id);
    }
    for (const change of p.tissues) {
      const a = change.before,
        b = change.after;
      if (a && b) {
        if (
          !same(
            {
              ...a,
              parentId: b.parentId,
              relationship: b.relationship,
              rigidity: b.rigidity,
              growthSiteIds: b.growthSiteIds,
              functionalKind: b.functionalKind,
            },
            b,
          )
        )
          throw new Error("Unrecorded tissue identity mutation");
        if (a.functionalKind !== b.functionalKind) {
          // Independent semantic/material oracle: a name cannot change just
          // because metadata asks it to. The original authored sourceKind
          // remains fixed in the birth inventory; only mechanical homologues
          // and chronological targetKind authorization permit a function swap.
          const origin=graph.sourceCells.find(c=>c.tissueId===a.id)?.sourceKind;
          const alternatives:Readonly<Record<string,readonly string[]>>={
            leg:["arm"],arm:["leg"],foot:["hand"],hand:["foot"],
            wing:["arm"],tail:["leg"],ear:["horn"],horn:["ear"],
          };
          const previously=a.functionalKind??a.developedKind??origin;
          if(e.kind!=="repurpose"||p.system!=="remodeling"||
            a.id!==p.operation.tissueId||!origin||
            !alternatives[origin]?.includes(p.operation.targetKind??"")&&
              p.operation.targetKind!==origin ||
            b.functionalKind!==p.operation.targetKind ||
            ![origin,...(alternatives[origin]??[])].includes(previously??"") ||
            previously===b.functionalKind)
            throw new Error("Unauthorised anatomical function repurposing");
        }
        if (
          !same(a.growthSiteIds, b.growthSiteIds) &&
          (!["resorb","repattern"].includes(e.kind) ||
            b.growthSiteIds.some((id) => !a.growthSiteIds.includes(id)))
        )
          throw new Error("Unauthorized tissue growth-site mutation");
        if (
          (a.parentId !== b.parentId || a.relationship !== b.relationship) &&
          (e.kind === "repattern" ?
            (b.parentId!==null||b.relationship!=="floating"||[...active.values()].some(c=>c.tissueId===a.id)) :
          (e.kind !== "reattach" ||
            a.id !== p.operation.tissueId ||
            b.parentId !== p.operation.targetTissueId))
        )
          throw new Error("Unauthorized attachment mutation");
        if (
          a.rigidity !== b.rigidity &&
          (e.kind !== "reinforce" ||
            a.id !== p.operation.tissueId ||
            b.rigidity < a.rigidity)
        )
          throw new Error("Unauthorized physical rigidity change");
      } else if (a && !b)
        throw new Error("No operator authorizes removing tissue identities");
      else if (
        b &&
        (!["branch", "bud"].includes(e.kind) ||
          !b.parentId ||
          !beforeTissues.has(b.parentId) ||
          b.sourcePartId !== beforeTissues.get(b.parentId)?.sourcePartId)
      )
        throw new Error("Unauthorized tissue creation");
    }
    if(e.kind==="reattach"){
      // Independent topology oracle: the stage may only change one existing
      // joint to the nearest currently TOUCHING alternate host. Verify the
      // precise endpoints and unchanged identity, not merely the target name
      // supplied in a potentially forged journal.
      const tissueId=p.operation.tissueId,targetId=p.operation.targetTissueId;
      const oldTissue=beforeTissues.get(tissueId);
      const targetTissue=targetId?beforeTissues.get(targetId):undefined;
      const former=[...links.values()].filter(l=>
        l.kind==="attachment"&&l.fromTissueId===tissueId);
      const own=[...beforeCells.values()].filter(c=>c.tissueId===tissueId);
      const host=[...beforeCells.values()].filter(c=>c.tissueId===targetId);
      const parentChain=new Set<string>();
      let cursor:string|null=targetId??null;
      while(cursor&&!parentChain.has(cursor)){
        parentChain.add(cursor);
        cursor=beforeTissues.get(cursor)?.parentId??null;
      }
      const contacts=own.flatMap(a=>host.flatMap(b=>
        Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))<=1?
        [{a,b,d:(a.x-b.x)**2+(a.y-b.y)**2}]:[]));
      contacts.sort((u,v)=>u.d-v.d||
        (u.a.id<v.a.id?-1:u.a.id>v.a.id?1:0)||
        (u.b.id<v.b.id?-1:u.b.id>v.b.id?1:0));
      if(p.system!=="remodeling"||!oldTissue||!targetTissue||
        !targetId||targetId===tissueId||parentChain.has(tissueId)||
        cursor!==null||former.length>1||
        former[0]?.toTissueId===targetId||
        made.length||moves.size||e.removedCellIds.length||
        !contacts.length)
        throw new Error("Unlawful physical attachment succession");
      const pair=contacts[0],prior=former[0]??null;
      const afterLink:MaterialLink={
        id:prior?.id??p.operation.id+"/attachment",
        kind:"attachment",fromTissueId:tissueId,toTissueId:targetId,
        fromCellId:pair.a.id,toCellId:pair.b.id,
      };
      if(p.links.length!==1||!same(p.links[0],{
        id:afterLink.id,before:prior,after:afterLink,
      })||p.tissues.length!==1||
        !same(p.tissues[0],{
          id:tissueId,before:oldTissue,
          after:{...oldTissue,parentId:targetId,relationship:"joint"},
        }))
        throw new Error("Forged nearest-contact attachment topology");
    }
    for (const change of p.links) {
      if(e.kind==="reposition"){
        const a=change.before,b=change.after;
        const touched=a&&(a.fromTissueId===p.operation.tissueId||
          a.toTissueId===p.operation.tissueId);
        if(!a||!b||!touched||
          !same({...a,fromCellId:b.fromCellId,toCellId:b.toCellId},b)||
          !b.fromCellId||!b.toCellId||
          active.get(b.fromCellId)?.tissueId!==b.fromTissueId||
          active.get(b.toCellId)?.tissueId!==b.toTissueId)
          throw new Error("Reposition forged a new attachment identity or endpoint");
        continue;
      }
      if(e.kind==="repattern"){
        const a=change.before,b=change.after;
        if(!a||b&&!same({...a,fromCellId:b.fromCellId,toCellId:b.toCellId},b)||
          !b&&[...active.values()].some(c=>c.tissueId===a.fromTissueId)&&
            [...active.values()].some(c=>c.tissueId===a.toTissueId))
          throw new Error("Unauthorized developmental attachment change");
        continue;
      }
      if (
        e.kind === "reattach" &&
        change.after &&
        (change.after.fromTissueId !== p.operation.tissueId ||
          change.after.toTissueId !== p.operation.targetTissueId)
      )
        throw new Error("Attachment differs from authorized target");
      if (
        (change.before && e.kind !== "reattach") ||
        (!change.before &&
          !["branch", "bud", "fuse", "reattach"].includes(e.kind))
      )
        throw new Error("Unauthorized attachment transaction");
    }
    for (const change of p.sites) {
      if(e.kind==="repattern"){
        const a=change.before,b=change.after;
        const old=a?beforeCells.get(a.rootCellId):undefined,newRoot=b?beforeCells.get(b.rootCellId):undefined;
        if(!a||!old||!e.removedCellIds.includes(old.id)||
          (b?(!same({...a,rootCellId:b.rootCellId},b)||!newRoot||
             newRoot.tissueId!==old.tissueId||!active.has(newRoot.id)||
             Math.max(Math.abs(newRoot.x-old.x),Math.abs(newRoot.y-old.y))>1):
            [...active.values()].some(c=>c.tissueId===old.tissueId)))
          throw new Error("Unauthorized developmental growth-site turnover");
        continue;
      }
      if (
        change.before &&
        change.after &&
        (!["elongate", "extend", "branch", "bud"].includes(e.kind) ||
          !same(
            { ...change.before, rootCellId: change.after.rootCellId },
            change.after,
          ) ||
          !made.some(
            (c) =>
              c.id === change.after!.rootCellId &&
              c.tissueId === change.after!.tissueId,
          ))
      )
        throw new Error("Unauthorized persistent site mutation");
      if (
        (!change.before && !["branch", "bud"].includes(e.kind)) ||
        (!change.after && e.kind !== "resorb")
      )
        throw new Error("Unauthorized site transaction");
    }
    patch(tissues, p.tissues, "tissue");
    patch(sites, p.sites, "growth site");
    patch(links, p.links, "attachment");
    if(e.kind==="repattern"&&!strain){
      if(!active.size)throw new Error("Developmental turnover erased the organism");
      const before=[...beforeCells.values()],after=[...active.values()];
      const beforeGroups=new Map<string,MaterialCell[]>(),afterGroups=new Map<string,MaterialCell[]>();
      for(const c of before){const group=beforeGroups.get(c.tissueId)??[];group.push(c);beforeGroups.set(c.tissueId,group);}
      for(const c of after){const group=afterGroups.get(c.tissueId)??[];group.push(c);afterGroups.set(c.tissueId,group);}
      for(const t of tissues.values()){
        if(cardinalComponents(afterGroups.get(t.id)??[])>
          cardinalComponents(beforeGroups.get(t.id)??[]))
          throw new Error("Developmental turnover fragments cardinal tissue contact");
      }
      for(const movement of p.relocations){
        const moved=active.get(movement.cellId)!;
        const linked=new Set([...links.values()].flatMap(l=>l.fromTissueId===moved.tissueId?[l.toTissueId]:l.toTissueId===moved.tissueId?[l.fromTissueId]:[]));
        if(after.some(c=>c.tissueId!==moved.tissueId&&!linked.has(c.tissueId)&&
          Math.max(Math.abs(c.x-moved.x),Math.abs(c.y-moved.y))<=1))
          throw new Error("Simultaneous turnover creates unlinked tissue contact");
      }
    }
    if(p.protectedVoids){
      if(e.kind!=="repattern"||!same(p.protectedVoids.before,[...voids]))
        throw new Error("Unauthorized protected-void transaction");
      // A separate four-neighbour exterior flood proves the cavity actually
      // opened. Changing a mask without physical surgery cannot release it.
      const occupied=new Set([...active.values()].map(key)),outside=new Set<string>(),stack:{x:number;y:number}[]=[];
      for(let i=0;i<64;i++)stack.push({x:i,y:0},{x:i,y:63},{x:0,y:i},{x:63,y:i});
      while(stack.length){const q=stack.pop()!,k=key(q);
        if(!bounded(q)||occupied.has(k)||outside.has(k))continue;
        outside.add(k);stack.push({x:q.x-1,y:q.y},{x:q.x+1,y:q.y},{x:q.x,y:q.y-1},{x:q.x,y:q.y+1});
      }
      const expected=strainedVoids??[...voids].filter(k=>!outside.has(k));
      if(!same(p.protectedVoids.after,expected))throw new Error("Protected cavity was not physically opened");
      voids.clear();for(const k of expected)voids.add(k);
    }
    mechanical(active, tissues, sites, links, voids, source,birthVoids);
    continuousAnatomy([...active.values()],{links:[...links.values()],protectedVoids:[...voids]});
  }
  if (
    new Set(graph.cells.map((c) => c.id)).size !== graph.cells.length ||
    active.size !== graph.cells.length ||
    graph.cells.some((c) => !same(c, active.get(c.id)))
  )
    throw new Error(
      "Actual spatial material inventory disagrees with transactions",
    );
  if (
    !same(graph.tissues, [...tissues.values()]) ||
    !same(graph.sites, [...sites.values()]) ||
    !same(graph.links, [...links.values()])
  ) {
    for (const [actual, expected] of [
      [graph.tissues, tissues],
      [graph.sites, sites],
      [graph.links, links],
    ] as const) {
      if (
        new Set(actual.map((v) => v.id)).size !== actual.length ||
        actual.length !== expected.size ||
        actual.some((v) => !same(v, expected.get(v.id)))
      )
        throw new Error("Unrecorded physical topology mutation");
    }
  }
  if(!same(graph.protectedVoids,[...voids]))throw new Error("Unrecorded protected-void mutation");
  if(immutable(graph)&&(!original||immutable(original)))verifiedPrefixes.set(graph,{
    cells:new Map(active),tissues:new Map(tissues),sites:new Map(sites),links:new Map(links),
    lastCheck:previous,original:original??graph.birth,hatch:hatchAtMs,
    authorization:authorizationKey,ever:new Set(ever),events:new Set(events),voids:new Set(voids),
  });
  return { cells: active, tissues, sites, links, lastCheck: previous };
}

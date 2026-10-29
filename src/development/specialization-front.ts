/**
 * Generic physical placement potential for already player-selected or
 * genetically DEVELOPED anatomical kinds. This NEVER infers what the player
 * drew, never creates a cell, and never picks a species or target silhouette.
 *
 * The operator-chronology journal still performs all placement, connection,
 * provenance, collision, void and chronological validation. This merely
 * orders the legal candidate sites for an ordinary incremental "expand".
 *
 * Inputs: immutable kind label, nonempty live tissue points, axis declared by
 * the already authorized physical operator, proposed adjacent lattice site.
 * Output: deterministic finite real score (lower is preferred).
 *
 * L: active longitudinal span along the chosen growth axis;
 * W: active lateral span; a proposed site changes these to L',W'.
 * B_k is a biomechanical breadth-to-length preference, NOT a fixed sprite.
 *
 * Score_k = 8*|ln((W'/L')/B_k)| + 0.04*distance(candidate, centroid)
 *           - 0.18*numberOf8ConnectedTissueNeighbors(candidate).
 *
 * The same rule works on every creature and at any scale. It can widen a
 * sheet, thicken a leg, or compact a sensory organ from their actual material.
 * Nothing is emitted until the existing physical ledger accepts a quantum.
 */
import type { PartKind, Point } from "../simulation/model";

const BREADTH: Readonly<Record<PartKind, number>> = Object.freeze({
  body: 1, head: 1.1, arm: 0.65, hand: 1.1, leg: 0.65, foot: 1.7,
  eye: 1, mouth: 2.0, ear: 1.4, tail: 0.5, wing: 2.2,
  horn: 0.45, egg: 1.05, hair: 0.4, decoration: 1,
});

/** Only explicit or genetically developed kinds choose a specialization law. */
export function createSpecializationRank(
  kind: PartKind,
  cells: readonly Point[],
  direction: Point,
): ((candidate: Point) => number) | null {
  if (kind === "body" || kind === "decoration" || cells.length === 0)
    return null;
  const length=Math.hypot(direction.x,direction.y);
  if(!Number.isFinite(length))throw new RangeError("Nonfinite operator axis");
  const ux=length>1e-9?direction.x/length:0,
    uy=length>1e-9?direction.y/length:-1;
  const cx=cells.reduce((sum,c)=>sum+c.x,0)/cells.length,
    cy=cells.reduce((sum,c)=>sum+c.y,0)/cells.length;
  let lowL=Infinity, highL=-Infinity, lowW=Infinity, highW=-Infinity;
  const occupied=new Set<string>();
  for(const cell of cells){
    const forward=cell.x*ux+cell.y*uy;
    const lateral=-cell.x*uy+cell.y*ux;
    lowL=Math.min(lowL,forward);highL=Math.max(highL,forward);
    lowW=Math.min(lowW,lateral);highW=Math.max(highW,lateral);
    occupied.add(cell.x+","+cell.y);
  }
  const breadth=BREADTH[kind];
  return (candidate:Point):number=>{
    const forward=candidate.x*ux+candidate.y*uy,
      lateral=-candidate.x*uy+candidate.y*ux;
    // +1 is the width of one original painted cell in this lattice.
    const L=Math.max(highL,forward)-Math.min(lowL,forward)+1,
      W=Math.max(highW,lateral)-Math.min(lowW,lateral)+1;
    let neighbors=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;
      if(occupied.has((candidate.x+dx)+","+(candidate.y+dy)))neighbors++;
    }
    const shape=8*Math.abs(Math.log(W/L/breadth));
    const radius=0.04*Math.hypot(candidate.x-cx,candidate.y-cy);
    return shape+radius-0.18*neighbors;
  };
}

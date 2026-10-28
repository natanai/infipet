/** Exact eight-neighbor reachability on the physical 64x64 integer lattice.
 *
 * Input: finite integer (x,y) positions in [0,63]^2. Output: false for no
 * material, otherwise whether its occupied sites form one Moore component.
 * Each position is k=64*y+x. Flood every occupied neighbor (x+dx,y+dy),
 * dx,dy in {-1,0,1}, with explicit coordinate bounds; never wrap a row edge.
 * Each site enters the integer queue once. O(N+8U) time and 12KiB workspace,
 * U<=4096 occupied sites. No seed, time, rounding, retained cache or mutation
 * of the input. Invalid coordinates throw before any result is returned.
 *
 * Collocated authored identities are a clique with identical external
 * neighbors. Quotienting that clique to one lattice site preserves graph
 * connectivity. Identity, ancestry, overlap and attachment validation remain
 * separate checks on EVERY physical cell; this function never deletes cells.
 * The independent physical auditor deliberately keeps its own implementation.
 */
export function isLatticeConnected(points:readonly Readonly<{x:number;y:number}>[]):boolean{
 if(!points.length)return false;
 const occupied=new Uint8Array(4096),queue=new Uint16Array(4096);
 let count=0,first=0;
 for(const p of points){
  if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.x>=64||p.y<0||p.y>=64)
   throw new RangeError("Connectivity requires bounded integer material positions");
  const k=p.y*64+p.x;
  if(!occupied[k]){occupied[k]=1;count++;first=k;}
 }
 queue[0]=first;occupied[first]=2;let tail=1;
 for(let head=0;head<tail;head++){
  const k=queue[head],x=k%64,y=Math.floor(k/64);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const nx=x+dx,ny=y+dy;
   if(nx<0||nx>=64||ny<0||ny>=64)continue;
   const next=ny*64+nx;
   if(occupied[next]===1){occupied[next]=2;queue[tail++]=next;}
  }
 }
 return tail===count;
}

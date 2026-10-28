/**
 * MORPH-001 independent integer-grid morphology oracle. Does NOT import or
 * trust production growth, rasterization, phylogeny, or material auditors.
 * A visual metric is NEVER physical proof. Only explicit cell IDs, transactions,
 * links and authored roots can contribute to physical diagnostics.
 */
export type MorphPoint = Readonly<{x:number;y:number;materialCellId?:string}>;
export type PhysicalWitness = Readonly<{
  cells: readonly Readonly<{id:string;x:number;y:number;tissueId:string;provenance:string;sourceIds:readonly string[]}>[];
  sourceCells: readonly Readonly<{id:string;x:number;y:number}>[];
  tissues: readonly Readonly<{id:string}>[];
  links: readonly Readonly<{fromCellId?:string;toCellId?:string}>[];
  events: readonly Readonly<{id:string;atHour:number;createdCellIds:readonly string[];removedCellIds:readonly string[]}>[];
}>;
type Point={x:number;y:number};
const key=(x:number,y:number)=>x+","+y;
const dirs=[[1,0],[-1,0],[0,1],[0,-1]] as const;
const asPoints=(pixels:readonly MorphPoint[]):Point[]=>{
  const seen=new Set<string>(),result:Point[]=[];
  for(const p of pixels){
    if(!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y))
      throw new RangeError("Morphology geometry requires finite integer pixel coordinates");
    const k=key(p.x,p.y);if(seen.has(k))continue;seen.add(k);result.push({x:p.x,y:p.y});
  }
  return result.sort((a,b)=>a.y-b.y||a.x-b.x);
};
const mean=(a:readonly number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
function shape(pixels:readonly MorphPoint[]){
  const points=asPoints(pixels), occupied=new Set(points.map(p=>key(p.x,p.y)));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const left=points.length?Math.min(...xs):0,right=points.length?Math.max(...xs):-1;
  const top=points.length?Math.min(...ys):0,bottom=points.length?Math.max(...ys):-1;
  const width=points.length?right-left+1:0,height=points.length?bottom-top+1:0;
  const center={x:mean(xs),y:mean(ys)};
  let perimeter=0,components=0,cavities=0;
  const seen=new Set<string>();
  for(const p of points)for(const [dx,dy] of dirs)
    if(!occupied.has(key(p.x+dx,p.y+dy)))perimeter++;
  for(const p of points){
    const start=key(p.x,p.y);if(seen.has(start))continue;
    components++;seen.add(start);const queue=[p];
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of dirs){
      const q={x:queue[i].x+dx,y:queue[i].y+dy},k=key(q.x,q.y);
      if(occupied.has(k)&&!seen.has(k)){seen.add(k);queue.push(q);}
    }
  }
  // Dual-connectivity (4 foreground / 8 background) prevents diagonal
  // boundary pinches from fabricating cavities.
  const outside=new Set<string>(),queue:Point[]=[];
  const x0=left-1,x1=right+1,y0=top-1,y1=bottom+1;
  if(points.length){
    queue.push({x:x0,y:y0});outside.add(key(x0,y0));
    const bgDirs=[...dirs,[1,1],[1,-1],[-1,1],[-1,-1]] as const;
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of bgDirs){
      const x=queue[i].x+dx,y=queue[i].y+dy,k=key(x,y);
      if(x<x0||x>x1||y<y0||y>y1||occupied.has(k)||outside.has(k))continue;
      outside.add(k);queue.push({x,y});
    }
    const holes=new Set<string>();
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      const k=key(x,y);if(occupied.has(k)||outside.has(k)||holes.has(k))continue;
      cavities++;holes.add(k);const flood=[{x,y}];
      for(let i=0;i<flood.length;i++)for(const [dx,dy] of bgDirs){
        const xx=flood[i].x+dx,yy=flood[i].y+dy,kk=key(xx,yy);
        if(xx<left||xx>right||yy<top||yy>bottom||
          occupied.has(kk)||outside.has(kk)||holes.has(kk))continue;
        holes.add(kk);flood.push({x:xx,y:yy});
      }
    }
  }
  // Exact 4-neighbor city-block interior depth from a padded background.
  const dist=new Map<string,number>(),depthQueue:Point[]=[];
  for(const p of points)if(dirs.some(([dx,dy])=>!occupied.has(key(p.x+dx,p.y+dy)))){
    dist.set(key(p.x,p.y),1);depthQueue.push(p);
  }
  for(let i=0;i<depthQueue.length;i++){
    const p=depthQueue[i],d=dist.get(key(p.x,p.y))!;
    for(const [dx,dy] of dirs){const x=p.x+dx,y=p.y+dy,k=key(x,y);
      if(occupied.has(k)&&!dist.has(k)){dist.set(k,d+1);depthQueue.push({x,y});}
    }
  }
  const thickness=points.map(p=>2*(dist.get(key(p.x,p.y))??0)-1);
  const sorted=[...thickness].sort((a,b)=>a-b);
  const regions=Array.from({length:9},()=>0);
  for(const p of points) {
    const rx=width<=1?1:Math.min(2,Math.floor(3*(p.x-left)/width));
    const ry=height<=1?1:Math.min(2,Math.floor(3*(p.y-top)/height));
    regions[ry*3+rx]++;
  }
  const thin=points.filter(p=>(dist.get(key(p.x,p.y))??0)===1);
  const thinSet=new Set(thin.map(p=>key(p.x,p.y)));
  let tips=0,junctions=0;
  for(const p of thin){
    const degree=dirs.filter(([dx,dy])=>thinSet.has(key(p.x+dx,p.y+dy))).length;
    if(degree===1)tips++;if(degree>=3)junctions++;
  }
  return {points,occupied,left,top,width,height,center,
    area:points.length,perimeter,components,cavities,
    aspectRatio:height?width/height:0,
    compactness:perimeter?4*Math.PI*points.length/(perimeter*perimeter):0,
    localThickness:{min:sorted[0]??0,median:sorted[Math.floor(sorted.length/2)]??0,
      p90:sorted[Math.floor((sorted.length-1)*0.9)]??0,mean:mean(sorted)},
    regionFractions:regions.map(n=>points.length?n/points.length:0),
    thinFraction:points.length?thin.length/points.length:0,
    thinEndpoints:tips,thinJunctionPixels:junctions};
}
function physical(graph?:PhysicalWitness,before?:PhysicalWitness){
  if(!graph)return null;
  const ids=new Map(graph.cells.map(c=>[c.id,c]));
  const roots=new Set(graph.sourceCells.map(c=>c.id));
  const originalSurvivors=graph.sourceCells.filter(c=>ids.has(c.id));
  const movedOriginals=originalSurvivors.filter(c=>{
    const now=ids.get(c.id)!;return now.x!==c.x||now.y!==c.y;}).length;
  const beforeIds=new Map((before?.cells??[]).map(c=>[c.id,c]));
  const movedSurvivors=[...ids.values()].filter(c=>{
    const prior=beforeIds.get(c.id);return prior&&(c.x!==prior.x||c.y!==prior.y);}).length;
  const validLinks=graph.links.filter(l=>
    (!l.fromCellId||ids.has(l.fromCellId))&&(!l.toCellId||ids.has(l.toCellId))).length;
  const generated=graph.cells.filter(c=>c.provenance==="generated");
  return {
    cells:graph.cells.length,sourceRoots:roots.size,
    originalSurvivors:originalSurvivors.length,movedOriginals,movedSurvivors,
    generated:generated.length,generatedRatio:graph.cells.length?generated.length/graph.cells.length:0,
    liveTissues:new Set(graph.cells.map(c=>c.tissueId)).size,
    links:graph.links.length,validLinks,
    events:graph.events.length,
    generatedCenter:generated.length?{x:mean(generated.map(c=>c.x)),y:mean(generated.map(c=>c.y))}:null,
    unrootedCells:graph.cells.filter(c=>!c.sourceIds.some(id=>roots.has(id))).length,
    creationReceiptCount:graph.events.reduce((s,e)=>s+e.createdCellIds.length,0),
    removalReceiptCount:graph.events.reduce((s,e)=>s+e.removedCellIds.length,0),
  };
}
export function morphologyMetrics(pixels:readonly MorphPoint[],graph?:PhysicalWitness,before?:PhysicalWitness) {
  const s=shape(pixels);
  const mapped=pixels.filter(p=>p.materialCellId!==undefined).length;
  return {
    occupiedArea:s.area,width:s.width,height:s.height,aspectRatio:s.aspectRatio,
    perimeter:s.perimeter,compactness:s.compactness,
    components:s.components,cavities:s.cavities,
    localThickness:s.localThickness,regionFractions:s.regionFractions,
    thinFraction:s.thinFraction,thinEndpoints:s.thinEndpoints,thinJunctionPixels:s.thinJunctionPixels,
    center:s.center,materialIdentityPixels:mapped,
    materialIdentityCoverage:pixels.length?mapped/pixels.length:0,
    physical:physical(graph,before),
  };
}
export function morphologyDelta(
  birth:readonly MorphPoint[],later:readonly MorphPoint[],
  birthGraph?:PhysicalWitness,laterGraph?:PhysicalWitness,
){
  const a=shape(birth),b=shape(later);
  const union=new Set([...a.occupied,...b.occupied]);
  const overlap=[...a.occupied].filter(k=>b.occupied.has(k)).length;
  return {
    occupiedAreaChange:b.area-a.area,
    areaRatio:a.area?b.area/a.area:null,
    widthRatio:a.width?b.width/a.width:null,heightRatio:a.height?b.height/a.height:null,
    aspectRatioChange:b.aspectRatio-a.aspectRatio,
    perimeterChange:b.perimeter-a.perimeter,
    compactnessChange:b.compactness-a.compactness,
    cavityChange:b.cavities-a.cavities,connectivityChange:b.components-a.components,
    regionFractionL1:b.regionFractions.reduce((n,v,i)=>n+Math.abs(v-a.regionFractions[i]),0),
    medianThicknessChange:b.localThickness.median-a.localThickness.median,
    thinFractionChange:b.thinFraction-a.thinFraction,
    branchingProminenceChange:b.thinEndpoints-a.thinEndpoints,
    centerDisplacement:Math.hypot(b.center.x-a.center.x,b.center.y-a.center.y),
    pixelJaccard:union.size?overlap/union.size:1,
    physical:physical(laterGraph,birthGraph),
  };
}

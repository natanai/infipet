// Supplemental analysis of frozen metrics, not another simulation run.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const runName = process.argv[2] ?? 'v6-baseline';
if(!/^[a-z0-9-]+$/.test(runName))throw new Error('Use a frozen run ID, not a path.');
const folder = new URL(`./${runName}/`, import.meta.url);
const metricsBytes = await readFile(new URL('metrics.json', folder));
const reviewBytes = await readFile(new URL('visual-reviews.json', folder));
const manifest = JSON.parse(await readFile(new URL('manifest.json', folder), 'utf8'));
const metrics = JSON.parse(metricsBytes), reviews = JSON.parse(reviewBytes);
if(manifest.stage!=='full')throw new Error('Bootstrap analysis expects a complete full-stage cohort.');
const seeds = manifest.seeds, positions = new Map(seeds.map((seed,i)=>[seed,i]));
const adult = metrics.genetics.filter(row=>row.age===75);
const life = metrics.lifecycles;
const primary = reviews.filter(row=>row.reviewer==='/root/audit_v6');
const adultRates=adult.map(row=>row.thresholds.find(t=>t.threshold===.1).separated);
const totals=rows=>({numerator:rows.reduce((n,r)=>n+r.numerator,0),denominator:rows.reduce((n,r)=>n+r.denominator,0)});
const bySeed = seeds.map((_,i)=>primary.filter(row=>Number(row.caseId.split('__')[1].slice(1))-1===i));
let state = 0x6c696665;
function random(){state=(state+0x6d2b79f5)>>>0;let t=Math.imul(state^(state>>>15),state|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;}
function paired(rows,weights,predicate){
  const rates=rows.map(row=>{let numerator=0,denominator=0;for(const pair of row.pairs){const weight=weights[positions.get(pair.a)]*weights[positions.get(pair.b)];denominator+=weight;if(predicate(pair))numerator+=weight;}return denominator?numerator/denominator:0;});
  return rates.reduce((sum,value)=>sum+value,0)/rates.length;
}
function visual(weights){let n=0,d=0;bySeed.forEach((rows,i)=>{n+=weights[i]*rows.filter(row=>row.distinctiveness>=2).length;d+=weights[i]*rows.length;});return n/d;}
const samples={adultShape:[],distinctLife:[],visualEvolution:[]};
for(let repeat=0;repeat<2000;repeat++){
  const weights=seeds.map(()=>0);for(let draw=0;draw<seeds.length;draw++)weights[Math.floor(random()*seeds.length)]++;
  samples.adultShape.push(paired(adult,weights,pair=>pair.distance>=.1));
  samples.distinctLife.push(paired(life,weights,pair=>pair.separatedAges>=2));
  samples.visualEvolution.push(visual(weights));
}
const interval=values=>{values.sort((a,b)=>a-b);return{lower:values[Math.floor(values.length*.025)]*100,upper:values[Math.floor(values.length*.975)]*100};};
const output={
  version:'seed-block-bootstrap-v1',run:runName,engineHash:metrics.engineHash,
  inputHashes:{metrics:createHash('sha256').update(metricsBytes).digest('hex'),reviews:createHash('sha256').update(reviewBytes).digest('hex')},
  replicates:2000,randomSeed:'0x6c696665',seedsPerReplicate:seeds.length,
  method:'Resample 16 raw seed IDs with replacement as shared blocks across all six starters, ages, and histories. Weight distinct original seed pairs by w_i*w_j; exclude self-pairs. Compute within-starter pair rates, then equally weight six starters. Primary visual scores use whole-seed blocks. Percentile 95% intervals.',
  results:{
    adultShape:{...totals(adultRates),percent:paired(adult,seeds.map(()=>1),pair=>pair.distance>=.1)*100,age:75,condition:'neutral care; within-starter pairs; normalized shape distance >=10%',interval:interval(samples.adultShape)},
    distinctLife:{...totals(life.map(row=>row.separated)),percent:paired(life,seeds.map(()=>1),pair=>pair.separatedAges>=2)*100,age:'30,75,120',condition:'neutral care; within-starter pairs; shape >=10% at two or more grown ages',interval:interval(samples.distinctLife)},
    visualEvolution:{numerator:primary.filter(row=>row.distinctiveness>=2).length,denominator:primary.length,percent:visual(seeds.map(()=>1))*100,age:'0→30,30→75,75→120',condition:'primary agent scores >=2; six starters, sixteen seeds, four histories',interval:interval(samples.visualEvolution)},
  },
  limitations:['Conditional on this small fixed cohort and the numerical definitions.','Visual intervals do not include reviewer error; score and threshold disagreements are reported separately.','No claim of independently sampled frames/pairs, global uniqueness, human preference, or device performance.'],
};
await writeFile(new URL('./bootstrap-intervals.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
process.stdout.write(JSON.stringify(output.results,null,2)+'\n');

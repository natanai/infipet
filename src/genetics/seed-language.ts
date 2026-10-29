/**
 * The readable seed language. This is a DEVELOPMENTAL POSSIBILITY SCRIPT,
 * not a sprite lookup, species assignment, or claim that a proposed eye
 * already exists.
 *
 * Each A-Z character is a named instruction. A 0-9 run immediately before
 * a letter determines that instruction's number of independent tickets:
 * "2E" = two eye opportunities; "0E" = zero eye opportunities. Unprefixed
 * letters supply one ticket; repeating letters adds tickets. Consecutive
 * digits are decimal, capped at 12 to bound computational work. Stray
 * digits alter the maturation phase but never invent an anatomical label.
 *
 * The tree sets likelihood; the immutable seed rolls each ticket; care and
 * material operators later decide whether a permitted opportunity becomes
 * physical anatomy. A targetCount is a POTENTIAL cap, not a guaranteed count.
 * Reproducibility: roll = hash(seed|reference|kind|ticket)/2^32, p in [0,1].
 */
import type { PartKind } from "../simulation/model";
import { hash } from "../simulation/model";
import type { SourceAtlas } from "../simulation/source-atlas";
import { createPhylogenyView } from "../phylogeny";
import { FANTASY_PATHS } from "../phylogeny/fantasy-paths";
import { authoredBrushCounts, REFERENCE_ROLES } from "../lineage/authored-neighbor";
export const SEED_LANGUAGE_VERSION = "readable-seed-v1" as const;
export type ProcessGene =
  | "broad-growth" | "division" | "surface-growth" | "support"
  | "symmetry" | "remodel" | "segmentation" | "resorption"
  | "repurposing" | "vestigialization" | "fusion" | "pigment" | "timing";
export type SeedWord = Readonly<{
  symbol: string;
  name: string;
  role: PartKind | null;
  process: ProcessGene | null;
}>;
/** An exact public, stable alphabetical lookup. No hidden letter meaning. */
export const SEED_ALPHABET: Readonly<Record<string, SeedWord>> = Object.freeze({
  A:{symbol:"A",name:"arms",role:"arm",process:null},
  B:{symbol:"B",name:"body breadth",role:null,process:"broad-growth"},
  C:{symbol:"C",name:"coat or hair",role:"hair",process:null},
  D:{symbol:"D",name:"division",role:null,process:"division"},
  E:{symbol:"E",name:"eyes",role:"eye",process:null},
  F:{symbol:"F",name:"feet",role:"foot",process:null},
  G:{symbol:"G",name:"surface growth",role:null,process:"surface-growth"},
  H:{symbol:"H",name:"horns",role:"horn",process:null},
  I:{symbol:"I",name:"ears",role:"ear",process:null},
  J:{symbol:"J",name:"hands or graspers",role:"hand",process:null},
  K:{symbol:"K",name:"skeletal support",role:null,process:"support"},
  L:{symbol:"L",name:"legs",role:"leg",process:null},
  M:{symbol:"M",name:"mouths",role:"mouth",process:null},
  N:{symbol:"N",name:"heads",role:"head",process:null},
  O:{symbol:"O",name:"eggs or envelopes",role:"egg",process:null},
  P:{symbol:"P",name:"pigment markings",role:"decoration",process:null},
  Q:{symbol:"Q",name:"symmetry",role:null,process:"symmetry"},
  R:{symbol:"R",name:"whole-body remodeling",role:null,process:"remodel"},
  S:{symbol:"S",name:"segmentation",role:null,process:"segmentation"},
  T:{symbol:"T",name:"tails",role:"tail",process:null},
  U:{symbol:"U",name:"material resorption",role:null,process:"resorption"},
  V:{symbol:"V",name:"vestigialization",role:null,process:"vestigialization"},
  W:{symbol:"W",name:"wings",role:"wing",process:null},
  X:{symbol:"X",name:"material fusion",role:null,process:"fusion"},
  Y:{symbol:"Y",name:"tissue repurposing",role:null,process:"repurposing"},
  Z:{symbol:"Z",name:"developmental timing",role:null,process:"timing"},
});
export const SEED_ROLES: readonly PartKind[] = [
  "arm","hair","eye","foot","horn","ear","hand","leg","mouth","head",
  "egg","decoration","tail","wing",
];
export type SeedInstruction = Readonly<{
  position: number; symbol: string; name: string;
  role: PartKind | null; process: ProcessGene | null;
  tickets: number; source: string;
}>;
export type SeedOpportunity = Readonly<{
  kind: PartKind; ticket: number; source: "latent" | "letter";
  probability: number; roll: number; accepted: boolean;
}>;
export type SeedFeaturePotential = Readonly<{
  kind: PartKind; authored: number; referenceAffinity: boolean;
  proposed: number; accepted: number;
  /** Count may not be reached unless legal source-owned operations occur. */
  targetCount: number;
}>;
export type ReadableSeedProgram = Readonly<{
  version: typeof SEED_LANGUAGE_VERSION;
  originalSeed: string; referenceId: string;
  origin: "pluripotent-body" | "authored-anatomy";
  instructions: readonly SeedInstruction[];
  opportunities: readonly SeedOpportunity[];
  features: readonly SeedFeaturePotential[];
  processes: Readonly<Partial<Record<ProcessGene, number>>>;
  /** Raw trailing numeric genes influence timing only. */
  phase: number;
}>;
/** O(seed length); stable even if pixels are moved, repainted or reshaped. */
export function parseSeedInstructions(seed: string): Readonly<{
  instructions: readonly SeedInstruction[]; phase: number;
}> {
  const instructions: SeedInstruction[] = [];
  let digits="", phase=0, position=0;
  for (const raw of seed) {
    const c=raw.toUpperCase();
    if (c>="0" && c<="9") {
      digits+=c;
      // Every digit has intelligible, deterministic phase influence.
      phase=(phase+Number(c)*(position+1))%365;
    } else if (SEED_ALPHABET[c]) {
      const word=SEED_ALPHABET[c];
      const tickets=digits ? Math.min(12,Number(digits)) : 1;
      instructions.push({
        position,symbol:c,name:word.name,role:word.role,process:word.process,
        tickets,source:(digits?digits:"")+c,
      });
      digits="";
    } else {
      // Preserve the existing permissive seed API: punctuation is a separator
      // and cannot secretly choose any anatomy.
      digits="";
    }
    position++;
  }
  return {instructions,phase};
}
const fixed = (v:number) => Math.round(v*1e12)/1e12;
export function compileReadableSeed(
  seed:string, referenceId:string, atlas:SourceAtlas,
): ReadableSeedProgram {
  const tree=createPhylogenyView(FANTASY_PATHS);
  if(!tree.getNode(referenceId))throw new RangeError("Unknown game phylogeny reference: "+referenceId);
  const {instructions,phase}=parseSeedInstructions(seed);
  const counts=authoredBrushCounts(atlas);
  const pluripotent=SEED_ROLES.every(kind=>!(counts[kind]??0));
  const roles=new Map(REFERENCE_ROLES.map(entry=>[entry.id,new Set(entry.roles)]));
  // Nearest *represented* taxon carries its anatomical hints down the branch.
  const ancestors=tree.ancestry(referenceId);
  const inherited=new Set<string>();
  for(const node of ancestors)for(const role of roles.get(node.id)??[])inherited.add(role);
  const prior=tree.resolveBiologicalConstraints(referenceId)!;
  const appendage=prior.operatorHints.some(h=>h.operator==="appendage-extension");
  const opportunities:SeedOpportunity[]=[];
  const processes:Partial<Record<ProcessGene,number>>={};
  for(const instruction of instructions)if(instruction.process)
    processes[instruction.process]=(processes[instruction.process]??0)+instruction.tickets;
  const features:SeedFeaturePotential[]=SEED_ROLES.map(kind=>{
    const authored=counts[kind]??0, match=inherited.has(kind);
    const kindInstructions=instructions.filter(i=>i.role===kind);
    const declared=kindInstructions.reduce((n,i)=>n+i.tickets,0);
    // Undifferentiated Body material is eligible for every kind. A direct
    // letter is authoritative about its own dosage: 0E excludes eyes;
    // otherwise an unmentioned kind receives one latent opportunity.
    const tickets=Math.min(12,declared+(pluripotent&&!kindInstructions.length?1:0));
    // Tree first: 58% for a matching reference role; otherwise 12%.
    // Declared letter genes add 12%, inherited appendage capability 4%.
    // No probability zero; the tree is an influence, not a species wall.
    const p=Math.min(.82,(match?.58:.12)+(declared?.12:0)+
      (appendage&&["arm","hand","leg","foot","wing","tail","horn"].includes(kind)?.04:0));
    let accepted=0;
    for(let i=0;i<tickets;i++){
      const source=i<declared?"letter":"latent";
      const roll=hash(seed+"|"+referenceId+"|"+kind+"|"+i)/4294967296;
      const hit=roll<p;
      if(hit)accepted++;
      opportunities.push({kind,ticket:i,source,probability:fixed(p),
        roll:fixed(roll),accepted:hit});
    }
    return {kind,authored,referenceAffinity:match,proposed:tickets,
      accepted,targetCount:authored+accepted};
  });
  return {version:SEED_LANGUAGE_VERSION,originalSeed:seed,referenceId,
    origin:pluripotent?"pluripotent-body":"authored-anatomy",
    instructions,opportunities,features,processes,phase};
}

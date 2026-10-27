import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  decodePet,
  encodePet,
  PROTOTYPE_REVISION,
  type PetDocument,
} from "./pet-format";
export {
  decodePet,
  encodePet,
  shareCode,
  PROTOTYPE_REVISION,
  type PetDocument,
} from "./pet-format";

import {supportsLargeWebSaves,writeLargeWebSave,readLargeWebSave,largeSavePointer,pointedLargeSave} from "./storage-web";
import {checkpointDigest} from "./integration/checkpoint-integrity";

const REVISION_KEY = "infipet.revision";
const PET_KEY = "infipet.pet";
let recoveryChecked=false;
async function readPayload(key:string):Promise<string|null>{
  const raw=await AsyncStorage.getItem(key);
  return raw&&pointedLargeSave(raw,key)?readLargeWebSave(key):raw;
}
async function writePayload(key:string,raw:string):Promise<void>{
  if(raw.length>1_500_000&&supportsLargeWebSaves()){
    await writeLargeWebSave(key,raw);
    await AsyncStorage.setItem(key,largeSavePointer(key));return;
  }
  try{await AsyncStorage.setItem(key,raw);}
  catch(error){
    if(!supportsLargeWebSaves())throw error;
    await writeLargeWebSave(key,raw);await AsyncStorage.setItem(key,largeSavePointer(key));
  }
}
const ORIGINAL_INDEX_KEY="infipet.before-daily-v1";
/** Back up exact original bytes before permitting a migrated save to replace
 * them. Backup failure rejects the migration and leaves the original intact. */
async function archiveOriginal(raw:string):Promise<void>{
  const key=ORIGINAL_INDEX_KEY+"/"+checkpointDigest(raw);
  if(await readPayload(key)===null)await writePayload(key,raw);
  await AsyncStorage.setItem(ORIGINAL_INDEX_KEY,key);
}
async function prepareRawPet(raw:string,preserveUnreadable=false):Promise<PetDocument>{
  let doc:PetDocument;
  try{doc=decodePet(raw);}catch(error){
    // A load failure must not make an older main save disposable. Invalid
    // pasted imports, in contrast, cannot overwrite the recovery index.
    if(preserveUnreadable)await archiveOriginal(raw);
    throw error;
  }
  if(doc.life&&doc.life.anatomicalClock!=="daily-365-v1")await archiveOriginal(raw);
  // Never fabricate pre-migration daily operations or reset an old birth.
  // App opens this older life read-only until explicit new-life creation.
  return doc;
}
/** Used by file imports as well as reopening. A legacy document stays unchanged,
 * and is returned only after its recoverable original has been durably written. */
export function preparePetForDaily(raw:string):Promise<PetDocument>{
  return serial(()=>prepareRawPet(raw));
}
export function loadOriginalPetBackup():Promise<string|null>{
  return serial(async()=>{const key=await AsyncStorage.getItem(ORIGINAL_INDEX_KEY);
    return key?readPayload(key):null;});
}
let operations: Promise<unknown> = Promise.resolve();

/** Serialize reset/read/save so a delayed reset cannot erase a fresh save. */
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation, operation);
  operations = result.catch(() => {});
  return result;
}

/** Metadata is not permission to erase a pet. Old or unreadable documents
 * stay untouched until the player explicitly replaces them; validation rejects
 * unsupported formats rather than silently starting a different creature. */
async function ensureRevision(): Promise<void> {
  if ((await AsyncStorage.getItem(REVISION_KEY)) !== PROTOTYPE_REVISION)
    await AsyncStorage.setItem(REVISION_KEY, PROTOTYPE_REVISION);
}

/** A version mismatch must never clear existing pet bytes. */
export function loadEditablePet(): Promise<PetDocument | null> {
  return serial(async () => {
    await ensureRevision();
    const raw = await readPayload(PET_KEY);
    const doc=raw===null?null:await prepareRawPet(raw,true);
    recoveryChecked=true;
    return doc;
  });
}

/** Validate first, then save source, care history, and replay metadata atomically. */
export async function savePet(pet: PetDocument): Promise<void> {
  if(pet.life&&pet.life.anatomicalClock!=="daily-365-v1")
    throw new Error("This earlier life is preserved. Begin a new daily life to continue in this version.");
  const raw = encodePet(pet);
  return serial(async () => {
    await ensureRevision();
    if(!recoveryChecked){
      // A failed initial backup must not be bypassed by drawing a new pet.
      // Recheck before the first replacement write; later ordinary saves do
      // not repeatedly decode a multi-megabyte existing daily document.
      const original=await readPayload(PET_KEY);
      if(original!==null){
        let needsRecovery=false;
        try{const old=decodePet(original);needsRecovery=!!old.life&&old.life.anatomicalClock!=="daily-365-v1";}
        catch{needsRecovery=true;}
        if(needsRecovery)await archiveOriginal(original);
      }
      recoveryChecked=true;
    }
    await writePayload(PET_KEY, raw);
  });
}

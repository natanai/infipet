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

const REVISION_KEY = "infipet.revision";
const PET_KEY = "infipet.pet";
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
let operations: Promise<unknown> = Promise.resolve();

/** Serialize reset/read/save so a delayed reset cannot erase a fresh save. */
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation, operation);
  operations = result.catch(() => {});
  return result;
}

/** Only this pre-release prototype's current format is accepted.
 * No legacy pet migration or read-only preservation contract exists.
 * Corrupt and unsupported files fail validation instead of silently loading.
 */
async function ensureRevision(): Promise<void> {
  if ((await AsyncStorage.getItem(REVISION_KEY)) !== PROTOTYPE_REVISION)
    await AsyncStorage.setItem(REVISION_KEY, PROTOTYPE_REVISION);
}

/** Load a current-format pet, or report an unsupported/corrupt local document. */
export function loadEditablePet(): Promise<PetDocument | null> {
  return serial(async () => {
    await ensureRevision();
    const raw = await readPayload(PET_KEY);
    return raw===null ? null : decodePet(raw);
  });
}

/** Parse an imported pet without creating migration or archival side effects. */
export function preparePetForDaily(raw:string):Promise<PetDocument>{
  return Promise.resolve().then(()=>decodePet(raw));
}

/** Serialize validated source, care history and optional checkpoints. */
export async function savePet(pet: PetDocument): Promise<void> {
  const raw = encodePet(pet);
  return serial(async () => {
    await ensureRevision();
    await writePayload(PET_KEY, raw);
  });
}

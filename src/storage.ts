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

const REVISION_KEY = "infipet.revision";
const PET_KEY = "infipet.pet";
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
    const raw = await AsyncStorage.getItem(PET_KEY);
    return raw === null ? null : decodePet(raw);
  });
}

/** Validate first, then save source, care history, and replay metadata atomically. */
export async function savePet(pet: PetDocument): Promise<void> {
  const raw = encodePet(pet);
  return serial(async () => {
    await ensureRevision();
    await AsyncStorage.setItem(PET_KEY, raw);
  });
}

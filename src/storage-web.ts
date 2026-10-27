/** Large web saves use one atomically replaced IndexedDB payload. Small
 * storage pointers keep the existing AsyncStorage entry compatible. There is
 * no append-per-tick database growth and optional caches never replace care. */
const DATABASE="infipet-living-saves-v1",STORE="payloads";
export const supportsLargeWebSaves=()=>typeof indexedDB!=="undefined";
async function open(){return new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open(DATABASE,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
export async function writeLargeWebSave(key:string,raw:string):Promise<void>{
  const db=await open();try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(raw,key);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
export async function readLargeWebSave(key:string):Promise<string>{
  const db=await open();try{return await new Promise<string>((resolve,reject)=>{
    const r=db.transaction(STORE,"readonly").objectStore(STORE).get(key);
    r.onsuccess=()=>typeof r.result==="string"?resolve(r.result):reject(new Error("Saved life payload unavailable"));
    r.onerror=()=>reject(r.error);
  });}finally{db.close();}
}
export const largeSavePointer=(key:string)=>JSON.stringify({storage:"infipet-indexeddb-v1",key});
export function pointedLargeSave(raw:string,key:string):boolean {
  if(!raw.startsWith('{"storage":"infipet-indexeddb-v1"'))return false;
  const pointer=JSON.parse(raw);if(pointer.key!==key)throw new Error("Saved life pointer has the wrong identity");
  return true;
}

// Offline reference-only WebAssembly host. No network or arbitrary RAM-write RPC.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
const module = new WebAssembly.Module(readFileSync(fileURLToPath(new URL("./.build/native_p1.wasm", import.meta.url))));
if(WebAssembly.Module.imports(module).length)throw new Error("Reference core must have no host imports");
const instance=new WebAssembly.Instance(module,{});
const core=instance.exports;
const pointer=core.native_buffer();
const memory=()=>new Uint8Array(core.memory.buffer);
const put=data=>{const bytes=Buffer.from(data,"base64");if(bytes.length>16384)throw new Error("Transfer too large");memory().set(bytes,pointer);return bytes.length;};
const base64=n=>Buffer.from(memory().subarray(pointer,pointer+n)).toString("base64");
function command(message){
  switch(message.op){
    case"init":return core.native_init(pointer,put(message.data));
    case"run":return core.native_run(message.ticks);
    case"watch":return core.native_run_watch(message.ticks,message.address,message.previous);
    case"button":core.native_button(message.button,message.pressed?1:0);return null;
    case"read":{
      const ram=Buffer.alloc(640);for(let i=0;i<640;i++)ram[i]=core.native_memory(i);
      core.native_frame(pointer);return{ticks:Number(core.native_ticks()),ram:ram.toString("base64"),frame:base64(520)};
    }
    case"memory":return core.native_memory(message.address);
    case"save":{const n=core.native_save(pointer,16384);if(!n)throw new Error("Snapshot failed");return base64(n);}
    case"load":return core.native_load(pointer,put(message.data));
    case"close":process.exit(0);break;
    default:throw new Error("Unsupported reference command");
  }
}
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  try{process.stdout.write(JSON.stringify({ok:true,value:command(JSON.parse(line))})+"\n");}
  catch(error){process.stdout.write(JSON.stringify({ok:false,error:String(error)})+"\n");}
}

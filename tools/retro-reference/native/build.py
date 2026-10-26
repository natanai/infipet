"""Build the offline GPL TamaLIB reference wrapper with an isolated Zig compiler."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess

ROOT=Path(__file__).resolve().parents[3]
NATIVE=Path(__file__).resolve().parent
VENDOR=ROOT/'data/retro-reference/research/tamalib'
BUILD=NATIVE/'.build'
BUILD.mkdir(exist_ok=True)
COMPILE=BUILD/'tamalib'
COMPILE.mkdir(exist_ok=True)
compiler=ROOT/'tools/retro-reference/.toolchain/ziglang/zig.exe'
if not compiler.exists(): raise SystemExit('Install isolated pinned compiler: python -m pip install --target tools/retro-reference/.toolchain ziglang==0.15.2 --no-deps')
shutil.copyfile(VENDOR/'hal_types.h.template',BUILD/'hal_types.h')
for source in VENDOR.iterdir():
    if source.suffix in ['.c','.h']:shutil.copyfile(source,COMPILE/source.name)
library=BUILD/'native_p1.wasm'
exports=['native_buffer','native_init','native_run','native_run_watch','native_ticks','native_button','native_memory','native_frame','native_save','native_load']
cmd=[str(compiler),'cc','-target','wasm32-freestanding','-nostdlib','-O3','-DNDEBUG','-fno-builtin',
     '-Wl,--no-entry','-Wl,--export-memory','-Wl,--initial-memory=2097152','-Wl,--max-memory=2097152',
     *['-Wl,--export='+name for name in exports],
     '-I'+str(BUILD),'-I'+str(COMPILE),str(NATIVE/'native_core.c'),
     *[str(COMPILE/name) for name in ['cpu.c','hw.c','tamalib.c']],'-o',str(library)]
environment=os.environ.copy();environment['ZIG_GLOBAL_CACHE_DIR']=str(BUILD/'zig-cache')
temporary=BUILD/'tmp'
temporary.mkdir(exist_ok=True)
environment['TMP']=environment['TEMP']=str(temporary)
environment['ZIG_LOCAL_CACHE_DIR']=str(BUILD/'zig-local-cache')
subprocess.run(cmd,env=environment,check=True)
inputs=[NATIVE/'native_core.c',*(VENDOR/name for name in ['cpu.c','cpu.h','hw.c','hw.h','tamalib.c','tamalib.h','hal.h','hal_types.h.template'])]
manifest={'version':'native-reference-core-v2-wasm','compilerVersion':subprocess.check_output([str(compiler),'version'],text=True).strip(),
          'tamalibRevision':'ce304d55f9a73c60232ce3f552e7983db3fa399c','compilerFlags':cmd[2:7],
          'librarySha256':hashlib.sha256(library.read_bytes()).hexdigest(),
          'sourceHashes':{str(f.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(f.read_bytes()).hexdigest() for f in inputs}}
(BUILD/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'library':str(library),'sha256':manifest['librarySha256']}))

"""Offline original World P1 emulator. Inputs are time and actual A/B/C pins only.

The archived published disassembly supplies the exact identified firmware in
memory. No ROM file, RAM poke function, seed override or target sprite is used.
TamaLIB runs in a compiled GPL library; each process owns one reference device.
"""
from pathlib import Path
import base64
import hashlib
import json
import math
import re
import subprocess

ROOT=Path(__file__).resolve().parents[3]
NATIVE=Path(__file__).resolve().parent
ROM_SHA1='4b4979cf92dc9d2fb6d7295a38f209f3da144f72'
TICKS_PER_SECOND=32768

def source_rom():
    text=(ROOT/'data/retro-reference/sources/tamagotchi/p1-disassembly.asm').read_text()
    words={int(m[1],16):int(m[2],16) for m in re.finditer(r'//\s*(0x[0-9a-f]+)\s+\((0x[0-9a-f]+)\)',text,re.I)}
    assert set(words)==set(range(6144))
    payload=b''.join(words[a].to_bytes(2,'big') for a in range(6144))
    assert hashlib.sha1(payload).hexdigest()==ROM_SHA1
    return payload

class NativeP1:
    def __init__(self):
        library=NATIVE/'.build/native_p1.wasm'
        if not library.exists():raise RuntimeError('Run tools/retro-reference/native/build.py first')
        self.process=subprocess.Popen(['node',str(NATIVE/'bridge.mjs')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,
            text=True,encoding='utf8',bufsize=1,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        self.cache=None
        assert self.rpc('init',data=base64.b64encode(source_rom()).decode())==0
        self.actions=[]

    def rpc(self,op,**arguments):
        self.process.stdin.write(json.dumps({'op':op,**arguments})+'\n');self.process.stdin.flush()
        line=self.process.stdout.readline()
        if not line:raise RuntimeError('Reference WebAssembly host stopped')
        response=json.loads(line)
        if not response['ok']:raise RuntimeError(response['error'])
        return response.get('value')

    def read(self):
        if self.cache is None:
            value=self.rpc('read');value['ram']=base64.b64decode(value['ram']);value['frame']=base64.b64decode(value['frame']);self.cache=value
        return self.cache

    def close(self):
        if hasattr(self,'process') and self.process.poll() is None:
            self.process.stdin.close()
            try:self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:self.process.kill()

    def __del__(self):
        try:self.close()
        except Exception:pass

    @property
    def ticks(self):return self.read()['ticks']
    @property
    def seconds(self):return self.ticks/TICKS_PER_SECOND
    def memory(self,address):return self.read()['ram'][address] if address<640 else self.rpc('memory',address=address)
    def run(self,seconds):
        if not math.isfinite(seconds) or seconds<0:raise ValueError('Invalid duration')
        ticks=round(seconds*TICKS_PER_SECOND)
        while ticks:
            part=min(ticks,1000000000)
            if self.rpc('run',ticks=part):raise RuntimeError('Native CPU stopped unexpectedly')
            self.cache=None
            ticks-=part

    def button(self,button,pressed):
        if button not in [0,1,2]:raise ValueError('Only A/B/C input pins are allowed')
        self.actions.append({'atTick':self.ticks,'button':'ABC'[button],'pressed':bool(pressed)})
        self.rpc('button',button=button,pressed=bool(pressed));self.cache=None

    def until_changed(self,address,maximum_seconds):
        previous=self.memory(address)
        result=self.rpc('watch',ticks=round(maximum_seconds*TICKS_PER_SECOND),address=address,previous=previous)
        self.cache=None
        if result<0:raise RuntimeError('Native observation stopped unexpectedly')
        return result==1

    def press(self,button,hold=.15,pause=.4):
        self.button(button,True);self.run(hold);self.button(button,False);self.run(pause)

    def frame(self):
        return self.read()['frame']

    def state(self):
        m=self.memory
        return {'tick':self.ticks,'seconds':round(self.seconds,6),'characterIndex':m(0x5d),'historyKind':m(0x50),
                'careMistakes':m(0x42),'missedDisciplineCalls':m(0x51),'displayDiscipline':m(0x43),
                'hunger':m(0x40),'happiness':m(0x41),'weight':m(0x46)+10*m(0x47),
                'asleep':bool(m(0x4a)&8),'sick':bool(m(0x48)&8),'sicknessCount':m(0x49),
                'waste':m(0x4d),'lightsOn':bool(m(0x4b)),'age':m(0x54)+10*m(0x55),
                'lifecycleRemainingAwakeMinutes':m(0x210)+16*m(0x211)+256*m(0x212),
                'clock':[m(0x14)+16*m(0x15),m(0x12)+10*m(0x13),m(0x10)+10*m(0x11)],
                'needCallTimer':m(0x208),'disciplineCallTimer':m(0x209),
                'lightsCallTimer':m(0x204)+16*m(0x205),'adultFatalCareMistakes':m(0x4f),
                'frameSha256':hashlib.sha256(self.frame()).hexdigest()}

    def save(self):
        return base64.b64decode(self.rpc('save'))

    def load(self,snapshot):
        if self.rpc('load',data=base64.b64encode(snapshot).decode()):raise ValueError('Invalid native snapshot')
        self.cache=None

    def set_initial_clock(self,hour=12,minute=0):
        self.run(2)
        self.press(1,pause=1.5)
        for _ in range(30):
            if self.state()['clock'][0]==hour:break
            self.press(0)
        else:raise RuntimeError('Could not set native clock hours with A')
        for _ in range(65):
            if self.state()['clock'][1]==minute:break
            self.press(1)
        else:raise RuntimeError('Could not set native clock minutes with B')
        self.press(2,pause=2)
        self.press(1,pause=1.5)
        assert self.state()['clock'][:2]==[hour,minute],self.state()

if __name__=='__main__':
    pet=NativeP1();pet.set_initial_clock();print(json.dumps({'clockSet':pet.state()}),flush=True)
    pet.run(300);print(json.dumps({'fiveMinutesLater':pet.state()}),flush=True)

"""Measure care-call deadlines at actual firmware instruction boundaries.

Only original A/B/C pins and elapsed CPU ticks are inputs. Watchpoints read RAM;
they do not set counters or stages. Full button histories accompany every probe.
"""
from pathlib import Path
import hashlib,json,time
from vm import NativeP1,ROM_SHA1,TICKS_PER_SECOND,NATIVE,ROOT
from caretaker import Caretaker

def child():
    pet=NativeP1();pet.set_initial_clock();bot=Caretaker(pet)
    bot.until(lambda s:s['characterIndex']==2 and s['lifecycleRemainingAwakeMinutes']>0 and s['weight']>=10,8000,step=1)
    while pet.state()['hunger']<15:bot.food(False)
    while pet.state()['happiness']<15:bot.food(True)
    return pet,bot

def call_probe(kind):
    pet,bot=child();timer=0x208 if kind=='need' else 0x209;counter=0x42 if kind=='need' else 0x51
    before=pet.state()
    assert pet.memory(timer)==0
    assert pet.until_changed(timer,5*3600),'Call was not raised'
    start=pet.state();start_value=pet.memory(timer)
    assert pet.until_changed(counter,25*60),'Counter did not change'
    end=pet.state()
    return {'id':kind,'startTimerValue':start_value,'timerAddress':hex(timer),'counterAddress':hex(counter),
            'before':before,'callStarted':start,'counterIncremented':end,
            'elapsedTicks':end['tick']-start['tick'],'elapsedSeconds':(end['tick']-start['tick'])/TICKS_PER_SECOND,
            'actions':pet.actions,'finalTick':pet.ticks}

def lights_probe():
    pet,bot=child()
    bot.until(lambda s:s['clock'][0]==19 and s['clock'][1]>=59,9*3600,step=1)
    while pet.state()['hunger']<15:bot.food(False)
    while pet.state()['happiness']<15:bot.food(True)
    assert not pet.state()['asleep'] and pet.state()['lightsOn'],pet.state()
    assert pet.until_changed(0x4a,120),'Did not sleep'
    start=pet.state()
    # Sleeping transition precedes the final zeroing of the lights timer by a
    # few instructions. Observe that zeroing if it has not yet completed.
    if pet.memory(0x205)!=0:assert pet.until_changed(0x205,2)
    timer_started=pet.state()
    assert pet.until_changed(0x42,70*60),'Lights mistake did not occur'
    end=pet.state()
    return {'id':'sleep-lights','sleepStarted':start,'timerStarted':timer_started,'counterIncremented':end,
            'elapsedTicks':end['tick']-start['tick'],'elapsedSeconds':(end['tick']-start['tick'])/TICKS_PER_SECOND,
            'elapsedFromTimerZeroSeconds':(end['tick']-timer_started['tick'])/TICKS_PER_SECOND,
            'actions':pet.actions,'finalTick':pet.ticks}

def main():
    start=time.perf_counter();probes=[]
    for function in [lambda:call_probe('need'),lambda:call_probe('discipline'),lights_probe]:
        result=function();probes.append(result)
        print(json.dumps({'probe':result['id'],'elapsedSeconds':result['elapsedSeconds'],'actions':len(result['actions'])}),flush=True)
    build=json.loads((NATIVE/'.build/build-manifest.json').read_text())
    record={'schemaVersion':1,'version':'native-p1-boundary-traces-v1','romSha1':ROM_SHA1,'tamalibRevision':build['tamalibRevision'],
            'coreLibrarySha256':build['librarySha256'],'sourceHashes':build['sourceHashes'],
            'scriptHashes':{(NATIVE/name).relative_to(ROOT).as_posix():hashlib.sha256((NATIVE/name).read_bytes()).hexdigest() for name in ['vm.py','caretaker.py','bridge.mjs','probe_boundaries.py']},
            'inputs':'Elapsed32768Hz CPUticks and actual A/B/C pins only; no RAM writes or forced stages',
            'watchpoint':'Stop after the actual CPU instruction that changes the selected RAM cell',
            'probes':probes,'wallSeconds':time.perf_counter()-start}
    out=ROOT/'data/retro-reference/research/native-p1-boundary-traces-v1.json'
    out.write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({'file':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'wallSeconds':record['wallSeconds']}),flush=True)

if __name__=='__main__':main()

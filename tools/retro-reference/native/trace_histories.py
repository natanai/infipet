"""Real A/B/C care witnesses for original P1 history-distinct evolution routes."""
from concurrent.futures import ProcessPoolExecutor,as_completed
from pathlib import Path
import argparse,hashlib,json,time
from vm import NativeP1,NATIVE,ROOT,ROM_SHA1
from caretaker import Caretaker

OUT=ROOT/'data/retro-reference/research/native-p1-history-traces-v1'
RULES=json.loads((ROOT/'data/retro-reference/native-rules-v1.json').read_text())
CASES=RULES['editions'][0]['evolution']['historyPaths']
NAMES=['egg','babytchi','marutchi','tamatchi','kuchitamatchi','mametchi','ginjirotchi','maskutchi','kuchipatchi','nyorotchi','tarakotchi','bill']

def scripts():
    files=[NATIVE/name for name in ['native_core.c','bridge.mjs','vm.py','caretaker.py','trace_histories.py','build.py']]
    return {p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}

def run_case(case):
    started=time.perf_counter();pet=NativeP1();pet.set_initial_clock();w=case['witnessCounters']
    child=w['atTeenCommit'];teen=w['atAdultCommit']
    bot=Caretaker(pet,(child['careMistakes'],child['missedDisciplineCalls']),(teen['careMistakes'],teen['missedDisciplineCalls']))
    checkpoints=[];seen=set();expected_final=case['characters'][-1]
    deadline=pet.seconds+14*86400
    while pet.seconds<deadline:
        state=bot.observe();index=state['characterIndex']
        if index>0 and state['lifecycleRemainingAwakeMinutes']>0 and index not in seen:
            seen.add(index);frame=pet.frame()
            checkpoint={**state,'characterId':'p1.'+NAMES[index],
                'lcdRows':[''.join('#' if frame[y*32+x] else '.' for x in range(32)) for y in range(16)]}
            checkpoints.append(checkpoint)
            print(json.dumps({'route':case['id'],'stage':checkpoint['characterId'],'kind':state['historyKind'],
                'nativeCounters':[state['careMistakes'],state['missedDisciplineCalls']],
                'caretakerOmissions':[bot.omitted_need_calls,bot.omitted_discipline_calls],
                'day':round(pet.seconds/86400,3)}),flush=True)
            if index>=5:
                if checkpoint['characterId']==expected_final:break
                if state['historyKind']!=6:break
        if index==0 and state['age']>0:break
        bot.tick(step=120 if state['asleep'] else 15 if index<=1 else 30)
    final=pet.state();actual=[c['characterId'] for c in checkpoints]
    teen_checkpoint=next((c for c in checkpoints if c['characterIndex'] in [3,4]),None)
    adult_checkpoint=next((c for c in checkpoints if c['characterIndex'] in range(5,11)),None)
    accepted=actual==case['characters'] and teen_checkpoint and adult_checkpoint and \
        teen_checkpoint['historyKind']==case['teenHistoryKind'] and adult_checkpoint['historyKind']==case['adultHistoryKind']
    build=json.loads((NATIVE/'.build/build-manifest.json').read_text())
    record={'schemaVersion':1,'version':'native-p1-history-trace-v1','caseId':case['id'],'romSha1':ROM_SHA1,
        'tamalibRevision':build['tamalibRevision'],'coreLibrarySha256':build['librarySha256'],'scriptHashes':scripts(),
        'policy':{'version':'visible-timed-omissions-v1','childCumulativeOmissions':list(bot.child_goal),'teenCumulativeOmissions':list(bot.teen_goal),
            'inputVisibility':'Current heart meters,attention icon,sleep,lights,illness,waste,current visible form; own timed omission diary',
            'prohibitedInputsUnused':['native care/missed counters','native history kind','game answer','RNG state','future character or sprite'],
            'falseCallDelaySeconds':20,'omissionWaitSeconds':900,'precautionaryScoldWhileIntentionallyHungrySeconds':480,
            'routine':'Meet discipline-omission goal with full hearts, then omit hunger calls15minutes and feed one meal; keep happiness full; clean,treat illness,turn lights off during sleep'},
        'expectedHistory':case,'actualCharacters':actual,'checkpoints':checkpoints,'finalState':final,
        'predicateAndHistoryAccepted':bool(accepted),'ordinaryCommandsOnly':True,'replayedFromReset':False,
        'actions':pet.actions,'careRequests':bot.requests,'observations':bot.observations,
        'finalTick':pet.ticks,'finalSnapshotSha256':hashlib.sha256(pet.save()).hexdigest(),'wallSeconds':time.perf_counter()-started}
    OUT.mkdir(parents=True,exist_ok=True);file=OUT/(case['id']+'.json');file.write_text(json.dumps(record,indent=2)+'\n')
    pet.close()
    summary={'caseId':case['id'],'accepted':bool(accepted),'actual':actual,'file':file.relative_to(ROOT).as_posix(),
             'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'wallSeconds':record['wallSeconds']}
    print(json.dumps({'complete':summary}),flush=True)
    return summary

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--route');parser.add_argument('--all',action='store_true');parser.add_argument('--workers',type=int,default=2)
    args=parser.parse_args();selected=CASES if args.all else [c for c in CASES if c['id']==(args.route or 'p1.kind-2.mametchi')]
    if not selected:raise SystemExit('Unknown native P1 route')
    summaries=[]
    if args.workers==1 or len(selected)==1:
        for case in selected:summaries.append(run_case(case))
    else:
        with ProcessPoolExecutor(max_workers=args.workers) as pool:
            jobs={pool.submit(run_case,c):c['id'] for c in selected}
            for future in as_completed(jobs):summaries.append(future.result())
    manifest={'version':'native-p1-history-traces-v1','romSha1':ROM_SHA1,'scriptHashes':scripts(),
        'cases':sorted(summaries,key=lambda r:r['caseId']),'ordinaryCommandHistoriesAccepted':sum(r['accepted'] for r in summaries),
        'freshReplayVerificationRequired':True}
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'cases':len(summaries),'accepted':manifest['ordinaryCommandHistoriesAccepted']}),flush=True)

if __name__=='__main__':main()

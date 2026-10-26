"""Decode original P1 rule tables from the archived, hash-identified disassembly.

No firmware is executed or written. Published source opcodes are reconstructed in
memory only to identify the exact edition; game-engine inputs never use them.
"""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re
import zlib

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "retro-reference"
SOURCE = OUT / "sources/tamagotchi/p1-disassembly.asm"
P1_NAMES = ["egg", "babytchi", "marutchi", "tamatchi", "kuchitamatchi", "mametchi", "ginjirotchi", "maskutchi", "kuchipatchi", "nyorotchi", "tarakotchi", "bill"]
P1_SHA1 = "4b4979cf92dc9d2fb6d7295a38f209f3da144f72"
EVOLUTION_TABLES = [0xD9C,0xD9E,0xDA6,0xDB2,0xDBA,0xDC0,0xDC4]
ASM_URL = "https://github.com/agg23/tamagotchi-disassembled/blob/master/tama.asm"

def parse_source():
    source = SOURCE.read_text()
    words={int(m[1],16):int(m[2],16) for m in re.finditer(r"//\s*(0x[0-9a-f]+)\s+\((0x[0-9a-f]+)\)",source,re.I)}
    assert len(words)==0x1800 and set(words)==set(range(0x1800))
    payload=b"".join(words[a].to_bytes(2,"big") for a in range(0x1800))
    assert hashlib.sha1(payload).hexdigest()==P1_SHA1
    assert zlib.crc32(payload)==0x5C864CB1
    instructions={}
    for line in source.splitlines():
        m=re.match(r"\s*(\w+)\s*(.*?)\s*//\s*(0x[0-9a-f]+)\s+\((0x[0-9a-f]+)\)",line,re.I)
        if m:instructions[int(m[3],16)]={"op":m[1],"operands":m[2].strip(),"word":int(m[4],16)}
    return source,words,instructions

def constants(instructions,start):
    values=[]
    address=start
    while True:
        instruction=instructions[address]
        assert instruction["op"] in ["lbpx","retd"], (hex(address),instruction)
        values.append(instruction["word"]&0xFF)
        if instruction["op"]=="retd":return values
        address+=1

def decode_evolution(instructions):
    tables=[]
    for kind,start in enumerate(EVOLUTION_TABLES):
        values=constants(instructions,start)
        assert len(values)%2==0
        rules=[]
        for i in range(0,len(values),2):
            limits,outcome=values[i:i+2]
            rules.append({"order":i//2,"sourceWords":[hex(start+i),hex(start+i+1)],
                "predicate":{"all":[{"metric":"careMistakes","op":"gte","value":limits&15},
                                    {"metric":"missedDisciplineCalls","op":"gte","value":limits>>4}]},
                "outcome":{"characterId":"p1."+P1_NAMES[outcome>>4],"historyKind":outcome&15}})
        assert rules[-1]["predicate"]["all"][0]["value"]==rules[-1]["predicate"]["all"][1]["value"]==0
        tables.append({"historyKind":kind,"sourceAddress":hex(start),"selection":"first matching rule in source order","rules":rules})
    return tables

def select(tables,kind,care,missed):
    for rule in tables[kind]["rules"]:
        a,b=rule["predicate"]["all"]
        if care>=a["value"] and missed>=b["value"]:return rule["outcome"]
    raise AssertionError("Missing final fallback")

def decode_statistics(words,instructions):
    rows=[]
    for index in range(1,12):
        jump=0x1558+index
        start=0x1500+(words[jump]&0xFF)
        raw=constants(instructions,start)
        assert len(raw)==13
        rows.append({"characterId":"p1."+P1_NAMES[index],"characterIndex":index,
            "jumpAddress":hex(jump),"vectorAddress":hex(start),"rawHex":" ".join(f"{b:02x}" for b in raw),
            "wakeHour":None if raw[0]==255 else raw[0],"sleepHour":None if raw[1]==255 else raw[1],
            "baseHungerLossMinutes":raw[2],"baseHappinessLossMinutes":raw[3],
            "baseSicknessCountdownMinutes":raw[4]+((raw[5]&15)<<8),
            "medicineParameterNibble":raw[5]>>4,
            "minimumWeightBCD":f"{raw[6]:02x}","maximumWeightBCD":f"{raw[7]:02x}",
            "baseLifecycleCountdownAwakeMinutes":raw[8]+((raw[9]&15)<<8),
            "disciplineCountdownHeartLosses":None if raw[9]>>4==15 else raw[9]>>4,
            "initialDisciplineNibble":raw[10]&15,"gameLossCarryBiasNibble":raw[10]>>4,
            "gameWinInputDelayIterations":raw[11]&15,"gameLossInputDelayIterations":raw[11]>>4,
            "twoBiteMealFlag":bool(raw[12]&1),
            "interpretationEvidence":{"raw":"hash-identified ROM vector","fields":"primary research notes at RAM0x230-0x249, independently checked against vector layout"}})
    assert rows[4]["vectorAddress"]==rows[10]["vectorAddress"], "Bill shares Mametchi physiology vector"
    assert [r["baseLifecycleCountdownAwakeMinutes"] for r in rows[:4]]==[60,1380,2220,1380]
    return rows

def enumerate_history_paths(tables):
    paths={}
    # Monotone counter reachability is necessary, not a substitute for a replay
    # showing that real calls can produce these values within the native timers.
    for child_care in range(16):
        for child_missed in range(16):
            teen=select(tables,1,child_care,child_missed)
            for adult_care in range(child_care,16):
                for adult_missed in range(child_missed,16):
                    adult=select(tables,teen["historyKind"],adult_care,adult_missed)
                    key=(teen["historyKind"],adult["characterId"],adult["historyKind"])
                    path=["p1.babytchi","p1.marutchi",teen["characterId"],adult["characterId"]]
                    if adult["historyKind"]==6:path.append("p1.bill")
                    candidate={"id":f"p1.kind-{teen['historyKind']}.{adult['characterId'].split('.')[1]}",
                        "characters":path,"teenHistoryKind":teen["historyKind"],"adultHistoryKind":adult["historyKind"],
                        "witnessCounters":{"atTeenCommit":{"careMistakes":child_care,"missedDisciplineCalls":child_missed},
                                           "atAdultCommit":{"careMistakes":adult_care,"missedDisciplineCalls":adult_missed}},
                        "monotoneCounterReachable":True,"ordinaryCommandTraceVerified":False}
                    previous=paths.get(key)
                    score=(adult_care+adult_missed,child_care+child_missed,adult_care,child_care)
                    if previous is None or score<previous[0]:paths[key]=(score,candidate)
    result=[value[1] for _,value in sorted(paths.items())]
    assert len(result)==14
    assert Counter(p["teenHistoryKind"] for p in result)=={2:6,3:3,4:3,5:2}
    return result

def main():
    source,words,instructions=parse_source()
    tables=decode_evolution(instructions)
    for kind in range(7):
        for care in range(16):
            for missed in range(16):select(tables,kind,care,missed)
    rules={"schemaVersion":1,"version":"original-native-rules-v1","referenceOnly":True,"retrievedOn":"2026-10-25",
        "editions":[{"id":"p1-world-5c864cb1","deviceId":"p1","region":"World","year":1997,"romBytes":12288,"romSha1":P1_SHA1,"romCrc32":"5c864cb1",
            "evidence":{"disassemblyUrl":ASM_URL,"sourceSha256":hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                        "identityMethod":"6144 complete source instruction words reconstructed in memory as big-endian16-bit words; SHA1 and CRC32 match pinned MAME World set",
                        "mameSource":"research/mame/hh_e0c6200.cpp","mameRevision":"774a180df2b6ef9c53e48337792256817c50f768"},
            "evolution":{"selectorAddresses":["0x354-0x36c","0xdc6-0xdd1"],"counterInputAddresses":{"careMistakes":"0x042","missedDisciplineCalls":"0x051","historyKind":"0x050"},
                "disciplineDisplayIsSelectorInput":False,"counterRange":[0,15],"counterSaturationAddresses":["0xfe8-0xfea"],
                "careCounterPersistsAfterAdult":True,"adultFatalCareCounterAddress":"0x04f",
                "counterResetAtEvolution":False,"evolutionResetAddresses":["0xdd4-0xdd5","0xdf4-0xdfd"],
                "resetExplanation":"Evolution resets sickness count0x049 and display discipline0x043; it does not reset0x042/0x051. Types2/4 set display discipline to8, independent of the selection counters.",
                "historyKindTables":tables,"historyPaths":enumerate_history_paths(tables),
                "unreachableLatentRules":[{"historyKind":3,"outcome":"p1.ginjirotchi","reason":"Table accepts missedDisciplineCalls<2, but entering kind3 already requires>=3 and the counter cannot decrease."}],
                "secret":{"from":"p1.maskutchi","to":"p1.bill","requiredHistoryKind":6,"committedBy":{"teenHistoryKind":3,"adultOutcome":"p1.maskutchi"},
                    "displayDisciplineRequirement":None,"subsequentCareSelectsDifferentBranch":False,"requiresSurvival":True,
                    "nativeCountdownAwakeMinutes":2880,"eventPriorityAddresses":"0xf5b-0xf7d","notes":"Death predicates run before an expired lifecycle timer is dispatched.48awakehours correspond to4 ordinary12-hour Maskutchi days; clock manipulation changes chronological duration."}},
            "nativeStatistics":decode_statistics(words,instructions),
            "nativeClock":{"tickUnit":"minute","maturationCoordinate":"awake clock minutes","sicknessPausesLifecycleCountdown":False,
                "sleepBranchAddresses":"0xc82-0xc95","awakeBranchAddresses":"0xc96-0xcc7","lifecycleDecrementAddresses":"0xcc7-0xcd1",
                "ageDisplayCoordinate":"number of wake events, BCD, capped99","ageIncrementAddresses":"0xf1d-0xf29",
                "terminalAdultTimerMeaning":"For historyKind15, expiry sets0x04e; it is not itself an unconditional death event.",
                "babyNapReportedMinutes":5,"babyNapEvidence":"primary research RAM0x215/0x216 notes; original65minute baby observation is60awake countdown+5minute nap",
                "boundaryGap":"Exact sub-minute call/timer dispatch phase still requires repeatable emulator or device traces; raw countdown values are not silently rounded into chronological ages."},
            "careCallBoundaries":{"hungerOrHappiness":{"timerAddress":"0x208","targetNibble":15,"checkAddresses":"0xfc6-0xfcc","elapsedMinutes":None},
                "missedDiscipline":{"timerAddress":"0x209","targetNibble":15,"checkAddresses":"0xfcd-0xfd2","elapsedMinutes":None},
                "sleepLights":{"timerAddresses":["0x204","0x205"],"triggerHighNibbleMinimum":4,"counterCountsAtThreshold":64,"checkAddresses":"0xf35-0xf3b","elapsedMinutes":None},
                "gap":"Published reports differ by one minute(14/15 and64/65).Initialization and scheduler phase must be traced before certifying wall-clock boundaries."}},
            {"id":"p2-japan-9f97539e","deviceId":"p2","region":"Japan","year":1997,"romBytes":12288,"romSha1":"09e5101b37636a314fc599d5d69b4846721b3c88","romCrc32":"9f97539e",
             "status":"primary identity known; no local original P2 firmware/disassembly or independently reproduced traces",
             "mameEvidence":"research/mame/hh_e0c6200.cpp:SYST(tamag2)",
             "publishedExperimentClaim":{"repository":"https://github.com/Sagestum/tamagotchi-carebot","revision":"1ee8f6f1dce394cc88a4cd193dbb0e05793fc66a","claim":"Same counter tables asP1","status":"reported, not independently reproduced; model names conflict with region evidence"},
             "englishBaselineCertification":False},
            {"id":"p2-english-original-unresolved","deviceId":"p2","region":"English international","year":1997,"romSha1":None,
             "status":"No primary edition-identified firmware or repeatable complete device trace located; all11 atlas morphology targets remain provisional.",
             "careHistoryPredicates":None,"nativeTimingConstants":None,"completeTransitionGraphCertified":False}],
        "validation":{"p1SelectorStatesCovered":7*16*16,"p1MonotoneHistoryPaths":14,"ordinaryCommandPathsCertified":0},
        "gaps":["EnglishP2 edition identity and complete native predicates/timings remain unverified; Japan-only claims cannot be relabeled as English.",
                "A monotone counter witness proves numerical reachability only; native call opportunities and ordinary commands must be replayed for each history path.",
                "P1 exact elapsed attention-window boundaries need event-phase traces.",
                "Community atlas alone cannot certify originalP2 pixel or animation identity."]}
    dest=OUT/"native-rules-v1.json"
    dest.write_text(json.dumps(rules,indent=2)+"\n",encoding="utf8")
    print(json.dumps(rules["validation"]))

if __name__=="__main__":main()

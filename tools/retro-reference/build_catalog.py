"""Build an audit-only roster and lossless monochrome reference targets."""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import math
import re

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "retro-reference"
HUMULOS = "https://humulos.com/digimon/dm/"
P1_RESEARCH = "https://rhubarbtart.neocities.org/p1hackinglog"
TAMA_OBSERVER = "https://www.mimitchi.com/html/q2.htm"
ARCHIVE = "https://www.spriters-resource.com/lcd_handhelds/tamagotchioriginalp1p2/page-1/"
P1_ASM = "https://github.com/agg23/tamagotchi-disassembled/blob/master/tama.asm"
# Character index at RAM 0x05D is documented by the primary research notes.
# Offsets select coherent upper/lower pairs through the original C00/D00 tables.
# The shared bitmaps are deliberate; comments naming a bitmap alone are insufficient
# to identify its complete character or pair. No half is joined by visual guessing.
P1_POSES = {"babytchi":(1,5), "marutchi":(2,5), "tamatchi":(3,3),
            "kuchitamatchi":(4,0), "mametchi":(5,0), "ginjirotchi":(6,0),
            "maskutchi":(7,0), "kuchipatchi":(8,0), "nyorotchi":(9,0),
            "tarakotchi":(10,0), "bill":(11,0)}

DIGIMON = [
    ("botamon", "Botamon", "baby", "hatchling", "bota"),
    ("koromon", "Koromon", "child", "infant", "koro"),
    ("agumon", "Agumon", "teen", "juvenile", "agu"),
    ("betamon", "Betamon", "teen", "juvenile", "beta"),
    ("greymon", "Greymon", "adult", "adult", "grey"),
    ("devimon", "Devimon", "adult", "adult", "devi"),
    ("airdramon", "Airdramon", "adult", "adult", "airdra"),
    ("numemon", "Numemon", "adult", "adult", "nume"),
    ("tyranomon", "Tyranomon", "adult", "adult", "tyrano"),
    ("meramon", "Meramon", "adult", "adult", "mera"),
    ("seadramon", "Seadramon", "adult", "adult", "seadra"),
    ("metal-greymon", "Metal Greymon", "advanced", "advanced", "metalgrey_vi"),
    ("monzaemon", "Monzaemon", "advanced", "advanced", "monzae"),
    ("mamemon", "Mamemon", "advanced", "advanced", "mame"),
]
P1 = [
    ("babytchi", "Babytchi", "baby", "hatchling"), ("marutchi", "Marutchi", "child", "infant"),
    ("tamatchi", "Tamatchi", "teen", "juvenile"), ("kuchitamatchi", "Kuchitamatchi", "teen", "juvenile"),
    ("mametchi", "Mametchi", "adult", "adult"), ("ginjirotchi", "Ginjirotchi", "adult", "adult"),
    ("maskutchi", "Maskutchi", "adult", "adult"), ("kuchipatchi", "Kuchipatchi", "adult", "adult"),
    ("nyorotchi", "Nyorotchi", "adult", "adult"), ("tarakotchi", "Tarakotchi", "adult", "adult"),
    ("bill", "Bill", "advanced", "advanced"),
]
P2 = [
    ("shirobabytchi", "Shirobabytchi", "baby", "hatchling"), ("tonmarutchi", "Tonmarutchi", "child", "infant"),
    ("tongaritchi", "Tongaritchi", "teen", "juvenile"), ("hashitamatchi", "Hashitamatchi", "teen", "juvenile"),
    ("mimitchi", "Mimitchi", "adult", "adult"), ("pochitchi", "Pochitchi", "adult", "adult"),
    ("zuccitchi", "Zuccitchi", "adult", "adult"), ("hashizoutchi", "Hashizoutchi", "adult", "adult"),
    ("takotchi", "Takotchi", "adult", "adult"), ("kusatchi", "Kusatchi", "adult", "adult"),
    ("zatchi", "Zatchi", "advanced", "advanced"),
]

def digest(file): return hashlib.sha256(file.read_bytes()).hexdigest()

def read_p1_target(short):
    if short not in P1_POSES: return None, None
    file = OUT / "sources" / "tamagotchi" / "p1-disassembly.asm"
    lines = file.read_text().splitlines()
    constants = {}
    for line in lines:
        m = re.search(r"(?:lbpx\s+mx,|retd)\s+(0x[0-9a-f]+).*//\s*(0x[0-9a-f]+)", line, re.I)
        if m: constants[int(m[2],16)] = int(m[1],16)
    rows, parts = [], []
    character_index, animation_offset = P1_POSES[short]
    for table_base in (0xC00,0xD00):
        index_address = table_base + character_index
        selection_address = table_base + constants[index_address] + animation_offset
        selection = constants[selection_address]
        # The render routine at 0x94F masks the mirror bit, adds 3 to the
        # bitmap index and skips indices >= 0x80. The asset jump table at
        # 0x1000 multiplies the remaining index by 16 instructions.
        bitmap_index = (selection & 0x7F) + 3
        part = {"tableBase":hex(table_base), "indexAddress":hex(index_address),
                "selectionAddress":hex(selection_address), "selectionByte":hex(selection),
                "horizontalMirror":bool(selection & 0x80)}
        if bitmap_index >= 0x80:
            part["omitted"] = True
            parts.append(part)
            continue
        address = 0x1000 + bitmap_index*16
        # RetD contains the final byte, just as the primary researcher's rip.py
        # explains. Constants are columns, with the low bit at the top of the LCD.
        values = [constants[address+i] for i in range(16)]
        if selection & 0x80: values.reverse()
        rows.extend("".join("#" if value & (1<<y) else "." for value in values) for y in range(8))
        part.update({"address":hex(address), "columns":16})
        parts.append(part)
    target = {"width":16, "height":len(rows), "rows":rows, "ink":"#", "empty":".",
              "interpretation":"set LCD pixels; coherent complete pose selected by original upper/lower animation tables", "frame":0}
    sprite = {"available":True, "file":str(file.relative_to(ROOT)).replace("\\","/"),
              "sha256":digest(file), "sourceUrl":P1_ASM, "sourceParts":parts,
              "characterIndex":character_index, "animationTableOffset":animation_offset,
              "selectionRoutineAddresses":["0x928-0x938","0x939-0x948","0x94f-0x97e"],
              "verification":"original P1 ROM constants and character-indexed animation-table pairing from published disassembly; pixel extraction reproduced statically; not independently hardware-traced"}
    return target, sprite

def read_p2_target(short):
    poses=json.loads((Path(__file__).parent/"p2-atlas-poses.json").read_text())
    pose=poses[short]
    file=OUT/"sources"/"tamagotchi"/(str(pose["assetId"])+".png")
    if not file.exists(): return None,None
    image=Image.open(file).convert("RGBA").crop(tuple(pose["crop"]))
    rows=["".join("#" if image.getpixel((x,y))[3] and max(image.getpixel((x,y))[:3])<64 else "." for x in range(image.width)) for y in range(image.height)]
    target={"width":image.width,"height":image.height,"rows":rows,"ink":"#","empty":".","frame":0,
            "interpretation":"Observed black LCD-style pixels from community atlas; original P2 edition is unverified"}
    entry=next(e for e in json.loads((OUT/"browser-source-manifest.json").read_text())["files"] if e["file"]==str(file.relative_to(ROOT)).replace("\\","/"))
    x0,y0,x1,y1=pose["crop"]
    sprite={"available":True,"file":str(file.relative_to(ROOT)).replace("\\","/"),"sha256":digest(file),"sourceUrl":entry["url"],
            "sourcePage":entry["sourcePage"],"assetId":pose["assetId"],"sourceCrop":{"x":x0,"y":y0,"width":x1-x0,"height":y1-y0},
            "pose":pose["pose"],"referenceStatus":"provisional",
            "verification":"Observed public community atlas; original P2 versus rerelease firmware edition unresolved; cannot certify original-device morphology"}
    return target,sprite

def read_dm_target(code):
    file = OUT / "sources" / "digimon" / (code + ".gif")
    if not file.exists(): return None, {"available": False, "reason": "Source asset unavailable."}
    im = Image.open(file).convert("RGBA")
    if im.size != (36, 36): raise ValueError("Unexpected source sprite dimensions")
    # The public chart's 36x36 view is an exact 2x display of a 16x16 LCD plus 1-cell border.
    crop = im.crop((2, 2, 34, 34))
    rows = []
    for y in range(16):
        row = ""
        for x in range(16):
            block = [crop.getpixel((x*2+dx,y*2+dy)) for dy in range(2) for dx in range(2)]
            if len(set(block)) != 1: raise ValueError("Sprite is not a lossless 2x LCD grid")
            row += "#" if block[0][3] and max(block[0][:3]) < 128 else "."
        rows.append(row)
    target = {"width": 16, "height": 16, "rows": rows, "ink": "#", "empty": ".",
              "interpretation": "set LCD pixels; holes remain unset", "frame": 0}
    sprite = {"available": True, "file": str(file.relative_to(ROOT)).replace("\\", "/"),
              "sha256": digest(file), "sourceUrl": "https://humulos.com/digimon/images/dot/dm/" + code + ".gif",
              "sourceCrop": {"x": 2, "y": 2, "width": 32, "height": 32}, "integerReduction": 2,
              "verification": "community original-device chart; pixels checked for exact integer scale; not independently ROM-verified"}
    return target, sprite

def main():
    chars, edges = [], []
    for short, name, stage, game, code in DIGIMON:
        target, sprite = read_dm_target(code)
        sprite["referenceStatus"]="community-extracted-reference"
        chars.append({"id": "dm1."+short, "deviceId": "dm1", "name": name, "stage": stage,"targetStatus":"community-extracted-reference",
                      "gameStage": game, "root": short == "botamon", "target": target, "sprite": sprite,
                      "rosterEvidence": {"url": HUMULOS, "kind": "original-device community chart", "confidence": "corroborated-community"}})
    assets = {a["name"].lower(): a for a in json.loads((Path(__file__).parent/"tamagotchi-assets.json").read_text())}
    for device, forms in [("p1", P1), ("p2", P2)]:
        for index, (short, name, stage, game) in enumerate(forms):
            asset = assets.get(name.lower()) or (assets.get("bill/gaijintchi") if short == "bill" else None)
            target, sprite = read_p1_target(short) if device == "p1" else read_p2_target(short)
            sprite = sprite or {"available": False, "reason": "Public sprite archive rejected HTTP download; this character has no safely verified complete named pose in the archived primary source.", "sourceUrl": asset["page"] if asset else ARCHIVE, "assetId": asset["assetId"] if asset else None}
            status=("observed" if device=="p1" else "provisional") if target else "unavailable"
            sprite["referenceStatus"]=status
            chars.append({"id": device+"."+short, "deviceId": device, "name": name, "stage": stage,"targetStatus":status,
                          "gameStage": game, "root": index == 0, "target": target,
                          "sprite": sprite,
                          "rosterEvidence": {"url": P1_RESEARCH if device == "p1" else TAMA_OBSERVER,
                                             "kind": "primary-ROM character index" if device == "p1" else "firsthand vintage-device observer", "confidence": "primary-research" if device == "p1" else "observational"}})
    def edge(device, a, b, hint, evidence, status="observational-canonical-path"):
        edges.append({"deviceId":device,"from":device+"."+a,"to":device+"."+b,"careHint":hint,"evidence":{"url":evidence,"status":status},"eligibilityStatus":"not-a-certified-hardware-predicate"})
    edge("dm1","botamon","koromon","Normal early maturation",HUMULOS)
    for rookie in ["agumon","betamon"]: edge("dm1","koromon",rookie,"Care-dependent juvenile branch",HUMULOS)
    for a, bs in {"agumon":["greymon","devimon","tyranomon","meramon","numemon"],"betamon":["devimon","airdramon","meramon","seadramon","numemon"]}.items():
        for b in bs: edge("dm1",a,b,"Care, training, overfeeding and sleep-disturbance conditions; see pinned gameplay reference slots",HUMULOS)
    for a, b in {"greymon":"metal-greymon","devimon":"metal-greymon","airdramon":"metal-greymon","tyranomon":"mamemon","meramon":"mamemon","seadramon":"mamemon","numemon":"monzaemon"}.items():
        edge("dm1",a,b,"Advanced battle gate; original random eligibility remains uncertain",HUMULOS)
    for device, forms in [("p1",P1),("p2",P2)]:
        edge(device,forms[0][0],forms[1][0],"Normal early maturation",P1_RESEARCH if device=="p1" else TAMA_OBSERVER)
        for teen in forms[2:4]: edge(device,forms[1][0],teen[0],"Care-dependent teen branch",P1_RESEARCH if device=="p1" else TAMA_OBSERVER)
        for teen, adults in [(forms[2], forms[4:7]),(forms[3],forms[7:10])]:
            for adult in adults: edge(device,teen[0],adult[0],"Canonical pictured care route; A/B chart variants and cross-care routes require further verification",TAMA_OBSERVER,"provisional-canonical-path")
        edge(device,forms[6][0],forms[10][0],"Secret adult after sustained appropriate adult care",P1_RESEARCH if device=="p1" else TAMA_OBSERVER,"primary-research-parent" if device=="p1" else "provisional-canonical-path")
    for adult in ["kuchipatchi","nyorotchi","tarakotchi"]:
        edge("p1","tamatchi",adult,"Original P1 reverse-engineered cross-care route; eligibility depends on type-1/type-2 teen history",P1_RESEARCH,"primary-research-reported-predicate")
    p1_variants = [
        {"from":"marutchi","variant":"type-1","to":"tamatchi","careMistakes":"<3","disciplineMistakes":"<3"},
        {"from":"marutchi","variant":"type-2","to":"tamatchi","careMistakes":"<3","disciplineMistakes":">=3"},
        {"from":"marutchi","variant":"type-1","to":"kuchitamatchi","careMistakes":">=3","disciplineMistakes":"<3"},
        {"from":"marutchi","variant":"type-2","to":"kuchitamatchi","careMistakes":">=3","disciplineMistakes":">=3"},
    ]
    for teen, variant, outcomes in [
        ("tamatchi","type-1",[("mametchi","<3","0"),("ginjirotchi","<3","1"),("maskutchi","<3",">=2"),("kuchipatchi",">=3","<2"),("nyorotchi",">=3",">=2 and <4"),("tarakotchi",">=3",">=4")]),
        ("tamatchi","type-2",[("ginjirotchi","<4","<2"),("maskutchi","<4",">=2"),("nyorotchi",">=4","<8"),("tarakotchi",">=4",">=8")]),
        ("kuchitamatchi","type-1",[("kuchipatchi","any","<2"),("nyorotchi","any","2"),("tarakotchi","any",">=3")]),
        ("kuchitamatchi","type-2",[("nyorotchi","any","<6"),("tarakotchi","any",">=6")]),
    ]:
        for adult, care, discipline in outcomes:
            p1_variants.append({"from":teen,"sourceVariant":variant,"to":adult,"careMistakes":care,"disciplineMistakes":discipline,
                                "secretEligible":adult=="maskutchi" and variant=="type-2"})
    devices = [{"id":d,"name":n,"edition":e,"rootCharacterId":d+"."+fs[0][0],"characterIds":[d+"."+f[0] for f in fs]} for d,n,e,fs in [
        ("dm1","Digital Monster Version 1","1997 international original virtual pet",DIGIMON),
        ("p1","Tamagotchi P1","1997 English international original; Bill secret form",P1),
        ("p2","Tamagotchi P2","1997 English international original; Pochitchi/Zatchi variant",P2)]]
    catalog={"schemaVersion":1,"version":"retro-reference-v2","retrievedOn":"2026-10-25","referenceOnly":True,"devices":devices,"characters":chars,"edges":edges,
             "routeEligibility":[{"deviceId":"p1","sourceUrl":"https://rhubarbtart.neocities.org/file/tama_notes.txt","status":"primary-research-reported; not independent device-trace certification","counterScope":"Researcher reports no reset evidence before adulthood; later adult care counter is separate.","variants":p1_variants},
                                 {"deviceId":"p2","status":"canonical pictorial routes only; firmware-complete variants and predicates unresolved"},
                                 {"deviceId":"dm1","status":"community original-device graph; numerical predicates and random advanced eligibility must be certified separately"}],
             "coverage":{"forms":len(chars),"formsWithTargets":sum(bool(c["target"]) for c in chars),"provisionalTargets":sum(c["targetStatus"]=="provisional" for c in chars),"nonProvisionalTargets":sum(c["targetStatus"] in ["observed","community-extracted-reference"] for c in chars),"rootFamilies":3},
             "limits":["Reference assets and future-stage bitmaps are evaluation data, never simulation inputs.","P1 route variants are reverse-engineer reports, not independently certified hardware traces; P2 pictured routes remain incomplete.","Unknown image targets must remain unavailable and cannot pass visual similarity gates.","A single selected pose does not establish animation, timing, care-rule or whole-lifecycle fidelity.","Regional variants Oyajitchi, Nyatchi and Sekitoritchi are excluded from the English baseline."]}
    (OUT/"catalog.json").write_text(json.dumps(catalog,indent=2)+"\n",encoding="utf8")
    # A readable index of the genuinely available targets only.
    sheet=Image.new("RGB",(7*112,math.ceil(catalog["coverage"]["formsWithTargets"]/7)*132),"#d8d8d8"); draw=ImageDraw.Draw(sheet)
    for i,c in enumerate([x for x in chars if x["target"]]):
        x=(i%7)*112;y=(i//7)*132
        for yy,row in enumerate(c["target"]["rows"]):
            for xx,v in enumerate(row):
                if v=="#": draw.rectangle((x+xx*6,y+yy*6,x+xx*6+5,y+yy*6+5),fill="black")
        draw.text((x,y+100),c["name"],fill="black")
    sheet.save(OUT/"available-targets.png")
    print(json.dumps(catalog["coverage"]))

if __name__=="__main__":main()

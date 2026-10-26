"""Validate archived reference provenance, complete targets and lifecycle DAGs."""
from pathlib import Path
from collections import Counter, defaultdict
from io import BytesIO
from zipfile import ZipFile
import hashlib
import importlib.util
import json
import re
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "retro-reference"

def main():
    catalog = json.loads((OUT / "catalog.json").read_text())
    chars = {c["id"]: c for c in catalog["characters"]}
    assert len(chars) == len(catalog["characters"]) == 36
    assert Counter(c["deviceId"] for c in chars.values()) == {"dm1":14,"p1":11,"p2":11}
    for c in chars.values():
        target = c["target"]
        assert c["sprite"]["available"] == bool(target), c["id"]
        if target is None: continue
        assert 0 < target["width"] <= 32 and 0 < target["height"] <= 32
        assert len(target["rows"]) == target["height"]
        assert all(len(row)==target["width"] and set(row)<=set("#.") for row in target["rows"])
        assert any("#" in row for row in target["rows"]), c["id"]
        file = ROOT / c["sprite"]["file"]
        assert hashlib.sha256(file.read_bytes()).hexdigest() == c["sprite"]["sha256"], c["id"]
    for item in json.loads((OUT/"source-manifest.json").read_text())["files"]:
        if "file" not in item: continue
        content = (ROOT/item["file"]).read_bytes()
        assert len(content)==item["bytes"]
        assert hashlib.sha256(content).hexdigest()==item["sha256"], item["file"]
    adjacency = defaultdict(list)
    for e in catalog["edges"]:
        assert e["from"] in chars and e["to"] in chars
        assert chars[e["from"]]["deviceId"] == chars[e["to"]]["deviceId"] == e["deviceId"]
        assert e["to"] not in adjacency[e["from"]], e
        adjacency[e["from"]].append(e["to"])
    paths=[]
    def visit(node, path):
        assert node not in path, "Lifecycle graph has a cycle"
        path=path+[node]
        if not adjacency[node]: paths.append(path)
        for child in adjacency[node]: visit(child,path)
    for device in catalog["devices"]: visit(device["rootCharacterId"],[])
    assert set(sum(paths,[])) == set(chars), "Every roster form must be reachable"
    # Independently compare relevant disassembly columns against the primary
    # researcher's already-extracted PNG pieces, without using build_catalog.
    asm=(OUT/"sources/tamagotchi/p1-disassembly.asm").read_text()
    constants={int(m[2],16):int(m[1],16) for m in re.finditer(r"(?:lbpx\s+mx,|retd)\s+(0x[0-9a-f]+).*//\s*(0x[0-9a-f]+)",asm,re.I)}
    comparisons=0
    with ZipFile(OUT/"sources/tamagotchi/p1-rom-sprites.zip") as archive:
        for c in chars.values():
            if c["deviceId"]!="p1": continue
            for part in c["sprite"]["sourceParts"]:
                if part.get("omitted"): continue
                address=int(part["address"],16)
                name="sprites/tama_"+hex(address+15)+".png"
                if name not in archive.namelist(): continue
                image=Image.open(BytesIO(archive.read(name))).convert("RGB")
                assert image.size==(16,8)
                for x in range(16):
                    for y in range(8):
                        expected=(255,255,100) if constants[address+x]&(1<<y) else (0,0,100)
                        assert image.getpixel((x,y))==expected, (c["id"],name,x,y)
                comparisons+=1
    assert comparisons>=10, "Missing independent primary sprite comparisons"
    # Rebuild in memory; exact source-derived pixels must agree with the catalog.
    spec=importlib.util.spec_from_file_location("build_catalog",Path(__file__).with_name("build_catalog.py"))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    for c in chars.values():
        if c["deviceId"]=="p1":
            target,_=module.read_p1_target(c["id"].split(".")[1])
            assert target==c["target"],c["id"]
    print(json.dumps({"forms":len(chars),"targets":sum(bool(c["target"]) for c in chars.values()),
                      "graphRootToTerminalPaths":len(paths),"pathsWithAllTargets":sum(all(chars[n]["target"] for n in path) for path in paths),
                      "independentP1PieceComparisons":comparisons,"status":"passed"}))

if __name__=="__main__": main()

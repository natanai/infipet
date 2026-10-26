"""Fetch public, linked reference assets for offline evaluation, never runtime use."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import re
import urllib.request
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "retro-reference"
RAW = OUT / "sources"
RAW.mkdir(parents=True, exist_ok=True)

def fetch(url, filename):
    target = RAW / filename
    req = urllib.request.Request(url, headers={"User-Agent": "Infipet-reference-benchmark/1.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        payload = response.read()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)
    return {"file": str(target.relative_to(ROOT)).replace("\\", "/"), "url": url,
            "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest(),
            "license": "No license to source graphics inferred; see docs/retro-reference-sources.md"}

def main():
    pages = [
        ("https://humulos.com/digimon/dm/", "digital-monster-1997.html"),
        ("https://www.spriters-resource.com/lcd_handhelds/tamagotchioriginalp1p2/page-1/", "tamagotchi-sheets.html"),
        ("https://rhubarbtart.neocities.org/file/tama_notes.txt", "p1-rom-notes.txt"),
        ("https://rhubarbtart.neocities.org/file/stats.txt", "p1-rom-stats.txt"),
        ("https://rhubarbtart.neocities.org/p1hackinglog", "p1-hacking-log.html"),
        ("https://rhubarbtart.neocities.org/file/sprites.zip", "tamagotchi/p1-rom-sprites.zip"),
        ("https://rhubarbtart.neocities.org/file/rip.py", "tamagotchi/rip.py"),
        ("https://raw.githubusercontent.com/agg23/tamagotchi-disassembled/master/tama.asm", "tamagotchi/p1-disassembly.asm"),
        ("https://raw.githubusercontent.com/agg23/tamagotchi-disassembled/master/README.md", "tamagotchi/p1-disassembly-README.md"),
        ("https://www.mimitchi.com/html/q2.htm", "tamagotchi/vintage-firsthand-roster.html"),
    ]
    manifest = []
    for url, filename in pages:
        try: manifest.append(fetch(url, filename))
        except Exception as error: manifest.append({"url":url,"unavailable":str(error)})
    if (RAW / "digital-monster-1997.html").exists():
        html = (RAW / "digital-monster-1997.html").read_text(encoding="utf8")
        # All links below come from the actual original-device page, not a guessed asset path.
        html = html[html.index('<h4>Version 1</h4>'):html.index('<h4>Version 2</h4>')]
        srcs = list(dict.fromkeys(re.findall(r'(?:src|data-src)=[\"\']([^\"\']*images/dot/dm/[^\"\']+\.gif)', html)))
        tasks = [(urljoin("https://humulos.com/digimon/dm/", src),
                  "digimon/" + src.rsplit("/", 1)[-1]) for src in srcs if not src.endswith("digitama_2.gif")]
        for url in json.loads((Path(__file__).parent / "tamagotchi-image-urls.json").read_text()):
            # Exact links observed in public archive pages. Rejections are recorded;
            # no challenge, authentication or host restriction bypass is attempted.
            tasks.append((url, "tamagotchi/" + url.split("?")[0].rsplit("/",1)[-1]))
        def safe_fetch(pair):
            try: return fetch(*pair)
            except Exception as error: return {"url": pair[0], "unavailable": str(error)}
        with ThreadPoolExecutor(max_workers=4) as pool:
            for result in pool.map(safe_fetch, tasks): manifest.append(result)
    (OUT / "source-manifest.json").write_text(json.dumps({"retrievedOn": "2026-10-25", "purpose": "Offline visual comparison only; no runtime sprite selection", "files": manifest}, indent=2) + "\n", encoding="utf8")
    print("Fetched", len(manifest), "source files")

if __name__ == "__main__": main()

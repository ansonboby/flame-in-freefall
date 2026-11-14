#!/usr/bin/env python3
"""Phase 1: build the corpus. Stdlib only — no pip installs needed.

- Document 0: NASA 2015 Researcher's Guide to ISS Combustion Science (PDF -> text)
- The 10 named investigations: verbatim abstracts from the official NTRS API
- Every URL used is logged in sources.csv
"""
import csv
import json
import pathlib
import re
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
CORPUS = ROOT / "corpus"
CORPUS.mkdir(exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) FlameInFreefall/1.0"}
DOC0_URL = ("https://www.nasa.gov/wp-content/uploads/2015/02/"
            "np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf")

# (file stem, NTRS query, display name)
INVESTIGATIONS = [
    ("01_bass", "Burning and Suppression of Solids BASS microgravity", "BASS"),
    ("02_bass_ii", "Burning and Suppression of Solids-II BASS-II", "BASS-II"),
    ("03_saffire_i", "Saffire-I spacecraft fire experiment", "Saffire-I"),
    ("04_saffire_ii", "Saffire-II spacecraft fire experiment", "Saffire-II"),
    ("05_saffire_iii", "Saffire-III spacecraft fire experiment", "Saffire-III"),
    ("06_same", "Smoke and Aerosol Measurement Experiment SAME", "SAME"),
    ("07_same_r", "Smoke and Aerosol Measurement Experiment SAME-R reflight", "SAME-R"),
    ("08_flex", "Flame Extinguishment Experiment FLEX microgravity", "FLEX"),
    ("09_daft", "Dust and Aerosol Measurement Feasibility Test DAFT", "DAFT"),
    ("10_daft_2", "Dust and Aerosol Measurement Feasibility Test DAFT-2", "DAFT-2"),
]

sources: list[dict] = []


def log_source(name, url, description):
    sources.append({"file": name, "source_url": url, "description": description})


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def clean(t):
    # NTRS abstracts sometimes carry escaped markup; keep it verbatim but readable
    return re.sub(r"[ \t]+", " ", t.replace("\\n", "\n")).strip()


def doc0():
    out = CORPUS / "00_researchers_guide.txt"
    pdf = "/tmp/opencode/doc0.pdf"
    pdf = fetch(DOC0_URL)
    pathlib.Path("/tmp/opencode/doc0.pdf").write_bytes(pdf)
    subprocess.run(["pdftotext", "/tmp/opencode/doc0.pdf", str(out)], check=True)
    log_source(out.name, DOC0_URL, "Document 0: Researcher's Guide to ISS Combustion Science (2015)")
    print(f"doc0: {out.stat().st_size} bytes")


def ntrs(stem, query, name, max_docs=5):
    q = urllib.parse.quote(query)
    url = f"https://ntrs.nasa.gov/api/citations/search?q={q}"
    data = json.loads(fetch(url, timeout=30))
    results = data.get("results", [])[:max_docs]
    parts, used = [], []
    for r in results:
        title, abstract = clean(r.get("title", "")), clean(r.get("abstract", ""))
        if not abstract or len(abstract) < 120:
            continue
        cid = r.get("id", "")
        link = f"https://ntrs.nasa.gov/citations/{cid}"
        parts.append(f"[NTRS {cid}] {title}\n{abstract}")
        used.append(link)
    out = CORPUS / f"{stem}.txt"
    if not parts:
        print(f"!! {name}: no usable NTRS abstracts — needs manual fill")
        out.write_text(f"{name}\nNo verbatim abstracts retrieved; fill from PSI page.\n")
        return
    header = (f"{name} — investigation reference corpus.\n"
              f"Composed of VERBATIM abstracts from NASA NTRS citations below.\n\n")
    out.write_text(header + "\n\n".join(parts) + "\n")
    log_source(out.name, url, f"NTRS search for {name} (abstracts from: {', '.join(used[:3])}…)")
    print(f"{name}: {len(parts)} abstracts -> {out.name} ({out.stat().st_size} bytes)")


def main():
    steps = [doc0] + [lambda s=s, q=q, n=n: ntrs(s, q, n) for s, q, n in INVESTIGATIONS]
    failed = []
    for step in steps:
        try:
            step()
        except Exception as e:
            failed.append((step.__name__, str(e)))
            print(f"!! {step.__name__}: {e}", file=sys.stderr)
    with (ROOT / "sources.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file", "source_url", "description"])
        w.writeheader()
        w.writerows(sources)
    print(f"\nsources.csv: {len(sources)} entries. Failures: {len(failed)}")


if __name__ == "__main__":
    main()

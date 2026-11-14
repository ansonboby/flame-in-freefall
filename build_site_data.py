#!/usr/bin/env python3
"""Build public/data/ for the Mission Control static site.

All scoring goes through flame_core — the site never re-implements the formula.
Run after every extraction/verification refresh:  python3 build_site_data.py
"""
import csv, json, pathlib, datetime
import flame_core as fc

ROOT = pathlib.Path(__file__).parent
DATA = ROOT / "public" / "data"
DATA.mkdir(parents=True, exist_ok=True)

records = fc.rescore(fc.load_records(ROOT / "records.json"))

# Arena: each solid record re-scored under the 3 mission environments.
ARENAS = ["spacecraft", "lunar_base", "rover"]
for r in records:
    if r.get("fuel_category") != "solid":
        continue
    arena = {}
    for env in ARENAS:
        e = fc.ENVIRONMENTS[env]
        variant = dict(r, environment=env, o2_conc_pct=e["o2_pct"],
                       pressure_atm=e["pressure_atm"])
        arena[env] = fc.hazard_index(variant)
    r["arena"] = arena

(DATA / "records.json").write_text(json.dumps(records, indent=1))

story = json.loads((ROOT / "story.json").read_text())
(DATA / "story.json").write_text(json.dumps(story, indent=1))

sources = list(csv.DictReader((ROOT / "sources.csv").open()))
seen, deduped = set(), []
for s in sources:  # sources.csv contains repeat rows; keep first per file
    if s["file"] not in seen:
        seen.add(s["file"]); deduped.append(s)
sources = deduped
(DATA / "sources.json").write_text(json.dumps(sources, indent=1))

fc.export_csv(records, DATA / "flame.csv")

verified = sum(1 for r in records if r.get("jev_verified"))
meta = {
    "generated": datetime.date.today().isoformat(),
    "total": len(records),
    "verified": verified,
    "pct_verified": round(100 * verified / len(records)) if records else 0,
    "formula": fc.FORMULA,
    "environments": {k: v for k, v in fc.ENVIRONMENTS.items() if k in ARENAS},
}
(DATA / "meta.json").write_text(json.dumps(meta, indent=1))

print(f"site data: {len(records)} records, {verified} verified ({meta['pct_verified']}%) -> public/data/")

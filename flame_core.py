#!/usr/bin/env python3
"""flame_core.py — scoring, matching, export. Shared by the pipeline and the web UI.

Implements flame_extraction_kit_v2.md §4 exactly:
    HI = 100 × (0.35·S + 0.25·O + 0.20·E + 0.20·C),  clamped to [0, 100]
Only fuel_category == "solid" records are scored.
"""
import csv
import json
import pathlib
import re

# --- environments (challenge text: Moon Base & pressurized rovers plan increased O2,
# --- reduced pressure; ISS runs ~21% O2 at ~1 atm) -------------------------------------
ENVIRONMENTS = {
    "spacecraft":  {"label": "Spacecraft",        "o2_pct": 21.0, "pressure_atm": 1.00},
    "station":     {"label": "Space Station",     "o2_pct": 21.0, "pressure_atm": 1.00},
    "lunar_base":  {"label": "Lunar / Martian Base", "o2_pct": 34.0, "pressure_atm": 0.54},
    "rover":       {"label": "Pressurized Rover", "o2_pct": 34.0, "pressure_atm": 0.57},
    "earth":       {"label": "Earth",             "o2_pct": 20.9, "pressure_atm": 1.00},
}

OUTCOME_SEVERITY = {"spread": 1.0, "smoldering": 0.5, "extinguished": 0.0, "no_burn": 0.0}


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def oxygen_factor(o2_pct):
    """O — oxygen enrichment above Earth air, capped (kit §4)."""
    if o2_pct is None:
        return None
    return clamp((o2_pct - 20.9) / 30.0)


def confidence_factor(jev_score):
    """C — confidence: jev_evidence_score / 10; None → 0.5 (neutral, flagged)."""
    if jev_score is None:
        return 0.5
    return clamp(jev_score / 10.0)


def extinction_factor(record):
    """E — extinguishing difficulty, 0–1, higher = harder to put out.

    Data-driven when suppression evidence exists (FLEX diluent concentration etc.),
    otherwise derived from outcome severity so ranking still works before Phase 3 tuning.
    """
    if record.get("extinguish_difficulty") is not None:
        return clamp(record["extinguish_difficulty"])
    return clamp(OUTCOME_SEVERITY.get(record.get("outcome"), 0.5))


def severity(record):
    return clamp(OUTCOME_SEVERITY.get(record.get("outcome"), 0.0))


def hazard_index(record):
    """HI = 100 × (0.35·S + 0.25·O + 0.20·E + 0.20·C)."""
    parts = [severity(record), oxygen_factor(record.get("o2_conc_pct")),
             extinction_factor(record), confidence_factor(record.get("jev_evidence_score"))]
    if any(p is None for p in parts):
        return None
    return round(100 * (0.35 * parts[0] + 0.25 * parts[1] + 0.20 * parts[2] + 0.20 * parts[3]), 1)


FORMULA = "HI = 100 × (0.35·S + 0.25·O + 0.20·E + 0.20·C)"


def rescore(records):
    """Recompute hazard_index on all solid-fuel records (run after Jev verification)."""
    for r in records:
        if r.get("fuel_category") == "solid":
            r["hazard_index"] = hazard_index(r)
    return records


# --- "Will it burn?" matching -----------------------------------------------------------
def _tokenize(s):
    return set(re.findall(r"[a-z0-9]{3,}", (s or "").lower()))


def match_records(records, fuel_query, environment, top=5):
    """Rank solid-fuel records for a fuel query + target environment.

    Score = fuel-name token overlap (x2) + outcome/environment affinity.
    Never invents a match: fewer than max(1 token overlap, env match) → no result.
    """
    if not fuel_query or not fuel_query.strip():
        return []
    env = ENVIRONMENTS.get(environment, ENVIRONMENTS["spacecraft"])
    q_tokens = _tokenize(fuel_query)
    scored = []
    for r in records:
        if r.get("fuel_category") != "solid":
            continue
        name_tokens = _tokenize(f"{r.get('fuel','')} {r.get('fuel_shape','')}")
        overlap = len(q_tokens & name_tokens)
        env_bonus = 1.0 if r.get("environment") == environment else 0.0
        sev = OUTCOME_SEVERITY.get(r.get("outcome"), 0.0)
        score = overlap * 2.0 + env_bonus + sev
        if overlap == 0 and env_bonus == 0.0:
            continue
        o2_delta = None
        if r.get("o2_conc_pct") is not None:
            o2_delta = round(r["o2_conc_pct"] - env["o2_pct"], 1)
        scored.append({**r, "match_score": score, "target_o2_pct": env["o2_pct"],
                       "target_pressure_atm": env["pressure_atm"], "o2_delta_vs_target": o2_delta})
    scored.sort(key=lambda x: -x["match_score"])
    return scored[:top]


def will_it_burn(records, fuel_query, environment):
    """Verdict for the checker: burn / will-not-burn / unknown, with matched evidence."""
    matches = match_records(records, fuel_query, environment)
    if not matches:
        return {"verdict": "unknown", "message": "No verified solid-fuel record matches that "
                "material and environment. Check the Explorer or export the data to model it.",
                "matches": []}
    best = matches[0]
    outcome = best.get("outcome")
    verdict = {"spread": "burns", "smoldering": "smolders"}.get(outcome, "unknown")
    msgs = {"burns": f"Evidence from {best.get('investigation')}: flame spread under comparable "
                     f"conditions ({best.get('o2_conc_pct')}% O₂ at {best.get('pressure_atm')} atm).",
            "smolders": f"Evidence from {best.get('investigation')}: smoldering without spread "
                        f"({best.get('o2_conc_pct')}% O₂). Smoldering still produces toxic CO.",
            "unknown": f"Closest record ({best.get('investigation')}) did not test this exact "
                       f"condition — treat as a data gap, not a safety pass."}
    return {"verdict": verdict, "message": msgs[verdict], "matches": matches}


# --- export -----------------------------------------------------------------------------
def export_csv(records, path):
    """One-click clean CSV for predictive modeling (challenge objective #2)."""
    fields = ["id", "investigation", "title", "url", "objective", "fuel", "fuel_shape",
              "fuel_size", "o2_conc_pct", "pressure_atm", "airflow_cm_s", "gravity_g",
              "environment", "pillar", "fuel_category", "outcome", "sensors",
              "variables_vs_other_runs", "key_finding", "evidence_quote",
              "extracted_by", "jev_verified", "jev_evidence_score", "confidence", "hazard_index"]
    path = pathlib.Path(path)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in records:
            row = dict(r)
            row["sensors"] = "; ".join(r.get("sensors") or [])
            row["jev_verified"] = "yes" if r.get("jev_verified") else "no"
            w.writerow(row)
    return path


def load_records(path):
    p = pathlib.Path(path)
    return json.loads(p.read_text()) if p.exists() else []


# --- self-check (kit §4 must not drift) --------------------------------------------------
if __name__ == "__main__":
    base = {"fuel_category": "solid", "outcome": "spread", "o2_conc_pct": 21.0,
            "jev_evidence_score": 10}
    # S=1.0, O=(21-20.9)/30≈0.0033, E=1.0, C=1.0 -> 75.1
    assert abs(hazard_index(base) - 75.1) < 0.5, hazard_index(base)
    ext = {**base, "outcome": "extinguished"}          # S=0, E=0 (went out easily) -> 20.1
    assert abs(hazard_index(ext) - 20.1) < 0.5, hazard_index(ext)
    rover = {**base, "o2_conc_pct": 34.0}              # O=0.437 -> 85.9
    assert abs(hazard_index(rover) - 85.9) < 0.5, hazard_index(rover)
    assert hazard_index({**base, "o2_conc_pct": 90.0}) == 100.0  # clamp hi
    assert hazard_index({**base, "o2_conc_pct": 10.0}) == 75.0   # clamp lo
    sample = [{"fuel": "PMMA", "fuel_category": "solid", "outcome": "spread",
               "o2_conc_pct": 21.0, "jev_evidence_score": 8, "environment": "spacecraft",
               "investigation": "BASS"}]
    assert will_it_burn(sample, "PMMA sheet", "spacecraft")["verdict"] == "burns"
    assert will_it_burn(sample, "unobtanium", "lunar_base")["verdict"] == "unknown"
    out = export_csv(sample, "/tmp/opencode/_csv_test.csv")
    assert "PMMA" in out.read_text()
    print("flame_core self-checks passed")

#!/usr/bin/env python3
"""extract_records.py — Phase 2 extraction. Reads corpus/*.txt, writes records.json.

Backend: BACKEND=<gemini|openrouter|nvidia|opencode|ollama>
  gemini      GEMINI_API_KEY (native responseSchema; free tier ~20 req/day)
  openrouter  OPENROUTER_API_KEY (default model nvidia/nemotron-3-ultra-550b-a55b:free)
  openai      OPENAI_API_KEY (default model gpt-5.4-mini; paid credits)
  nvidia      NVIDIA_API_KEY (default model deepseek-ai/deepseek-v4.1-flash)
  opencode    OPENCODE_API_KEY
  ollama      local, MODEL env var (default llama3.1:8b)

Usage:  BACKEND=openrouter python3 extract_records.py [file1.txt file2.txt ...]
Resumable: skips record ids already in records.json unless --fresh / FRESH=1.
Writes: records.json (merged) + needs_review.json (flagged records)
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent
CORPUS = ROOT / "corpus"
RECORDS = ROOT / "records.json"
REVIEW = ROOT / "needs_review.json"
OLLAMA = "http://localhost:11434/api/chat"
OPENCODE_URL = "https://opencode.ai/inference/openai/v1/chat/completions"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
GEMINI_URL = ("https://generativelanguage.googleapis.com/v1beta/models/"
              "{model}:generateContent?key={key}")
MODEL = os.environ.get("MODEL", "llama3.1:8b")
BACKEND = os.environ.get("BACKEND", "ollama")
LAST_MODEL = MODEL  # set by chat() per call; used for extracted_by tags

INVESTIGATION = {
    "00": "Researcher's Guide", "01": "BASS", "02": "BASS-II", "03": "Saffire-I",
    "04": "Saffire-II", "05": "Saffire-III", "06": "SAME", "07": "SAME-R",
    "08": "FLEX", "09": "DAFT", "10": "DAFT-2",
}

SCHEMA_KEYS = ["objective", "fuel", "fuel_shape", "fuel_size", "o2_conc_pct", "pressure_atm",
               "airflow_cm_s", "gravity_g", "environment", "pillar", "fuel_category",
               "outcome", "sensors", "variables_vs_other_runs", "key_finding", "evidence_quote"]

PROMPT = """You extract structured data from NASA microgravity combustion documents.

Read the document below and return ONLY a JSON object matching this schema — no prose:
{objective, fuel, fuel_shape, fuel_size, o2_conc_pct, pressure_atm, airflow_cm_s,
 gravity_g, environment, pillar, fuel_category, outcome, sensors,
 variables_vs_other_runs, key_finding, evidence_quote}

Rules:
- Copy `evidence_quote` VERBATIM from the text. If no sentence supports the record, set it to null.
- Numbers: null when not stated. Never guess or interpolate.
- fuel_category: "solid" for fabrics/plastics/cabin materials, "droplet" for liquid droplet
  combustion, "gas" for premixed/non-premixed flames, "other" otherwise.
- outcome: "spread" | "smoldering" | "extinguished" | "no_burn" — what happened to the flame.
- environment: "spacecraft" | "station" | "lunar_base" | "rover" | "earth".
- pillar: "prevention" (material/flammability) | "detection" (smoke/aerosol) | "suppression".
- Omit records about rockets or propellant combustion — out of scope.
- If the document describes an entire investigation with several runs, extract the record for
  the single most fire-safety-relevant solid-fuel finding, and put run variations in
  variables_vs_other_runs.

Document:
"""


def _post_json(url, payload, headers=None, timeout=180):
    """curl transport — Cloudflare blocks urllib's TLS fingerprint on opencode.ai (403/1010)."""
    cmd = ["curl", "-s", "-m", str(timeout), url,
           "-H", "Content-Type: application/json",
           "-H", "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                 "(KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36"]
    for h, v in (headers or {}).items():
        cmd += ["-H", f"{h}: {v}"]
    cmd += ["-d", json.dumps(payload)]
    last = None
    for attempt in range(3):  # transient network blips killed a whole 30-min run once
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode == 0:
            return json.loads(proc.stdout)
        last = RuntimeError(f"curl failed: {proc.stderr[:200]}")
        time.sleep(5 * (attempt + 1))
    raise last


def chat(system, user, max_retries=3):
    """One chat call; retries are handled by the caller (validation feedback loop)."""
    global LAST_MODEL
    if BACKEND == "gemini":
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            auth = pathlib.Path.home() / ".local/share/opencode/auth.json"
            if auth.exists():
                key = json.loads(auth.read_text()).get("gemini", {}).get("key")
        if not key:
            sys.exit("BACKEND=gemini needs GEMINI_API_KEY (free at aistudio.google.com/apikey)")
        model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"parts": [{"text": user}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "objective": {"type": "STRING"},
                        "fuel": {"type": "STRING"},
                        "fuel_shape": {"type": "STRING"},
                        "fuel_size": {"type": "STRING"},
                        "o2_conc_pct": {"type": "NUMBER"},
                        "pressure_atm": {"type": "NUMBER"},
                        "airflow_cm_s": {"type": "NUMBER"},
                        "gravity_g": {"type": "NUMBER"},
                        "environment": {"type": "STRING",
                                        "enum": ["spacecraft", "station", "lunar_base",
                                                 "rover", "earth"]},
                        "pillar": {"type": "STRING",
                                   "enum": ["prevention", "detection", "suppression"]},
                        "fuel_category": {"type": "STRING",
                                          "enum": ["solid", "droplet", "gas", "other"]},
                        "outcome": {"type": "STRING",
                                    "enum": ["spread", "smoldering", "extinguished", "no_burn"]},
                        "sensors": {"type": "ARRAY", "items": {"type": "STRING"}},
                        "variables_vs_other_runs": {"type": "STRING"},
                        "key_finding": {"type": "STRING"},
                        "evidence_quote": {"type": "STRING"},
                    },
                    "required": SCHEMA_KEYS,
                },
            },
        }
        last_err = None
        for m in (model, "gemini-3.8-flash"):
            resp = _post_json(GEMINI_URL.format(model=m, key=key), payload, timeout=120)
            if isinstance(resp, dict) and "error" in resp:
                code, msg = resp["error"].get("code"), resp["error"].get("message", "")
                if code == 404:
                    last_err = f"{m}: 404 not available"
                    continue   # retired model id -> try the next
                last_err = f"{m}: {resp['error'].get('status')}: {msg[:120]}"
                continue       # 503/429/etc -> try the fallback model before giving up
            parts = resp["candidates"][0]["content"]["parts"]
            LAST_MODEL = m
            return "".join(p.get("text", "") for p in parts)
        raise RuntimeError(f"gemini: all model ids failed ({last_err})")
    if BACKEND == "opencode":
        key = os.environ.get("OPENCODE_API_KEY")
        if not key:
            auth = pathlib.Path.home() / ".local/share/opencode/auth.json"
            if auth.exists():
                key = json.loads(auth.read_text()).get("opencode", {}).get("key")
        if not key:
            sys.exit("BACKEND=opencode needs OPENCODE_API_KEY")
        model = os.environ.get("OPENCODE_MODEL", "glm-5.3-flash-free")
        resp = _post_json(OPENCODE_URL, {
            "model": model,
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}],
        }, headers={"Authorization": f"Bearer {key}"})
        if "error" in resp:
            raise RuntimeError(f"opencode backend: {resp['error'].get('type')}: "
                               f"{resp['error'].get('message')}")
        LAST_MODEL = model
        return resp["choices"][0]["message"]["content"]
    if BACKEND in ("openrouter", "nvidia", "openai"):  # OpenAI-compatible hosted backends
        url, envkey, defmodel = {
            "openrouter": (OPENROUTER_URL, "OPENROUTER_API_KEY",
                           os.environ.get("OPENROUTER_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free")),
            "nvidia": (NIM_URL, "NVIDIA_API_KEY",
                       os.environ.get("NVIDIA_MODEL", "deepseek-ai/deepseek-v4.1-flash")),
            "openai": (OPENAI_URL, "OPENAI_API_KEY",
                       os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")),
        }[BACKEND]
        key = os.environ.get(envkey)
        if not key:
            sys.exit(f"BACKEND={BACKEND} needs {envkey}")
        resp = _post_json(url, {
            "model": defmodel, "temperature": 0.1,
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}],
        }, headers={"Authorization": f"Bearer {key}"})
        if "error" in resp:
            raise RuntimeError(f"{BACKEND} backend: {str(resp['error'])[:200]}")
        LAST_MODEL = defmodel
        return resp["choices"][0]["message"]["content"]
    resp = _post_json(OLLAMA, {
        "model": MODEL, "stream": False, "format": "json",
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "options": {"temperature": 0.1, "num_predict": 600},
    }, timeout=900)
    return resp["message"]["content"]


def parse_json(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON object in reply")
    return json.loads(m.group(0))


def validate(rec, source_text):
    """Strict schema + verbatim-quote check. Returns list of problems (empty = OK)."""
    problems = []
    for k in SCHEMA_KEYS:
        if k not in rec:
            problems.append(f"missing field: {k}")
    if problems:
        return problems
    for k in ("o2_conc_pct", "pressure_atm", "airflow_cm_s", "gravity_g"):
        v = rec[k]
        if isinstance(v, str):  # models emit "21%" or "low-gravity"
            m = re.search(r"-?\d+(?:\.\d+)?", v)
            rec[k] = float(m.group(0)) if m else None
        elif isinstance(v, list):  # models sometimes emit several candidate values
            rec[k] = next((float(x) for x in v if isinstance(x, (int, float))), None)
        elif v is not None and not isinstance(v, (int, float)):
            rec[k] = None
        # physically impossible = "not stated" (models emit 0 instead of null)
        if k in ("o2_conc_pct", "pressure_atm") and isinstance(rec[k], (int, float)) \
           and (k == "o2_conc_pct" and rec[k] < 8 or k == "pressure_atm" and rec[k] < 0.05):
            rec[k] = None
    if rec["fuel_category"] not in ("solid", "droplet", "gas", "other"):
        problems.append(f"bad fuel_category: {rec['fuel_category']}")
    if rec["outcome"] not in ("spread", "smoldering", "extinguished", "no_burn"):
        problems.append(f"bad outcome: {rec['outcome']}")
    if rec["pillar"] not in ("prevention", "detection", "suppression"):
        problems.append(f"bad pillar: {rec['pillar']}")
    if rec["environment"] not in ("spacecraft", "station", "lunar_base", "rover", "earth"):
        problems.append(f"bad environment: {rec['environment']}")
    q = rec.get("evidence_quote")
    if q and source_text and q.strip() not in source_text:
        problems.append("evidence_quote NOT verbatim in source")
    for num in ("pressure_atm", "o2_conc_pct", "airflow_cm_s", "gravity_g"):
        v = rec.get(num)
        if isinstance(v, (int, float)) and v < 0:
            problems.append(f"negative {num} (model guessed; use null when unstated)")
            rec[num] = None
    if not rec.get("key_finding"):
        problems.append("empty key_finding")
    return problems


SECTION_RE = re.compile(r"(?=\[NTRS \d+\])")


def split_sections(text):
    """One record per verbatim NTRS abstract (multi-run investigations → many records)."""
    parts = [p for p in SECTION_RE.split(text) if len(p.strip()) > 400]
    return parts if parts else [text]


def extract_file(path, done_ids=()):
    """Extract records for a corpus file; yields (record|None, problems|None) per section."""
    text = path.read_text()
    inv = INVESTIGATION.get(path.stem[:2], path.stem)
    sections = split_sections(text)
    for sec in sections:
        m = re.search(r"\[NTRS (\d+)\]", sec)
        rid = f"{path.stem}-{m.group(1)}" if m else f"{path.stem}-main"
        if rid in done_ids:
            continue  # resume: don't burn API quota re-extracting done sections
        prompt = PROMPT
        err = "unknown"
        for attempt in range(1, 4):
            try:
                reply = chat(prompt, sec if len(sec) < 40000 else sec[:40000])
            except Exception as e:
                err = str(e)  # outage/quota/blocked-or-nonJSON reply — retry, never kill the whole run
            else:
                try:
                    rec = parse_json(reply)
                    problems = validate(rec, sec)
                    if not problems:
                        rec.update({"id": rid, "investigation": inv, "url": "", "sensors": rec.get("sensors") or [],
                                    "extracted_by": f"{BACKEND}:{LAST_MODEL}"})
                        if m:
                            rec["url"] = f"https://ntrs.nasa.gov/citations/{m.group(1)}"
                        yield rec, None
                        break
                    err = "; ".join(problems)
                except (ValueError, json.JSONDecodeError) as e:
                    err = f"invalid JSON: {e}"
            print(f"  attempt {attempt} failed: {err[:180]}")
            time.sleep(1)
            prompt = f"{PROMPT}\nYour previous reply failed validation: {err}\nReturn valid JSON only.\nDocument:\n"
        else:
            yield None, err


def main():
    files = [CORPUS / pathlib.Path(f).name for f in sys.argv[1:]] if len(sys.argv) > 1 else sorted(CORPUS.glob("*.txt"))
    fresh = "--fresh" in sys.argv or os.environ.get("FRESH") == "1"
    records, review = [], []
    if RECORDS.exists() and not fresh:
        records = json.loads(RECORDS.read_text())
    done_ids = {r["id"] for r in records}
    for f in files:
        print(f"extracting {f.name} ...")
        for rec, err in extract_file(f, done_ids):
            if rec:
                if rec["id"] in done_ids:
                    continue
                records.append(rec); done_ids.add(rec["id"])
                print(f"  ok {rec['id']}: {rec.get('fuel')} / {rec.get('outcome')} / {rec.get('pillar')}")
            else:
                review.append({"file": f.name, "error": err})
                print(f"  FLAGGED for review")
            RECORDS.write_text(json.dumps(records, indent=2))
            if BACKEND == "gemini":
                time.sleep(6.5)  # Gemini free tier: 10 requests/min
    REVIEW.write_text(json.dumps(review, indent=2))
    print(f"\ndone: {len(records)} records -> records.json, {len(review)} flagged -> needs_review.json")


if __name__ == "__main__":
    main()

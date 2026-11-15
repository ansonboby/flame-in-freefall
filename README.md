# PYRO-0G — a fire-safety cockpit for the Artemis era

**Live app:** https://pyro-0g.vercel.app
**NASA Space Apps 2026** — *Challenge: (PSI) Combustion Science* · Primary award target: **Best Use of Data**

Two weeks ago a fire alarm went off aboard Artemis II — *"80,000 miles from home."* Fire in space
is a solved-for-Earth problem we never solved for space. PYRO-0G turns sixty years of NASA
microgravity combustion experiments (BASS, BASS-II, Saffire I–VI, SAME, SAME-R, FLEX, DAFT, DAFT-2)
into one verified dataset and a live cockpit that answers one question: **will this material burn in
my mission's atmosphere?**

## What judges are looking at (30-second version)

- **Simulator Workbench** — pick a crew environment (ISS, Orion, lunar base, pressurized rover),
  pick a material, tune O₂ / airflow / pressure / gravity, and watch the flame regime change live.
  **SPLIT 1g | 0g** burns the same sample in the same atmosphere at both gravities side by side —
  buoyancy is the only variable.
- **Flame Hazard Index** — transparent, on-screen: `HI = 100 × (0.35·S + 0.25·O + 0.20·E + 0.20·C)`.
  No black box; every term is explained in the formula panel.
- **Test Matrix & Compare** — environment × outcome matrix across 25 experiment runs,
  top-hazard cards, and honest DATA GAPS (runs the papers don't give O₂/pressure for are shown
  as unscored — never guessed).
- **Mission Impact & Spinoffs** — from Apollo 1 to the shuttle smoke detector to firefighter
  air tanks: the Earth benefits are the point, not a footnote.
- **Evidence inspector** — click any run: verbatim source quote, NTRS link, extraction model,
  and the independent verification verdict.
- **CSV export** — the full dataset, one click, for your own analysis.

## Trust model (Creativity)

One AI extracts, an **independent ladder verifies**: `extract_records.py` turns each PSI
investigation page into a structured record (the extracting model is logged per record and
shown in the app's inspector: Google gemini-2.5-flash, OpenAI gpt-5.4-mini, GLM
glm-5.3-flash-free for manual lens re-extraction); `verify_records.py` re-checks every claim
against the source through a fallback ladder of independent decision models
(jev-1.13-free → jev-1.13 → gemini-decision-1 → gpt-6-luna-decision → OpenAI self-check →
human review) and scores evidence quality (0–10) with match probabilities. **80% of records
pass dual verification**; the rest are flagged
`FLAGGED` in plain sight, in red, in the matrix. What the sources don't state appears as a
DATA GAP, not a guess.

## Data (Relevance)

- **NASA Physical Sciences Informatics (PSI) — Combustion Science repository**
- *A Researcher's Guide to ISS Combustion Science* (2015) — document 0
- NTRS citations per investigation (see `sources.csv`; 23 citations, 11 corpus files)

Investigations: BASS, BASS-II, Saffire-I/II/III, SAME, SAME-R, FLEX, DAFT, DAFT-2.

## Repo map

| Path | What it is |
|---|---|
| `index.html`, `app.js`, `style.css` | the cockpit (vanilla JS + Canvas + SVG; `public/` is the deployed copy) |
| `corpus/` | PSI investigation page text, one file per investigation |
| `extract_records.py`, `verify_records.py`, `flame_core.py` | the pipeline: extract → verify → score |
| `records.json`, `data/` | 25 experiment runs + site data (`meta.json`, `story.json`, `sources`, `flame.csv`) |
| `sources.csv` | every source, logged |
| `PITCH.md` | the 30-second beat sheet + project-page copy |
| `pitch/pyro-0g-30s-demo.mp4` | beat-timed screen layer of the live app (voiceover-ready) |

## Run it

The app is static — serve the folder and open it:

```bash
python3 -m http.server 8907   # in public/  (or any static server on the repo root)
```

The data pipeline (optional; output is already committed):

```bash
python extract_records.py   # BACKEND=gemini|openai|openrouter|nvidia|ollama (see script header)
python verify_records.py    # OPENCODE_API_KEY enables the decision-model ladder
python build_site_data.py
```

## Disclosure (SI)

**Extraction** (model logged per record, shown in the app's evidence inspector): Google
gemini-2.5-flash, OpenAI gpt-5.4-mini, GLM glm-5.3-flash-free (manual lens re-extraction).
**Verification:** independent decision-model ladder jev-1.13-free → jev-1.13 →
gemini-decision-1 → gpt-6-luna-decision, falling back to an OpenAI self-check (quote/number
re-verification via the OpenAI API; verbatim quote check when no key is set) then human review
(`needs_review.json`). Coding assistant — used
for implementation and bug-hunting. All demo visuals are screen recordings of the running
app; no AI-generated imagery anywhere in the submission.

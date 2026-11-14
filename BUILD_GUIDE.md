# BUILD GUIDE — Flame in Freefall

Hours run from your start. Work backward from your local event deadline — **submit 2 hours early**.
Submission closes **Sunday Nov 15, 11:59 PM local**. Team roles: Data lead / App builder / Story lead
(1–2 people: one does data+app, the other story+QA; solo: cut the "could have" items).

---

## Phase 0 — Setup (0 – 0.5h)

- Confirm every teammate is registered, on the same Local Event, **not waitlisted**, on the Members tab (max 6; no adds after submission closes).
- Create repo, `sources.csv`, assign roles. Pick the project name.
- **Done when:** everyone knows their job and this folder exists on every machine.

## Phase 1 — Build the corpus (0.5 – 3h)

- **Data lead:** pull the PSI Combustion Science pages for the named investigations —
  **BASS, BASS-II, Saffire-I/II/III, SAME, SAME-R, FLEX, DAFT, DAFT-2** — one `.txt` each into
  `corpus/`. The 2015 Researcher's Guide to ISS Combustion Science is **document 0**.
  Work from page text/metadata/publications — **never raw video or images**.
- **Story lead (parallel):** write `story.json` cards (1–2 sentences + source URL each):
  Artemis II fire alarm (the 80,000-miles quote), Apollo 1, Apollo 13, Mir 1997,
  fine-water-mist extinguisher, fire detector, fireman's air tanks, fire attire.
- **App builder (parallel):** app skeleton runs locally with dummy `records.json`.
- **Done when:** 8+ investigation files in `corpus/`, every file logged in `sources.csv`.

## Phase 2 — Extract, verify, hand-check (3 – 8h)

- `MODEL=llama3.1:8b python extract_records.py` — **test on 3 files first**, then run all.
  Writes `records.json` + `needs_review.json`.
- `verify_records.py` — batch every record through Jev (kit §3). Merge verdicts as `verified`
  fields + Jev evidence score.
- Hand-check **10 records** against their sources. Fix or down-flag the rest.
- **Done when:** records are real, dual-verified, DEMO banner gone.

## Phase 3 — App polish (8 – 14h)

- Wire real data into all six tabs: Ask · Will-it-burn · Explorer · Hazard ranking ·
  Why it matters · Back on Earth.
- **Official-objective features (do not skip):** crew-environment filter, **CSV export**,
  prevention/detection/suppression tags, within-investigation test-matrix view.
- "Will it burn?" scenarios use **increased-O₂ / reduced-pressure** atmospheres (Moon Base & rovers).
- Hazard Index formula visible on screen (kit §4).
- **Done when:** a stranger could use it without explanation — usability is scored under *Validity*.

## Phase 4 — Deploy (14 – 18h)

- GitHub repo: `app.py`, `flame_core.py`, `requirements.txt`, `records.json`, `sources.csv`, `story.json`.
- Deploy on share.streamlit.io (main file `app.py`).
- File the **FortiGuard Web Filter Classification** (category: web-based application; company: "N/A").
- **Done when:** public URL loads, no orange DEMO banner, link tested in a private browser.

## Phase 5 — Pitch & demo (18 – 24h)

- Record the **30-second video** following `PITCH.md` beat sheet exactly — over 30s = ineligible
  for Global Judging. Screen-record the live app; no AI-generated visuals.
- Fill every Project page field (copy in `PITCH.md`), all English, public links.
- **Done when:** video + page ready to submit.

## Phase 6 — Submit & buffer (24h+)

- **Click "Submit for Judging"** (saving ≠ submitting). You can resubmit until the deadline;
  only the last one counts.
- **Hard rule: submit 2 hours before your local deadline.** Download the participant certificate.
- Rehearse once. Fix what breaks.

---

## Judging targets (1–5 each: Impact · Creativity · Validity · Relevance · Presentation)

- **Impact:** Artemis II opener; Moon/Mars crews + Earth firefighter spinoffs.
- **Creativity:** dual-model verification layer (Llama extracts, Jev confirms).
- **Validity:** working app, visible formula, verified quotes, CSV export, clean UI.
- **Relevance:** PSI data is the product; named investigations; environment filter.
- **Presentation:** the 30s script, timed. Primary award target: **Best Use of Data**.

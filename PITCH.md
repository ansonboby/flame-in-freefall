# PITCH & SUBMISSION — Flame in Freefall

Everything the Project page and demo need. All content in English. Hard limits:
**demo ≤30s video or ≤7 slides — exceeding either = ineligible for Global Judging.**

---

## 1. The 30-second demo script (official beat sheet)

Screen-record the live app. No AI-generated visuals (avoids SI watermark rules).
~70 words total. Read aloud with a timer; cut words until it fits — never cut the quote.

| Time | Beat | Line |
|---|---|---|
| 0:00 | Name + team | "I'm [name], team [team name]." |
| 0:02 | Challenge + why | "Two weeks ago, a fire alarm went off on Artemis II — *'80,000 miles from home.'* Fire in space is a solved-for-Earth problem we never solved for space." |
| 0:05 | Title + tagline | "This is **[project]** — ask whether a material will burn on the way to Mars." |
| 0:10 | How it works + NASA data | *(screen-record)* Select **pressurized rover** → ranked materials by Flame Hazard Index → click a record: source link, verified quote, formula. "Built on NASA's PSI combustion database — decades of real microgravity fire experiments." |
| 0:20–0:30 | The future | "Before Artemis, before the Moon Base, every material choice — checked against decades of NASA experiments in seconds. The same data is already making firefighters safer here on Earth." |

## 2. Project page fields (copy, edit, ship)

**Project Name:** `PYRO-0G`

**High-Level Summary:**
> An interactive, SI-powered dashboard that summarizes, ranks, and interprets NASA's
> microgravity combustion research to deliver fire-safety insights for human space
> exploration. A local LLM turns each PSI Combustion Science investigation into a
> structured record (fuel, O₂, pressure, airflow, gravity, outcome, evidence quote);
> a transparent Flame Hazard Index (0–100) ranks materials and conditions for spacecraft,
> space stations, lunar bases, and pressurized rovers; a "Will it burn?" checker answers
> material-safety questions with citations. Every record is dual-model verified — one AI
> extracts, an independent decision model confirms — and links to its NASA source.

**Detailed description:** cover — what it does (the shipped app: Simulator Workbench with
crew-environment presets, fuel/material picker, live chamber visualization, Flame Hazard
Index dial + exposed formula; Test Matrix & Compare with environment×outcome matrix and
top-hazard cards; Mission Impact & Spinoffs timeline; per-record evidence inspector with
verbatim quote, NTRS source, dual-model verdict; CSV export of the full dataset),
how it works (pipeline: `corpus/` PSI page text → `extract_records.py` (multi-provider
extraction: gemini-2.5-flash, gpt-5.4-mini, GLM manual re-extraction — model logged per
record) → `verify_records.py` (independent decision-model ladder: jev-1.13-free →
jev-1.13 → gemini-decision-1 → gpt-6-luna-decision → Llama self-check → human review)
→ `build_site_data.py` → static cockpit),
benefits (mission planners, researchers — the challenge's named audience), tools
(Python pipeline calling model APIs + Ollama fallback; frontend: vanilla JS +
Canvas, deployed on Vercel; data: PSI/NTRS).

**Use of SI (disclosure):** extraction by gemini-2.5-flash and gpt-5.4-mini (per-record
model shown in the app's inspector), GLM glm-5.3-flash-free for manual lens re-extraction;
verification by independent decision models (jev-1.13-free → jev-1.13 → gemini-decision-1
→ gpt-6-luna-decision → Llama self-check → human review); coding assistant used for
implementation. Code/data acknowledgment in metadata.
Demo uses screen recordings only — no SI-generated imagery.

**NASA data:** *NASA Physical Sciences Informatics (PSI) — Combustion Science repository*;
*A Researcher's Guide to ISS Combustion Science* (2015); NTRS (Saffire reports).
Investigations used: BASS, BASS-II, Saffire-I/II/III, SAME, SAME-R, FLEX, DAFT, DAFT-2.
(Required field for Global Award eligibility — be specific.)

**References:** every source in `sources.csv` + libraries (Python pipeline: model-provider
APIs + Ollama fallback; frontend: vanilla JS + Canvas + SVG, no framework;
hosting: Vercel; fonts: JetBrains Mono stack with system-mono fallback).

**Demo video:** screen layer pre-recorded and beat-timed to this script:
`pitch/pyro-0g-30s-demo.mp4` (≤30s, live app only, no SI-generated visuals).
Add the narration read-aloud over it, trim to ≤30s, upload to the Project page.

## 3. Pre-submit checklist

- [ ] All teammates: same Local Event, not waitlisted, on Members tab (max 6, no adds later)
- [ ] Demo: ≤30s video **or** ≤7 slides — timed, public link, tested in a private browser
- [ ] Every required field complete, all English
- [ ] NASA data field names PSI explicitly
- [ ] SI disclosure filled; any SI-generated image/video watermarked (ideally: none)
- [ ] Both boxes checked: Terms & Conditions + "Confirm All Work is Original"
- [ ] Hosted app URL live, no DEMO banner, FortiGuard classification requested (company: "N/A")
- [ ] No likenesses of under-18s anywhere
- [ ] **"Submit for Judging" clicked ≥2h before local deadline** (saving ≠ submitting;
      resubmits allowed until close — last one counts)
- [ ] Participant certificate downloaded

## 4. Award targeting

Judged 1–5 on **Impact · Creativity · Validity · Relevance · Presentation** at every level.
Primary: **Best Use of Data** (making PSI accessible). Secondary: Best Use of Science,
Best Use of Technology. Timeline: Global Nominees Dec 3 → Finalists Dec 17 → Winners Jan 26.

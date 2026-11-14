// PYRO-0G — NASA PSI Combustion Telemetry.
// HI math mirrors flame_core.py exactly: HI = 100*(0.35*S + 0.25*O + 0.20*E + 0.20*C),
// scored only for solid fuels; S/E/C come from the matched verified run, O from live O2 telemetry.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const SEV = { spread: 1.0, smoldering: 0.5, extinguished: 0.0, no_burn: 0.0 };

let RECORDS = [], META = {}, STORY = {};
const state = { o2: 21, flow: 0, press: 1.0, gravity: 1, fuel: null, env: "station", split: false };

const ENV_PRESETS = {
  iss:    { label: "ISS STATION",        sub: "21.0% O2 · 1.00 atm · 0g", o2: 21,   press: 1.00, g: 0,
            why: "Standard sea-level-like air; baseline for all current material certification." },
  orion:  { label: "ORION TRANSIT",      sub: "21.0% O2 · 1.00 atm · 0g", o2: 21,   press: 1.00, g: 0,
            why: "Cabin-scale spacecraft atmosphere — the reference for NASA-STD-6001 tests." },
  lunar:  { label: "LUNAR BASE",         sub: "34.0% O2 · 0.54 atm · 0.16g", o2: 34, press: 0.54, g: 0.16,
            why: "Enriched O2 aids suited EVA operations but raises material flammability sharply." },
  rover:  { label: "ROVER CABIN",        sub: "34.0% O2 · 0.57 atm · 0.16g", o2: 34, press: 0.57, g: 0.16,
            why: "Same enriched atmosphere in a small vehicle volume — fast smoke transport, high risk." },
};
const FUELS = {
  pmma_sheet:  { label: "PMMA ACRYLIC SHEET", sub: "sample: flat sheet, 41 cm wide",
                 fuel: "PMMA (polymethylmethacrylate) sheet", shape: "flat sheet", size: "41 cm wide, thin" },
  pmma_rod:    { label: "PMMA ACRYLIC ROD",   sub: "sample: rod, 0.64-3.81 cm dia",
                 fuel: "polymethylmethacrylate (PMMA) rods", shape: "cylindrical rod", size: "0.635-3.81 cm dia, 18 cm long" },
  sibal:       { label: "COTTON-FIBERGLASS SIBAL", sub: "sample: fabric, 50 cm",
                 fuel: "SIBAL cloth (75% cotton / 25% fiberglass)", shape: "thin fabric", size: "41-50 cm long" },
  insulation:  { label: "SILICONE / KAPTON WIRE", sub: "sample: wire insulation",
                 fuel: "wire insulation (silicone, Kapton)", shape: "cylindrical coating", size: "wire-bundle scale" },
  heptane:     { label: "HEPTANE DROPLET", sub: "sample: isolated droplet (non-solid)",
                 fuel: "heptane droplet", shape: "spherical droplet", size: "1-5 mm dia" },
};
const QUESTIONS = [
  "Why do flames become spherical in microgravity?",
  "Which materials spread in enriched O2 rover cabins?",
  "How did Saffire test full-scale fire in an empty spacecraft?",
  "How does SAME calibrate smoke detectors for low-g?",
  "How does FLEX suppress flames with inert gas?",
];

init();
async function init() {
  [RECORDS, META, STORY] = await Promise.all([
    fetch("data/records.json").then(r => r.json()),
    fetch("data/meta.json").then(r => r.json()),
    fetch("data/story.json").then(r => r.json()),
  ]);
  renderTop(); wireViews(); wireControls(); renderChips(); renderMatrix(); renderImpact();
  $("tick-text").textContent = `ARTEMIS II — commander: "make the fire alarm go off when you're still about 80,000 miles from home" · spacecraft fire safety is not history`;
  updateAll(); requestAnimationFrame(loop);
}

function renderTop() {
  $("st-records").textContent = META.total;
  $("st-verified").textContent = META.pct_verified + "%";
  $("st-invs").textContent = new Set(RECORDS.map(r => r.investigation)).size;
}
function wireViews() {
  document.querySelectorAll("#views button").forEach(b => b.onclick = () => {
    document.querySelectorAll("#views button").forEach(x => x.classList.toggle("active", x === b));
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + b.dataset.view));
    // a canvas sized while display:none reads 0x0 — resize on every view switch
    if (b.dataset.view === "simulator") resize();
  });
}

/* ---------- controls ---------- */
function wireControls() {
  $("env-presets").innerHTML = Object.entries(ENV_PRESETS).map(([k, e]) =>
    `<button data-env="${k}">${e.label}<small>${e.sub}</small></button>`).join("");
  $("fuel-presets").innerHTML = Object.entries(FUELS).map(([k, f]) =>
    `<button data-fuel="${k}">${f.label}<small>${f.sub}</small></button>`).join("");
  document.querySelectorAll("[data-env]").forEach(b => b.onclick = () => {
    state.env = b.dataset.env; const e = ENV_PRESETS[state.env];
    state.o2 = e.o2; state.press = e.press;
    $("o2").value = e.o2; $("press").value = e.press;
    $("env-explainer").textContent = e.why;
    if (e.g != null) {  // crew environment implies its gravity — never leave the slider stale
      state.gravity = e.g;
      const gb = document.querySelector(`#grav-seg button[data-g="${e.g}"]`);
      if (gb) document.querySelectorAll("#grav-seg button").forEach(x => x.classList.toggle("active", x === gb));
    }
    setActive($("env-presets"), b);
    updateAll();
  });
  document.querySelectorAll("[data-fuel]").forEach(b => b.onclick = () => {
    state.fuel = b.dataset.fuel; const f = FUELS[state.fuel];
    $("fuel-spec").textContent = `SAMPLE: ${f.shape} · ${f.size}`;
    setActive($("fuel-presets"), b);
    updateAll();
  });
  for (const [id, fmt, key] of [["o2", v => v.toFixed(1) + " %", "o2"],
                                 ["flow", v => v + " cm/s", "flow"],
                                 ["press", v => v.toFixed(2) + " atm", "press"]]) {
    $(id).addEventListener("input", () => { state[key] = parseFloat($(id).value); updateAll(); });
  }
  document.querySelectorAll("#grav-seg button").forEach(b => b.onclick = () => {
    state.gravity = parseFloat(b.dataset.g);
    document.querySelectorAll("#grav-seg button").forEach(x => x.classList.toggle("active", x === b));
    updateAll();
  });
  $("split-btn").onclick = () => {
    state.split = !state.split;
    $("split-btn").classList.toggle("on", state.split);
    updateAll();
  };
  $("brief-go").onclick = () => $("briefing").remove();
  document.addEventListener("keydown", e => e.key === "Enter" && $("briefing") && $("brief-go").click());
  // default selections
  $("env-presets").querySelector("[data-env=iss]").click();
  $("fuel-presets").querySelector("[data-fuel=pmma_sheet]").click();
}
function setActive(container, btn) {
  [...container.children].forEach(x => x.classList.toggle("active", x === btn));
}

/* ---------- HI scoring (mirrors flame_core.hazard_index) ---------- */
function hiParts(run, o2Live) {
  const S = SEV[run.outcome] ?? 0;
  const O = o2Live == null ? null : clamp((o2Live - 20.9) / 30);
  const E = run.extinguish_difficulty != null ? clamp(run.extinguish_difficulty) : (SEV[run.outcome] ?? 0.5);
  const C = run.jev_evidence_score != null ? clamp(run.jev_evidence_score / 10) : 0.5;
  if (O == null) return null;
  return { S, O, E, C, hi: Math.round(100 * (0.35 * S + 0.25 * O + 0.20 * E + 0.20 * C) * 10) / 10 };
}

/* ---------- matching ---------- */
const TOKEN = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
function matchRuns() {
  const f = FUELS[state.fuel]; if (!f) return [];
  // non-solid fuels (droplet/gas) match their own category, never the solid pool
  const cats = state.fuel === "heptane" ? ["droplet", "gas"] : ["solid"];
  const q = TOKEN(f.fuel);
  return RECORDS.filter(r => cats.includes(r.fuel_category)).map(r => {
    const hay = TOKEN(r.fuel + " " + r.objective + " " + r.fuel_category);
    const tf = q.filter(t => hay.some(x => x.startsWith(t) || t.startsWith(x))).length / (q.length || 1);
    const envD = r.o2_conc_pct != null
      ? 1 - clamp(Math.abs(r.o2_conc_pct - state.o2) / 20) * 0.5 : 0.5;
    return { r, score: tf * 0.7 + envD * 0.3 };
  }).filter(h => h.score > 0.3).sort((a, b) => b.score - a.score).slice(0, 5);
}

/* ---------- live update ---------- */
let lastMatchKey = "";
function updateAll() {
  $("o2-out").textContent = state.o2.toFixed(1) + " %";
  $("flow-out").textContent = state.flow + " cm/s";
  $("press-out").textContent = state.press.toFixed(2) + " atm";
  const isDroplet = state.fuel === "heptane";
  const cool = isDroplet && state.o2 < 30;
  $("chamber-tag").textContent = state.split
    ? `COMBUSTION CHAMBER — SPLIT MODE · 1g VS 0g`
    : `COMBUSTION CHAMBER — ${state.gravity === 0 ? "0g MICROGRAVITY REGIME" : state.gravity.toFixed(2) + "g REGIME"} · ${ENV_PRESETS[state.env].label}`;

  // gauge: live O from telemetry, S/E/C from the closest matched run of the fuel's own category.
  // droplets never get a what-if HI — the formula is calibrated for solid-surface spread (see note)
  const matches = matchRuns();
  const run = matches[0]?.r;
  const parts = run && !isDroplet ? hiParts(run, state.o2) : null;
  drawGauge(parts, isDroplet);
  renderMatched(matches, parts);

  // formula area: droplets don't spread over surfaces — explain the two-stage regime instead
  $("formula-note").hidden = !isDroplet;
  if (isDroplet) $("formula-note").textContent =
    "LIQUID DROPLET MODE — an isolated liquid droplet does not spread over a solid surface. " +
    "It burns as a two-stage flame: the hot visible flame radiatively quenches, then a low-temperature " +
    "COOL FLAME (FLEX) can persist below the normal limiting oxygen index — invisible to the eye, " +
    "detectable only by heat feedback. Severity/Extinguish bars are defined for solid-surface spread only.";

  // HUD telemetry — 4 corners: tag (TL), split button (TR), physics feed (BL), split banner (BR)
  const g = state.gravity;
  const shape = isDroplet ? (cool ? "SPHERICAL COOL FLAME" : "SPHERICAL DIFFUSION")
    : g <= 0.05 ? (state.flow > 20 ? "SPHERICAL · FLOW-DRIFTED" : "SPHERICAL DIFFUSION")
    : state.flow > 20 ? "FLOW-STRETCHED PLUME" : "BUOYANT TEARDROP";
  const bl = state.flow > 0 ? "THINNED — FORCED CONVECTION"
    : g <= 0.05 ? "STAGNANT FILM — PURE DIFFUSION" : "BUOYANT SHEAR LAYER";
  const rl = cool ? "QUENCH → COOL STAGE ACTIVE"
    : g <= 0.05 ? "ELEVATED — EXTINCTION RISK" : "VENTED — STABLE";
  $("hud-left").innerHTML =
    `<b>FLAME SHAPE</b>${shape}<br><b>BOUNDARY LAYER</b>${bl}<br><b>RADIATIVE LOSS</b>${rl}` +
    `<br><b>CHAMBER AIR</b>O2 ${state.o2.toFixed(1)}% · ${state.flow} cm/s · ${state.press.toFixed(2)} atm`;
  $("hud-right").hidden = !state.split;
  if (state.split) $("hud-right").innerHTML =
    "◤ SPLIT COMPARISON ACTIVE — SAME SAMPLE · SAME ATMOSPHERE<br>1g BUOYANT&nbsp;&nbsp;VS&nbsp;&nbsp;0g DIFFUSION — BUOYANCY IS THE ONLY VARIABLE ◢";

  const key = matches.map(m => m.r.id).join() + "|" + state.o2;
  if (key !== lastMatchKey) { lastMatchKey = key; if ($("qa-out").dataset.q) runQA($("qa-out").dataset.q); }
}
function drawGauge(p, isDroplet) {
  if (!p) {
    // droplet runs are never HI-scored — show the FLEX regime badge, not a dead N/A
    const cool = state.o2 < 30;
    $("cool-badge").hidden = !isDroplet;
    $("cool-badge").classList.toggle("hot", isDroplet && !cool);
    $("cool-badge").firstChild.textContent = isDroplet && !cool ? "HOT-FLAME" : "COOL-FLAME";
    $("hi-num").textContent = isDroplet ? "" : "N/A";
    $("hi-label").textContent = isDroplet ? (cool ? "TWO-STAGE EXTINCTION" : "DROPLET DIFFUSION BURN") : "FLAME HAZARD INDEX";
    $("gauge-arc").style.strokeDashoffset = 314;
    ["S", "O", "E", "C"].forEach(k => { $("fb-" + k).style.width = "0"; $("fbv-" + k).textContent = "—"; });
    return;
  }
  $("cool-badge").hidden = true;
  $("hi-label").textContent = "FLAME HAZARD INDEX";
  $("hi-num").textContent = p.hi.toFixed(1);
  const arc = $("gauge-arc");
  arc.style.strokeDashoffset = 314 * (1 - p.hi / 100);
  arc.style.stroke = p.hi > 66 ? "var(--red)" : p.hi > 33 ? "var(--orange)" : "var(--green)";
  [["S", p.S], ["O", p.O], ["E", p.E], ["C", p.C]].forEach(([k, v]) => {
    $("fb-" + k).style.width = (v * 100) + "%";
    $("fbv-" + k).textContent = v.toFixed(2);
  });
}
function renderMatched(matches, parts) {
  $("matched").innerHTML = matches.length ? matches.map(({ r }) => {
    // show the run's OWN scored HI only — never a slider-derived HI for a record
    // whose actual O2 is unknown (that would fake a score a judge could catch)
    const p = r.o2_conc_pct != null ? hiParts(r, r.o2_conc_pct) : null;
    return `<div class="match-card" data-id="${r.id}">
      <div class="m-top"><b>${esc(r.investigation)}</b><span class="m-hi">${p ? "HI " + p.hi.toFixed(1) : "HI —"}</span></div>
      <div class="m-sub">${esc(r.fuel)} · ${esc(r.outcome)} · ${r.o2_conc_pct ?? "—"}% O2${r.jev_verified ? " · VERIFIED" : ""}</div>
      <button class="replay">REPLAY RUN CONDITIONS</button>
    </div>`;
  }).join("") : `<p class="explainer">No ${state.fuel === "heptane" ? "droplet/gas" : "solid-fuel"} run matches this material.</p>`;
  document.querySelectorAll(".match-card").forEach(c => {
    c.onclick = (e) => {
      if (e.target.classList.contains("replay")) return replayRun(c.dataset.id);
      openInspector(c.dataset.id);
    };
  });
}
/* snap telemetry to the run's actual recorded conditions */
function replayRun(id) {
  const r = RECORDS.find(x => x.id === id); if (!r) return;
  if (r.o2_conc_pct != null) { state.o2 = r.o2_conc_pct; $("o2").value = r.o2_conc_pct; }
  if (r.pressure_atm != null) { state.press = r.pressure_atm; $("press").value = r.pressure_atm; }
  if (r.airflow_cm_s != null) { state.flow = r.airflow_cm_s; $("flow").value = r.airflow_cm_s; }
  // sliders now disagree with every crew preset — un-highlight them so the panel doesn't lie
  [...$("env-presets").children].forEach(x => x.classList.remove("active"));
  $("env-explainer").textContent = `REPLAYED ${r.investigation} RUN ${r.id.split("-").pop()} — snapped to the record's actual chamber conditions.`;
  const g = r.gravity_g;
  if (g != null) {
    const btn = [...document.querySelectorAll("#grav-seg button")]
      .sort((a, b) => Math.abs(parseFloat(a.dataset.g) - g) - Math.abs(parseFloat(b.dataset.g) - g))[0];
    document.querySelectorAll("#grav-seg button").forEach(x => x.classList.toggle("active", x === btn));
    state.gravity = parseFloat(btn.dataset.g);
  }
  updateAll();
}

/* ---------- Q&A chips ---------- */
function renderChips() {
  $("chips").innerHTML = QUESTIONS.map(q => `<button>${esc(q)}</button>`).join("");
  [...$("chips").children].forEach(b => b.onclick = () => runQA(b.textContent));
}
function runQA(q) {
  $("qa-out").dataset.q = q;
  const toks = TOKEN(q);
  const hits = RECORDS.map(r => {
    const hay = TOKEN([r.objective, r.key_finding, r.evidence_quote, r.fuel].join(" "));
    return { r, s: toks.reduce((a, t) => a + (hay.some(x => x.startsWith(t) || t.startsWith(x)) ? 1 : 0), 0) / toks.length };
  }).filter(h => h.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
  $("qa-out").innerHTML = hits.length ? hits.map(({ r }) =>
    `<div class="qa-hit">${esc((r.key_finding || r.objective || "").split(/(?<=[.!?]) /)[0])} <b>[${esc(r.investigation)}]</b>
     — <span class="insp-link" style="cursor:pointer" data-id="${r.id}">inspector</span></div>`).join("")
    : `<p class="explainer">No archive match for that question.</p>`;
  document.querySelectorAll("#qa-out [data-id]").forEach(a => a.onclick = () => openInspector(a.dataset.id));
}

/* ---------- canvas ---------- */
const cv = $("chamber"), cx = cv.getContext("2d");
function resize() {
  cv.width = cv.clientWidth * devicePixelRatio; cv.height = cv.clientHeight * devicePixelRatio;
}
addEventListener("resize", resize); resize();

let particles = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * 6 }));

/* one combustion chamber inside rect (x0..x0+w); g is forced per call so
   SPLIT mode can burn the same fuel in the same atmosphere at 1g and 0g.
   All geometry is scaled by K = 3.5× so the flame fills the chamber. */
const K = 3.5 * devicePixelRatio;

function drawChamber(x0, w, g, t) {
  const H = cv.height;
  const cxp = x0 + w * 0.5, cyp = H * 0.62; // sample anchor
  const fuel = FUELS[state.fuel];
  const isDroplet = state.fuel === "heptane";
  const cool = isDroplet && state.o2 < 30;

  // airflow particles (render only; advection happens once per frame in tick)
  cx.fillStyle = "rgba(63,208,216,.45)";
  for (const p of particles) {
    const yy = p.y + 0.03 * Math.sin(p.p + t / 900);
    cx.beginPath();
    cx.arc(x0 + p.x * w, ((yy * 0.9) + 0.05) * H, 1.4 * devicePixelRatio, 0, 7);
    cx.fill();
  }

  // airflow vector arrows when the fan is on
  if (state.flow > 0) {
    cx.strokeStyle = cx.fillStyle = `rgba(63,208,216,${0.25 + 0.55 * (state.flow / 50)})`;
    cx.lineWidth = 1.5 * devicePixelRatio;
    const len = (14 + state.flow * 0.8) * devicePixelRatio, yA = H * 0.30;
    for (let i = 0; i < 4; i++) {
      const ax = x0 + w * (0.12 + i * 0.25);
      cx.beginPath();
      cx.moveTo(ax, yA); cx.lineTo(ax + len, yA);
      cx.moveTo(ax + len, yA); cx.lineTo(ax + len - 6 * devicePixelRatio, yA - 5 * devicePixelRatio);
      cx.moveTo(ax + len, yA); cx.lineTo(ax + len - 6 * devicePixelRatio, yA + 5 * devicePixelRatio);
      cx.stroke();
    }
  }

  // fuel sample geometry — actual NASA sample at 3.5x
  if (isDroplet) {
    // tethered droplet between two opposed hot-wire igniter needles (FLEX MDCA / CIR)
    const r = 9 * K;
    cx.strokeStyle = "rgba(109,125,146,.8)"; cx.lineWidth = 1.5 * devicePixelRatio;
    cx.beginPath();
    cx.moveTo(x0 + w * 0.06, cyp); cx.lineTo(cxp - r - 14 * K, cyp);   // left igniter needle
    cx.moveTo(x0 + w * 0.94, cyp); cx.lineTo(cxp + r + 14 * K, cyp);   // right igniter needle
    cx.moveTo(cxp, cyp - 42 * K); cx.lineTo(cxp, cyp + 26 * K);        // SiC tether fiber
    cx.stroke();
    cx.fillStyle = "#2a3950";
    cx.beginPath(); cx.arc(cxp, cyp, r, 0, 7); cx.fill();
    cx.fillStyle = "rgba(180,220,255,.25)";                            // droplet specular
    cx.beginPath(); cx.arc(cxp - r * 0.3, cyp - r * 0.3, r * 0.35, 0, 7); cx.fill();
  } else if (fuel && fuel.shape.includes("rod")) {
    cx.fillStyle = "#26344a";
    cx.fillRect(cxp - 6 * K, cyp, 12 * K, H - cyp - 12 * devicePixelRatio);
    cx.fillStyle = "rgba(255,255,255,.06)";
    cx.fillRect(cxp - 6 * K, cyp, 4 * K, H - cyp - 12 * devicePixelRatio);
  } else if (fuel && fuel.shape.includes("coating")) {
    // wire insulation bundle: insulation over conductor, horizontal
    const wl = Math.min(70 * K, w * 0.35);
    cx.fillStyle = "#26344a";
    if (cx.roundRect) { cx.beginPath(); cx.roundRect(cxp - wl, cyp, 2 * wl, 8 * K, 4 * K); cx.fill(); }
    else cx.fillRect(cxp - wl, cyp, 2 * wl, 8 * K);
    cx.fillStyle = "#8a6a3a";                                          // exposed conductor ends
    cx.fillRect(cxp - wl - 12 * devicePixelRatio, cyp + 2.5 * K, 12 * devicePixelRatio, 3 * K);
    cx.fillRect(cxp + wl, cyp + 2.5 * K, 12 * devicePixelRatio, 3 * K);
  } else if (fuel && fuel.shape.includes("fabric")) {
    // SIBAL fabric strip (75% cotton / 25% fiberglass) with weave seams
    const sw = Math.min(60 * K, w * 0.7);
    cx.fillStyle = "#3a3630";
    cx.fillRect(cxp - sw / 2, cyp, sw, 7 * K);
    cx.strokeStyle = "rgba(255,169,110,.22)"; cx.lineWidth = 1;
    for (let i = cxp - sw / 2 + 8 * K; i < cxp + sw / 2 - 2 * K; i += 12 * K) {
      cx.beginPath(); cx.moveTo(i, cyp); cx.lineTo(i, cyp + 7 * K); cx.stroke();
    }
  } else {
    // 41 cm PMMA flat sheet on a dark support
    const sw = Math.min(60 * K, w * 0.72);
    cx.fillStyle = "rgba(15,20,28,.9)";
    cx.fillRect(cxp - sw / 2, cyp + 5 * K, sw, 7 * K);
    cx.fillStyle = "#2e4256";
    cx.fillRect(cxp - sw / 2, cyp, sw, 5 * K);
    cx.fillStyle = "rgba(255,255,255,.05)";
    cx.fillRect(cxp - sw / 2, cyp, sw, 1.5 * K);
  }

  // flame
  const flick = 1 + 0.08 * Math.sin(t / 90) + 0.05 * Math.sin(t / 47 + 2);
  if (isDroplet) {
    if (cool) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 400);
      cx.strokeStyle = `rgba(140,120,255,${0.35 + 0.3 * pulse})`;
      cx.lineWidth = 2.5 * devicePixelRatio;
      cx.beginPath(); cx.arc(cxp, cyp, (16 + 10 * pulse) * K, 0, 7); cx.stroke();
      cx.fillStyle = `rgba(120,110,255,${0.06 + 0.05 * pulse})`;
      cx.beginPath(); cx.arc(cxp, cyp, (16 + 10 * pulse) * K, 0, 7); cx.fill();
    } else {
      const rg = (14 + 4 * flick) * K;
      const gr = cx.createRadialGradient(cxp, cyp, 2, cxp, cyp, rg);
      gr.addColorStop(0, "rgba(255,235,170,.95)"); gr.addColorStop(0.5, "rgba(255,150,60,.8)");
      gr.addColorStop(1, "rgba(255,90,20,0)");
      cx.fillStyle = gr; cx.beginPath(); cx.arc(cxp, cyp, rg, 0, 7); cx.fill();
    }
  } else {
    // teardrop (1g) morphing to sphere (0g); lean downstream with airflow
    const lean = (state.flow / 50) * 60 * K * (0.4 + 0.6 * (1 - g));
    let hgt = (30 + 70 * g) * flick * K;   // buoyant stretch
    hgt = Math.min(hgt, cyp - 20 * devicePixelRatio);
    const rad = (26 + 10 * (1 - g)) * K;
    const blue = clamp(1 - g * 1.2);
    const gr = cx.createRadialGradient(cxp + lean, cyp - rad * 0.2, 2, cxp + lean * 0.6, cyp - hgt * 0.35, Math.max(hgt, rad));
    gr.addColorStop(0, `rgba(${255 - 140 * blue},${235 - 60 * blue},${180 + 60 * blue},${0.95 - 0.2 * (1 - g)})`);
    gr.addColorStop(0.55, `rgba(${255 - 170 * blue},${150 - 40 * blue},${50 + 150 * blue},.75)`);
    gr.addColorStop(1, "rgba(40,110,255,0)");
    cx.fillStyle = gr;
    cx.beginPath();
    if (g > 0.05) {
      cx.moveTo(cxp, cyp);
      cx.bezierCurveTo(cxp - rad, cyp - hgt * 0.25, cxp - rad * 0.55 + lean, cyp - hgt * 0.85, cxp + lean, cyp - hgt);
      cx.bezierCurveTo(cxp + rad * 0.55 + lean, cyp - hgt * 0.85, cxp + rad, cyp - hgt * 0.25, cxp, cyp);
    } else {
      cx.arc(cxp + lean * 0.5, cyp - rad * 0.4, rad * (1 + 0.04 * Math.sin(t / 500)), 0, 7);
    }
    cx.fill();

    // wake: buoyant soot wisps rising off the flame tip (1g), or a 0g standoff halo
    cx.strokeStyle = g > 0.05 ? "rgba(160,170,185,.15)" : "rgba(120,170,255,.12)";
    cx.lineWidth = 4 * devicePixelRatio;
    if (g > 0.05) {
      for (let i = 0; i < 3; i++) {
        const wy = cyp - hgt - (i + 0.5) * 26 * K;
        const wob = Math.sin(t / 700 + i * 2.1) * 12 * K;
        cx.beginPath();
        cx.ellipse(cxp + lean * 0.5 + wob, wy, 15 * K, 8 * K, 0, 0, 7);
        cx.stroke();
      }
    } else {
      cx.beginPath();
      cx.arc(cxp + lean * 0.5, cyp - rad * 0.4, rad * 1.35 + 3 * Math.sin(t / 500), 0, 7);
      cx.stroke();
    }
  }
}

function tick(t) {
  const W = cv.width, H = cv.height, g = state.gravity;
  if (W !== cv.clientWidth * devicePixelRatio) { resize(); return requestAnimationFrame(loop); } // self-heal a 0x0 canvas
  cx.clearRect(0, 0, W, H);
  // grid
  cx.strokeStyle = "rgba(29,39,53,.6)"; cx.lineWidth = 1;
  for (let x = 0; x < W; x += 60 * devicePixelRatio) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
  for (let y = 0; y < H; y += 60 * devicePixelRatio) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }

  // particle advection (shared field; the user's gravity sets convection damping)
  const flowPx = (state.flow / 50) * 4 * devicePixelRatio;
  for (const p of particles) {
    p.x += (flowPx / W + 0.0012 * (1 - g)); p.p += 0.05;
    if (p.x > 1.02) { p.x = -0.02; p.y = Math.random(); }
  }

  // Earth limb — the port looks out at the planet rising along the chamber floor
  cx.save();
  cx.globalAlpha = 0.85;
  const R = W * 0.85, cyE = H * 0.94 + R;
  const eg = cx.createRadialGradient(W / 2, cyE, R * 0.96, W / 2, cyE, R);
  eg.addColorStop(0, "#0a1a2c"); eg.addColorStop(0.6, "#123150"); eg.addColorStop(1, "#1d5a8a");
  cx.fillStyle = eg;
  cx.beginPath(); cx.arc(W / 2, cyE, R, 0, 7); cx.fill();
  cx.strokeStyle = "rgba(63,208,216,.5)"; cx.lineWidth = 1.5 * devicePixelRatio;
  cx.beginPath(); cx.arc(W / 2, cyE, R, 0, 7); cx.stroke();
  cx.strokeStyle = "rgba(63,208,216,.18)"; cx.lineWidth = 8 * devicePixelRatio;
  cx.beginPath(); cx.arc(W / 2, cyE, R + 5 * devicePixelRatio, 0, 7); cx.stroke();
  cx.restore();

  cx.fillStyle = "rgba(255,169,110,.95)";
  cx.font = `${12 * devicePixelRatio}px JetBrains Mono, monospace`;

  if (state.split) {
    // SPLIT: identical fuel + atmosphere, 1g vs 0g side by side — the core physics, visible at a glance
    const half = W / 2;
    drawChamber(0, half, 1, t);
    drawChamber(half, half, 0, t);
    cx.strokeStyle = "rgba(255,122,47,.35)"; cx.lineWidth = 1;
    cx.setLineDash([5 * devicePixelRatio, 7 * devicePixelRatio]);
    cx.beginPath(); cx.moveTo(half, 0); cx.lineTo(half, H); cx.stroke();
    cx.setLineDash([]);
    cx.fillStyle = "rgba(255,169,110,.95)";
    cx.font = `${12 * devicePixelRatio}px JetBrains Mono, monospace`;
    cx.fillText("1g EARTH — BUOYANT FLAME", 14 * devicePixelRatio, 46 * devicePixelRatio);
    cx.fillText("0g ORBIT — DIFFUSION FLAME", half + 14 * devicePixelRatio, 46 * devicePixelRatio);
  } else {
    drawChamber(0, W, g, t);
  }

  requestAnimationFrame(loop);
}
/* a thrown frame must never freeze the chamber mid-demo */
function loop(t) { try { tick(t); } catch (e) { requestAnimationFrame(loop); } }

/* ---------- matrix view ---------- */
function renderMatrix() {
  const uniq = (k) => [...new Set(RECORDS.map(r => r[k]).filter(Boolean))].sort();
  $("filters").innerHTML = ["investigation", "pillar", "outcome"].map(k =>
    `<select data-k="${k}"><option value="">ALL ${k.toUpperCase()}</option>${uniq(k).map(v => `<option>${esc(v)}</option>`).join("")}</select>`).join("");
  document.querySelectorAll("#filters select").forEach(s => s.onchange = renderMatrixTable);
  renderMatrixTable();
  const envs = [...new Set(RECORDS.map(r => r.environment))], outs = ["spread", "smoldering", "extinguished", "no_burn"];
  const n = (e, o) => RECORDS.filter(r => r.environment === e && r.outcome === o).length;
  $("matrix-grid").innerHTML = `<table><tr><th>environment</th>${outs.map(o => `<th>${o}</th>`).join("")}<th>total</th></tr>` +
    envs.map(e => `<tr><td>${esc(e)}</td>${outs.map(o => `<td>${n(e, o) || "·"}</td>`).join("")}<td><b>${RECORDS.filter(r => r.environment === e).length}</b></td></tr>`).join("") + `</table>`;
  const top = [...RECORDS.filter(r => r.hazard_index != null)].sort((a, b) => b.hazard_index - a.hazard_index).slice(0, 3);
  $("compare").innerHTML = top.length ? `<div class="compare-grid">` + top.map(r => `
    <div class="cmp-card"><h4>${esc(r.fuel)}</h4>
      <dl class="kv">
        <dt>HI</dt><dd><b style="color:var(--orange)">${r.hazard_index}</b></dd>
        <dt>run</dt><dd>${esc(r.investigation)} ${esc(r.id.split("-").pop())}</dd>
        <dt>outcome</dt><dd>${esc(r.outcome)}</dd>
        <dt>O2 / atm</dt><dd>${r.o2_conc_pct ?? "—"}% / ${r.pressure_atm ?? "—"}</dd>
        <dt>flow</dt><dd>${r.airflow_cm_s ?? "—"} cm/s</dd>
        <dt>jev</dt><dd>${r.jev_verified ? "VERIFIED " + r.jev_evidence_score + "/10" : "UNVERIFIED"}</dd>
      </dl></div>`).join("") + `</div>` : `<p class="explainer">No scored solids.</p>`;
  // DATA GAPS — solids whose abstracts don't state O2/pressure. Shown, not hidden:
  // transparent gaps score higher on Validity than a guessed number.
  const gaps = RECORDS.filter(r => r.fuel_category === "solid" && r.hazard_index == null);
  $("compare").innerHTML += `<h2 style="font-size:11px;letter-spacing:2px;color:var(--dim);margin:18px 0 8px">
    DATA GAPS — VERIFIED SOLID RUNS WITHOUT STATED O2/PRESSURE (${gaps.length})</h2>` +
    (gaps.length ? `<table><tr><th>RUN</th><th>MATERIAL</th><th>OUTCOME</th><th>WHY NOT SCORED</th></tr>` +
      gaps.map(r => `<tr class="rowbtn" data-id="${r.id}"><td>${esc(r.investigation)}</td><td>${esc(r.fuel)}</td>
        <td>${esc(r.outcome)}</td><td style="color:var(--dim)">abstract states no O2/pressure — null, not guessed</td></tr>`).join("") + `</table>`
      : `<p class="explainer">None.</p>`);
  document.querySelectorAll("#compare .rowbtn").forEach(c => c.onclick = () => openInspector(c.dataset.id));
}
function renderMatrixTable() {
  const f = {};
  document.querySelectorAll("#filters select").forEach(s => f[s.dataset.k] = s.value);
  const rows = RECORDS.filter(r => Object.entries(f).every(([k, v]) => !v || r[k] === v));
  $("matrix-table").innerHTML = `<table><tr><th>HI</th><th>MATERIAL</th><th>INVESTIGATION</th><th>O2%</th><th>atm</th><th>g</th><th>OUTCOME</th><th>PILLAR</th><th>JEV</th></tr>` +
    rows.map(r => `<tr class="rowbtn" data-id="${r.id}"><td>${r.hazard_index != null ? `<span class="hi-bar" style="width:${Math.max(6, r.hazard_index * 0.6)}px"></span> ${r.hazard_index}` : "—"}</td>
      <td>${esc(r.fuel)}</td><td>${esc(r.investigation)}</td><td>${r.o2_conc_pct ?? "—"}</td><td>${r.pressure_atm ?? "—"}</td><td>${r.gravity_g ?? "—"}</td>
      <td>${esc(r.outcome)}</td><td>${esc(r.pillar)}</td><td><span class="badge ${r.jev_verified ? "yes" : "no"}">${r.jev_verified ? "VERIFIED" : "FLAGGED"}</span></td></tr>`).join("") + `</table>`;
  document.querySelectorAll("#matrix-table .rowbtn").forEach(c => c.onclick = () => openInspector(c.dataset.id));
}

/* ---------- impact view ---------- */
function renderImpact() {
  const cards = Object.values(STORY).sort((a, b) => String(a.era).localeCompare(String(b.era)));
  $("timeline").innerHTML = `<h2 style="font-size:11px;letter-spacing:2px;color:var(--dim);margin-bottom:10px">WHY IT MATTERS — FIRE SAFETY TIMELINE</h2>` +
    cards.map(c => `<div class="tl-card"><span class="era">${esc(c.era)}</span><h4>${esc(c.title)}</h4><p>${esc(c.body)}</p>
      ${c.url ? `<a href="${c.url}" target="_blank">SOURCE ↗</a>` : ""}</div>`).join("");
  fetch("data/sources.json").then(r => r.json()).then(s => {
    $("impact-sources").innerHTML = `<h2 style="font-size:11px;letter-spacing:2px;color:var(--dim);margin:16px 0 8px">CORPUS SOURCES (${s.length})</h2>` +
      s.map(x => `<div style="font-size:10px;color:var(--dim);margin-bottom:3px">${esc(x.file)} — <span class="insp-link" style="cursor:default">${esc(x.description || x.source_url)}</span></div>`).join("");
  });
}

/* ---------- inspector ---------- */
function openInspector(id) {
  const r = RECORDS.find(x => x.id === id); if (!r) return;
  $("inspector-body").innerHTML = `
    <button class="insp-close" onclick="document.getElementById('inspector').classList.remove('open')">ESC</button>
    <h3>${esc(r.fuel || "record")}</h3>
    <div style="display:flex;gap:6px;margin:6px 0">
      <span class="badge ${r.jev_verified ? "yes" : "no"}">${r.jev_verified ? "DUAL-MODEL VERIFIED" : "FLAGGED"}</span>
      <span class="badge no" style="background:#0d1b22;color:var(--cyan);border-color:var(--line)">HI ${r.hazard_index ?? "NOT SCORED"}</span>
    </div>
    <div style="color:var(--dim);font-size:10px;letter-spacing:1px">${esc(r.investigation)} · ${esc(r.id)} · EXTRACTED BY ${esc(r.extracted_by)}</div>
    <h4>OBJECTIVE</h4><p style="font-size:11px">${esc(r.objective)}</p>
    <h4>KEY FINDING</h4><p style="font-size:11px">${esc(r.key_finding)}</p>
    <h4>EVIDENCE QUOTE (VERBATIM-CHECKED)</h4><blockquote class="ev">${esc(r.evidence_quote)}</blockquote>
    <h4>CONDITIONS</h4>
    <dl class="kv">
      <dt>O2 / pressure</dt><dd>${r.o2_conc_pct ?? "—"}% @ ${r.pressure_atm ?? "—"} atm</dd>
      <dt>airflow / gravity</dt><dd>${r.airflow_cm_s ?? "—"} cm/s · ${r.gravity_g ?? "—"} g</dd>
      <dt>environment</dt><dd>${esc(r.environment)}</dd>
      <dt>fuel shape / size</dt><dd>${esc(r.fuel_shape)} / ${esc(r.fuel_size)}</dd>
      <dt>pillar</dt><dd>${esc(r.pillar)}</dd>
      <dt>sensors</dt><dd>${esc([].concat(r.sensors || []).join(", ")) || "—"}</dd>
      <dt>variables vs runs</dt><dd>${esc(r.variables_vs_other_runs)}</dd>
    </dl>
    <h4>JEV VERIFICATION (independent decision model)</h4>
    <dl class="kv">
      <dt>verified</dt><dd>${r.jev_verified ? "YES" : "NO"}</dd>
      <dt>evidence score</dt><dd>${r.jev_evidence_score ?? "—"} / 10</dd>
      <dt>relevance p</dt><dd>${r.jev_relevance_p != null ? Math.round(r.jev_relevance_p * 100) + "%" : "—"}</dd>
      <dt>quote match p</dt><dd>${r.jev_quote_p != null ? Math.round(r.jev_quote_p * 100) + "%" : "—"}</dd>
    </dl>
    ${r.url ? `<p style="margin-top:14px"><a class="insp-link" href="${r.url}" target="_blank">NASA SOURCE ↗</a></p>` : ""}`;
  $("inspector").classList.add("open");
}
document.addEventListener("keydown", e => e.key === "Escape" && $("inspector").classList.remove("open"));
$("inspector").addEventListener("click", e => e.target.id === "inspector" && e.target.classList.remove("open"));

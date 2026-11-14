// PYRO-0G — NASA PSI Combustion Telemetry.
// HI math mirrors flame_core.py exactly: HI = 100*(0.35*S + 0.25*O + 0.20*E + 0.20*C),
// scored only for solid fuels; S/E/C come from the matched verified run, O from live O2 telemetry.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const SEV = { spread: 1.0, smoldering: 0.5, extinguished: 0.0, no_burn: 0.0 };

let RECORDS = [], META = {}, STORY = {};
const state = { o2: 21, flow: 0, press: 1.0, gravity: 1, fuel: null, env: "station" };

const ENV_PRESETS = {
  iss:    { label: "ISS STATION",        sub: "21.0% O2 / 1.00 atm", o2: 21,   press: 1.00,
            why: "Standard sea-level-like air; baseline for all current material certification." },
  orion:  { label: "ORION TRANSIT",      sub: "21.0% O2 / 1.00 atm", o2: 21,   press: 1.00,
            why: "Cabin-scale spacecraft atmosphere — the reference for NASA-STD-6001 tests." },
  lunar:  { label: "LUNAR BASE",         sub: "34.0% O2 / 0.54 atm", o2: 34,   press: 0.54,
            why: "Enriched O2 aids suited EVA operations but raises material flammability sharply." },
  rover:  { label: "ROVER CABIN",        sub: "34.0% O2 / 0.57 atm", o2: 34,   press: 0.57,
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
  updateAll(); requestAnimationFrame(tick);
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
  const q = TOKEN(f.fuel);
  return RECORDS.filter(r => r.fuel_category === "solid").map(r => {
    const hay = TOKEN(r.fuel + " " + r.objective);
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
  $("chamber-tag").textContent =
    `COMBUSTION CHAMBER — ${state.gravity === 0 ? "0g MICROGRAVITY REGIME" : state.gravity.toFixed(2) + "g REGIME"} · ${ENV_PRESETS[state.env].label}`;

  // gauge: live O from telemetry, S/E/C from the closest matched solid run
  const matches = matchRuns();
  const run = matches[0]?.r;
  const parts = run ? hiParts(run, state.o2) : null;
  drawGauge(parts);
  renderMatched(matches, parts);

  const key = matches.map(m => m.r.id).join() + "|" + state.o2;
  if (key !== lastMatchKey) { lastMatchKey = key; if ($("qa-out").dataset.q) runQA($("qa-out").dataset.q); }
}
function drawGauge(p) {
  if (!p) {
    $("hi-num").textContent = "N/A";
    $("gauge-arc").style.strokeDashoffset = 314;
    ["S", "O", "E", "C"].forEach(k => { $("fb-" + k).style.width = "0"; $("fbv-" + k).textContent = "—"; });
    return;
  }
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
    const p = hiParts(r, r.o2_conc_pct ?? state.o2);
    return `<div class="match-card" data-id="${r.id}">
      <div class="m-top"><b>${esc(r.investigation)}</b><span class="m-hi">${p ? "HI " + p.hi.toFixed(1) : "HI —"}</span></div>
      <div class="m-sub">${esc(r.fuel)} · ${esc(r.outcome)} · ${r.o2_conc_pct ?? "—"}% O2${r.jev_verified ? " · VERIFIED" : ""}</div>
    </div>`;
  }).join("") : `<p class="explainer">No solid-fuel run matches this material.</p>`;
  document.querySelectorAll(".match-card").forEach(c => c.onclick = () => openInspector(c.dataset.id));
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
function tick(t) {
  const W = cv.width, H = cv.height, g = state.gravity;
  cx.clearRect(0, 0, W, H);
  // grid
  cx.strokeStyle = "rgba(29,39,53,.6)"; cx.lineWidth = 1;
  for (let x = 0; x < W; x += 60 * devicePixelRatio) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
  for (let y = 0; y < H; y += 60 * devicePixelRatio) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }

  const cxp = W * 0.5, cyp = H * 0.62; // sample anchor
  const fuel = FUELS[state.fuel];
  const isDroplet = state.fuel === "heptane";

  // airflow particles (left to right; speed ∝ fan, damped by gravity-set convection in 1g)
  const flowPx = (state.flow / 50) * 4 * devicePixelRatio;
  cx.fillStyle = "rgba(63,208,216,.45)";
  for (const p of particles) {
    p.x += (flowPx / W + 0.0012 * (1 - g)) ; p.p += 0.05;
    if (p.x > 1.02) { p.x = -0.02; p.y = Math.random(); }
    const yy = p.y + 0.03 * Math.sin(p.p + t / 900);
    cx.beginPath();
    cx.arc(p.x * W, ((yy * 0.9) + 0.05) * H, 1.4 * devicePixelRatio, 0, 7);
    cx.fill();
  }

  // sample
  cx.fillStyle = "#26344a";
  if (isDroplet) {
    cx.beginPath(); cx.arc(cxp, cyp, 9 * devicePixelRatio, 0, 7); cx.fill();
  } else if (fuel && fuel.shape.includes("rod")) {
    cx.fillRect(cxp - 6 * devicePixelRatio, cyp, 12 * devicePixelRatio, H - cyp - 40 * devicePixelRatio);
  } else {
    cx.fillRect(cxp - 60 * devicePixelRatio, cyp, 120 * devicePixelRatio, 5 * devicePixelRatio);
    cx.fillStyle = "#1a2433";
    cx.fillRect(cxp - 60 * devicePixelRatio, cyp, 120 * devicePixelRatio, 22 * devicePixelRatio);
  }

  // flame
  const flick = 1 + 0.08 * Math.sin(t / 90) + 0.05 * Math.sin(t / 47 + 2);
  const cool = isDroplet && state.o2 < 30; // FLEX cool-flame regime at low O2
  if (isDroplet) {
    if (cool) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 400);
      cx.strokeStyle = `rgba(140,120,255,${0.35 + 0.3 * pulse})`;
      cx.lineWidth = 2 * devicePixelRatio;
      cx.beginPath(); cx.arc(cxp, cyp, (16 + 10 * pulse) * devicePixelRatio, 0, 7); cx.stroke();
      cx.fillStyle = `rgba(120,110,255,${0.06 + 0.05 * pulse})`;
      cx.beginPath(); cx.arc(cxp, cyp, (16 + 10 * pulse) * devicePixelRatio, 0, 7); cx.fill();
    } else {
      const rg = 14 + 4 * flick;
      const gr = cx.createRadialGradient(cxp, cyp, 2, cxp, cyp, rg * devicePixelRatio);
      gr.addColorStop(0, "rgba(255,235,170,.95)"); gr.addColorStop(0.5, "rgba(255,150,60,.8)");
      gr.addColorStop(1, "rgba(255,90,20,0)");
      cx.fillStyle = gr; cx.beginPath(); cx.arc(cxp, cyp, rg * devicePixelRatio, 0, 7); cx.fill();
    }
  } else {
    // teardrop (1g) morphing to sphere (0g); lean downstream with airflow
    const lean = (state.flow / 50) * 60 * devicePixelRatio * (0.4 + 0.6 * (1 - g));
    const hgt = (30 + 70 * g) * flick * devicePixelRatio;   // buoyant stretch
    const rad = (26 + 10 * (1 - g)) * devicePixelRatio;
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
  }

  // labels
  cx.fillStyle = "rgba(109,125,146,.9)";
  cx.font = `${11 * devicePixelRatio}px JetBrains Mono, monospace`;
  if (cool) cx.fillText("INVISIBLE COOL FLAME — FLEX REGIME (pulse visible via laser heat feedback)", 14 * devicePixelRatio, H - 16 * devicePixelRatio);
  else cx.fillText(`O2 ${state.o2.toFixed(1)}%  ·  FLOW ${state.flow} cm/s  ·  ${state.press.toFixed(2)} atm  ·  ${g === 0 ? "0g" : g + "g"}`, 14 * devicePixelRatio, H - 16 * devicePixelRatio);

  requestAnimationFrame(tick);
}

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
      <dt>sensors</dt><dd>${esc((r.sensors || []).join(", ")) || "—"}</dd>
      <dt>variables vs runs</dt><dd>${esc(r.variables_vs_other_runs)}</dd>
    </dl>
    <h4>JEV VERIFICATION</h4>
    <dl class="kv">
      <dt>verified</dt><dd>${r.jev_verified ? "YES" : "NO"}</dd>
      <dt>evidence score</dt><dd>${r.jev_evidence_score ?? "—"} / 10</dd>
      <dt>confidence</dt><dd>${esc(r.confidence ?? "—")}</dd>
    </dl>
    ${r.url ? `<p style="margin-top:14px"><a class="insp-link" href="${r.url}" target="_blank">NASA SOURCE ↗</a></p>` : ""}`;
  $("inspector").classList.add("open");
}
document.addEventListener("keydown", e => e.key === "Escape" && $("inspector").classList.remove("open"));
$("inspector").addEventListener("click", e => e.target.id === "inspector" && e.target.classList.remove("open"));

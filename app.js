const DATA = window.EXPLORER_DATA;

const COLORS = {
  Domestic: "#168b86",
  Foreign: "#c95c3f",
  ROW: "#8b9298",
  Other: "#8b9298",
  Gold: "#c9972f",
  ink: "#17212b",
  muted: "#66717c",
  line: "#d9e0e4"
};

const TABS = [
  ["story", "Guided story"],
  ["atlas", "Country atlas"],
  ["architecture", "Exposure architecture"],
  ["layers", "Network layers"],
  ["network", "Network explorer"],
  ["replacement", "Replacement audit"],
  ["policy", "Policy simulator"],
  ["dynamic", "Dynamic adjustment"],
  ["bridge", "Theory-to-data"]
];

const RULE_LABELS = {
  bottleneck: "Bottleneck exposure rule",
  downstream_rule: "Downstream exposure rule",
  propagation_rule: "Propagation rule",
  size_rule: "Sector-size rule",
  horizontal: "Horizontal support"
};

const state = {
  tab: "story",
  country: DATA.metadata.default_country,
  year: DATA.metadata.default_year,
  compare: "IND",
  budget: 0.25,
  rule: "bottleneck",
  topN: 20
};

const $ = (id) => document.getElementById(id);
const byKey = (country = state.country, year = state.year) => `${country}|${year}`;
const pct = (x, digits = 1) => x == null ? "n/a" : `${(x * 100).toFixed(digits)}%`;
const pp = (x, digits = 1) => x == null ? "n/a" : `${(x * 100).toFixed(digits)} pp`;
const num = (x, digits = 3) => x == null ? "n/a" : Number(x).toFixed(digits);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function rowFor(country = state.country, year = state.year) {
  return DATA.summary.find((d) => d.destination_country === country && d.year === Number(year));
}

function rowsFor(name, country = state.country, year = state.year) {
  const k = byKey(country, year);
  return (DATA[name] || []).filter((d) => d.key === k);
}

function initControls() {
  $("country").innerHTML = DATA.countries.map((c) => `<option ${c === state.country ? "selected" : ""}>${c}</option>`).join("");
  $("compare").innerHTML = [`<option value="">None</option>`].concat(
    DATA.countries.map((c) => `<option ${c === state.compare ? "selected" : ""}>${c}</option>`)
  ).join("");
  $("year").min = Math.min(...DATA.years);
  $("year").max = Math.max(...DATA.years);
  $("year").value = state.year;
  $("yearLabel").textContent = state.year;
  $("budget").innerHTML = [0.05, 0.10, 0.25, 0.50].map((b) => `<option value="${b}" ${b === state.budget ? "selected" : ""}>${Math.round(b * 100)}%</option>`).join("");
  $("rule").innerHTML = Object.entries(RULE_LABELS).map(([value, label]) => `<option value="${value}" ${value === state.rule ? "selected" : ""}>${label}</option>`).join("");
  $("topN").value = String(state.topN);

  $("country").addEventListener("change", (e) => { state.country = e.target.value; render(); });
  $("compare").addEventListener("change", (e) => { state.compare = e.target.value; render(); });
  $("year").addEventListener("input", (e) => { state.year = Number(e.target.value); $("yearLabel").textContent = state.year; render(); });
  $("budget").addEventListener("change", (e) => { state.budget = Number(e.target.value); render(); });
  $("rule").addEventListener("change", (e) => { state.rule = e.target.value; render(); });
  $("topN").addEventListener("change", (e) => { state.topN = Number(e.target.value); render(); });
  $("reset").addEventListener("click", () => {
    state.country = "LUX"; state.year = 2014; state.compare = "IND"; state.budget = 0.25; state.rule = "bottleneck"; state.topN = 20;
    initControls(); render();
  });
}

function initTabs() {
  $("tabs").innerHTML = TABS.map(([id, label], i) => `
    <button class="tab ${id === state.tab ? "active" : ""}" data-tab="${id}">
      <span class="num">${i + 1}</span><span>${label}</span>
    </button>
  `).join("");
  [...document.querySelectorAll(".tab")].forEach((button) => {
    button.addEventListener("click", () => { state.tab = button.dataset.tab; render(); });
  });
}

function kpiCards(row) {
  const frontier = frontierRow();
  const advantage = frontier ? frontier.targeted_policy_advantage_absorbed : row?.targeted_policy_advantage_absorbed;
  return `
    <div class="kpis">
      ${kpi("Foreign exposure share", pct(row?.foreign_exposure), "Household cost-of-living exposure on foreign nodes.")}
      ${kpi("Domestic exposure share", pct(row?.domestic_exposure), "Exposure mass carried by domestic production nodes.")}
      ${kpi("K_net replacement capacity", pct(row?.network_absorbable_share_of_foreign), "Foreign exposure absorbable by observed domestic margins.")}
      ${kpi("Actual absorption efficiency", pct(row?.actual_absorption_efficiency), "Observed placement relative to absorbable scale.")}
      ${kpi("Targeted advantage", pp(advantage), "Extra absorption over horizontal support at selected budget.")}
    </div>
  `;
}

function kpi(label, value, note) {
  return `<section class="card"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div><div class="kpi-note">${esc(note)}</div></section>`;
}

function hero(title, text) {
  return `<section class="hero"><h1>${title}</h1><p class="muted">${text}</p></section>`;
}

function render() {
  initTabs();
  const row = rowFor();
  $("detailBox").innerHTML = detailBox(row);
  const handlers = {
    story: renderStory,
    atlas: renderAtlas,
    architecture: renderArchitecture,
    layers: renderLayers,
    network: renderNetwork,
    replacement: renderReplacement,
    policy: renderPolicy,
    dynamic: renderDynamic,
    bridge: renderBridge
  };
  $("main").innerHTML = handlers[state.tab](row);
  attachRowClicks();
}

function detailBox(row) {
  if (!row) return `<p class="muted">No selected country-year.</p>`;
  return `
    <p><strong>${esc(state.country)}, ${state.year}</strong></p>
    <p>Foreign exposure: <strong>${pct(row.foreign_exposure)}</strong></p>
    <p>Top source country: <strong>${esc(row.top1_source_country)}</strong> (${pct(row.top1_source_country_exact_share)})</p>
    <p>Top source sector: <strong>${esc(row.top1_source_sector)}</strong> (${pct(row.top1_source_sector_exact_share)})</p>
    <p>K_net: <strong>${pct(row.network_absorbable_share_of_foreign)}</strong></p>
  `;
}

function renderStory(row) {
  return `
    ${hero("Guided Story Mode", `${state.country} ${state.year} is loaded as the country-year fact sheet. The tour links jump through the core seminar narrative without changing the underlying controls.`)}
    ${kpiCards(row)}
    <div class="grid2">
      <section class="panel">
        <h2>Exposure Funnel</h2>
        ${funnelChart(row)}
        <p class="muted">Foreign exposure is not automatically bad exposure. The policy object is the vulnerable and absorbable part that spare routes can actually close.</p>
      </section>
      <section class="panel">
        <h2>10-minute Tour</h2>
        <div class="tour">
          ${tourButton("architecture", "1. Exposure is not imports", "Compare source-country composition and top nodes.")}
          ${tourButton("layers", "2. Exposure has layers", "Separate final demand, one-step, two-step, and deeper network exposure.")}
          ${tourButton("replacement", "3. Capacity is not generic", "Trace foreign sectors into domestic replacement margins.")}
          ${tourButton("policy", "4. Targeted policy buys spare routes", "Compare bottleneck targeting with horizontal support.")}
          ${tourButton("dynamic", "5. Replacement is a state", "Read the shock-capacity interaction as reallocation elasticity.")}
        </div>
      </section>
    </div>
    <section class="panel">
      <h2>${state.country} vs ${state.compare || "no comparison"} over time</h2>
      ${lineChart([state.country, state.compare].filter(Boolean), "foreign_exposure", "Foreign exposure share")}
    </section>
  `;
}

function tourButton(tab, label, text) {
  return `<button data-tour="${tab}"><strong>${label}</strong><br><span class="muted">${text}</span></button>`;
}

function renderAtlas(row) {
  const latest = DATA.summary.filter((d) => d.year === state.year).sort((a, b) => (b.foreign_exposure || 0) - (a.foreign_exposure || 0));
  return `
    ${hero("Country Exposure Atlas", "Rank countries by exposure, replacement capacity, and policy advantage. Click any row to load that country-year.")}
    ${kpiCards(row)}
    <div class="grid2">
      <section class="panel"><h2>Foreign Exposure Ranking, ${state.year}</h2>${barChart(latest.slice(0, 12), "destination_country", "foreign_exposure", { color: COLORS.foreign, pct: true })}</section>
      <section class="panel"><h2>2000-2014 Change</h2>${barChart(latest.slice().sort((a, b) => (b.delta_foreign_exposure_2000_2014 || 0) - (a.delta_foreign_exposure_2000_2014 || 0)).slice(0, 12), "destination_country", "delta_foreign_exposure_2000_2014", { color: COLORS.gold, pp: true })}</section>
    </div>
    <section class="panel"><h2>Sortable Country-Year Table</h2>${countryTable(latest)}</section>
  `;
}

function renderArchitecture(row) {
  const sc = rowsFor("sourceCountry");
  const ss = rowsFor("sourceSector");
  const nodes = rowsFor("topNodes").slice(0, state.topN);
  return `
    ${hero("Exposure Architecture by Country-Year", "Where does household exposure sit once intermediate-input requirements are counted?")}
    ${kpiCards(row)}
    <section class="panel"><h2>Source-Country Composition</h2>${stackedBar(sc, "source_country", "exposure_share")}</section>
    <div class="grid2">
      <section class="panel"><h2>Top Source Countries</h2>${barChart(sc, "source_country", "exposure_share", { pct: true })}</section>
      <section class="panel"><h2>Top Source Sectors</h2>${barChart(ss, "industry_code", "exposure_share", { pct: true, color: COLORS.ink, titleField: "industry_description" })}</section>
    </div>
    <section class="panel"><h2>Country-Sector Node Table</h2>${nodeTable(nodes)}</section>
  `;
}

function renderLayers(row) {
  const layers = rowsFor("layerAgg");
  const sector = rowsFor("layerSector");
  return `
    ${hero("Network Layer Decomposition", "The Leontief inverse is opened into final demand, one-step, two-step, and deeper requirements.")}
    ${kpiCards(row)}
    <div class="grid2">
      <section class="panel"><h2>Household Exposure by Network Depth</h2>${layerStack(layers)}<div class="legend">${legend()}</div></section>
      <section class="panel"><h2>Path-Depth Intuition</h2>${pathGraphic()}</section>
    </div>
    <section class="panel"><h2>Layer-by-Sector Heatmap</h2>${heatmap(sector)}</section>
  `;
}

function renderNetwork(row) {
  const left = rowsFor("topNodes", state.country, state.year).slice(0, state.topN);
  const right = state.compare ? rowsFor("topNodes", state.compare, state.year).slice(0, state.topN) : [];
  return `
    ${hero("Household Exposure Network Explorer", `Top ${state.topN} production nodes feeding household exposure. Node size is exposure share; color is domestic, foreign, or ROW.`)}
    <div class="network-wrap">
      <section class="panel"><h2>${state.country}, ${state.year}</h2>${networkChart(left, state.country)}</section>
      <section class="panel"><h2>${state.compare || "Comparison off"}, ${state.year}</h2>${right.length ? networkChart(right, state.compare) : "<p class='muted'>Choose a comparison country in the control bar.</p>"}</section>
    </div>
    <section class="panel"><h2>Top Nodes</h2>${nodeTable(left)}</section>
  `;
}

function renderReplacement(row) {
  const industries = rowsFor("replacementIndustry").slice(0, 12);
  const flows = rowsFor("replacementFlows");
  const targets = rowsFor("policyTargets");
  return `
    ${hero("Replacement Capacity Audit", "Foreign exposure is mapped into domestic replacement margins, then split between absorbed and residual bottlenecks.")}
    ${kpiCards(row)}
    <div class="grid2">
      <section class="panel"><h2>Foreign Sectors to Domestic Margins</h2>${sankey(flows, industries)}</section>
      <section class="panel"><h2>Absorbed vs Residual by Sector</h2>${replacementBars(industries)}</section>
    </div>
    <section class="panel"><h2>Domestic Industry Detail</h2>${targetTable(targets)}</section>
  `;
}

function renderPolicy(row) {
  const frontier = rowsFor("frontier").sort((a, b) => a.policy_budget_share - b.policy_budget_share);
  const selected = frontierRow();
  const rules = rowsFor("ruleComparison").sort((a, b) => (b.additional_absorbed || 0) - (a.additional_absorbed || 0));
  const targets = rowsFor("policyTargets");
  return `
    ${hero("Policy Simulator", "Hold the exposure-unit budget fixed and compare where replacement capacity is placed.")}
    <div class="grid3">
      ${kpi("Bottleneck rule", pp(selected?.targeted_policy_additional_absorbed), `New foreign exposure: ${pct(selected?.targeted_foreign_exposure)}`)}
      ${kpi("Horizontal support", pp(selected?.horizontal_policy_additional_absorbed), `New foreign exposure: ${pct(selected?.horizontal_foreign_exposure)}`)}
      ${kpi("Advantage", pp(selected?.targeted_policy_advantage_absorbed), `Horizontal wasted budget: ${pp(selected?.horizontal_policy_budget_wasted)}`)}
    </div>
    <div class="grid2">
      <section class="panel"><h2>Rule Ranking at q = 25%</h2>${barChart(rules, "label", "additional_absorbed", { pct: false, pp: true, color: COLORS.gold })}</section>
      <section class="panel"><h2>Budget Frontier</h2>${frontierChart(frontier)}</section>
    </div>
    <section class="panel"><h2>Top Targeted Domestic Industries</h2>${targetTable(targets)}</section>
  `;
}

function renderDynamic(row) {
  const lp = DATA.lp || [];
  const series = (DATA.dynamicSeries || []).filter((d) => d.destination_country === state.country);
  return `
    ${hero("Dynamic Exposure Adjustment", "Replacement capacity is read as a state variable that changes exposure adjustment when foreign conditions move.")}
    <div class="grid2">
      <section class="panel"><h2>Local Projection Interaction</h2>${coefChart(lp)}<p class="muted">Positive interaction means exposure is more state-contingent: it rises more when foreign conditions improve and falls more when they deteriorate.</p></section>
      <section class="panel"><h2>${state.country} Shock-State Series</h2>${multiLineChart(series)}</section>
    </div>
    <section class="panel"><h2>Dynamic Shell Moment Fit</h2>${structuralTable()}</section>
  `;
}

function renderBridge() {
  const cards = [
    ["Exposure statistic", "Theory object: s = diag(nu)(I - B)^-1 f. Data: WIOD input-output shares, household final demand, and value-added shares."],
    ["Replacement-capacity proxy", "Theory: edge-level relationship capital. Data counterpart: K_net, the share of foreign exposure absorbable by observed domestic replacement margins."],
    ["Policy object", "Not full welfare, not fiscal cost, not autarky. The object is exposure-unit absorption under a fixed replacement budget."],
    ["Wedge intuition", "Firms value local appropriable surplus. Households value downstream cost-of-living insurance. The same spare route can therefore have different shadow values."]
  ];
  return `
    ${hero("Theory-to-Data Bridge", "A compact map from the model objects to the empirical explorer.")}
    <div class="grid2">${cards.map(([h, t]) => `<section class="panel"><h2>${h}</h2><p>${t}</p></section>`).join("")}</div>
  `;
}

function frontierRow() {
  const rows = rowsFor("frontier");
  return rows.find((d) => Math.abs(d.policy_budget_share - state.budget) < 1e-9) || rows[0];
}

function funnelChart(row) {
  if (!row) return "";
  const selected = frontierRow();
  const data = [
    ["Total household exposure", 1, COLORS.ink],
    ["Foreign exposure", row.foreign_exposure, COLORS.foreign],
    ["Vulnerable + absorbable", row.network_absorbable_foreign_exposure, COLORS.gold],
    ["Currently absorbed", row.actual_intensity_absorbable_foreign_exposure, COLORS.teal],
    ["Remaining bottlenecks", row.network_residual_foreign_exposure, COLORS.foreign],
    ["Absorbed under targeted policy", selected?.targeted_policy_additional_absorbed, COLORS.gold]
  ];
  return barChart(data.map(([label, value, color]) => ({ label, value, color })), "label", "value", { pct: true, colorField: "color", height: 280 });
}

function stackedBar(rows, labelField, valueField) {
  const width = 760, height = 112, x = 18, y = 34, barH = 26;
  let cursor = x;
  const pieces = rows.map((r) => {
    const w = Math.max(0, (r[valueField] || 0) * (width - 2 * x));
    const color = colorFor(r[labelField], r.scope);
    const out = `<rect x="${cursor}" y="${y}" width="${w}" height="${barH}" fill="${color}"><title>${esc(r[labelField])}: ${pct(r[valueField])}</title></rect>`;
    cursor += w;
    return out;
  }).join("");
  const labels = rows.slice(0, 8).map((r, i) => `<text x="${x + i * 88}" y="88" font-size="11" fill="${COLORS.muted}">${esc(r[labelField])} ${pct(r[valueField], 0)}</text>`).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}">${pieces}<rect x="${x}" y="${y}" width="${width - 2 * x}" height="${barH}" fill="none" stroke="${COLORS.line}"/>${labels}</svg></div>`;
}

function barChart(rows, labelField, valueField, opts = {}) {
  const height = opts.height || Math.max(210, rows.length * 28 + 38);
  const width = 760, left = 180, right = 24, top = 16, rowH = 24;
  const max = Math.max(...rows.map((r) => Math.abs(r[valueField] || 0)), 0.001);
  const bars = rows.map((r, i) => {
    const v = r[valueField] || 0;
    const w = Math.abs(v) / max * (width - left - right);
    const y = top + i * rowH;
    const color = opts.colorField ? r[opts.colorField] : (opts.color || colorFor(r[labelField], r.scope));
    const label = r[labelField];
    const valueLabel = opts.pp ? pp(v) : opts.pct ? pct(v) : num(v);
    return `
      <text x="8" y="${y + 15}" font-size="11" fill="${COLORS.ink}"><title>${esc(r[opts.titleField] || label)}</title>${esc(String(label).slice(0, 24))}</text>
      <rect x="${left}" y="${y + 3}" width="${w}" height="14" fill="${color}" rx="2"></rect>
      <text x="${left + w + 6}" y="${y + 15}" font-size="11" fill="${COLORS.muted}">${valueLabel}</text>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}">${bars}</svg></div>`;
}

function lineChart(countries, field, title) {
  const width = 760, height = 260, pad = 38;
  const rows = DATA.summary.filter((d) => countries.includes(d.destination_country));
  const xs = DATA.years;
  const vals = rows.map((d) => d[field]).filter((d) => d != null);
  const minY = Math.min(0, ...vals), maxY = Math.max(...vals, 0.01);
  const xScale = (year) => pad + (year - xs[0]) / (xs[xs.length - 1] - xs[0]) * (width - 2 * pad);
  const yScale = (v) => height - pad - (v - minY) / (maxY - minY || 1) * (height - 2 * pad);
  const paths = countries.map((country, i) => {
    const cr = rows.filter((d) => d.destination_country === country).sort((a, b) => a.year - b.year);
    const d = cr.map((r, j) => `${j ? "L" : "M"}${xScale(r.year)},${yScale(r[field] || 0)}`).join(" ");
    const color = i === 0 ? COLORS.foreign : COLORS.teal;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="3"/><text x="${pad + i * 90}" y="20" fill="${color}" font-size="12">${country}</text>`;
  }).join("");
  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="${COLORS.line}"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="${COLORS.line}"/><text x="${pad}" y="${height - 8}" font-size="11" fill="${COLORS.muted}">${xs[0]}</text><text x="${width - pad - 25}" y="${height - 8}" font-size="11" fill="${COLORS.muted}">${xs[xs.length - 1]}</text><text x="${pad}" y="${pad - 8}" font-size="11" fill="${COLORS.muted}">${title}</text>`;
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}">${axis}${paths}</svg></div>`;
}

function layerStack(rows) {
  const layers = ["Layer 0", "Layer 1", "Layer 2", "Layer 3+"];
  const scopes = ["Domestic", "Foreign", "ROW"];
  const width = 760, height = 250, left = 90, top = 24, rowH = 42;
  const svgRows = layers.map((layer, i) => {
    let cursor = left;
    const pieces = scopes.map((scope) => {
      const val = rows.find((r) => r.layer === layer && r.scope === scope)?.exposure_share || 0;
      const w = val * (width - left - 30);
      const rect = `<rect x="${cursor}" y="${top + i * rowH}" width="${w}" height="24" fill="${COLORS[scope]}"><title>${scope}: ${pct(val)}</title></rect>`;
      cursor += w;
      return rect;
    }).join("");
    return `<text x="12" y="${top + i * rowH + 16}" font-size="12">${layer}</text>${pieces}<text x="${cursor + 6}" y="${top + i * rowH + 16}" font-size="11" fill="${COLORS.muted}">${pct(scopes.reduce((s, scope) => s + (rows.find((r) => r.layer === layer && r.scope === scope)?.exposure_share || 0), 0))}</text>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}">${svgRows}</svg></div>`;
}

function heatmap(rows) {
  const sectors = [...new Map(rows.map((r) => [r.industry_code, r])).values()].slice(0, 12);
  const layers = ["Layer 0", "Layer 1", "Layer 2", "Layer 3+"];
  const width = 760, cellW = 118, cellH = 24, left = 230, top = 34;
  const height = top + sectors.length * cellH + 20;
  const max = Math.max(...rows.map((r) => r.exposure_share || 0), 0.001);
  const cells = sectors.map((s, i) => {
    const label = `<text x="8" y="${top + i * cellH + 16}" font-size="11">${esc(s.industry_code)} ${esc(String(s.industry_description).slice(0, 28))}</text>`;
    const rects = layers.map((layer, j) => {
      const val = rows.find((r) => r.industry_code === s.industry_code && r.layer === layer)?.exposure_share || 0;
      const alpha = clamp(val / max, 0.04, 1);
      return `<rect x="${left + j * cellW}" y="${top + i * cellH}" width="${cellW - 4}" height="${cellH - 4}" fill="rgba(201,92,63,${alpha})"><title>${layer}: ${pct(val)}</title></rect>`;
    }).join("");
    return label + rects;
  }).join("");
  const headers = layers.map((l, j) => `<text x="${left + j * cellW}" y="20" font-size="11" fill="${COLORS.muted}">${l}</text>`).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}">${headers}${cells}</svg></div>`;
}

function networkChart(nodes, country) {
  const width = 520, height = 420, cx = width / 2, cy = height / 2;
  const max = Math.max(...nodes.map((n) => n.exposure_share), 0.001);
  const center = `<circle cx="${cx}" cy="${cy}" r="34" fill="${COLORS.ink}"/><text x="${cx}" y="${cy - 2}" text-anchor="middle" fill="white" font-size="12">${country}</text><text x="${cx}" y="${cy + 13}" text-anchor="middle" fill="white" font-size="10">household</text>`;
  const items = nodes.map((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    const r = 116 + (i % 3) * 34;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    const size = 5 + Math.sqrt(n.exposure_share / max) * 18;
    const color = colorFor(n.source_country, n.scope);
    const label = i < 10 ? `<text x="${x}" y="${y + size + 12}" text-anchor="middle" font-size="9" fill="${COLORS.ink}">${esc(n.node_label)}</text>` : "";
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${color}" stroke-opacity="0.35" stroke-width="${1 + n.exposure_share / max * 5}"/><circle cx="${x}" cy="${y}" r="${size}" fill="${color}" opacity="0.9"><title>${esc(n.node_id)} ${pct(n.exposure_share)}</title></circle>${label}`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}">${items}${center}</svg></div><div class="legend">${legend()}</div>`;
}

function sankey(flows, industries) {
  const width = 760, height = 390, leftX = 24, midX = 330, rightX = 640;
  const sourceNames = [...new Map(industries.slice(0, 8).map((d) => [d.industry_code, d])).values()];
  const receivers = [...new Map(flows.map((d) => [d.receiver_industry_code, d])).values()].slice(0, 8);
  const sy = new Map(sourceNames.map((d, i) => [d.industry_code, 35 + i * 38]));
  const ry = new Map(receivers.map((d, i) => [d.receiver_industry_code, 35 + i * 38]));
  const max = Math.max(...flows.map((f) => f.mapped_exposure || 0), 0.001);
  const paths = flows.filter((f) => sy.has(f.source_industry_code) && ry.has(f.receiver_industry_code)).map((f) => {
    const y1 = sy.get(f.source_industry_code), y2 = ry.get(f.receiver_industry_code);
    return `<path d="M${leftX + 90},${y1} C${midX - 70},${y1} ${midX - 90},${y2} ${midX},${y2}" fill="none" stroke="${COLORS.foreign}" stroke-opacity="0.28" stroke-width="${1 + f.mapped_exposure / max * 10}"><title>${esc(f.source_industry_code)} -> ${esc(f.receiver_industry_code)} ${pct(f.mapped_exposure)}</title></path>`;
  }).join("");
  const sourceLabels = sourceNames.map((d) => `<text x="${leftX}" y="${sy.get(d.industry_code) + 4}" font-size="11">${esc(d.industry_code)}</text>`).join("");
  const receiverLabels = receivers.map((d) => `<text x="${midX + 8}" y="${ry.get(d.receiver_industry_code) + 4}" font-size="11">${esc(d.receiver_industry_code)}</text>`).join("");
  const right = `<rect x="${rightX}" y="62" width="92" height="46" fill="${COLORS.teal}" rx="5"/><text x="${rightX + 46}" y="89" text-anchor="middle" fill="white" font-size="12">absorbed</text><rect x="${rightX}" y="170" width="92" height="46" fill="${COLORS.gold}" rx="5"/><text x="${rightX + 46}" y="197" text-anchor="middle" fill="white" font-size="12">residual</text>`;
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}"><text x="${leftX}" y="18" font-size="12" fill="${COLORS.muted}">Foreign exposure sectors</text><text x="${midX}" y="18" font-size="12" fill="${COLORS.muted}">Domestic receiver industries</text>${paths}${sourceLabels}${receiverLabels}${right}</svg></div>`;
}

function replacementBars(rows) {
  const long = rows.map((r) => ({
    label: r.industry_code,
    absorbed: r.network_absorbable_foreign_exposure || 0,
    residual: r.network_unabsorbed_foreign_exposure || 0
  }));
  const width = 760, height = Math.max(250, long.length * 30 + 30), left = 120;
  const max = Math.max(...long.map((d) => d.absorbed + d.residual), 0.001);
  const svg = long.map((d, i) => {
    const y = 20 + i * 28;
    const w1 = d.absorbed / max * (width - left - 40);
    const w2 = d.residual / max * (width - left - 40);
    return `<text x="8" y="${y + 14}" font-size="11">${esc(d.label)}</text><rect x="${left}" y="${y}" width="${w1}" height="16" fill="${COLORS.teal}"/><rect x="${left + w1}" y="${y}" width="${w2}" height="16" fill="${COLORS.gold}"/>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}">${svg}</svg></div><div class="legend"><span><i class="swatch" style="background:${COLORS.teal}"></i>absorbable</span><span><i class="swatch" style="background:${COLORS.gold}"></i>residual</span></div>`;
}

function frontierChart(rows) {
  const width = 760, height = 260, pad = 42;
  const maxX = Math.max(...rows.map((r) => r.policy_budget_share), 0.5);
  const maxY = Math.max(...rows.flatMap((r) => [r.targeted_policy_additional_absorbed, r.horizontal_policy_additional_absorbed]), 0.01);
  const x = (v) => pad + v / maxX * (width - 2 * pad);
  const y = (v) => height - pad - v / maxY * (height - 2 * pad);
  const line = (field, color) => `<path d="${rows.map((r, i) => `${i ? "L" : "M"}${x(r.policy_budget_share)},${y(r[field])}`).join(" ")}" fill="none" stroke="${color}" stroke-width="3"/>`;
  const dots = rows.map((r) => `<circle cx="${x(r.policy_budget_share)}" cy="${y(r.targeted_policy_additional_absorbed)}" r="4" fill="${COLORS.gold}"/><circle cx="${x(r.policy_budget_share)}" cy="${y(r.horizontal_policy_additional_absorbed)}" r="4" fill="${COLORS.foreign}"/>`).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}"><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="${COLORS.line}"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="${COLORS.line}"/>${line("targeted_policy_additional_absorbed", COLORS.gold)}${line("horizontal_policy_additional_absorbed", COLORS.foreign)}${dots}<text x="55" y="22" fill="${COLORS.gold}" font-size="12">targeted</text><text x="135" y="22" fill="${COLORS.foreign}" font-size="12">horizontal</text></svg></div>`;
}

function coefChart(rows) {
  const width = 760, height = 260, pad = 44;
  const vals = rows.flatMap((r) => [r.ci_low, r.ci_high, 0]).filter((v) => v != null);
  const minY = Math.min(...vals), maxY = Math.max(...vals);
  const x = (h) => pad + h / 3 * (width - 2 * pad);
  const y = (v) => height - pad - (v - minY) / (maxY - minY || 1) * (height - 2 * pad);
  const zero = y(0);
  const marks = rows.map((r) => `<line x1="${x(r.horizon)}" y1="${y(r.ci_low)}" x2="${x(r.horizon)}" y2="${y(r.ci_high)}" stroke="${COLORS.line}" stroke-width="4"/><circle cx="${x(r.horizon)}" cy="${y(r.coef)}" r="7" fill="${COLORS.gold}"/><text x="${x(r.horizon) - 4}" y="${height - 12}" font-size="11">h${r.horizon}</text>`).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}"><line x1="${pad}" y1="${zero}" x2="${width - pad}" y2="${zero}" stroke="${COLORS.muted}" stroke-dasharray="4 4"/>${marks}</svg></div>`;
}

function multiLineChart(rows) {
  if (!rows.length) return "<p class='muted'>No dynamic series for this country.</p>";
  const fields = [
    ["lag_weighted_foreign_mean_dln_pwt_rgdpo", "foreign shock z", COLORS.foreign],
    ["lag_network_absorbable_share_of_foreign", "lagged K_net", COLORS.teal],
    ["d_foreign_exposure", "d foreign exposure", COLORS.gold]
  ];
  const normalized = fields.map(([field, label, color]) => {
    const vals = rows.map((r) => r[field]).filter((v) => v != null);
    const min = Math.min(...vals), max = Math.max(...vals);
    return [field, label, color, min, max];
  });
  const width = 760, height = 260, pad = 42;
  const years = rows.map((r) => r.year);
  const minYear = Math.min(...years), maxYear = Math.max(...years);
  const x = (yr) => pad + (yr - minYear) / (maxYear - minYear || 1) * (width - 2 * pad);
  const y = (v, min, max) => height - pad - (v - min) / (max - min || 1) * (height - 2 * pad);
  const paths = normalized.map(([field, label, color, min, max], i) => {
    const d = rows.filter((r) => r[field] != null).sort((a, b) => a.year - b.year).map((r, j) => `${j ? "L" : "M"}${x(r.year)},${y(r[field], min, max)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5"/><text x="${pad + i * 145}" y="20" fill="${color}" font-size="12">${label}</text>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}">${paths}<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="${COLORS.line}"/></svg></div>`;
}

function structuralTable() {
  const rows = DATA.structuralMoments || [];
  if (!rows.length) return "<p class='muted'>No structural moment table found.</p>";
  return table(rows.slice(0, 20), [
    ["shell_name", "Shell"],
    ["name", "Moment"],
    ["value", "Data"],
    ["model_value", "Model"],
    ["standardized_error", "Std. error"]
  ]);
}

function countryTable(rows) {
  return table(rows, [
    ["destination_country", "Country"],
    ["foreign_exposure", "Foreign exposure", pct],
    ["delta_foreign_exposure_2000_2014", "Delta 2000-2014", pp],
    ["network_absorbable_share_of_foreign", "K_net", pct],
    ["targeted_policy_additional_absorbed", "Targeted", pp],
    ["horizontal_policy_additional_absorbed", "Horizontal", pp],
    ["targeted_policy_advantage_absorbed", "Advantage", pp]
  ], true);
}

function nodeTable(rows) {
  return table(rows, [
    ["rank", "Rank"],
    ["source_country", "Source"],
    ["industry_code", "Sector"],
    ["industry_description", "Sector name"],
    ["exposure_share", "Exposure", pct],
    ["scope", "Type"]
  ]);
}

function targetTable(rows) {
  return table(rows, [
    ["rank", "Rank"],
    ["industry_code", "Domestic industry"],
    ["industry_description", "Name"],
    ["bottleneck_absorbable_foreign_exposure", "Bottleneck value", pp],
    ["horizontal_policy_absorbable_foreign_exposure", "Horizontal value", pp],
    ["network_unabsorbed_foreign_exposure", "Residual", pp]
  ]);
}

function table(rows, cols, clickable = false) {
  return `<div class="table-wrap"><table><thead><tr>${cols.map(([, h]) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr ${clickable ? `data-country="${r.destination_country}" data-year="${r.year}"` : ""}>${cols.map(([field, , fmt]) => `<td>${esc(fmt ? fmt(r[field]) : r[field])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function pathGraphic() {
  return `<div class="chart"><svg viewBox="0 0 520 250">
    ${pathNode(250, 28, "Household final demand", COLORS.ink)}
    ${pathNode(250, 86, "Layer 0: final goods", COLORS.teal)}
    ${pathNode(250, 144, "Layer 1: suppliers", COLORS.foreign)}
    ${pathNode(250, 202, "Layer 2+: deeper requirements", COLORS.gold)}
    ${arrow(250, 52, 250, 68)}${arrow(250, 110, 250, 126)}${arrow(250, 168, 250, 184)}
  </svg></div>`;
}

function pathNode(x, y, label, color) {
  return `<rect x="${x - 120}" y="${y - 18}" width="240" height="36" rx="6" fill="${color}"/><text x="${x}" y="${y + 4}" fill="white" text-anchor="middle" font-size="12">${label}</text>`;
}

function arrow(x1, y1, x2, y2) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLORS.muted}" stroke-width="2"/><path d="M${x2 - 5},${y2 - 6} L${x2},${y2} L${x2 + 5},${y2 - 6}" fill="none" stroke="${COLORS.muted}" stroke-width="2"/>`;
}

function legend() {
  return `<span><i class="swatch" style="background:${COLORS.Domestic}"></i>Domestic</span><span><i class="swatch" style="background:${COLORS.Foreign}"></i>Foreign</span><span><i class="swatch" style="background:${COLORS.ROW}"></i>ROW</span>`;
}

function colorFor(label, scope) {
  if (scope === "Domestic") return COLORS.Domestic;
  if (scope === "Foreign") return COLORS.Foreign;
  if (scope === "ROW" || label === "ROW" || label === "Other") return COLORS.ROW;
  return COLORS.ink;
}

function attachRowClicks() {
  document.querySelectorAll("[data-country][data-year]").forEach((tr) => {
    tr.addEventListener("click", () => {
      state.country = tr.dataset.country;
      state.year = Number(tr.dataset.year);
      $("country").value = state.country;
      $("year").value = state.year;
      $("yearLabel").textContent = state.year;
      render();
    });
  });
  document.querySelectorAll("[data-tour]").forEach((button) => {
    button.addEventListener("click", () => { state.tab = button.dataset.tour; render(); });
  });
}

initControls();
render();

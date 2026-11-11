const COLORS = {
  北京: "#4ad5ff",
  天津: "#f7bc47",
  河北: "#54e6a3",
  上游: "#4ad5ff",
  中游: "#ff5da8",
  下游: "#f7bc47",
  red: "#ff6b6b",
  grid: "rgba(142, 190, 214, 0.28)",
};

const STAGE_DEFINITION = {
  上游: "石油、炼焦产品和核燃料加工品；研究和试验发展；通信设备、计算机和其他电子设备；电气机械和器材。",
  中游: "化学产品；专用设备；通用设备；仪器仪表；交通运输、仓储和邮政。",
  下游: "批发和零售；租赁和商务服务；卫生和社会工作；金属制品、机械和设备修理服务；信息传输、软件和信息技术服务。",
};

const state = {
  page: "home",
  region: "北京",
  chain: "氢能",
  stage: "上游",
  effectMode: "static2022",
};

const CONTROL_VISIBILITY = {
  home: [],
  region: [],
  evolution: ["stage", "effect"],
  linkage: [],
  topic: ["chain", "stage", "effect"],
  methods: [],
};

let DATA = null;
let GEO_DATA = null;
let activeRegionScene = null;

const $ = (selector) => document.querySelector(selector);
const view = $("#view");
const ACCESS_ACCOUNT = "visitor";
const ACCESS_PASSWORD = "cufe2026";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmt(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return esc(value);
  if (Math.abs(n) >= 10000) return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  return n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 10000) return `${fmt(n / 10000, 2)}万`;
  return fmt(n, 0);
}

function pctFromString(value) {
  const match = String(value).match(/([\d.]+)（/);
  return match ? Number(match[1]) : 0;
}

function countFromString(value) {
  const match = String(value).match(/^(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function sum(values) {
  return values.reduce((acc, v) => acc + Number(v || 0), 0);
}

function panel(title, source, body, span = 6, extra = "") {
  return `
    <section class="panel dv-border span-${span} ${extra}">
      <div class="panel-title"><span>${esc(title)}</span><small>${esc(source || "")}</small></div>
      <div class="panel-body">${body}</div>
    </section>
  `;
}

function kpi(title, value, caption, accent = "") {
  return panel(title, "", `<div class="kpi-value">${value}</div><div class="kpi-caption">${caption}</div>`, 3, `kpi ${accent}`);
}

function getOverallOutput(year) {
  const row = DATA.overall.effects.output.find((item) => item.name === String(year));
  return row.values;
}

function getChainCapital(chain) {
  return DATA.chainCapital.find((item) => item.chain === chain);
}

function getEffectBlock() {
  if (state.page === "topic") return DATA.chainEffects[state.chain][state.stage];
  return DATA.aggregateChainEffects[state.stage];
}

function getMatrix(block) {
  if (state.effectMode === "dynamic") return block.dynamic;
  const year = state.effectMode === "static2017" ? "2017" : "2022";
  return block.static[year];
}

function getEffectModeName() {
  if (state.effectMode === "dynamic") return "2017-2022动态";
  return state.effectMode === "static2017" ? "2017静态" : "2022静态";
}

function getEffectUnit() {
  return state.effectMode === "dynamic" ? "%" : "";
}

function fmtEffectValue(value, unit = getEffectUnit()) {
  const digits = unit === "%" ? 2 : 3;
  return `${fmt(value, digits)}${unit}`;
}

function getRegionalEffectEdges(block = DATA.aggregateChainEffects[state.stage]) {
  const matrix = getMatrix(block);
  const rowsByTarget = Object.fromEntries(
    matrix
      .filter((row) => DATA.regions.includes(row.name))
      .map((row) => [row.name, row.values])
  );
  return DATA.regions.flatMap((source) => DATA.regions
    .filter((target) => target !== source)
    .map((target) => ({
      id: `${source}-${target}`,
      source,
      target,
      value: Number(rowsByTarget[target]?.[source] ?? 0),
    })));
}

function getRegionalEffectStats(block = DATA.aggregateChainEffects[state.stage]) {
  const matrix = getMatrix(block);
  const rowsByTarget = Object.fromEntries(
    matrix
      .filter((row) => DATA.regions.includes(row.name))
      .map((row) => [row.name, row.values])
  );
  const outputRow = matrix.find((row) => row.name === "输出")?.values;
  const edges = getRegionalEffectEdges(block);
  const stats = {};
  DATA.regions.forEach((region) => {
    const incoming = edges.filter((edge) => edge.target === region);
    const outgoing = edges.filter((edge) => edge.source === region);
    const accept = Number(rowsByTarget[region]?.接受 ?? sum(incoming.map((edge) => edge.value)));
    const output = Number(outputRow?.[region] ?? sum(outgoing.map((edge) => edge.value)));
    const strongestInput = incoming.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0] || null;
    const strongestOutput = outgoing.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0] || null;
    stats[region] = {
      self: Number(rowsByTarget[region]?.[region] ?? 0),
      accept,
      output,
      net: output - accept,
      strongestInput,
      strongestOutput,
    };
  });
  return { matrix, rowsByTarget, edges, stats };
}

function findRegionalEdge(source, target, edges = getRegionalEffectEdges()) {
  return edges.find((edge) => edge.source === source && edge.target === target) || null;
}

function heatColor(value, max) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "rgba(74, 213, 255, 0.05)";
  if (v < 0) {
    const a = Math.min(0.82, 0.18 + Math.abs(v) / max * 0.64);
    return `rgba(255, 107, 107, ${a})`;
  }
  const a = Math.min(0.86, 0.12 + Math.abs(v) / max * 0.74);
  return `rgba(74, 213, 255, ${a})`;
}

function matrixView(matrix, unit = "") {
  const columns = Object.keys(matrix[0].values);
  const numeric = matrix.flatMap((row) => Object.values(row.values).map(Number).filter(Number.isFinite));
  const max = Math.max(...numeric.map((v) => Math.abs(v)), 1);
  const head = `<div class="matrix-row"><div class="matrix-cell matrix-head"></div>${columns.map((c) => `<div class="matrix-cell matrix-head">${esc(c)}</div>`).join("")}</div>`;
  const rows = matrix.map((row) => {
    const cells = columns.map((c) => {
      const value = row.values[c];
      const color = heatColor(value, max);
      return `<div class="matrix-cell" style="background:${color}">${fmt(value)}${unit}</div>`;
    }).join("");
    return `<div class="matrix-row"><div class="matrix-cell matrix-head">${esc(row.name)}</div>${cells}</div>`;
  }).join("");
  return `<div class="matrix">${head}${rows}</div>`;
}

function table(headers, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function barChart(items, opts = {}) {
  const width = 760;
  const height = opts.height || 280;
  const margin = { top: 22, right: 24, bottom: 76, left: 54 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const values = items.map((d) => Number(d.value || 0));
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const zeroY = margin.top + innerH - ((0 - min) / span) * innerH;
  const barW = innerW / items.length * 0.56;
  const gap = innerW / items.length;
  const axis = `
    <line x1="${margin.left}" y1="${zeroY}" x2="${margin.left + innerW}" y2="${zeroY}" stroke="${COLORS.grid}" />
    <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + innerH}" stroke="${COLORS.grid}" />
  `;
  const bars = items.map((d, i) => {
    const value = Number(d.value || 0);
    const x = margin.left + i * gap + (gap - barW) / 2;
    const yValue = margin.top + innerH - ((value - min) / span) * innerH;
    const y = value >= 0 ? yValue : zeroY;
    const h = Math.max(1, Math.abs(zeroY - yValue));
    const label = d.label.length > 9 ? `${d.label.slice(0, 9)}…` : d.label;
    const valueY = value >= 0 ? y - 7 : y + h + 15;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${d.color || COLORS.北京}" opacity="0.88" />
      <rect x="${x}" y="${y}" width="${barW}" height="5" rx="3" fill="#fff" opacity="0.42" />
      <text x="${x + barW / 2}" y="${valueY}" text-anchor="middle" fill="#dff6ff" font-size="12">${fmtCompact(d.value)}</text>
      <text x="${x + barW / 2}" y="${height - 38}" text-anchor="middle" fill="#9bbbd0" font-size="12">${esc(label)}</text>
    `;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" role="img">${axis}${bars}</svg></div>`;
}

function stackedBars(groups, keys, opts = {}) {
  const width = 840;
  const rowH = opts.rowH || 42;
  const height = 44 + groups.length * rowH;
  const labelW = opts.labelW || 180;
  const barW = width - labelW - 42;
  const max = Math.max(...groups.map((g) => sum(keys.map((k) => g.values[k]))), 1);
  const rows = groups.map((group, i) => {
    let x = labelW;
    const y = 30 + i * rowH;
    const total = sum(keys.map((k) => group.values[k]));
    const rects = keys.map((key) => {
      const w = barW * (Number(group.values[key] || 0) / max);
      const rect = `<rect x="${x}" y="${y}" width="${w}" height="22" rx="4" fill="${COLORS[key] || COLORS.北京}" opacity="0.88"><title>${esc(key)} ${fmt(group.values[key])}</title></rect>`;
      x += w;
      return rect;
    }).join("");
    const label = group.label.length > 14 ? `${group.label.slice(0, 14)}…` : group.label;
    return `
      <text x="0" y="${y + 15}" fill="#cfe5f2" font-size="12">${esc(label)}</text>
      <rect x="${labelW}" y="${y}" width="${barW}" height="22" rx="4" fill="rgba(74, 213, 255, 0.06)" />
      ${rects}
      <text x="${labelW + barW + 8}" y="${y + 15}" fill="#9bbbd0" font-size="12">${fmtCompact(total)}</text>
    `;
  }).join("");
  const legend = `<div class="legend">${keys.map((k) => `<span><i style="background:${COLORS[k] || COLORS.北京}"></i>${esc(k)}</span>`).join("")}</div>`;
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" role="img">${rows}</svg></div>${legend}`;
}

function lineChart(series) {
  const width = 760;
  const height = 300;
  const margin = { top: 22, right: 40, bottom: 44, left: 66 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const years = ["2017", "2022"];
  const values = series.flatMap((s) => s.values);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const y = (v) => margin.top + innerH - ((v - min) / (max - min || 1)) * innerH;
  const x = (i) => margin.left + (innerW / (years.length - 1)) * i;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((p) => {
    const yy = margin.top + innerH * p;
    return `<line x1="${margin.left}" y1="${yy}" x2="${margin.left + innerW}" y2="${yy}" stroke="${COLORS.grid}" />`;
  }).join("");
  const paths = series.map((s) => {
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
    const dots = s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="5" fill="${s.color}" />`).join("");
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="3" />${dots}`;
  }).join("");
  const labels = years.map((year, i) => `<text x="${x(i)}" y="${height - 14}" text-anchor="middle" fill="#9bbbd0" font-size="12">${year}</text>`).join("");
  const legend = `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" role="img">${grid}<line x1="${margin.left}" y1="${margin.top + innerH}" x2="${margin.left + innerW}" y2="${margin.top + innerH}" stroke="${COLORS.grid}" />${paths}${labels}</svg></div>${legend}`;
}

function networkMap() {
  const output = getOverallOutput(2022);
  const nodes = [
    { region: "北京", x: 390, y: 80, r: 56 },
    { region: "天津", x: 540, y: 205, r: 46 },
    { region: "河北", x: 250, y: 230, r: 54 },
  ];
  const lines = [
    ["北京", "天津", 0.039],
    ["北京", "河北", 0.100],
    ["天津", "北京", 0.073],
    ["天津", "河北", 0.043],
    ["河北", "北京", 0.069],
    ["河北", "天津", 0.011],
  ];
  const byRegion = Object.fromEntries(nodes.map((n) => [n.region, n]));
  const paths = lines.map(([from, to, value]) => {
    const a = byRegion[from];
    const b = byRegion[to];
    const width = 1.5 + value * 20;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(74,213,255,0.34)" stroke-width="${width}"><title>${from}→${to}: ${value}</title></line>`;
  }).join("");
  const circles = nodes.map((n) => `
    <g class="region-node">
      <circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="rgba(74,213,255,0.13)" stroke="${COLORS[n.region]}" stroke-width="2" />
      <circle cx="${n.x}" cy="${n.y}" r="${n.r * 0.68}" fill="rgba(10,31,53,0.74)" stroke="rgba(255,255,255,0.12)" />
      <text class="region-label" x="${n.x}" y="${n.y - 6}" text-anchor="middle">${n.region}</text>
      <text class="region-sub" x="${n.x}" y="${n.y + 16}" text-anchor="middle">${fmtCompact(output[n.region])}亿元</text>
    </g>
  `).join("");
  return `<div class="chart network-map"><svg viewBox="0 0 760 340" role="img"><path d="M130 290 C250 40 480 20 650 240" fill="none" stroke="rgba(247,188,71,0.16)" stroke-width="18" />${paths}${circles}</svg></div>`;
}

function pieSlice(cx, cy, radius, startAngle, endAngle, color) {
  const start = {
    x: cx + radius * Math.cos(startAngle),
    y: cy + radius * Math.sin(startAngle),
  };
  const end = {
    x: cx + radius * Math.cos(endAngle),
    y: cy + radius * Math.sin(endAngle),
  };
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `
    <path d="M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z"
      fill="${color}" opacity="0.88" stroke="rgba(6,17,31,0.9)" stroke-width="2" />
  `;
}

function pieChartPair(outputRows = null) {
  const years = ["2017", "2022"];
  const centers = [{ x: 215, y: 156 }, { x: 555, y: 156 }];
  const outputByYear = Object.fromEntries((outputRows || DATA.overall.effects.output).map((row) => [row.name, row.values]));
  const regionalTotal = (output) => sum(DATA.regions.map((region) => Number(output[region] || 0)));
  const maxTotal = Math.max(...years.map((year) => regionalTotal(outputByYear[year])));
  const maxRadius = 104;
  const pies = years.map((year, index) => {
    const output = outputByYear[year];
    const total = regionalTotal(output);
    const radius = maxRadius * Math.sqrt(total / maxTotal);
    let angle = -Math.PI / 2;
    const slices = DATA.regions.map((region) => {
      const value = output[region];
      const next = angle + (value / total) * Math.PI * 2;
      const path = pieSlice(centers[index].x, centers[index].y, radius, angle, next, COLORS[region]);
      angle = next;
      return path;
    }).join("");
    const labels = DATA.regions.map((region, i) => {
      const pct = output[region] / total * 100;
      return `<text x="${centers[index].x - 82}" y="${282 + i * 20}" fill="${COLORS[region]}" font-size="13">${region} ${fmt(pct, 1)}%</text>`;
    }).join("");
    return `
      <g>
        <text x="${centers[index].x}" y="25" text-anchor="middle" fill="#eaf7ff" font-size="18" font-weight="700">${year}年</text>
        <circle cx="${centers[index].x}" cy="${centers[index].y}" r="${maxRadius + 10}" fill="rgba(74,213,255,0.025)" stroke="rgba(74,213,255,0.08)" stroke-dasharray="5 7" />
        <circle cx="${centers[index].x}" cy="${centers[index].y}" r="${radius + 10}" fill="rgba(74,213,255,0.06)" stroke="rgba(74,213,255,0.16)" />
        ${slices}
        <circle cx="${centers[index].x}" cy="${centers[index].y}" r="43" fill="rgba(7,24,42,0.86)" stroke="rgba(255,255,255,0.12)" />
        <text x="${centers[index].x}" y="${centers[index].y - 4}" text-anchor="middle" fill="#eaf7ff" font-size="15" font-weight="700">三地合计</text>
        <text x="${centers[index].x}" y="${centers[index].y + 18}" text-anchor="middle" fill="#9ec1d6" font-size="13">${fmt(total / 10000, 2)}万亿元</text>
        ${labels}
      </g>
    `;
  }).join("");
  const legend = `<div class="legend">${DATA.regions.map((region) => `<span><i style="background:${COLORS[region]}"></i>${region}</span>`).join("")}</div>`;
  return `<div class="chart"><svg viewBox="0 0 760 340" role="img">${pies}</svg></div>${legend}`;
}

function getRegionOutputMetrics(region) {
  const rows = Object.fromEntries(DATA.overall.effects.output.map((row) => [row.name, row.values]));
  const v2017 = rows["2017"][region];
  const v2022 = rows["2022"][region];
  const inc = v2022 - v2017;
  const totalInc = rows["2022"].总 - rows["2017"].总;
  return {
    v2017,
    v2022,
    inc,
    growth: inc / v2017 * 100,
    share2022: v2022 / rows["2022"].总 * 100,
    contribution: inc / totalInc * 100,
  };
}

function regionContributionPie(selectedRegion) {
  const rows = Object.fromEntries(DATA.overall.effects.output.map((row) => [row.name, row.values]));
  const increments = Object.fromEntries(DATA.regions.map((region) => [region, rows["2022"][region] - rows["2017"][region]]));
  const total = sum(DATA.regions.map((region) => increments[region]));
  const cx = 286;
  const cy = 164;
  const radius = 134;
  let angle = -Math.PI / 2;
  const slices = DATA.regions.map((region) => {
    const value = increments[region];
    const next = angle + (value / total) * Math.PI * 2;
    const selected = region === selectedRegion;
    const color = selected ? COLORS.北京 : "rgba(150, 168, 181, 0.42)";
    const path = pieSlice(cx, cy, radius, angle, next, color)
      .replace('opacity="0.88"', `opacity="${selected ? "0.95" : "0.52"}"`)
      .replace('stroke-width="2"', `stroke-width="${selected ? "3" : "2"}"`);
    angle = next;
    return path;
  }).join("");
  const labels = DATA.regions.map((region, index) => {
    const selected = region === selectedRegion;
    const color = selected ? COLORS.北京 : "rgba(178, 197, 208, 0.72)";
    const y = 116 + index * 38;
    return `
      <text x="24" y="${y - 2}" fill="${color}" font-size="14" font-weight="${selected ? 800 : 500}">${region}</text>
      <text x="24" y="${y + 18}" fill="${color}" font-size="16" font-weight="${selected ? 800 : 600}">${fmt(increments[region] / total * 100, 1)}%</text>
    `;
  }).join("");
  return `
    <div class="region-contrib-chart">
      <svg viewBox="0 0 440 328" role="img" aria-label="对三地增量贡献">
        <text x="24" y="34" fill="#eaf7ff" font-size="16" font-weight="800">对三地增量贡献</text>
        <text x="24" y="58" fill="#8fb2c8" font-size="11">2017-2022增量占比</text>
        <circle cx="${cx}" cy="${cy}" r="${radius + 12}" fill="rgba(74,213,255,0.04)" stroke="rgba(74,213,255,0.12)" />
        ${slices}
        ${labels}
        <circle cx="${cx}" cy="${cy}" r="52" fill="rgba(7,24,42,0.88)" stroke="rgba(255,255,255,0.12)" />
        <text x="${cx}" y="${cy - 5}" text-anchor="middle" fill="${COLORS.北京}" font-size="24" font-weight="800">${fmt(increments[selectedRegion] / total * 100, 1)}%</text>
        <text x="${cx}" y="${cy + 24}" text-anchor="middle" fill="#9ec1d6" font-size="12">增量占比</text>
      </svg>
    </div>
  `;
}

function updateRegionInfoPanel(panelEl, region) {
  if (!panelEl) return;
  if (!region) {
    panelEl.innerHTML = `
      <div class="region-info-empty">
        <strong>总产出详情</strong>
        <span>点击地图或任一地区柱子查看</span>
      </div>
    `;
    return;
  }
  const m = getRegionOutputMetrics(region);
  const metrics = [
    ["2022总产出", `${fmt(m.v2022 / 10000, 2)}万亿元`],
    ["2017总产出", `${fmt(m.v2017 / 10000, 2)}万亿元`],
    ["2017-2022增量", `${fmt(m.inc / 10000, 2)}万亿元`],
    ["增幅", `${fmt(m.growth, 2)}%`],
    ["2022三地占比", `${fmt(m.share2022, 2)}%`],
    ["对三地增量贡献", `${fmt(m.contribution, 2)}%`],
  ];
  panelEl.innerHTML = `
    <div class="region-info-panel">
      <div class="region-info-head">
        <span>${esc(region)}</span>
        <small>表1-4，单位：亿元</small>
      </div>
      <div class="region-info-metrics">
        ${metrics.map(([label, value]) => `
          <div class="region-info-metric">
            <em>${esc(label)}</em>
            <strong>${esc(value)}</strong>
          </div>
        `).join("")}
      </div>
      ${regionContributionPie(region)}
    </div>
  `;
}

function regionalLinkSourceLabel() {
  return "data/data_xlsx_format/区域间投入产出表构建及计算";
}

function describeEdge(edge) {
  if (!edge) return "—";
  return `${edge.source} -> ${edge.target}`;
}

function strongestRegionBy(stats, key) {
  return DATA.regions
    .slice()
    .sort((a, b) => Math.abs(stats[b][key]) - Math.abs(stats[a][key]))[0];
}

function regionalLinkBalanceChart(stats, selection = {}) {
  const width = 440;
  const height = 258;
  const centerX = 214;
  const rowGap = 58;
  const startY = 74;
  const maxAbs = Math.max(
    0.001,
    ...DATA.regions.flatMap((region) => [Math.abs(stats[region].accept), Math.abs(stats[region].output)])
  );
  const scale = 128 / maxAbs;
  const selectedRegion = selection.region || selection.edge?.source || selection.edge?.target || null;
  const rows = DATA.regions.map((region, index) => {
    const y = startY + index * rowGap;
    const active = !selectedRegion || region === selectedRegion || selection.edge?.source === region || selection.edge?.target === region;
    const accept = stats[region].accept;
    const output = stats[region].output;
    const acceptW = Math.abs(accept) * scale;
    const outputW = Math.abs(output) * scale;
    const color = region === selectedRegion ? COLORS.北京 : active ? "rgba(154, 184, 199, 0.82)" : "rgba(116, 132, 143, 0.46)";
    const outputColor = output < 0 ? "rgba(255, 120, 90, 0.86)" : color;
    const acceptColor = accept < 0 ? "rgba(255, 120, 90, 0.86)" : color;
    const labelColor = region === selectedRegion ? "#eafaff" : "rgba(200, 222, 234, 0.78)";
    return `
      <text x="28" y="${y + 5}" fill="${labelColor}" font-size="13" font-weight="${region === selectedRegion ? 800 : 600}">${region}</text>
      <rect x="${centerX - acceptW}" y="${y - 13}" width="${acceptW}" height="16" rx="3" fill="${acceptColor}" opacity="${active ? 0.92 : 0.45}" />
      <rect x="${centerX}" y="${y + 7}" width="${outputW}" height="16" rx="3" fill="${outputColor}" opacity="${active ? 0.92 : 0.45}" />
      <text x="${centerX - acceptW - 8}" y="${y}" text-anchor="end" fill="rgba(183, 207, 220, 0.78)" font-size="11">${fmtEffectValue(accept)}</text>
      <text x="${centerX + outputW + 8}" y="${y + 20}" fill="rgba(183, 207, 220, 0.78)" font-size="11">${fmtEffectValue(output)}</text>
    `;
  }).join("");
  return `
    <div class="regional-link-balance-chart">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="三地接受与输出对比">
        <text x="28" y="28" fill="#eaf7ff" font-size="16" font-weight="800">三地接受/输出对比</text>
        <text x="${centerX - 72}" y="52" text-anchor="middle" fill="#8fb2c8" font-size="11">接受外部带动</text>
        <text x="${centerX + 72}" y="52" text-anchor="middle" fill="#8fb2c8" font-size="11">输出外部带动</text>
        <line x1="${centerX}" y1="58" x2="${centerX}" y2="${height - 26}" stroke="rgba(74,213,255,0.22)" />
        ${rows}
      </svg>
    </div>
  `;
}

function updateRegionalLinkInfoPanel(panelEl, selection = {}) {
  if (!panelEl) return;
  const { edges, stats } = getRegionalEffectStats();
  const unit = getEffectUnit();
  const edge = selection.edge || null;
  const region = selection.region || null;
  const title = edge ? `${edge.source} -> ${edge.target}` : region || "联动概览";
  const subtitle = `${state.stage} · ${getEffectModeName()}${unit ? "，单位：%" : ""}`;
  let metrics;

  if (edge) {
    const reverse = findRegionalEdge(edge.target, edge.source, edges);
    metrics = [
      ["溢出方向", describeEdge(edge)],
      ["连边值", fmtEffectValue(edge.value, unit)],
      ["反向值", fmtEffectValue(reverse?.value ?? 0, unit)],
      ["双向合计", fmtEffectValue(edge.value + (reverse?.value ?? 0), unit)],
      ["源地输出合计", fmtEffectValue(stats[edge.source].output, unit)],
      ["目标接受合计", fmtEffectValue(stats[edge.target].accept, unit)],
    ];
  } else if (region) {
    const item = stats[region];
    metrics = [
      ["自身效应", fmtEffectValue(item.self, unit)],
      ["接受外部带动", fmtEffectValue(item.accept, unit)],
      ["输出外部带动", fmtEffectValue(item.output, unit)],
      ["净输出", fmtEffectValue(item.net, unit)],
      ["最强输入来源", item.strongestInput ? `${item.strongestInput.source} ${fmtEffectValue(item.strongestInput.value, unit)}` : "—"],
      ["最强输出方向", item.strongestOutput ? `${item.strongestOutput.target} ${fmtEffectValue(item.strongestOutput.value, unit)}` : "—"],
    ];
  } else {
    const strongestEdge = edges.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
    const positiveCount = edges.filter((item) => item.value > 0).length;
    const negativeCount = edges.filter((item) => item.value < 0).length;
    const acceptRegion = strongestRegionBy(stats, "accept");
    const outputRegion = strongestRegionBy(stats, "output");
    metrics = [
      ["跨区连边", `${edges.length}条`],
      ["正向连边", `${positiveCount}条`],
      ["负向变化", `${negativeCount}条`],
      ["最强联动", `${describeEdge(strongestEdge)} ${fmtEffectValue(strongestEdge?.value ?? 0, unit)}`],
      ["接受最高", `${acceptRegion} ${fmtEffectValue(stats[acceptRegion].accept, unit)}`],
      ["输出最高", `${outputRegion} ${fmtEffectValue(stats[outputRegion].output, unit)}`],
    ];
  }

  panelEl.innerHTML = `
    <div class="region-info-panel regional-link-info-panel">
      <div class="region-info-head">
        <span>${esc(title)}</span>
        <small>${esc(subtitle)}</small>
      </div>
      <div class="region-info-metrics">
        ${metrics.map(([label, value]) => `
          <div class="region-info-metric">
            <em>${esc(label)}</em>
            <strong>${esc(value)}</strong>
          </div>
        `).join("")}
      </div>
      ${regionalLinkBalanceChart(stats, selection)}
    </div>
  `;
}

function renderHome() {
  const out2017 = getOverallOutput(2017).总;
  const out2022 = getOverallOutput(2022).总;
  const growth = (out2022 / out2017 - 1) * 100;
  const chainTotal = sum(DATA.chainCapital.map((c) => c.values["三次产业结构合计"]["地区合计"]));
  const capitalGroups = DATA.chainCapital.map((item) => ({
    label: item.chain,
    values: item.values["三次产业结构合计"],
  }));
  const findings = `<div class="insight-list">${DATA.findings.map((item) => `
    <div class="insight"><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></div>
  `).join("")}</div>`;

  view.innerHTML = `
    <div class="dashboard-grid">
      ${kpi("区域总产出", `${fmt(out2022 / 10000, 2)}万亿元`, `2022年，2017年为${fmt(out2017 / 10000, 2)}万亿元`, "accent-gold")}
      ${kpi("总量增幅", `${fmt(growth, 2)}%`, "由表1-4总产出派生计算", "accent-green")}
      ${kpi("政策文本", "101份", "权威政策文本量化编码", "")}
      ${kpi("企业调研", "173家", "企业问卷与协同诉求分析", "accent-pink")}
      ${panel("三地总产出占比与规模对比", "表1-4，单位：亿元", pieChartPair(), 8)}
      ${panel("核心发现", "报告内容摘要与主要结论", findings, 4)}
      ${panel("六链实缴资本结构", "表2-2至表2-12，单位：亿元", stackedBars(capitalGroups, DATA.stages, { labelW: 205 }), 8)}
      ${panel("六链资本合计", "表2系列汇总，按报告原表加总", `<div class="kpi-value">${fmt(chainTotal, 2)}</div><div class="kpi-caption">六条重点产业链实缴资本地区合计之和，单位：亿元</div>`, 4, "kpi accent-green")}
      ${panel("总体动态乘数与溢出", "表1-4，单位：%", matrixView(DATA.overall.effects.dynamic, "%"), 12)}
    </div>
  `;
}

function renderRegion() {
  disposeRegionScene();
  view.innerHTML = `
    <div class="region-3d-stage dv-border">
      <canvas class="region-3d-canvas" id="region3dCanvas" aria-label="京津冀三地总产出立体地图"></canvas>
      <aside class="region-3d-info-slot dv-border" id="regionInfoSlot"></aside>
    </div>
  `;
  activeRegionScene = initRegionScene($("#region3dCanvas"));
}

function disposeRegionScene() {
  if (activeRegionScene) {
    activeRegionScene.dispose();
    activeRegionScene = null;
  }
}

function initRegionScene(canvas) {
  const ctx = canvas.getContext("2d");
  const infoSlot = $("#regionInfoSlot");
  const years = ["2017", "2022"];
  const outputRows = Object.fromEntries(DATA.overall.effects.output.map((row) => [row.name, row.values]));
  const maxOutput = Math.max(...years.flatMap((year) => DATA.regions.map((region) => outputRows[year][region])));
  const camera = { yaw: -0.32, pitch: -0.78, fov: 820 };
  const target = { yaw: camera.yaw, pitch: camera.pitch };
  const scene = {
    raf: 0,
    disposed: false,
    dragging: false,
    pointer: { x: 0, y: 0 },
    pointerStart: { x: 0, y: 0 },
    dragMoved: false,
    dpr: 1,
    w: 0,
    h: 0,
    hitAreas: [],
  };
  const selection = { region: null, year: null };
  const regions = buildRegionShapes();
  updateRegionInfoPanel(infoSlot, selection.region);

  function fallbackRegions() {
    return [
      {
        name: "河北",
        center: { x: -80, z: 50 },
        polygon: [
          { x: -285, z: -78 },
          { x: -158, z: -170 },
          { x: 48, z: -136 },
          { x: 185, z: -18 },
          { x: 230, z: 126 },
          { x: 76, z: 210 },
          { x: -136, z: 188 },
          { x: -302, z: 82 },
        ],
      },
      {
        name: "北京",
        center: { x: 60, z: -112 },
        polygon: [
          { x: 8, z: -182 },
          { x: 74, z: -205 },
          { x: 130, z: -158 },
          { x: 118, z: -96 },
          { x: 50, z: -74 },
          { x: -2, z: -118 },
        ],
      },
      {
        name: "天津",
        center: { x: 178, z: -8 },
        polygon: [
          { x: 140, z: -78 },
          { x: 198, z: -58 },
          { x: 228, z: -5 },
          { x: 206, z: 60 },
          { x: 148, z: 70 },
          { x: 120, z: 10 },
        ],
      },
    ];
  }

  function buildRegionShapes() {
    if (!GEO_DATA?.features?.length) return fallbackRegions();
    const raw = GEO_DATA.features.map((feature) => ({
      name: feature.properties?.displayName || feature.properties?.name || "地区",
      rings: extractFeatureRings(feature),
    })).filter((feature) => feature.rings.length);
    if (!raw.length) return fallbackRegions();

    const all = raw.flatMap((feature) => feature.rings.flat());
    const minLon = Math.min(...all.map((p) => p[0]));
    const maxLon = Math.max(...all.map((p) => p[0]));
    const minLat = Math.min(...all.map((p) => p[1]));
    const maxLat = Math.max(...all.map((p) => p[1]));
    const lonSpan = maxLon - minLon || 1;
    const latSpan = maxLat - minLat || 1;
    const scale = Math.min(850 / lonSpan, 625 / latSpan);
    const cx = (minLon + maxLon) / 2;
    const cy = (minLat + maxLat) / 2;
    return raw.map((feature) => {
      const polygons = feature.rings.map((ring) => {
        const simplified = simplifyRingForScene(ring);
        return simplified.map(([lon, lat]) => ({
          x: (lon - cx) * scale,
          z: -(lat - cy) * scale,
        }));
      }).filter((ring) => ring.length >= 3);
      const points = polygons.flat();
      const center = {
        x: sum(points.map((p) => p.x)) / points.length,
        z: sum(points.map((p) => p.z)) / points.length,
      };
      return {
        name: feature.name.replace(/[市省]$/u, ""),
        center,
        polygons,
      };
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    scene.dpr = Math.min(window.devicePixelRatio || 1, 2);
    scene.w = Math.max(320, rect.width);
    scene.h = Math.max(420, rect.height);
    canvas.width = Math.round(scene.w * scene.dpr);
    canvas.height = Math.round(scene.h * scene.dpr);
    ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
  }

  function onPointerDown(event) {
    scene.dragging = true;
    scene.pointer.x = event.clientX;
    scene.pointer.y = event.clientY;
    scene.pointerStart.x = event.clientX;
    scene.pointerStart.y = event.clientY;
    scene.dragMoved = false;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!scene.dragging) return;
    const dx = event.clientX - scene.pointer.x;
    const dy = event.clientY - scene.pointer.y;
    scene.pointer.x = event.clientX;
    scene.pointer.y = event.clientY;
    if (Math.hypot(event.clientX - scene.pointerStart.x, event.clientY - scene.pointerStart.y) <= 5) return;
    scene.dragMoved = true;
    target.yaw += dx * 0.009;
    target.pitch = Math.max(-1.08, Math.min(-0.36, target.pitch + dy * 0.006));
  }

  function onPointerUp(event) {
    const wasClick = !scene.dragMoved && Math.hypot(event.clientX - scene.pointerStart.x, event.clientY - scene.pointerStart.y) <= 6;
    scene.dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (wasClick) {
      const rect = canvas.getBoundingClientRect();
      const hit = pickRegionScene(scene, event.clientX - rect.left, event.clientY - rect.top);
      if (hit) {
        selection.region = hit.region;
        selection.year = null;
      } else {
        selection.region = null;
        selection.year = null;
      }
      updateRegionInfoPanel(infoSlot, selection.region);
    }
  }

  function resetView() {
    target.yaw = -0.32;
    target.pitch = -0.78;
  }

  function frame() {
    if (scene.disposed) return;
    camera.yaw += (target.yaw - camera.yaw) * 0.15;
    camera.pitch += (target.pitch - camera.pitch) * 0.15;
    drawRegionScene(ctx, scene, camera, regions, outputRows, years, maxOutput, selection);
    scene.raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("dblclick", resetView);
  scene.raf = requestAnimationFrame(frame);

  return {
    dispose() {
      scene.disposed = true;
      cancelAnimationFrame(scene.raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("dblclick", resetView);
    },
  };
}

function rotate3D(point, camera) {
  const yawCos = Math.cos(camera.yaw);
  const yawSin = Math.sin(camera.yaw);
  const pitchCos = Math.cos(camera.pitch);
  const pitchSin = Math.sin(camera.pitch);
  const x1 = point.x * yawCos - point.z * yawSin;
  const z1 = point.x * yawSin + point.z * yawCos;
  const y1 = point.y * pitchCos - z1 * pitchSin;
  const z2 = point.y * pitchSin + z1 * pitchCos;
  return { x: x1, y: y1, z: z2 };
}

function project3D(point, camera, scene) {
  const rotated = rotate3D(point, camera);
  const rightReserve = scene.w >= 980 ? Math.min(scene.w * 0.3, 420) : 0;
  const centerX = scene.w / 2 - rightReserve * 0.48;
  const scale = Math.min(scene.w - rightReserve, scene.h) / 560;
  const depth = camera.fov + rotated.z;
  const perspective = camera.fov / Math.max(260, depth);
  return {
    x: centerX + rotated.x * scale * perspective,
    y: scene.h * 0.58 - rotated.y * scale * perspective,
    z: rotated.z,
  };
}

function extractFeatureRings(feature) {
  const geometry = feature.geometry || {};
  if (geometry.type === "Polygon") {
    return [geometry.coordinates[0]].filter(Boolean);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((polygon) => polygon[0]).filter(Boolean);
  }
  return [];
}

function simplifyRingForScene(ring) {
  if (ring.length <= 260) return ring;
  const stride = Math.max(1, Math.ceil(ring.length / 260));
  const simplified = ring.filter((_, index) => index % stride === 0);
  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    simplified.push(first);
  }
  return simplified;
}

function fallbackMapRegions() {
  return [
    {
      name: "河北",
      center: { x: -80, z: 50 },
      polygon: [
        { x: -285, z: -78 },
        { x: -158, z: -170 },
        { x: 48, z: -136 },
        { x: 185, z: -18 },
        { x: 230, z: 126 },
        { x: 76, z: 210 },
        { x: -136, z: 188 },
        { x: -302, z: 82 },
      ],
    },
    {
      name: "北京",
      center: { x: 60, z: -112 },
      polygon: [
        { x: 8, z: -182 },
        { x: 74, z: -205 },
        { x: 130, z: -158 },
        { x: 118, z: -96 },
        { x: 50, z: -74 },
        { x: -2, z: -118 },
      ],
    },
    {
      name: "天津",
      center: { x: 178, z: -8 },
      polygon: [
        { x: 140, z: -78 },
        { x: 198, z: -58 },
        { x: 228, z: -5 },
        { x: 206, z: 60 },
        { x: 148, z: 70 },
        { x: 120, z: 10 },
      ],
    },
  ];
}

function buildMapRegionShapes() {
  if (!GEO_DATA?.features?.length) return fallbackMapRegions();
  const raw = GEO_DATA.features.map((feature) => ({
    name: feature.properties?.displayName || feature.properties?.name || "地区",
    rings: extractFeatureRings(feature),
  })).filter((feature) => feature.rings.length);
  if (!raw.length) return fallbackMapRegions();

  const all = raw.flatMap((feature) => feature.rings.flat());
  const minLon = Math.min(...all.map((p) => p[0]));
  const maxLon = Math.max(...all.map((p) => p[0]));
  const minLat = Math.min(...all.map((p) => p[1]));
  const maxLat = Math.max(...all.map((p) => p[1]));
  const lonSpan = maxLon - minLon || 1;
  const latSpan = maxLat - minLat || 1;
  const scale = Math.min(850 / lonSpan, 625 / latSpan);
  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;
  return raw.map((feature) => {
    const polygons = feature.rings.map((ring) => {
      const simplified = simplifyRingForScene(ring);
      return simplified.map(([lon, lat]) => ({
        x: (lon - cx) * scale,
        z: -(lat - cy) * scale,
      }));
    }).filter((ring) => ring.length >= 3);
    const points = polygons.flat();
    const center = {
      x: sum(points.map((p) => p.x)) / points.length,
      z: sum(points.map((p) => p.z)) / points.length,
    };
    return {
      name: feature.name.replace(/[市省]$/u, ""),
      center,
      polygons,
    };
  });
}

function drawRegionScene(ctx, scene, camera, regions, outputRows, years, maxOutput, selection) {
  ctx.clearRect(0, 0, scene.w, scene.h);
  drawRegionSceneBackground(ctx, scene);

  const faces = [];
  const hitAreas = [];
  const metrics = getRegionSceneMetrics(scene);
  regions.forEach((region) => {
    const isRegionSelected = selection.region === region.name;
    const elevation = isRegionSelected ? metrics.selectedElevation : 0;
    (region.polygons || [region.polygon]).forEach((polygon) => {
      const topFill = isRegionSelected ? "rgba(89, 220, 255, 0.48)" : "rgba(79, 214, 255, 0.33)";
      const sideFill = isRegionSelected ? "rgba(28, 139, 190, 0.58)" : "rgba(23, 116, 160, 0.42)";
      addExtrudedRegionFaces(faces, polygon, 22, topFill, sideFill, elevation);
      hitAreas.push(makeRegionHitArea(region.name, polygon, elevation, camera, scene));
    });
    years.forEach((year, index) => {
      const value = outputRows[year][region.name];
      const xOffset = index === 0 ? -metrics.barOffset : metrics.barOffset;
      const height = metrics.baseBarHeight + (value / maxOutput) * metrics.maxBarHeight;
      const isActiveRegion = selection.region === region.name;
      const isSelectedBar = isActiveRegion;
      const palette = getYearPalette(year, isActiveRegion, isSelectedBar);
      const bar = {
        x: region.center.x + xOffset,
        z: region.center.z + 4,
        baseY: elevation + 1,
        w: metrics.barSize,
        d: metrics.barSize,
        h: height,
        color: palette.color,
        side: palette.side,
        top: palette.top,
        stroke: palette.edge,
        glow: palette.glow,
        lineWidth: palette.lineWidth,
      };
      addBarFaces(faces, {
        ...bar,
      });
      hitAreas.push(makeBarHitArea(region.name, year, bar, camera, scene));
    });
  });
  scene.hitAreas = hitAreas;

  faces
    .map((face) => ({ ...face, depth: averageDepth(face.points, camera) }))
    .sort((a, b) => b.depth - a.depth)
    .forEach((face) => drawProjectedPolygon(ctx, face.points, camera, scene, face.fill, face.stroke, face.lineWidth, face.glow));

  drawSceneLabels(ctx, scene, camera, regions, outputRows, years, maxOutput, selection);
  drawSceneHud(ctx, scene, outputRows, years, selection);
}

function getRegionSceneMetrics(scene) {
  return {
    barOffset: scene.w < 680 ? 24 : 36,
    barSize: scene.w < 680 ? 20 : 26,
    baseBarHeight: 30,
    maxBarHeight: scene.w < 680 ? 150 : 190,
    selectedElevation: scene.w < 680 ? 18 : 28,
    regionLabelZ: scene.w < 680 ? 60 : 78,
    topLabelLift: scene.w < 680 ? 24 : 32,
  };
}

function getYearPalette(year, active = false, selected = false) {
  if (active && year === "2017") {
    return {
      color: "rgba(74, 213, 255, 0.96)",
      side: "rgba(24, 114, 176, 0.92)",
      top: "rgba(190, 244, 255, 0.72)",
      text: "#4ad5ff",
      edge: "#7fe8ff",
      glow: "rgba(74, 213, 255, 0.7)",
      lineWidth: selected ? 2.3 : 1.7,
    };
  }
  if (active) {
    return {
      color: "rgba(247, 188, 71, 0.95)",
      side: "rgba(171, 102, 20, 0.9)",
      top: "rgba(255, 226, 151, 0.7)",
      text: "#ffc75a",
      edge: "#ffd680",
      glow: "rgba(247, 188, 71, 0.68)",
      lineWidth: selected ? 2.3 : 1.7,
    };
  }
  if (year === "2017") {
    return {
      color: "rgba(158, 171, 181, 0.82)",
      side: "rgba(93, 106, 116, 0.78)",
      top: "rgba(218, 228, 234, 0.52)",
      text: "#c3d0d8",
      edge: "rgba(232, 240, 245, 0.34)",
      glow: "rgba(0, 0, 0, 0)",
      lineWidth: 1,
    };
  }
  return {
    color: "rgba(110, 124, 135, 0.78)",
    side: "rgba(62, 74, 84, 0.76)",
    top: "rgba(166, 179, 188, 0.5)",
    text: "#d2dbe1",
    edge: "rgba(232, 240, 245, 0.3)",
    glow: "rgba(0, 0, 0, 0)",
    lineWidth: 1,
  };
}

function drawRegionSceneBackground(ctx, scene) {
  const gradient = ctx.createLinearGradient(0, 0, scene.w, scene.h);
  gradient.addColorStop(0, "rgba(7, 26, 45, 0.92)");
  gradient.addColorStop(0.55, "rgba(5, 20, 35, 0.92)");
  gradient.addColorStop(1, "rgba(8, 35, 55, 0.86)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, scene.w, scene.h);

  ctx.strokeStyle = "rgba(74, 213, 255, 0.08)";
  ctx.lineWidth = 1;
  const grid = 54;
  for (let x = 0; x < scene.w; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, scene.h);
    ctx.stroke();
  }
  for (let y = 0; y < scene.h; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(scene.w, y);
    ctx.stroke();
  }

  const glow = ctx.createRadialGradient(scene.w * 0.58, scene.h * 0.42, 40, scene.w * 0.58, scene.h * 0.42, scene.w * 0.55);
  glow.addColorStop(0, "rgba(74, 213, 255, 0.16)");
  glow.addColorStop(1, "rgba(74, 213, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, scene.w, scene.h);
}

function addExtrudedRegionFaces(faces, polygon, thickness, topFill, sideFill, elevation = 0) {
  const top = polygon.map((p) => ({ x: p.x, y: elevation, z: p.z }));
  const bottom = polygon.map((p) => ({ x: p.x, y: elevation - thickness, z: p.z }));
  for (let i = 0; i < polygon.length; i += 1) {
    const next = (i + 1) % polygon.length;
    faces.push({
      points: [top[i], top[next], bottom[next], bottom[i]],
      fill: sideFill,
      stroke: "rgba(74, 213, 255, 0.14)",
      lineWidth: 1,
    });
  }
  faces.push({
    points: top,
    fill: topFill,
    stroke: "rgba(160, 236, 255, 0.76)",
    lineWidth: 1.4,
  });
}

function addBarFaces(faces, bar) {
  const x0 = bar.x - bar.w / 2;
  const x1 = bar.x + bar.w / 2;
  const z0 = bar.z - bar.d / 2;
  const z1 = bar.z + bar.d / 2;
  const y0 = bar.baseY ?? 1;
  const y1 = y0 + bar.h;
  const p = {
    nwb: { x: x0, y: y0, z: z0 },
    neb: { x: x1, y: y0, z: z0 },
    seb: { x: x1, y: y0, z: z1 },
    swb: { x: x0, y: y0, z: z1 },
    nwt: { x: x0, y: y1, z: z0 },
    net: { x: x1, y: y1, z: z0 },
    set: { x: x1, y: y1, z: z1 },
    swt: { x: x0, y: y1, z: z1 },
  };
  const stroke = bar.stroke || "rgba(255,255,255,0.18)";
  const glow = bar.glow || "rgba(0,0,0,0)";
  const lineWidth = bar.lineWidth || 1;
  faces.push({ points: [p.nwb, p.neb, p.net, p.nwt], fill: bar.side, stroke, lineWidth, glow });
  faces.push({ points: [p.neb, p.seb, p.set, p.net], fill: bar.color, stroke, lineWidth, glow });
  faces.push({ points: [p.seb, p.swb, p.swt, p.set], fill: bar.side, stroke, lineWidth, glow });
  faces.push({ points: [p.swb, p.nwb, p.nwt, p.swt], fill: bar.side, stroke, lineWidth, glow });
  faces.push({ points: [p.nwt, p.net, p.set, p.swt], fill: bar.top || "rgba(255,255,255,0.38)", stroke, lineWidth, glow });
}

function getBar3DPoints(bar) {
  const x0 = bar.x - bar.w / 2;
  const x1 = bar.x + bar.w / 2;
  const z0 = bar.z - bar.d / 2;
  const z1 = bar.z + bar.d / 2;
  const y0 = bar.baseY ?? 1;
  const y1 = y0 + bar.h;
  return [
    { x: x0, y: y0, z: z0 },
    { x: x1, y: y0, z: z0 },
    { x: x1, y: y0, z: z1 },
    { x: x0, y: y0, z: z1 },
    { x: x0, y: y1, z: z0 },
    { x: x1, y: y1, z: z0 },
    { x: x1, y: y1, z: z1 },
    { x: x0, y: y1, z: z1 },
  ];
}

function makeBarHitArea(region, year, bar, camera, scene) {
  const points = getBar3DPoints(bar);
  const projected = points.map((point) => project3D(point, camera, scene));
  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  const pad = 5;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  return {
    type: "bar",
    region,
    year,
    depth: averageDepth(points, camera),
    polygon: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
  };
}

function makeRegionHitArea(region, polygon, elevation, camera, scene) {
  const points = polygon.map((point) => ({ x: point.x, y: elevation, z: point.z }));
  return {
    type: "region",
    region,
    depth: averageDepth(points, camera),
    polygon: points.map((point) => project3D(point, camera, scene)),
  };
}

function pickRegionScene(scene, x, y) {
  const point = { x, y };
  const bars = scene.hitAreas
    .filter((area) => area.type === "bar")
    .sort((a, b) => a.depth - b.depth);
  const barHit = bars.find((area) => pointInPolygon2D(point, area.polygon));
  if (barHit) return barHit;

  return scene.hitAreas
    .filter((area) => area.type === "region")
    .sort((a, b) => a.depth - b.depth)
    .find((area) => pointInPolygon2D(point, area.polygon)) || null;
}

function pointInPolygon2D(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function averageDepth(points, camera) {
  return sum(points.map((point) => rotate3D(point, camera).z)) / points.length;
}

function drawProjectedPolygon(ctx, points, camera, scene, fill, stroke, lineWidth, glow) {
  const projected = points.map((point) => project3D(point, camera, scene));
  ctx.beginPath();
  projected.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.shadowColor = glow || "rgba(0,0,0,0)";
    ctx.shadowBlur = glow ? 14 : 0;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth || 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawSceneLabels(ctx, scene, camera, regions, outputRows, years, maxOutput, selection) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const metrics = getRegionSceneMetrics(scene);
  regions.forEach((region) => {
    const active = selection.region === region.name;
    const elevation = active ? metrics.selectedElevation : 0;
    drawGroundText(ctx, region.name, { x: region.center.x, y: elevation + 5, z: region.center.z + metrics.regionLabelZ }, camera, scene, {
      sourceWidth: active ? 150 : 120,
      sourceHeight: active ? 36 : 30,
      worldWidth: active ? 108 : 82,
      worldDepth: active ? 34 : 28,
      font: active
        ? "800 20px DIN Alternate, Avenir Next, PingFang SC, Microsoft YaHei, Arial"
        : "700 16px DIN Alternate, Avenir Next, PingFang SC, Microsoft YaHei, Arial",
      fill: active ? "#eafaff" : "rgba(219, 242, 255, 0.82)",
      stroke: active ? "rgba(74, 213, 255, 0.68)" : "rgba(4, 20, 34, 0.72)",
      glow: active ? "rgba(74, 213, 255, 0.72)" : "rgba(0,0,0,0)",
      lineWidth: active ? 4 : 3,
    });

    if (!active) return;
    years.forEach((year, index) => {
      const value = outputRows[year][region.name];
      const xOffset = index === 0 ? -metrics.barOffset : metrics.barOffset;
      const height = metrics.baseBarHeight + (value / maxOutput) * metrics.maxBarHeight;
      const palette = getYearPalette(year, true, true);
      const point = project3D({
        x: region.center.x + xOffset,
        y: elevation + 1 + height + metrics.topLabelLift,
        z: region.center.z + 4,
      }, camera, scene);
      drawFloatingText(ctx, fmt(value, 0), point, {
        font: "800 13px DIN Alternate, Avenir Next, PingFang SC, Microsoft YaHei, Arial",
        fill: palette.text,
        stroke: "rgba(5, 18, 30, 0.92)",
        glow: palette.glow,
        lineWidth: 3,
      });
    });
  });
}

function drawGroundText(ctx, text, center, camera, scene, options) {
  const sourceWidth = options.sourceWidth || 140;
  const sourceHeight = options.sourceHeight || 32;
  const worldWidth = options.worldWidth || 96;
  const worldDepth = options.worldDepth || 30;
  const pc = project3D(center, camera, scene);
  const px0 = project3D({ x: center.x - worldWidth / 2, y: center.y, z: center.z }, camera, scene);
  const px1 = project3D({ x: center.x + worldWidth / 2, y: center.y, z: center.z }, camera, scene);
  const pz0 = project3D({ x: center.x, y: center.y, z: center.z - worldDepth / 2 }, camera, scene);
  const pz1 = project3D({ x: center.x, y: center.y, z: center.z + worldDepth / 2 }, camera, scene);
  let ux = (px1.x - px0.x) / sourceWidth;
  let uy = (px1.y - px0.y) / sourceWidth;
  let vx = (pz1.x - pz0.x) / sourceHeight;
  let vy = (pz1.y - pz0.y) / sourceHeight;

  if (ux < 0) {
    ux *= -1;
    uy *= -1;
  }
  if (ux * vy - uy * vx < 0) {
    vx *= -1;
    vy *= -1;
  }
  const originX = pc.x - ux * sourceWidth / 2 - vx * sourceHeight / 2;
  const originY = pc.y - uy * sourceWidth / 2 - vy * sourceHeight / 2;

  ctx.save();
  ctx.transform(ux, uy, vx, vy, originX, originY);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = options.font;
  ctx.lineWidth = options.lineWidth || 3;
  ctx.strokeStyle = options.stroke || "rgba(0,0,0,0.7)";
  ctx.fillStyle = options.fill || "#eaf7ff";
  ctx.shadowColor = options.glow || "rgba(0,0,0,0)";
  ctx.shadowBlur = options.glow ? 12 : 0;
  ctx.strokeText(text, sourceWidth / 2, sourceHeight / 2);
  ctx.fillText(text, sourceWidth / 2, sourceHeight / 2);
  ctx.restore();
}

function drawFloatingText(ctx, text, point, options) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = options.font;
  ctx.lineWidth = options.lineWidth || 3;
  ctx.strokeStyle = options.stroke || "rgba(0,0,0,0.8)";
  ctx.fillStyle = options.fill || "#eaf7ff";
  ctx.shadowColor = options.glow || "rgba(0,0,0,0)";
  ctx.shadowBlur = options.glow ? 10 : 0;
  ctx.strokeText(text, point.x, point.y);
  ctx.fillText(text, point.x, point.y);
  ctx.restore();
}

function drawSceneHud(ctx, scene, outputRows, years, selection) {
  const pad = scene.w < 720 ? 18 : 28;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.shadowBlur = 0;
  ctx.font = "700 22px PingFang SC, Microsoft YaHei, Arial";
  ctx.fillStyle = "#eaf7ff";
  ctx.fillText("京津冀三地总产出立体画像", pad, pad);
  ctx.font = "13px PingFang SC, Microsoft YaHei, Arial";
  ctx.fillStyle = "rgba(157, 193, 214, 0.9)";
  ctx.fillText("拖拽旋转 · 双击复位 · 单位：亿元", pad, pad + 34);

  const legendX = pad;
  const legendY = scene.h - 72;
  const legendActive = Boolean(selection.region);
  years.forEach((year, index) => {
    const x = legendX + index * 110;
    const palette = getYearPalette(year, legendActive, legendActive);
    ctx.shadowColor = legendActive ? palette.glow : "rgba(0,0,0,0)";
    ctx.shadowBlur = legendActive ? 12 : 0;
    ctx.fillStyle = palette.color;
    ctx.fillRect(x, legendY, 14, 14);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = legendActive ? palette.lineWidth : 1;
    ctx.strokeRect(x, legendY, 14, 14);
    ctx.font = "13px PingFang SC, Microsoft YaHei, Arial";
    ctx.fillStyle = legendActive ? palette.text : "#cfe5f2";
    ctx.fillText(`${year}年`, x + 22, legendY - 1);
  });

  const total2017 = sum(DATA.regions.map((region) => outputRows["2017"][region]));
  const total2022 = sum(DATA.regions.map((region) => outputRows["2022"][region]));
  const text = `三地合计：2017 ${fmt(total2017, 0)} / 2022 ${fmt(total2022, 0)}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(157, 193, 214, 0.86)";
  ctx.fillText(text, pad, scene.w < 760 ? legendY + 26 : pad + 58);
}

function initRegionalLinkScene(canvas) {
  const ctx = canvas.getContext("2d");
  const infoSlot = $("#regionalLinkInfoSlot");
  const camera = { yaw: -0.32, pitch: -0.78, fov: 820 };
  const target = { yaw: camera.yaw, pitch: camera.pitch };
  const scene = {
    raf: 0,
    disposed: false,
    dragging: false,
    pointer: { x: 0, y: 0 },
    pointerStart: { x: 0, y: 0 },
    dragMoved: false,
    dpr: 1,
    w: 0,
    h: 0,
    hitAreas: [],
  };
  const selection = { region: null, edge: null };
  const regions = buildMapRegionShapes();
  updateRegionalLinkInfoPanel(infoSlot, selection);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    scene.dpr = Math.min(window.devicePixelRatio || 1, 2);
    scene.w = Math.max(320, rect.width);
    scene.h = Math.max(420, rect.height);
    canvas.width = Math.round(scene.w * scene.dpr);
    canvas.height = Math.round(scene.h * scene.dpr);
    ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
  }

  function onPointerDown(event) {
    scene.dragging = true;
    scene.pointer.x = event.clientX;
    scene.pointer.y = event.clientY;
    scene.pointerStart.x = event.clientX;
    scene.pointerStart.y = event.clientY;
    scene.dragMoved = false;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!scene.dragging) return;
    const dx = event.clientX - scene.pointer.x;
    const dy = event.clientY - scene.pointer.y;
    scene.pointer.x = event.clientX;
    scene.pointer.y = event.clientY;
    if (Math.hypot(event.clientX - scene.pointerStart.x, event.clientY - scene.pointerStart.y) <= 5) return;
    scene.dragMoved = true;
    target.yaw += dx * 0.009;
    target.pitch = Math.max(-1.08, Math.min(-0.36, target.pitch + dy * 0.006));
  }

  function onPointerUp(event) {
    const wasClick = !scene.dragMoved && Math.hypot(event.clientX - scene.pointerStart.x, event.clientY - scene.pointerStart.y) <= 6;
    scene.dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (!wasClick) return;
    const rect = canvas.getBoundingClientRect();
    const hit = pickRegionalLinkScene(scene, event.clientX - rect.left, event.clientY - rect.top);
    if (hit?.type === "link") {
      selection.edge = hit.edge;
      selection.region = null;
    } else if (hit?.type === "region") {
      selection.region = hit.region;
      selection.edge = null;
    } else {
      selection.region = null;
      selection.edge = null;
    }
    updateRegionalLinkInfoPanel(infoSlot, selection);
  }

  function resetView() {
    target.yaw = -0.32;
    target.pitch = -0.78;
  }

  function frame() {
    if (scene.disposed) return;
    camera.yaw += (target.yaw - camera.yaw) * 0.15;
    camera.pitch += (target.pitch - camera.pitch) * 0.15;
    drawRegionalLinkScene(ctx, scene, camera, regions, selection);
    scene.raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("dblclick", resetView);
  scene.raf = requestAnimationFrame(frame);

  return {
    dispose() {
      scene.disposed = true;
      cancelAnimationFrame(scene.raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("dblclick", resetView);
    },
  };
}

function getRegionalLinkSceneMetrics(scene) {
  return {
    selectedElevation: scene.w < 680 ? 18 : 28,
    regionLabelZ: scene.w < 680 ? 60 : 78,
    linkLift: scene.w < 680 ? 72 : 98,
    linkCurveOffset: scene.w < 680 ? 34 : 54,
  };
}

function drawRegionalLinkScene(ctx, scene, camera, regions, selection) {
  ctx.clearRect(0, 0, scene.w, scene.h);
  drawRegionSceneBackground(ctx, scene);
  const { edges } = getRegionalEffectStats();
  const metrics = getRegionalLinkSceneMetrics(scene);
  const faces = [];
  const hitAreas = [];
  const activeRegions = new Set(selection.edge ? [selection.edge.source, selection.edge.target] : [selection.region].filter(Boolean));

  regions.forEach((region) => {
    const active = activeRegions.has(region.name);
    const elevation = active ? metrics.selectedElevation : 0;
    (region.polygons || [region.polygon]).forEach((polygon) => {
      const topFill = active ? "rgba(89, 220, 255, 0.48)" : "rgba(79, 214, 255, 0.28)";
      const sideFill = active ? "rgba(28, 139, 190, 0.58)" : "rgba(23, 116, 160, 0.36)";
      addExtrudedRegionFaces(faces, polygon, 20, topFill, sideFill, elevation);
      hitAreas.push(makeRegionHitArea(region.name, polygon, elevation, camera, scene));
    });
  });

  faces
    .map((face) => ({ ...face, depth: averageDepth(face.points, camera) }))
    .sort((a, b) => b.depth - a.depth)
    .forEach((face) => drawProjectedPolygon(ctx, face.points, camera, scene, face.fill, face.stroke, face.lineWidth, face.glow));

  const centers = Object.fromEntries(regions.map((region) => [region.name, region.center]));
  const maxAbs = Math.max(0.001, ...edges.map((edge) => Math.abs(edge.value)));
  const topEdgeIds = new Set(edges.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 2).map((edge) => edge.id));
  edges.forEach((edge) => {
    const linkHit = drawRegionalLink(ctx, scene, camera, centers, edge, maxAbs, selection, topEdgeIds, metrics);
    if (linkHit) hitAreas.push(linkHit);
  });

  drawRegionalLinkLabels(ctx, scene, camera, regions, activeRegions, metrics);
  drawRegionalLinkHud(ctx, scene, selection);
  scene.hitAreas = hitAreas;
}

function drawRegionalLinkLabels(ctx, scene, camera, regions, activeRegions, metrics) {
  regions.forEach((region) => {
    const active = activeRegions.has(region.name);
    const elevation = active ? metrics.selectedElevation : 0;
    drawGroundText(ctx, region.name, { x: region.center.x, y: elevation + 5, z: region.center.z + metrics.regionLabelZ }, camera, scene, {
      sourceWidth: active ? 150 : 120,
      sourceHeight: active ? 36 : 30,
      worldWidth: active ? 108 : 82,
      worldDepth: active ? 34 : 28,
      font: active
        ? "800 20px DIN Alternate, Avenir Next, PingFang SC, Microsoft YaHei, Arial"
        : "700 16px DIN Alternate, Avenir Next, PingFang SC, Microsoft YaHei, Arial",
      fill: active ? "#eafaff" : "rgba(219, 242, 255, 0.82)",
      stroke: active ? "rgba(74, 213, 255, 0.68)" : "rgba(4, 20, 34, 0.72)",
      glow: active ? "rgba(74, 213, 255, 0.72)" : "rgba(0,0,0,0)",
      lineWidth: active ? 4 : 3,
    });
  });
}

function drawRegionalLink(ctx, scene, camera, centers, edge, maxAbs, selection, topEdgeIds, metrics) {
  const startCenter = centers[edge.source];
  const endCenter = centers[edge.target];
  if (!startCenter || !endCenter) return null;
  const selected = selection.edge?.id === edge.id;
  const related = selection.region ? (edge.source === selection.region || edge.target === selection.region) : true;
  const edgeRelated = selection.edge ? selected : related;
  const active = (!selection.region && !selection.edge) || edgeRelated;
  const sourceElevation = (selection.region === edge.source || selection.edge?.source === edge.source || selection.edge?.target === edge.source)
    ? metrics.selectedElevation
    : 0;
  const targetElevation = (selection.region === edge.target || selection.edge?.source === edge.target || selection.edge?.target === edge.target)
    ? metrics.selectedElevation
    : 0;
  const start = { x: startCenter.x, y: sourceElevation + 16, z: startCenter.z };
  const end = { x: endCenter.x, y: targetElevation + 16, z: endCenter.z };
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const len = Math.hypot(dx, dz) || 1;
  const sourceIndex = DATA.regions.indexOf(edge.source);
  const targetIndex = DATA.regions.indexOf(edge.target);
  const curveSign = sourceIndex < targetIndex ? 1 : -1;
  const control = {
    x: (start.x + end.x) / 2 + (-dz / len) * metrics.linkCurveOffset * curveSign,
    y: Math.max(start.y, end.y) + metrics.linkLift + Math.min(34, Math.abs(edge.value) / maxAbs * 34),
    z: (start.z + end.z) / 2 + (dx / len) * metrics.linkCurveOffset * curveSign,
  };
  const samples = [];
  for (let i = 0; i <= 18; i += 1) {
    samples.push(quadraticPoint(start, control, end, i / 18));
  }
  const projected = samples.map((point) => project3D(point, camera, scene));
  const palette = getRegionalLinkPalette(edge.value, maxAbs, active, selected);

  ctx.save();
  ctx.beginPath();
  projected.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = palette.width;
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = palette.glowBlur;
  ctx.setLineDash(edge.value < 0 ? [8, 7] : []);
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.setLineDash([]);
  drawRegionalArrow(ctx, projected[projected.length - 3], projected[projected.length - 1], palette.stroke, palette.width);
  ctx.restore();

  if (selected || (!selection.region && !selection.edge && topEdgeIds.has(edge.id))) {
    const labelPoint = project3D(quadraticPoint(start, control, end, 0.52), camera, scene);
    drawFloatingText(ctx, fmtEffectValue(edge.value), labelPoint, {
      font: selected
        ? "800 14px DIN Alternate, Avenir Next, PingFang SC, Microsoft YaHei, Arial"
        : "700 12px DIN Alternate, Avenir Next, PingFang SC, Microsoft YaHei, Arial",
      fill: edge.value < 0 ? "#ff9a74" : "#4ad5ff",
      stroke: "rgba(5, 18, 30, 0.94)",
      glow: selected ? palette.glow : "rgba(0,0,0,0)",
      lineWidth: 3,
    });
  }

  return {
    type: "link",
    edge,
    depth: averageDepth(samples, camera),
    samples: projected,
    threshold: selected ? 16 : 12,
  };
}

function quadraticPoint(start, control, end, t) {
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  return {
    x: start.x * a + control.x * b + end.x * c,
    y: start.y * a + control.y * b + end.y * c,
    z: start.z * a + control.z * b + end.z * c,
  };
}

function getRegionalLinkPalette(value, maxAbs, active, selected) {
  if (!active) {
    return {
      stroke: "rgba(128, 147, 158, 0.26)",
      width: 1.3,
      glow: "rgba(0,0,0,0)",
      glowBlur: 0,
    };
  }
  const intensity = Math.min(1, 0.22 + Math.abs(value) / maxAbs * 0.78);
  const positive = value >= 0;
  return {
    stroke: positive
      ? `rgba(74, 213, 255, ${selected ? 0.98 : 0.48 + intensity * 0.38})`
      : `rgba(255, 125, 83, ${selected ? 0.98 : 0.5 + intensity * 0.34})`,
    width: (selected ? 3.5 : 1.6) + intensity * 3.2,
    glow: positive ? "rgba(74, 213, 255, 0.58)" : "rgba(255, 125, 83, 0.48)",
    glowBlur: selected ? 18 : 8,
  };
}

function drawRegionalArrow(ctx, from, to, color, width) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = Math.max(8, width * 2.3);
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - 0.48) * size, to.y - Math.sin(angle - 0.48) * size);
  ctx.lineTo(to.x - Math.cos(angle + 0.48) * size, to.y - Math.sin(angle + 0.48) * size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRegionalLinkHud(ctx, scene, selection) {
  const pad = scene.w < 720 ? 18 : 28;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.shadowBlur = 0;
  ctx.font = "700 22px PingFang SC, Microsoft YaHei, Arial";
  ctx.fillStyle = "#eaf7ff";
  ctx.fillText("区域产业联动分析", pad, pad);
  ctx.font = "13px PingFang SC, Microsoft YaHei, Arial";
  ctx.fillStyle = "rgba(157, 193, 214, 0.9)";
  ctx.fillText(`${state.stage} · ${getEffectModeName()} · 拖拽旋转 · 双击复位`, pad, pad + 34);

  const legendY = scene.h - 72;
  const items = [
    ["正向带动", "rgba(74, 213, 255, 0.9)", []],
    ["负向变化", "rgba(255, 125, 83, 0.9)", [8, 7]],
    ["选中相关", "#eafaff", []],
  ];
  items.forEach(([label, color, dash], index) => {
    const x = pad + index * 112;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = index === 2 && (selection.region || selection.edge) ? 3.2 : 2.2;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(x, legendY + 7);
    ctx.lineTo(x + 28, legendY + 7);
    ctx.stroke();
    ctx.restore();
    ctx.font = "13px PingFang SC, Microsoft YaHei, Arial";
    ctx.fillStyle = "rgba(207, 229, 242, 0.88)";
    ctx.fillText(label, x + 36, legendY - 1);
  });
}

function pickRegionalLinkScene(scene, x, y) {
  const point = { x, y };
  const linkHit = scene.hitAreas
    .filter((area) => area.type === "link")
    .sort((a, b) => a.depth - b.depth)
    .find((area) => pointNearPolyline(point, area.samples, area.threshold));
  if (linkHit) return linkHit;

  return scene.hitAreas
    .filter((area) => area.type === "region")
    .sort((a, b) => a.depth - b.depth)
    .find((area) => pointInPolygon2D(point, area.polygon)) || null;
}

function pointNearPolyline(point, samples, threshold) {
  for (let i = 1; i < samples.length; i += 1) {
    if (distanceToSegment(point, samples[i - 1], samples[i]) <= threshold) return true;
  }
  return false;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

const POLICY_AXIS_META = {
  tool: {
    axis: "X",
    title: "政策工具要素",
    fullTitle: "X 政策工具要素数",
    color: COLORS.北京,
    coord: "x",
    source: "表4-5",
  },
  cooperation: {
    axis: "Y",
    title: "合作阶段要素",
    fullTitle: "Y 合作阶段要素数",
    color: COLORS.下游,
    coord: "y",
    source: "表4-4",
  },
  industry: {
    axis: "Z",
    title: "产业划分要素",
    fullTitle: "Z 产业划分要素数",
    color: COLORS.河北,
    coord: "z",
    source: "表4-2",
  },
};

const POLICY_AXIS_ORDER = ["tool", "cooperation", "industry"];
const POLICY_DIMENSION_ORDER = ["X政策工具维度", "Y合作程度维度", "Z产业划分维度"];
const POLICY_Y_VISUAL_SCALE = 0.66;
const POLICY_TOOL_KEYS = ["财税补贴类", "供给平台类", "规则标准类", "信息协调类"];
const POLICY_TOOL_LABELS = {
  财税补贴类: "财税补贴",
  供给平台类: "供给平台",
  规则标准类: "规划/标准",
  信息协调类: "信息协调",
};
const POLICY_COOPERATION_KEYS = ["初期", "成熟", "深度"];
const POLICY_CHAIN_COLORS = {
  网络安全和工业互联网: "#4ad5ff",
  生物医药: "#54e6a3",
  新能源和智能网联汽车: "#f7bc47",
  氢能: "#a88cff",
  高端仪器设备和工业母机: "#ff8d5c",
  机器人: "#ff5da8",
};

const POLICY_SHORT_LABELS = {
  网络安全和工业互联网: ["网络安全", "工业互联网"],
  生物医药: ["生物", "医药"],
  新能源和智能网联汽车: ["新能源", "智能网联"],
  氢能: ["氢能"],
  高端仪器设备和工业母机: ["高端仪器", "工业母机"],
  机器人: ["机器人"],
};

const DEFAULT_POLICY_CONCLUSIONS = [
  {
    title: "工具供给以规则与信息协调为主",
    text: "政策工具维度共有1254个参考点，占总体48.89%。信息协调类442个、规划标准类439个，两者合计超过七成；财税补贴类仅84个、占6.7%，显示政策更偏向制度环境塑造而非直接资金投入。",
  },
  {
    title: "协同深度仍停留在初期至成熟阶段",
    text: "合作程度维度共有999个参考点。成熟阶段430个、初期375个，深度合作仅194个，说明政策更重视稳定见效和可复制项目，对核心技术共享、利益分配和制度深度绑定的支撑仍不足。",
  },
  {
    title: "产业支持集中于成熟基础较强领域",
    text: "产业划分维度共有312个参考点，其中网络安全和工业互联网118个、生物医药96个，两者合计接近七成。氢能、高端仪器设备和工业母机、机器人等领域政策覆盖偏弱，存在基础制造与前沿硬件支持缺口。",
  },
  {
    title: "优化方向是工具链再平衡",
    text: "报告建议强化跨区域财税共享、协同基金、供给平台转化、标准互认和数字化信息流转，形成以财税补贴为底层动力、平台为支撑载体、规则标准为制度轨道、信息协调为神经中枢的协同网络。",
  },
];

function percentFromRef(value) {
  const match = String(value || "").match(/（([\d.]+)%/);
  return match ? Number(match[1]) : 0;
}

function getPolicyConclusions() {
  return DATA.policy.conclusions?.length ? DATA.policy.conclusions : DEFAULT_POLICY_CONCLUSIONS;
}

function getPolicyDimensionGroups() {
  return Object.fromEntries(POLICY_DIMENSION_ORDER.map((dimension) => [
    dimension,
    DATA.policy.dimensionElements.filter((item) => item.dimension === dimension),
  ]));
}

function hexToRgba(hex, alpha = 1) {
  const value = String(hex || "").replace("#", "");
  if (!/^[\da-f]{6}$/i.test(value)) return `rgba(74, 213, 255, ${alpha})`;
  const number = Number.parseInt(value, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function policyEntries(row, keys, labels = {}) {
  return keys.map((key) => ({
    key,
    label: labels[key] || key,
    count: countFromString(row?.[key]),
    raw: row?.[key] || "0（0%）",
  }));
}

function policyTopEntry(entries) {
  return entries.slice().sort((a, b) => b.count - a.count)[0] || { label: "—", count: 0, raw: "—" };
}

function getPolicyIndustryRows() {
  const toolByChain = Object.fromEntries((DATA.policy.toolByChain || []).map((row) => [row.chain, row]));
  const cooperationByChain = Object.fromEntries((DATA.policy.cooperationByChain || []).map((row) => [row.chain, row]));
  const industryElements = DATA.policy.dimensionElements.filter((item) => item.dimension === "Z产业划分维度");
  const industryByChain = Object.fromEntries(industryElements.map((item) => [item.element, item]));
  const chains = industryElements.length ? industryElements.map((item) => item.element) : DATA.chainCapital.map((item) => item.chain);
  const ranked = industryElements.slice().sort((a, b) => b.count - a.count).map((item) => item.element);

  return chains.map((chain, index) => {
    const toolEntries = policyEntries(toolByChain[chain], POLICY_TOOL_KEYS, POLICY_TOOL_LABELS);
    const cooperationEntries = policyEntries(cooperationByChain[chain], POLICY_COOPERATION_KEYS);
    const industry = industryByChain[chain] || {};
    const toolTotal = sum(toolEntries.map((entry) => entry.count));
    const cooperationTotal = sum(cooperationEntries.map((entry) => entry.count));
    const industryCount = Number(industry.count || 0);
    const color = POLICY_CHAIN_COLORS[chain] || COLORS.北京;
    return {
      chain,
      index,
      rank: ranked.indexOf(chain) + 1 || index + 1,
      color,
      toolEntries,
      cooperationEntries,
      toolTotal,
      cooperationTotal,
      industryCount,
      industryPercent: Number(industry.percent || 0),
      elementRef: industry.elementRef || `${industryCount}（0%）`,
      dimensionRef: industry.dimensionRef || "",
      dominantTool: policyTopEntry(toolEntries),
      dominantCooperation: policyTopEntry(cooperationEntries),
      coreProduct: DATA.coreProducts?.[chain] || "报告未列出核心产品或技术。",
      labelLines: POLICY_SHORT_LABELS[chain] || [chain],
    };
  }).filter((item) => item.chain);
}

function buildPolicy3DModel() {
  const axisLength = 400;
  const start = 34;
  const rows = getPolicyIndustryRows();
  const axisMax = {
    tool: Math.max(...rows.map((item) => item.toolTotal), 1),
    cooperation: Math.max(...rows.map((item) => item.cooperationTotal), 1),
    industry: Math.max(...rows.map((item) => item.industryCount), 1),
  };
  const scale = (value, max) => start + (axisLength - start) * (Number(value || 0) / max);
  const items = rows.map((raw) => ({
    ...raw,
    key: `policy-chain-${raw.chain}`,
    coord: {
      x: scale(raw.toolTotal, axisMax.tool),
      y: scale(raw.cooperationTotal, axisMax.cooperation),
      z: scale(raw.industryCount, axisMax.industry),
    },
    radius: 10 + Math.sqrt(raw.industryCount / axisMax.industry) * 20,
    meta: {
      color: raw.color,
      side: hexToRgba(raw.color, 0.2),
    },
  }));

  return {
    axisLength,
    axisMax,
    items,
  };
}

function initPolicy3DScene(canvas) {
  const ctx = canvas.getContext("2d");
  const infoSlot = $("#policyLinkInfoSlot");
  const camera = { yaw: -0.42, pitch: -0.52, fov: 840 };
  const target = { yaw: camera.yaw, pitch: camera.pitch };
  const model = buildPolicy3DModel();
  const scene = {
    raf: 0,
    disposed: false,
    dragging: false,
    pointer: { x: 0, y: 0 },
    pointerStart: { x: 0, y: 0 },
    dragMoved: false,
    dpr: 1,
    w: 0,
    h: 0,
    hitAreas: [],
  };
  const selection = { key: model.items[0]?.key || null };
  updatePolicyInfoPanel(infoSlot, model.items[0] || null);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    scene.dpr = Math.min(window.devicePixelRatio || 1, 2);
    scene.w = Math.max(320, rect.width);
    scene.h = Math.max(420, rect.height);
    canvas.width = Math.round(scene.w * scene.dpr);
    canvas.height = Math.round(scene.h * scene.dpr);
    ctx.setTransform(scene.dpr, 0, 0, scene.dpr, 0, 0);
  }

  function onPointerDown(event) {
    scene.dragging = true;
    scene.pointer.x = event.clientX;
    scene.pointer.y = event.clientY;
    scene.pointerStart.x = event.clientX;
    scene.pointerStart.y = event.clientY;
    scene.dragMoved = false;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!scene.dragging) return;
    const dx = event.clientX - scene.pointer.x;
    const dy = event.clientY - scene.pointer.y;
    scene.pointer.x = event.clientX;
    scene.pointer.y = event.clientY;
    if (Math.hypot(event.clientX - scene.pointerStart.x, event.clientY - scene.pointerStart.y) <= 5) return;
    scene.dragMoved = true;
    target.yaw += dx * 0.009;
    target.pitch = Math.max(-1.06, Math.min(-0.2, target.pitch + dy * 0.006));
  }

  function onPointerUp(event) {
    const wasClick = !scene.dragMoved && Math.hypot(event.clientX - scene.pointerStart.x, event.clientY - scene.pointerStart.y) <= 6;
    scene.dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (!wasClick) return;
    const rect = canvas.getBoundingClientRect();
    const hit = pickPolicyScene(scene, event.clientX - rect.left, event.clientY - rect.top);
    selection.key = hit?.item?.key || null;
    updatePolicyInfoPanel(infoSlot, hit?.item || null);
  }

  function resetView() {
    target.yaw = -0.42;
    target.pitch = -0.52;
  }

  function frame() {
    if (scene.disposed) return;
    camera.yaw += (target.yaw - camera.yaw) * 0.15;
    camera.pitch += (target.pitch - camera.pitch) * 0.15;
    drawPolicy3DScene(ctx, scene, camera, model, selection);
    scene.raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("dblclick", resetView);
  scene.raf = requestAnimationFrame(frame);

  return {
    dispose() {
      scene.disposed = true;
      cancelAnimationFrame(scene.raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("dblclick", resetView);
    },
  };
}

function projectPolicy3D(point, camera, scene) {
  const visualPoint = {
    ...point,
    y: point.y * POLICY_Y_VISUAL_SCALE,
  };
  const rotated = rotate3D(visualPoint, camera);
  const scale = Math.min(scene.w, scene.h) / 540;
  const depth = camera.fov + rotated.z;
  const perspective = camera.fov / Math.max(300, depth);
  const centerX = Math.max(scene.w * 0.22, scene.w < 520 ? 86 : 136);
  return {
    x: centerX + rotated.x * scale * perspective,
    y: scene.h * 0.68 - rotated.y * scale * perspective,
    z: rotated.z,
    perspective,
  };
}

function drawPolicy3DScene(ctx, scene, camera, model, selection) {
  ctx.clearRect(0, 0, scene.w, scene.h);
  drawRegionSceneBackground(ctx, scene);
  drawPolicyGrid(ctx, scene, camera, model);
  drawPolicyAxes(ctx, scene, camera, model);
  drawPolicyNodes(ctx, scene, camera, model, selection);
  drawPolicyHud(ctx, scene);
}

function drawPolicyGrid(ctx, scene, camera, model) {
  const step = 64;
  const end = model.axisLength;
  for (let i = 0; i <= end; i += step) {
    drawPolicyLine(ctx, scene, camera, { x: i, y: 0, z: 0 }, { x: i, y: 0, z: end }, "rgba(74, 213, 255, 0.08)", 1);
    drawPolicyLine(ctx, scene, camera, { x: 0, y: 0, z: i }, { x: end, y: 0, z: i }, "rgba(74, 213, 255, 0.08)", 1);
    drawPolicyLine(ctx, scene, camera, { x: i, y: 0, z: 0 }, { x: i, y: end, z: 0 }, "rgba(247, 188, 71, 0.055)", 1);
    drawPolicyLine(ctx, scene, camera, { x: 0, y: i, z: 0 }, { x: end, y: i, z: 0 }, "rgba(247, 188, 71, 0.055)", 1);
    drawPolicyLine(ctx, scene, camera, { x: 0, y: i, z: 0 }, { x: 0, y: i, z: end }, "rgba(84, 230, 163, 0.055)", 1);
    drawPolicyLine(ctx, scene, camera, { x: 0, y: 0, z: i }, { x: 0, y: end, z: i }, "rgba(84, 230, 163, 0.055)", 1);
  }
}

function drawPolicyAxes(ctx, scene, camera, model) {
  const end = model.axisLength + 36;
  const axes = [
    { key: "tool", start: { x: 0, y: 0, z: 0 }, end: { x: end, y: 0, z: 0 } },
    { key: "cooperation", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: end, z: 0 } },
    { key: "industry", start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: end } },
  ];

  axes.forEach((axis) => {
    const meta = POLICY_AXIS_META[axis.key];
    drawPolicyLine(ctx, scene, camera, axis.start, axis.end, meta.color, 2.4, meta.color);
    drawPolicyArrowhead(ctx, scene, camera, axis.start, axis.end, meta.color);
    drawPolicyAxisTicks(ctx, scene, camera, model, axis);
    drawPolicyAxisText(ctx, scene, camera, `${meta.axis} ${meta.title}`, `最高 ${fmt(model.axisMax[axis.key], 0)}个`, axis.end, meta.color);
  });

  const origin = projectPolicy3D({ x: 0, y: 0, z: 0 }, camera, scene);
  ctx.save();
  ctx.fillStyle = "rgba(234, 247, 255, 0.92)";
  ctx.shadowColor = "rgba(74, 213, 255, 0.66)";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPolicyAxisTicks(ctx, scene, camera, model, axis) {
  const meta = POLICY_AXIS_META[axis.key];
  const tickCount = 4;
  for (let i = 1; i <= tickCount; i += 1) {
    const ratio = i / tickCount;
    const point = { x: 0, y: 0, z: 0 };
    point[meta.coord] = model.axisLength * ratio;
    const tickA = { ...point };
    const tickB = { ...point };
    if (meta.coord === "x") {
      tickA.z -= 7;
      tickB.z += 7;
    } else if (meta.coord === "y") {
      tickA.x -= 7;
      tickB.x += 7;
    } else {
      tickA.x -= 7;
      tickB.x += 7;
    }
    drawPolicyLine(ctx, scene, camera, tickA, tickB, hexToRgba(meta.color, 0.52), 1);
    const labelPoint = { ...point };
    if (meta.coord === "y") labelPoint.x += 22;
    else labelPoint.y -= 18;
    drawPolicyTickText(ctx, scene, camera, fmt(model.axisMax[axis.key] * ratio, 0), labelPoint, meta.color);
  }
}

function drawPolicyTickText(ctx, scene, camera, text, point, color) {
  const p = projectPolicy3D(point, camera, scene);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 10px DIN Alternate, Avenir Next, PingFang SC, Microsoft YaHei, Arial";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(5, 18, 30, 0.9)";
  ctx.fillStyle = hexToRgba(color, 0.86);
  ctx.strokeText(text, p.x, p.y);
  ctx.fillText(text, p.x, p.y);
  ctx.restore();
}

function drawPolicyLine(ctx, scene, camera, a, b, color, width = 1, glow = "") {
  const p0 = projectPolicy3D(a, camera, scene);
  const p1 = projectPolicy3D(b, camera, scene);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.shadowColor = glow || "rgba(0,0,0,0)";
  ctx.shadowBlur = glow ? 10 : 0;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
  ctx.restore();
}

function drawPolicyArrowhead(ctx, scene, camera, a, b, color) {
  const p0 = projectPolicy3D(a, camera, scene);
  const p1 = projectPolicy3D(b, camera, scene);
  const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const size = 10;
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p1.x - Math.cos(angle - 0.46) * size, p1.y - Math.sin(angle - 0.46) * size);
  ctx.lineTo(p1.x - Math.cos(angle + 0.46) * size, p1.y - Math.sin(angle + 0.46) * size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPolicyAxisText(ctx, scene, camera, title, ref, point, color) {
  const p = projectPolicy3D(point, camera, scene);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 13px PingFang SC, Microsoft YaHei, Arial";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(5, 18, 30, 0.92)";
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.strokeText(title, p.x, p.y - 9);
  ctx.fillText(title, p.x, p.y - 9);
  ctx.font = "600 11px PingFang SC, Microsoft YaHei, Arial";
  ctx.fillStyle = "rgba(207, 229, 242, 0.86)";
  ctx.shadowBlur = 0;
  ctx.strokeText(ref, p.x, p.y + 10);
  ctx.fillText(ref, p.x, p.y + 10);
  ctx.restore();
}

function drawPolicyNodes(ctx, scene, camera, model, selection) {
  const hitAreas = [];
  const projected = model.items.map((item) => {
    const p = projectPolicy3D(item.coord, camera, scene);
    return {
      item,
      point: p,
      depth: p.z,
      selected: selection.key === item.key,
    };
  });

  projected
    .slice()
    .sort((a, b) => b.depth - a.depth)
    .forEach(({ item, selected }) => {
      drawPolicyNodeGuide(ctx, scene, camera, item, !selection.key || selected);
    });

  projected
    .slice()
    .sort((a, b) => (a.selected === b.selected ? b.depth - a.depth : a.selected ? 1 : -1))
    .forEach(({ item, point, selected }) => {
      const radius = item.radius * point.perspective * (selected ? 1.22 : 1);
      const active = !selection.key || selected;
      drawPolicyNode(ctx, point, radius, item, active, selected);
      drawPolicyNodeText(ctx, point, radius, item, selected, scene);
      hitAreas.push({
        type: "policy-node",
        item,
        x: point.x,
        y: point.y,
        r: Math.max(12, radius + 8),
        depth: point.z,
      });
    });
  scene.hitAreas = hitAreas;
}

function drawPolicyNodeGuide(ctx, scene, camera, item, active) {
  const foot = { x: item.coord.x, y: 0, z: item.coord.z };
  const xFoot = { x: item.coord.x, y: 0, z: 0 };
  const zFoot = { x: 0, y: 0, z: item.coord.z };
  const color = active ? hexToRgba(item.color, 0.36) : "rgba(157, 193, 214, 0.09)";
  drawPolicyLine(ctx, scene, camera, item.coord, foot, color, active ? 1.25 : 0.8);
  drawPolicyLine(ctx, scene, camera, foot, xFoot, color, 0.9);
  drawPolicyLine(ctx, scene, camera, foot, zFoot, color, 0.9);
}

function drawPolicyNode(ctx, point, radius, item, active, selected) {
  const gradient = ctx.createRadialGradient(point.x - radius * 0.38, point.y - radius * 0.42, radius * 0.08, point.x, point.y, radius);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.96)");
  gradient.addColorStop(0.28, item.meta.color);
  gradient.addColorStop(1, selected ? "rgba(9, 58, 78, 0.94)" : item.meta.side);
  ctx.save();
  ctx.globalAlpha = active ? 1 : 0.35;
  ctx.shadowColor = selected ? item.meta.color : "rgba(74, 213, 255, 0.26)";
  ctx.shadowBlur = selected ? 26 : 10;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = selected ? 2.4 : 1.1;
  ctx.strokeStyle = selected ? "#eafaff" : "rgba(234, 247, 255, 0.42)";
  ctx.stroke();
  ctx.restore();
}

function drawPolicyNodeText(ctx, point, radius, item, selected, scene) {
  const lines = item.labelLines;
  const showValue = selected || item.industryCount >= 90 || scene.w > 780;
  const lineHeight = 13;
  const y = point.y - radius - (showValue ? 24 : 15);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = selected
    ? "800 13px PingFang SC, Microsoft YaHei, Arial"
    : "700 12px PingFang SC, Microsoft YaHei, Arial";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(5, 18, 30, 0.94)";
  ctx.fillStyle = selected ? "#eafaff" : "rgba(219, 242, 255, 0.84)";
  lines.slice(0, 2).forEach((line, index) => {
    const yy = y + index * lineHeight;
    ctx.strokeText(line, point.x, yy);
    ctx.fillText(line, point.x, yy);
  });
  if (showValue) {
    ctx.font = selected
      ? "800 12px DIN Alternate, Avenir Next, PingFang SC, Microsoft YaHei, Arial"
      : "700 11px DIN Alternate, Avenir Next, PingFang SC, Microsoft YaHei, Arial";
    ctx.fillStyle = item.meta.color;
    const yy = y + lines.slice(0, 2).length * lineHeight + 2;
    ctx.strokeText(`Z ${item.industryCount}`, point.x, yy);
    ctx.fillText(`Z ${item.industryCount}`, point.x, yy);
  }
  ctx.restore();
}

function drawPolicyHud(ctx, scene) {
  const pad = scene.w < 720 ? 18 : 28;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.shadowBlur = 0;
  ctx.font = "700 22px PingFang SC, Microsoft YaHei, Arial";
  ctx.fillStyle = "#eaf7ff";
  ctx.fillText("政策产业联动三维坐标", pad, pad);

  const legendY = scene.h - 74;
  POLICY_AXIS_ORDER.forEach((axisKey, index) => {
    const meta = POLICY_AXIS_META[axisKey];
    const x = pad + index * 128;
    ctx.fillStyle = meta.color;
    ctx.shadowColor = meta.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x + 6, legendY + 7, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = "13px PingFang SC, Microsoft YaHei, Arial";
    ctx.fillStyle = "rgba(207, 229, 242, 0.88)";
    ctx.fillText(meta.fullTitle, x + 18, legendY);
  });
}

function pickPolicyScene(scene, x, y) {
  return scene.hitAreas
    .filter((area) => area.type === "policy-node")
    .filter((area) => Math.hypot(x - area.x, y - area.y) <= area.r)
    .sort((a, b) => a.depth - b.depth)[0] || null;
}

function policyOverviewMetrics() {
  const rows = getPolicyIndustryRows();
  const topToolIndustry = rows.slice().sort((a, b) => b.toolTotal - a.toolTotal)[0];
  const topCooperationIndustry = rows.slice().sort((a, b) => b.cooperationTotal - a.cooperationTotal)[0];
  const topIndustry = rows.slice().sort((a, b) => b.industryCount - a.industryCount)[0];
  return [
    ["政策文本", "101份"],
    ["产业散点", `${rows.length}个`],
    ["X最高产业", topToolIndustry ? `${topToolIndustry.chain} ${topToolIndustry.toolTotal}` : "—"],
    ["Y最高产业", topCooperationIndustry ? `${topCooperationIndustry.chain} ${topCooperationIndustry.cooperationTotal}` : "—"],
    ["Z最高产业", topIndustry ? `${topIndustry.chain} ${topIndustry.industryCount}` : "—"],
    ["Z维度合计", topIndustry?.dimensionRef || "312（12.16%）"],
  ];
}

function policySelectedMetrics(item) {
  return [
    ["X 工具要素", `${fmt(item.toolTotal, 0)}个`],
    ["Y 合作要素", `${fmt(item.cooperationTotal, 0)}个`],
    ["Z 产业要素", `${fmt(item.industryCount, 0)}个`],
    ["产业维度占比", `${fmt(item.industryPercent, 2)}%`],
    ["主导工具", `${item.dominantTool.label} ${fmt(item.dominantTool.count, 0)}`],
    ["主导阶段", `${item.dominantCooperation.label} ${fmt(item.dominantCooperation.count, 0)}`],
  ];
}

function policyEntryBars(entries, total) {
  const max = Math.max(...entries.map((entry) => entry.count), 1);
  return `
    <div class="policy-entry-bars">
      ${entries.map((entry) => {
        const width = Math.max(4, entry.count / max * 100);
        const share = total ? entry.count / total * 100 : 0;
        return `
          <div class="policy-entry-row">
            <div class="policy-entry-label">
              <span>${esc(entry.label)}</span>
              <em>${fmt(entry.count, 0)} / ${fmt(share, 1)}%</em>
            </div>
            <div class="policy-entry-track"><i style="width:${width}%"></i></div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function policyIndustryInsight(item) {
  const rankText = item.rank > 0 ? `第${item.rank}` : "靠前";
  return `${item.chain}在产业划分维度为${fmt(item.industryCount, 0)}个参考点，占该维度${fmt(item.industryPercent, 2)}%，位列${rankText}。政策工具侧以${item.dominantTool.label}为主，合作阶段侧以${item.dominantCooperation.label}为主，反映该产业当前政策联动更集中于既有工具供给和阶段性协同。`;
}

function renderPolicyConclusionBox() {
  return `
    <section class="policy-conclusion-box dv-border">
      <div class="panel-title"><span>主要结论</span><small></small></div>
      <div class="policy-conclusion-grid">
        ${getPolicyConclusions().map((item) => `
          <article class="policy-conclusion-item">
            <h3>${esc(item.title)}</h3>
            <p>${esc(item.text)}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function updatePolicyInfoPanel(panelEl, selectedItem) {
  if (!panelEl) return;
  const metrics = selectedItem ? policySelectedMetrics(selectedItem) : policyOverviewMetrics();
  const title = selectedItem ? selectedItem.chain : "六大产业概览";
  const subtitle = selectedItem ? "政策工具 × 合作阶段 × 产业划分" : "报告政策聚合表";
  panelEl.innerHTML = `
    <div class="region-info-panel policy-info-panel">
      <div class="region-info-head">
        <span>${esc(title)}</span>
        <small>${esc(subtitle)}</small>
      </div>
      <div class="region-info-metrics policy-info-metrics">
        ${metrics.map(([label, value]) => `
          <div class="region-info-metric">
            <em>${esc(label)}</em>
            <strong>${esc(value)}</strong>
          </div>
        `).join("")}
      </div>
      ${selectedItem ? `
        <div class="policy-chain-note">${esc(policyIndustryInsight(selectedItem))}</div>
        <section class="policy-detail-block">
          <h3>政策工具结构</h3>
          ${policyEntryBars(selectedItem.toolEntries, selectedItem.toolTotal)}
        </section>
        <section class="policy-detail-block">
          <h3>合作阶段结构</h3>
          ${policyEntryBars(selectedItem.cooperationEntries, selectedItem.cooperationTotal)}
        </section>
        <section class="policy-detail-block">
          <h3>核心产品或技术</h3>
          <p>${esc(selectedItem.coreProduct)}</p>
        </section>
      ` : ""}
    </div>
  `;
}

function renderEvolution() {
  disposeRegionScene();
  view.innerHTML = `
    <div class="region-3d-stage regional-link-stage dv-border">
      <canvas class="region-3d-canvas" id="regionalLinkCanvas" aria-label="京津冀区域产业联动地图"></canvas>
      <aside class="region-3d-info-slot regional-link-info-slot dv-border" id="regionalLinkInfoSlot"></aside>
    </div>
  `;
  activeRegionScene = initRegionalLinkScene($("#regionalLinkCanvas"));
}

function renderLinkage() {
  disposeRegionScene();
  view.innerHTML = `
    <div class="policy-linkage-page">
      <div class="policy-3d-stage dv-border">
        <div class="policy-3d-canvas-wrap">
          <canvas class="region-3d-canvas policy-3d-canvas" id="policy3dCanvas" aria-label="政策产业联动三维坐标图"></canvas>
        </div>
        <aside class="policy-3d-info-slot" id="policyLinkInfoSlot"></aside>
      </div>
      ${renderPolicyConclusionBox()}
    </div>
  `;
  activeRegionScene = initPolicy3DScene($("#policy3dCanvas"));
}

function renderTopic() {
  const chain = state.chain;
  const cap = getChainCapital(chain);
  const stageDescriptions = DATA.stages.map((stage) => `<div class="insight"><h3>${stage}</h3><p>${esc(DATA.chainDescriptions[chain][stage])}</p></div>`).join("");
  const capitalGroups = DATA.regions.map((region) => ({ label: region, values: cap.values[region] }));
  const block = DATA.chainEffects[chain][state.stage];
  const matrix = getMatrix(block);
  const unit = state.effectMode === "dynamic" ? "%" : "";
  const outRows = block.output.map((row) => [row.name, ...DATA.regions.map((region) => fmt(row.values[region], 0)), fmt(row.values.总, 0)]);
  const mapping142 = DATA.chainMappings.io142.filter((row) => row[0].startsWith(chain)).map((row) => [row[0].replace(`${chain}产业链`, ""), row[1]]);
  const mapping42 = DATA.chainMappings.io42.filter((row) => row[0].startsWith(chain)).map((row) => [row[0].replace(`${chain}产业链`, "").replace(chain, ""), row[1]]);
  view.innerHTML = `
    <div class="dashboard-grid">
      ${panel(`${chain}资本区域结构`, `${cap.source}，单位：亿元`, stackedBars(capitalGroups, DATA.stages, { labelW: 80 }), 7)}
      ${panel("核心产品或技术", "表5-5", `<div class="text-block">${esc(DATA.coreProducts[chain])}</div>`, 5)}
      ${panel(`${chain}${state.stage}关联效应`, DATA.chainEffectsSource, matrixView(matrix, unit), 7)}
      ${panel(`${chain}${state.stage}产出`, "附录表，单位：亿元", table(["年份", "北京", "天津", "河北", "总"], outRows), 5)}
      ${panel("上中下游对应领域", "表2系列", `<div class="insight-list">${stageDescriptions}</div>`, 6)}
      ${panel("投入产出口径映射", "表1-7与表3-2", `${table(["142部门口径", "对应产业"], mapping142)}<div style="height:12px"></div>${table(["42部门口径", "对应产业"], mapping42)}`, 6)}
    </div>
  `;
}

function renderMethods() {
  const capRows = DATA.chainCapital.map((item) => [item.chain, item.source, fmt(item.values["三次产业结构合计"]["地区合计"]), fmt(item.values["三次产业结构合计"]["上游"]), fmt(item.values["三次产业结构合计"]["中游"]), fmt(item.values["三次产业结构合计"]["下游"])]);
  const meta = `
    <div class="method-list">
      <div><strong>研究报告：</strong>${esc(DATA.meta.reportTitle)}（${esc(DATA.meta.reportDate)}）</div>
      <div><strong>数据范围：</strong>${esc(DATA.meta.sourceScope)}</div>
      <div><strong>抽取口径：</strong>${esc(DATA.meta.extractionPolicy)}</div>
      <div><strong>开发约束：</strong>报告未提供101条政策逐条明细，因此本项目只使用报告中的政策聚合表，不虚构政策明细记录。</div>
    </div>
  `;
  const mappingRows = [
    ["表1-4", "总体静态/动态产业关联、总产出", "首页、区域总产出画像、区域产业联动分析"],
    ["表1-5/1-6", "2017与2023年三地主导产业", "区域总产出画像"],
    ["表2-2/2-4/2-6/2-8/2-10/2-12", "六链企业实缴资本区域分布", "首页、区域总产出画像、产业专题"],
    ["表3-3", "六链聚合上中下游关联效应", "区域产业联动分析"],
    ["表4-2至表4-5", "政策文本量化结构", "政策产业联动"],
    ["表5-5至表5-7", "核心产品、企业诉求与协同问题", "政策产业联动、产业专题"],
    ["附录表1-6", "六条产业链分链关联效应", "产业专题"],
  ];
  view.innerHTML = `
    <div class="dashboard-grid">
      ${panel("口径说明", "", meta, 12)}
      ${panel("页面数据映射", "不对原表数值重算或改写", table(["报告表号", "结构化内容", "页面使用"], mappingRows), 7)}
      ${panel("六链资本数据清单", "表2系列，单位：亿元", table(["产业链", "来源", "地区合计", "上游", "中游", "下游"], capRows), 5)}
      ${panel("工程说明", "本地静态Web项目", `<div class="method-list"><div>前端使用原生HTML/CSS/JS，采用DataV风格视觉语言：深色底、发光边框、矩阵热力、指标卡、联动筛选。</div><div>本地预览使用Python标准库HTTP服务，无需Node与联网依赖。</div><div>数据文件位于 <code>data/report_data.json</code>，构建脚本位于 <code>scripts/build_data.py</code>。</div></div>`, 12)}
    </div>
  `;
}

function render() {
  if (!DATA) return;
  updateControlsVisibility();
  if (state.page !== "region") disposeRegionScene();
  if (state.page === "home") renderHome();
  if (state.page === "region") renderRegion();
  if (state.page === "evolution") renderEvolution();
  if (state.page === "linkage") renderLinkage();
  if (state.page === "topic") renderTopic();
  if (state.page === "methods") renderMethods();
  view.focus({ preventScroll: true });
}

function updateControlsVisibility() {
  const visible = CONTROL_VISIBILITY[state.page] || [];
  const rack = $(".control-rack");
  rack.classList.toggle("is-hidden", visible.length === 0);
  document.querySelectorAll(".control-rack label[data-control]").forEach((label) => {
    label.classList.toggle("is-hidden", !visible.includes(label.dataset.control));
  });
}

function populateControls() {
  const regionSelect = $("#regionSelect");
  const chainSelect = $("#chainSelect");
  const stageSelect = $("#stageSelect");
  regionSelect.innerHTML = DATA.regions.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
  chainSelect.innerHTML = DATA.chainCapital.map((c) => `<option value="${esc(c.chain)}">${esc(c.chain)}</option>`).join("");
  stageSelect.innerHTML = DATA.stages.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  regionSelect.value = state.region;
  chainSelect.value = state.chain;
  stageSelect.value = state.stage;
  $("#effectMode").value = state.effectMode;
}

function bindEvents() {
  document.querySelectorAll(".nav-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-tabs button").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      state.page = button.dataset.page;
      render();
    });
  });
  $("#regionSelect").addEventListener("change", (event) => {
    state.region = event.target.value;
    render();
  });
  $("#chainSelect").addEventListener("change", (event) => {
    state.chain = event.target.value;
    render();
  });
  $("#stageSelect").addEventListener("change", (event) => {
    state.stage = event.target.value;
    render();
  });
  $("#effectMode").addEventListener("change", (event) => {
    state.effectMode = event.target.value;
    render();
  });
}

async function init() {
  try {
    const [response, geoResponse] = await Promise.all([
      fetch("data/report_data.json", { cache: "no-store" }),
      fetch("data/geo/jingjinji_boundaries.json", { cache: "no-store" }).catch(() => null),
    ]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    DATA = await response.json();
    if (geoResponse?.ok) {
      GEO_DATA = await geoResponse.json();
    }
    $("#dataStatus").textContent = "数据已载入";
    populateControls();
    bindEvents();
    render();
  } catch (error) {
    $("#dataStatus").textContent = "数据载入失败";
    view.innerHTML = `<div class="empty">无法读取 data/report_data.json：${esc(error.message)}。请使用本地HTTP服务打开项目。</div>`;
  }
}

function initLogin() {
  const loginForm = $("#loginForm");
  const loginScreen = $("#loginScreen");
  const appShell = $("#appShell");
  const username = $("#username");
  const password = $("#password");
  const error = $("#loginError");

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const isAuthorized = username.value.trim() === ACCESS_ACCOUNT && password.value === ACCESS_PASSWORD;
    if (!isAuthorized) {
      error.textContent = "账号或密码错误，请重新输入。";
      password.value = "";
      password.focus();
      return;
    }

    error.textContent = "";
    loginScreen.classList.add("is-leaving");
    appShell.hidden = false;
    appShell.removeAttribute("aria-hidden");
    init();
    window.setTimeout(() => loginScreen.remove(), 280);
  });
}

initLogin();

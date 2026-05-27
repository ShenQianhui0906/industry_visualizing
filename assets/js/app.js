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
  region: ["region"],
  evolution: ["stage", "effect"],
  linkage: ["chain"],
  topic: ["chain", "stage", "effect"],
  methods: [],
};

let DATA = null;

const $ = (selector) => document.querySelector(selector);
const view = $("#view");

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
  const note = '<div class="source">扇形分母使用北京、天津、河北三地加总；半径按三地合计产出的平方根缩放，面积同时表达地区占比与规模变化。</div>';
  const legend = `<div class="legend">${DATA.regions.map((region) => `<span><i style="background:${COLORS[region]}"></i>${region}</span>`).join("")}</div>`;
  return `<div class="chart"><svg viewBox="0 0 760 340" role="img">${pies}</svg></div>${legend}${note}`;
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
    <div class="insight"><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p><div class="source">${esc(item.source)}</div></div>
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
  const region = state.region;
  const out2017 = getOverallOutput(2017)[region];
  const out2022 = getOverallOutput(2022)[region];
  const static2017 = DATA.overall.effects.static["2017"].find((r) => r.name === region).values[region];
  const static2022 = DATA.overall.effects.static["2022"].find((r) => r.name === region).values[region];
  const dynamicSelf = DATA.overall.effects.dynamic.find((r) => r.name === region).values[region];
  const capitalItems = DATA.chainCapital.map((item) => ({
    label: item.chain,
    value: item.values[region]["地区合计"],
    color: COLORS[region],
  }));
  const industries2017 = DATA.leadingIndustries["2017"][region].map((v) => `<span class="pill">${esc(v)}</span>`).join("");
  const industries2023 = DATA.leadingIndustries["2023"][region].map((v) => `<span class="pill">${esc(v)}</span>`).join("");
  const rows = DATA.chainCapital.map((item) => [item.chain, ...DATA.stages.map((stage) => fmt(item.values[region][stage])), fmt(item.values[region]["地区合计"])]);
  view.innerHTML = `
    <div class="dashboard-grid">
      ${kpi(`${region}总产出`, `${fmt(out2022, 2)}亿元`, `2017年为${fmt(out2017, 2)}亿元`, "accent-gold")}
      ${kpi("静态乘数效应", fmt(static2022, 3), `2017年为${fmt(static2017, 3)}`, "accent-green")}
      ${kpi("自身动态推动", `${fmt(dynamicSelf, 2)}%`, "2017-2022年动态乘数效应", "")}
      ${kpi("六链资本", `${fmt(sum(capitalItems.map((d) => d.value)), 2)}亿元`, `${region}在六链中的实缴资本合计`, "accent-pink")}
      ${panel(`${region}六链资本分布`, "表2系列，单位：亿元", barChart(capitalItems, { height: 300 }), 7)}
      ${panel(`${region}资本明细`, "表2系列", table(["产业链", "上游", "中游", "下游", "地区合计"], rows), 5)}
      ${panel("2017年主导产业", "表1-5", `<div class="pill-list">${industries2017}</div>`, 6)}
      ${panel("2023年主导产业", "表1-6", `<div class="pill-list">${industries2023}</div>`, 6)}
    </div>
  `;
}

function renderEvolution() {
  const block = DATA.aggregateChainEffects[state.stage];
  const matrix = getMatrix(block);
  const unit = state.effectMode === "dynamic" ? "%" : "";
  const modeName = state.effectMode === "dynamic" ? "动态乘数与溢出" : (state.effectMode === "static2017" ? "2017静态乘数与溢出" : "2022静态乘数与溢出");
  const outRows = block.output.map((row) => [
    row.name,
    ...DATA.regions.map((region) => fmt(row.values[region], 0)),
    fmt(sum(DATA.regions.map((region) => row.values[region])), 0),
    fmt(row.values.总, 0),
  ]);
  const acceptItems = matrix
    .filter((row) => DATA.regions.includes(row.name))
    .map((row) => ({ label: row.name, value: Number(row.values.接受), color: COLORS[row.name] }));
  view.innerHTML = `
    <div class="dashboard-grid">
      ${panel(`六链${state.stage}：${modeName}`, DATA.aggregateChainEffects.source, matrixView(matrix, unit), 7)}
      ${panel("接受外部带动", "矩阵接受列", barChart(acceptItems, { height: 300 }), 5)}
      ${panel(`六链${state.stage}产出占比与规模对比`, "表3-3，单位：亿元", pieChartPair(block.output), 7)}
      ${panel("产出原表", "图形用三地加总；原表总列保留", table(["年份", "北京", "天津", "河北", "三地加总", "原表总"], outRows), 5)}
      ${panel("阶段解释", "表3-1", `<div class="text-block">${esc(STAGE_DEFINITION[state.stage])}</div>`, 12)}
    </div>
  `;
}

function renderLinkage() {
  const policyToolItems = DATA.policy.dimensionElements
    .filter((item) => item.dimension === "X政策工具维度")
    .map((item, i) => ({ label: item.element, value: item.count, color: [COLORS.北京, COLORS.下游, COLORS.中游, COLORS.河北][i] || COLORS.北京 }));
  const industryPolicyItems = DATA.policy.dimensionElements
    .filter((item) => item.dimension === "Z产业划分维度")
    .map((item) => ({ label: item.element, value: item.count, color: item.element === state.chain ? COLORS.下游 : COLORS.北京 }));
  const toolByCoop = DATA.policy.toolByCooperation.map((row) => ({
    label: row.stage,
    values: {
      财税补贴类: countFromString(row["财税补贴类"]),
      供给平台类: countFromString(row["供给平台类"]),
      规则标准类: countFromString(row["规则标准类"]),
      信息协调类: countFromString(row["信息协调类"]),
    },
  }));
  const issueItems = DATA.survey.innovationBarriers
    .map((row) => ({ label: row.issue, value: row[state.chain], color: COLORS.中游 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const policyRows = DATA.policy.toolByChain.map((row) => [row.chain, row["财税补贴类"], row["供给平台类"], row["规则标准类"], row["信息协调类"]]);
  const surveyRows = DATA.survey.coordinationIssues.map((row) => [row.issue, row[state.chain]]);
  view.innerHTML = `
    <div class="dashboard-grid">
      ${panel("政策工具结构", "表4-2", barChart(policyToolItems, { height: 300 }), 6)}
      ${panel("产业政策参考点", "表4-2", barChart(industryPolicyItems, { height: 300 }), 6)}
      ${panel("合作阶段 × 政策工具", "表4-3", stackedBars(toolByCoop, ["财税补贴类", "供给平台类", "规则标准类", "信息协调类"], { labelW: 90 }), 7)}
      ${panel(`${state.chain}企业创新合作障碍`, "表5-6", barChart(issueItems, { height: 320 }), 5)}
      ${panel("产业链政策工具明细", "表4-4", table(["产业链", "财税补贴类", "供给平台类", "规则标准类", "信息协调类"], policyRows), 7)}
      ${panel(`${state.chain}区域协同问题`, "表5-7", table(["问题", "企业数"], surveyRows), 5)}
    </div>
  `;
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
    ["表1-4", "总体静态/动态产业关联、总产出", "首页、区域画像、时空演化"],
    ["表1-5/1-6", "2017与2023年三地主导产业", "区域画像"],
    ["表2-2/2-4/2-6/2-8/2-10/2-12", "六链企业实缴资本区域分布", "首页、区域画像、产业专题"],
    ["表3-3", "六链聚合上中下游关联效应", "时空演化"],
    ["表4-2至表4-5", "政策文本量化结构", "政策产业联动"],
    ["表5-5至表5-7", "核心产品、企业诉求与协同问题", "政策产业联动、产业专题"],
    ["附录表1-6", "六条产业链分链关联效应", "产业专题"],
  ];
  view.innerHTML = `
    <div class="dashboard-grid">
      ${panel("数据来源与口径", "", meta, 12)}
      ${panel("页面数据映射", "不对原表数值重算或改写", table(["报告表号", "结构化内容", "页面使用"], mappingRows), 7)}
      ${panel("六链资本数据清单", "表2系列，单位：亿元", table(["产业链", "来源", "地区合计", "上游", "中游", "下游"], capRows), 5)}
      ${panel("工程说明", "本地静态Web项目", `<div class="method-list"><div>前端使用原生HTML/CSS/JS，采用DataV风格视觉语言：深色底、发光边框、矩阵热力、指标卡、联动筛选。</div><div>本地预览使用Python标准库HTTP服务，无需Node与联网依赖。</div><div>数据文件位于 <code>data/report_data.json</code>，构建脚本位于 <code>scripts/build_data.py</code>。</div></div>`, 12)}
    </div>
  `;
}

function render() {
  if (!DATA) return;
  updateControlsVisibility();
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
    const response = await fetch("data/report_data.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    DATA = await response.json();
    $("#dataStatus").textContent = "数据已载入";
    populateControls();
    bindEvents();
    render();
  } catch (error) {
    $("#dataStatus").textContent = "数据载入失败";
    view.innerHTML = `<div class="empty">无法读取 data/report_data.json：${esc(error.message)}。请使用本地HTTP服务打开项目。</div>`;
  }
}

init();

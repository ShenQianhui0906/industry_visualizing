# 开发说明

## 技术取舍

开发文档建议技术栈为 `Streamlit + Plotly + pandas + GeoPandas`。当前本地 Python 环境具备 `pandas` 与 `python-docx`，但未安装 `streamlit` 与 `plotly`，且网络受限。为保证成果能直接运行，本项目采用：

```text
HTML + CSS + 原生 JavaScript + JSON 数据 + Python 标准库 HTTP 服务
```

后续如果需要迁移到 Streamlit，可复用 `data/report_data.json`，将 `assets/js/app.js` 中的视图逻辑改写为 Plotly 图表函数即可。

## DataV 风格实现

没有直接引入开源版 DataV 包，而是复刻其适合研究展示的视觉语言：

- 深色大屏底图与细网格背景。
- 发光边框 `dv-border` 与角标装饰。
- 指标卡、热力矩阵、态势网络、堆叠条形图。
- 顶部导航 + 全局筛选器形成页面联动。
- 青色、金色、绿色、粉色多强调色，避免单一蓝色调。

## 主要文件职责

| 文件 | 职责 |
|---|---|
| `index.html` | 页面骨架、导航、筛选器、视图挂载点 |
| `assets/css/style.css` | DataV 风格视觉系统、响应式布局、图表容器 |
| `assets/js/app.js` | 数据读取、状态管理、页面渲染、SVG图表 |
| `scripts/build_data.py` | 从报告表格口径整理结构化数据并生成 JSON |
| `scripts/validate_data.py` | 校验关键数值、合计关系与表格常量 |
| `scripts/preview.py` | 本地 HTTP 预览服务 |
| `data/report_data.json` | 前端唯一读取的数据文件 |

## 页面状态

全局状态位于 `assets/js/app.js`：

```js
const state = {
  page: "home",
  region: "北京",
  chain: "氢能",
  stage: "上游",
  effectMode: "static2022",
};
```

四个筛选器会影响不同页面：

- `region`：当前不显示筛选器；区域总产出画像页固定展示京津冀三地真实边界立体地图。
- `chain`：政策产业联动页、产业专题页。
- `stage`：区域产业联动分析页、产业专题页。
- `effectMode`：区域产业联动分析页、产业专题页。

## 数据更新流程

1. 根据研究报告更新 `scripts/build_data.py` 中的结构化数据。
2. 运行 `python3 scripts/build_data.py` 生成 `data/report_data.json`。
3. 运行 `python3 scripts/validate_data.py`。
4. 启动 `python3 scripts/preview.py`，在浏览器检查页面。

## 扩展建议

- 如果获得逐条政策明细，可新增 `policy_detail` 数据集，补充政策时间轴、政策主题检索、政策原文回看。
- 如果获得市区级企业点位表，可在当前真实省级 GeoJSON 地图上叠加企业点位、分级设色或流向线。
- 如果部署环境允许安装依赖，可迁移到 Streamlit，并用 Plotly 实现更精细的 hover、zoom 与导出。
- 如果要继续保持纯静态路线，可增加 CSV 下载按钮和 URL hash 状态同步。

## 数据一致性注意事项

- 不要把报告原表中的“总”列自动重算后覆盖。
- 不要用正文描述中的四舍五入数覆盖表格精确数。
- 不要补造政策逐条明细、企业点位或未列出的年份序列。
- 如果新增派生指标，必须在页面或文档中标注“派生计算”。

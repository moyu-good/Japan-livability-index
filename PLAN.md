<!-- /autoplan restore point: will be written after Phase 0 -->

# Japan Livability Index — Project Plan

**Goal:** Build a rigorous, data-driven ranking of Japan's 47 prefectures by livability, using 20 indicators from government open data (e-Stat). Output: interactive D3.js choropleth map. Target: personal project, publicly shareable, analysis serious and explanations interesting.

---

## CEO Review — 2026-04-02 v2 (数据分析工具视角)

> 项目定位校正：这是一个严肃的数据分析工具，供个人使用并可公开分享。
> 分析要严谨，解释要有趣，让数据自己说话。不是内容营销项目。

### 一、技术现状（已完成）

MVP功能完整，无阻断性技术问题：
- 数据管道：20指标 × 47都道府县，来源e-Stat（日本政府统计）
- 可视化：D3.js交互地图 + 雷达图/柱状图 + 市区町村钻取
- 功能层：三语UI、权重预设、截图模式、URL分享、方法论弹窗
- 部署就绪：vercel.json已配置，GitHub repo已公开

**结论：工具本身已完工。剩余工作是让分析变得"严谨且有趣"。**

---

### 二、方法论审查（诚实评估）

#### 成立的设计决策

| 设计 | 理由 |
|------|------|
| Min-max 0-100归一化 | 简单、可审计、相对排名清晰 |
| 各维度内指标等权平均 | 不预设哪个指标更重要，透明 |
| 5维度等权（约）默认 | 中性起点，用户可自行调整 |
| 负向指标取反（犯罪率等） | 标注清楚，方向无歧义 |

#### 需要明确披露的价值判断

这些都是合理的选择，但它们是**选择**，不是客观事实：

1. **自動車保有台数 → 居住・利便性（负向）**
   - 假设：低车辆持有率 = 公共交通发达 = 好
   - 内嵌偏向：系统性偏向城市型生活方式
   - 后果：沖縄因为无法避免的岛屿地理被惩罚；东京因地铁密度获益
   - 必须在方法论说明中明确："本指数对都市型生活方式更友好"

2. **将来性 = 人口增减率（权重1/3）**
   - 假设：人口在增长的地方 = 更有发展潜力
   - 后果：东京 将来性=90（全国最高），秋田 将来性=16（最低）
   - 这反映真实的人口流动趋势，但"增长 = 好"在某些价值观中是可疑的
   - 必须说明：不是"将来これが一番暮らしやすいか"，而是"现在的人口动态"

3. **均等权重 in 医療・教育**
   - 病院数 = 医師数 = 保育所数 = 大学進学率 （各25%）
   - 保育所数和大学进学率对无孩成年人意义有限，但在默认模型里仍然有权重

---

### 三、数据揭示的真实有趣发现

这些是数据自然产生的，不需要包装：

**发现1：东京的矛盾**
経済=79 + 将来性=90（双第一），但 居住=24（末位）。
这是真实的：东京是日本经济引擎+人口磁铁，但居住成本全国最贵。
数据不需要解释——它客观存在。

**发现2：高知县医疗资源异常高**
医療・教育=80（全国第一），比东京（55）高出25分。
原因值得深究：高知人口少但医院/医生密度高——正是因为人少地广所以人均指标反而高。
*这是指标设计的内在局限之一：人均数字对稀疏人口区会产生倍增效应。*

**发现3：岛根县经济=66（全国前10）**
岛根是日本人口最少的县之一，却有异常高的经济分数。
可能原因：①公务员比例高，收入稳定 ②求人倍率高（人少竞争小）
→ 有效求人倍率在人口稀少地区是一个有偏向性的指标

**发现4：秋田的两面**
居住=69 + 環境=72，但 将来性=16（全国最低）。
"现在住起来不错，但这个地方正在快速消亡。"
数据描述了日本地方少子高龄化的现实。

**发现5：静岡 環境=40（全国最低）**
静冈是富士山的家乡，但环境分最低。
原因：①东名高速交通事故率全国最高 ②太平洋侧降水量极大
→ "美丽的地方"和"安全/干燥的环境"是两件不同的事

**发现6：沖縄的系统性劣势**
経済=21（最低）+ 居住=34（次低）+ 環境=41
沖縄在所有可量化的政府统计指标上都处于不利位置，
但没有一个指标能捕捉：海景、文化、慢生活、独特饮食。
→ **本指数能告诉你政府统计说什么，但无法告诉你住在那里的感受。**

---

### 四、工具本身缺少的解释层

目前方法论弹窗存在，但每个都道府县的详情面板缺乏：
**"为什么这个县的这个维度得分这么高/低"**

这是让工具"有趣"的核心——不是强加叙事，而是把数据背后的原因说清楚。

---

### 五、行动计划（正确优先级）

#### M1 — 方法论透明化（P0，影响可信度）

**M1a: 为每个指标补充方向说明和数据年份**
- 方法论弹窗已存在；确认每个指标的年份来自 `data/raw/estat/estat_metadata.json`
- 明确标注：哪些是"越高越好"，哪些是"越低越好（已反转）"
- 加一行免责说明："本指数偏向都市型生活方式（见注释）"

**M1b: 指标数文字核实**
- 检查 `web/index.html` 中所有 "N指標" 文字，确认与实际20个指标一致
- 目前TODOS中有 "20指標 vs 15指標" 待修正

#### M2 — 数据解释层（P1，让它变得有趣）

**M2a: 关键都道府县"数据注解"**
在 `app.js` 详情面板中，对 5-6 个有反直觉结论的都道府县加入一行说明：

| 都道府县 | 触发条件 | 注解文字 |
|---------|---------|---------|
| 沖縄県 | 自动 | "政府統計で測れる指標は最下位水準。ただし自然・文化・生活スタイルはこの指数には含まれません。" |
| 静岡県 | 自動 | "東名高速の交通事故件数（全国最多水準）と太平洋側の高降水量が環境スコアを押し下げています。" |
| 島根県 | 経済top10 | "有効求人倍率が高止まり（少ない求職者に対し求人が多い）のため経済スコアが高くなっています。" |
| 高知県 | 医療top | "人口が少ない分、人口10万対の医療機関・医師数が高密度になります。" |

**M2b: Hero banner → 数据发现型**（不是"谁第一"，而是有趣的统计事实）
替代当前固定显示第一名的hero文字：
例如："東京都：経済・将来性 全国1位、居住コスト 全国最下位" 这比"第一名是东京"更有信息量。

#### M3 — 小修复（P2）

- WCAG对比度: `--muted: #8b949e` → `#9ca3af`
- 移除 TODOS.md 和 PLAN.md 中所有小红书内容策划相关条目

---

### 六、明确不做的事

- 创作小红书内容（用户自己决定怎么发）
- Vercel部署（暂缓）
- 自动更新管道
- 移动原生App
- 为其他比较系统做竞品分析

---

### 七、发布前检查清单

- [ ] M1a: 方法论弹窗 — 年份、方向标注完整
- [ ] M1b: 指标数文字核实（index.html）
- [ ] M2a: 5-6个都道府县数据注解
- [ ] M2b: Hero banner 改为数据发现型
- [ ] 本地功能测试：4个preset + 截图 + URL分享 + 市区町村钻取
- [ ] TODOS.md清理（移除过期内容策划条目）

---

---

## Scope

### Phase 1 — Data Pipeline (Week 1)
- Register e-Stat API, obtain appId
- Run `scripts/estat_collector.py` to pull 15 indicators via 社会・人口統計体系
- Verify cdCat01 codes with `list_indicators()` before bulk pull
- Supplement with JMA weather data (via e-Stat B.自然環境 first, scrape if gaps)
- Download 地価公示 CSV from MLIT (Shift_JIS, annual release)
- Output: `data/raw/estat/estat_indicators.csv` + `estat_metadata.json`

### Phase 2 — Scoring Model (Week 2)
- Run `scripts/merge_all.py`: join sources, derive 収入対家賃比, normalize 0–100
- Apply directional inversion for negative indicators (crime rate, commute time, etc.)
- 5-dimension weighted composite: 経済力 25%, 生活利便性 30%, 環境快適度 20%, 社会安全度 10%, 将来性 15%
- Output: `data/processed/master_47_raw.csv` + `master_47_normalized.csv` + `livability_scores.json`

### Phase 3 — Web Visualization (Week 3)
- D3.js v7 + TopoJSON choropleth map, dark theme
- Sidebar rank list with prefecture detail panel (radar-style dimension bars)
- Tooltip on hover, click-to-select
- Data loaded from `livability_scores.json`; fallback to sample data if file absent
- japan.topojson from dataofjapan/land (MIT)
- Deploy to Vercel (static, zero-config)

### Phase 4 — Content (Week 3–4)
- 6 Xiaohongshu posts: process/data post → teaser → main ranking → contrast → tool → discussion
- Key narrative: "AI says 福井/長野/石川 beats Tokyo on holistic livability"

---

## CEO Review Expansions (approved 2026-04-02)

### Phase 5 — 生活利便性 再設計（指標拡充・再計算）
**Background:** `dim_生活利便性` currently uses only housing metrics (持ち家比率, 住宅延べ面積, 家賃_1畳当たり),
causing Tokyo to score 11.7/100 — counterintuitive given world-class transit and urban density.

**Work:**
1. Research e-Stat J表 (0000010210) and K表 for commercial/transport accessibility indicators
   - Candidate codes: 大型小売店舗数 (per capita), 鉄道旅客輸送量, 乗用車保有台数, etc.
   - Use `list_indicators()` helper to verify codes before adding
2. Add 2–3 urban amenity indicators to `TARGETS` in `estat_collector.py`
3. Rebuild dimension definition in `scripts/merge_all.py`:
   - Keep housing metrics as their own sub-weight
   - Add urban amenity metrics with equal sub-weight
   - Rename dimension to 生活利便性 but update tooltip to clarify scope
4. Rerun full pipeline: `estat_collector.py` → `merge_all.py` → regenerate `livability_scores.json`
5. Verify Tokyo rank changes realistically (should move from ~last to mid-range)

**Output:** Updated `data/raw/estat/estat_indicators.csv`, `data/processed/livability_scores.json`

### Phase 6 — 地図インタラクション強化（ズーム・パン）
**Work:**
1. Add `d3.zoom()` behavior to the map SVG in `web/src/app.js`
   - Mouse wheel / pinch: zoom in/out (scale 1–8x)
   - Drag: pan the map
   - Double-click: reset to initial view
2. Add a "リセット" button overlaid on the map
3. Preserve existing click-to-select prefecture behavior on zoom
4. Add smooth zoom-to-prefecture animation when rank list item is clicked

**Output:** Updated `web/src/app.js`

### Phase 7 — 三言語対応（中文/日本語/English）
**Work:**
1. Create `web/src/i18n.js` with translation strings for all 3 languages:
   - UI labels: dimension names, indicator names, header text, button labels
   - Prefecture names: kanji (JA), romanized (EN), Chinese common names (ZH)
   - All 47 prefecture names × 3 languages
2. Add language switcher `[中] [日] [EN]` to header (CSS-only toggle, no build step)
3. Update `app.js` to use i18n strings throughout
4. Default language: Japanese (current behavior preserved)
5. Language preference stored in `localStorage`

**Output:** New `web/src/i18n.js`, updated `web/index.html` and `web/src/app.js`

### Phase 8 — 市区町村レベルデータ拡張
**Background:** Prefecture-level data (47 units) confirmed working. Expanding to
municipality level (~1,700+ units) requires separate pipeline and UI drill-down.

**Sub-phases:**
**8a — Data Research (prerequisite)**
- Identify e-Stat indicators available at `lvArea=3` (市区町村) vs current `lvArea=2`
- Many indicators are prefecture-only; identify the subset available at municipality level
- Download 市区町村 TopoJSON (MLIT N03 administrative boundaries or similar, ~5MB)
- Assess data completeness (expect 20–40% missing at municipality level)

**8b — Pipeline Extension**
- Add `lvArea=3` collection mode to `estat_collector.py`
- Create `scripts/merge_all_city.py` for municipality-level scoring
- Handle missing data gracefully (municipalities with <50% indicator coverage → show "insufficient data")
- Output: `web/data/city_scores.json` (~1,700 records)

**8c — UI Drill-Down**
- "Click to drill down" on prefecture → zoom in + switch choropleth to municipality layer
- Back button to return to prefecture view
- Municipality detail panel in sidebar (same format as prefecture panel)
- Progressive loading: load `city_scores.json` only after first drill-down

**Risk:** High. Municipality data coverage is uncertain until 8a is completed.
Recommend completing 8a before committing to 8b/8c timeline.

---

## Design Debt (quick wins — bundle with Phase 6)
- [ ] Header: "20指標" → "15指標" (or remove number entirely until count finalizes)
- [ ] CSS: `--muted: #8b949e` → `#9ca3af` (WCAG AA contrast fix for sidebar labels)
- [ ] Methodology tooltip: add `ℹ` icons to dimension bars in detail panel

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Data collection | Python + requests + pandas | e-Stat REST API returns JSON |
| Scoring | scikit-learn MinMaxScaler + pandas | Simple, auditable, reproducible |
| Visualization | D3.js v7 + TopoJSON (vanilla JS) | No build step, CDN-ready, maximum portability |
| Hosting | Vercel (static) | Free tier, auto-deploy from GitHub |
| Content | Manual | Xiaohongshu posts written after data is confirmed |

---

## Approved Scope Expansions (from autoplan)
1. **Weight preset + custom slider UI** — 3 presets (家庭向/単身経済向/退休向) + custom sliders; live re-render on change
2. **Mobile responsive layout** — map stacks above sidebar below 768px
3. **Loading / error states** — TopoJSON loading spinner; API fallback message styled
4. **Unit tests** — pytest for normalize, pref_codes, merge; 5 tests minimum before deploy

## Bugs to Fix Before Any Content Launch
1. `app.js` data path: `../data/processed/livability_scores.json` → fix to work from project root
2. `generateSampleData()` uses `Math.random()` — replace with seeded deterministic RNG
3. `assert len(df) == 47` in merge_all.py → change to warning log
4. No API retry in estat_collector.py → add HTTPAdapter with max_retries=3
5. `weight_rationale.md` missing → create stub

## Key Risks

1. ~~**cdCat01 codes unverified**~~ — ✅ RESOLVED
2. ~~**TopoJSON not yet downloaded**~~ — ✅ RESOLVED
3. ~~**Sample data RNG**~~ — ✅ RESOLVED: Real data pipeline complete
4. ~~**No API retry**~~ — ✅ RESOLVED: HTTPAdapter with max_retries=3
5. ~~**Data path mismatch**~~ — ✅ RESOLVED
6. ~~**生活利便性 methodology mismatch**~~ — ✅ RESOLVED: Phase 5+indicator overhaul complete
7. ~~**市区町村 data completeness**~~ — ✅ RESOLVED: city_scores.json generated
8. ~~**git/deploy blocked**~~ — ✅ RESOLVED: GitHub repo live, vercel.json ready
9. **NARRATIVE MISMATCH (2026-04-02)** — Default view shows Tokyo #1; original hook dead. RESOLVED by CEO review: new narrative "4 presets, 4 winners." Requires Hero Banner update + content rewrite.
10. **Okinawa/Shizuoka credibility** — Low rankings may generate skepticism. Mitigated by context chips (A2).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 2 | ✅ DONE v2 | 定位校正：严肃数据工具，非内容营销。M1方法论透明化 + M2数据解释层。 |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | ✅ DONE (claude) | 10 findings, 3 critical: OG meta tags missing, PREF_NOTES monolingual, screenshot fix not applied |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ✅ CLEAR | 7 issues found, 0 critical gaps. All resolved: LFS, screenshot scope, API key, 3 tests, OG tags, PREF_NOTES i18n |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**VERDICT:** CEO + ENG CLEARED 2026-04-03 — 7个工程问题已全部解决。待实施：OG标签、PREF_NOTES翻译、截图修复、3个Playwright测试，然后可以部署。

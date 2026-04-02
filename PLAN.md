<!-- /autoplan restore point: will be written after Phase 0 -->

# Japan Livability Index — Project Plan

**Goal:** Build an AI-powered ranking of Japan's 47 prefectures by livability, using 15–20 indicators from government open data (e-Stat). Output: interactive D3.js choropleth map + viral Xiaohongshu content ("Tokyo is not #1").

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

1. ~~**cdCat01 codes unverified**~~ — ✅ RESOLVED: All 15 codes verified and working
2. ~~**TopoJSON not yet downloaded**~~ — ✅ RESOLVED: `web/data/japan.topojson` present
3. ~~**Sample data RNG**~~ — ✅ RESOLVED: Real data pipeline complete, sample data unused
4. ~~**No API retry**~~ — ✅ RESOLVED: HTTPAdapter with max_retries=3 in place
5. ~~**Data path mismatch**~~ — ✅ RESOLVED: `app.js` now loads from correct path
6. **生活利便性 methodology mismatch** — Tokyo scores 11.7/100 due to housing-only indicators. Fixing in Phase 5.
7. **市区町村 data completeness unknown** — Phase 8a research required before committing to 8b/8c
8. **git/deploy blocked** — Local git issues prevent Vercel auto-deploy. Manual deploy or workaround needed.
9. **i18n string completeness** — 47 prefecture Chinese names need verification for accuracy

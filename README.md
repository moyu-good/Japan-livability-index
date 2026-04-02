# 🗾 Japan Livability Index | 日本都道府県 宜居度指数

Data-driven ranking of Japan's 47 prefectures by livability, using 16 indicators from official government statistics (e-Stat).

**[Live Demo →](#)** | [Methodology](docs/methodology.md) | [Data Sources](data/sources.md)

---

## Key Finding

**福井県 ranks #1. Tokyo ranks #3.**

When livability is measured holistically — not just economic output — mid-sized prefectures with clean environments, strong communities, and low crime consistently outperform megacities.

| Rank | Prefecture | Score |
|------|-----------|-------|
| 🥇 1 | 福井県 Fukui | 60.7 |
| 🥈 2 | 岐阜県 Gifu | 58.7 |
| 🥉 3 | 東京都 Tokyo | 58.0 |
| 4 | 静岡県 Shizuoka | 57.5 |
| 5 | 島根県 Shimane | 57.4 |

---

## Scoring Model

5 dimensions × weighted composite (default weights shown):

| Dimension | Weight | Indicators |
|-----------|--------|------------|
| 経済力 Economy | 25% | Per-capita income, unemployment rate, job offer ratio |
| 生活利便性 Convenience | 30% | Transit access (car ownership proxy), housing size, ownership rate, rent cost, rent-to-income ratio |
| 環境快適度 Environment | 20% | Annual sunshine hours, annual precipitation |
| 社会安全度 Safety | 10% | Crime rate, traffic accident rate, hospitals per 100k, doctors per 100k |
| 将来性 Future | 15% | Population growth rate, net migration rate, aging rate |

**Weights are adjustable** — the web app includes 3 presets (Family, Career, Retirement) and a custom slider panel.

---

## Project Structure

```
都道府県/
├── data/
│   ├── raw/estat/              ← e-Stat API responses (gitignored)
│   └── processed/              ← Normalized CSVs (gitignored)
├── scripts/
│   ├── estat_collector.py      ← Pull prefecture-level data from e-Stat
│   ├── merge_all.py            ← Normalize + compute dimension scores
│   ├── estat_collector_city.py ← Pull municipality-level data (Phase 8)
│   ├── merge_all_city.py       ← City-level scoring (Phase 8)
│   └── download_city_topo.py   ← Download city boundary GeoJSON (Phase 8)
├── web/
│   ├── index.html              ← Interactive choropleth map
│   ├── src/app.js              ← D3.js visualization + drill-down logic
│   ├── src/i18n.js             ← Trilingual UI (中/日/EN)
│   └── data/
│       ├── japan.topojson      ← Prefecture boundaries
│       ├── livability_scores.json  ← Computed scores (47 prefectures)
│       └── cities/             ← Municipality GeoJSON (Phase 8, run download script)
├── content/
│   └── xiaohongshu_posts.md    ← Xiaohongshu content drafts
└── docs/
    └── methodology.md
```

---

## Quick Start

### Prerequisites

```bash
pip install -r requirements.txt

# Register for e-Stat API key (free):
# https://www.e-stat.go.jp/mypage/user/preregister
# Then add to .env:  ESTAT_APP_ID=your_key_here
```

### 1. Collect Data

```bash
python scripts/estat_collector.py
# Outputs: data/raw/estat/estat_indicators.csv
```

### 2. Build Scores

```bash
python scripts/merge_all.py
# Outputs: web/data/livability_scores.json
```

### 3. Run the Web App

```bash
cd web
python -m http.server 8000
# Open: http://localhost:8000
```

### 4. (Optional) Municipality Drill-Down

```bash
python scripts/download_city_topo.py      # ~15 min, downloads boundary data
python scripts/estat_collector_city.py    # municipality-level data
python scripts/merge_all_city.py          # outputs web/data/city_scores.json
```

---

## Data Sources

All from Japanese government open statistics:

| Source | Data | URL |
|--------|------|-----|
| e-Stat 社会・人口統計体系 | Population, economy, housing, safety | https://www.e-stat.go.jp |
| niiyz/JapanCityGeoJson | Municipality boundary GeoJSON | GitHub |
| dataofjapan/land | Prefecture boundary TopoJSON | GitHub |

---

## Features

- **Interactive choropleth map** — hover tooltip, click to select, scroll/drag/zoom
- **Trilingual UI** — 中文 / 日本語 / English (localStorage persistence)
- **Adjustable weights** — 3 presets + custom sliders, live re-render
- **Radar chart** — multi-dimension comparison with prefecture overlay
- **Drill-down** — click prefecture → zoom in to municipality-level choropleth
- **Export** — CSV download, screenshot, shareable URL

---

## License

Data: Japanese government statistics are public domain (CC BY 4.0 via e-Stat).  
Code: MIT License.

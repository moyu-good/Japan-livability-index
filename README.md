# 🗾 Japan Livability Index | 日本都道府県 宜居度指数 | 日本都道府県 住みやすさ指数

> 🇨🇳 [中文](#-中文说明) ｜ 🇯🇵 [日本語](#-日本語説明) ｜ 🇬🇧 [English](#-english)

---

## 🇨🇳 中文说明

### 项目简介

基于日本政府公开统计数据（e-Stat），对日本 47 个都道府县的宜居度进行量化评估。  
涵盖 **5 大维度、16 项指标**，支持自定义权重，帮助在日华人选择适合自己的居住地。

### 核心发现

**默认权重下：福井县 #1，东京都 #3。**

用综合宜居度衡量时，中型城市在居住空间、环境、安全方面的优势足以弥补经济上与大城市的差距。

| 排名 | 都道府县 | 综合分 |
|------|---------|--------|
| 🥇 1 | 福井県 Fukui | 60.7 |
| 🥈 2 | 岐阜県 Gifu | 58.7 |
| 🥉 3 | 東京都 Tokyo | 58.0 |
| 4 | 静岡県 Shizuoka | 57.5 |
| 5 | 島根県 Shimane | 57.4 |

> ⚠️ 注意：评分基于**都道府县整体**平均值，不代表县内具体城市。东京都包含西部山区，大阪府包含吉野山村。

---

### 评分模型

#### 五大维度与默认权重

| 维度 | 默认权重 | 说明 |
|------|---------|------|
| 経済力 经济力 | 25% | 收入水平、就业环境 |
| 生活利便性 生活便利度 | 30% | 交通、住房面积、房租成本 |
| 環境快適度 环境舒适度 | 20% | 日照、降水 |
| 社会安全度 社会安全度 | 10% | 犯罪率、交通事故、医疗资源 |
| 将来性 发展潜力 | 15% | 人口增减、迁入超出、老龄化 |

#### 详细指标与数据来源

**経済力（经济力）**

| 指标 | 数据来源 | 统计年份 | 方向 |
|------|---------|---------|------|
| 县民人均收入 | 内閣府 県民経済計算 | 2021 | ↑高分 |
| 完全失业率 | 総務省 労働力調査 | 2022 | ↓低分（取反） |
| 有效求人倍率 | 厚生労働省 職業安定業務統計 | 2022 | ↑高分 |

**生活利便性（生活便利度）**

| 指标 | 数据来源 | 统计年份 | 方向 |
|------|---------|---------|------|
| 人均汽车保有量（公共交通代理指标） | 自動車検査登録情報協会 | 2022 | ↓低分（依赖越低说明公交越发达） |
| 自有住宅比率 | 総務省 住宅・土地統計調査 | 2018 | ↑高分 |
| 人均住宅建筑面积 | 総務省 住宅・土地統計調査 | 2018 | ↑高分 |
| 每叠租金（房租成本） | 国土交通省 住宅市場動向調査 | 2022 | ↓低分（取反） |

**環境快適度（环境舒适度）**

| 指标 | 数据来源 | 统计年份 | 方向 |
|------|---------|---------|------|
| 年均日照时长 | 気象庁 気象統計 | 2020–2022 均值 | ↑高分 |
| 年均降水量 | 気象庁 気象統計 | 2020–2022 均值 | ↓低分（取反） |

**社会安全度（社会安全度）**

| 指标 | 数据来源 | 统计年份 | 方向 |
|------|---------|---------|------|
| 每10万人犯罪率 | 警察庁 犯罪統計 | 2022 | ↓低分（取反） |
| 每10万人交通事故率 | 警察庁 交通統計 | 2022 | ↓低分（取反） |
| 每10万人医院数 | 厚生労働省 医療施設調査 | 2021 | ↑高分 |
| 每10万人医师数 | 厚生労働省 医師・歯科医師・薬剤師統計 | 2020 | ↑高分 |

**将来性（发展潜力）**

| 指标 | 数据来源 | 统计年份 | 方向 |
|------|---------|---------|------|
| 人口增减率 | 総務省 住民基本台帳 | 2022 | ↑高分 |
| 净迁入率（転入超過率） | 総務省 住民基本台帳移動報告 | 2022 | ↑高分 |
| 65岁以上老龄化率 | 総務省 統計局 e-Stat | 2022 | ↓低分（取反） |

#### 标准化方法

1. 每项指标对 47 都道府县进行 **min-max 归一化**，映射到 0–100 分
2. 需取反的指标（越低越好）先取反再归一化
3. 维度得分 = 该维度下各指标的**等权均值**
4. 总分 = 五大维度得分的**加权求和**（权重可由用户调整）

---

### 功能特性

- **交互式地图** — 悬停显示得分，点击查看详情，滚轮缩放/拖拽
- **市区町村下钻** — 点击都道府县可进入市区町村级别地图
- **三语切换** — 中文 / 日本語 / English
- **自定义权重** — 3 个预设（家庭向け・キャリア・セカンドライフ）+ 自由拖动
- **雷达图对比** — 选两个都道府县并排比较五维度
- **分享 URL** — 编码当前权重和选中城市，一键复制链接
- **截图模式** — 一键切换简洁地图视图，适合截图发小红书

---

### 快速开始

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 配置 e-Stat API Key（免费注册）
# https://www.e-stat.go.jp/mypage/user/preregister
echo "ESTAT_APP_ID=你的key" > .env

# 3. 采集数据
python scripts/estat_collector.py

# 4. 计算评分
python scripts/merge_all.py

# 5. 启动本地服务
cd web && python -m http.server 8000
# 打开 http://localhost:8000
```

---

---

## 🇯🇵 日本語説明

### プロジェクト概要

日本政府の公式統計（e-Stat）をもとに、全47都道府県の住みやすさを**5次元・16指標**で定量評価したデータプロジェクトです。  
在日外国人・移住検討者が居住地を選ぶ際の参考として設計されています。

### 主な発見

**デフォルト重みでは：福井県 #1、東京都 #3。**

総合的な住みやすさで評価すると、適度な規模の地方都市が、環境・空間・安全面の優位性で大都市を凌ぐ結果となりました。

> ⚠️ スコアは**都道府県全体**の平均値です。東京都には西部山間部も含まれ、大阪府には吉野山村も含まれます。市区町村単位の評価はドリルダウン機能をご利用ください。

---

### 評価モデル

#### 5次元とデフォルト重み

| 次元 | デフォルト重み | 内容 |
|------|------------|------|
| 経済力 | 25% | 所得水準・雇用環境 |
| 生活利便性 | 30% | 交通・住宅面積・家賃コスト |
| 環境快適度 | 20% | 日照時間・降水量 |
| 社会安全度 | 10% | 犯罪率・交通事故・医療資源 |
| 将来性 | 15% | 人口動態・転入超過・高齢化 |

#### 詳細指標と出典

**経済力**

| 指標 | 出典 | 年度 | 方向 |
|------|------|------|------|
| 県民所得（一人当たり） | 内閣府 県民経済計算 | 2021 | ↑高いほど高スコア |
| 完全失業率 | 総務省 労働力調査 | 2022 | ↓低いほど高スコア（逆転） |
| 有効求人倍率 | 厚生労働省 職業安定業務統計 | 2022 | ↑高いほど高スコア |

**生活利便性**

| 指標 | 出典 | 年度 | 方向 |
|------|------|------|------|
| 自動車保有台数（公共交通利便性の代理指標） | 自動車検査登録情報協会 | 2022 | ↓低いほど高スコア（依存度が低い＝交通網が発達） |
| 持ち家比率 | 総務省 住宅・土地統計調査 | 2018 | ↑高いほど高スコア |
| 住宅延べ面積（一人当たり） | 総務省 住宅・土地統計調査 | 2018 | ↑高いほど高スコア |
| 家賃（1畳当たり） | 国土交通省 住宅市場動向調査 | 2022 | ↓低いほど高スコア（逆転） |

**環境快適度**

| 指標 | 出典 | 年度 | 方向 |
|------|------|------|------|
| 年間日照時間 | 気象庁 気象統計 | 2020–2022年平均 | ↑長いほど高スコア |
| 年間降水量 | 気象庁 気象統計 | 2020–2022年平均 | ↓少ないほど高スコア（逆転） |

**社会安全度**

| 指標 | 出典 | 年度 | 方向 |
|------|------|------|------|
| 犯罪発生率（人口10万対） | 警察庁 犯罪統計 | 2022 | ↓低いほど高スコア（逆転） |
| 交通事故発生率（人口10万対） | 警察庁 交通統計 | 2022 | ↓低いほど高スコア（逆転） |
| 病院数（人口10万対） | 厚生労働省 医療施設調査 | 2021 | ↑多いほど高スコア |
| 医師数（人口10万対） | 厚生労働省 医師・歯科医師・薬剤師統計 | 2020 | ↑多いほど高スコア |

**将来性**

| 指標 | 出典 | 年度 | 方向 |
|------|------|------|------|
| 人口増減率 | 総務省 住民基本台帳 | 2022 | ↑増加ほど高スコア |
| 転入超過率 | 総務省 住民基本台帳移動報告 | 2022 | ↑転入超過ほど高スコア |
| 高齢化率（65歳以上割合） | 総務省 統計局 e-Stat | 2022 | ↓低いほど高スコア（逆転） |

#### 標準化手順

1. 各指標を47都道府県で **min-max 正規化**（0〜100点）
2. 逆転指標は正規化前に反転処理
3. 次元スコア = 各次元内指標の**等重平均**
4. 総合スコア = 5次元スコアの**加重和**（ユーザーが重みを調整可能）

---

### クイックスタート

```bash
pip install -r requirements.txt
# e-Stat APIキー取得: https://www.e-stat.go.jp/mypage/user/preregister
echo "ESTAT_APP_ID=yourkey" > .env

python scripts/estat_collector.py   # データ収集
python scripts/merge_all.py         # スコア計算
cd web && python -m http.server 8000
```

---

---

## 🇬🇧 English

### Overview

A data-driven livability ranking of Japan's 47 prefectures, built on official government statistics (e-Stat).  
**5 dimensions, 16 indicators** — weights are fully adjustable so you can prioritize what matters to you.

### Key Finding

**Under default weights: Fukui Prefecture ranks #1. Tokyo ranks #3.**

When livability is measured holistically — not just economic output — mid-sized prefectures with clean environments, strong communities, and low crime consistently outperform megacities.

> ⚠️ Scores are **prefecture-wide averages**. Tokyo includes rural western mountain areas; Osaka-fu includes Nishiyoshino-mura. Use the municipality drill-down for city-level data.

---

### Scoring Model

#### Five Dimensions

| Dimension | Default Weight | Focus |
|-----------|---------------|-------|
| 経済力 Economy | 25% | Income, employment |
| 生活利便性 Convenience | 30% | Transit, housing, rent cost |
| 環境快適度 Environment | 20% | Sunshine, precipitation |
| 社会安全度 Safety | 10% | Crime, accidents, healthcare |
| 将来性 Future Potential | 15% | Population dynamics, aging |

#### Full Indicator Reference

**経済力 — Economy**

| Indicator | Source | Year | Direction |
|-----------|--------|------|-----------|
| Per-capita prefectural income | Cabinet Office: Prefectural Accounts | 2021 | ↑ higher = better |
| Unemployment rate | MIC: Labour Force Survey | 2022 | ↓ lower = better (inverted) |
| Job offer-to-seeker ratio | MHLW: Employment Security Statistics | 2022 | ↑ higher = better |

**生活利便性 — Convenience**

| Indicator | Source | Year | Direction |
|-----------|--------|------|-----------|
| Car ownership rate (proxy for transit dependency) | AIRIA: Automotive Registration | 2022 | ↓ lower = better (less car dependency = better transit) |
| Home ownership rate | MIC: Housing & Land Survey | 2018 | ↑ higher = better |
| Residential floor area per capita | MIC: Housing & Land Survey | 2018 | ↑ higher = better |
| Rent per tatami (≈ 1.65 m²) | MLIT: Housing Market Survey | 2022 | ↓ lower = better (inverted) |

**環境快適度 — Environment**

| Indicator | Source | Year | Direction |
|-----------|--------|------|-----------|
| Annual sunshine hours | JMA: Meteorological Statistics | 2020–2022 avg | ↑ higher = better |
| Annual precipitation | JMA: Meteorological Statistics | 2020–2022 avg | ↓ lower = better (inverted) |

**社会安全度 — Safety**

| Indicator | Source | Year | Direction |
|-----------|--------|------|-----------|
| Crime rate (per 100k population) | NPA: Crime Statistics | 2022 | ↓ lower = better (inverted) |
| Traffic accident rate (per 100k) | NPA: Traffic Statistics | 2022 | ↓ lower = better (inverted) |
| Hospitals per 100k population | MHLW: Medical Facility Survey | 2021 | ↑ higher = better |
| Physicians per 100k population | MHLW: Physician/Dentist/Pharmacist Survey | 2020 | ↑ higher = better |

**将来性 — Future Potential**

| Indicator | Source | Year | Direction |
|-----------|--------|------|-----------|
| Population growth rate | MIC: Basic Resident Register | 2022 | ↑ higher = better |
| Net migration rate | MIC: Resident Register Migration Report | 2022 | ↑ higher = better |
| Aging rate (65+ population share) | MIC Statistics Bureau via e-Stat | 2022 | ↓ lower = better (inverted) |

#### Normalization Method

1. Each indicator is **min-max normalized** across 47 prefectures → 0–100 scale
2. Inverted indicators (lower = better) are negated before normalization
3. Dimension score = **equal-weighted mean** of indicators within that dimension
4. Total score = **weighted sum** of dimension scores (user-adjustable weights)

---

### Data Sources

| Source | Coverage | URL |
|--------|----------|-----|
| e-Stat 社会・人口統計体系 | Population, economy, housing, safety, welfare | https://www.e-stat.go.jp |
| 内閣府 県民経済計算 | Prefectural income | https://www.esri.cao.go.jp/jp/sna/sonota/kenmin/kenmin_top.html |
| 気象庁 気象統計情報 | Climate (sunshine, precipitation) | https://www.data.jma.go.jp/stats/etrn/ |
| 警察庁 犯罪統計 | Crime rate | https://www.npa.go.jp/publications/statistics/crime/ |
| niiyz/JapanCityGeoJson | Municipality boundary GeoJSON | https://github.com/niiyz/JapanCityGeoJson |
| dataofjapan/land | Prefecture boundary TopoJSON | https://github.com/dataofjapan/land |

**Abbreviations:** MIC = Ministry of Internal Affairs and Communications (総務省)、MHLW = Ministry of Health, Labour and Welfare (厚生労働省)、MLIT = Ministry of Land, Infrastructure, Transport and Tourism (国土交通省)、NPA = National Police Agency (警察庁)、JMA = Japan Meteorological Agency (気象庁)、AIRIA = Automobile Inspection & Registration Information Association

---

### Project Structure

```
都道府県/
├── scripts/
│   ├── estat_collector.py       ← Fetch prefecture data from e-Stat API
│   ├── merge_all.py             ← Normalize + compute scores
│   ├── estat_collector_city.py  ← Municipality-level data collection
│   ├── merge_all_city.py        ← Municipality scoring
│   └── download_city_topo.py    ← Download boundary GeoJSON (277 MB)
├── web/
│   ├── index.html               ← Interactive app (light theme, mobile-first)
│   ├── src/app.js               ← D3.js map + drill-down + share + modal logic
│   ├── src/i18n.js              ← Trilingual UI strings
│   └── data/
│       ├── japan.topojson       ← Prefecture boundaries
│       ├── livability_scores.json   ← 47 prefecture scores
│       ├── city_scores.json     ← 1,920 municipality scores
│       └── cities/              ← Municipality GeoJSON (gitignored, run download script)
├── data/
│   └── sources.md               ← Raw data inventory
├── docs/
│   └── methodology.md           ← Extended methodology notes
├── vercel.json                  ← Vercel static site config
└── requirements.txt
```

### Quick Start

```bash
pip install -r requirements.txt
# Get free e-Stat API key: https://www.e-stat.go.jp/mypage/user/preregister
echo "ESTAT_APP_ID=your_key" > .env

python scripts/estat_collector.py    # collect data
python scripts/merge_all.py          # compute scores

cd web && python -m http.server 8000
# Open http://localhost:8000
```

### License

- **Data**: Japanese government statistics — public domain (CC BY 4.0 via e-Stat)
- **Code**: MIT License

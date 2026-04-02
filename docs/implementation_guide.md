# 🗾 Japan Livability Index — データ採集実装ガイド

---

## 0. 全体アーキテクチャ

```
データソース                    取得方法              出力
─────────────────────────────────────────────────────────
e-Stat API (社会・人口統計体系)  → REST API (JSON)  → raw/estat/
気象庁 過去の気象データ           → Selenium スクレイピング → raw/jma/
国土交通省 (地価・通勤)          → CSV直接DL        → raw/mlit/
厚生労働省 (医療)               → e-Stat経由       → raw/mhlw/
警察庁 (犯罪統計)               → e-Stat経由       → raw/npa/
─────────────────────────────────────────────────────────
               ↓ cleaning & merge
         processed/master_47.csv  (47行 × ~20列)
```

---

## 1. e-Stat API — メインデータソース

### 1.1 事前準備（必須）

**Step 1: ユーザー登録**
- https://www.e-stat.go.jp/mypage/login にアクセス
- メールアドレスでユーザー登録
- 登録後「マイページ」→「API機能（アプリケーションID発行）」
- アプリケーションIDを取得（`appId`として使う）

**Step 2: Python環境セットアップ**

```bash
pip install requests pandas tqdm python-dotenv
```

```python
# .env ファイル（.gitignoreに必ず追加）
ESTAT_APP_ID=your_application_id_here
```

### 1.2 核心コンセプト：統計表IDの仕組み

e-Statのデータは「政府統計コード」→「統計表ID」の2段階で整理されている。
今回のプロジェクトで最も重要なのは**社会・人口統計体系（政府統計コード：00200502）**。

この中に「社会生活統計指標」というデータセットがあり、都道府県別に13分野
（A.人口・世帯、B.自然環境、C.経済基盤…K.安全 等）の指標が整備されている。

**使用する統計表ID一覧：**

| 統計表ID | 分野 | 使用する主要指標 |
|----------|------|------------------|
| 0000010201 | A.人口・世帯 | 人口増減率、高齢化率、転入超過率 |
| 0000010202 | B.自然環境 | 可住地面積割合 |
| 0000010203 | C.経済基盤 | 県民所得、完全失業率 |
| 0000010206 | F.労働 | 有効求人倍率、通勤時間 |
| 0000010208 | H.居住 | 持ち家比率、住宅延べ面積、家賃 |
| 0000010209 | I.健康・医療 | 病院数、医師数、平均寿命 |
| 0000010210 | J.福祉・社会保障 | 保育所数 |
| 0000010211 | K.安全 | 犯罪発生率、交通事故発生率 |

### 1.3 データ取得の実装コード

```python
"""
estat_collector.py
e-Stat APIから都道府県別データを一括取得するスクリプト
"""

import os
import json
import time
import requests
import pandas as pd
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

ESTAT_APP_ID = os.getenv("ESTAT_APP_ID")
BASE_URL = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"

# ── 取得したい統計表と指標コードのマッピング ──
# cdCat01 = 指標コード（e-Statの「DB」画面で確認可能）
TARGETS = {
    "人口増減率": {
        "statsDataId": "0000010201",
        "cdCat01": "A1301"      # 人口増減率
    },
    "高齢化率": {
        "statsDataId": "0000010201",
        "cdCat01": "A1501"      # 65歳以上人口割合
    },
    "転入超過率": {
        "statsDataId": "0000010201",
        "cdCat01": "A05301"     # 転入超過率
    },
    "県民所得_一人当たり": {
        "statsDataId": "0000010203",
        "cdCat01": "C3401"      # 一人当たり県民所得
    },
    "完全失業率": {
        "statsDataId": "0000010203",
        "cdCat01": "C3101"      # 完全失業率
    },
    "有効求人倍率": {
        "statsDataId": "0000010206",
        "cdCat01": "F2601"      # 有効求人倍率
    },
    "持ち家比率": {
        "statsDataId": "0000010208",
        "cdCat01": "H1101"      # 持ち家比率
    },
    "住宅延べ面積": {
        "statsDataId": "0000010208",
        "cdCat01": "H1501"      # 1住宅当たり延べ面積
    },
    "病院数_人口10万対": {
        "statsDataId": "0000010209",
        "cdCat01": "I5100"      # 人口10万人当たり病院数 (※コード要確認)
    },
    "医師数_人口10万対": {
        "statsDataId": "0000010209",
        "cdCat01": "I5210"      # 人口10万人当たり医師数 (※コード要確認)
    },
    "犯罪発生率": {
        "statsDataId": "0000010211",
        "cdCat01": "K1101"      # 犯罪発生率
    },
    "交通事故発生率": {
        "statsDataId": "0000010211",
        "cdCat01": "K2101"      # 交通事故発生件数
    },
}


def fetch_estat_data(stats_data_id: str, cd_cat01: str) -> dict:
    """
    e-Stat APIから指定された統計表・指標の都道府県別データを取得

    Returns:
        dict: {都道府県名: 値} のマッピング
    """
    params = {
        "appId": ESTAT_APP_ID,
        "statsDataId": stats_data_id,
        "cdCat01": cd_cat01,
        "cdArea": "0",          # 0 = 全国＋都道府県レベル
    }

    response = requests.get(BASE_URL, params=params)
    data = response.json()

    # エラーチェック
    result_info = data.get("GET_STATS_DATA", {}).get("RESULT", {})
    if result_info.get("STATUS") != 0:
        print(f"  ⚠️ APIエラー: {result_info.get('ERROR_MSG', '不明')}")
        return {}

    # データ解析
    stat_data = data["GET_STATS_DATA"]["STATISTICAL_DATA"]

    # 地域コードと地域名のマッピングを構築
    class_info = stat_data["CLASS_INF"]["CLASS_OBJ"]
    area_map = {}
    for cls in class_info:
        if cls["@id"] == "area":
            codes = cls["CLASS"]
            if isinstance(codes, dict):
                codes = [codes]
            for c in codes:
                area_map[c["@code"]] = c["@name"]

    # 数値データを抽出（最新年度のデータのみ）
    values = stat_data["DATA_INF"]["VALUE"]
    if isinstance(values, dict):
        values = [values]

    # 時間軸でグループ化し、最新のデータを取得
    time_groups = {}
    for v in values:
        time_code = v.get("@time", "")
        if time_code not in time_groups:
            time_groups[time_code] = []
        time_groups[time_code].append(v)

    # 最新の時間コードを選択
    latest_time = sorted(time_groups.keys(), reverse=True)[0] if time_groups else None

    if not latest_time:
        return {}

    result = {}
    for v in time_groups[latest_time]:
        area_code = v.get("@area", "")
        value = v.get("$", "")

        # 都道府県レベルのデータのみ（コード5桁で末尾が000）
        if len(area_code) == 5 and area_code.endswith("000"):
            pref_name = area_map.get(area_code, area_code)
            try:
                result[pref_name] = float(value) if value not in ("", "-", "…", "x") else None
            except (ValueError, TypeError):
                result[pref_name] = None

    return result, latest_time


def collect_all_indicators():
    """全指標を一括取得してDataFrameにまとめる"""

    all_data = {}
    metadata = {}

    for indicator_name, config in tqdm(TARGETS.items(), desc="指標取得中"):
        print(f"\n📊 {indicator_name} を取得中...")
        try:
            result, year = fetch_estat_data(
                config["statsDataId"],
                config["cdCat01"]
            )
            all_data[indicator_name] = result
            metadata[indicator_name] = {
                "statsDataId": config["statsDataId"],
                "cdCat01": config["cdCat01"],
                "data_year": year,
                "record_count": len([v for v in result.values() if v is not None])
            }
            print(f"  ✅ {len(result)} 都道府県 取得完了（{year}）")
        except Exception as e:
            print(f"  ❌ エラー: {e}")
            all_data[indicator_name] = {}
            metadata[indicator_name] = {"error": str(e)}

        time.sleep(1)  # API負荷軽減のため1秒待機

    # DataFrameに変換
    df = pd.DataFrame(all_data)
    df.index.name = "都道府県"

    return df, metadata


def save_results(df, metadata, output_dir="data/raw/estat"):
    """結果をCSV + メタデータJSONとして保存"""
    os.makedirs(output_dir, exist_ok=True)

    csv_path = os.path.join(output_dir, "estat_indicators.csv")
    meta_path = os.path.join(output_dir, "estat_metadata.json")

    df.to_csv(csv_path, encoding="utf-8-sig")  # utf-8-sig = Excelで文字化けしない

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"\n💾 保存完了:")
    print(f"   データ: {csv_path}")
    print(f"   メタ情報: {meta_path}")
    print(f"   行数: {len(df)}, 列数: {len(df.columns)}")
    print(f"\n📋 欠損値サマリー:")
    print(df.isnull().sum())


if __name__ == "__main__":
    df, meta = collect_all_indicators()
    save_results(df, meta)
```

### 1.4 指標コード（cdCat01）の調べ方

指標コードは事前にe-Statの画面で確認する必要がある。手順：

1. https://www.e-stat.go.jp/regional-statistics にアクセス
2. 「社会・人口統計体系」→「都道府県データ」→「社会生活統計指標」を選択
3. 分野（A〜K）を選んで展開
4. 各指標の横に `#A1301` のようなコードが表示される → これが `cdCat01`

**または、APIで指標一覧を取得する方法：**

```python
def list_indicators(stats_data_id: str):
    """統計表のメタ情報（指標一覧）を取得"""
    url = "https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo"
    params = {
        "appId": ESTAT_APP_ID,
        "statsDataId": stats_data_id
    }
    response = requests.get(url, params=params)
    data = response.json()

    meta = data["GET_META_INFO"]["METADATA_INF"]["CLASS_INF"]["CLASS_OBJ"]
    for cls in meta:
        if cls["@id"] == "cat01":  # 指標分類
            codes = cls["CLASS"]
            if isinstance(codes, dict):
                codes = [codes]
            for c in codes:
                print(f"  {c['@code']:12s} | {c['@name']}")

# 使用例：健康・医療分野の指標一覧を表示
list_indicators("0000010209")
```

---

## 2. 気象庁 — 天気・気候データ

### 2.1 データの特徴と注意点

気象庁の「過去の気象データ・ダウンロード」は **APIが存在しない**。
Web画面（https://www.data.jma.go.jp/risk/obsdl/）から手動 or スクレイピングで取得する。

**重要な制約：**
- 自動化ツールによる過度のアクセスは控えるよう公式に警告されている
- 一回のリクエストでデータ量に上限がある
- 地点ごとにダウンロードが必要（都道府県単位ではない）

### 2.2 推奨取得戦略

都道府県の「県庁所在地」の気象台データを代表値として使用する。

**取得する項目：**
- 年間平均気温
- 年間日照時間
- 年間降水量
- 快適日数（日最高気温15-28℃の日数 = 独自指標として算出）

### 2.3 実装方法（2パターン）

#### パターンA：手動ダウンロード（確実・推奨）

47都道府県の県庁所在地データを手動で取得。作業時間は約2〜3時間。

```
手順：
1. https://www.data.jma.go.jp/risk/obsdl/ にアクセス
2. 「地点を選ぶ」→ 都道府県 → 県庁所在地の気象台を選択
3. 「項目を選ぶ」→ 日別値 → 気温(平均・最高・最低)、日照時間、降水量
4. 「期間を選ぶ」→ 直近3年間（例: 2022-2024）
5. 表示オプション → 「すべて数値で格納」「日付リテラルで格納」
6. CSVダウンロード
7. 47地点分繰り返す（一度に複数地点選択も可能）
```

#### パターンB：Seleniumで自動化（上級者向け）

```python
"""
jma_collector.py
気象庁データを自動取得（Selenium使用）
⚠️ 過度なアクセスは控えること。取得間隔を十分に空ける。
"""

# 県庁所在地 → 気象庁の観測所番号マッピング
PREF_STATIONS = {
    "北海道": {"station": "s47412", "name": "札幌"},
    "青森県": {"station": "s47575", "name": "青森"},
    "岩手県": {"station": "s47584", "name": "盛岡"},
    # ... 以下47都道府県分を定義 ...
    "沖縄県": {"station": "s47936", "name": "那覇"},
}
```

#### パターンC：e-Stat経由（最も効率的）

**💡 実はe-Statの「B.自然環境」分野に気象データが含まれている！**

```python
# e-Stat経由で気象データを取得（気象庁スクレイピング不要）
WEATHER_TARGETS = {
    "年間日照時間": {
        "statsDataId": "0000010202",
        "cdCat01": "B1103"      # 日照時間（※コード要確認）
    },
    "年間降水量": {
        "statsDataId": "0000010202",
        "cdCat01": "B1102"      # 降水量（※コード要確認）
    },
}
```

---

## 3. その他のデータソース

### 3.1 国土交通省 — 地価データ

```python
"""
地価公示データ（年1回公表、CSV直接ダウンロード可能）
https://www.land.mlit.go.jp/webland/download.html
"""

import pandas as pd

def process_land_price(csv_path: str) -> pd.Series:
    """地価公示CSVから都道府県別平均を算出"""
    df = pd.read_csv(csv_path, encoding="shift_jis")  # 注: Shift_JISエンコーディング

    # 住宅地のみをフィルタ
    residential = df[df["用途区分"] == "住宅地"]

    # 都道府県別に平均地価を算出
    avg_price = residential.groupby("都道府県名")["価格"].mean()

    return avg_price
```

### 3.2 家賃データ — 収入対比で算出

```python
HOUSING_TARGETS = {
    "家賃_1畳当たり": {
        "statsDataId": "0000010208",
        "cdCat01": "H2130"      # 民営家賃（1畳当たり）※コード要確認
    },
    "持ち家比率": {
        "statsDataId": "0000010208",
        "cdCat01": "H1101"
    },
}

# 🔑 キー指標：「収入対家賃比」は自分で算出する
# = (民営家賃 × 12) / 一人当たり県民所得 × 100 (%)
# この比率が低いほど「割安に住める」
```

### 3.3 自然災害リスク — 追加差異化データ

```python
"""
内閣府 防災白書データ
http://www.bousai.go.jp/kaigirep/hakusho/
都道府県別の災害リスク指標として活用
"""

# 地震リスク：地震調査研究推進本部の確率データ
# https://www.jishin.go.jp/evaluation/seismic_hazard_map/
# → 30年以内に震度6弱以上の確率 (都道府県庁所在地別)
```

---

## 4. データクリーニング & 統合パイプライン

### 4.1 最終的なデータ統合スクリプト

```python
"""
merge_all.py
全データソースを統合して master_47.csv を生成
"""

import pandas as pd
import numpy as np
import json

def load_estat_data(path="data/raw/estat/estat_indicators.csv"):
    """e-Statデータの読み込みと前処理"""
    df = pd.read_csv(path, index_col=0, encoding="utf-8-sig")

    # 「全国」行を除外（都道府県のみ残す）
    df = df[df.index != "全国"]

    # 47都道府県であることを確認
    assert len(df) == 47, f"期待: 47行, 実際: {len(df)}行"

    return df


def normalize_indicators(df):
    """
    全指標を0-100スケールに正規化
    - 高いほど良い指標（所得等）→ そのまま正規化
    - 低いほど良い指標（犯罪率等）→ 反転して正規化
    """

    # 「低いほど良い」指標のリスト
    inverse_indicators = [
        "完全失業率",
        "犯罪発生率",
        "交通事故発生率",
        "高齢化率",
        "家賃_1畳当たり",
    ]

    normalized = pd.DataFrame(index=df.index)

    for col in df.columns:
        series = df[col].copy()
        valid = series.dropna()

        if len(valid) == 0:
            normalized[col] = np.nan
            continue

        min_val = valid.min()
        max_val = valid.max()

        if max_val == min_val:
            normalized[col] = 50
        elif col in inverse_indicators:
            normalized[col] = (1 - (series - min_val) / (max_val - min_val)) * 100
        else:
            normalized[col] = ((series - min_val) / (max_val - min_val)) * 100

    return normalized


def create_master_dataset():
    """マスターデータセット生成のメインフロー"""

    estat_df = load_estat_data()
    master = estat_df.copy()

    # 派生指標：収入対家賃比
    if "県民所得_一人当たり" in master.columns and "家賃_1畳当たり" in master.columns:
        master["収入対家賃比"] = (
            master["家賃_1畳当たり"] * 6 * 12
        ) / master["県民所得_一人当たり"] * 100

    normalized = normalize_indicators(master)

    master.to_csv("data/processed/master_47_raw.csv", encoding="utf-8-sig")
    normalized.to_csv("data/processed/master_47_normalized.csv", encoding="utf-8-sig")

    print("=" * 60)
    print("📊 Master Dataset Summary")
    print("=" * 60)
    print(f"都道府県数: {len(master)}")
    print(f"指標数: {len(master.columns)}")
    print(f"\n欠損率:")
    missing_pct = (master.isnull().sum() / len(master) * 100).round(1)
    for col, pct in missing_pct.items():
        status = "✅" if pct == 0 else "⚠️" if pct < 20 else "❌"
        print(f"  {status} {col}: {pct}%")

    return master, normalized


if __name__ == "__main__":
    raw, norm = create_master_dataset()
```

---

## 5. 実行手順チェックリスト

```
Week 1: データ収集
────────────────────────────────
□ e-Statユーザー登録 & appId取得
□ estat_collector.py で指標コード確認（list_indicators使用）
□ 指標コードの最終リスト確定（TARGETSを更新）
□ estat_collector.py 実行 → estat_indicators.csv 生成
□ 気象データ取得方法を決定（手動 or e-Stat経由）
□ 気象データ取得 → weather_data.csv 生成
□ 地価データCSVダウンロード → land_price.csv 生成

Week 2: クリーニング & 統合
────────────────────────────────
□ 各CSVのデータ品質チェック（欠損値、異常値）
□ 都道府県名の表記揺れ統一（「東京都」vs「東京」等）
□ merge_all.py 実行 → master_47.csv 生成
□ 正規化処理の方向性確認（反転指標のリスト）
□ EDA（探索的データ分析）ノートブック作成
□ データ辞書（各指標の説明・出典・年度）作成
□ GitHub に data/sources.md としてドキュメント化
```

---

## 6. 重要な落とし穴 & Tips

### 💣 よくあるハマりどころ

**1. 都道府県名の表記揺れ**

```python
PREF_NORMALIZE = {
    "東京": "東京都",
    "大阪": "大阪府",
    "京都": "京都府",
    "北海道": "北海道",
    # その他は「〜県」を付与
}
```

**2. e-StatのAPI仕様のクセ**
- レスポンスのVALUE配列で、`$` キーに数値が入っている（直感的でない）
- 欠損値は `"-"`, `"…"`, `"x"`, `""` など複数パターンがある
- 最新年度のデータが指標ごとに異なる（2020年のものもあれば2023年のものも）

**3. 文字コード問題**
- e-Stat API → UTF-8（問題なし）
- 気象庁CSV → Shift_JIS（`encoding="shift_jis"` 指定が必要）
- 国土交通省CSV → Shift_JIS が多い
- 出力は `utf-8-sig`（BOM付きUTF-8）にするとExcelでも文字化けしない

### ⚡ 効率化Tips

- e-Statの `getMetaInfo` APIを先に叩いて指標コード一覧を把握してから本番取得に入ると効率的
- 気象データは「B.自然環境」経由でe-Statから取れるものを優先し、足りない分だけ気象庁サイトから補完
- 地価データは毎年CSVで一括DL可能なので自動化の優先度は低い

---

## 付録: 推奨ディレクトリ構成

```
japan-livability-index/
├── README.md
├── .env                    # ← .gitignoreに追加！
├── .gitignore
├── requirements.txt
│
├── scripts/
│   ├── estat_collector.py  # e-Statデータ取得
│   ├── jma_collector.py    # 気象データ取得
│   ├── merge_all.py        # データ統合
│   └── utils/
│       └── pref_codes.py   # 都道府県コード定数
│
├── data/
│   ├── raw/                # 生データ（.gitignoreに追加）
│   │   ├── estat/
│   │   ├── jma/
│   │   └── mlit/
│   ├── processed/          # クリーニング済み
│   │   ├── master_47_raw.csv
│   │   └── master_47_normalized.csv
│   └── sources.md
│
├── notebooks/              # Jupyter分析用
│   ├── 01_eda.ipynb
│   └── 02_scoring.ipynb
│
├── web/                    # 可視化フロントエンド
└── docs/                   # 方法論ドキュメント
```

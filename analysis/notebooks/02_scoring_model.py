"""
Step 2: 都道府県 幸福度スコアリングモデル
収集したデータを正規化 → 加重スコア → ランキング化

Usage:
    python 02_scoring_model.py
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.preprocessing import MinMaxScaler

DATA_DIR = Path(__file__).parent.parent / "data"
RAW_DIR = DATA_DIR / "raw"
PROC_DIR = DATA_DIR / "processed"
PROC_DIR.mkdir(exist_ok=True)

# 都道府県名マスター
PREF_NAMES = {
    "01": "北海道", "02": "青森県", "03": "岩手県", "04": "宮城県",
    "05": "秋田県", "06": "山形県", "07": "福島県", "08": "茨城県",
    "09": "栃木県", "10": "群馬県", "11": "埼玉県", "12": "千葉県",
    "13": "東京都", "14": "神奈川県", "15": "新潟県", "16": "富山県",
    "17": "石川県", "18": "福井県", "19": "山梨県", "20": "長野県",
    "21": "岐阜県", "22": "静岡県", "23": "愛知県", "24": "三重県",
    "25": "滋賀県", "26": "京都府", "27": "大阪府", "28": "兵庫県",
    "29": "奈良県", "30": "和歌山県", "31": "鳥取県", "32": "島根県",
    "33": "岡山県", "34": "広島県", "35": "山口県", "36": "徳島県",
    "37": "香川県", "38": "愛媛県", "39": "高知県", "40": "福岡県",
    "41": "佐賀県", "42": "長崎県", "43": "熊本県", "44": "大分県",
    "45": "宮崎県", "46": "鹿児島県", "47": "沖縄県",
}

# ─── 指標定義 ─────────────────────────────────────────
# higher_is_better: True = 高いほど良い, False = 低いほど良い
INDICATORS = {
    # 経済力 (weight: 0.25)
    "income":          {"dim": "経済力",     "weight": 0.08, "higher_is_better": True},
    "unemployment":    {"dim": "経済力",     "weight": 0.08, "higher_is_better": False},
    "rent_income_ratio": {"dim": "経済力",   "weight": 0.09, "higher_is_better": False},

    # 生活利便性 (weight: 0.30)
    "doctors_per_100k": {"dim": "生活利便性", "weight": 0.10, "higher_is_better": True},
    "beds_per_100k":    {"dim": "生活利便性", "weight": 0.07, "higher_is_better": True},
    "commute_time":     {"dim": "生活利便性", "weight": 0.08, "higher_is_better": False},
    "restaurant_density": {"dim": "生活利便性", "weight": 0.05, "higher_is_better": True},

    # 環境快適度 (weight: 0.20)
    "sunshine_hours":   {"dim": "環境快適度", "weight": 0.07, "higher_is_better": True},
    "comfortable_days": {"dim": "環境快適度", "weight": 0.08, "higher_is_better": True},
    "disaster_freq":    {"dim": "環境快適度", "weight": 0.05, "higher_is_better": False},

    # 社会安全度 (weight: 0.10)
    "crime_rate":       {"dim": "社会安全度", "weight": 0.06, "higher_is_better": False},
    "traffic_deaths":   {"dim": "社会安全度", "weight": 0.04, "higher_is_better": False},

    # 将来性 (weight: 0.15)
    "pop_change_rate":  {"dim": "将来性",     "weight": 0.05, "higher_is_better": True},
    "youth_ratio":      {"dim": "将来性",     "weight": 0.04, "higher_is_better": True},
    "birth_rate":       {"dim": "将来性",     "weight": 0.03, "higher_is_better": True},
    "life_expectancy":  {"dim": "将来性",     "weight": 0.03, "higher_is_better": True},
}


def load_raw_data() -> pd.DataFrame:
    """収集済みの生データを読み込んでマージ"""
    # TODO: 実際のデータ読み込みロジックをここに実装
    # 現在はサンプルデータで動作確認
    np.random.seed(42)
    n = 47
    df = pd.DataFrame({
        "pref_code": [f"{i:02d}" for i in range(1, 48)],
        "pref_name": list(PREF_NAMES.values()),
    })
    for col in INDICATORS.keys():
        df[col] = np.random.randn(n) * 10 + 50
    return df


def normalize_and_score(df: pd.DataFrame) -> pd.DataFrame:
    """各指標を0-100に正規化して加重合計スコアを計算"""
    scaler = MinMaxScaler(feature_range=(0, 100))
    scored = df.copy()

    for col, meta in INDICATORS.items():
        if col not in df.columns:
            continue
        vals = df[[col]].values
        normalized = scaler.fit_transform(vals).flatten()
        # 低いほど良い指標は反転
        if not meta["higher_is_better"]:
            normalized = 100 - normalized
        scored[f"{col}_score"] = normalized

    # 次元別スコア
    dims = {}
    for col, meta in INDICATORS.items():
        dim = meta["dim"]
        if dim not in dims:
            dims[dim] = []
        dims[dim].append((col, meta["weight"]))

    for dim, items in dims.items():
        total_w = sum(w for _, w in items)
        scored[f"dim_{dim}"] = sum(
            scored[f"{col}_score"] * w / total_w for col, w in items
        )

    # 総合スコア（加重合計）
    scored["total_score"] = sum(
        scored[f"{col}_score"] * meta["weight"]
        for col, meta in INDICATORS.items()
        if col in df.columns
    )
    scored["rank"] = scored["total_score"].rank(ascending=False).astype(int)
    return scored.sort_values("rank")


def save_results(df: pd.DataFrame):
    """結果をCSV・JSONで保存"""
    csv_path = PROC_DIR / "livability_scores.csv"
    json_path = PROC_DIR / "livability_scores.json"

    df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    df[["pref_code", "pref_name", "rank", "total_score"] +
       [f"dim_{d}" for d in ["経済力", "生活利便性", "環境快適度", "社会安全度", "将来性"]]
    ].to_json(json_path, orient="records", force_ascii=False, indent=2)

    print(f"保存完了: {csv_path}")
    print(f"保存完了: {json_path}")


if __name__ == "__main__":
    print("データ読み込み中...")
    raw = load_raw_data()

    print("スコアリング中...")
    scored = normalize_and_score(raw)

    print("\n=== TOP 10 都道府県 ===")
    cols = ["rank", "pref_name", "total_score"] + [
        f"dim_{d}" for d in ["経済力", "生活利便性", "環境快適度", "社会安全度", "将来性"]
    ]
    print(scored[cols].head(10).to_string(index=False))

    save_results(scored)

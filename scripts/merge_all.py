"""
merge_all.py
全データソースを統合して livability_scores.json を生成

Usage:
    python scripts/merge_all.py
"""

import os
import json
import pandas as pd
import numpy as np

# ─── 「低いほど良い」指標（反転）─────────────────────────────────────────────
INVERSE_INDICATORS = [
    "完全失業率",
    "月間実労働時間",      # 高い = 長時間労働 = 悪い
    "家賃_1畳当たり",
    "自動車保有台数",      # 高い = 公共交通依存度大（地方型） = 利便性低
    "物価地域差指数",      # 高い = 生活コスト高 = 悪い
    "年間降水量",
    "犯罪発生率",
    "交通事故発生率",
    "高齢化率",
]

# ─── 次元定義 ─────────────────────────────────────────────────────────────────
DIM_INDICATORS = {
    "経済・労働": [
        "県民所得_一人当たり",
        "完全失業率",        # 反転
        "有効求人倍率",
        "月間実労働時間",    # 反転（男女平均）
    ],
    "居住・利便性": [
        "自動車保有台数",    # 反転: 低=公共交通充実の都市型
        "持ち家比率",
        "住宅延べ面積",
        "家賃_1畳当たり",   # 反転
        "物価地域差指数",   # 反転: 家賃除く生活コスト
    ],
    "環境・安全": [
        "年間日照時間",
        "年間降水量",        # 反転
        "犯罪発生率",        # 反転
        "交通事故発生率",    # 反転
    ],
    "医療・教育": [
        "病院数_人口10万対",
        "医師数_人口10万対",
        "保育所等数",        # 子育て環境
        "大学進学率",        # 地域の教育機会
    ],
    "将来性": [
        "人口増減率",
        "高齢化率",          # 反転
        "大学数_人口10万対", # 知的産業基盤・若者定着
    ],
}

PREF_ORDER = [
    "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県",
    "栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県",
    "石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県",
    "滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県",
    "岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県",
    "佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県",
]


def load_estat(path="data/raw/estat/estat_indicators.csv") -> pd.DataFrame:
    df = pd.read_csv(path, index_col=0, encoding="utf-8-sig")
    df = df[df.index != "全国"]
    if len(df) != 47:
        import warnings
        warnings.warn(f"期待47行 → 実際{len(df)}行", UserWarning, stacklevel=2)
    return df


def add_derived(df: pd.DataFrame) -> pd.DataFrame:
    """派生指標を追加"""
    # 月間実労働時間: 男女平均
    if "月間実労働時間_男" in df.columns and "月間実労働時間_女" in df.columns:
        df["月間実労働時間"] = (df["月間実労働時間_男"] + df["月間実労働時間_女"]) / 2
        df = df.drop(columns=["月間実労働時間_男", "月間実労働時間_女"])
    elif "月間実労働時間_男" in df.columns:
        df["月間実労働時間"] = df["月間実労働時間_男"]
        df = df.drop(columns=["月間実労働時間_男"])
    return df


def normalize(df: pd.DataFrame) -> pd.DataFrame:
    norm = pd.DataFrame(index=df.index)
    for col in df.columns:
        s = df[col].dropna()
        if len(s) == 0:
            norm[col] = np.nan
            continue
        lo, hi = s.min(), s.max()
        if hi == lo:
            norm[col] = 50.0
        elif col in INVERSE_INDICATORS:
            norm[col] = (1 - (df[col] - lo) / (hi - lo)) * 100
        else:
            norm[col] = ((df[col] - lo) / (hi - lo)) * 100
    return norm


def run():
    raw = load_estat()
    raw = add_derived(raw)
    norm = normalize(raw)

    os.makedirs("data/processed", exist_ok=True)
    os.makedirs("web/data", exist_ok=True)

    raw.to_csv("data/processed/master_47_raw.csv", encoding="utf-8-sig")
    norm.to_csv("data/processed/master_47_normalized.csv", encoding="utf-8-sig")

    records = norm.reset_index().rename(columns={"都道府県": "pref_name"})
    code_map = {name: str(i + 1).zfill(2) for i, name in enumerate(PREF_ORDER)}
    records["pref_code"] = records["pref_name"].map(code_map)

    # 次元スコアを計算（各次元内指標の等重平均）
    for dim_name, indicators in DIM_INDICATORS.items():
        cols = [c for c in indicators if c in norm.columns]
        missing = [c for c in indicators if c not in norm.columns]
        if missing:
            print(f"  [WARN] {dim_name}: 欠損指標 {missing}")
        if cols:
            records[f"dim_{dim_name}"] = norm[cols].mean(axis=1).round(1).values
        else:
            records[f"dim_{dim_name}"] = 50.0

    records.to_json(
        "web/data/livability_scores.json",
        orient="records",
        force_ascii=False,
        indent=2,
    )

    print("=" * 60)
    print(f"都道府県数: {len(raw)}")
    print(f"指標数: {len(raw.columns)}")
    print("\n欠損率:")
    for col, pct in (raw.isnull().sum() / len(raw) * 100).round(1).items():
        icon = "OK" if pct == 0 else "WARN" if pct < 20 else "FAIL"
        print(f"  [{icon}] {col}: {pct}%")

    # 次元スコアサマリー
    print("\n次元スコアサマリー:")
    for dim_name in DIM_INDICATORS:
        col = f"dim_{dim_name}"
        vals = records[col]
        top = records.nlargest(1, col).iloc[0]
        print(f"  {dim_name:12s}  mean={vals.mean():.1f}  std={vals.std():.1f}"
              f"  top: {top['pref_name']} ({top[col]:.1f})")

    print("\n保存: web/data/livability_scores.json")


if __name__ == "__main__":
    run()

"""
merge_all_city.py
市区町村別データを正規化して web/data/city_scores.json を生成

Usage:
    python scripts/merge_all_city.py

前提: scripts/estat_collector_city.py 実行済み
     data/raw/estat/estat_city_indicators.csv が存在すること
"""

import os
import json
import pandas as pd
import numpy as np

# 「低いほど良い」指標 → 反転
INVERSE_CITY = ["65歳以上割合", "1畳当たり家賃"]

# 市区町村レベルで集計する次元 (county-level dims)
# 利用可能な指標から将来性・生活利便性のみ計算
CITY_DIM_INDICATORS = {
    "将来性":     ["人口増減率", "転入超過率", "65歳以上割合"],   # 65歳以上割合は反転
    "生活利便性": ["住宅延べ面積", "1畳当たり家賃"],              # 家賃は反転（低いほど良い）
}

# 都道府県順序（pref_code 付与用）
PREF_ORDER = [
    "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県",
    "栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県",
    "石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県",
    "滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県",
    "岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県",
    "佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県",
]
PREF_NAME_MAP = {str(i + 1).zfill(2): name for i, name in enumerate(PREF_ORDER)}


def load_city_raw(path="data/raw/estat/estat_city_indicators.csv") -> pd.DataFrame:
    df = pd.read_csv(path, index_col=0, encoding="utf-8-sig")
    # city_code が index、pref_code と city_name は通常の列
    return df


def normalize_city(df: pd.DataFrame) -> pd.DataFrame:
    """指標を 0-100 に正規化（都道府県全体で正規化）"""
    norm = pd.DataFrame(index=df.index)
    indicator_cols = [c for c in df.columns if c not in ("pref_code", "city_name")]

    for col in indicator_cols:
        s = df[col].dropna()
        if len(s) == 0:
            norm[col] = np.nan
            continue
        lo, hi = s.min(), s.max()
        if hi == lo:
            norm[col] = 50.0
        elif col in INVERSE_CITY:
            norm[col] = (1 - (df[col] - lo) / (hi - lo)) * 100
        else:
            norm[col] = ((df[col] - lo) / (hi - lo)) * 100

    return norm


def run():
    csv_path = "data/raw/estat/estat_city_indicators.csv"
    if not os.path.exists(csv_path):
        print(f"ERROR: {csv_path} が見つかりません。")
        print("先に scripts/estat_collector_city.py を実行してください。")
        return

    raw = load_city_raw(csv_path)
    indicator_cols = [c for c in raw.columns if c not in ("pref_code", "city_name")]
    norm = normalize_city(raw)

    os.makedirs("web/data", exist_ok=True)

    # 次元スコア計算
    records = []
    for city_code, row in norm.iterrows():
        pref_code = raw.loc[city_code, "pref_code"] if "pref_code" in raw.columns else str(city_code)[:2]
        city_name = raw.loc[city_code, "city_name"] if "city_name" in raw.columns else str(city_code)

        entry = {
            "city_code": str(city_code).zfill(5),
            "city_name": city_name,
            "pref_code": str(pref_code).zfill(2),
            "pref_name": PREF_NAME_MAP.get(str(pref_code).zfill(2), ""),
        }

        # 各次元スコア（利用可能な指標の平均）
        for dim_name, indicators in CITY_DIM_INDICATORS.items():
            cols = [c for c in indicators if c in norm.columns and not pd.isna(row.get(c))]
            if cols:
                entry[f"dim_{dim_name}"] = round(float(row[cols].mean()), 1)
            # なければキー自体入れない（app.js 側で欠損を許容）

        records.append(entry)

    # pref_code でグループ化してランク付け
    # ランクは都道府県内での暫定ランク（利用可能な次元の平均スコア）
    df_out = pd.DataFrame(records)

    # 利用可能な次元列
    dim_cols = [c for c in df_out.columns if c.startswith("dim_")]
    if dim_cols:
        df_out["total_score"] = df_out[dim_cols].mean(axis=1).round(1)
    else:
        df_out["total_score"] = 50.0

    # 都道府県内ランク
    df_out["rank_in_pref"] = df_out.groupby("pref_code")["total_score"].rank(
        ascending=False, method="min"
    ).astype("Int64")

    # 全国ランク
    df_out = df_out.sort_values("total_score", ascending=False).reset_index(drop=True)
    df_out["rank"] = df_out["total_score"].rank(ascending=False, method="min").astype("Int64")

    out_path = "web/data/city_scores.json"
    df_out.to_json(out_path, orient="records", force_ascii=False, indent=2)

    print("=" * 50)
    print(f"市区町村数: {len(df_out)}")
    print(f"指標数: {len(indicator_cols)}")
    print(f"次元数: {len(dim_cols)}")
    print(f"\n都道府県別サンプル (全国TOP5):")
    for _, row in df_out.head(5).iterrows():
        print(f"  {row['city_name']} ({row['pref_name']}) score={row['total_score']}")
    print(f"\n保存: {out_path}")


if __name__ == "__main__":
    run()

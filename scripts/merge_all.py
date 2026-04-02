"""
merge_all.py
全データソースを統合して master_47.csv を生成

Usage:
    python scripts/merge_all.py
"""

import pandas as pd
import numpy as np

# 「低いほど良い」指標 → スコア計算時に反転
INVERSE_INDICATORS = [
    "完全失業率",
    "犯罪発生率",
    "交通事故発生率",
    "高齢化率",
    "家賃_1畳当たり",
    "収入対家賃比",
    # 自動車保有台数: 低い = 公共交通が充実（都市部）= 生活利便性が高い
    "自動車保有台数",
]


def load_estat(path="data/raw/estat/estat_indicators.csv") -> pd.DataFrame:
    df = pd.read_csv(path, index_col=0, encoding="utf-8-sig")
    df = df[df.index != "全国"]
    if len(df) != 47:
        import warnings
        warnings.warn(f"期待47行 → 実際{len(df)}行（データ確認が必要です）", UserWarning, stacklevel=2)
    return df


def add_derived(df: pd.DataFrame) -> pd.DataFrame:
    """派生指標を追加"""
    if "県民所得_一人当たり" in df.columns and "家賃_1畳当たり" in df.columns:
        # 6畳 × 12ヶ月の概算年間家賃 / 県民所得
        df["収入対家賃比"] = (df["家賃_1畳当たり"] * 6 * 12) / df["県民所得_一人当たり"] * 100
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

    import os, json
    os.makedirs("data/processed", exist_ok=True)
    os.makedirs("web/data", exist_ok=True)

    raw.to_csv("data/processed/master_47_raw.csv", encoding="utf-8-sig")
    norm.to_csv("data/processed/master_47_normalized.csv", encoding="utf-8-sig")

    # web 向け JSON（app.js が fetch する）
    records = norm.reset_index().rename(columns={"都道府県": "pref_name"})
    # pref_code を付与（pref_codes.py の順序に合わせて 01-47）
    pref_order = [
        "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県",
        "栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県",
        "石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県",
        "滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県",
        "岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県",
        "佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県",
    ]
    code_map = {name: str(i + 1).zfill(2) for i, name in enumerate(pref_order)}
    records["pref_code"] = records["pref_name"].map(code_map)

    # 次元集計: 指標を次元ごとに平均してdim_カラムを追加
    # 生活利便性の再設計（2026-04）:
    #   旧: 住宅規模・所有率・家賃のみ → 東京11.7点（最下位圏）
    #   新: 公共交通アクセス（自動車保有の逆数）を追加し、住宅関連指標と並列評価
    #   → 東京は交通面でHIGH、住宅面でLOW → バランスのとれたミドルレンジへ
    # 医療指標（病院数・医師数）は独立して集計するが次元には不含（将来的な拡張用）
    DIM_INDICATORS = {
        "経済力":     ["県民所得_一人当たり", "完全失業率", "有効求人倍率"],
        "生活利便性": ["自動車保有台数",       # 反転: 低=公共交通充実
                       "持ち家比率",           # 高=住宅安定性
                       "住宅延べ面積",         # 高=居住空間
                       "家賃_1畳当たり",       # 反転: 低=住宅コスト低
                       "収入対家賃比"],        # 反転: 低=実質負担小
        "環境快適度": ["年間日照時間", "年間降水量"],
        "社会安全度": ["犯罪発生率", "交通事故発生率",
                       "病院数_人口10万対",    # 医療アクセス（安全・安心）
                       "医師数_人口10万対"],   # 医療アクセス（安全・安心）
        "将来性":     ["人口増減率", "転入超過率", "高齢化率"],
    }
    for dim_name, indicators in DIM_INDICATORS.items():
        cols = [c for c in indicators if c in norm.columns]
        if cols:
            records[f"dim_{dim_name}"] = norm[cols].mean(axis=1).round(1).values
        else:
            records[f"dim_{dim_name}"] = 50.0  # 全指標欠損時は中央値

    records.to_json("web/data/livability_scores.json", orient="records",
                    force_ascii=False, indent=2)

    print("=" * 50)
    print(f"都道府県数: {len(raw)}")
    print(f"指標数: {len(raw.columns)}")
    print("\n欠損率:")
    for col, pct in (raw.isnull().sum() / len(raw) * 100).round(1).items():
        icon = "✅" if pct == 0 else "⚠️" if pct < 20 else "❌"
        print(f"  {icon} {col}: {pct}%")
    print("\n保存: data/processed/master_47_raw.csv")
    print("保存: data/processed/master_47_normalized.csv")
    print("保存: web/data/livability_scores.json")


if __name__ == "__main__":
    run()

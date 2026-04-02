"""
Step 1: e-Stat API からデータ収集
都道府県別の各指標データを取得してCSVに保存する

Usage:
    1. e-Stat にアカウント登録: https://www.e-stat.go.jp/mypage/user/preregister
    2. appId を取得して .env に設定: ESTAT_API_KEY=your_app_id
    3. python 01_data_collection.py
"""

import os
import time
import requests
import pandas as pd
from pathlib import Path

# ─── 設定 ───────────────────────────────────────────────
API_KEY = os.environ.get("ESTAT_API_KEY", "")
BASE_URL = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"
OUT_DIR = Path(__file__).parent.parent / "data" / "raw"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 47都道府県コード (01=北海道 ... 47=沖縄)
PREF_CODES = [f"{i:02d}" for i in range(1, 48)]

# ─── 取得する統計IDとパラメータ ──────────────────────────
# ※ 実際のコードはe-Stat APIテストフォームで確認してください
# https://www.e-stat.go.jp/api/api-info/e-stat-api
STATS_TARGETS = [
    {
        "name": "income",
        "label": "平均年収",
        "stats_data_id": "0003005103",  # ※ 要確認
        "cdCat01": "",                   # カテゴリコード
    },
    {
        "name": "doctors_per_100k",
        "label": "医師数(人口10万対)",
        "stats_data_id": "0003265976",  # ※ 要確認
        "cdCat01": "",
    },
    {
        "name": "crime_rate",
        "label": "刑法犯認知件数(人口比)",
        "stats_data_id": "0003013034",  # ※ 要確認
        "cdCat01": "",
    },
    {
        "name": "population_change",
        "label": "人口増減率",
        "stats_data_id": "0003445100",  # ※ 要確認
        "cdCat01": "",
    },
    {
        "name": "life_expectancy",
        "label": "平均寿命",
        "stats_data_id": "0003215870",  # ※ 要確認
        "cdCat01": "",
    },
]


def fetch_estat(stats_data_id: str, cd_area: str = "", cd_cat01: str = "") -> dict:
    """e-Stat API から統計データを取得"""
    params = {
        "appId": API_KEY,
        "statsDataId": stats_data_id,
        "cdArea": cd_area,
        "metaGetFlg": "Y",
        "cntGetFlg": "N",
        "explanationGetFlg": "Y",
        "annotationGetFlg": "Y",
        "sectionHeaderFlg": "1",
        "replaceSpChars": "0",
    }
    if cd_cat01:
        params["cdCat01"] = cd_cat01

    r = requests.get(BASE_URL, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def parse_pref_data(json_data: dict) -> pd.DataFrame:
    """APIレスポンスを都道府県別DataFrameに変換"""
    try:
        values = json_data["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]
        if isinstance(values, dict):
            values = [values]
        df = pd.DataFrame(values)
        return df
    except KeyError as e:
        print(f"  Warning: parse error - {e}")
        return pd.DataFrame()


def list_indicators(stats_data_id: str):
    """指定統計のメタデータ（指標一覧）を表示"""
    params = {
        "appId": API_KEY,
        "statsDataId": stats_data_id,
        "metaGetFlg": "Y",
        "cntGetFlg": "Y",
    }
    r = requests.get(BASE_URL, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    # CLASS_OBJ を表示
    class_obj = (
        data.get("GET_STATS_DATA", {})
        .get("STATISTICAL_DATA", {})
        .get("CLASS_INF", {})
        .get("CLASS_OBJ", [])
    )
    for obj in class_obj:
        print(f"\n== {obj.get('@name')} ({obj.get('@id')}) ==")
        classes = obj.get("CLASS", [])
        if isinstance(classes, dict):
            classes = [classes]
        for c in classes[:10]:
            print(f"  {c.get('@code')}: {c.get('@name')}")


def collect_all():
    """全指標を収集してCSVに保存"""
    if not API_KEY:
        print("ERROR: ESTAT_API_KEY が設定されていません")
        print("  export ESTAT_API_KEY=your_app_id")
        return

    master_df = pd.DataFrame({"pref_code": PREF_CODES})

    for target in STATS_TARGETS:
        name = target["name"]
        label = target["label"]
        stats_id = target["stats_data_id"]
        print(f"\n[{name}] {label} を取得中...")

        try:
            data = fetch_estat(stats_id, cd_cat01=target.get("cdCat01", ""))
            df = parse_pref_data(data)

            raw_path = OUT_DIR / f"{name}.json"
            import json
            with open(raw_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"  -> 保存: {raw_path}")

            time.sleep(0.5)  # API rate limit

        except Exception as e:
            print(f"  ERROR: {e}")

    print("\n完了!")


if __name__ == "__main__":
    # まずメタデータ確認
    # list_indicators("0003005103")

    # 本収集
    collect_all()

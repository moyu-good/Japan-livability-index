"""
estat_collector_city.py
e-Stat API から市区町村別データを一括取得するスクリプト

取得指標:
  - 人口増減率      (0000020301 A表市区町村: 将来性)
  - 転入超過率      (0000020301 A表市区町村: 将来性)
  - 65歳以上割合    (0000020301 A表市区町村: 将来性・反転)
  - 住宅延べ面積    (0000020108 H表市区町村: 生活利便性)
  - 1畳当たり家賃   (0000020108 H表市区町村: 生活利便性)
  - 病院数_人口10万対 (0000020309 I表市区町村: 医療・教育)
  - 刑法犯発生率    (0000020311 K表市区町村: 環境・安全・反転)
  - 小学校数        (0000020305 E表市区町村: 医療・教育)

Usage:
    python scripts/estat_collector_city.py
"""

import os
import json
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import pandas as pd
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

ESTAT_APP_ID = os.getenv("ESTAT_APP_ID")
BASE_URL = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData"

# 市区町村レベルで取得可能な指標
# 0000020301: 社会・人口統計体系 A表 市区町村別（lvArea 不要）
# 0000020108: 社会・人口統計体系 H表 市区町村別（lvArea 不要）
CITY_TARGETS = {
    # A表市区町村 (0000020301)
    "人口増減率":     {"statsDataId": "0000020301", "cdCat01": "#A05101"},
    "転入超過率":     {"statsDataId": "0000020301", "cdCat01": "#A05301"},
    "65歳以上割合":   {"statsDataId": "0000020301", "cdCat01": "#A03506"},
    # H表市区町村 (0000020108)
    "住宅延べ面積":   {"statsDataId": "0000020108", "cdCat01": "H2130"},
    "1畳当たり家賃":  {"statsDataId": "0000020108", "cdCat01": "H4104"},
    # I表市区町村 (0000020309) - 医療
    "病院数_人口10万対": {"statsDataId": "0000020309", "cdCat01": "#I0910103"},
    # K表市区町村 (0000020311) - 安全
    "刑法犯発生率":   {"statsDataId": "0000020311", "cdCat01": "#K04101"},
    # E表市区町村 (0000020305) - 教育（面積100km²当たり）
    "小学校数":       {"statsDataId": "0000020305", "cdCat01": "#E0110201"},
}


def _session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1.0,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    return session


def fetch_city_data(stats_data_id: str, cd_cat01: str) -> tuple[dict, str | None]:
    """市区町村別データを取得"""
    base_params = {
        "appId":       ESTAT_APP_ID,
        "statsDataId": stats_data_id,
        "cdCat01":     cd_cat01,
        "metaGetFlg":  "Y",
        "limit":       "100000",
    }

    all_values: list = []
    area_map: dict  = {}
    start_position  = 1

    while True:
        params = {**base_params, "startPosition": start_position}
        response = _session().get(BASE_URL, params=params, timeout=30)
        data = response.json()

        result_info = data.get("GET_STATS_DATA", {}).get("RESULT", {})
        status = result_info.get("STATUS", -1)
        if status >= 100:
            raise ValueError(f"APIエラー[{status}]: {result_info.get('ERROR_MSG', '不明')}")
        if status == 1:
            return {}, None

        stat_data = data["GET_STATS_DATA"]["STATISTICAL_DATA"]

        # 地域コード → 地域名マッピング（初回のみ）
        if not area_map:
            for cls in stat_data.get("CLASS_INF", {}).get("CLASS_OBJ", []):
                if isinstance(cls, dict) and cls.get("@id") == "area":
                    codes = cls["CLASS"]
                    if isinstance(codes, dict):
                        codes = [codes]
                    for c in codes:
                        area_map[c["@code"]] = c["@name"]

        data_inf = stat_data.get("DATA_INF", {})
        values = data_inf.get("VALUE", [])
        if isinstance(values, dict):
            values = [values]
        all_values.extend(values)

        next_key = stat_data.get("RESULT_INF", {}).get("NEXT_KEY")
        if not next_key:
            break
        start_position = int(next_key)

    if not all_values:
        return {}, None

    # 最新年度
    time_groups: dict = {}
    for v in all_values:
        t = v.get("@time", "")
        time_groups.setdefault(t, []).append(v)
    latest_time = sorted(time_groups.keys(), reverse=True)[0]

    result = {}
    for v in time_groups[latest_time]:
        area_code = v.get("@area", "")
        value_str = v.get("$", "")
        # 市区町村レベル: 5桁コード、末尾が "000" 以外、全国 (00000) を除く
        if (len(area_code) == 5
                and area_code != "00000"
                and not area_code.endswith("000")):
            city_name = area_map.get(area_code, area_code)
            try:
                result[area_code] = {
                    "name":  city_name,
                    "value": float(value_str)
                    if value_str not in ("", "-", "…", "x", "X")
                    else None
                }
            except (ValueError, TypeError):
                result[area_code] = {"name": city_name, "value": None}

    return result, latest_time


def collect_all():
    if not ESTAT_APP_ID:
        print("ERROR: ESTAT_APP_ID が未設定です")
        return

    print("市区町村別データ 収集開始\n")

    # 指標ごとに収集 → {city_code: {name, indicator_value}} の形に整形
    all_data: dict[str, dict] = {}   # city_code → {name, 指標1, 指標2, ...}
    metadata: dict = {}

    for name, cfg in tqdm(CITY_TARGETS.items(), desc="指標取得中"):
        tqdm.write(f"  {name} ...")
        try:
            result, year = fetch_city_data(cfg["statsDataId"], cfg["cdCat01"])
            metadata[name] = {
                "statsDataId": cfg["statsDataId"],
                "cdCat01":     cfg["cdCat01"],
                "data_year":   year,
                "count":       len([v for v in result.values() if v["value"] is not None]),
            }
            for code, entry in result.items():
                if code not in all_data:
                    all_data[code] = {"city_name": entry["name"]}
                all_data[code][name] = entry["value"]
            tqdm.write(f"    OK {len(result)} 件 ({year})")
        except Exception as e:
            tqdm.write(f"    NG {e}")
            metadata[name] = {"error": str(e)}
        time.sleep(1)

    if not all_data:
        print("データが取得できませんでした。")
        return

    # DataFrame に変換
    rows = []
    for code, entry in all_data.items():
        row = {"city_code": code, "pref_code": code[:2], **entry}
        rows.append(row)
    df = pd.DataFrame(rows).set_index("city_code")
    df.index.name = "city_code"

    out_dir = "data/raw/estat"
    os.makedirs(out_dir, exist_ok=True)
    df.to_csv(f"{out_dir}/estat_city_indicators.csv", encoding="utf-8-sig")

    with open(f"{out_dir}/estat_city_metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"\n保存: {out_dir}/estat_city_indicators.csv")
    print(f"都市数: {len(df)}, 指標数: {len([c for c in df.columns if c not in ['pref_code','city_name']])}")
    print("\n欠損率:")
    for col in [c for c in df.columns if c not in ["pref_code", "city_name"]]:
        pct = df[col].isnull().sum() / len(df) * 100
        icon = "OK" if pct == 0 else "warn" if pct < 30 else "NG"
        print(f"  [{icon}] {col}: {pct:.1f}%")


if __name__ == "__main__":
    collect_all()

"""
estat_collector.py
e-Stat APIから都道府県別データを一括取得するスクリプト

Usage:
    export ESTAT_APP_ID=your_app_id   # または .env ファイルに記載
    python scripts/estat_collector.py
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
META_URL = "https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo"

TARGETS = {
    # A表: 人口・世帯 (0000010201)
    "人口増減率":           {"statsDataId": "0000010201", "cdCat01": "#A05101"},
    "高齢化率":             {"statsDataId": "0000010201", "cdCat01": "#A03503"},
    "転入超過率":           {"statsDataId": "0000010201", "cdCat01": "#A05301"},
    # B表: 自然環境 (0000010202)
    "年間日照時間":         {"statsDataId": "0000010202", "cdCat01": "#B02401"},
    "年間降水量":           {"statsDataId": "0000010202", "cdCat01": "#B02402"},
    # C表: 経済基盤 (0000010203)
    "県民所得_一人当たり":  {"statsDataId": "0000010203", "cdCat01": "#C01321"},
    # F表: 労働 (0000010206)
    "完全失業率":           {"statsDataId": "0000010206", "cdCat01": "#F01301"},
    "有効求人倍率":         {"statsDataId": "0000010206", "cdCat01": "#F03103"},
    # H表: 居住 (0000010208)
    "持ち家比率":           {"statsDataId": "0000010208", "cdCat01": "#H01301"},
    "住宅延べ面積":         {"statsDataId": "0000010208", "cdCat01": "#H0210301"},
    "家賃_1畳当たり":       {"statsDataId": "0000010208", "cdCat01": "#H04102"},
    # I表: 健康・医療 (0000010209)
    "病院数_人口10万対":    {"statsDataId": "0000010209", "cdCat01": "#I0910103"},
    "医師数_人口10万対":    {"statsDataId": "0000010209", "cdCat01": "#I0920101"},
    # K表: 安全 (0000010211)
    "犯罪発生率":           {"statsDataId": "0000010211", "cdCat01": "#K06101"},
    "交通事故発生率":       {"statsDataId": "0000010211", "cdCat01": "#K04101"},
    # L表: 家計・物価 (0000010212)
    # 自動車保有台数の逆数 = 公共交通利便性の代理指標
    # 都市部（東京・大阪・京都）は低い → 公共交通が充実 → 反転後はHIGHスコア
    "自動車保有台数":       {"statsDataId": "0000010212", "cdCat01": "#L03607"},
}


def _session() -> requests.Session:
    """リトライ付きHTTPセッションを生成（ネットワーク障害・5xx に対して最大3回）"""
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1.0,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def fetch_estat_data(stats_data_id: str, cd_cat01: str):
    """e-Stat APIから指定統計・指標の都道府県別データを取得。

    ページネーション対応: NEXT_KEY が返る限り全件取得する。
    """
    base_params = {
        "appId": ESTAT_APP_ID,
        "statsDataId": stats_data_id,
        "cdCat01": cd_cat01,
        "lvArea": "2",        # 都道府県レベルのみ（1=全国, 3=市区町村 を除外）
        "metaGetFlg": "Y",
        "limit": "100000",
    }

    all_values: list = []
    area_map: dict = {}
    latest_time: str | None = None
    start_position = 1

    while True:
        params = {**base_params, "startPosition": start_position}
        response = _session().get(BASE_URL, params=params, timeout=30)
        data = response.json()

        result_info = data.get("GET_STATS_DATA", {}).get("RESULT", {})
        status = result_info.get("STATUS", -1)
        # 仕様: 0=正常, 1=該当なし(正常), 2=一部なし(正常), 100以上=エラー
        if status >= 100:
            raise ValueError(f"APIエラー[{status}]: {result_info.get('ERROR_MSG', '不明')}")
        if status == 1:
            # 該当データなし（正常終了）
            return {}, None

        stat_data = data["GET_STATS_DATA"]["STATISTICAL_DATA"]

        # 地域コード → 地域名マッピング（初回のみ構築）
        if not area_map:
            for cls in stat_data.get("CLASS_INF", {}).get("CLASS_OBJ", []):
                if isinstance(cls, dict) and cls.get("@id") == "area":
                    codes = cls["CLASS"]
                    if isinstance(codes, dict):
                        codes = [codes]
                    for c in codes:
                        area_map[c["@code"]] = c["@name"]

        # 数値データを蓄積
        data_inf = stat_data.get("DATA_INF", {})
        values = data_inf.get("VALUE", [])
        if isinstance(values, dict):
            values = [values]
        all_values.extend(values)

        # ページネーション: NEXT_KEY がなければ終了
        next_key = stat_data.get("RESULT_INF", {}).get("NEXT_KEY")
        if not next_key:
            break
        start_position = int(next_key)

    if not all_values:
        return {}, None

    # 最新年度を選択
    time_groups: dict = {}
    for v in all_values:
        t = v.get("@time", "")
        time_groups.setdefault(t, []).append(v)
    latest_time = sorted(time_groups.keys(), reverse=True)[0]

    result = {}
    for v in time_groups[latest_time]:
        area_code = v.get("@area", "")
        value_str = v.get("$", "")
        # 都道府県レベル（5桁コード、末尾000、全国=00000 を除く）
        if len(area_code) == 5 and area_code.endswith("000") and area_code != "00000":
            pref_name = area_map.get(area_code, area_code)
            try:
                result[pref_name] = float(value_str) if value_str not in ("", "-", "…", "x", "X") else None
            except (ValueError, TypeError):
                result[pref_name] = None

    return result, latest_time


def list_indicators(stats_data_id: str):
    """統計表の指標一覧を表示（cdCat01 確認用）"""
    params = {"appId": ESTAT_APP_ID, "statsDataId": stats_data_id}
    data = _session().get(META_URL, params=params, timeout=30).json()
    meta = data["GET_META_INFO"]["METADATA_INF"]["CLASS_INF"]["CLASS_OBJ"]
    for cls in meta:
        if cls["@id"] == "cat01":
            codes = cls["CLASS"]
            if isinstance(codes, dict):
                codes = [codes]
            for c in codes:
                print(f"  {c['@code']:15s} | {c['@name']}")


def collect_all():
    """全指標を収集してCSV + メタデータJSONを保存"""
    if not ESTAT_APP_ID:
        print("ERROR: ESTAT_APP_ID が未設定です（.env に記載してください）")
        return

    all_data: dict = {}
    metadata: dict = {}

    for name, cfg in tqdm(TARGETS.items(), desc="指標取得中"):
        print(f"\n  {name} ...")
        try:
            result, year = fetch_estat_data(cfg["statsDataId"], cfg["cdCat01"])
            all_data[name] = result
            metadata[name] = {
                "statsDataId": cfg["statsDataId"],
                "cdCat01": cfg["cdCat01"],
                "data_year": year,
                "count": len([v for v in result.values() if v is not None]),
            }
            print(f"    ✅ {len(result)} 件（{year}）")
        except Exception as e:
            print(f"    ❌ {e}")
            all_data[name] = {}
            metadata[name] = {"error": str(e)}
        time.sleep(1)

    df = pd.DataFrame(all_data)
    df.index.name = "都道府県"

    out_dir = "data/raw/estat"
    os.makedirs(out_dir, exist_ok=True)
    df.to_csv(f"{out_dir}/estat_indicators.csv", encoding="utf-8-sig")
    with open(f"{out_dir}/estat_metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"\n保存: {out_dir}/estat_indicators.csv  ({len(df)}行 × {len(df.columns)}列)")
    print("\n欠損値:")
    print(df.isnull().sum())


if __name__ == "__main__":
    # 指標コード確認用（本番前に実行して cdCat01 を確認）
    # list_indicators("0000010209")  # I.健康・医療
    # list_indicators("0000010202")  # B.自然環境
    # list_indicators("0000010208")  # H.居住

    collect_all()

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

# ─── 指標定義 ────────────────────────────────────────────────────────────────
# 5次元 × 20指標（2026-04 改訂）
#
# 変更点:
#   追加: 月間実労働時間, 消費者物価地域差指数, 保育所等数, 大学進学率, 大学数
#   削除: 転入超過率（人口増減率と高相関で冗長）, 収入対家賃比（派生指標で冗長）
#   改名: 次元を実態に合わせて更新
# ─────────────────────────────────────────────────────────────────────────────
TARGETS = {
    # ── 経済・労働 ──────────────────────────────────────────────────────────
    # C表: 経済基盤 (0000010203)
    "県民所得_一人当たり":    {"statsDataId": "0000010203", "cdCat01": "#C01321"},
    # F表: 労働 (0000010206)
    "完全失業率":             {"statsDataId": "0000010206", "cdCat01": "#F01301"},
    "有効求人倍率":           {"statsDataId": "0000010206", "cdCat01": "#F03103"},
    "月間実労働時間_男":      {"statsDataId": "0000010206", "cdCat01": "#F0610103"},
    "月間実労働時間_女":      {"statsDataId": "0000010206", "cdCat01": "#F0610104"},

    # ── 居住・利便性 ────────────────────────────────────────────────────────
    # H表: 居住 (0000010208)
    "持ち家比率":             {"statsDataId": "0000010208", "cdCat01": "#H01301"},
    "住宅延べ面積":           {"statsDataId": "0000010208", "cdCat01": "#H0210301"},
    "家賃_1畳当たり":         {"statsDataId": "0000010208", "cdCat01": "#H04102"},
    # L表: 消費・物価 (0000010212)
    # 自動車保有台数: 低い = 公共交通依存度が低い都市部 → 反転後HIGHスコア
    "自動車保有台数":         {"statsDataId": "0000010212", "cdCat01": "#L03607"},
    # 消費者物価地域差指数（家賃を除く総合）: 低い = 生活コストが安い
    "物価地域差指数":         {"statsDataId": "0000010212", "cdCat01": "#L04415"},
    # F表: 労働 (0000010206) — 都市度・利便性の代理指標
    # 第3次産業就業者割合: 高い = サービス・商業充実（商業施設密度の代理）
    "第3次産業就業者割合":    {"statsDataId": "0000010206", "cdCat01": "#F01203"},
    # 都市部通勤者割合: 高い = 都市へのアクセス良好（公共交通便利性の代理）
    "都市部通勤者割合":       {"statsDataId": "0000010206", "cdCat01": "#F02701"},

    # ── 環境・安全 ──────────────────────────────────────────────────────────
    # B表: 自然環境 (0000010202)
    "年間日照時間":           {"statsDataId": "0000010202", "cdCat01": "#B02401"},
    "年間降水量":             {"statsDataId": "0000010202", "cdCat01": "#B02402"},
    # K表: 安全 (0000010211)
    "犯罪発生率":             {"statsDataId": "0000010211", "cdCat01": "#K06101"},
    "交通事故発生率":         {"statsDataId": "0000010211", "cdCat01": "#K04101"},

    # ── 医療・教育 ──────────────────────────────────────────────────────────
    # I表: 健康・医療 (0000010209)
    "病院数_人口10万対":      {"statsDataId": "0000010209", "cdCat01": "#I0910103"},
    "医師数_人口10万対":      {"statsDataId": "0000010209", "cdCat01": "#I0920101"},
    # E表: 教育 (0000010205)
    # 保育所等数（0〜5歳人口10万人当たり）: 子育て環境の代理指標
    "保育所等数":             {"statsDataId": "0000010205", "cdCat01": "#E0110105"},
    # 高等学校卒業者の進学率: 地域の教育水準・機会
    "大学進学率":             {"statsDataId": "0000010205", "cdCat01": "#E09402"},

    # ── 将来性 ──────────────────────────────────────────────────────────────
    # A表: 人口・世帯 (0000010201)
    "人口増減率":             {"statsDataId": "0000010201", "cdCat01": "#A05101"},
    "高齢化率":               {"statsDataId": "0000010201", "cdCat01": "#A03503"},
    # E表: 教育 (0000010205) — 大学密度は知的産業基盤・若者定着の代理指標
    "大学数_人口10万対":      {"statsDataId": "0000010205", "cdCat01": "#E0610102"},
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
        "lvArea": "2",        # 都道府県レベルのみ
        "metaGetFlg": "Y",
        "limit": "100000",
    }

    all_values: list = []
    area_map: dict = {}
    start_position = 1

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
        if len(area_code) == 5 and area_code.endswith("000") and area_code != "00000":
            pref_name = area_map.get(area_code, area_code)
            try:
                result[pref_name] = float(value_str) if value_str not in ("", "-", "...", "x", "X") else None
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
                print(f"  {c['@code']:20s} | {c['@name']}")


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
            print(f"    OK {len(result)} 件 ({year})")
        except Exception as e:
            print(f"    FAIL {e}")
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

    print(f"\n保存: {out_dir}/estat_indicators.csv  ({len(df)}行 x {len(df.columns)}列)")
    print("\n欠損値:")
    print(df.isnull().sum())


if __name__ == "__main__":
    collect_all()

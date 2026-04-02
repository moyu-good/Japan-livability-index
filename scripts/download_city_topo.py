"""
download_city_topo.py
市区町村境界データ（GeoJSON）を niiyz/JapanCityGeoJson から取得し
都道府県別に web/data/cities/{pref_code}.json として保存する

Usage:
    python scripts/download_city_topo.py

所要時間: 10〜20分（ネットワーク速度による）
出力: web/data/cities/01.json ～ 47.json (GeoJSON FeatureCollection)
"""

import os
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm

GITHUB_API = "https://api.github.com/repos/niiyz/JapanCityGeoJson/contents/topojson"
RAW_BASE   = "https://raw.githubusercontent.com/niiyz/JapanCityGeoJson/master/topojson"
OUT_DIR    = "web/data/cities"

PREF_CODES = [f"{i:02d}" for i in range(1, 48)]  # "01" ～ "47"


# ─── TopoJSON デコーダ ───────────────────────────────────

def _decode_arcs(topo: dict) -> list:
    """TopoJSON arcs（量子化 + デルタ符号化）を WGS84 座標に変換"""
    transform = topo.get("transform", {"scale": [1, 1], "translate": [0, 0]})
    sx, sy = transform["scale"]
    tx, ty = transform["translate"]

    decoded = []
    for arc in topo.get("arcs", []):
        x = y = 0
        coords = []
        for dp in arc:
            x += dp[0]
            y += dp[1]
            coords.append([round(x * sx + tx, 7), round(y * sy + ty, 7)])
        decoded.append(coords)
    return decoded


def _ring_coords(ring_indices: list, decoded_arcs: list) -> list:
    """1リングのアーク参照 → 座標リスト"""
    coords: list = []
    for idx in ring_indices:
        arc = decoded_arcs[idx] if idx >= 0 else list(reversed(decoded_arcs[~idx]))
        coords.extend(arc[1:] if coords else arc)
    # 閉合（first == last）
    if coords and coords[0] != coords[-1]:
        coords.append(coords[0])
    return coords


def topo_to_feature(geom: dict, decoded_arcs: list, props: dict) -> dict | None:
    """TopoJSON geometry → GeoJSON Feature"""
    gtype = geom.get("type")
    try:
        if gtype == "Polygon":
            coordinates = [_ring_coords(ring, decoded_arcs) for ring in geom["arcs"]]
            geo = {"type": "Polygon", "coordinates": coordinates}
        elif gtype == "MultiPolygon":
            coordinates = [
                [_ring_coords(ring, decoded_arcs) for ring in poly]
                for poly in geom["arcs"]
            ]
            geo = {"type": "MultiPolygon", "coordinates": coordinates}
        else:
            return None
    except Exception:
        return None

    return {"type": "Feature", "properties": props, "geometry": geo}


# ─── ダウンロードヘルパー ───────────────────────────────

def _fetch_json(url: str, retries: int = 3) -> dict | None:
    headers = {"User-Agent": "Japan-Livability-Index/1.0"}
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                return None
    return None


def list_city_codes(pref_code: str) -> list[str]:
    """都道府県ディレクトリ内の市区町村コード一覧を取得"""
    url = f"{GITHUB_API}/{pref_code}"
    data = _fetch_json(url)
    if not data:
        return []
    return [
        f["name"].replace(".topojson", "")
        for f in data
        if isinstance(f, dict) and f.get("name", "").endswith(".topojson")
    ]


def download_city(pref_code: str, city_code: str) -> dict | None:
    """1市区町村の TopoJSON をダウンロードし GeoJSON Feature に変換"""
    url = f"{RAW_BASE}/{pref_code}/{city_code}.topojson"
    topo = _fetch_json(url)
    if not topo:
        return None

    obj_key = list(topo.get("objects", {}).keys())[0]
    obj = topo["objects"][obj_key]
    decoded_arcs = _decode_arcs(topo)

    features = []
    for geom in obj.get("geometries", []):
        props = dict(geom.get("properties", {}))
        # 統一キー city_code を付与
        props["city_code"] = props.get("N03_007", city_code)
        feat = topo_to_feature(geom, decoded_arcs, props)
        if feat:
            features.append(feat)
    return features or None


# ─── 都道府県単位の処理 ─────────────────────────────────

def build_pref_geojson(pref_code: str, max_workers: int = 10) -> dict:
    """1都道府県の全市区町村 GeoJSON FeatureCollection を構築"""
    city_codes = list_city_codes(pref_code)
    if not city_codes:
        print(f"  ⚠  {pref_code}: 市区町村コード取得失敗")
        return {"type": "FeatureCollection", "features": []}

    all_features = []
    failed = 0

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(download_city, pref_code, code): code
            for code in city_codes
        }
        for fut in as_completed(futures):
            result = fut.result()
            if result:
                all_features.extend(result)
            else:
                failed += 1

    if failed:
        print(f"  ⚠  {pref_code}: {failed}/{len(city_codes)} 件の取得失敗")

    return {"type": "FeatureCollection", "features": all_features}


# ─── エントリポイント ───────────────────────────────────

def run():
    os.makedirs(OUT_DIR, exist_ok=True)

    # 既存ファイルをスキップするか確認
    existing = [p for p in PREF_CODES
                if os.path.exists(f"{OUT_DIR}/{p}.json")]
    if existing:
        ans = input(f"{len(existing)} 件の既存ファイルがあります。スキップしますか？ [Y/n]: ").strip().lower()
        skip_existing = ans != "n"
    else:
        skip_existing = False

    print(f"\n{'=' * 50}")
    print(f"市区町村境界データ ダウンロード開始")
    print(f"出力先: {OUT_DIR}/")
    print(f"{'=' * 50}\n")

    total_features = 0
    failed_prefs = []

    for pref_code in tqdm(PREF_CODES, desc="都道府県"):
        out_path = f"{OUT_DIR}/{pref_code}.json"

        if skip_existing and os.path.exists(out_path):
            with open(out_path, encoding="utf-8") as f:
                d = json.load(f)
            total_features += len(d.get("features", []))
            continue

        tqdm.write(f"  {pref_code} 処理中...")
        geojson = build_pref_geojson(pref_code)
        n = len(geojson["features"])
        total_features += n

        if n == 0:
            failed_prefs.append(pref_code)
            tqdm.write(f"  ❌ {pref_code}: データなし（スキップ）")
            continue

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

        tqdm.write(f"  ✅ {pref_code}: {n} 市区町村")
        time.sleep(0.5)  # GitHub API レート制限対策

    print(f"\n{'=' * 50}")
    print(f"完了: {total_features} 市区町村")
    if failed_prefs:
        print(f"失敗: {', '.join(failed_prefs)}")
    print(f"出力: {OUT_DIR}/01.json ～ 47.json")


if __name__ == "__main__":
    run()

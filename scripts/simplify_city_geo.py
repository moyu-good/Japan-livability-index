"""
Simplify prefecture city GeoJSON files for Leaflet display.
Input:  web/data/cities/NN.json   (277MB total, raw MLIT N03)
Output: web/data/cities_simple/NN.json  (target ~8MB total)

Uses shapely topology-preserving simplification at 0.002° (~200m).
"""
import sys, io, json, os
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from shapely.geometry import shape, mapping

SRC = Path("web/data/cities")
DST = Path("web/data/cities_simple")
DST.mkdir(exist_ok=True)

TOLERANCE = 0.002  # ~200m — readable at prefecture zoom, dramatically smaller


def simplify_geojson(src_path: Path, dst_path: Path, tol: float) -> tuple:
    with open(src_path, encoding='utf-8') as f:
        data = json.load(f)

    ok, skipped = 0, 0
    out_features = []
    for feat in data['features']:
        try:
            geom = shape(feat['geometry'])
            simplified = geom.simplify(tol, preserve_topology=True)
            if simplified.is_empty:
                skipped += 1
                continue
            out_features.append({
                'type': 'Feature',
                'properties': feat['properties'],
                'geometry': mapping(simplified),
            })
            ok += 1
        except Exception:
            out_features.append(feat)   # keep original on error
            ok += 1

    result = {'type': 'FeatureCollection', 'features': out_features}
    with open(dst_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, separators=(',', ':'))

    src_kb = os.path.getsize(src_path) // 1024
    dst_kb = os.path.getsize(dst_path) // 1024
    ratio = dst_kb / src_kb * 100
    return src_kb, dst_kb, ratio, ok, skipped


files = sorted(SRC.glob("*.json"))
print(f"Simplifying {len(files)} prefecture GeoJSON files  tolerance={TOLERANCE}°")
print("-" * 60)

total_src = total_dst = 0
for src in files:
    dst = DST / src.name
    src_kb, dst_kb, ratio, ok, skipped = simplify_geojson(src, dst, TOLERANCE)
    total_src += src_kb
    total_dst += dst_kb
    print(f"  {src.name}  {src_kb//1024}MB → {dst_kb}KB  ({ratio:.1f}%)  features={ok}")

print("-" * 60)
print(f"  TOTAL: {total_src//1024}MB → {total_dst//1024}MB  ({total_dst/total_src*100:.1f}%)")
print("Done.")

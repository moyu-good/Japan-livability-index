"""
市区町村钻取功能深度调试
"""
import os, sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

OUT = r"c:\project file\都道府県\test_screenshots"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)  # 有头模式方便观察
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Capture console logs
    logs = []
    errors = []
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto("http://localhost:8080")
    page.wait_for_load_state("networkidle")
    time.sleep(2)

    # ── 1. 确认地图已渲染 ──
    paths = page.locator("svg .prefecture").count()
    print(f"[1] 都道府県 paths rendered: {paths}")
    page.screenshot(path=f"{OUT}/D01_before_drill.png")

    # ── 2. 点击东京 ──
    tokyo = page.locator(".rank-item[data-code='13']").first
    tokyo.click()
    time.sleep(0.8)

    # ── 3. 确认钻取按钮并点击 ──
    drill_btn = page.locator("#detail-drill-btn")
    print(f"[3] Drill button visible: {drill_btn.is_visible()}")
    drill_btn.click()

    # ── 4. 等待加载完成（city data + zoom animation）──
    time.sleep(3)
    page.screenshot(path=f"{OUT}/D02_after_drill_3s.png")

    # ── 5. 检查 SVG 中的 city-path 数量 ──
    city_paths = page.locator("svg .city-path").count()
    pref_paths = page.locator("svg .prefecture").count()
    print(f"[5] city-path elements: {city_paths}")
    print(f"[5] prefecture elements still: {pref_paths}")

    # ── 6. 检查地图 SVG viewBox 和 transform ──
    svg_info = page.evaluate("""() => {
        const svg = document.querySelector('#map svg');
        if (!svg) return {error: 'no svg'};
        const g = svg.querySelector('.map-g');
        return {
            svgWidth: svg.getAttribute('width'),
            svgHeight: svg.getAttribute('height'),
            gTransform: g ? g.getAttribute('transform') : 'no .map-g',
            cityPaths: svg.querySelectorAll('.city-path').length,
            prefPaths: svg.querySelectorAll('.prefecture').length,
            svgChildren: svg.children.length
        };
    }""")
    print(f"[6] SVG info: {svg_info}")

    # ── 7. 检查第一个 city-path 的 d 属性 ──
    first_city_d = page.evaluate("""() => {
        const p = document.querySelector('.city-path');
        if (!p) return 'no city-path found';
        const d = p.getAttribute('d');
        return d ? d.substring(0, 100) : 'empty d';
    }""")
    print(f"[7] First city-path d: {first_city_d!r}")

    # ── 8. 检查 zoom transform ──
    zoom_transform = page.evaluate("""() => {
        const g = document.querySelector('#map svg .map-g');
        return g ? g.style.transform || g.getAttribute('transform') : 'no g';
    }""")
    print(f"[8] map-g transform: {zoom_transform!r}")

    # ── 9. 检查 rank list 内容 ──
    rank_count = page.locator(".rank-item").count()
    first_rank = page.locator(".rank-item").first.inner_text() if rank_count > 0 else "none"
    print(f"[9] Rank items: {rank_count}, first: {first_rank!r}")

    # ── 10. console logs ──
    print(f"\n[10] Console logs ({len(logs)} total):")
    for l in logs[-15:]:
        print(f"  {l}")
    if errors:
        print(f"[10] Page errors: {errors}")

    # 等更久再截图
    time.sleep(2)
    page.screenshot(path=f"{OUT}/D03_after_5s.png", full_page=False)

    # ── 11. 尝试全屏截图带地图区域 ──
    map_container = page.locator("#map-container")
    if map_container.is_visible():
        map_container.screenshot(path=f"{OUT}/D04_map_only.png")
        print("[11] Map container screenshot saved")

    browser.close()

print("\n截图保存在:", OUT)

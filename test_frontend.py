"""
前端验证脚本 — Japan Livability Index
检查 M1/M2/M3 变更是否正确显示，以及市区町村钻取功能状态
"""
import os, sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

OUT = r"c:\project file\都道府県\test_screenshots"
os.makedirs(OUT, exist_ok=True)

def ss(page, name):
    path = f"{OUT}/{name}.png"
    page.screenshot(path=path, full_page=False)
    print(f"  [screenshot] {name}.png")

def check(label, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    msg = f"  [{status}] {label}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    return condition

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    print("\n=== 1. 初期ロード ===")
    page.goto("http://localhost:8080")
    page.wait_for_load_state("networkidle")
    time.sleep(2)  # JS rendering
    ss(page, "01_initial_load")

    # M1b: 副标题指标数
    subtitle = page.locator("#header-subtitle").inner_text()
    print(f"  副标题文字: {subtitle!r}")
    check("副标题包含20指標", "20" in subtitle, subtitle)
    check("副标题不含16指標", "16" not in subtitle, subtitle)

    # M3: Hero banner
    print("\n=== 2. Hero Banner ===")
    hero_visible = page.locator("#hero-banner").is_visible()
    check("Hero banner 可见", hero_visible)
    if hero_visible:
        hero_insight = page.locator("#hero-insight").inner_text()
        hero_name = page.locator("#hero-name").inner_text()
        hero_score = page.locator("#hero-score").inner_text()
        print(f"  Hero name: {hero_name!r}")
        print(f"  Hero score: {hero_score!r}")
        print(f"  Hero insight: {hero_insight!r}")
        check("Insight含有数据对比(全国)", "全国" in hero_insight, hero_insight)
        check("Insight含有维度名", any(kw in hero_insight for kw in ["経済", "居住", "環境", "医療", "将来"]), hero_insight)
    ss(page, "02_hero_banner")

    # M2: 东京都 详情面板注解
    print("\n=== 3. 东京都 详情面板 ===")
    # Find Tokyo in rank list and click
    tokyo_item = page.locator(".rank-item[data-code='13']")
    if tokyo_item.count() > 0:
        tokyo_item.first.click()
        page.wait_for_timeout(800)
        ss(page, "03_tokyo_detail")
        detail_html = page.locator("#detail-dims").inner_html()
        check("东京详情面板有注解", "経済・将来性がともに全国1位" in detail_html, "")
        check("东京注解提到居住コスト", "居住コスト" in detail_html, "")
    else:
        # Try clicking on map or rank list
        rank_items = page.locator(".rank-item").all()
        print(f"  Rank items found: {len(rank_items)}")
        if rank_items:
            for item in rank_items[:5]:
                code = item.get_attribute("data-code")
                name_el = item.locator(".rank-name")
                name = name_el.inner_text() if name_el.count() > 0 else "?"
                print(f"    item code={code!r} name={name!r}")
        check("东京都rank-item存在", False, "data-code='13' not found")

    # M2: 冲绳 详情面板
    print("\n=== 4. 沖縄県 详情面板 ===")
    okinawa_item = page.locator(".rank-item[data-code='47']")
    if okinawa_item.count() > 0:
        okinawa_item.first.click()
        page.wait_for_timeout(800)
        ss(page, "04_okinawa_detail")
        detail_html = page.locator("#detail-dims").inner_html()
        check("沖縄注解存在", "自然景観" in detail_html or "文化的豊かさ" in detail_html, "")
    else:
        check("沖縄rank-item存在", False, "data-code='47' not found")

    # M2: 静冈 详情面板
    print("\n=== 5. 静岡県 详情面板 ===")
    shizuoka_item = page.locator(".rank-item[data-code='22']")
    if shizuoka_item.count() > 0:
        shizuoka_item.first.click()
        page.wait_for_timeout(800)
        ss(page, "05_shizuoka_detail")
        detail_html = page.locator("#detail-dims").inner_html()
        check("静岡注解存在", "東名高速" in detail_html, "")
    else:
        check("静岡rank-item存在", False, "data-code='22' not found")

    # M1a: 方法论弹窗免责说明
    print("\n=== 6. 方法論弹窗 ===")
    # Click ℹ button on first dim-info-btn
    info_btns = page.locator(".dim-info-btn").all()
    check("ℹ按钮存在", len(info_btns) > 0, f"found {len(info_btns)}")
    if info_btns:
        info_btns[0].click()
        page.wait_for_timeout(500)
        modal_visible = page.locator("#method-modal").is_visible()
        check("方法論弹窗可见", modal_visible)
        if modal_visible:
            modal_html = page.locator("#method-modal-body").inner_html()
            check("弹窗含免责说明(min-max)", "min-max" in modal_html, "")
            check("弹窗含数据出典说明", "e-Stat" in modal_html, "")
            check("弹窗含都道府県说明", "都道府県単位" in modal_html, "")
            ss(page, "06_method_modal")
        # Close modal
        close_btn = page.locator(".method-modal-close, #method-modal button")
        if close_btn.count() > 0:
            close_btn.first.click()

    # M5: 市区町村 钻取功能
    print("\n=== 7. 市区町村 钻取功能 ===")
    # Click Tokyo first
    tokyo_item2 = page.locator(".rank-item[data-code='13']")
    if tokyo_item2.count() > 0:
        tokyo_item2.first.click()
        page.wait_for_timeout(800)
        drill_btn = page.locator("#detail-drill-btn")
        drill_exists = drill_btn.count() > 0
        check("钻取按钮存在", drill_exists)
        if drill_exists:
            drill_visible = drill_btn.is_visible()
            check("钻取按钮可见", drill_visible)
            if drill_visible:
                drill_text = drill_btn.inner_text()
                print(f"  钻取按钮文字: {drill_text!r}")
                drill_btn.click()
                page.wait_for_timeout(2000)  # city data loading
                ss(page, "07_city_drilldown")
                # Check if city data loaded
                city_items = page.locator(".rank-item").all()
                print(f"  钻取后rank-item数量: {len(city_items)}")
                check("市区町村数据加载", len(city_items) > 47, f"found {len(city_items)} items")
                # Check city score map colors
                city_map = page.locator("#map svg").is_visible()
                check("地图仍然可见", city_map)

    # Console errors
    print("\n=== 8. Console errors ===")
    errors = []
    page.on("console", lambda msg: errors.append(msg) if msg.type == "error" else None)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    check("无控制台错误", len(errors) == 0, f"{len(errors)} errors: {[e.text for e in errors[:3]]}")

    ss(page, "08_final_state")
    browser.close()

print(f"\n截图保存在: {OUT}")

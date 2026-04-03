"""Test Leaflet city drilldown, hero rotation, URL state, drill button position."""
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

OUT = r"c:\project file\都道府県\test_screenshots"

def ss(page, name):
    page.screenshot(path=f"{OUT}/{name}.png")
    print(f"  [screenshot] {name}.png")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    # 1. Load page
    page.goto("http://localhost:8080")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    ss(page, "L01_initial")

    # 2. Check hero banner dots
    dots = page.locator(".hero-dot").count()
    print(f"Hero dots: {dots} (expected 6)")

    # 3. Click Tokyo
    page.locator(".rank-item[data-code='13']").first.click()
    time.sleep(0.5)
    ss(page, "L02_tokyo_detail")

    # 4. Check drill button position and visibility
    drill_btn = page.locator("#detail-drill-btn")
    visible = drill_btn.is_visible()
    # Get bounding box to check if it's at top
    bbox = drill_btn.bounding_box()
    print(f"Drill button visible: {visible}, y-position: {bbox['y'] if bbox else 'N/A'}")

    # 5. Click drill button
    drill_btn.locator("button").click()
    time.sleep(4)
    ss(page, "L03_tokyo_leaflet")

    # 6. Check Leaflet map is showing
    leaflet_visible = page.evaluate("() => document.getElementById('city-leaflet-map').style.display !== 'none'")
    d3_hidden = page.evaluate("() => document.getElementById('map').style.visibility === 'hidden'")
    city_count = page.locator(".rank-item").count()
    print(f"Leaflet visible: {leaflet_visible}, D3 hidden: {d3_hidden}, City items: {city_count}")

    # 7. Check URL has drill param
    url = page.url
    print(f"URL: {url}")
    has_drill = "drill=" in url
    print(f"URL has drill param: {has_drill}")

    # 8. Click a city in rank list
    page.locator(".rank-item").first.click()
    time.sleep(0.5)
    ss(page, "L04_city_selected")

    # 9. Go back
    page.locator("#drill-back button").click()
    time.sleep(1.5)
    ss(page, "L05_back_to_pref")

    d3_restored = page.evaluate("() => document.getElementById('map').style.visibility !== 'hidden'")
    leaflet_gone = page.evaluate("() => document.getElementById('city-leaflet-map').style.display === 'none'")
    print(f"D3 restored: {d3_restored}, Leaflet hidden: {leaflet_gone}")

    # 10. Test URL state restoration
    drill_url = f"http://localhost:8080?w=20,25,20,20,15&p=27&drill=27"
    page.goto(drill_url)
    page.wait_for_load_state("networkidle")
    time.sleep(5)
    ss(page, "L06_url_restore_osaka")
    leaflet_from_url = page.evaluate("() => document.getElementById('city-leaflet-map').style.display !== 'none'")
    print(f"Leaflet restored from URL: {leaflet_from_url}")

    if errors:
        print(f"\nConsole errors ({len(errors)}):")
        for e in errors:
            print(f"  {e}")
    else:
        print("\nNo console errors!")

    browser.close()

print("\nDone.")

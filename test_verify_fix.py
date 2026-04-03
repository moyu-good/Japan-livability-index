"""
Quick visual verification: Tokyo city drilldown + 404 error source
"""
import sys, io, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

OUT = r"c:\project file\都道府県\test_screenshots"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # Capture ALL network requests and console
    logs = []
    failed_requests = []
    page.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
    page.on("requestfailed", lambda r: failed_requests.append(f"FAILED: {r.url} — {r.failure}"))
    page.on("response", lambda r: failed_requests.append(f"404: {r.url}") if r.status == 404 else None)

    page.goto("http://localhost:8080")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    page.screenshot(path=f"{OUT}/V01_initial.png")

    # Click Tokyo
    tokyo = page.locator(".rank-item[data-code='13']").first
    tokyo.click()
    time.sleep(0.8)

    # Drill down
    drill_btn = page.locator("#detail-drill-btn")
    print(f"Drill button visible: {drill_btn.is_visible()}")
    drill_btn.click()

    # Wait for city data + zoom animation
    time.sleep(4)
    page.screenshot(path=f"{OUT}/V02_tokyo_drilldown.png")

    # Get zoom transform
    info = page.evaluate("""() => {
        const g = document.querySelector('#map svg .map-g');
        if (!g) return {error: 'no map-g'};
        const t = g.getAttribute('transform') || g.style.transform || '';
        const cityPaths = document.querySelectorAll('.city-path').length;
        const rankItems = document.querySelectorAll('.rank-item').length;
        return { transform: t, cityPaths, rankItems };
    }""")
    print(f"Map info: {info}")

    # Check rank list disclaimer
    disclaimer = page.evaluate("""() => {
        const note = document.querySelector('.city-data-note');
        return note ? note.textContent : 'no note found';
    }""")
    print(f"Disclaimer: {disclaimer!r}")

    # Console and network errors
    print(f"\nConsole logs ({len(logs)}):")
    for l in logs:
        print(f"  {l}")
    if failed_requests:
        print(f"\nFailed/404 requests:")
        for r in failed_requests:
            print(f"  {r}")
    else:
        print("\nNo failed requests!")

    # Also test Osaka drilldown (non-island prefecture)
    page.goto("http://localhost:8080")
    page.wait_for_load_state("networkidle")
    time.sleep(1.5)
    osaka = page.locator(".rank-item[data-code='27']").first
    osaka.click()
    time.sleep(0.5)
    drill_btn2 = page.locator("#detail-drill-btn")
    if drill_btn2.is_visible():
        drill_btn2.click()
        time.sleep(3)
        page.screenshot(path=f"{OUT}/V03_osaka_drilldown.png")
        info2 = page.evaluate("""() => {
            const g = document.querySelector('#map svg .map-g');
            const t = g ? (g.getAttribute('transform') || '') : '';
            return { transform: t, cityPaths: document.querySelectorAll('.city-path').length };
        }""")
        print(f"\nOsaka drilldown: {info2}")

    browser.close()

print(f"\nScreenshots: {OUT}")

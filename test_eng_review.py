"""
Engineering review test suite — Japan Livability Index
Tests 3 critical paths identified in eng review:
  1. Methodology modal: 22 indicators, correct per-dimension counts
  2. URL sharing round-trip: weights + selection preserved
  3. Language switch: subtitle shows correct indicator count in all 3 languages
"""
import os, sys, io, time, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from playwright.sync_api import sync_playwright

BASE = os.environ.get("TEST_URL", "http://localhost:8765")
OUT = r"c:\project file\都道府県\test_screenshots"
os.makedirs(OUT, exist_ok=True)

passed = 0
failed = 0

def ss(page, name):
    path = f"{OUT}/{name}.png"
    page.screenshot(path=path, full_page=False)
    print(f"  [screenshot] {name}.png")

def check(label, condition, detail=""):
    global passed, failed
    status = "PASS" if condition else "FAIL"
    if condition:
        passed += 1
    else:
        failed += 1
    msg = f"  [{status}] {label}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    return condition


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # ================================================================
    # TEST 1: Methodology modal — 22 indicators, correct per-dimension
    # ================================================================
    print("\n=== TEST 1: Methodology Modal ===")
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    # Wait for rank list to be populated (data loaded and rendered)
    page.locator("#rank-list .rank-item").first.wait_for(state="visible", timeout=15000)
    time.sleep(1)

    # Click first prefecture to get detail panel
    page.locator("#rank-list .rank-item").first.click()
    time.sleep(1)

    # Expected indicator counts per dimension
    expected_counts = {
        "経済・労働": 4,
        "居住・利便性": 7,
        "環境・安全": 4,
        "医療・教育": 4,
        "将来性": 3,
    }

    total_indicators = 0
    for dim, expected in expected_counts.items():
        # Click the info button for this dimension
        info_btn = page.locator(f'button.dim-info-btn[onclick*="{dim}"]')
        if info_btn.count() == 0:
            check(f"{dim} info button exists", False, "button not found")
            continue
        info_btn.first.click()
        time.sleep(0.5)

        # Count indicators in the modal
        modal = page.locator("#method-modal")
        check(f"{dim} modal visible", modal.is_visible())

        # Count table rows (each indicator is a <tr> in the modal table)
        rows = modal.locator("table tbody tr")
        count = rows.count()
        total_indicators += count
        check(f"{dim} has {expected} indicators", count == expected,
              f"found {count}, expected {expected}")

        ss(page, f"02_modal_{dim.replace('・', '_')}")

        # Close modal
        modal.locator("button").first.click()
        time.sleep(0.3)

    check("Total indicators = 22", total_indicators == 22,
          f"found {total_indicators}")

    # ================================================================
    # TEST 2: URL sharing round-trip
    # ================================================================
    print("\n=== TEST 2: URL Sharing Round-Trip ===")

    # Click the "Family" preset to change weights
    family_btn = page.locator('button:has-text("家庭")')
    if family_btn.count() > 0:
        family_btn.first.click()
        time.sleep(1)

    # Click a specific prefecture (Tokyo = first #rank-list item or find 東京)
    tokyo_item = page.locator('#rank-list .rank-item:has-text("東京")')
    if tokyo_item.count() > 0:
        tokyo_item.first.click()
        time.sleep(0.5)

    # Get current ranking order (top 5)
    rank_items_before = []
    items = page.locator("#rank-list .rank-item")
    for i in range(min(5, items.count())):
        rank_items_before.append(items.nth(i).inner_text().strip())
    print(f"  Ranking before: {rank_items_before[:3]}...")

    # Get the share URL using the encodeStateToURL function from app.js
    share_url = page.evaluate("() => encodeStateToURL()")
    print(f"  Share URL: {share_url}")

    # Navigate to the share URL in a new page to verify round-trip
    page2 = browser.new_page(viewport={"width": 1400, "height": 900})
    page2.goto(share_url)
    page2.wait_for_load_state("networkidle")
    time.sleep(2)

    # Compare ranking order
    rank_items_after = []
    items2 = page2.locator("#rank-list .rank-item")
    for i in range(min(5, items2.count())):
        rank_items_after.append(items2.nth(i).inner_text().strip())
    print(f"  Ranking after:  {rank_items_after[:3]}...")

    check("Ranking order preserved after URL round-trip",
          rank_items_before == rank_items_after,
          f"before={rank_items_before[:3]} after={rank_items_after[:3]}")

    ss(page2, "03_url_roundtrip")
    page2.close()

    # ================================================================
    # TEST 3: Language switch — subtitle shows 22指標/22项指标/22 indicators
    # ================================================================
    print("\n=== TEST 3: Language Switch ===")

    # Reset to base URL
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    time.sleep(2)

    # Japanese (default)
    subtitle_ja = page.locator("#header-subtitle").inner_text()
    check("JA subtitle contains 22指標", "22指標" in subtitle_ja, subtitle_ja)

    # Switch to Chinese
    page.locator('button[data-lang="zh"]').click()
    time.sleep(0.5)
    subtitle_zh = page.locator("#header-subtitle").inner_text()
    check("ZH subtitle contains 22项指标", "22项指标" in subtitle_zh, subtitle_zh)

    # Switch to English
    page.locator('button[data-lang="en"]').click()
    time.sleep(0.5)
    subtitle_en = page.locator("#header-subtitle").inner_text()
    check("EN subtitle contains '22 indicators'", "22 indicators" in subtitle_en, subtitle_en)

    ss(page, "04_lang_en")

    # Switch back to Japanese to verify restoration
    page.locator('button[data-lang="ja"]').click()
    time.sleep(0.5)
    subtitle_ja2 = page.locator("#header-subtitle").inner_text()
    check("JA restored after switch", "22指標" in subtitle_ja2, subtitle_ja2)

    # ================================================================
    # Summary
    # ================================================================
    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed, {passed+failed} total")
    print(f"{'='*50}")

    browser.close()

sys.exit(1 if failed > 0 else 0)

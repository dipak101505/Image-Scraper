"""
image_scraper_ralph.py

A sophisticated image scraper designed for modern, JavaScript-heavy e-commerce websites.
Specifically optimized for handling lazy-loading, anti-bot protections, and high-resolution 
image retrieval through browser-level response interception.

Dependencies:
    - playwright: Core engine for browser automation and network interception.
    - Standard Library: argparse, hashlib, mimetypes, os, re, time, urllib, pathlib.

Installation:
    pip install playwright
    playwright install chromium

Usage:
    python image_scraper_ralph.py <url> [options]

Example:
    python image_scraper_ralph.py "https://www.example.com/product" -o ./images --headed
"""

import argparse
import hashlib
import mimetypes
import os
import re
import time
import urllib.parse
from pathlib import Path

from playwright.sync_api import sync_playwright

# -----------------------------------------------------------------------------
# CONFIG
# -----------------------------------------------------------------------------

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

IMAGE_MIME_PREFIX = "image/"

DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


# -----------------------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------------------

def safe_filename(url: str, content_type: str = "") -> str:
    """
    Generates a safe, unique filename based on the URL and content type.

    Args:
        url (str): The source URL of the image.
        content_type (str): The MIME type of the image (e.g., 'image/jpeg').

    Returns:
        str: A sanitized filename string.
    """
    parsed = urllib.parse.urlparse(url)

    filename = os.path.basename(parsed.path)
    filename = filename.split("?")[0]

    filename = re.sub(r"[^\w.\-]", "_", filename)

    if "." not in filename:
        ext = mimetypes.guess_extension(content_type.split(";")[0]) or ".jpg"
        filename += ext

    url_hash = hashlib.md5(url.encode()).hexdigest()[:8]

    stem, ext = os.path.splitext(filename)

    if not ext:
        ext = ".jpg"

    return f"{stem[:80]}_{url_hash}{ext}"


def upgrade_image_url(url: str) -> str:
    """
    Attempts to upgrade image URLs to their highest resolution versions 
    by modifying common CDN query parameters (wid, hei, size).

    Args:
        url (str): The original image URL.

    Returns:
        str: The potentially upgraded image URL.
    """

    replacements = {
        r"wid=\d+": "wid=2500",
        r"hei=\d+": "hei=3000",
        r"size=\d+": "size=2500",
    }

    for pattern, repl in replacements.items():
        url = re.sub(pattern, repl, url)

    return url


def ensure_unique_path(filepath: Path) -> Path:
    """
    Prevents file overwriting by appending a numeric counter to the filename 
    if a file already exists at the specified path.

    Args:
        filepath (Path): The desired destination path.

    Returns:
        Path: A unique file path.
    """

    if not filepath.exists():
        return filepath

    stem = filepath.stem
    suffix = filepath.suffix

    counter = 1

    while True:
        new_path = filepath.parent / f"{stem}_{counter}{suffix}"

        if not new_path.exists():
            return new_path

        counter += 1


# -----------------------------------------------------------------------------
# MAIN SCRAPER
# -----------------------------------------------------------------------------

def scrape_images(
    url: str,
    output_dir: str = "./scraped_images",
    scroll: bool = True,
    min_size: int = 2048,
    headless: bool = True,
):
    """
    Navigates to a URL, interacts with the page, and intercepts image responses 
    to save them to a local directory.

    Args:
        url (str): The target webpage URL.
        output_dir (str): Directory where images will be saved.
        scroll (bool): Whether to automatically scroll down to trigger lazy-loading.
        min_size (int): Minimum file size in bytes for an image to be saved.
        headless (bool): Whether to run the browser in headless mode.
    """

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    saved_urls = set()

    print("\n" + "=" * 70)
    print(" ADVANCED IMAGE SCRAPER")
    print("=" * 70)
    print(f"Target : {url}")
    print(f"Output : {output_path.resolve()}")
    print("=" * 70 + "\n")

    with sync_playwright() as p:

        browser = p.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-http2",
            ]
        )

        context = browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
        )

        page = context.new_page()

        # ---------------------------------------------------------------------
        # STEALTH
        # ---------------------------------------------------------------------

        page.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });

        window.chrome = {
            runtime: {}
        };

        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5]
        });

        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en']
        });
        """)

        # ---------------------------------------------------------------------
        # IMAGE INTERCEPTION
        # ---------------------------------------------------------------------

        def handle_response(response):

            try:

                ct = response.headers.get("content-type", "")

                if not ct.startswith(IMAGE_MIME_PREFIX):
                    return

                image_url = response.url

                if image_url in saved_urls:
                    return

                saved_urls.add(image_url)

                upgraded_url = upgrade_image_url(image_url)

                body = response.body()

                if len(body) < min_size:
                    return

                filename = safe_filename(upgraded_url, ct)

                filepath = output_path / filename

                filepath = ensure_unique_path(filepath)

                filepath.write_bytes(body)

                print(
                    f"[✓] Saved: {filepath.name} "
                    f"({len(body):,} bytes)"
                )

            except Exception as e:
                print(f"[✗] Failed response capture: {e}")

        page.on("response", handle_response)

        # ---------------------------------------------------------------------
        # NAVIGATE
        # ---------------------------------------------------------------------

        print("[INFO] Opening page...")

        try:
            page.goto(
                url,
                wait_until="networkidle",
                timeout=120000
            )

        except Exception as e:
            print(f"[WARN] Navigation warning: {e}")

        page.wait_for_timeout(5000)

        # ---------------------------------------------------------------------
        # HANDLE COOKIE BANNERS
        # ---------------------------------------------------------------------

        cookie_selectors = [
            "#onetrust-accept-btn-handler",
            "button:has-text('Accept All')",
            "button:has-text('Accept')",
            ".accept-all",
            ".cookie-accept",
        ]

        for selector in cookie_selectors:

            try:
                if page.locator(selector).is_visible(timeout=2000):
                    page.locator(selector).click()
                    print(f"[INFO] Accepted cookies: {selector}")
                    page.wait_for_timeout(2000)
                    break

            except:
                pass

        # ---------------------------------------------------------------------
        # SCROLL
        # ---------------------------------------------------------------------

        if scroll:

            print("[INFO] Scrolling page...")

            previous_height = 0

            for _ in range(25):

                current_height = page.evaluate(
                    "() => document.body.scrollHeight"
                )

                if current_height == previous_height:
                    break

                previous_height = current_height

                page.mouse.wheel(0, 3000)

                page.wait_for_timeout(1500)

        # ---------------------------------------------------------------------
        # EXTRA WAIT
        # ---------------------------------------------------------------------

        print("[INFO] Waiting for late-loaded images...")

        page.wait_for_timeout(8000)

        # ---------------------------------------------------------------------
        # FORCE IMAGE ELEMENTS INTO VIEW
        # ---------------------------------------------------------------------

        try:

            images = page.locator("img")

            count = images.count()

            print(f"[INFO] Found {count} img elements")

            for i in range(min(count, 100)):

                try:
                    images.nth(i).scroll_into_view_if_needed()
                    page.wait_for_timeout(100)

                except:
                    pass

        except Exception as e:
            print(f"[WARN] Error processing img tags: {e}")

        # ---------------------------------------------------------------------
        # FINAL WAIT
        # ---------------------------------------------------------------------

        page.wait_for_timeout(5000)

        browser.close()

    print("\n" + "=" * 70)
    print(f"DONE")
    print(f"Images saved: {len(saved_urls)}")
    print(f"Folder: {output_path.resolve()}")
    print("=" * 70 + "\n")


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------

def main():
    """
    Parses command-line arguments and initiates the image scraping process.
    """

    parser = argparse.ArgumentParser(
        description="Advanced JS-heavy website image scraper"
    )

    parser.add_argument(
        "url",
        help="Target URL"
    )

    parser.add_argument(
        "-o",
        "--output",
        default="./scraped_images",
        help="Output directory"
    )

    parser.add_argument(
        "--no-scroll",
        action="store_true",
        help="Disable auto-scroll"
    )

    parser.add_argument(
        "--min-size",
        type=int,
        default=2048,
        help="Minimum image size in bytes"
    )

    parser.add_argument(
        "--headed",
        action="store_true",
        help="Run browser in visible mode"
    )

    args = parser.parse_args()

    scrape_images(
        url=args.url,
        output_dir=args.output,
        scroll=not args.no_scroll,
        min_size=args.min_size,
        headless=not args.headed,
    )


if __name__ == "__main__":
    main()


#     python image_scraper.py "https://www.ralphlauren.eu/lt/en/women/explore/polo-trans/9030156?ab=EU_PDP_W_Polo_Pre_Fall_Below_YMAL_Slot_1_S1_Image1_SHOP" --headed -o ./ralph_images
#
# Images are loaded via JS after hydration
# Some assets come from GraphQL/API calls
# Anti-bot/CDN protection blocks non-browser requests
# Images may require proper browser headers + cookies + referer
# Your image validation rejects AVIF/WebP variants incorrectly
# requests downloads get blocked even though Playwright sees them
#
# The biggest issue:
# Your intercept_images_playwright() captures the image URLs successfully, but later you download them again using requests.Session(). Those requests lose:
#
# browser cookies
# Cloudflare/session state
# signed headers
# referer chain
#
# So downloads fail or return HTML instead of image bytes.
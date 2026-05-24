const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const IMAGE_MIME_PREFIX = "image/";
const MIN_SIZE = 2048;

function upgradeImageUrl(url) {
    const replacements = [
        { pattern: /wid=\d+/g, repl: "wid=2500" },
        { pattern: /hei=\d+/g, repl: "hei=3000" },
        { pattern: /size=\d+/g, repl: "size=2500" }
    ];

    let upgraded = url;
    for (const { pattern, repl } of replacements) {
        upgraded = upgraded.replace(pattern, repl);
    }
    return upgraded;
}

function safeFilename(url, contentType) {
    const urlObj = new URL(url);
    let filename = path.basename(urlObj.pathname);
    filename = filename.split('?')[0];
    filename = filename.replace(/[^\w.\-]/g, '_');

    if (!filename.includes('.')) {
        const extMap = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/avif': '.avif',
            'image/svg+xml': '.svg'
        };
        const ext = extMap[contentType.split(';')[0]] || '.jpg';
        filename += ext;
    }

    const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
    const ext = path.extname(filename) || '.jpg';
    const stem = path.basename(filename, ext);

    return `${stem.substring(0, 80)}_${hash}${ext}`;
}

async function scrapeImages(taskId, url, outputDir, onProgress) {
    const taskDir = path.join(outputDir, taskId);
    if (!fs.existsSync(taskDir)) {
        fs.mkdirSync(taskDir, { parents: true });
    }

    const savedUrls = new Set();
    const results = [];

    const browser = await chromium.launch({
        headless: true,
        args: [
            "--disable-blink-features=AutomationControlled",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
        ]
    });

    const context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1920, height: 1080 },
        locale: "en-US",
    });

    const page = await context.newPage();

    // Stealth scripts
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    // Image interception
    page.on('response', async (response) => {
        try {
            const ct = response.headers()['content-type'] || "";
            const imageUrl = response.url();

            if (!ct.startsWith(IMAGE_MIME_PREFIX)) return;
            
            if (savedUrls.has(imageUrl)) return;
            savedUrls.add(imageUrl);

            console.log(`[DEBUG] Intercepted: ${imageUrl} (${ct})`);

            const buffer = await response.body();
            if (buffer.length < MIN_SIZE) {
                console.log(`[DEBUG] Skipped (too small: ${buffer.length} bytes): ${imageUrl}`);
                return;
            }

            const upgradedUrl = upgradeImageUrl(imageUrl);
            const filename = safeFilename(upgradedUrl, ct);
            const filepath = path.join(taskDir, filename);

            fs.writeFileSync(filepath, buffer);
            const relativePath = `${taskId}/${filename}`;
            results.push(relativePath);
            
            console.log(`[✓] Saved: ${filename} (${buffer.length} bytes)`);
            
            if (onProgress) onProgress(results.length, relativePath);

        } catch (e) {
            console.error(`[DEBUG] Response capture failed for ${response.url()}: ${e.message}`);
        }
    });

    try {
        // Use 'domcontentloaded' instead of 'networkidle' to avoid timeouts on busy sites
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait for a bit to let initial scripts run
        await page.waitForTimeout(5000);

        // Cookie banners - try to clear them to uncover images
        const cookieSelectors = [
            "#onetrust-accept-btn-handler",
            "button:has-text('Accept All')",
            "button:has-text('Accept')",
            ".accept-all",
            ".cookie-accept",
            "#close-pc-btn-handler", // OneTrust close
        ];

        for (const selector of cookieSelectors) {
            try {
                const locator = page.locator(selector);
                if (await locator.isVisible({ timeout: 3000 })) {
                    await locator.click();
                    console.log(`[INFO] Clicked cookie banner: ${selector}`);
                    await page.waitForTimeout(2000);
                }
            } catch (e) {}
        }

        // Scroll more aggressively to trigger lazy-loading
        console.log("[INFO] Scrolling to trigger lazy-loads...");
        for (let i = 0; i < 15; i++) {
            await page.mouse.wheel(0, 2000);
            await page.waitForTimeout(1000);
            
            // Periodically check if we've reached the bottom
            const isBottom = await page.evaluate(() => {
                return (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 100;
            });
            if (isBottom && i > 5) break;
        }

        // Give extra time for images to resolve after scrolling
        await page.waitForTimeout(5000);

        // Force images into view by iterating all img tags
        const images = page.locator('img');
        const count = await images.count();
        console.log(`[INFO] Found ${count} img tags, forcing visibility...`);
        for (let i = 0; i < Math.min(count, 50); i++) {
            try {
                await images.nth(i).scrollIntoViewIfNeeded({ timeout: 1000 });
                // Small random delay to seem more human
                await page.waitForTimeout(200 + Math.random() * 300);
            } catch (e) {}
        }

        // Final wait for network requests to finish
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
            console.log("[INFO] Network did not go idle, proceeding anyway...");
        });

    } catch (e) {
        console.error(`Scrape task ${taskId} failed:`, e);
        throw e;
    } finally {
        await browser.close();
    }

    return results;
}

module.exports = { scrapeImages };

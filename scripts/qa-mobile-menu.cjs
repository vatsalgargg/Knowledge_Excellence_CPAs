// Run against the local preview with PLAYWRIGHT_PATH pointing to Playwright if needed.
const assert = require('node:assert/strict');
require('node:fs').mkdirSync('.qa-output', { recursive: true });
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch(engine === chromium ? { channel: 'msedge' } : {});
    try {
      const page = await browser.newPage({ hasTouch: true });
      for (const [width, height] of [[320,568],[375,667],[390,844],[430,932],[667,375],[820,1180],[1024,768]]) {
        await page.setViewportSize({ width, height });
        await page.goto(process.env.QA_URL || 'http://127.0.0.1:5174/');
        const toggle = page.locator('#menuToggle');
        const menu = page.locator('#navLinks');
        await toggle.click();
        await page.waitForTimeout(250);
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        const geometry = await menu.evaluate(el => {
          const box = el.getBoundingClientRect();
          const link = el.querySelector('.nav-link');
          const cta = el.querySelector('.mobile-nav-cta').getBoundingClientRect();
          return { left: box.left, right: box.right, height: box.height, bottom: cta.bottom, color: getComputedStyle(link).color, linkHeight: link.getBoundingClientRect().height };
        });
        assert(geometry.left >= 0 && geometry.right <= width, 'Menu fits horizontally');
        assert(geometry.bottom <= height, 'Consultation fits the viewport');
        assert(geometry.height <= 300, 'Menu stays compact');
        assert(geometry.linkHeight >= 44, 'Links remain touch-friendly');
        assert.equal(geometry.color, 'rgb(19, 39, 45)', 'Menu text has contrast');
        if (width === 390 && engine === chromium) await page.screenshot({ path: '.qa-output/mobile-menu-fixed.png' });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        assert.equal(await menu.isVisible(), false);
        await toggle.click();
        await menu.locator('a[href="#services"]').click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await toggle.click();
        assert.equal(await menu.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
        await page.setViewportSize({ width: 1366, height: 768 });
        assert.equal(await menu.isVisible(), true);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        console.log(`${engine.name()} ${width}x${height}: PASS`);
      }
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

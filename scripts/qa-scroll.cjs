const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch(engine === chromium ? { channel: 'msedge' } : {});
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      await page.goto(process.env.QA_URL || 'http://127.0.0.1:5174/');
      const card = page.locator('.service-card').first();
      await page.waitForFunction(() => document.querySelector('.service-card').getAnimations().length > 0);
      assert.equal(await card.evaluate(el => getComputedStyle(el).opacity), '0');
      const timing = await card.evaluate(el => {
        const a = el.getAnimations()[0];
        return { duration: a.effect.getTiming().duration, delay: a.effect.getTiming().delay, state: a.playState };
      });
      assert.deepEqual(timing, { duration: 400, delay: 0, state: 'paused' });
      await card.evaluate(el => scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight + 50, behavior: 'instant' }));
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.service-card')).opacity === '1');
      assert.equal(await card.evaluate(el => getComputedStyle(el).filter), 'none');
      assert.equal(await card.evaluate(el => el.style.transform), '');
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      assert.equal(await card.evaluate(el => getComputedStyle(el).opacity), '1', 'Reveal must not repeat');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => [...document.querySelectorAll('.reveal-up,.reveal-left,.reveal-right')].every(el => getComputedStyle(el).opacity === '1'));
      console.log(`${engine.name()}: prepared reveal, completion, no duplicate movement, no replay, reduced motion PASS`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

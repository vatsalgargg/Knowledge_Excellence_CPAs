// Local browser checks. Use an installed Playwright via PLAYWRIGHT_PATH if needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.QA_URL || 'http://127.0.0.1:5174/';
const output = path.resolve('.qa-output');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [width, height] of [[320,568],[360,740],[375,667],[390,844],[430,932],[568,320],[667,375],[761,600],[768,1024],[820,1180],[1024,768],[1280,800],[1366,768],[1440,900],[1536,864],[1920,1080],[2560,1440]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('.service-card').count(), 5);
      assert.equal(await page.locator('.process-step').count(), 3);
      for (const selector of ['#home', '#about', '#services', '#process', '#contact', '.footer']) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        const overflow = await page.evaluate(() => {
          if (document.documentElement.scrollWidth <= innerWidth + 1) return [];
          return [...document.querySelectorAll('body *')].filter(el => {
            const r = el.getBoundingClientRect();
            return r.width && (r.right > innerWidth + 1 || r.left < -1) && !el.closest('[aria-hidden="true"]');
          }).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width }));
        });
        if (overflow.length) await page.screenshot({ path: path.join(output, 'overflow.png') });
        assert.deepEqual(overflow, [], `Horizontal overflow at ${width}: ${selector}`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Decorative overflow at ${width}: ${selector}`);
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      const navBoxes = await page.locator('.nav-container > *:visible').evaluateAll(elements => elements.map(el => {
        const r = el.getBoundingClientRect(); return {left:r.left, right:r.right};
      }));
      for (let i = 1; i < navBoxes.length; i++) assert(navBoxes[i].left >= navBoxes[i-1].right - 1, `Navbar overlap at ${width}`);
      await page.screenshot({ path: path.join(output, `desktop-${width}.png`), fullPage: width === 1440 || width === 390 });
      if (width < 761) {
        const toggle = page.locator('#menuToggle');
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        assert(await page.locator('.mobile-nav-cta').isVisible());
        const nav = await page.locator('#navLinks').boundingBox();
        assert(nav.x >= 0 && nav.x + nav.width <= width + 1, 'Mobile menu is clipped');
        await page.screenshot({ path: path.join(output, `menu-${width}.png`) });
        await page.keyboard.press('Escape');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await toggle.click();
        await page.locator('#navLinks a[href="#services"]').click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await toggle.click();
        const ctaBox = await page.locator('.mobile-nav-cta').boundingBox();
        assert(ctaBox.y + ctaBox.height <= height, 'Mobile consultation button below viewport');
        await page.locator('.mobile-nav-cta').click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      }
      await page.locator('#contact').scrollIntoViewIfNeeded();
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.evaluate(() => scrollY), 0, 'Reload did not reset scroll');
      console.log(`PASS ${width}px: sections fit, mobile menu, refresh-to-top`);
    }
    const phone = await browser.newPage({ viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3 });
    await phone.goto(base, {waitUntil:'networkidle'});
    assert.equal(await phone.evaluate(() => innerWidth), 390, 'Mobile viewport scaled unexpectedly');
    for (const selector of ['.hero-actions .btn','.mobile-menu-toggle','.footer-links a','.contact-detail a']) {
      for (const box of await phone.locator(selector).evaluateAll(els => els.map(el => el.getBoundingClientRect().height))) assert(box >= 44, `Small touch target: ${selector}`);
    }
    await phone.locator('#contact').scrollIntoViewIfNeeded();
    assert.equal(await phone.locator('#email').evaluate(el=>getComputedStyle(el).fontSize), '16px', 'Phone inputs can trigger automatic zoom');
    await phone.screenshot({path:path.join(output,'touch-contact.png')});
    await phone.close();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base, { waitUntil: 'networkidle' });
    const original = execFileSync('git', ['show', 'HEAD:index.html'], { encoding: 'utf8' });
    const missingCopy = await page.evaluate(original => {
      const baseline = new DOMParser().parseFromString(original, 'text/html');
      const clean = value => value.replace(/\s+/g, ' ').trim();
      const current = clean(document.body.textContent);
      return [...baseline.querySelectorAll('h1,h2,h3,h4,p,label,.contact-detail')]
        .filter(el => !el.closest('#pageLoader'))
        .map(el => clean(el.textContent)).filter(text => text && !current.includes(text));
    }, original);
    assert.deepEqual(missingCopy, [], 'Original business content changed');
    await page.screenshot({ path: path.join(output, 'hero.png') });
    const initial = await page.locator('.hero-photo').evaluate(el => el.style.transform);
    await page.evaluate(() => scrollTo({ top: 300, behavior: 'instant' }));
    await page.waitForTimeout(150);
    assert.notEqual(await page.locator('.hero-photo').evaluate(el => el.style.transform), initial, 'Hero photograph did not respond to scroll');
    await page.screenshot({ path: path.join(output, 'hero-scrolled.png') });
    await page.locator('.service-card').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    const cardTransform = await page.locator('.service-card').first().evaluate(el => el.style.transform);
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
      await page.waitForTimeout(30);
    }
    assert.equal(await page.locator('.service-card').first().evaluate(el => el.style.transform), cardTransform, 'Card transform feeds back into scroll geometry');
    assert(await page.locator('.service-card').first().evaluate(el => el.classList.contains('motion-entered')), 'Card reveal did not run');
    await page.screenshot({ path: path.join(output, 'motion-services.png') });
    for (let i = 0; i < 5; i++) {
      await page.locator('.service-card').nth(i).scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      assert.equal(await page.locator('.service-photo.is-active').count(), 1, 'Photo sequence must have one active image');
      assert.equal(await page.locator('.service-photo-index').textContent(), `0${i+1} / 05`, 'Photo sequence out of sync');
    }
    await page.locator('.service-card').nth(1).scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    const pinnedTop = await page.locator('.service-media').evaluate(el => el.getBoundingClientRect().top);
    await page.evaluate(() => scrollBy({ top: 100, behavior: 'instant' }));
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.service-media').evaluate(el=>el.getBoundingClientRect().top), pinnedTop, 'Service photo is not pinned');
    assert(await page.locator('.hero-photo').evaluate(el=>el.complete && el.naturalWidth>0), 'Hero asset did not load');
    await page.locator('.stats-banner').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1300);
    const statHeights = await page.locator('.stat-item').evaluateAll(els=>els.map(el=>el.offsetHeight));
    assert(Math.max(...statHeights)-Math.min(...statHeights)<2, 'Credential cards are unequal');
    assert(Math.max(...statHeights)<180, 'Credential cards are oversized');
    await page.screenshot({path:path.join(output,'credentials.png')});
    await page.locator('#process').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1300);
    const stepTop = await page.locator('.process-steps').evaluate(el=>el.getBoundingClientRect().top+scrollY);
    await page.evaluate(y=>scrollTo({top:y+120,behavior:'instant'}),stepTop);
    await page.waitForTimeout(1300);
    const processScale = await page.locator('.process-step').first().evaluate(el=>el.style.transform);
    await page.evaluate(()=>scrollBy({top:200,behavior:'instant'}));
    await page.waitForTimeout(200);
    assert.notEqual(await page.locator('.process-step').first().evaluate(el=>el.style.transform),processScale,'Stacked card scaling did not respond to scroll');
    await page.screenshot({path:path.join(output,'process-stack.png')});
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.hero-photo').evaluate(el => el.style.transform), '', 'Reduced motion not applied');
    assert.equal(await page.locator('.service-card').first().evaluate(el => el.style.transform), '', 'Reduced motion did not reset card effects');
    assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0, 'Reduced motion left animations running');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // Intercept delivery: QA must not send any real email or contact submission.
    let submissions = 0;
    await page.route('https://formspree.io/**', route => {
      submissions++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.locator('#submitBtn').click();
    assert.equal(submissions, 0, 'Invalid form submitted');
    assert.equal(await page.locator('#name').getAttribute('aria-invalid'), 'true');
    await page.locator('#name').fill('Test Client');
    await page.locator('#phone').fill('+1 555 000 0000');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#message').fill('Local browser test. Delivery is mocked.');
    await page.locator('#submitBtn').click();
    await page.waitForFunction(() => document.querySelector('#formStatus').classList.contains('success'));
    assert.equal(submissions, 1);
    assert.equal(await page.locator('#msgCounter').textContent(), '0 / 2000');
    // Privacy settings may deny storage. The form must still validate and work.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#name').fill('Test Client');
    await page.locator('#phone').fill('+1 555 000 0000');
    await page.locator('#email').fill('test@example.com');
    await page.locator('#submitBtn').click();
    await page.waitForFunction(() => document.querySelector('#formStatus').classList.contains('success'));
    assert.equal(submissions, 2);
    assert.deepEqual(errors, [], 'Uncaught browser errors');
    console.log('PASS business content preserved, scroll transforms, reduced motion, validation, mocked delivery and blocked-storage browsers; zero page errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

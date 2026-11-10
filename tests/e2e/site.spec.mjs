// End-to-end checks: every page loads cleanly under the production CSP, is
// accessible (axe, WCAG 2.1 AA), and the key journeys work on desktop and phone.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['/', '/privacy', '/terms'];

// Collect console errors, CSP violations and failed same-origin requests for a page.
async function watch(page) {
  const problems = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => {
      window.__cspViolations = window.__cspViolations || [];
      window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on('console', msg => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`exception: ${err.message}`));
  page.on('requestfailed', req => {
    if (req.url().startsWith('http://127.0.0.1') && !/net::ERR_ABORTED/.test(req.failure()?.errorText)) problems.push(`request failed: ${req.url()}`);
  });
  page.on('response', res => {
    if (res.url().startsWith('http://127.0.0.1') && res.status() >= 400 && !res.url().includes('/does-not-exist')) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  return problems;
}

// Third-party resources (the visitor badge) are blocked in CI so tests never depend on them.
// Every test except the Partner Pass ones starts with the pass already seen this session,
// so it never opens mid-journey when a test scrolls or clicks.
test.beforeEach(async ({ page }, testInfo) => {
  if (!testInfo.title.includes('Partner Pass')) {
    await page.addInitScript(() => { try { sessionStorage.setItem('kecpa:partner-pass', 'dismissed'); } catch {} });
  }
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }));
});

async function closePartnerPass(page) {
  const pass = page.locator('#partnerPass');
  if (await pass.count() === 0) return; // only the homepage has the Partner Pass
  if (await pass.evaluate(d => d.open)) {
    await page.locator('#ppLater').click();
    await expect(pass).not.toHaveAttribute('open', '');
  }
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight * 0.75) {
      scrollTo(0, y);
      await new Promise(r => setTimeout(r, 80));
    }
    scrollTo(0, 0);
  });
}

for (const path of PAGES) {
  test(`${path} loads cleanly: no errors, CSP violations, broken images or overflow`, async ({ page }) => {
    const problems = await watch(page);
    const response = await page.goto(path);
    expect(response.status()).toBe(200);
    if (path === '/') await page.waitForTimeout(900);
    await closePartnerPass(page);
    await scrollThrough(page);
    await page.waitForLoadState('networkidle');

    const state = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        csp: window.__cspViolations || [],
        inter: document.fonts.check('500 16px Inter'),
        playfair: document.fonts.check('400 32px "Playfair Display"'),
        icons: !document.querySelector('.fas') || document.fonts.check('900 16px "Font Awesome 6 Free"'),
        brokenImages: [...document.images].filter(img => img.complete && img.currentSrc && img.naturalWidth === 0).map(img => img.currentSrc),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        title: document.title,
      };
    });
    expect(problems, problems.join('\n')).toEqual([]);
    expect(state.csp, 'CSP violations').toEqual([]);
    expect(state.inter && state.playfair, 'self-hosted fonts load').toBe(true);
    expect(state.icons, 'icon font loads').toBe(true);
    expect(state.brokenImages, 'broken images').toEqual([]);
    expect(state.overflow, 'horizontal overflow').toBe(false);
    expect(state.title).toMatch(/\| (Knowledge Excellence CPAs|KECPA)$/);
  });

  test(`${path} has no serious accessibility violations (WCAG 2.1 AA)`, async ({ page }) => {
    // Reduced motion renders every element in its final state, so contrast is never
    // sampled mid-fade; it also covers the experience of motion-sensitive visitors.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    if (path === '/') await page.waitForTimeout(900);
    await closePartnerPass(page);
    await scrollThrough(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('#pageLoader')
      .analyze();
    const serious = results.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    expect(serious.map(v => `${v.id}: ${v.help} (${v.nodes.length}× e.g. ${v.nodes[0].target.join(' ')})`)).toEqual([]);
  });
}

test('unknown pages return the branded 404 with status 404', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response.status()).toBe(404);
  await expect(page).toHaveTitle(/Page not found/);
});

test('legal pages redirect once from .html and never loop', async ({ request }) => {
  for (const name of ['privacy', 'terms']) {
    const first = await request.get(`/${name}.html`, { maxRedirects: 0 });
    expect(first.status(), 'permanent redirect from _redirects').toBe(301);
    expect(first.headers().location).toBe(`/${name}`);
    const final = await request.get(`/${name}.html`);
    expect(final.status()).toBe(200);
  }
});

test('private files are never served', async ({ request }) => {
  for (const path of ['/worker.js', '/wrangler.toml', '/package.json', '/package-lock.json', '/_headers', '/_redirects',
    '/RULES.md', '/README.md', '/.git/config', '/.env', '/scripts/check-site.mjs', '/output/video/kecpa-partnership-4k.mp4',
    '/node_modules/vite/package.json', '/.github/workflows/validate.yml']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
  }
});

test('security headers are present on pages and assets', async ({ request }) => {
  for (const path of ['/', '/privacy', '/index.css', '/fonts/inter-latin.woff2']) {
    const h = (await request.get(path)).headers();
    expect(h['strict-transport-security'], path).toContain('max-age=31536000');
    expect(h['x-content-type-options'], path).toBe('nosniff');
    expect(h['x-frame-options'], path).toBe('DENY');
    expect(h['content-security-policy'], path).toContain("object-src 'none'");
    expect(h['content-security-policy'], path).toContain("frame-ancestors 'none'");
  }
});

test('AI agents get Markdown from the homepage', async ({ request }) => {
  const res = await request.get('/', { headers: { Accept: 'text/markdown' } });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/markdown');
  expect(await res.text()).toMatch(/^# Knowledge Excellence CPAs/);
});

test.describe('homepage journeys', () => {
  test('Partner Pass never covers the page on arrival', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    await expect(page.locator('#partnerPass')).not.toHaveAttribute('open', '');
    await expect(page.locator('html')).not.toHaveClass(/pp-open/);
  });

  test('Partner Pass opens once per session after scrolling halfway (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'phones skip auto-open on the first view');
    await page.goto('/');
    const pass = page.locator('#partnerPass');
    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 300); // a real scroll, but not halfway yet
    await page.waitForTimeout(400);
    await expect(pass).not.toHaveAttribute('open', '');
    await page.evaluate(() => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.6));
    await expect(pass).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(pass).not.toHaveAttribute('open', '');
    await expect(page.locator('html')).not.toHaveClass(/pp-open/);

    // Same session: no second auto-open, the reopen tab is offered instead.
    await page.reload();
    await page.mouse.wheel(0, 300);
    await page.evaluate(() => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.6));
    await page.waitForTimeout(600);
    await expect(pass).not.toHaveAttribute('open', '');
    await page.locator('#ppReopen').click();
    await expect(pass).toHaveAttribute('open', '');
  });

  test('Partner Pass does not auto-open on a phone\'s first view', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('/');
    const pass = page.locator('#partnerPass');
    await page.evaluate(() => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 0.6));
    await page.waitForTimeout(600);
    await expect(pass).not.toHaveAttribute('open', '');
    await page.locator('#ppReopen').click();
    await expect(pass).toHaveAttribute('open', '');
  });

  test('intro video never autoplays and plays only on click', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(900);
    const idle = await page.evaluate(() => [...document.querySelectorAll('video')].every(v => v.paused && v.readyState === 0));
    expect(idle, 'no video plays or downloads on load').toBe(true);
    await page.locator('.hero-video-link').click();
    const modal = page.locator('#videoModal');
    await expect(modal).toHaveAttribute('open', '');
    expect(await page.locator('#modalVideo').evaluate(v => v.paused)).toBe(true);
    await modal.locator('.intro-video-play').click();
    await expect.poll(() => page.locator('#modalVideo').evaluate(v => !v.paused && v.currentTime > 0.2), { timeout: 10_000 }).toBe(true);
    expect(await page.locator('#modalVideo').evaluate(v => v.textTracks[0]?.cues?.length ?? 0)).toBeGreaterThan(5);
    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveAttribute('open', '');
    expect(await page.locator('#modalVideo').evaluate(v => v.paused)).toBe(true);
    await expect(page.locator('html')).not.toHaveClass(/pp-open/);
  });

  test('FAQ answers expand', async ({ page }) => {
    await page.goto('/#faq');
    await closePartnerPass(page);
    const item = page.locator('.faq-item').first();
    // The list slides in when it enters the view; click only once it has settled.
    await item.scrollIntoViewIfNeeded();
    await page.locator('.faq-list').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
    await item.locator('summary').click();
    await expect(item).toHaveAttribute('open', '');
    await expect(item.locator('p')).toBeVisible();
  });

  test('contact form blocks invalid input and submits valid input (mocked)', async ({ page }) => {
    let submissions = 0;
    await page.route('https://formspree.io/**', route => { submissions++; route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await page.goto('/#contact');
    await closePartnerPass(page);
    await page.locator('#submitBtn').click();
    await expect(page.locator('#name_err')).toBeVisible();
    expect(submissions, 'invalid form must not be sent').toBe(0);

    await page.fill('#name', 'Test Person');
    await page.fill('#phone', '+1 555 010 2000');
    await page.fill('#email', 'test@example.com');
    await page.selectOption('#service', { index: 1 });
    await page.fill('#message', 'Automated CI test message.');
    await page.locator('#submitBtn').click();
    await expect(page.locator('#formStatus')).not.toBeEmpty({ timeout: 10_000 });
    expect(submissions).toBe(1);
  });
});

test('mobile menu opens, closes with Esc and links work', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only');
  await page.goto('/');
  await closePartnerPass(page);
  const toggle = page.locator('#menuToggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.locator('#navLinks a[href="#services"]').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page).toHaveURL(/#services$/);
});

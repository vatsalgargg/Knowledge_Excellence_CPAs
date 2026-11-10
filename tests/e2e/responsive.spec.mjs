// Layout checks across real device sizes, from a 320px phone to a 2560px monitor.
// Each page and size must have: no sideways scrolling, no element or text spilling
// past the screen or out of its box, tap targets of at least 24x24px on touch screens
// (WCAG 2.2 target size), no text smaller than 11px, and no stretched images.
// A full-page screenshot of every size is attached to the report for review.
import { test, expect } from '@playwright/test';

const PAGES = ['/', '/privacy', '/terms'];

const SIZES = [
  { name: 'phone-320', width: 320, height: 568, touch: true },   // smallest phones still in use
  { name: 'phone-360', width: 360, height: 800, touch: true },   // common Android
  { name: 'phone-375', width: 375, height: 667, touch: true },   // iPhone SE
  { name: 'phone-390', width: 390, height: 844, touch: true },   // iPhone 13-15
  { name: 'phone-430', width: 430, height: 932, touch: true },   // iPhone Pro Max
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
  { name: 'tablet-768', width: 768, height: 1024, touch: true }, // iPad portrait
  { name: 'tablet-1024', width: 1024, height: 768, touch: true },// iPad landscape
  { name: 'laptop-1280', width: 1280, height: 800, touch: false },
  { name: 'desktop-1440', width: 1440, height: 900, touch: false },
  { name: 'desktop-1920', width: 1920, height: 1080, touch: false },
  { name: 'desktop-2560', width: 2560, height: 1440, touch: false },
];

// Runs in the page: returns every layout problem found at the current size.
function findLayoutProblems({ touch }) {
  const problems = [];
  const vw = document.documentElement.clientWidth;
  const label = el => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `<${el.tagName.toLowerCase()}${id}${cls}>${text ? ` "${text}"` : ''}`;
  };
  const isShown = el => {
    if (el.closest('[hidden], [aria-hidden="true"], dialog:not([open]), #pageLoader, .sr-only, .visually-hidden')) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // True when an ancestor clips the element, so overflow past it is not visible.
  const clipped = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX + s.overflow)) return true;
      if (s.position === 'fixed') return false;
    }
    return false;
  };

  if (document.documentElement.scrollWidth > vw + 1) {
    problems.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px content in a ${vw}px screen`);
  }

  for (const el of document.body.querySelectorAll('*')) {
    if (!isShown(el)) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);

    // Off-canvas menus are intentionally parked outside the screen while closed.
    const offCanvas = s.position === 'fixed' && (r.left >= vw - 1 || r.right <= 1);
    if (!offCanvas && (r.right > vw + 1 || r.left < -1) && !clipped(el)) {
      problems.push(`${label(el)} extends past the screen (${Math.round(r.left)}..${Math.round(r.right)} of ${vw}px)`);
    }

    // Text that does not fit its own box (long words, fixed widths).
    if (/^(H[1-6]|P|A|BUTTON|LABEL|LI|SUMMARY|DT|DD|TD|TH)$/.test(el.tagName)
      && s.overflowX === 'visible' && s.display !== 'inline' && el.scrollWidth > el.clientWidth + 2 && !clipped(el)) {
      problems.push(`${label(el)} text spills out of its box (${el.scrollWidth}px in ${el.clientWidth}px)`);
    }

    // Readable text: nothing smaller than 11px (the site's small uppercase labels).
    // Logotypes are exempt, as in WCAG.
    const ownText = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (ownText && parseFloat(s.fontSize) < 11 && !el.closest('.logo, .nav-logo, .footer-logo, [class*="logo"]')) {
      problems.push(`${label(el)} text is ${s.fontSize}, smaller than 11px`);
    }

    // Stretched or squashed images.
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth && s.objectFit === 'fill') {
      const natural = el.naturalWidth / el.naturalHeight;
      const shown = r.width / r.height;
      if (Math.abs(shown / natural - 1) > 0.05) problems.push(`${label(el)} image is distorted (${natural.toFixed(2)} shown at ${shown.toFixed(2)})`);
    }
  }

  // Touch targets: 24x24px minimum (WCAG 2.2 SC 2.5.8). Links that sit in a line of
  // text (e.g. "Email: <a>") are exempt, as the criterion allows.
  if (touch) {
    const targets = document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])');
    for (const el of targets) {
      if (!isShown(el)) continue;
      const s = getComputedStyle(el);
      const besideText = [...(el.parentElement?.childNodes || [])].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      const inSentence = s.display === 'inline' && (besideText || el.closest('p, li, td, dd, address, small, figcaption, label'));
      if (inSentence) continue;
      const r = el.getBoundingClientRect();
      if (Math.round(r.width) < 24 || Math.round(r.height) < 24) {
        problems.push(`${label(el)} tap target is ${Math.round(r.width)}x${Math.round(r.height)}px, below 24x24px`);
      }
    }
  }

  return [...new Set(problems)];
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      isMobile: size.touch && size.width < 1024,
      hasTouch: size.touch,
    });

    for (const path of PAGES) {
      test(`${path} fits ${size.width}x${size.height}`, async ({ page }, testInfo) => {
        // Third-party requests are stubbed; the Partner Pass counts as already seen so it
        // never covers the layout being measured. Reduced motion shows final positions.
        await page.addInitScript(() => { try { sessionStorage.setItem('kecpa:partner-pass', 'dismissed'); } catch {} });
        await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }));
        await page.emulateMedia({ reducedMotion: 'reduce' });

        const response = await page.goto(path);
        expect(response.status()).toBe(200);
        await page.evaluate(async () => {
          await document.fonts.ready;
          // Load lazy images so their real size is measured.
          for (let y = 0; y < document.body.scrollHeight; y += innerHeight) {
            scrollTo(0, y);
            await new Promise(r => { setTimeout(r, 60); });
          }
          scrollTo(0, 0);
        });
        await page.waitForLoadState('networkidle');

        const problems = await page.evaluate(findLayoutProblems, { touch: size.touch });

        const file = testInfo.outputPath(`${size.name}${path === '/' ? '-home' : path.replace('/', '-')}.png`);
        await page.screenshot({ path: file, fullPage: true });
        await testInfo.attach('screenshot', { path: file, contentType: 'image/png' });

        expect(problems, problems.join('\n')).toEqual([]);
      });
    }
  });
}

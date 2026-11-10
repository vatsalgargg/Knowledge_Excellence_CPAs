// Lighthouse on every page, as a phone (slow 4G, mid-range CPU) and as a desktop,
// against the production-faithful local server. Fails when a category score or a
// Core Web Vital misses its budget. Reports go to lighthouse-report/.
//   node scripts/check-lighthouse.mjs            (uses Playwright's Chromium)
//   CHROME_PATH=/path/to/chrome node scripts/check-lighthouse.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from '@playwright/test';
import { ROOT } from './lib/deploy-set.mjs';

const PORT = Number(process.env.LH_PORT) || 4180;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGES = ['/', '/privacy', '/terms'];
const OUT = join(ROOT, 'lighthouse-report');

// Minimum category scores (0-100) and Core Web Vital ceilings, per form factor.
const BUDGETS = {
  mobile: { scores: { performance: 85, accessibility: 95, 'best-practices': 95, seo: 95 }, lcp: 3500, cls: 0.1, tbt: 300 },
  desktop: { scores: { performance: 95, accessibility: 95, 'best-practices': 95, seo: 95 }, lcp: 1500, cls: 0.1, tbt: 150 },
};
// Simulated throttling still varies a little between runs; the best of RUNS is kept.
const RUNS = Number(process.env.LH_RUNS) || 2;

const server = spawn(process.execPath, [join(ROOT, 'scripts/serve-static.mjs'), '--port', String(PORT)], { stdio: 'ignore' });
const chrome = await launch({
  chromePath: process.env.CHROME_PATH || chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--mute-audio'],
});

const failures = [];
const rows = [];
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch {}
    await new Promise(r => { setTimeout(r, 200); });
  }
  mkdirSync(OUT, { recursive: true });

  for (const [form, budget] of Object.entries(BUDGETS)) {
    const config = form === 'desktop' ? (await import('lighthouse/core/config/desktop-config.js')).default : undefined;
    for (const path of PAGES) {
      let best;
      for (let run = 0; run < RUNS; run++) {
        const result = await lighthouse(`${BASE}${path}`, { port: chrome.port, output: 'html', logLevel: 'error' }, config);
        if (!best || result.lhr.categories.performance.score > best.lhr.categories.performance.score) best = result;
      }
      const { lhr, report } = best;
      const name = `${form}${path === '/' ? '-home' : path.replace('/', '-')}`;
      writeFileSync(join(OUT, `${name}.html`), report);

      const score = id => Math.round((lhr.categories[id]?.score ?? 0) * 100);
      const metric = id => lhr.audits[id]?.numericValue ?? Infinity;
      const row = { page: `${form} ${path}`, perf: score('performance'), a11y: score('accessibility'), bp: score('best-practices'), seo: score('seo'),
        lcp: Math.round(metric('largest-contentful-paint')), cls: +metric('cumulative-layout-shift').toFixed(3), tbt: Math.round(metric('total-blocking-time')) };
      rows.push(row);

      for (const [id, min] of Object.entries(budget.scores)) {
        if (score(id) < min) {
          const failed = lhr.categories[id].auditRefs.map(ref => lhr.audits[ref.id])
            .filter(a => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'manual')
            .map(a => a.title).slice(0, 6);
          failures.push(`${row.page}: ${id} ${score(id)} < ${min}${failed.length ? ` (${failed.join('; ')})` : ''}`);
        }
      }
      if (row.lcp > budget.lcp) failures.push(`${row.page}: LCP ${row.lcp}ms > ${budget.lcp}ms`);
      if (row.cls > budget.cls) failures.push(`${row.page}: CLS ${row.cls} > ${budget.cls}`);
      if (row.tbt > budget.tbt) failures.push(`${row.page}: TBT ${row.tbt}ms > ${budget.tbt}ms`);
    }
  }
} finally {
  await chrome.kill();
  server.kill();
}

console.table(rows);
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = ['| Page | Perf | A11y | Best practices | SEO | LCP | CLS | TBT |', '|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.page} | ${r.perf} | ${r.a11y} | ${r.bp} | ${r.seo} | ${r.lcp} ms | ${r.cls} | ${r.tbt} ms |`)].join('\n');
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## Lighthouse\n\n${md}\n`, { flag: 'a' });
}
if (failures.length) {
  console.error(`\nLighthouse budgets missed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('Lighthouse budgets met on every page (mobile and desktop).');

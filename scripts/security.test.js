import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import worker from '../worker.js';

test('deployment allowlist excludes internal, nested and future secret files', () => {
  const publicFiles = ['index.html', 'index.css', 'script.js', 'privacy.html', 'terms.html',
    '404.html', '404.css', 'logo.png', 'logo-modified.png', 'og-image.jpg', 'robots.txt',
    'sitemap.xml', 'llms.txt', '.well-known/security.txt',
    'financial-hero.webp', 'financial-hero-small.webp',
    'financial-accounting.webp', 'financial-accounting-small.webp',
    'financial-advisory.webp', 'financial-advisory-small.webp',
    'financial-tax.webp', 'financial-tax-small.webp',
    'financial-bookkeeping.webp', 'financial-bookkeeping-small.webp'];
  const privateFiles = ['worker.js', 'wrangler.toml', 'package.json', 'package-lock.json',
    '.env', '.env.production', '.dev.vars', 'credentials.json', 'private.key',
    '.git/config', '_headers', '_redirects', 'RULES.md', 'scripts/security.test.js', 'src/main.tsx',
    'node_modules/example/index.js', 'dist/index.html', '.well-known/private.json'];
  const output = execFileSync('git', ['-c', `core.excludesFile=${resolve('.assetsignore')}`,
    'check-ignore', '--no-index', '--stdin'], {
    input: [...publicFiles, ...privateFiles].join('\n') + '\n', encoding: 'utf8',
  }).trim().split(/\r?\n/);
  assert.deepEqual(new Set(output), new Set(privateFiles));
  publicFiles.forEach(file => assert(existsSync(file), `Missing public asset: ${file}`));
});

test('manifest versions are exact and match the dependency lockfile', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  for (const group of ['dependencies', 'devDependencies']) {
    assert.deepEqual(manifest[group], lock.packages[''][group]);
    for (const [name, version] of Object.entries(manifest[group])) {
      assert.match(version, /^\d+\.\d+\.\d+$/);
      assert.equal(lock.packages[`node_modules/${name}`].version, version);
    }
  }
});

test('asset failures return a secure generic response without logging private input', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', message => logs.push(JSON.parse(message)));
  const request = new Request('https://example.com/?email=private@example.com');
  const response = await worker.fetch(request, { ASSETS: { fetch() {
    throw new Error('private provider failure');
  } } });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(await response.text(), 'Service temporarily unavailable.');
  assert.deepEqual(logs, [{ event: 'ASSET_FETCH_FAILED' }]);
});

test('upstream 5xx responses log status only and retain their response', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', message => logs.push(JSON.parse(message)));
  const response = await worker.fetch(new Request('https://example.com/index.css?secret=value'), {
    ASSETS: { fetch: async () => new Response('Unavailable', { status: 502 }) },
  });
  assert.equal(response.status, 502);
  assert.deepEqual(logs, [{ event: 'ASSET_SERVER_ERROR', status: 502 }]);
});

test('HTML, markdown and custom 404 behavior remain intact', async () => {
  const env = { ASSETS: { fetch: async request => {
    const path = new URL(request.url).pathname;
    if (path === '/llms.txt') return new Response('# Public site');
    if (path === '/404.html') return new Response('Not found', { headers: { 'X-Content-Type-Options': 'nosniff' } });
    return new Response('Home', { status: path === '/' ? 200 : 404 });
  } } };
  const html = await worker.fetch(new Request('https://example.com/'), env);
  assert.equal(await html.text(), 'Home');
  assert.equal(html.headers.get('Vary'), 'Accept');
  const markdown = await worker.fetch(new Request('https://example.com/', { headers: { Accept: 'text/markdown' } }), env);
  assert.equal(await markdown.text(), '# Public site');
  assert.equal(markdown.headers.get('X-Content-Type-Options'), 'nosniff');
  const missing = await worker.fetch(new Request('https://example.com/missing'), env);
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), 'Not found');
});

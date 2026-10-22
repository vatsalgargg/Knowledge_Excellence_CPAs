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
    'financial-bookkeeping.webp', 'financial-bookkeeping-small.webp',
    'kecpa-video-1080.mp4', 'kecpa-video-720.mp4', 'kecpa-video-1080.av1.mp4', 'kecpa-video-720.av1.mp4',
    'kecpa-video-poster.webp', 'kecpa-video.en.vtt', 'fonts.css', 'legal.css', 'fonts/inter-latin.woff2',
    'fonts/playfair-latin.woff2', 'fonts/playfair-italic-latin.woff2', 'fonts/fa-icons.woff2',
    'logo-mark.webp', 'favicon-32.png', 'favicon-192.png', 'apple-touch-icon.png'];
  const privateFiles = ['worker.js', 'wrangler.toml', 'package.json', 'package-lock.json',
    '.env', '.env.production', '.dev.vars', 'credentials.json', 'private.key',
    '.git/config', '_headers', '_redirects', 'RULES.md', 'scripts/security.test.js', 'src/main.tsx',
    'node_modules/example/index.js', 'dist/index.html', '.well-known/private.json',
    'output/video/kecpa-partnership-4k.mp4', 'fonts/unreviewed.woff2'];
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

test('static media gets long cache headers while pages and code revalidate', async () => {
  const env = { ASSETS: { fetch: async () => new Response('x', { headers: { 'X-Content-Type-Options': 'nosniff' } }) } };
  const cacheOf = async path => (await worker.fetch(new Request(`https://example.com${path}`), env)).headers;
  assert.equal((await cacheOf('/fonts/inter-latin.woff2')).get('Cache-Control'), 'public, max-age=31536000, immutable');
  const video = await cacheOf('/kecpa-video-1080.mp4');
  assert.match(video.get('Cache-Control'), /max-age=2592000/);
  assert.equal(video.get('X-Content-Type-Options'), 'nosniff');
  for (const path of ['/index.css', '/script.js', '/privacy']) assert.equal((await cacheOf(path)).get('Cache-Control'), null);
});

test('CSP allows no third-party styles, fonts or plugins', async () => {
  const csp = readFileSync('_headers', 'utf8').match(/Content-Security-Policy: (.+)/)[1];
  assert.match(csp, /style-src 'self';/);
  assert.match(csp, /font-src 'self';/);
  assert.match(csp, /object-src 'none'/);
  const response = await worker.fetch(new Request('https://example.com/', { headers: { Accept: 'text/markdown' } }),
    { ASSETS: { fetch: async () => new Response('# md') } });
  assert.equal(response.headers.get('Content-Security-Policy'), csp, 'worker CSP must mirror _headers');
});

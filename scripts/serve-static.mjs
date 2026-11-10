// Production-faithful local server for tests: serves ONLY the files Cloudflare
// would deploy, applies _headers, _redirects and Cloudflare's default
// "auto-trailing-slash" HTML handling, compresses text like the edge, and routes
// requests through the real worker.js exactly as wrangler.toml configures.
//   node scripts/serve-static.mjs [--port 4173]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { ROOT, deployableFiles } from './lib/deploy-set.mjs';

const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 4173;
const files = new Set(deployableFiles());
const read = file => readFileSync(join(ROOT, file));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.vtt': 'text/vtt',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4',
};

// _headers: blocks of "<pattern>" followed by indented "Name: value" lines; "*" is a splat.
const headerRules = [];
for (const line of read('_headers').toString().replace(/\r/g, '').split('\n')) {
  if (!line.trim() || line.trimStart().startsWith('#')) continue;
  if (!line.startsWith(' ')) {
    const pattern = new RegExp('^' + line.trim().split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    headerRules.push({ pattern, headers: [] });
  } else {
    const i = line.indexOf(':');
    headerRules.at(-1).headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
}
const redirects = read('_redirects').toString().replace(/\r/g, '').split('\n')
  .filter(l => l.trim() && !l.startsWith('#')).map(l => l.trim().split(/\s+/)).map(([from, to, status]) => ({ from, to, status: Number(status || 302) }));
const wrangler = read('wrangler.toml').toString();
const workerFirstMatch = wrangler.match(/^run_worker_first\s*=\s*(.+)$/m);
const workerFirst = workerFirstMatch ? JSON.parse(workerFirstMatch[1].replace(/'/g, '"')) : false;

function withHeaders(path, init) {
  const headers = new Headers(init);
  for (const rule of headerRules) if (rule.pattern.test(path)) for (const [k, v] of rule.headers) headers.set(k, v);
  return headers;
}

// The static asset layer (what env.ASSETS.fetch does on Cloudflare).
async function assets(request) {
  const url = new URL(request.url);
  let path = decodeURIComponent(url.pathname);
  const redirect = redirects.find(r => r.from === path);
  if (redirect) return new Response(null, { status: redirect.status, headers: withHeaders(path, { Location: redirect.to }) });
  // Observed on production: /privacy.html redirects to /privacy, but the Worker's
  // ASSETS.fetch('/404.html') is served directly (the branded 404 page works).
  if (path.endsWith('.html') && path !== '/404.html' && files.has(path.slice(1))) {
    const clean = path === '/index.html' ? '/' : path.replace(/\.html$/, '');
    return new Response(null, { status: 307, headers: withHeaders(path, { Location: clean }) });
  }
  let file = path === '/' ? 'index.html' : path.slice(1);
  if (!files.has(file) && files.has(file + '.html')) file += '.html';
  if (!files.has(file)) return new Response('Not found', { status: 404, headers: withHeaders(path, { 'Content-Type': 'text/plain' }) });
  let body = read(file);
  const headers = withHeaders(path, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
  const range = request.headers.get('Range')?.match(/bytes=(\d+)-(\d*)/);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : body.length - 1;
    headers.set('Content-Range', `bytes ${start}-${end}/${body.length}`);
    return new Response(body.subarray(start, end + 1), { status: 206, headers });
  }
  if (/text|javascript|json|xml|svg|vtt/.test(headers.get('Content-Type')) && /br/.test(request.headers.get('Accept-Encoding') || '')) {
    body = brotliCompressSync(body);
    headers.set('Content-Encoding', 'br');
  }
  return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
}

const worker = (await import(new URL('../worker.js', import.meta.url))).default;
const env = { ASSETS: { fetch: req => assets(req instanceof Request ? req : new Request(req)) } };

async function route(request) {
  const path = new URL(request.url).pathname;
  const first = workerFirst === true || (Array.isArray(workerFirst) && workerFirst.includes(path));
  if (first) return worker.fetch(request, env);
  const asset = await assets(request);
  // Cloudflare falls through to the Worker only when no asset matches.
  return asset.status === 404 ? worker.fetch(request, env) : asset;
}

createServer(async (req, res) => {
  try {
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers: req.headers });
    const response = await route(request);
    // This server is plain HTTP. Production is HTTPS, where upgrade-insecure-requests
    // changes nothing; here WebKit would rewrite every request to https and fail
    // (Chromium and Firefox exempt localhost). The live smoke test checks the real CSP.
    const csp = response.headers.get('Content-Security-Policy');
    if (csp) response.headers.set('Content-Security-Policy', csp.replace(/;\s*upgrade-insecure-requests\b/, ''));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch (error) {
    console.error(error);
    res.writeHead(500).end('server error');
  }
}).listen(port, '127.0.0.1', () => console.log(`Serving ${files.size} deployable files at http://127.0.0.1:${port}`));

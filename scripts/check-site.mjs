// Static checks over exactly what Cloudflare deploys:
//   integrity  every src/href/srcset/poster/url() resolves; every #anchor exists
//   leaks      no secrets, private keys, personal emails, local paths or debug files
//   limits     Cloudflare's 25 MiB per-file limit and page-weight budgets
//   csp        no inline styles, inline handlers or inline scripts (the CSP blocks them)
//   seo        title, description, canonical, h1, alt text, JSON-LD, FAQ sync, sitemap
// Usage: node scripts/check-site.mjs [--external]   (--external also checks outbound links)
import { readFileSync, statSync } from 'node:fs';
import { extname, join, posix } from 'node:path';
import { ROOT, deployableFiles } from './lib/deploy-set.mjs';

const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);
const files = deployableFiles();
const deployed = new Set(files);
const text = file => readFileSync(join(ROOT, file), 'utf8');
const SITE = 'https://knowledgeexcellencecpa.com';
const pages = files.filter(f => f.endsWith('.html'));
const redirects = new Map(text('_redirects').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'))
  .map(l => l.trim().split(/\s+/)).map(([from, to]) => [from, to]));

// ── Leaks ────────────────────────────────────────────────────────────────────
const FORBIDDEN_FILE = /(^|\/)(\.env(\..*)?|\.dev\.vars|.*\.(pem|key|p12|pfx|map|bak|sql|log|zip|tgz)|id_rsa.*|credentials.*|secrets?\..*)$/i;
const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/, 'GitHub token'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/, 'Slack token'],
  [/\bsk_live_[A-Za-z0-9]{16,}\b/, 'Stripe secret key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/\b(api[_-]?key|secret|passw(or)?d|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i, 'hard-coded credential'],
  [/[A-Za-z]:\\(Users|VG|Projects)\\|\/home\/[a-z]+\/|\/Users\/[A-Za-z]+\//, 'local file path'],
  [/\b(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\b/, 'local development URL'],
];
// Only company addresses may ship; personal or developer addresses must not leak.
const ALLOWED_EMAILS = new Set(['support@knowledgeexcellencecpa.com', 'shilpa.vishwen@knowledgeexcellencecpa.com']);
const TEXT_EXT = new Set(['.html', '.css', '.js', '.txt', '.xml', '.vtt', '.json', '.md']);
const LIMIT = 25 * 1024 * 1024;
const BUDGET = { '.webp': 300 * 1024, '.png': 300 * 1024, '.jpg': 600 * 1024, '.woff2': 80 * 1024, '.mp4': 6 * 1024 * 1024, '.css': 120 * 1024, '.js': 60 * 1024, '.html': 120 * 1024 };

for (const file of files) {
  const size = statSync(join(ROOT, file)).size;
  if (size > LIMIT) fail(file, `${size} bytes exceeds Cloudflare's 25 MiB asset limit`);
  if (BUDGET[extname(file)] && size > BUDGET[extname(file)]) fail(file, `${Math.round(size / 1024)} KB exceeds the ${Math.round(BUDGET[extname(file)] / 1024)} KB budget for ${extname(file)} files`);
  if (FORBIDDEN_FILE.test(file)) fail(file, 'this kind of file must never be deployed');
  if (!TEXT_EXT.has(extname(file)) && !file.startsWith('.well-known/')) continue;
  const body = text(file);
  for (const [pattern, label] of SECRET_PATTERNS) {
    const match = body.match(pattern);
    if (match) fail(file, `possible ${label}: "${match[0].slice(0, 40)}"`);
  }
  // Form placeholders show a sample address; they are not real contact data.
  for (const email of body.replace(/placeholder="[^"]*"/g, '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []) {
    if (!ALLOWED_EMAILS.has(email.toLowerCase()) && !/@(example\.com|2x\.|3x\.)/.test(email)) fail(file, `email address not on the allowlist: ${email}`);
  }
  if (/sourceMappingURL=/.test(body)) fail(file, 'references a source map');
  if (/\bdebugger;/.test(body)) fail(file, 'contains a debugger statement');
}

// ── References, anchors and CSP rules ───────────────────────────────────────
function resolveUrl(from, ref) {
  if (/^(data:|mailto:|tel:|javascript:|#)/i.test(ref)) return null;
  if (/^https?:\/\//i.test(ref)) return ref.startsWith(SITE) ? new URL(ref).pathname + (new URL(ref).hash || '') : { external: ref };
  const base = from.startsWith('/') ? from : '/' + from;
  return posix.normalize(ref.startsWith('/') ? ref : posix.join(posix.dirname(base), ref));
}
function exists(path) {
  const [p] = path.split(/[?#]/);
  if (redirects.has(p)) return exists(redirects.get(p));
  if (p === '/' || p === '') return deployed.has('index.html');
  const file = decodeURIComponent(p.slice(1));
  return deployed.has(file) || deployed.has(file + '.html') || deployed.has(file.replace(/\/$/, '') + '/index.html');
}
const ids = new Map(pages.map(p => [p, new Set([...text(p).matchAll(/\sid="([^"]+)"/g)].map(m => m[1]))]));
const pageFor = path => path === '/' || path === '' ? 'index.html' : deployed.has(path.slice(1)) ? path.slice(1) : path.slice(1) + '.html';
const external = new Set();

function checkRef(file, ref, what) {
  ref = ref.trim();
  if (!ref) return fail(file, `empty ${what}`);
  if (ref.startsWith('#')) {
    if (ref.length > 1 && !ids.get(file)?.has(ref.slice(1))) fail(file, `${what} "${ref}" points to a missing id`);
    return;
  }
  const target = resolveUrl(file, ref);
  if (!target) return;
  if (target.external) { if (/^http:\/\//.test(ref)) fail(file, `insecure http link ${ref}`); external.add(ref); return; }
  if (!exists(target)) return fail(file, `${what} "${ref}" is not deployed (missing file or .assetsignore entry)`);
  const hash = target.split('#')[1];
  if (hash) {
    const dest = redirects.get(target.split('#')[0]) ?? target.split('#')[0];
    if (!ids.get(pageFor(dest))?.has(hash)) fail(file, `${what} "${ref}" points to a missing id`);
  }
}

for (const file of files.filter(f => /\.(html|css)$/.test(f))) {
  const body = text(file);
  if (file.endsWith('.css')) {
    // Inline data: URIs (e.g. the SVG grain texture) can contain url(#id) of their own; skip them.
    const css = body.replace(/url\(\s*"data:[^"]*"\s*\)/g, '').replace(/url\(\s*'data:[^']*'\s*\)/g, '');
    for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) checkRef(file, m[1], 'url()');
    continue;
  }
  for (const m of body.matchAll(/\s(src|href|poster|data-poster)="([^"]*)"/g)) {
    if (m[1] === 'href' && /<link[^>]+rel="(preconnect|dns-prefetch)"/.test(body.slice(body.lastIndexOf('<', m.index), m.index + m[0].length))) continue;
    checkRef(file, m[2], m[1]);
  }
  for (const m of body.matchAll(/\ssrcset="([^"]*)"/g)) for (const part of m[1].split(',')) checkRef(file, part.trim().split(/\s+/)[0], 'srcset');
  if (/\sstyle="/.test(body)) fail(file, 'inline style attribute (blocked by the CSP)');
  if (/<style[\s>]/.test(body)) fail(file, 'inline <style> element (blocked by the CSP)');
  if (/\son[a-z]+="/.test(body)) fail(file, 'inline event handler (blocked by the CSP)');
  for (const m of body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/\ssrc=/.test(m[1]) && !/type="application\/ld\+json"/.test(m[1])) fail(file, 'inline <script> (blocked by the CSP)');
  }
  for (const m of body.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) if (!/rel="[^"]*noopener/.test(m[0])) fail(file, `target="_blank" link without rel="noopener": ${m[0].slice(0, 80)}`);
  for (const m of body.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) fail(file, `image without alt text: ${m[0].slice(0, 80)}`);
    if (!/\swidth="/.test(m[0]) || !/\sheight="/.test(m[0])) {
      if (!/id="visitorBadge"/.test(m[0])) fail(file, `image without width/height (causes layout shift): ${m[0].slice(0, 80)}`);
    }
  }
}

// ── SEO and structured data ─────────────────────────────────────────────────
const norm = s => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#8209;/g, '‑').replace(/\s+/g, ' ').trim();
for (const file of pages) {
  const body = text(file);
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(body);
  if (!/<html lang="en/.test(body)) fail(file, 'missing <html lang>');
  if (!/<meta charset="UTF-8">/i.test(body)) fail(file, 'missing <meta charset>');
  if (!/<meta name="viewport"/.test(body)) fail(file, 'missing viewport meta');
  const title = body.match(/<title>([^<]*)<\/title>/)?.[1];
  if (!title) fail(file, 'missing <title>'); else if (title.length > 80) fail(file, `title is ${title.length} characters (max 80)`);
  const desc = body.match(/<meta name="description"\s+content="([^"]*)"/)?.[1];
  if (!desc) fail(file, 'missing meta description'); else if (desc.length < 50 || desc.length > 160) fail(file, `meta description is ${desc.length} characters (50-160)`);
  if ((body.match(/<h1[\s>]/g) || []).length !== 1) fail(file, 'must have exactly one <h1>');
  if (!noindex) {
    const canonical = body.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    if (!canonical) fail(file, 'missing canonical link');
    else if (!canonical.startsWith(SITE + '/') || /\.html$/.test(canonical)) fail(file, `canonical ${canonical} must be an https clean URL on ${SITE}`);
  }
  for (const m of body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { fail(file, `invalid JSON-LD: ${e.message}`); continue; }
    const nodes = data['@graph'] || [data];
    const faq = nodes.find(n => n['@type'] === 'FAQPage');
    if (faq) {
      const visible = [...body.matchAll(/<details class="faq-item">\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)];
      if (visible.length !== faq.mainEntity.length) fail(file, `FAQ schema has ${faq.mainEntity.length} questions but the page shows ${visible.length}`);
      visible.forEach(([, q, a], i) => {
        if (norm(q) !== faq.mainEntity[i]?.name) fail(file, `FAQ question ${i + 1} differs between page and schema`);
        if (norm(a) !== faq.mainEntity[i]?.acceptedAnswer?.text) fail(file, `FAQ answer ${i + 1} differs between page and schema`);
      });
    }
    for (const node of nodes) for (const key of ['logo', 'image', 'thumbnailUrl', 'contentUrl', 'primaryImageOfPage']) {
      const v = node[key];
      if (typeof v === 'string' && v.startsWith(SITE) && !exists(new URL(v).pathname)) fail(file, `JSON-LD ${key} ${v} is not deployed`);
    }
  }
}

const sitemap = text('sitemap.xml');
const locs = [...sitemap.matchAll(/<(?:loc|image:loc|video:thumbnail_loc|video:content_loc)>([^<]+)</g)].map(m => m[1]);
if (!locs.includes(SITE + '/')) fail('sitemap.xml', 'homepage missing');
for (const loc of locs) {
  if (!loc.startsWith(SITE + '/')) { fail('sitemap.xml', `${loc} is not on ${SITE}`); continue; }
  const path = new URL(loc).pathname;
  if (/\.html$/.test(path)) fail('sitemap.xml', `${loc} redirects; list the clean URL`);
  if (!exists(path)) fail('sitemap.xml', `${loc} is not deployed`);
}
for (const m of sitemap.matchAll(/<lastmod>([^<]+)</g)) if (!/^\d{4}-\d{2}-\d{2}$/.test(m[1]) || new Date(m[1]) > new Date(Date.now() + 864e5)) fail('sitemap.xml', `bad lastmod ${m[1]}`);
if (!/^Sitemap: https:\/\/knowledgeexcellencecpa\.com\/sitemap\.xml$/m.test(text('robots.txt'))) fail('robots.txt', 'missing Sitemap line');

// ── Optional: outbound links ─────────────────────────────────────────────────
if (process.argv.includes('--external')) {
  // These sites refuse every automated request (LinkedIn answers bots with 403 or 999),
  // so a status from them says nothing about whether the link works. Only check the
  // URL is well formed; verify these by hand when they change.
  const BOT_BLOCKING_HOSTS = new Set(['www.linkedin.com', 'linkedin.com']);
  for (const url of [...external].sort()) {
    if (BOT_BLOCKING_HOSTS.has(new URL(url).hostname)) {
      console.log(`  skipped ${url} (site blocks automated link checks)`);
      continue;
    }
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'KECPA link checker' } });
      // A Cloudflare bot challenge (common for CI runners) means the host is up but
      // won't answer a bot, so the link can't be verified from here: warn, don't fail.
      if (res.headers.get('cf-mitigated') === 'challenge') {
        const note = `${url} returned a Cloudflare bot challenge; not verified`;
        console.log(process.env.GITHUB_ACTIONS ? `::warning title=Outbound link not verified::${note}` : `  ${note}`);
        continue;
      }
      if (res.status >= 400) fail('external', `${url} returned ${res.status}`);
    } catch (e) {
      fail('external', `${url} unreachable: ${e.message}`);
    }
  }
}

if (errors.length) {
  console.error(`Site check failed with ${errors.length} problem(s):\n` + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`Site check passed: ${files.length} deployable files, ${pages.length} pages, ${external.size} outbound links${process.argv.includes('--external') ? ' (verified)' : ''}.`);

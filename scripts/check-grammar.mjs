// Grammar check for everything a visitor or crawler reads, using a LanguageTool
// server (local Java server or CI service). Spelling is cspell's job, so the
// LanguageTool spelling rule is off here. Accepted exceptions live in
// .languagetool/ignore.json and must each say why.
//   LT_URL=http://127.0.0.1:8081 node scripts/check-grammar.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, deployableFiles } from './lib/deploy-set.mjs';

const LT_URL = process.env.LT_URL || 'http://127.0.0.1:8081';
const read = f => readFileSync(join(ROOT, f), 'utf8');
const ignore = JSON.parse(read('.languagetool/ignore.json'));

// Rules that do not fit web copy: headings and labels are fragments without a
// final period, and typography (curly quotes, dash spacing) is a style choice.
const DISABLED_RULES = [
  'MORFOLOGIK_RULE_EN_US', // spelling: handled by cspell with the project dictionary
  'PUNCTUATION_PARAGRAPH_END', // headings, labels and list items are fragments
  'EN_QUOTES', // straight quotes are intentional
  'DASH_RULE', // em dashes are used with spaces as a house style
  'WHITESPACE_RULE', // whitespace is normalized before checking
];

const entities = { amp: '&', nbsp: ' ', lt: '<', gt: '>', quot: '"', '#39': "'", '#8209': '‑', mdash: '—', ndash: '–', rsquo: '’', copy: '©' };
const decode = s => s.replace(/&(#?\w+);/g, (m, e) => entities[e] ?? m);

function htmlBlocks(html) {
  const blocks = [];
  const head = html.match(/<head>[\s\S]*?<\/head>/)?.[0] || '';
  const title = head.match(/<title>([^<]*)<\/title>/)?.[1];
  if (title) blocks.push(title);
  for (const m of head.matchAll(/<meta (?:name|property)="(?:description|og:description|twitter:description|og:image:alt|twitter:image:alt)"\s+content="([^"]*)"/g)) blocks.push(m[1]);
  let body = html.replace(/<head>[\s\S]*?<\/head>/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g, '');
  for (const m of body.matchAll(/\s(?:alt|aria-label|title|placeholder)="([^"]+)"/g)) if (/[a-z]{3,}\s+[a-z]/i.test(m[1])) blocks.push(m[1]);
  body = body.replace(/<\/?(p|li|h[1-6]|summary|figcaption|div|section|header|footer|nav|ul|ol|details|label|button|option|dialog|figure|main|form|span class="(?:contact-label|service-tag|stat-label)"[^>]*)\b[^>]*>/g, '\n\n')
    // Remaining tags are inline (<a>, <strong>, <em>, <i>...): drop them without adding
    // spaces so "(<strong>site</strong>)" reads as "(site)".
    .replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '');
  for (const block of decode(body).split(/\n\s*\n/)) {
    const t = block.replace(/\s+/g, ' ').trim();
    if (/[A-Za-z]{2,}/.test(t)) blocks.push(t);
  }
  return blocks.map(decode);
}

function markdownBlocks(md) {
  return md.split(/\n/).map(l => l.replace(/^#+\s*|^\s*[-*]\s+|^\d+\.\s+|\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()).filter(l => /[A-Za-z]{2,}/.test(l) && !/^https?:\/\//.test(l));
}

function vttBlocks(vtt) {
  return vtt.split(/\n\s*\n/).map(c => c.split('\n').filter(l => l && !/-->/.test(l) && l !== 'WEBVTT').join(' ').trim()).filter(Boolean);
}

const sources = [];
for (const file of deployableFiles()) {
  if (file.endsWith('.html')) sources.push([file, htmlBlocks(read(file))]);
  else if (file === 'llms.txt') sources.push([file, markdownBlocks(read(file))]);
  else if (file.endsWith('.vtt')) sources.push([file, vttBlocks(read(file))]);
}

const isIgnored = (file, rule, snippet) => ignore.some(i => i.rule === rule && snippet.includes(i.text) && (!i.file || i.file === file));
const problems = [];
let checked = 0;
// Keep each request small (the public API accepts 20 KB per request).
function chunks(blocks, max = 15000) {
  const out = [[]];
  let size = 0;
  for (const b of blocks) {
    if (size + b.length > max && out.at(-1).length) { out.push([]); size = 0; }
    out.at(-1).push(b);
    size += b.length + 2;
  }
  return out.map(c => c.join('\n\n'));
}

for (const [file, blocks] of sources) {
  const unique = [...new Set(blocks)];
  checked += unique.length;
  for (const text of chunks(unique)) {
    const res = await fetch(`${LT_URL}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ language: 'en-US', text, disabledRules: DISABLED_RULES.join(',') }),
    });
    if (!res.ok) throw new Error(`LanguageTool returned ${res.status} for ${file}`);
    for (const m of (await res.json()).matches) {
      const snippet = text.slice(m.offset, m.offset + m.length);
      const context = text.slice(Math.max(0, m.offset - 40), m.offset + m.length + 40).replace(/\n+/g, ' / ');
      if (isIgnored(file, m.rule.id, context)) continue;
      problems.push(`${file}: [${m.rule.id}] ${m.message}\n      "…${context}…"${m.replacements[0] ? `\n      suggestion: "${snippet}" → "${m.replacements[0].value}"` : ''}`);
    }
  }
}

if (problems.length) {
  console.error(`Grammar check found ${problems.length} issue(s):\n` + problems.map(p => '  - ' + p).join('\n'));
  console.error('\nFix the copy, or if it is intentional, add {"rule", "text", "why"} to .languagetool/ignore.json.');
  process.exit(1);
}
console.log(`Grammar check passed: ${checked} text blocks in ${sources.length} files.`);

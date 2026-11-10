// Decides which CI jobs a change needs. Reads changed paths (one per line) on stdin
// and prints "<area>=true|false" lines, appended to $GITHUB_OUTPUT in CI.
// Every area also runs when CI itself changes, and when ALL=true (scheduled and
// manual runs, new branches, force pushes), so nothing is skipped by accident.
//   git diff --name-only origin/main... | node scripts/ci/changed-areas.mjs
import { appendFileSync, readFileSync } from 'node:fs';

const deps = [/^package(-lock)?\.json$/];
const pages = [/\.html$/];
const styles = [/\.css$/];
const siteScript = [/^script\.js$/];
const edge = [/^worker\.js$/, /^_headers$/, /^_redirects$/, /^wrangler\.toml$/, /^\.assetsignore$/];
const media = [/\.(webp|png|jpe?g|svg|ico|gif|avif|mp4|webm|vtt|woff2?)$/i];
const publicText = [/^(robots|llms)\.txt$/, /^sitemap\.xml$/, /^\.well-known\//];
const sharedLib = [/^scripts\/lib\//];

export const AREAS = {
  // npm audit, signature/provenance checks and dependency review.
  dependencies: [...deps],
  // ESLint, JS syntax, security unit tests, build.
  code: [/\.(js|mjs|cjs|ts|tsx)$/, /^eslint\.config\.mjs$/, /^tsconfig\.json$/, ...edge, ...deps],
  // Stylelint.
  styles: [...styles, /^\.stylelintrc\.json$/, ...deps],
  // Integrity, leaks, size limits, CSP-safe markup, SEO, Cloudflare config, security.txt.
  site: [...pages, ...styles, ...siteScript, ...edge, ...media, ...publicText, ...sharedLib, /^scripts\/check-site\.mjs$/, ...deps],
  // html-validate.
  html: [...pages, /^\.htmlvalidate\.json$/, ...deps],
  // cspell over copy, code and config.
  spelling: [...pages, /\.(md|js|mjs|cjs|yml|vtt)$/, /^llms\.txt$/, /^robots\.txt$/, ...edge, /^cspell\.json$/, /^\.cspell\//, ...deps],
  // LanguageTool over visitor-facing copy.
  grammar: [...pages, /^llms\.txt$/, /\.vtt$/, /^scripts\/check-grammar\.mjs$/, /^\.languagetool\//, ...sharedLib],
  // Playwright journeys, the responsive sweep and Lighthouse.
  browser: [...pages, ...styles, ...siteScript, ...edge, ...media, ...publicText, ...sharedLib, /^tests\//,
    /^playwright\.config\.mjs$/, /^scripts\/serve-static\.mjs$/, /^scripts\/check-lighthouse\.mjs$/, ...deps],
  // Workflow linting and security: actionlint and zizmor.
  workflows: [/^\.github\//],
};

// Editing CI re-runs everything so a pipeline change is proven by a full run.
const CI_ITSELF = [/^\.github\/workflows\/validate\.yml$/, /^scripts\/ci\//];

export function changedAreas(files, all = false) {
  const runAll = all || files.some(f => CI_ITSELF.some(re => re.test(f)));
  return Object.fromEntries(Object.entries(AREAS).map(([area, patterns]) =>
    [area, runAll || files.some(f => patterns.some(re => re.test(f)))]));
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^(?=[A-Za-z]:)/, '/')}`) {
  const files = readFileSync(0, 'utf8').split('\n').map(f => f.trim()).filter(Boolean);
  const result = changedAreas(files, process.env.ALL === 'true');
  const lines = Object.entries(result).map(([k, v]) => `${k}=${v}`);
  console.log(`${files.length} changed file(s)${process.env.ALL === 'true' ? ' (full run)' : ''}:\n  ${files.join('\n  ') || '(none)'}\n`);
  console.log(lines.join('\n'));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
}

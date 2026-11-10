# Knowledge Excellence CPAs — Website

Static website for **[knowledgeexcellencecpa.com](https://knowledgeexcellencecpa.com)** — a U.S.-licensed CPA firm offering accounting, tax, audit, bookkeeping, payroll, and virtual CFO services.

## Stack

- Plain HTML, CSS, JavaScript — no framework
- Hosted on **Cloudflare Pages** via `wrangler.toml`
- Form submissions via **Formspree**

## Files

| File | Purpose |
|---|---|
| `index.html` | Main page |
| `index.css` | Styles |
| `script.js` | Interactivity & form handling |
| `logo.png` | Brand logo |
| `sitemap.xml` | SEO sitemap |
| `robots.txt` | Search engine directives |
| `.well-known/security.txt` | Vulnerability disclosure contact metadata |
| `_headers` | Cloudflare security headers (CSP, HSTS, etc.) |
| `wrangler.toml` | Cloudflare Pages deployment config |

## Deploy

Cloudflare Pages auto-deploys on every push to `main`.

## CI/CD

GitHub Actions checks every pull request and push to `main`, and each check runs **only when a file it covers changed**. The first job (`scripts/ci/changed-areas.mjs`) maps the changed files to areas; a README edit runs only the spelling check, a CSS edit runs Stylelint, the site checks, the browser tests and Lighthouse. Everything runs on the weekly schedule, on manual runs, on new branches and force pushes, and whenever the pipeline itself changes. The secret scan always runs.

| Job (`validate.yml`) | Runs when these change | What it checks |
|---|---|---|
| Dependencies | `package.json`, `package-lock.json` | `npm audit`, npm signatures and provenance, and on pull requests new dependencies with vulnerabilities or unsafe licenses |
| Code | JS/TS, `worker.js`, edge config, ESLint config | JS syntax, ESLint for bugs and unsafe code (undefined names, unreachable code, impossible comparisons, `eval`-like calls), security unit tests, build |
| Styles | CSS, Stylelint config | Invalid properties, values, units, colors and media features |
| Site integrity | Pages, CSS, `script.js`, media, edge config, public text files | Broken links/assets/anchors, leaks in the deployed files (secrets, personal emails, local paths, debug files), Cloudflare's 25 MiB limit and size budgets, CSP-safe markup, SEO and structured data, Cloudflare config, `security.txt` expiry |
| HTML | Pages, `.htmlvalidate.json` | HTML validity and accessibility markup |
| Spelling | Copy, code, docs, workflows, cspell config | cspell |
| Grammar | Pages, `llms.txt`, captions, LanguageTool config | Grammar and punctuation of all visitor-facing copy |
| Secret scan | Always | gitleaks over the full git history |
| Browser journeys | Pages, CSS, JS, media, edge config, tests | Playwright in Chrome (desktop), Android (Pixel 7), iPhone Safari (WebKit) and Firefox: no console errors or CSP violations, fonts/images load, axe WCAG 2.1 AA, Partner Pass, video and captions, FAQ, contact form (mocked), mobile menu, 404, redirects, security headers, private files never served |
| Responsive layout | Same as browser journeys | 12 screen sizes from a 320px phone to a 2560px monitor, including landscape phone and both iPad orientations: no sideways scrolling, nothing past the screen edge, no text spilling out of its box, tap targets at least 24×24px (WCAG 2.2), no text under 11px, no stretched images. Screenshots of every page at every size are uploaded as an artifact |
| Lighthouse | Same as browser journeys | Every page as a phone and as a desktop. Scores at least 85 (phone) / 95 (desktop) for performance and 95 for accessibility, best practices and SEO; LCP, CLS and TBT budgets. Reports are uploaded as an artifact |
| Workflow security | `.github/**` | actionlint and zizmor |
| CI passed | Always | The single required check: passes when every job passed or was not needed |

Other workflows: `codeql.yml` (CodeQL security analysis of the JavaScript and workflows, when they change and weekly) and `production-smoke.yml` (the live site: headers, CSP, assets, legal pages, 404, Markdown for AI agents, private files return 404, outbound links; daily and after every push to `main`).

In branch protection, require only **CI passed**. Requiring individual jobs would block pull requests where those jobs were rightly skipped.

Run the same checks locally:

```sh
npm run check            # security tests, ESLint, Stylelint, site check, HTML, spelling, browser tests
npm run test:responsive  # the 12-size layout sweep
npm run check:lighthouse # Lighthouse budgets on phone and desktop (reports in lighthouse-report/)
PW_CHANNEL=msedge npm run test:e2e   # reuse installed Edge instead of downloading Chromium
LT_URL=http://127.0.0.1:8081 npm run check:grammar   # needs a LanguageTool server
npm run check:links      # also verifies outbound links
git diff --name-only origin/main | node scripts/ci/changed-areas.mjs   # which CI jobs a change will run
```

Accepted exceptions are reviewed and documented: spelling in `.cspell/project-words.txt`, grammar in `.languagetool/ignore.json`, secrets in `.gitleaks.toml`.

Cloudflare remains the only deployment system. Do not add a GitHub Actions deploy workflow unless Cloudflare Git deployments are intentionally disabled first.

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

GitHub Actions runs these checks on every pull request and push to `main`:

| Workflow | Job | What it checks |
|---|---|---|
| `validate.yml` | Security, integrity and copy | `npm audit`, npm signatures, security unit tests, build, broken links/assets/anchors, leaks in the deployed files (secrets, personal emails, local paths, debug files), Cloudflare's 25 MiB file limit and size budgets, CSP-safe markup, SEO and structured data, HTML validity, spelling |
| `validate.yml` | Secret scan | gitleaks over the full git history |
| `validate.yml` | Grammar | LanguageTool over all visitor-facing copy, captions and `llms.txt` |
| `validate.yml` | Browser tests | Playwright on desktop and phone against a production-faithful server: no console errors or CSP violations, fonts/images load, no overflow, axe WCAG 2.1 AA, Partner Pass, video, FAQ, contact form (mocked), mobile menu, 404, redirects, private files never served |
| `validate.yml` | Workflow security | actionlint and zizmor |
| `codeql.yml` | CodeQL | Static analysis of the JavaScript and the workflows (weekly too) |
| `dependency-review.yml` | Dependency review | New dependencies with vulnerabilities or unsafe licenses (pull requests) |
| `production-smoke.yml` | Live site | Headers, CSP, assets, legal pages, 404, Markdown for AI agents, private files return 404, outbound links (daily and after every push to `main`) |

Run the same checks locally:

```sh
npm run check            # security tests, site check, HTML, spelling, browser tests
PW_CHANNEL=msedge npm run test:e2e   # reuse installed Edge instead of downloading Chromium
LT_URL=http://127.0.0.1:8081 npm run check:grammar   # needs a LanguageTool server
npm run check:links      # also verifies outbound links
```

Accepted exceptions are reviewed and documented: spelling in `.cspell/project-words.txt`, grammar in `.languagetool/ignore.json`, secrets in `.gitleaks.toml`.

Cloudflare remains the only deployment system. Do not add a GitHub Actions deploy workflow unless Cloudflare Git deployments are intentionally disabled first.

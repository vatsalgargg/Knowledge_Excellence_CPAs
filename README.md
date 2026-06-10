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

GitHub Actions validates pull requests and pushes to `main` through `.github/workflows/validate.yml`.

Cloudflare remains the only deployment system. Do not add a GitHub Actions deploy workflow unless Cloudflare Git deployments are intentionally disabled first.

After validation completes on `main`, `.github/workflows/production-smoke.yml` checks the live production site for the homepage, security headers, `security.txt`, `robots.txt`, and `sitemap.xml`.

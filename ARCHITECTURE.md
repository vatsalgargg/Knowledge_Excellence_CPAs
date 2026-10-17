# KECPA Website — Architecture

## Stack
Existing static HTML, CSS, JavaScript, Vite; native CSS 3D transforms and lightweight requestAnimationFrame scroll effects.

## System boundaries
- Static HTML retains all business content and SEO. index.css owns the visual system; script.js owns navigation, motion and existing form handling.
- CSS transform-style: preserve-3d renders the growth sculpture without a graphics dependency. One scheduled animation frame batches geometry reads before numeric style writes. No continuous idle loop or scroll hijacking.
- Vite builds the same entry point; existing Cloudflare Worker remains the production boundary. .assetsignore excludes internal docs and test artifacts from root-directory assets.
- Existing external services: Google Fonts, Font Awesome CSS/fonts, hits.sh visitor badge and Formspree contact submission.
- Formspree is the remote input boundary. No local backend, authentication, database or file upload exists.

## Data classification
- Website copy and graphics are public. Contact name, email, phone and message are personal data sent to the existing Formspree endpoint only on user submission.
- localStorage contains only a form submission timestamp and the partner-popup claim status with a timestamp (dismissals use sessionStorage); a memory fallback handles denied storage. The firm name typed into the popup stays in the page and reaches Formspree only if the visitor submits the contact form. No financial records or API credentials are introduced.
- Remote Formspree retention is controlled by the existing account, not by this frontend.

## Security architecture
- Existing HTTPS, CSP, frame and referrer headers remain intact. Client form validation, honeypot and best-effort cooldown retained; server enforcement remains the provider's responsibility.
- Motion has no user-provided strings, eval, network calls or HTML sinks. Errors use textContent; button HTML is fixed text.
- QA uses fictional form data and intercepts every Formspree request. Script accepts a locally installed Playwright through PLAYWRIGHT_PATH.

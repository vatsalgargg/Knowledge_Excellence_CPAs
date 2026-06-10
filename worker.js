/**
 * KECPA — Cloudflare Worker
 *
 * Content negotiation: requests with Accept: text/markdown (AI agents)
 * on "/" or "/index.html" receive the pre-built llms.txt as a Markdown
 * response.  All other requests (browsers) fall through to static assets
 * unchanged — security headers from _headers are preserved in both paths.
 *
 * Security note
 * ─────────────
 * When run_worker_first = true, Cloudflare no longer auto-applies _headers
 * rules to hand-built Response objects returned by the worker.  Any branch
 * that calls `new Response(...)` directly must re-apply the full /*
 * security header set explicitly.  Branches that return the response from
 * env.ASSETS.fetch() unmodified (or with only header additions) receive
 * the _headers rules automatically from the runtime.
 *
 * Response headers for text/markdown path:
 *   Content-Type: text/markdown; charset=utf-8
 *   X-Markdown-Tokens: <byte-length of body>
 *   Vary: Accept
 *   Link: (RFC 8288 agent-discovery relations — see LINK_HEADER below)
 *   + all security headers mirroring _headers /*
 *
 * RFC 8288 Link header (agent discovery)
 * ───────────────────────────────────────
 * Added to every homepage response (HTML and Markdown) so that AI agents
 * and crawlers can discover machine-readable resources without parsing HTML.
 * All relation types are IANA-registered:
 *   describedby  — https://www.iana.org/assignments/link-relations
 *   alternate    — https://www.iana.org/assignments/link-relations
 *   sitemap      — https://www.iana.org/assignments/link-relations
 *   robots-txt   — https://www.iana.org/assignments/link-relations
 *   security     — https://www.iana.org/assignments/link-relations
 */

// ── Security header set ────────────────────────────────────────────────────
// Must stay in sync with the /* block in _headers.
// These are applied to every hand-built Response so no path is left unguarded.
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: https://images.unsplash.com https://hits.sh; " +
    "connect-src 'self' https://formspree.io; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action https://formspree.io",
};

// ── RFC 8288 Link header for agent / crawler discovery ─────────────────────
// Applied to every homepage response (both HTML and Markdown paths).
// Format: comma-separated link-values per RFC 8288 §3.
const LINK_HEADER = [
  // Primary machine-readable site description consumed by LLMs/AI agents
  '</llms.txt>; rel="describedby"; type="text/markdown"',
  // Alternate markdown representation of the homepage (content negotiation)
  '</llms.txt>; rel="alternate"; type="text/markdown"',
  // Sitemap for structured site discovery
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
  // Crawl policy
  '</robots.txt>; rel="robots-txt"',
  // Vulnerability disclosure contact metadata
  '</.well-known/security.txt>; rel="security"; type="text/plain"',
].join(", ");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const accept = request.headers.get("Accept") ?? "";
    const path = url.pathname;

    const isRootPage =
      path === "/" || path === "/index.html" || path === "/index";
    const wantsMarkdown = accept.includes("text/markdown");

    // ── Markdown path (AI agents) ──────────────────────────────────────────
    if (isRootPage && wantsMarkdown) {
      const mdRequest = new Request(new URL("/llms.txt", url.origin));
      const mdResponse = await env.ASSETS.fetch(mdRequest);

      if (mdResponse.ok) {
        const body = await mdResponse.text();
        const byteLength = new TextEncoder().encode(body).length;

        return new Response(body, {
          status: 200,
          headers: {
            // Content negotiation headers
            "Content-Type": "text/markdown; charset=utf-8",
            "X-Markdown-Tokens": String(byteLength),
            "Vary": "Accept",
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
            // RFC 8288 agent-discovery link relations
            "Link": LINK_HEADER,
            // Full security header set — must mirror _headers /*
            ...SECURITY_HEADERS,
          },
        });
      }
      // If llms.txt is somehow missing, fall through to normal asset serving.
    }

    // ── Browser / default path ─────────────────────────────────────────────
    // env.ASSETS.fetch() serves the static file AND applies _headers rules,
    // so security headers arrive automatically. We only inject Vary: Accept
    // on the root to ensure caches store HTML and Markdown variants separately.
    const response = await env.ASSETS.fetch(request);

    if (isRootPage) {
      // Clone headers (which already include all _headers /* security rules)
      // and add Vary + Link without removing anything.
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Vary", "Accept");
      newHeaders.set("Link", LINK_HEADER);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return response;
  },
};

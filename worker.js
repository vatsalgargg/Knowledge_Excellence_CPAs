/**
 * KECPA — Cloudflare Worker
 *
 * Content negotiation: requests with Accept: text/markdown (AI agents)
 * on "/" or "/index.html" receive the pre-built llms.txt as a Markdown
 * response.  All other requests (browsers) fall through to static assets.
 *
 * Response headers set:
 *   Content-Type: text/markdown; charset=utf-8
 *   X-Markdown-Tokens: <byte-length of body>   (agent hint)
 *   Vary: Accept                                 (correct CDN caching)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const accept = request.headers.get("Accept") ?? "";
    const path = url.pathname;

    // ── Content negotiation ────────────────────────────────────────────────
    // Trigger on "/" or "/index.html" when the client prefers text/markdown.
    // We also honour a direct fetch of "/llms.txt" so it always works.
    const isRootPage =
      path === "/" || path === "/index.html" || path === "/index";
    const wantsMarkdown = accept.includes("text/markdown");

    if (isRootPage && wantsMarkdown) {
      // Fetch llms.txt from the asset binding (served as a static file)
      const mdRequest = new Request(new URL("/llms.txt", url.origin));
      const mdResponse = await env.ASSETS.fetch(mdRequest);

      if (mdResponse.ok) {
        const body = await mdResponse.text();
        const byteLength = new TextEncoder().encode(body).length;

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "X-Markdown-Tokens": String(byteLength),
            "Vary": "Accept",
            // Preserve security headers already set by _headers for /*
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          },
        });
      }
    }

    // ── Default: pass through to static assets ─────────────────────────────
    // The ASSETS binding serves index.html, index.css, logo.png, etc.
    const response = await env.ASSETS.fetch(request);

    // Attach Vary: Accept to the root HTML response so the CDN caches
    // HTML and Markdown variants separately.
    if (isRootPage) {
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Vary", "Accept");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return response;
  },
};

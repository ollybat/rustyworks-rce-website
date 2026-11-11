/* ==========================================================================
   RustyWorks RCE — site worker
   --------------------------------------------------------------------------
   Serves everything in public/ and provides the one piece of dynamic behaviour
   the site needs: /api/* is proxied to the bot API from this origin.

   Why a proxy: the bot API does not send CORS headers, so a browser fetch
   straight to it is blocked ("Failed to fetch"). Going through the worker keeps
   the request same-origin, lets us cache it for a minute, and hides the API
   host from the page.
   ========================================================================== */

const API_BASE = "https://api.rustyworksrce.xyz";
const API_TIMEOUT_MS = 8000;
/* Paths without a file extension fall back to the homepage (the site is a set
   of standalone .html files); a missing .html page stays a 404. */
const HAS_EXTENSION = /\.[a-z0-9]+$/i;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function proxyApi(request) {
  const requestUrl = new URL(request.url);
  const target = API_BASE + requestUrl.pathname + requestUrl.search;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const upstream = await fetch(target, {
      method: request.method === "HEAD" ? "GET" : request.method,
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = request.method === "HEAD" ? null : await upstream.arrayBuffer();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        /* Short cache: the counters are nice to have fresh, but not worth an
           API request per page view. */
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    return json({ error: "api_unreachable" }, 502);
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return proxyApi(request);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    const method = request.method.toUpperCase();
    const acceptsHtml = (request.headers.get("accept") || "").includes("text/html");
    if ((method === "GET" || method === "HEAD") && acceptsHtml && !HAS_EXTENSION.test(url.pathname)) {
      return env.ASSETS.fetch(new URL("/index.html", request.url));
    }

    return assetResponse;
  },
};

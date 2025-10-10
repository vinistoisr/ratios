// /functions/api/alpha/index.js 

const ALLOWED = new Set(["INCOME_STATEMENT","BALANCE_SHEET","CASH_FLOW","OVERVIEW"]);

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

// Preflight
export async function onRequestOptions({ request }) {
  return new Response(null, { headers: cors(new URL(request.url).origin) });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const fn = url.searchParams.get("function");
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase();

  if (!fn || !symbol || !ALLOWED.has(fn)) {
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      headers: { "content-type": "application/json", ...cors(url.origin) },
    });
  }

  const TTL_MAP = {
    INCOME_STATEMENT: 86400,  // 24h
    BALANCE_SHEET:    86400,  // 24h
    CASH_FLOW:        86400,  // 24h
    OVERVIEW:         21600,  // 6h
  };
  const ttl = TTL_MAP[fn] ?? 900;

  const upstream = new URL("https://www.alphavantage.co/query");
  upstream.searchParams.set("function", fn);
  upstream.searchParams.set("symbol", symbol);
  upstream.searchParams.set("apikey", env.ALPHA_API_KEY);

  const cacheKey = new Request(upstream.toString(), { method: "GET" });
  const cache = caches.default;

  let resp = await cache.match(cacheKey);
  if (!resp) {
    const r = await fetch(upstream, {
      cf: {
        cacheTtl: ttl,
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": ttl, "404": 60, "500-599": 0 },
      },
      headers: { "User-Agent": "ratios-proxy" },
    });
    const body = await r.text();
    resp = new Response(body, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") || "application/json",
        "cache-control": `public, max-age=${ttl}`,
        ...cors(url.origin),
      },
    });
    if (r.ok) await cache.put(cacheKey, resp.clone());
  }
  return resp;
}

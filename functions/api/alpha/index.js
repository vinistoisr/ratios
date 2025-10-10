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

function json(obj, status, origin, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...cors(origin),
      ...extra,
    },
  });
}

function avProblem(data) {
  if (!data || typeof data !== "object") return null;
  if (data.Note) return { status: 429, msg: data.Note, kind: "note" };
  if (data.Information) return { status: 429, msg: data.Information, kind: "info" };
  if (data["Error Message"]) return { status: 400, msg: data["Error Message"], kind: "error" };
  return null;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const fn = url.searchParams.get("function");
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase();
  const nocache = url.searchParams.get("nocache") === "1";

  if (!fn || !symbol || !ALLOWED.has(fn)) {
    return json({ error: "Bad request: missing/invalid function or symbol." }, 400, url.origin);
  }
  if (!env.ALPHA_API_KEY) {
    return json({ error: "ALPHA_API_KEY is not configured." }, 500, url.origin);
  }

  const TTL_MAP = {
    INCOME_STATEMENT: 86400,  // 24h
    BALANCE_SHEET:    86400,  // 24h
    CASH_FLOW:        86400,  // 24h
    OVERVIEW:         21600,  // 6h
  };
  const ttl = TTL_MAP[fn] ?? 900;

  // Build upstream URL
  const upstream = new URL("https://www.alphavantage.co/query");
  upstream.searchParams.set("function", fn);
  upstream.searchParams.set("symbol", symbol);
  upstream.searchParams.set("apikey", env.ALPHA_API_KEY);

  // New cache namespace 'v2' so any previously cached "Note" payloads are bypassed
  const cacheKey = new Request(`https://alpha-proxy/v2/${fn}/${symbol}`, { method: "GET" });
  const cache = caches.default;

  if (!nocache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      return new Response(hit.body, {
        status: hit.status,
        headers: new Headers({
          ...Object.fromEntries(hit.headers),
          ...cors(url.origin),
          "x-proxy-cache": "HIT",
        }),
      });
    }
  }

  // Fetch fresh
  const r = await fetch(upstream, {
    cf: { cacheTtl: 0, cacheEverything: false },
    headers: { "User-Agent": "ratios-proxy" },
  });
  const text = await r.text();

  let data = null;
  try { data = JSON.parse(text); } catch {}

  // Map AV "Note/Information/Error Message" to proper HTTP and DO NOT cache
  const problem = avProblem(data);
  if (problem) {
    return json(
      { error: "Alpha Vantage", detail: problem.msg, function: fn, symbol },
      problem.status,
      url.origin,
      { "x-av-kind": problem.kind, "x-proxy-cache": "MISS" }
    );
  }

  // If upstream is not JSON or not OK, just pass through as a 502 with the body snippet
  if (!r.ok || data == null) {
    return json(
      { error: "Upstream failure", upstreamStatus: r.status, body: text.slice(0, 512) },
      502,
      url.origin,
      { "x-proxy-cache": "MISS" }
    );
  }

  // OK: cache good JSON for ttl
  const ok = new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ttl}`,
      ...cors(url.origin),
      "x-proxy-cache": "MISS",
    },
  });

  if (!nocache) await cache.put(cacheKey, ok.clone());
  return ok;
}

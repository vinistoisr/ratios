// /functions/api/alpha/index.js

const ALLOWED = new Set(["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW", "OVERVIEW"]);

// 72h for all fundamentals, plus 24h stale-while-revalidate
const TTL_MAP = {
  INCOME_STATEMENT: 86400 * 3,
  BALANCE_SHEET: 86400 * 3,
  CASH_FLOW: 86400 * 3,
  OVERVIEW: 86400 * 3,
};
const DEFAULT_TTL = 86400 * 3;
const STALE_WHILE_REVALIDATE = 86400; // 24h

// simple in-PoP single-flight
const inflight = new Map(); // key -> Promise<Response>

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

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

function avProblem(data, status) {
  if (!data || typeof data !== "object") return null;
  if (status === 429) return { status: 429, msg: "rate_limited", kind: "429" };
  if (data.Note) return { status: 429, msg: data.Note, kind: "note" };
  if (data.Information) return { status: 429, msg: data.Information, kind: "info" };
  if (data["Error Message"]) return { status: 400, msg: data["Error Message"], kind: "error" };
  return null;
}

function cacheKeyStr(parts) {
  // new v3 namespace
  return `https://alpha-proxy/v3/${parts.join("/")}`;
}

async function fetchOnce(url) {
  const r = await fetch(url, { cf: { cacheEverything: true, cacheTtl: 0 }, headers: { "User-Agent": "ratios-proxy" } });
  const txt = await r.text();
  let data = null;
  try { data = JSON.parse(txt); } catch {}
  return { ok: r.ok, status: r.status, data, txt };
}

async function singleFlight(key, fn) {
  if (inflight.has(key)) return inflight.get(key).then(x => x.clone());
  const p = (async () => await fn())();
  inflight.set(key, p);
  try {
    const res = await p;
    return res.clone();
  } finally {
    inflight.delete(key);
  }
}

function wrapOk(body, ttl, origin, headersExtra = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${ttl}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
      ...cors(origin),
      ...headersExtra,
    },
  });
}

function wrap429(detail, origin, kind = "rate_limited") {
  return json({ error: "Alpha Vantage", detail, kind }, 429, origin, { "Retry-After": "65" });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const origin = url.origin;
  const fn = (url.searchParams.get("function") || "").toUpperCase();
  const bundle = url.searchParams.get("bundle") === "1";
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase();
  const nocache = url.searchParams.get("nocache") === "1";

  if (!env.ALPHA_API_KEY) {
    return json({ error: "ALPHA_API_KEY is not configured." }, 500, origin);
  }
  if (!symbol) {
    return json({ error: "Bad request: missing symbol." }, 400, origin);
  }

  // ===== Bundle mode: one browser call per ticker, server fetches 4 endpoints =====
  if (bundle) {
    const cache = caches.default;
    const ttl = DEFAULT_TTL;
    const bundleKey = new Request(cacheKeyStr(["BUNDLE", symbol]), { method: "GET" });

    if (!nocache) {
      const hit = await cache.match(bundleKey);
      if (hit) {
        const fresh = new Response(hit.body, hit);
        fresh.headers.set("cache-control", `public, max-age=${ttl}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`);
        fresh.headers.set("x-proxy-cache", "HIT");
        return fresh;
      }
    }

    const upstreamFor = (f) => {
      const u = new URL("https://www.alphavantage.co/query");
      u.searchParams.set("function", f);
      u.searchParams.set("symbol", symbol);
      u.searchParams.set("apikey", env.ALPHA_API_KEY);
      return u.toString();
    };
    const urls = ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW", "OVERVIEW"].map(upstreamFor);
    const flightKey = cacheKeyStr(["BUNDLE-FETCH", symbol]);

    const res = await singleFlight(flightKey, async () => {
      // first attempt
      let parts = await Promise.all(urls.map(fetchOnce));
      let throttled = parts.some(p => avProblem(p.data, p.status));
      if (throttled) {
        await new Promise(r => setTimeout(r, 1200 + Math.floor(Math.random() * 600)));
        parts = await Promise.all(urls.map(fetchOnce));
        throttled = parts.some(p => avProblem(p.data, p.status));
      }

      const ok = parts.every(p => p.ok && !avProblem(p.data, p.status) && p.data);
      if (ok) {
        const payload = JSON.stringify({
          income_statement: parts[0].data,
          balance_sheet: parts[1].data,
          cash_flow: parts[2].data,
          overview: parts[3].data,
        });
        const out = wrapOk(payload, ttl, origin, { "x-proxy-cache": "MISS-BUNDLE" });
        if (!nocache) await cache.put(bundleKey, out.clone());
        return out;
      }

      // still throttled and no cache
      return wrap429("Bundle throttled and no cached copy", origin, "bundle");
    });

    return res;
  }

  // ===== Per-function mode: keep backward compatible path =====
  if (!fn || !ALLOWED.has(fn)) {
    return json({ error: "Bad request: missing/invalid function." }, 400, origin);
  }

  const ttl = TTL_MAP[fn] ?? DEFAULT_TTL;

  // upstream URL
  const upstream = new URL("https://www.alphavantage.co/query");
  upstream.searchParams.set("function", fn);
  upstream.searchParams.set("symbol", symbol);
  upstream.searchParams.set("apikey", env.ALPHA_API_KEY);

  const cache = caches.default;
  const cacheKey = new Request(cacheKeyStr([fn, symbol]), { method: "GET" });

  if (!nocache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const fresh = new Response(hit.body, hit);
      fresh.headers.set("cache-control", `public, max-age=${ttl}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`);
      fresh.headers.set("x-proxy-cache", "HIT");
      return fresh;
    }
  }

  const flightKey = cacheKeyStr(["FETCH", fn, symbol]);
  const response = await singleFlight(flightKey, async () => {
    // try once
    let { ok, status, data, txt } = await fetchOnce(upstream.toString());
    let problem = avProblem(data, status);

    if (problem) {
      // brief backoff and retry once
      await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 500)));
      ({ ok, status, data, txt } = await fetchOnce(upstream.toString()));
      problem = avProblem(data, status);
    }

    if (ok && !problem && data) {
      const out = wrapOk(JSON.stringify(data), ttl, origin, { "x-proxy-cache": "MISS" });
      if (!nocache) await cache.put(cacheKey, out.clone());
      return out;
    }

    // still throttled and no cache to serve
    return wrap429(problem ? problem.msg : `Upstream ${status}`, origin, problem ? problem.kind : "upstream");
  });

  return response;
}

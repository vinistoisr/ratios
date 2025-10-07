import React, { useEffect, useMemo, useState } from "react";

/**
 * The Iron Vanguard – Financial Ratios Builder (compact, single-screen)
 * - Dense, responsive layout with a wrapping company grid and a right-side compare rail
 * - Brand theming for "The Iron Vanguard"
 * - Green highlight for favorable values vs the selected baseline company
 * - Shows percent better or worse vs baseline in brackets
 * - Drag-and-drop ratio builder preserved
 * - Optional FMP API key for live fetches; demo data included
 * - Includes lightweight runtime self-tests, surfaced in the header
 */

// ---------------------------- Brand tokens -------------------------------
const BRAND = {
  bg: "bg-[#0b0d10]",         // near-black iron
  panel: "bg-[#12161b]",      // deep steel
  card: "bg-[#161b22]",       // slate
  text: "text-[#e6edf3]",     // light steel
  subtext: "text-[#9fb1c1]",
  accent: "#2ecc71",           // vanguard green
  accentMuted: "#1f8f4f",
  border: "border-[#2a3240]",
};

// ---------------------------- Demo data ----------------------------------
const DEMO_DATA = {
  TSLA: {
    name: "Tesla, Inc.",
    statements: {
      2024: {
        IncomeStatement: {
          Revenue: 96400_000_000,
          "Cost of Revenue": 76800_000_000,
          "Gross Profit": 19600_000_000,
          "Operating Income": 6100_000_000,
          "Net Income": 7800_000_000,
        },
        BalanceSheet: {
          "Total Assets": 116000_000_000,
          "Total Liabilities": 68700_000_000,
          Equity: 47300_000_000,
          "Current Assets": 48000_000_000,
          "Current Liabilities": 38000_000_000,
        },
        CashFlow: {
          "Cash from Operations": 15000_000_000,
          "CapEx": -9000_000_000,
          "Free Cash Flow": 6000_000_000,
        },
      },
      2023: {
        IncomeStatement: {
          Revenue: 96773_000_000,
          "Cost of Revenue": 78068_000_000,
          "Gross Profit": 18705_000_000,
          "Operating Income": 8344_000_000,
          "Net Income": 15371_000_000,
        },
        BalanceSheet: {
          "Total Assets": 106620_000_000,
          "Total Liabilities": 61849_000_000,
          Equity: 44771_000_000,
          "Current Assets": 46580_000_000,
          "Current Liabilities": 36834_000_000,
        },
        CashFlow: {
          "Cash from Operations": 13124_000_000,
          "CapEx": -8000_000_000,
          "Free Cash Flow": 5124_000_000,
        },
      },
    },
  },
  RIVN: {
    name: "Rivian Automotive, Inc.",
    statements: {
      2024: {
        IncomeStatement: {
          Revenue: 5850_000_000,
          "Cost of Revenue": 11000_000_000,
          "Gross Profit": -5150_000_000,
          "Operating Income": -6500_000_000,
          "Net Income": -5200_000_000,
        },
        BalanceSheet: {
          "Total Assets": 30000_000_000,
          "Total Liabilities": 12000_000_000,
          Equity: 18000_000_000,
          "Current Assets": 15000_000_000,
          "Current Liabilities": 6000_000_000,
        },
        CashFlow: {
          "Cash from Operations": -4000_000_000,
          "CapEx": -1500_000_000,
          "Free Cash Flow": -5500_000_000,
        },
      },
      2023: {
        IncomeStatement: {
          Revenue: 4534_000_000,
          "Cost of Revenue": 9950_000_000,
          "Gross Profit": -5416_000_000,
          "Operating Income": -5640_000_000,
          "Net Income": -5520_000_000,
        },
        BalanceSheet: {
          "Total Assets": 33900_000_000,
          "Total Liabilities": 13600_000_000,
          Equity: 20300_000_000,
          "Current Assets": 16700_000_000,
          "Current Liabilities": 7700_000_000,
        },
        CashFlow: {
          "Cash from Operations": -3730_000_000,
          "CapEx": -1700_000_000,
          "Free Cash Flow": -5430_000_000,
        },
      },
    },
  },
};

// Known ratio patterns for auto-labeling
const KNOWN_RATIOS: Record<string, string> = {
  "Current Assets/Current Liabilities": "Current Ratio",
  "Total Liabilities/Equity": "Debt to Equity",
  "Gross Profit/Revenue": "Gross Margin",
  "Net Income/Revenue": "Net Margin",
  "Net Income/Total Assets": "Return on Assets",
  "Net Income/Equity": "Return on Equity",
  "Cash from Operations/Revenue": "Operating Cash Flow to Sales",
  "Free Cash Flow/Revenue": "FCF Margin",
};

function isHigherBetter(label: string) {
  const higher = [/margin/i, /return/i, /current ratio/i, /cash flow/i, /fcf/i];
  const lower = [/debt to equity/i, /leverage/i];
  if (lower.some(rx => rx.test(label))) return false;
  if (higher.some(rx => rx.test(label))) return true;
  // default to higher is better
  return true;
}

// ---------------------------- Utilities ----------------------------------
function formatMoney(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  const abs = Math.abs(n);
  const unit = abs >= 1e9 ? "B" : abs >= 1e6 ? "M" : abs >= 1e3 ? "K" : "";
  const base = unit === "B" ? n / 1e9 : unit === "M" ? n / 1e6 : unit === "K" ? n / 1e3 : n;
  return `${base.toFixed(2)}${unit}`;
}

function tryLabel(numerator: string, denominator: string) {
  const key = `${numerator}/${denominator}`;
  return KNOWN_RATIOS[key] || `${numerator} ÷ ${denominator}`;
}

// ---------------------------- Data adapters ------------------------------
async function fetchFmpStatements(ticker: string, apiKey: string) {
  const base = `https://financialmodelingprep.com/api/v3`;
  const inc = await fetch(`${base}/income-statement/${ticker}?period=annual&limit=4&apikey=${apiKey}`).then(r=>r.json());
  const bal = await fetch(`${base}/balance-sheet-statement/${ticker}?period=annual&limit=4&apikey=${apiKey}`).then(r=>r.json());
  const cfs = await fetch(`${base}/cash-flow-statement/${ticker}?period=annual&limit=4&apikey=${apiKey}`).then(r=>r.json());
  const out: any = { name: ticker, statements: {} };
  for (const row of inc) {
    const y = new Date(row.calendarYear || row.date).getFullYear();
    out.statements[y] ||= { IncomeStatement: {}, BalanceSheet: {}, CashFlow: {} };
    out.statements[y].IncomeStatement = {
      Revenue: row.revenue,
      "Cost of Revenue": row.costOfRevenue,
      "Gross Profit": row.grossProfit,
      "Operating Income": row.operatingIncome,
      "Net Income": row.netIncome,
    };
  }
  for (const row of bal) {
    const y = new Date(row.calendarYear || row.date).getFullYear();
    out.statements[y] ||= { IncomeStatement: {}, BalanceSheet: {}, CashFlow: {} };
    out.statements[y].BalanceSheet = {
      "Total Assets": row.totalAssets,
      "Total Liabilities": row.totalLiabilities,
      Equity: row.totalStockholdersEquity,
      "Current Assets": row.totalCurrentAssets,
      "Current Liabilities": row.totalCurrentLiabilities,
    };
  }
  for (const row of cfs) {
    const y = new Date(row.calendarYear || row.date).getFullYear();
    out.statements[y] ||= { IncomeStatement: {}, BalanceSheet: {}, CashFlow: {} };
    out.statements[y].CashFlow = {
      "Cash from Operations": row.netCashProvidedByOperatingActivities,
      CapEx: row.capitalExpenditure,
      "Free Cash Flow": (row.netCashProvidedByOperatingActivities ?? 0) + (row.capitalExpenditure ?? 0),
    };
  }
  return out;
}

// ------------------------------- UI --------------------------------------
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-0.5 rounded-full text-[11px]" style={{background:"#1d232e", color:"#9fb1c1", border:"1px solid #2a3240"}}>{children}</span>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`${BRAND.card} ${BRAND.text} rounded-2xl border ${BRAND.border} p-3 ${className}`}>
      {children}
    </div>
  );
}

function LineItem({ label, value, draggable = true }: { label: string; value: number | null | undefined; draggable?: boolean }) {
  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ label, value }));
  }
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={`flex items-center justify-between py-1.5 px-2 rounded border-b ${BRAND.border} hover:bg-[#0f1319]`}
      title="Drag into Ratio Builder"
    >
      <span className="text-[12px]">{label}</span>
      <span className={`text-[12px] tabular-nums ${BRAND.subtext}`}>{formatMoney(value)}</span>
    </div>
  );
}

function DropZone({ label, onDropData, filled }: { label: string; onDropData: (d: { label: string; value: number }) => void; filled?: boolean }) {
  const [hover, setHover] = useState(false);
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("text/plain");
    try {
      const d = JSON.parse(raw);
      if (typeof d.value === "number") onDropData(d);
    } catch {}
    setHover(false);
  }
  return (
    <div
      onDragOver={(e)=>{e.preventDefault(); setHover(true);}}
      onDragLeave={()=>setHover(false)}
      onDrop={onDrop}
      className={`flex-1 rounded-xl border-2 border-dashed p-2 min-h-[44px] ${hover ? "border-[#2ecc71] bg-[#0e1a13]" : BRAND.border + " bg-[#0f1319]"} ${filled ? "" : "opacity-80"}`}
    >
      <div className="text-[11px]" style={{color:"#9fb1c1"}}>{label}</div>
    </div>
  );
}

// Types
type RatioDef = { numerator: string; denominator: string; label: string };

type Company = {
  ticker: string;
  name: string;
  data: any;
  years: number[];
  yearIndex: number;
};

export default function App() {
  const [companies, setCompanies] = useState<Company[]>(()=>[normalizeCompany("TSLA", DEMO_DATA.TSLA)]);
  const [ratioDefs, setRatioDefs] = useState<RatioDef[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fmpKey, setFmpKey] = useState("");
  const [baselineIdx, setBaselineIdx] = useState(0);
  const [uiScale, setUiScale] = useState(0.95); // compact by default
  const [testSummary, setTestSummary] = useState<{passed:number; total:number}>({passed:0, total:0});

  function normalizeCompany(ticker: string, payload: any): Company {
    const years = Object.keys(payload.statements || {}).map(Number).sort((a,b)=>b-a);
    return { ticker, name: payload.name || ticker, data: payload, years, yearIndex: 0 };
  }

  async function addTicker(ticker: string) {
    const T = ticker.trim().toUpperCase();
    if (!T) return;
    let payload: any = null;
    try { if (fmpKey) payload = await fetchFmpStatements(T, fmpKey); } catch {}
    if (!payload) payload = (DEMO_DATA as any)[T] || { name: T, statements: {} };
    setCompanies(prev => [...prev, normalizeCompany(T, payload)]);
  }

  function updateYear(idx: number, delta: number) {
    setCompanies(prev => prev.map((c,i)=>{
      if (i !== idx) return c;
      const next = Math.min(Math.max(c.yearIndex + delta, 0), Math.max(0, c.years.length - 1));
      return { ...c, yearIndex: next };
    }));
  }

  function onDropMakeRatio(nData: any, dData: any) {
    const label = tryLabel(nData.label, dData.label);
    const newDef: RatioDef = { numerator: nData.label, denominator: dData.label, label };
    setRatioDefs(prev => prev.some(r => r.numerator===newDef.numerator && r.denominator===newDef.denominator) ? prev : [...prev, newDef]);
  }

  function importJsonForTicker(ticker: string, json: string) {
    try {
      const parsed = JSON.parse(json);
      const normalized = normalizeCompany(ticker, parsed);
      setCompanies(prev => prev.map(c => c.ticker===ticker ? normalized : c));
    } catch { alert("Invalid JSON"); }
  }

  // ------------------------ Lightweight self-tests -----------------------
  useEffect(()=>{
    const results: Array<{name:string; pass:boolean; msg?:string}> = [];
    function test(name: string, fn: ()=>boolean) {
      let pass = false, msg = "";
      try { pass = !!fn(); } catch (e:any) { pass = false; msg = String(e?.message||e); }
      results.push({name, pass, msg});
    }
    // Tests
    test("tryLabel maps Gross Profit/Revenue to Gross Margin", ()=> tryLabel("Gross Profit","Revenue") === "Gross Margin");
    test("isHigherBetter false for Debt to Equity", ()=> isHigherBetter("Debt to Equity") === false);
    test("formatMoney 1000 -> 1.00K", ()=> formatMoney(1000) === "1.00K");
    // Data ratio sanity: TSLA 2024 Net Income / Revenue ≈ 0.0809
    test("TSLA 2024 NI/Revenue ≈ 0.081", ()=>{
      const s = DEMO_DATA.TSLA.statements[2024];
      const v = (s.IncomeStatement["Net Income"]) / (s.IncomeStatement.Revenue);
      return Math.abs(v - 0.0809) < 0.005;
    });
    const passed = results.filter(r=>r.pass).length;
    setTestSummary({passed, total: results.length});
    if (passed !== results.length) {
      console.warn("Self-tests failing:", results.filter(r=>!r.pass));
    }
  }, []);

  return (
    <div className={`${BRAND.bg} min-h-screen ${BRAND.text}`} style={{zoom: uiScale}}>
      <header className="p-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl" style={{background:BRAND.accent}} />
          <div>
            <div className="text-lg font-bold tracking-wide">The Iron Vanguard</div>
            <div className={`text-[11px] ${BRAND.subtext}`}>Ratios Builder</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-[11px] ${BRAND.subtext}`}>Baseline</div>
          <select className={`${BRAND.card} border ${BRAND.border} rounded-xl px-2 py-1 text-sm`} value={baselineIdx} onChange={(e)=>setBaselineIdx(parseInt(e.target.value))}>
            {companies.map((c,i)=>(<option key={c.ticker} value={i}>{c.ticker}</option>))}
          </select>
          <div className={`text-[11px] ${BRAND.subtext}`}>UI scale</div>
          <input type="range" min={0.85} max={1.1} step={0.01} value={uiScale} onChange={(e)=>setUiScale(parseFloat(e.target.value))} />
          <span className={`text-[11px] px-2 py-0.5 rounded border ${BRAND.border}`}>Tests: {testSummary.passed}/{testSummary.total}</span>
          <button className={`px-3 py-2 rounded-xl border ${BRAND.border}`} onClick={()=>setSettingsOpen(true)}>Settings</button>
          <TickerAdder onAdd={addTicker} />
        </div>
      </header>

      {/* Main layout, denser and fills space */}
      <div className="p-3 grid grid-cols-12 gap-3">
        {/* Companies grid fills left side, wraps instead of single row */}
        <div className="col-span-7 grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3 content-start">
          {companies.map((c, idx) => (
            <Card key={c.ticker} className="flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-sm truncate pr-2" title={`${c.ticker} · ${c.name}`}>{c.ticker} · {c.name}</div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button className={`px-2 py-1 rounded border ${BRAND.border}`} onClick={()=>updateYear(idx, +1)} title="Newer year">▲</button>
                  <Tag>{c.years[c.yearIndex] || "No Year"}</Tag>
                  <button className={`px-2 py-1 rounded border ${BRAND.border}`} onClick={()=>updateYear(idx, -1)} title="Older year">▼</button>
                </div>
              </div>
              <div>
                <CompanyStatements company={c} />
              </div>
            </Card>
          ))}
        </div>

        {/* Right rail uses full height for builder + comparison */}
        <div className="col-span-5 flex flex-col gap-3 sticky top-3 self-start">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">Ratio Builder</div>
              <div className={`text-[11px] ${BRAND.subtext}`}>Baseline: {companies[baselineIdx]?.ticker || "n/a"}</div>
            </div>
            <RatioBuilder onMakeRatio={onDropMakeRatio} />
            {/* quick presets to reduce empty space and speed demos */}
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                {n:"Gross Profit", d:"Revenue"},
                {n:"Net Income", d:"Revenue"},
                {n:"Net Income", d:"Equity"},
                {n:"Current Assets", d:"Current Liabilities"},
                {n:"Total Liabilities", d:"Equity"},
                {n:"Cash from Operations", d:"Revenue"},
              ].map(p=> (
                <button key={p.n+p.d} className={`text-[11px] px-2 py-1 rounded-lg border ${BRAND.border}`} onClick={()=>onDropMakeRatio({label:p.n, value:1},{label:p.d, value:1})}>{tryLabel(p.n,p.d)}</button>
              ))}
            </div>
          </Card>

          <Card>
            <CompareTable companies={companies} ratioDefs={ratioDefs} baselineIdx={baselineIdx} />
          </Card>
        </div>
      </div>

      {settingsOpen && (
        <SettingsModal onClose={()=>setSettingsOpen(false)} fmpKey={fmpKey} setFmpKey={setFmpKey} onImport={importJsonForTicker} />
      )}
    </div>
  );
}

function CompanyStatements({ company }: { company: Company }) {
  const year = company.years[company.yearIndex];
  const s = company.data.statements[year];
  const blocks = [
    { title: "Income", data: s?.IncomeStatement },
    { title: "Balance", data: s?.BalanceSheet },
    { title: "Cash Flow", data: s?.CashFlow },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {blocks.map((b)=> (
        <div key={b.title} className="flex flex-col min-h-0">
          <div className="text-[11px] mb-1" style={{color:"#9fb1c1"}}>{b.title}</div>
          <div className={`rounded-xl border ${BRAND.border}`} style={{scrollbarWidth:"thin"}}>
            {b.data ? (
              Object.entries(b.data).map(([k,v]) => (
                <LineItem key={k} label={k} value={typeof v === 'number' ? v : null} />
              ))
            ) : (
              <div className="p-3 text-[12px]" style={{color:"#9fb1c1"}}>No data</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RatioBuilder({ onMakeRatio }: { onMakeRatio: (n: any, d: any) => void }) {
  const [num, setNum] = useState<any | null>(null);
  const [den, setDen] = useState<any | null>(null);
  useEffect(()=>{ if (num && den) onMakeRatio(num, den); }, [num, den]);
  return (
    <div className="flex items-center gap-2">
      <DropZone label={num ? `Numerator: ${num.label}` : "Drop Numerator"} onDropData={setNum} filled={!!num} />
      <div className="text-xs" style={{color:"#9fb1c1"}}>÷</div>
      <DropZone label={den ? `Denominator: ${den.label}` : "Drop Denominator"} onDropData={setDen} filled={!!den} />
      <button className={`px-3 py-2 rounded-xl border ${BRAND.border}`} onClick={()=>{setNum(null); setDen(null);}}>Clear</button>
    </div>
  );
}

function CompareTable({ companies, ratioDefs, baselineIdx = 0 }: { companies: Company[]; ratioDefs: RatioDef[]; baselineIdx?: number }) {
  function getValue(c: Company, def: RatioDef): number | null {
    const y = c.years[c.yearIndex];
    const s = c.data.statements[y];
    if (!s) return null;
    const pool: Record<string, number | undefined> = { ...(s.IncomeStatement||{}), ...(s.BalanceSheet||{}), ...(s.CashFlow||{}) };
    const n = pool[def.numerator];
    const d = pool[def.denominator];
    if (typeof n !== "number" || typeof d !== "number" || d === 0) return null;
    return n / d;
  }

  const baseline = companies[baselineIdx];
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-[13px]">
        <thead>
          <tr className={`text-left border-b ${BRAND.border}`}>
            <th className="py-2 pr-3 w-[44%]">Ratio</th>
            {companies.map(c => (
              <th key={c.ticker} className="py-2 pr-3 whitespace-nowrap w-[14%]">{c.ticker} {c.years[c.yearIndex] ? `(${c.years[c.yearIndex]})` : ""}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ratioDefs.length === 0 ? (
            <tr><td className="py-3 text-[12px]" style={{color:"#9fb1c1"}} colSpan={companies.length+1}>Define a ratio by dragging items. Common pairs auto-label.</td></tr>
          ) : (
            ratioDefs.map((r, idx) => {
              // Compute all values row-wise
              const vals = companies.map(c => getValue(c, r));
              const baseVal = baseline ? getValue(baseline, r) : null;
              // Find best index per heuristic
              let bestIdx = -1;
              let bestVal: number | null = null;
              if (vals.length) {
                vals.forEach((v, i) => {
                  if (v === null) return;
                  if (bestVal === null) { bestVal = v; bestIdx = i; return; }
                  const better = isHigherBetter(r.label) ? v > bestVal! : v < bestVal!;
                  if (better) { bestVal = v; bestIdx = i; }
                });
              }
              return (
                <tr key={idx} className={`border-b ${BRAND.border}`}>
                  <td className="py-2 pr-3 align-top">
                    <div className="font-medium">{r.label}</div>
                    <div className={`text-[11px] ${BRAND.subtext}`}>{r.numerator} / {r.denominator}</div>
                  </td>
                  {companies.map((c, i) => {
                    const v = vals[i];
                    const isPct = /Margin|Return|to Sales|Gross/i.test(r.label);
                    const formatted = v === null ? "–" : isPct ? `${(v*100).toFixed(1)}%` : v.toFixed(2);
                    let badge: string | null = null;
                    let color = "";
                    if (baseVal !== null && v !== null && i !== baselineIdx && Math.abs(baseVal) > 0) {
                      const diff = ((v - baseVal) / Math.abs(baseVal)) * 100;
                      const better = isHigherBetter(r.label) ? diff > 0 : diff < 0;
                      badge = `${diff>=0?"+":""}${diff.toFixed(1)}%`;
                      color = better ? "#2ecc71" : "#c0392b";
                    }
                    const isBest = i === bestIdx && v !== null;
                    const cellStyle = isBest ? { outline: `2px solid ${BRAND.accent}`, outlineOffset: 2, borderRadius: 10 } : {};
                    return (
                      <td key={c.ticker} className="py-2 pr-3 tabular-nums align-top">
                        <div style={cellStyle} className="inline-block px-2 py-1 rounded-md">
                          <span>{formatted}</span>
                          {badge && <span className="ml-1 text-[11px]" style={{color}}>({badge})</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function TickerAdder({ onAdd }: { onAdd: (t: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input value={val} onChange={(e)=>setVal(e.target.value)} placeholder="Add ticker" className={`${BRAND.card} ${BRAND.text} rounded-xl border ${BRAND.border} px-3 py-2 w-[160px]`} />
      <button onClick={()=>{ onAdd(val); setVal(""); }} className="px-3 py-2 rounded-xl" style={{background:BRAND.accent, color:'#0b0d10'}} title="Add company">+</button>
    </div>
  );
}

function SettingsModal({ onClose, fmpKey, setFmpKey, onImport }: { onClose: ()=>void; fmpKey: string; setFmpKey: (v:string)=>void; onImport: (t:string, j:string)=>void }) {
  const [ticker, setTicker] = useState("");
  const [json, setJson] = useState("");
  const example = JSON.stringify(DEMO_DATA.TSLA, null, 2);
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4">
      <div className={`${BRAND.card} ${BRAND.text} border ${BRAND.border} max-w-3xl w-full p-4`}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Settings</div>
          <button className={`px-3 py-1 rounded border ${BRAND.border}`} onClick={onClose}>Close</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-semibold mb-1">Live data (FMP)</div>
            <div className={`text-[11px] ${BRAND.subtext} mb-2`}>Enter an API key to enable direct fetches.</div>
            <input value={fmpKey} onChange={(e)=>setFmpKey(e.target.value)} placeholder="FMP API key" className={`${BRAND.card} rounded-xl border ${BRAND.border} px-3 py-2 w-full`} />
            <div className={`text-[11px] ${BRAND.subtext} mt-2`}>Key stays client side, memory only.</div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-1">Paste JSON for a ticker</div>
            <div className={`text-[11px] ${BRAND.subtext} mb-2`}>Use the demo structure.</div>
            <div className="flex items-center gap-2 mb-2">
              <input value={ticker} onChange={(e)=>setTicker(e.target.value)} placeholder="Ticker, e.g., TSLA" className={`${BRAND.card} rounded-xl border ${BRAND.border} px-3 py-2 flex-1`} />
              <button className="px-3 py-2 rounded-xl" style={{background:BRAND.accent, color:'#0b0d10'}} onClick={()=>onImport(ticker, json)}>Import</button>
            </div>
            <textarea value={json} onChange={(e)=>setJson(e.target.value)} rows={8} className={`${BRAND.card} rounded-xl border ${BRAND.border} font-mono text-xs w-full p-2`} placeholder={example} />
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-semibold mb-1">Expected JSON shape</div>
          <pre className={`${BRAND.card} border ${BRAND.border} text-[11px] p-3 rounded-xl overflow-auto`}>{`
{
  "name": "Company Name",
  "statements": {
    "2024": {
      "IncomeStatement": { "Revenue": 0, "Gross Profit": 0, "Net Income": 0 },
      "BalanceSheet": { "Total Assets": 0, "Total Liabilities": 0, "Equity": 0, "Current Assets": 0, "Current Liabilities": 0 },
      "CashFlow": { "Cash from Operations": 0, "CapEx": 0, "Free Cash Flow": 0 }
    },
    "2023": { /* ... */ }
  }
}
`}</pre>
        </div>
      </div>
    </div>
  );
}

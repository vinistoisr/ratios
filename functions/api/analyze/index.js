// functions/api/analyze/index.js
import { Ai } from '@cloudflare/ai';

export async function onRequestPost(context) {
  try {
    const ai = new Ai(context.env.AI); // <-- bind Workers AI as "AI" in Pages settings
    const body = await context.request.json();

    const { companies = [], ratioDefs = [], baselineIdx = 0 } = body;

    // Build a compact, deterministic prompt
    const header =
`You are a concise equity analyst. Compare companies using the provided
annual metrics and the already-calculated ratios. Focus on INSIGHT, not re-stating raw numbers.`;

    const formatRules =
`OUTPUT RULES:
- Write 5 short bullets. Each bullet ≤ 30 words.
- Use tickers and years when referencing values (e.g., "AAPL 2024").
- Start the first bullet with "Leader:" identifying the strongest overall given the active ratios.
- Include exactly one risk/concern bullet.
- No tables, no code blocks.`;

    const dataBlock = JSON.stringify({ companies, ratioDefs, baselineIdx });

    const messages = [
      { role: "system",
        content: `${header}\n${formatRules}\nBe neutral and specific. No investment advice.` },
      { role: "user", content: `DATA:\n${dataBlock}\n\nWrite the 5 bullets now.` }
    ];

    const { response } = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages,
      temperature: 0.25,
      max_tokens: 500
    });

    // Normalize and cap just in case
    const text = String(response || "").trim().slice(0, 1500);
    return Response.json({ text });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// functions/api/analyze/index.js

export async function onRequestPost({ env, request }) {
  try {
    const { companies = [], ratioDefs = [], baselineIdx = 0 } = await request.json();

    const header =
`You are a concise equity analyst. Compare companies using the provided
annual metrics and the already-calculated ratios. Focus on INSIGHT, not restating raw numbers.`;

    const formatRules =
`OUTPUT RULES:
- Write 5 short bullets. Each bullet ≤ 30 words.
- Use tickers and years when referencing values.
- Start the first bullet with "Leader:" naming the strongest overall given the active ratios.
- Include exactly one risk bullet.
- No tables, no code blocks.`;

    const dataBlock = JSON.stringify({ companies, ratioDefs, baselineIdx });

    const messages = [
      { role: "system", content: `${header}\n${formatRules}\nBe neutral and specific. No investment advice.` },
      { role: "user", content: `DATA:\n${dataBlock}\n\nWrite the 5 bullets now.` }
    ];

    // Call Workers AI via the AI binding
    const res = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages,
      temperature: 0.25,
      max_tokens: 500
    });

    const text = String(res?.response || "").trim().slice(0, 1500);
    return Response.json({ text });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

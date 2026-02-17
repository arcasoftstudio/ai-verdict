export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, responses, category = 'general' } = req.body;

  if (!prompt || !responses) {
    return res.status(400).json({ error: 'prompt and responses are required' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

  const judgePrompt = `You are an expert AI response evaluator. Analyze these three AI responses to the same prompt and determine which is best.

ORIGINAL PROMPT: "${prompt}"
CATEGORY: ${category}

RESPONSE A (Llama 3.1 70B):
${responses.llama?.text || 'Error: no response'}

RESPONSE B (Mixtral 8x7B):
${responses.mixtral?.text || 'Error: no response'}

RESPONSE C (Gemini 1.5 Flash):
${responses.gemini?.text || 'Error: no response'}

Evaluate each response on:
1. Accuracy (factual correctness, 0-10)
2. Depth (completeness and detail, 0-10)
3. Clarity (how easy to understand, 0-10)

Respond ONLY with this exact JSON format, no other text:
{
  "winner": "llama" | "mixtral" | "gemini",
  "confidence": 85,
  "scores": {
    "llama": { "accuracy": 8.5, "depth": 7.0, "clarity": 9.0, "total": 8.2 },
    "mixtral": { "accuracy": 7.0, "depth": 8.0, "clarity": 7.5, "total": 7.5 },
    "gemini": { "accuracy": 9.0, "depth": 6.5, "clarity": 8.0, "total": 7.8 }
  },
  "takeaway": "One sentence explaining why the winner is best and what the others lack.",
  "winner_reason": "Two sentences explaining specifically what makes the winner stand out."
}`;

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-70b-versatile',
      messages: [{ role: 'user', content: judgePrompt }],
      max_tokens: 500,
      temperature: 0.3, // Low temperature for consistent verdicts
    }),
  });

  const data = await r.json();
  if (!r.ok) return res.status(500).json({ error: data.error?.message || 'Judge error' });

  // Parse JSON from response
  const text = data.choices[0].message.content;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return res.status(500).json({ error: 'Could not parse verdict' });

  const verdict = JSON.parse(jsonMatch[0]);
  return res.status(200).json(verdict);
}

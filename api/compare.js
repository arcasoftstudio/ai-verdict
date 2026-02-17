export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, category = 'general' } = req.body;

  // Validate
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  if (prompt.length > 1000) {
    return res.status(400).json({ error: 'Prompt too long (max 1000 characters)' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY;
  const GOOGLE_KEY = process.env.GOOGLE_API_KEY;

  if (!GROQ_KEY || !GOOGLE_KEY) {
    return res.status(500).json({ error: 'API keys not configured' });
  }

  // System prompt based on category
  const systemPrompts = {
    coding: 'You are an expert software engineer. Give precise, well-structured technical answers with code examples when relevant.',
    marketing: 'You are a senior marketing strategist. Give creative, persuasive, and actionable responses.',
    legal: 'You are a knowledgeable legal advisor. Give accurate, well-structured responses. Always note this is not legal advice.',
    general: 'You are a helpful, knowledgeable assistant. Give clear, accurate, and well-structured responses.',
    writing: 'You are an expert writer and editor. Give creative, polished, and engaging responses.',
  };

  const systemPrompt = systemPrompts[category] || systemPrompts.general;

  // Call Groq - Llama
  async function callLlama() {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Llama error');
    return {
      model: 'Llama 3.1 70B',
      provider: 'llama',
      text: data.choices[0].message.content,
      time: data.usage?.total_tokens || 0,
    };
  }

  // Call Groq - Mixtral
  async function callMixtral() {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Mixtral error');
    return {
      model: 'Mixtral 8x7B',
      provider: 'mixtral',
      text: data.choices[0].message.content,
      time: data.usage?.total_tokens || 0,
    };
  }

  // Call Google Gemini
  async function callGemini() {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nUser: ${prompt}` }] }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'Gemini error');
    return {
      model: 'Gemini 1.5 Flash',
      provider: 'gemini',
      text: data.candidates[0].content.parts[0].text,
      time: 0,
    };
  }

  // Run all in parallel
  const startTime = Date.now();

  const [llama, mixtral, gemini] = await Promise.allSettled([
    callLlama(),
    callMixtral(),
    callGemini(),
  ]);

  const totalTime = Date.now() - startTime;

  const responses = {
    llama: llama.status === 'fulfilled' ? llama.value : { error: llama.reason?.message, model: 'Llama 3.1 70B', provider: 'llama' },
    mixtral: mixtral.status === 'fulfilled' ? mixtral.value : { error: mixtral.reason?.message, model: 'Mixtral 8x7B', provider: 'mixtral' },
    gemini: gemini.status === 'fulfilled' ? gemini.value : { error: gemini.reason?.message, model: 'Gemini 1.5 Flash', provider: 'gemini' },
    totalTime,
  };

  return res.status(200).json(responses);
}

// api/compare.js — chiama 3 modelli Llama in parallelo via Groq (gratis, no carta)

import { checkRateLimit, getIP } from './_rateLimit.js';

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';

const MODELS = {
  llama:   'llama-3.3-70b-versatile',
  mixtral: 'llama-3.1-8b-instant',
  gemini:  'llama3-groq-70b-8192-tool-use-preview',
};

const SYSTEM_PROMPTS = {
  general:   'You are a helpful, accurate AI assistant. Answer clearly and concisely.',
  coding:    'You are an expert software engineer. Provide clean, well-explained code solutions.',
  marketing: 'You are a senior marketing strategist. Provide actionable, compelling copy and strategy.',
  writing:   'You are a professional writer and editor. Provide clear, engaging, well-structured text.',
  legal:     'You are a knowledgeable legal assistant. Provide balanced information with appropriate disclaimers.',
};

async function callModel(modelKey, prompt, category, apiKey) {
  const start = Date.now();
  try {
    const res = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELS[modelKey],
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[category] || SYSTEM_PROMPTS.general },
          { role: 'user',   content: prompt },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Model ${modelKey} error:`, err);
      return { error: `Model unavailable` };
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const responseMs = Date.now() - start;
    const tokens = data.usage?.completion_tokens || 0;

    return { text, responseMs, tokens };

  } catch (e) {
    console.error(`Model ${modelKey} threw:`, e.message);
    return { error: e.message };
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY not set — aggiungila su Vercel → Settings → Environment Variables' });
  }

  // Rate limit: 30 richieste/ora per IP
  const ip = getIP(req);
  const { allowed, remaining, resetIn } = checkRateLimit(ip, 30);
  if (!allowed) {
    return res.status(429).json({
      error: `Limite raggiunto. Riprova tra ${resetIn} minuti.`,
    });
  }
  res.setHeader('X-RateLimit-Remaining', remaining);

  const { prompt, category = 'general' } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt mancante' });
  }
  if (prompt.length > 2000) {
    return res.status(400).json({ error: 'Prompt troppo lungo (max 2000 caratteri)' });
  }

  // Chiama tutti e 3 i modelli in parallelo
  const [llama, mixtral, gemini] = await Promise.all([
    callModel('llama',   prompt.trim(), category, apiKey),
    callModel('mixtral', prompt.trim(), category, apiKey),
    callModel('gemini',  prompt.trim(), category, apiKey),
  ]);

  return res.status(200).json({ llama, mixtral, gemini });
}

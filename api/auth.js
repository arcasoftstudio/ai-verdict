// api/auth.js — verifica token Clerk lato server
// Usato da compare.js e judge.js per proteggere le API

export async function verifyClerkToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, userId: null, error: 'No token provided' };
  }

  const token = authHeader.replace('Bearer ', '');
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    // Se non c'è la secret key configurata, lascia passare (dev mode)
    console.warn('CLERK_SECRET_KEY not set — skipping auth check');
    return { valid: true, userId: 'dev-user', error: null };
  }

  try {
    // Verifica il token con l'API di Clerk
    const res = await fetch('https://api.clerk.com/v1/tokens/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      return { valid: false, userId: null, error: 'Invalid token' };
    }

    const data = await res.json();
    return { valid: true, userId: data.sub || data.user_id, error: null };

  } catch (e) {
    console.error('Auth verification error:', e.message);
    return { valid: false, userId: null, error: 'Auth error' };
  }
}

// api/_rateLimit.js — protezione anti-abuso per IP

const ipMap = new Map();

/**
 * Controlla rate limit per IP
 * @param {string} ip
 * @param {number} maxPerHour
 */
export function checkRateLimit(ip, maxPerHour = 30) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 ora

  if (!ipMap.has(ip)) {
    ipMap.set(ip, { count: 0, windowStart: now });
  }

  const entry = ipMap.get(ip);

  // Reset finestra se scaduta
  if (now - entry.windowStart > windowMs) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count++;
  const remaining = Math.max(0, maxPerHour - entry.count);
  const resetIn = Math.ceil((entry.windowStart + windowMs - now) / 1000 / 60);

  return {
    allowed: entry.count <= maxPerHour,
    remaining,
    resetIn,
  };
}

/**
 * Prende l'IP reale dall'header Vercel
 */
export function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

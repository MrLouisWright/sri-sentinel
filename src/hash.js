import crypto from 'node:crypto';

export const ALGORITHMS = ['sha256', 'sha384', 'sha512'];
const STRENGTH = { sha256: 1, sha384: 2, sha512: 3 };

export function computeIntegrity(buf, algorithm = 'sha384') {
  if (!ALGORITHMS.includes(algorithm)) throw new Error(`Unsupported algorithm: ${algorithm} (use ${ALGORITHMS.join(', ')})`);
  return `${algorithm}-${crypto.createHash(algorithm).update(buf).digest('base64')}`;
}

const B64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const LEN = { sha256: 44, sha384: 64, sha512: 88 };

/** Parse an integrity attribute into valid tokens per the SRI spec (unknown algorithms ignored). */
export function parseIntegrity(value) {
  const tokens = [];
  const invalid = [];
  for (const t of String(value || '').trim().split(/\s+/).filter(Boolean)) {
    const m = /^(sha256|sha384|sha512)-([^?]+)(\?.*)?$/i.exec(t);
    if (!m) { invalid.push(t); continue; }
    const alg = m[1].toLowerCase();
    const digest = m[2];
    if (!B64.test(digest) || digest.replace(/-/g, '+').replace(/_/g, '/').length !== LEN[alg]) { invalid.push(t); continue; }
    tokens.push({ alg, digest: digest.replace(/-/g, '+').replace(/_/g, '/') });
  }
  return { tokens, invalid };
}

/**
 * Verify content against an integrity value as a browser would: only the strongest
 * algorithm present counts, and any token of that algorithm may match.
 */
export function verifyIntegrity(buf, value) {
  const { tokens, invalid } = parseIntegrity(value);
  if (!tokens.length) return { valid: false, ok: false, invalid };
  const strongest = tokens.reduce((a, t) => (STRENGTH[t.alg] > STRENGTH[a] ? t.alg : a), tokens[0].alg);
  const expected = computeIntegrity(buf, strongest).slice(strongest.length + 1);
  const ok = tokens.some((t) => t.alg === strongest && t.digest === expected);
  return { valid: true, ok, algorithm: strongest, invalid };
}

export const strength = (alg) => STRENGTH[alg] || 0;

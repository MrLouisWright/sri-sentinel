import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export function site(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sri-'));
  for (const [f, c] of Object.entries(files)) { const p = path.join(dir, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); }
  return dir;
}
export const sri = (c, alg = 'sha384') => `${alg}-${crypto.createHash(alg).update(c).digest('base64')}`;
export const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

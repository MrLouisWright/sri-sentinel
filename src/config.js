import fs from 'node:fs';
import path from 'node:path';
import { RULES, SEVERITIES } from './rules.js';
import { ALGORITHMS } from './hash.js';

export const CONFIG_FILES = ['.sri-sentinel.json', '.sri-sentinelrc.json', '.sri-sentinelrc'];
export const DEFAULTS = {
  algorithm: 'sha384', failOn: 'high', base: '/', origin: '', remote: false, crossorigin: 'anonymous',
  timeout: 10000, allow: [], ignore: [], rules: {},
};

export function loadConfig(dir = '.', explicit) {
  let cfg = {};
  const f = explicit || CONFIG_FILES.map((c) => path.join(dir, c)).find((p) => fs.existsSync(p));
  if (f) cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
  else if (fs.existsSync(path.join(dir, 'package.json'))) { try { cfg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))['sri-sentinel'] || {}; } catch { /* ignore */ } }
  if (cfg.allowlist && !cfg.allow) cfg.allow = cfg.allowlist;
  return validate({ ...DEFAULTS, ...cfg });
}

export function validate(cfg) {
  if (!ALGORITHMS.includes(cfg.algorithm)) throw new Error(`Invalid algorithm: ${cfg.algorithm}`);
  if (![...SEVERITIES, 'none'].includes(cfg.failOn)) throw new Error(`Invalid failOn: ${cfg.failOn}`);
  if (!['anonymous', 'use-credentials'].includes(cfg.crossorigin)) throw new Error(`Invalid crossorigin: ${cfg.crossorigin}`);
  for (const [k, v] of Object.entries(cfg.rules || {})) {
    if (!RULES[k]) throw new Error(`Unknown rule in config: ${k}`);
    if (v !== 'off' && !SEVERITIES.includes(v)) throw new Error(`Invalid level for ${k}: ${v}`);
  }
  if (cfg.origin) { try { cfg.origin = new URL(cfg.origin).origin; } catch { throw new Error(`Invalid origin: ${cfg.origin}`); } }
  return cfg;
}

export const globRe = (g) => new RegExp('^' + String(g).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*').replace(/\?/g, '.') + '$');
export const norm = (p) => p.split(path.sep).join('/').replace(/^\.\//, '');

/**
 * allow: [{ url?, rule?, file?, reason?, expires? }] or "url-glob" / "rule:url-glob".
 * Entries without a rule exempt the resource entirely (it is never rewritten either).
 */
export function allowEntries(allow, now = Date.now()) {
  return (allow || []).map((a) => {
    if (typeof a === 'string') {
      const m = /^([a-z-]+):(?!\/\/)(.*)$/s.exec(a);
      a = m && RULES[m[1]] ? { rule: m[1], url: m[2] } : { url: a };
    }
    return a;
  }).filter((a) => !(a.expires && Date.parse(a.expires) < now));
}

export function isAllowed(entries, { rule, url, file }) {
  return entries.some((a) => {
    if (a.rule && a.rule !== '*' && a.rule !== rule) return false;
    if (a.url && !(url && globRe(a.url).test(url))) return false;
    if (a.file && !(file && globRe(norm(a.file)).test(norm(file)))) return false;
    return true;
  });
}

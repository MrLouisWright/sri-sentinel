import { findTags } from './html.js';

/** @typedef {{ tag: ReturnType<typeof findTags>[number], json: string, bodyStart: number, bodyEnd: number, parsed: Record<string, unknown> | null }} ImportMapBlock */

/** Find inline `<script type="importmap">` bodies in HTML. */
export function findImportMapBlocks(html) {
  /** @type {ImportMapBlock[]} */
  const blocks = [];
  for (const tag of findTags(html)) {
    if (tag.name !== 'script') continue;
    const type = (tag.get('type')?.value || '').trim().toLowerCase();
    if (type !== 'importmap') continue;
    const close = html.toLowerCase().indexOf('</script', tag.end);
    if (close === -1) continue;
    const json = html.slice(tag.end, close).trim();
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      parsed = null;
    }
    blocks.push({ tag, json, bodyStart: tag.end, bodyEnd: close, parsed });
  }
  return blocks;
}

/** Collect module URLs referenced by an import map (imports + nested scopes). */
export function importMapUrls(map) {
  const urls = new Set();
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'integrity') continue;
      if (typeof v === 'string') urls.add(v);
      else if (typeof v === 'object' && v !== null) walk(v);
    }
  };
  walk(map.imports);
  if (map.scopes && typeof map.scopes === 'object') {
    for (const scope of Object.values(map.scopes)) walk(scope);
  }
  return urls;
}

/**
 * Merge expected integrity values into an import map's top-level `integrity` field.
 * @param {Record<string, unknown>} map
 * @param {Record<string, string>} urlToIntegrity keyed by resolved manifest URL keys
 */
export function applyImportMapIntegrity(map, urlToIntegrity) {
  if (!map || typeof map !== 'object') return map;
  const integrity = { ...(map.integrity && typeof map.integrity === 'object' ? map.integrity : {}) };
  for (const [url, hash] of Object.entries(urlToIntegrity)) {
    if (hash) integrity[url] = hash;
  }
  if (Object.keys(integrity).length) map.integrity = integrity;
  return map;
}

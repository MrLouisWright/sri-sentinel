import fs from 'node:fs';
import path from 'node:path';
import { findTags, lineOf, setAttrs } from './html.js';
import { computeIntegrity, verifyIntegrity, strength } from './hash.js';
import { loadConfig, validate, allowEntries, isAllowed, globRe, norm } from './config.js';
import { RULES } from './rules.js';

const SKIP_DIRS = new Set(['node_modules', '.git']);
const DYNAMIC = /\{\{|\{%|<%|\$\{|\[\[|^#|^\s*$/;
const INLINE = /^(data|blob|javascript|about):/i;

export function findHtmlFiles(paths, ignore = []) {
  const out = [];
  const ig = ignore.map(globRe);
  const walk = (p, root) => {
    const st = fs.statSync(p);
    const rel = norm(path.relative(root, p));
    if (rel && ig.some((r) => r.test(rel))) return;
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(p).sort()) if (!SKIP_DIRS.has(e)) walk(path.join(p, e), root);
    } else if (/\.html?$/i.test(p)) out.push({ file: p, root });
  };
  for (const p of paths) {
    if (!fs.existsSync(p)) throw new Error(`No such file or directory: ${p}`);
    const root = fs.statSync(p).isDirectory() ? p : path.dirname(p);
    walk(p, root);
  }
  return out;
}

/** Which tags take part in SRI: <script src> and <link rel=stylesheet|modulepreload|preload as=script|style>. */
export function sriTarget(tag) {
  if (tag.name === 'script') { const s = tag.get('src'); return s ? s.value : null; }
  const rel = (tag.get('rel')?.value || '').toLowerCase().split(/\s+/);
  const href = tag.get('href');
  if (!href) return null;
  if (rel.includes('stylesheet') || rel.includes('modulepreload')) return href.value;
  if (rel.includes('preload') && ['script', 'style'].includes((tag.get('as')?.value || '').toLowerCase())) return href.value;
  return null;
}

const normBase = (b) => { b = b || '/'; if (!b.startsWith('/')) b = '/' + b; return b.endsWith('/') ? b : b + '/'; };

/**
 * Resolve a reference relative to an HTML file.
 * Returns { kind: 'local'|'remote'|'dynamic'|'inline'|'unsupported', ... }
 */
export function resolveRef(ref, htmlFile, root, { base = '/', origin = '' } = {}) {
  ref = String(ref).trim();
  if (DYNAMIC.test(ref)) return { kind: 'dynamic', ref };
  if (INLINE.test(ref)) return { kind: 'inline', ref };
  let urlPath;
  if (/^\/\//.test(ref) || /^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    let u;
    try { u = new URL(ref.startsWith('//') ? 'https:' + ref : ref); } catch { return { kind: 'unsupported', ref }; }
    if (!/^https?:$/.test(u.protocol)) return { kind: 'unsupported', ref };
    if (!(origin && u.origin === origin)) return { kind: 'remote', ref, url: u.href, key: u.href, crossOrigin: true };
    urlPath = u.pathname;
  } else urlPath = ref.replace(/[?#].*$/s, '');
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { decoded = urlPath; }
  let file;
  if (decoded.startsWith('/')) {
    const b = normBase(base);
    const rest = decoded.startsWith(b) ? decoded.slice(b.length) : decoded.replace(/^\/+/, '');
    file = path.join(root, rest);
  } else file = path.join(path.dirname(htmlFile), decoded);
  const relRoot = path.relative(root, file);
  const key = '/' + norm(relRoot);
  if (relRoot.startsWith('..') || path.isAbsolute(relRoot)) return { kind: 'local', ref, file, key, outside: true, crossOrigin: false };
  return { kind: 'local', ref, file, key, crossOrigin: false };
}

export async function fetchRemote(url, { timeout = 10000, fetchImpl = globalThis.fetch } = {}) {
  if (!fetchImpl) throw new Error('fetch is not available (Node 18+ required)');
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Scan HTML files for SRI problems, optionally writing integrity attributes.
 * @param {object} opts { paths, configPath, config, write, remote, cwd, fetchImpl }
 */
export async function scan(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const paths = (opts.paths && opts.paths.length ? opts.paths : ['.']).map((p) => path.resolve(cwd, p));
  const config = validate({ ...loadConfig(cwd, opts.configPath && path.resolve(cwd, opts.configPath)), ...stripUndef(opts.config || {}) });
  const remote = opts.remote ?? config.remote;
  const write = !!opts.write;
  const allow = allowEntries(config.allow);
  const files = findHtmlFiles(paths, config.ignore);
  const findings = [];
  const manifest = {};
  const written = [];
  const resources = [];
  let suppressed = 0;
  const contentCache = new Map();
  const remoteCache = new Map();

  const getContent = async (res) => {
    const k = res.kind === 'remote' ? res.url : res.file;
    if (contentCache.has(k)) return contentCache.get(k);
    let v;
    try {
      if (res.kind === 'remote') {
        if (!remoteCache.has(res.url)) remoteCache.set(res.url, fetchRemote(res.url, { timeout: config.timeout, fetchImpl: opts.fetchImpl }));
        v = { buf: await remoteCache.get(res.url) };
      } else if (res.outside) v = { error: 'outside the site root' };
      else if (!fs.existsSync(res.file) || !fs.statSync(res.file).isFile()) v = { error: 'file not found' };
      else v = { buf: fs.readFileSync(res.file) };
    } catch (e) { v = { error: e.message }; }
    contentCache.set(k, v);
    return v;
  };

  for (const { file, root } of files) {
    const html = fs.readFileSync(file, 'utf8');
    const relFile = norm(path.relative(cwd, file));
    const edits = [];
    for (const tag of findTags(html)) {
      const ref = sriTarget(tag);
      if (ref === null) continue;
      if (tag.get('data-sri-ignore')) continue;
      const line = lineOf(html, tag.start);
      const res = resolveRef(ref, file, root, config);
      const url = res.key || ref;
      const report = (rule, message, fix, extra = {}) => {
        const level = config.rules[rule] || RULES[rule].severity;
        if (level === 'off') return;
        const f = { rule, severity: level, file: relFile, line, url, message, fix, ...extra };
        if (isAllowed(allow, f)) { suppressed++; return; }
        findings.push(f);
      };
      if (res.kind === 'inline' || res.kind === 'unsupported') continue;
      if (res.kind === 'dynamic') { report('dynamic-resource', `Skipped dynamic URL "${ref}"`, 'Add integrity at render time, or allowlist it'); continue; }
      if (allow.some((a) => !a.rule && a.url && globRe(a.url).test(url) && (!a.file || globRe(norm(a.file)).test(relFile)))) { suppressed++; continue; }

      const integrityAttr = tag.get('integrity');
      const current = integrityAttr ? integrityAttr.value.trim() : '';
      const hasCO = !!tag.get('crossorigin');
      const entry = { file: relFile, line, tag: tag.name, ref, url, kind: res.kind, crossOrigin: res.crossOrigin, integrity: current || null };
      resources.push(entry);

      let content = null;
      if (res.kind === 'local' || remote) content = await getContent(res);
      const expected = content && content.buf ? computeIntegrity(content.buf, config.algorithm) : null;
      if (expected) { entry.expected = expected; manifest[url] = { integrity: expected, ...(res.kind === 'local' ? { file: norm(path.relative(cwd, res.file)) } : {}), crossOrigin: res.crossOrigin }; }

      const set = {};
      const coFix = res.crossOrigin && !hasCO ? ` crossorigin="${config.crossorigin}"` : '';
      if (content && content.error) {
        if (res.kind === 'remote') report('fetch-failed', `Could not fetch ${res.url}: ${content.error}`, 'Check the URL and network access, or allowlist it');
        else report('unresolved-resource', `Could not resolve "${ref}" (${content.error}: ${norm(path.relative(cwd, res.file))})`, 'Check the path and --base, or allowlist it');
      }
      if (!current) {
        if (!(content && content.error && res.kind === 'local')) report('missing-integrity', `<${tag.name}> "${ref}" has no integrity attribute`, expected ? `Add integrity="${expected}"${coFix}` : res.kind === 'remote' && !remote ? 'Run with --remote to fetch and hash it, then --write' : 'Fix the reference so it can be hashed', { expected, fixable: !!expected });
        if (expected) set.integrity = expected;
      } else {
        const v = content && content.buf ? verifyIntegrity(content.buf, current) : null;
        const parsedOk = v ? v.valid : /^(sha256|sha384|sha512)-/i.test(current);
        if (v && !v.valid) {
          report('invalid-integrity', `Integrity "${current}" on "${ref}" is malformed or uses an unsupported algorithm`, `Replace with integrity="${expected}"`, { expected, actual: current, fixable: true });
          set.integrity = expected;
        } else if (!v && !parsedOk) {
          report('invalid-integrity', `Integrity "${current}" on "${ref}" is malformed or uses an unsupported algorithm`, 'Regenerate it with sri-sentinel --write', { actual: current });
        } else if (v && !v.ok) {
          report('integrity-mismatch', `Integrity for "${ref}" does not match its content (wrong or stale)`, `Replace with integrity="${expected}"`, { expected, actual: current, fixable: true });
          set.integrity = expected;
        } else if (v && v.ok && strength(v.algorithm) < strength(config.algorithm)) {
          report('weak-algorithm', `"${ref}" uses ${v.algorithm}; configured algorithm is ${config.algorithm}`, `Replace with integrity="${expected}"`, { expected, actual: current, fixable: true });
          set.integrity = expected;
        } else if (!v && res.kind === 'remote') {
          report('remote-unverified', `Integrity on ${res.url} not verified`, 'Run with --remote to verify remote hashes');
        }
        if (res.crossOrigin && !hasCO) report('missing-crossorigin', `Cross-origin "${ref}" has integrity but no crossorigin attribute`, `Add crossorigin="${config.crossorigin}"`, { fixable: true });
      }
      if (res.crossOrigin && !hasCO && (current || set.integrity)) set.crossorigin = config.crossorigin;
      if (write && Object.keys(set).length) edits.push({ tag, text: setAttrs(tag, set) });
    }
    if (write && edits.length) {
      let out = html;
      for (const e of edits.sort((a, b) => b.tag.start - a.tag.start)) out = out.slice(0, e.tag.start) + e.text + out.slice(e.tag.end);
      fs.writeFileSync(file, out);
      written.push(relFile);
    }
  }
  if (write) for (const f of findings) if (f.fixable && written.includes(f.file)) f.fixed = true;
  return { files: files.map((f) => norm(path.relative(cwd, f.file))), resources, findings, manifest: { algorithm: config.algorithm, resources: sortObj(manifest) }, written, suppressed, config };
}

const stripUndef = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

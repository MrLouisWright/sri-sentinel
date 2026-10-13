import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { scan, exitCode, formatSarif, formatJson, formatMarkdown, formatText } from '../src/index.js';
import { site, sri, read } from './helpers.js';

let server; let origin;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/lib.js') { res.end('cdn-lib'); return; }
    if (req.url === '/slow.js') { setTimeout(() => res.end('x'), 2000); return; }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections?.(); server.close(); });

const rules = (r) => r.findings.filter((f) => !f.fixed).map((f) => f.rule).sort();

test('reports missing, mismatched and valid integrity on local files', async () => {
  const dir = site({ 'a.js': 'A', 'b.css': 'B', 'c.js': 'C', 'index.html': `<script src="a.js"></script><link rel="stylesheet" href="b.css" integrity="${sri('old')}"><script src="c.js" integrity="${sri('C')}"></script>` });
  const r = await scan({ paths: [dir], cwd: dir });
  assert.deepEqual(rules(r), ['integrity-mismatch', 'missing-integrity']);
  assert.equal(r.resources.length, 3);
  assert.equal(exitCode(r), 1);
  assert.equal(exitCode(r, 'none'), 0);
  assert.equal(r.findings.find((f) => f.rule === 'integrity-mismatch').expected, sri('B'));
});

test('--write adds integrity and is idempotent; check then passes', async () => {
  const dir = site({ 'assets/a.js': 'A', 'index.html': '<script src="/assets/a.js?v=1#x" defer></script>\n<link rel=stylesheet href="assets/a.js" integrity="sha384-AAAA">' });
  const r = await scan({ paths: [dir], cwd: dir, write: true });
  assert.deepEqual(r.written, ['index.html']);
  assert.equal(exitCode(r), 0);
  const html = read(dir, 'index.html');
  assert.match(html, new RegExp(`<script src="/assets/a.js\\?v=1#x" defer integrity="${sri('A').replace(/[+/]/g, '\\$&')}"></script>`));
  assert.equal(html.match(/integrity=/g).length, 2);
  assert.doesNotMatch(html, /crossorigin/);
  const again = await scan({ paths: [dir], cwd: dir, write: true });
  assert.equal(again.written.length, 0);
  assert.equal(again.findings.length, 0);
});

test('detects stale integrity after a file changes', async () => {
  const dir = site({ 'a.js': 'v1', 'index.html': '<script src="a.js"></script>' });
  await scan({ paths: [dir], cwd: dir, write: true });
  (await import('node:fs')).writeFileSync(`${dir}/a.js`, 'v2');
  const r = await scan({ paths: [dir], cwd: dir });
  assert.deepEqual(rules(r), ['integrity-mismatch']);
});

test('algorithms: sha512 output and weak-algorithm upgrade', async () => {
  const dir = site({ 'a.js': 'A', 'index.html': `<script src="a.js" integrity="${sri('A', 'sha256')}"></script>` });
  const r = await scan({ paths: [dir], cwd: dir });
  assert.deepEqual(rules(r), ['weak-algorithm']);
  assert.equal(exitCode(r), 0);
  await scan({ paths: [dir], cwd: dir, write: true, config: { algorithm: 'sha512' } });
  assert.match(read(dir, 'index.html'), new RegExp(sri('A', 'sha512').replace(/[+/]/g, '\\$&')));
});

test('invalid integrity values are flagged and fixed', async () => {
  const dir = site({ 'a.js': 'A', 'index.html': '<script src="a.js" integrity="md5-abc"></script>' });
  assert.deepEqual(rules(await scan({ paths: [dir], cwd: dir })), ['invalid-integrity']);
  await scan({ paths: [dir], cwd: dir, write: true });
  assert.match(read(dir, 'index.html'), /integrity="sha384-/);
});

test('base path, nested pages, relative ../ and origin-absolute URLs', async () => {
  const dir = site({
    'assets/a.js': 'A',
    'docs/guide/index.html': '<script src="../../assets/a.js"></script><script src="/app/assets/a.js"></script><script src="https://example.com/app/assets/a.js"></script>',
  });
  const r = await scan({ paths: [dir], cwd: dir, write: true, config: { base: '/app', origin: 'https://example.com' } });
  assert.equal(exitCode(r), 0, formatText(r));
  const html = read(dir, 'docs/guide/index.html');
  assert.equal(html.match(new RegExp(sri('A').replace(/[+/]/g, '\\$&'), 'g')).length, 3);
  assert.doesNotMatch(html, /crossorigin/, 'same-origin URLs need no crossorigin');
  assert.deepEqual(Object.keys(r.manifest.resources), ['/assets/a.js']);
});

test('unresolved, outside-root, dynamic, data: and protocol-relative resources', async () => {
  const dir = site({ 'index.html': '<script src="/nope.js"></script><script src="../../etc/passwd"></script><script src="{{ url }}"></script><script src="${CDN}/x.js"></script><script src="data:text/javascript,1"></script><script src="//cdn.example.com/x.js"></script><script src="%E0%A4%A.js"></script>' });
  const r = await scan({ paths: [dir], cwd: dir, write: true });
  assert.deepEqual(rules(r), ['dynamic-resource', 'dynamic-resource', 'missing-integrity', 'unresolved-resource', 'unresolved-resource', 'unresolved-resource']);
  assert.equal(r.findings.find((f) => f.rule === 'missing-integrity').url, 'https://cdn.example.com/x.js');
  assert.match(r.findings.find((f) => f.url.includes('passwd')).message, /outside the site root/);
  assert.equal(r.written.length, 0);
});

test('--remote fetches CDN files, adds crossorigin, caches and reports failures', async () => {
  let calls = 0;
  const fetchImpl = (u, o) => { calls++; return fetch(u, o); };
  const dir = site({ 'index.html': `<script src="${origin}/lib.js"></script><script src="${origin}/lib.js" crossorigin="use-credentials"></script><link rel="stylesheet" href="${origin}/missing.css">` });
  const r = await scan({ paths: [dir], cwd: dir, write: true, remote: true, fetchImpl });
  assert.equal(calls, 2);
  assert.deepEqual(rules(r), ['fetch-failed', 'missing-integrity']);
  const html = read(dir, 'index.html');
  assert.match(html, new RegExp(`lib.js" integrity="${sri('cdn-lib').replace(/[+/]/g, '\\$&')}" crossorigin="anonymous"`));
  assert.match(html, /crossorigin="use-credentials" integrity=/);
  assert.equal(r.manifest.resources[`${origin}/lib.js`].crossOrigin, true);
});

test('remote: without --remote integrity is unverified; with --remote mismatches and missing crossorigin are caught', async () => {
  const dir = site({ 'index.html': `<script src="${origin}/lib.js" integrity="${sri('other')}"></script>` });
  assert.deepEqual(rules(await scan({ paths: [dir], cwd: dir })), ['missing-crossorigin', 'remote-unverified']);
  assert.deepEqual(rules(await scan({ paths: [dir], cwd: dir, remote: true })), ['integrity-mismatch', 'missing-crossorigin']);
});

test('remote timeout is reported as fetch-failed', async () => {
  const dir = site({ 'index.html': `<script src="${origin}/slow.js"></script>` });
  const r = await scan({ paths: [dir], cwd: dir, remote: true, config: { timeout: 200 } });
  assert.deepEqual(rules(r), ['fetch-failed', 'missing-integrity']);
});

test('allowlist (config file), rule overrides, ignore globs and data-sri-ignore', async () => {
  const dir = site({
    '.sri-sentinel.json': JSON.stringify({ allowlist: ['https://analytics.example.com/**', { rule: 'unresolved-resource', url: '/gone.js', reason: 'removed later' }, { url: '/expired.js', expires: '2000-01-01' }], ignore: ['legacy/**'], rules: { 'dynamic-resource': 'off' } }),
    'index.html': '<script src="https://analytics.example.com/a.js"></script><script src="/gone.js"></script><script src="/expired.js"></script><script src="{{x}}"></script><script src="/skip.js" data-sri-ignore></script>',
    'legacy/old.html': '<script src="/x.js"></script>',
  });
  const r = await scan({ paths: [dir], cwd: dir });
  assert.deepEqual(r.files, ['index.html']);
  assert.deepEqual(rules(r), ['unresolved-resource']);
  assert.equal(r.findings[0].url, '/expired.js');
  assert.equal(r.suppressed, 2);
});

test('package.json "sri-sentinel" key and invalid config errors', async () => {
  const dir = site({ 'package.json': JSON.stringify({ 'sri-sentinel': { algorithm: 'sha256' } }), 'a.js': 'A', 'index.html': '<script src="a.js"></script>' });
  const r = await scan({ paths: [dir], cwd: dir });
  assert.equal(r.findings[0].expected, sri('A', 'sha256'));
  await assert.rejects(scan({ paths: [dir], cwd: dir, config: { algorithm: 'md5' } }), /Invalid algorithm/);
  await assert.rejects(scan({ paths: [dir], cwd: dir, config: { rules: { nope: 'high' } } }), /Unknown rule/);
  await assert.rejects(scan({ paths: [`${dir}/missing`], cwd: dir }), /No such file/);
});

test('formats: JSON, SARIF and Markdown', async () => {
  const dir = site({ 'a.js': 'A', 'index.html': '<p>\n<script src="a.js"></script>' });
  const r = await scan({ paths: [dir], cwd: dir });
  const j = JSON.parse(formatJson(r));
  assert.equal(j.summary.high, 1);
  assert.equal(j.findings[0].line, 2);
  const s = JSON.parse(formatSarif(r, '1.0.0'));
  assert.equal(s.version, '2.1.0');
  assert.equal(s.runs[0].results[0].ruleId, 'missing-integrity');
  assert.equal(s.runs[0].results[0].locations[0].physicalLocation.region.startLine, 2);
  assert.match(formatMarkdown(r), /\| high \| `index.html` \| 2 \| `missing-integrity`/);
  const clean = await scan({ paths: [dir], cwd: dir, write: true });
  assert.match(formatMarkdown(await scan({ paths: [dir], cwd: dir })), /No SRI problems/);
  assert.match(formatText(clean), /1 fixed/);
});

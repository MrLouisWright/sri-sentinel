import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sriVite from '../src/plugins/vite.js';
import { SriSentinelPlugin } from '../src/plugins/webpack.js';
import { site, sri, read } from './helpers.js';

test('vite plugin rewrites built HTML in outDir using base', async () => {
  const dir = site({ 'dist/app/x.js': 'X', 'dist/index.html': '<script type="module" src="/base/app/x.js"></script>' });
  const p = sriVite({ manifest: 'sri.json' });
  assert.equal(p.apply, 'build');
  p.configResolved({ root: dir, base: '/base/', build: { outDir: 'dist' } });
  await p.closeBundle.call({ info() {} });
  assert.match(read(dir, 'dist/index.html'), /integrity="sha384-/);
  assert.equal(JSON.parse(read(dir, 'dist/sri.json')).resources['/app/x.js'].integrity, sri('X'));
});

test('vite plugin throws when problems remain at failOn', async () => {
  const dir = site({ 'dist/index.html': '<script src="/missing.js"></script>' });
  const p = sriVite({ failOn: 'medium', silent: true });
  p.configResolved({ root: dir, base: '/', build: { outDir: 'dist' } });
  await assert.rejects(p.closeBundle.call({}), /unresolved-resource/);
});

test('webpack plugin hooks afterEmit and reports errors on the compilation', async () => {
  const dir = site({ 'out/main.js': 'M', 'out/index.html': '<script defer src="/static/main.js"></script><script src="/nope.js"></script>' });
  let hook;
  const compiler = { context: dir, hooks: { afterEmit: { tapPromise: (name, fn) => { assert.equal(name, 'SriSentinelPlugin'); hook = fn; } } } };
  new SriSentinelPlugin({ failOn: 'medium', algorithm: 'sha512' }).apply(compiler);
  const compilation = { outputOptions: { path: path.join(dir, 'out'), publicPath: '/static/' }, errors: [] };
  await hook(compilation);
  assert.match(read(dir, 'out/index.html'), new RegExp(sri('M', 'sha512').replace(/[+/]/g, '\\$&')));
  assert.equal(compilation.errors.length, 1);
  assert.ok(fs.existsSync(path.join(dir, 'out/index.html')));
});

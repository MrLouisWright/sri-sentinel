import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const req = createRequire(path.join(root, 'package.json'));

test('require() and import() resolve the published entry points', async () => {
  const cjs = req('sri-sentinel');
  assert.equal(typeof cjs.scan, 'function');
  assert.equal(typeof cjs.computeIntegrity, 'function');
  const esm = await import('sri-sentinel');
  assert.equal(typeof esm.verifyIntegrity, 'function');
  assert.equal(typeof req('sri-sentinel/webpack').SriSentinelPlugin, 'function');
  assert.equal(typeof (await import('sri-sentinel/vite')).default, 'function');
  assert.equal(typeof req('sri-sentinel/rollup').default, 'function');
  assert.equal(typeof req('sri-sentinel/esbuild').default, 'function');
  assert.equal(typeof (await import('sri-sentinel/astro')).default, 'function');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeIntegrity, verifyIntegrity, parseIntegrity } from '../src/index.js';
import { sri } from './helpers.js';

test('computeIntegrity supports sha256/384/512 and rejects others', () => {
  for (const a of ['sha256', 'sha384', 'sha512']) assert.equal(computeIntegrity('abc', a), sri('abc', a));
  assert.equal(computeIntegrity('abc'), sri('abc'));
  assert.throws(() => computeIntegrity('abc', 'sha1'), /Unsupported/);
});

test('verifyIntegrity uses the strongest algorithm, any matching token passes', () => {
  assert.equal(verifyIntegrity('abc', sri('abc')).ok, true);
  assert.equal(verifyIntegrity('abc', `${sri('x', 'sha512')} ${sri('abc', 'sha256')}`).ok, false);
  assert.equal(verifyIntegrity('abc', `${sri('x', 'sha384')} ${sri('abc', 'sha384')}`).ok, true);
  assert.equal(verifyIntegrity('abc', `${sri('abc', 'sha384')}?opt`).ok, true);
  assert.equal(verifyIntegrity('abc', 'md5-xyz').valid, false);
  assert.equal(verifyIntegrity('abc', 'sha384-short').valid, false);
});

test('parseIntegrity separates invalid tokens and accepts base64url', () => {
  const b64 = sri('abc').slice(7).replace(/\+/g, '-').replace(/\//g, '_');
  const r = parseIntegrity(`sha1-abc sha384-${b64}`);
  assert.equal(r.tokens.length, 1);
  assert.deepEqual(r.invalid, ['sha1-abc']);
  assert.equal(verifyIntegrity('abc', `sha384-${b64}`).ok, true);
});

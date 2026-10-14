import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from '../src/index.js';
import { site, sri, read } from './helpers.js';

test('writes import map integrity entries for mapped module URLs', async () => {
  const dir = site({
    'assets/chunk.js': 'CHUNK',
    'index.html': `<script type="importmap">{"imports":{"app":"/assets/chunk.js"}}</script>`,
  });
  await scan({ paths: [dir], cwd: dir, write: true });
  const html = read(dir, 'index.html');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.equal(map.integrity['/assets/chunk.js'], sri('CHUNK'));
});

test('modulepreload links receive integrity attributes', async () => {
  const dir = site({
    'm.js': 'M',
    'index.html': '<link rel="modulepreload" href="/m.js">',
  });
  await scan({ paths: [dir], cwd: dir, write: true });
  assert.match(read(dir, 'index.html'), new RegExp(`rel="modulepreload" href="/m.js" integrity="${sri('M').replace(/[+/]/g, '\\$&')}"`));
});

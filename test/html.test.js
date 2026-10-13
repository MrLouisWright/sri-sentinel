import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTags, setAttrs, sriTarget } from '../src/index.js';

test('findTags skips comments and script bodies, handles quotes containing >', () => {
  const html = `<!-- <script src="a.js"></script> --><script src='b.js' data-x="a>b"></script><script>document.write('<script src="c.js"></script>')</script><LINK REL=stylesheet HREF=d.css />`;
  const t = findTags(html);
  assert.deepEqual(t.map((x) => sriTarget(x)), ['b.js', null, 'd.css']);
  assert.equal(t[0].get('data-x').value, 'a>b');
});

test('sriTarget picks the right rel/as combinations', () => {
  const t = (h) => sriTarget(findTags(h)[0]);
  assert.equal(t('<link rel="preload" as="script" href="a.js">'), 'a.js');
  assert.equal(t('<link rel="preload" as="style" href="a.css">'), 'a.css');
  assert.equal(t('<link rel="preload" as="font" href="a.woff2">'), null);
  assert.equal(t('<link rel="modulepreload" href="m.js">'), 'm.js');
  assert.equal(t('<link rel="icon" href="f.ico">'), null);
  assert.equal(t('<link rel="alternate stylesheet" href="x.css">'), 'x.css');
  assert.equal(t('<script type="module">x</script>'), null);
});

test('setAttrs replaces in place and appends before > or />', () => {
  const [a] = findTags('<script src="a.js" integrity=old defer></script>');
  assert.equal(setAttrs(a, { integrity: 'sha384-x', crossorigin: 'anonymous' }), '<script src="a.js" integrity="sha384-x" defer crossorigin="anonymous">');
  const [b] = findTags('<link rel=stylesheet href="a.css"/>');
  assert.equal(setAttrs(b, { integrity: 'v"&' }), '<link rel=stylesheet href="a.css" integrity="v&quot;&amp;"/>');
});

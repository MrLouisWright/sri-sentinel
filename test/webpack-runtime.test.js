import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchWebpackLoadScriptRuntime } from '../src/webpack-runtime.js';

// Minimal webpack 5 runtime excerpt (loadScript helper only).
const SAMPLE = `r.m=e,r.l=(o,n,i,s)=>{c||(c=document.createElement("script"),c.setAttribute("data-webpack",t+i),c.src=o,0!==c.src.indexOf(window.location.origin+"/")&&(c.crossOrigin="anonymous"))};`;

test('patchWebpackLoadScriptRuntime injects sriHashes and script integrity', () => {
  const { source, patched } = patchWebpackLoadScriptRuntime(SAMPLE, { '792': 'sha384-lazyhash' });
  assert.equal(patched, true);
  assert.match(source, /r\.sriHashes=\{"792":"sha384-lazyhash"\}/);
  assert.match(source, /\.integrity=r\.sriHashes\[s\]/);
});

import fs from 'node:fs';
import path from 'node:path';
import { computeIntegrity } from './hash.js';

/**
 * Build chunk id -> integrity map from a webpack compilation after emit.
 * @param {{ chunks: Iterable<{ id: string | number | null, files: Iterable<string>, hasRuntime(): boolean }>, outputOptions: { path?: string }, compiler: { outputPath: string } }} compilation
 * @param {string} algorithm
 */
export function webpackChunkIntegrityMap(compilation, algorithm = 'sha384') {
  /** @type {Record<string, string>} */
  const map = {};
  const chunks = compilation.chunks;
  if (!chunks || typeof chunks[Symbol.iterator] !== 'function') return map;
  const out = compilation.outputOptions.path || compilation.compiler.outputPath;
  for (const chunk of chunks) {
    if (chunk.id == null) continue;
    for (const file of chunk.files) {
      if (!/\.(m?js|cjs)(\?|$)/i.test(file)) continue;
      const abs = path.join(out, file);
      if (!fs.existsSync(abs)) continue;
      map[String(chunk.id)] = computeIntegrity(fs.readFileSync(abs), algorithm);
    }
  }
  return map;
}

/**
 * Patch a webpack 5 web runtime bundle so lazy chunks load with SRI.
 * @param {string} source
 * @param {Record<string, string>} sriHashes chunk id -> integrity
 * @returns {{ source: string, patched: boolean, reason?: string }}
 */
export function patchWebpackLoadScriptRuntime(source, sriHashes) {
  if (!sriHashes || !Object.keys(sriHashes).length) return { source, patched: false, reason: 'empty map' };
  if (source.includes('.sriHashes=')) return { source, patched: true, reason: 'already patched' };
  const loadAssign = source.match(/(\w+)\.l=\((\w+),(\w+),(\w+),(\w+)\)=>/);
  if (!loadAssign) return { source, patched: false, reason: 'no loadScript' };
  const req = loadAssign[1];
  const chunkIdParam = loadAssign[5];
  const injectHashes = `${req}.sriHashes=${JSON.stringify(sriHashes)};`;
  let out = source.replace(`${req}.l=`, `${injectHashes}${req}.l=`);
  // webpack 5: `c.src=o,0!==c.src.indexOf(window.location.origin+"/")&&(c.crossOrigin="anonymous")`
  const loadIdx = out.indexOf(`${req}.l=`);
  if (loadIdx === -1) return { source, patched: false, reason: 'loadScript missing' };
  const tail = out.slice(loadIdx);
  const srcRe = /(\w)\.src=(\w),0!==\1\.src\.indexOf/;
  if (!srcRe.exec(tail)) return { source, patched: false, reason: 'loadScript body not recognized' };
  const patchedTail = tail.replace(
    srcRe,
    `$1.src=$2,${chunkIdParam}!=null&&${req}.sriHashes&&${req}.sriHashes[${chunkIdParam}]&&($1.integrity=${req}.sriHashes[${chunkIdParam}]),0!==$1.src.indexOf`,
  );
  out = out.slice(0, loadIdx) + patchedTail;
  return { source: out, patched: true };
}

/**
 * Write patched webpack runtime assets on disk after emit.
 * @param {{ chunks: Iterable<{ id: string | number | null, files: Iterable<string>, hasRuntime(): boolean }>, outputOptions: { path?: string }, compiler: { outputPath: string } }} compilation
 * @param {{ algorithm?: string }} [options]
 */
export function patchWebpackCompilationRuntime(compilation, options = {}) {
  const algorithm = options.algorithm || 'sha384';
  const sriHashes = webpackChunkIntegrityMap(compilation, algorithm);
  if (!Object.keys(sriHashes).length) return { patchedFiles: [], sriHashes };
  const out = compilation.outputOptions.path || compilation.compiler.outputPath;
  /** @type {string[]} */
  const patchedFiles = [];
  const chunks = compilation.chunks;
  if (!chunks || typeof chunks[Symbol.iterator] !== 'function') return { patchedFiles: [], sriHashes };
  for (const chunk of chunks) {
    if (typeof chunk.hasRuntime === 'function' && !chunk.hasRuntime()) continue;
    for (const file of chunk.files) {
      if (!/\.(m?js|cjs)(\?|$)/i.test(file)) continue;
      const abs = path.join(out, file);
      const src = fs.readFileSync(abs, 'utf8');
      const { source, patched } = patchWebpackLoadScriptRuntime(src, sriHashes);
      if (patched && source !== src) {
        fs.writeFileSync(abs, source);
        patchedFiles.push(file);
      }
    }
  }
  return { patchedFiles, sriHashes };
}

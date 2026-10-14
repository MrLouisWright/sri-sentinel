import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const entries = [
  ['src/index.js', 'index'],
  ['src/cli.js', 'cli'],
  ['src/plugins/vite.js', 'plugins/vite'],
  ['src/plugins/webpack.js', 'plugins/webpack'],
  ['src/plugins/rollup.js', 'plugins/rollup'],
  ['src/plugins/esbuild.js', 'plugins/esbuild'],
  ['src/plugins/astro.js', 'plugins/astro'],
];

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

for (const [entry, out] of entries) {
  for (const format of ['esm', 'cjs']) {
    await esbuild.build({
      entryPoints: [path.join(root, entry)],
      outfile: path.join(root, 'dist', `${out}.${format === 'esm' ? 'mjs' : 'cjs'}`),
      bundle: true,
      platform: 'node',
      format: format === 'esm' ? 'esm' : 'cjs',
      target: 'node18',
      sourcemap: true,
      banner: entry.endsWith('cli.js') && format === 'cjs' ? { js: '#!/usr/bin/env node' } : undefined,
    });
  }
}

execSync('npx tsc -p tsconfig.build.json', { cwd: root, stdio: 'inherit' });

// CLI shebang + executable bit for cjs bin
const cliCjs = path.join(root, 'dist/cli.cjs');
fs.chmodSync(cliCjs, 0o755);

console.log('build complete');

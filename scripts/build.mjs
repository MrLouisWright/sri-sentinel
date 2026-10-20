import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
      // CommonJS has no import.meta.url; point it at this file so createRequire() works.
      define: format === 'cjs' ? { 'import.meta.url': '__importMetaUrl' } : undefined,
      banner:
        format === 'cjs'
          ? {
              js:
                (entry.endsWith('cli.js') ? '#!/usr/bin/env node\n' : '') +
                "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
            }
          : undefined,
    });
  }
}

execSync('npx tsc -p tsconfig.build.json', { cwd: root, stdio: 'inherit' });

// CLI shebang + executable bit for cjs bin
const cliCjs = path.join(root, 'dist/cli.cjs');
fs.chmodSync(cliCjs, 0o755);

console.log('build complete');

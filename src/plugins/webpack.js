import fs from 'node:fs';
import path from 'node:path';
import { scan } from '../scan.js';
import { exitCode, formatText } from '../format.js';

/**
 * webpack 5 plugin: after assets are emitted, add integrity (and crossorigin) attributes to every
 * HTML file in output.path (e.g. produced by html-webpack-plugin).
 */
export class SriSentinelPlugin {
  constructor(options = {}) { this.options = options; }
  apply(compiler) {
    compiler.hooks.afterEmit.tapPromise('SriSentinelPlugin', async (compilation) => {
      const { failOn = 'high', manifest, remote, ...config } = this.options;
      const outDir = compilation.outputOptions.path;
      const pub = compilation.outputOptions.publicPath;
      if (!config.base && typeof pub === 'string' && pub.startsWith('/')) config.base = pub;
      const res = await scan({ paths: [outDir], cwd: compiler.context, write: true, remote, config });
      if (manifest) fs.writeFileSync(path.resolve(outDir, manifest), JSON.stringify(res.manifest, null, 2) + '\n');
      if (exitCode(res, failOn)) compilation.errors.push(new Error('sri-sentinel found unresolved SRI problems:\n' + formatText(res)));
    });
  }
}
export default SriSentinelPlugin;

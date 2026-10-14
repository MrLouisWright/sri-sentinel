import { patchWebpackCompilationRuntime } from '../webpack-runtime.js';
import { runPostBuildSri } from './shared.js';

/**
 * webpack 5 plugin: patch lazy-chunk loading with SRI, then rewrite HTML in output.path.
 */
export class SriSentinelPlugin {
  /** @param {{ failOn?: string, manifest?: string, remote?: boolean, runtime?: boolean } & import('../config.js').Config} [options] */
  constructor(options = {}) { this.options = options; }
  apply(compiler) {
    compiler.hooks.afterEmit.tapPromise('SriSentinelPlugin', async (compilation) => {
      const { failOn = 'high', manifest, remote, runtime = true, ...config } = this.options;
      const outDir = compilation.outputOptions.path;
      const pub = compilation.outputOptions.publicPath;
      if (!config.base && typeof pub === 'string' && pub.startsWith('/')) config.base = pub;
      if (runtime !== false) {
        patchWebpackCompilationRuntime(compilation, { algorithm: config.algorithm || 'sha384' });
      }
      const { res, message } = await runPostBuildSri({ paths: [outDir], cwd: compiler.context, options: { failOn, manifest, remote, ...config } });
      if (message) compilation.errors.push(new Error(message));
    });
  }
}
export default SriSentinelPlugin;

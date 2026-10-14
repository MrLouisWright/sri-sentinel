import path from 'node:path';
import { runPostBuildSri } from './shared.js';

/**
 * esbuild plugin: on successful build end, add SRI to HTML in `outdir`.
 * @param {{ failOn?: string, manifest?: string, remote?: boolean } & import('../config.js').Config} [options]
 */
export function sriSentinelEsbuild(options = {}) {
  return {
    name: 'sri-sentinel',
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length) return;
        const outdir = build.initialOptions.outdir;
        if (!outdir) return;
        const cwd = process.cwd();
        const { res, message } = await runPostBuildSri({ paths: [path.resolve(cwd, outdir)], cwd, options });
        if (message) throw new Error(message);
      });
    },
  };
}
export default sriSentinelEsbuild;

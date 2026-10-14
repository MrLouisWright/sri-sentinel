import path from 'node:path';
import { runPostBuildSri } from './shared.js';

/**
 * Rollup plugin: after the bundle is written, add SRI to HTML (and import maps) in output dir.
 * @param {{ dir?: string, failOn?: string, manifest?: string, remote?: boolean } & import('../config.js').Config} [options]
 */
export default function sriSentinelRollup(options = {}) {
  let outDir = options.dir || 'dist';
  let cwd = process.cwd();
  return {
    name: 'sri-sentinel',
    buildStart(o) { if (o.dir) outDir = o.dir; cwd = process.cwd(); },
    async writeBundle(output) {
      const dir = output.dir || outDir;
      const { res, message } = await runPostBuildSri({ paths: [dir], cwd, options });
      if (message) this.error(message);
      this.info?.(`sri-sentinel: ${res.resources.length} resource(s), ${res.written.length} HTML file(s) updated`);
    },
  };
}
export { sriSentinelRollup as sriSentinel };

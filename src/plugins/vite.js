import path from 'node:path';
import { runPostBuildSri } from './shared.js';

/**
 * Vite plugin: after the build is written, add integrity (and crossorigin) attributes to every
 * HTML file in build.outDir. Build-only; the dev server is untouched.
 * @param {{ algorithm?: string, remote?: boolean, origin?: string, crossorigin?: string, allow?: any[], failOn?: string, manifest?: string, silent?: boolean }} [options]
 */
export default function sriSentinel(options = {}) {
  let outDir; let base; let root;
  return {
    name: 'sri-sentinel',
    apply: 'build',
    enforce: 'post',
    configResolved(c) { root = c.root; outDir = path.resolve(c.root, c.build.outDir); base = c.base; },
    async closeBundle() {
      const { silent, ...rest } = options;
      const cfg = { ...rest };
      if (!cfg.base && base && base.startsWith('/')) cfg.base = base;
      const { res, message } = await runPostBuildSri({ paths: [outDir], cwd: root, options: cfg });
      if (!silent) this.info?.(`sri-sentinel: ${res.resources.length} resource(s), ${res.written.length} HTML file(s) updated`);
      if (message) throw new Error(message);
    },
  };
}
export { sriSentinel };

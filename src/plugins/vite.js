import path from 'node:path';
import { scan } from '../scan.js';
import { exitCode, formatText } from '../format.js';

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
      const { failOn = 'high', manifest, silent, remote, ...config } = options;
      if (!config.base && base && base.startsWith('/')) config.base = base;
      const res = await scan({ paths: [outDir], cwd: root, write: true, remote, config });
      if (manifest) { const fs = await import('node:fs'); fs.writeFileSync(path.resolve(outDir, manifest), JSON.stringify(res.manifest, null, 2) + '\n'); }
      if (!silent) this.info?.(`sri-sentinel: ${res.resources.length} resource(s), ${res.written.length} HTML file(s) updated`);
      if (exitCode(res, failOn)) throw new Error('sri-sentinel found unresolved SRI problems:\n' + formatText(res));
    },
  };
}
export { sriSentinel };

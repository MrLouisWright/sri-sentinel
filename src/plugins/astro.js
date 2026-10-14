import path from 'node:path';
import { runPostBuildSri } from './shared.js';

/**
 * Astro integration: after `astro build`, add SRI to HTML in the output directory.
 * @param {{ failOn?: string, manifest?: string, remote?: boolean } & import('../config.js').Config} [options]
 */
export default function sriSentinelAstro(options = {}) {
  return {
    name: 'sri-sentinel',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const out = dir instanceof URL ? dir.pathname : String(dir);
        const cwd = process.cwd();
        const { res, message } = await runPostBuildSri({ paths: [path.resolve(out)], cwd, options });
        if (message) throw new Error(message);
        logger?.info?.(`sri-sentinel: ${res.resources.length} resource(s), ${res.written.length} HTML file(s) updated`);
      },
    },
  };
}
export { sriSentinelAstro as sriSentinel };

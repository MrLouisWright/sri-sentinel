import fs from 'node:fs';
import path from 'node:path';
import { scan } from '../scan.js';
import { exitCode, formatText } from '../format.js';

/**
 * Post-build scan/write used by bundler integrations.
 * @param {{ paths: string[], cwd: string, options?: Record<string, unknown> }} params
 */
export async function runPostBuildSri({ paths, cwd, options = {} }) {
  const { failOn = 'high', manifest, remote, ...config } = options;
  const res = await scan({ paths, cwd, write: true, remote, config });
  if (manifest) {
    const base = path.resolve(cwd, paths[0]);
    const root = fs.statSync(base).isDirectory() ? base : path.dirname(base);
    fs.writeFileSync(path.resolve(root, manifest), JSON.stringify(res.manifest, null, 2) + '\n');
  }
  return { res, failOn, message: exitCode(res, failOn) ? 'sri-sentinel found unresolved SRI problems:\n' + formatText(res) : null };
}

import { createRequire } from 'node:module';
import fs from 'node:fs';
import { scan, formatText, formatJson, formatSarif, formatMarkdown, exitCode, SEVERITIES, ALGORITHMS } from './index.js';

const pkg = createRequire(import.meta.url)('../package.json');
const HELP = `sri-sentinel ${pkg.version} — Subresource Integrity generator and checker

Usage: sri-sentinel [dir|file...] [options]

Scans HTML in a built site (default: current directory) for <script src> and
<link rel=stylesheet|preload|modulepreload> and checks or writes integrity attributes.

Modes:
  --check                Report missing, wrong or stale integrity (default; for CI)
  --write                Write integrity (and crossorigin) attributes into the HTML

Options:
  -a, --algorithm <alg>  ${ALGORITHMS.join(' | ')} (default: sha384)
  --remote               Fetch and hash remote (CDN) resources
  --base <path>          Public base path the site is served from, e.g. /app/ (default: /)
  --origin <url>         Site origin; absolute URLs on it are treated as local files
  --crossorigin <v>      anonymous | use-credentials (default: anonymous)
  --manifest <file>      Write a JSON manifest of resource -> integrity
  --config <file>        Config file (default: .sri-sentinel.json or package.json "sri-sentinel")
  --fail-on <sev>        critical | high | medium | low | info | none (default: high)
  --format <fmt>         Stdout format: text | json | sarif | markdown (default: text)
  --json <file>          Also write a JSON report
  --sarif <file>         Also write a SARIF 2.1.0 report
  --markdown <file>      Also write a Markdown report
  --timeout <ms>         Remote fetch timeout (default: 10000)
  --no-fixes             Hide fix suggestions in text output
  --no-color             Disable colours
  -q, --quiet            Only print the summary
  -h, --help | -v, --version

Exit codes: 0 pass, 1 problems at or above --fail-on, 2 usage or runtime error.
`;

function parseArgs(argv) {
  const o = { paths: [], config: {}, format: 'text', color: (process.stdout.isTTY && !process.env.NO_COLOR) || !!process.env.FORCE_COLOR, fixes: true };
  const need = (i) => { const v = argv[i + 1]; if (v === undefined || (v.startsWith('-') && v.length > 1)) throw new Error(`${argv[i]} needs a value`); return v; };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline;
    if (a.startsWith('--') && a.includes('=')) { [a, inline] = [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]; argv.splice(i + 1, 0, inline); }
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '-v': case '--version': o.version = true; break;
      case '--check': o.check = true; break;
      case '--write': o.write = true; break;
      case '-a': case '--algorithm': o.config.algorithm = need(i); i++; if (!ALGORITHMS.includes(o.config.algorithm)) throw new Error(`Invalid --algorithm ${o.config.algorithm}`); break;
      case '--remote': o.remote = true; break;
      case '--base': o.config.base = need(i); i++; break;
      case '--origin': o.config.origin = need(i); i++; break;
      case '--crossorigin': o.config.crossorigin = need(i); i++; break;
      case '--manifest': o.manifest = need(i); i++; break;
      case '--config': o.configPath = need(i); i++; break;
      case '--fail-on': o.failOn = need(i); i++; if (![...SEVERITIES, 'none'].includes(o.failOn)) throw new Error(`Invalid --fail-on ${o.failOn}`); break;
      case '--format': o.format = need(i); i++; if (!['text', 'json', 'sarif', 'markdown'].includes(o.format)) throw new Error(`Invalid --format ${o.format}`); break;
      case '--json': o.json = need(i); i++; break;
      case '--sarif': o.sarif = need(i); i++; break;
      case '--markdown': o.markdown = need(i); i++; break;
      case '--timeout': o.config.timeout = Number(need(i)); i++; if (!(o.config.timeout > 0)) throw new Error('Invalid --timeout'); break;
      case '--no-fixes': o.fixes = false; break;
      case '--no-color': o.color = false; break;
      case '-q': case '--quiet': o.quiet = true; break;
      default: if (a.startsWith('-')) throw new Error(`Unknown option ${a}`); o.paths.push(a);
    }
  }
  if (o.check && o.write) throw new Error('--check and --write are mutually exclusive');
  return o;
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { process.stderr.write(`sri-sentinel: ${e.message}\n\n${HELP}`); return 2; }
  if (o.help) { process.stdout.write(HELP); return 0; }
  if (o.version) { process.stdout.write(pkg.version + '\n'); return 0; }
  const res = await scan({ paths: o.paths, configPath: o.configPath, config: o.config, write: o.write, remote: o.remote || undefined });
  if (!res.files.length) throw new Error('No HTML files found');
  const failOn = o.failOn || res.config.failOn;
  const out = { text: () => formatText(res, { color: o.color, fixes: o.fixes }), json: () => formatJson(res), sarif: () => formatSarif(res, pkg.version), markdown: () => formatMarkdown(res) };
  process.stdout.write(o.quiet && o.format === 'text' ? formatText(res, { color: o.color, summaryOnly: true }) : out[o.format]());
  if (o.json) fs.writeFileSync(o.json, out.json());
  if (o.sarif) fs.writeFileSync(o.sarif, out.sarif());
  if (o.markdown) fs.writeFileSync(o.markdown, out.markdown());
  if (o.manifest) fs.writeFileSync(o.manifest, JSON.stringify(res.manifest, null, 2) + '\n');
  return exitCode(res, failOn);
}

main().then((c) => { process.exitCode = c; }, (e) => { process.stderr.write(`sri-sentinel: ${e.message}\n`); process.exitCode = 2; });

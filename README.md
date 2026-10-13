# sri-sentinel

> Subresource Integrity (SRI) hashes for your built site: generate them, write them, and fail CI when they're missing, wrong or stale.

`sri-sentinel` scans the HTML in a built site directory for `<script src>` and `<link rel="stylesheet">`, `rel="modulepreload"` and `rel="preload" as="script|style"` tags. It hashes the local files (and, with `--remote`, CDN files), then either **writes** `integrity` attributes (plus `crossorigin="anonymous"` for cross-origin resources) or **checks** that the existing ones are correct. Every finding includes a file, line number, severity and a concrete fix.

CLI, library, Vite plugin, webpack plugin and GitHub Action. Node.js 18+, **zero runtime dependencies**.

## Install and run

```bash
npx sri-sentinel dist --write              # add integrity attributes to dist/**/*.html
npx sri-sentinel dist --check              # CI: fail on missing, wrong or stale integrity
npx sri-sentinel dist --write --remote     # also fetch and hash CDN resources
npx sri-sentinel dist --manifest sri.json  # JSON manifest of resource -> integrity
```

```text
dist/index.html
     4: high     <link> "/assets/app.css?v=42" has no integrity attribute [missing-integrity]
        ↳ Add integrity="sha384-IBXuE+SKr6nOANxq1LIznMbjQUHDJ3PY6mUpF3ZQCTz1+rK8Fip9GAGqRq59yH3C"
     5: high     <script> "https://cdn.jsdelivr.net/npm/htmx.org@2.0.3/dist/htmx.min.js" has no integrity attribute [missing-integrity]
        ↳ Run with --remote to fetch and hash it, then --write
     6: critical Integrity for "./assets/app.js" does not match its content (wrong or stale) [integrity-mismatch]
        ↳ Replace with integrity="sha384-Tc1KWaETWL9ZNn+TiVtHwsBd+yyFv2LCslp7PjwHT5aJCyBwpxnW7xtPA1RdtKbo"
     7: medium   Could not resolve "/assets/vendor.js" (file not found: dist/assets/vendor.js) [unresolved-resource]
        ↳ Check the path and --base, or allowlist it

1 HTML file(s), 4 resource(s): 1 critical, 2 high, 1 medium
```

After `--write --remote`:

```html
<link rel="stylesheet" href="/assets/app.css?v=42" integrity="sha384-IBXuE+SKr6nOANxq1LIznMbjQUHDJ3PY6mUpF3ZQCTz1+rK8Fip9GAGqRq59yH3C">
<script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.3/dist/htmx.min.js" integrity="sha384-0895/pl2MU10Hqc6jd4RvrthNlDiE9U1tWmX7WRESftEDRosgxNsQG/Ze9YMRzHq" crossorigin="anonymous"></script>
```

## Rules

| Rule | Severity | What it catches |
|---|---|---|
| `integrity-mismatch` | critical | The integrity value doesn't match the file: wrong, or stale after a rebuild |
| `missing-integrity` | high | A script or stylesheet with no `integrity` |
| `invalid-integrity` | high | Malformed value, wrong digest length or unsupported algorithm (`sha1-`, `md5-`) |
| `missing-crossorigin` | high | Cross-origin resource with `integrity` but no `crossorigin`. The browser will block it |
| `unresolved-resource` | medium | Local file not found or outside the site root, so it can't be hashed |
| `fetch-failed` | medium | `--remote` couldn't download the resource (HTTP error, timeout) |
| `weak-algorithm` | low | Valid hash, but weaker than the configured algorithm (e.g. sha256 when sha384 is set) |
| `remote-unverified` | info | Remote resource has integrity, but you didn't pass `--remote`, so it wasn't verified |
| `dynamic-resource` | info | Templated URL (`{{ }}`, `${}`, `<% %>`, `{% %}`) skipped |

Verification works the way browsers do it: only the strongest algorithm in the attribute counts, any hash of that algorithm may match, and base64url and `?options` are accepted.

## How URLs are resolved

| Reference | Resolved to |
|---|---|
| `app.js`, `./app.js`, `../assets/app.js` | Relative to the HTML file |
| `/assets/app.js` | Site root (the directory you scan). With `--base /app/`, `/app/assets/app.js` maps to `assets/app.js` |
| `https://example.com/assets/app.js` | Local if `--origin https://example.com` is set, otherwise remote (cross-origin) |
| `//cdn.example.com/x.js` | Remote, over https |
| `app.js?v=3#x` | The query string and fragment are ignored for file lookup and kept in the HTML |
| `data:`, `blob:`, inline `<script>` | Ignored |
| Paths escaping the site root | `unresolved-resource`, never read |

Add `data-sri-ignore` to a tag to skip it.

## Options

```
--check                Report missing, wrong or stale integrity (default)
--write                Write integrity (and crossorigin) attributes into the HTML
-a, --algorithm <alg>  sha256 | sha384 | sha512 (default: sha384)
--remote               Fetch and hash remote (CDN) resources
--base <path>          Public base path, e.g. /app/ (default: /)
--origin <url>         Site origin; absolute URLs on it are treated as local files
--crossorigin <v>      anonymous | use-credentials (default: anonymous)
--manifest <file>      Write a JSON manifest of resource -> integrity
--config <file>        Config file (default: .sri-sentinel.json or package.json "sri-sentinel")
--fail-on <sev>        critical | high | medium | low | info | none (default: high)
--format <fmt>         text | json | sarif | markdown (default: text)
--json/--sarif/--markdown <file>   Also write that report to a file
--timeout <ms>         Remote fetch timeout (default: 10000)
-q, --quiet            Only print the summary
```

**Exit codes:** `0` pass, `1` problems at or above `--fail-on`, `2` usage or runtime error. With `--write`, problems it fixed don't count.

## Config

`.sri-sentinel.json` (or a `"sri-sentinel"` key in `package.json`):

```json
{
  "algorithm": "sha384",
  "base": "/",
  "origin": "https://example.com",
  "remote": true,
  "failOn": "high",
  "allowlist": [
    "https://www.googletagmanager.com/**",
    { "rule": "unresolved-resource", "url": "/injected-at-runtime.js", "reason": "added by the CDN" },
    { "url": "https://cdn.example.com/beta/*", "reason": "rolling build", "expires": "2027-01-01" }
  ],
  "ignore": ["legacy/**"],
  "rules": { "dynamic-resource": "off", "weak-algorithm": "medium" }
}
```

An allowlist entry without a `rule` exempts the resource completely, and it's never rewritten. With a `rule`, only that finding is suppressed. Strings take the form `"url-glob"` or `"rule:url-glob"`. Entries past their `expires` date stop applying.

## Manifest

```json
{
  "algorithm": "sha384",
  "resources": {
    "/assets/app.css": { "integrity": "sha384-IBXu…", "file": "dist/assets/app.css", "crossOrigin": false },
    "https://cdn.jsdelivr.net/npm/htmx.org@2.0.3/dist/htmx.min.js": { "integrity": "sha384-0895…", "crossOrigin": true }
  }
}
```

## Vite

```js
// vite.config.js
import sri from 'sri-sentinel/vite';
export default { plugins: [sri({ remote: true, manifest: 'sri-manifest.json' })] };
```

Runs after the bundle is written (`closeBundle`), rewrites every HTML file in `build.outDir` and uses Vite's `base`. The build fails if problems at `failOn` (default `high`) remain. The dev server isn't affected.

## webpack

```js
// webpack.config.js
import { SriSentinelPlugin } from 'sri-sentinel/webpack';
export default { plugins: [new HtmlWebpackPlugin(), new SriSentinelPlugin({ algorithm: 'sha384' })] };
```

Runs on `afterEmit` over `output.path` and uses `output.publicPath` when it's an absolute path. Remaining problems are added to `compilation.errors`.

## GitHub Action

```yaml
- uses: MrLouisWright/sri-sentinel@v1
  with:
    paths: dist
    mode: check          # or write
    remote: 'true'
    fail-on: high
    sarif: sri.sarif
```

Inputs: `paths`, `mode`, `algorithm`, `remote`, `base`, `fail-on`, `config`, `manifest`, `sarif`, `json`, `job-summary` (Markdown report written to the job summary) and `args`.

## Library

```js
import { scan, computeIntegrity, verifyIntegrity, formatSarif, exitCode } from 'sri-sentinel';

const result = await scan({ paths: ['dist'], write: true, remote: true, config: { algorithm: 'sha512' } });
console.log(result.manifest, result.findings);
computeIntegrity('console.log(1)');             // 'sha384-…'
verifyIntegrity(buffer, 'sha384-… sha512-…');   // { valid, ok, algorithm }
```

TypeScript types are included.

## License

MIT © Louis Wright

# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

## 1.1.2 - 2026-10-20

- Fixed: the build script and tests no longer use `import.meta.dirname`, so they run on Node 18.
- Release workflow installs dependencies before publishing.
- Docs: README credit and support sections.

## [1.1.0] - 2026-10-14

### Added
- **Lazy / runtime chunks (webpack):** `SriSentinelPlugin` patches the webpack 5 runtime after emit so dynamically loaded chunks get `integrity` (and existing `crossOriginLoading`) on injected `<script>` tags, using a per-chunk `sriHashes` map. Disable with `{ runtime: false }`.
- **Import maps:** `--write` / scan updates the top-level `integrity` object in `<script type="importmap">` JSON for mapped module URLs; checks report missing or stale entries.
- **Bundler integrations:** `sri-sentinel/rollup`, `sri-sentinel/esbuild`, and `sri-sentinel/astro` post-build plugins (same HTML/import-map behaviour as Vite).
- **Dual package:** ESM (`.mjs`) and CommonJS (`.cjs`) builds via `package.json` `exports`; TypeScript declarations are generated from JSDoc-annotated source (`npm run build`).

### Changed
- Webpack, Vite, and shared plugin helpers consolidated; manifest writing shared across integrations.
- CI runs `npm run build`, tests `require()` and `import()` against published export paths, and dogfoods the built CLI.

## [1.0.0] - 2026-10-13

### Added
- Scans built HTML for `<script src>` and `<link rel="stylesheet|modulepreload">` / `<link rel="preload" as="script|style">`, skipping comments, inline script bodies, `data:`/`blob:` URLs and `data-sri-ignore` tags.
- sha256, sha384 (default) and sha512 integrity for local files; `--remote` fetches and hashes CDN files (timeout, per-URL cache).
- `--write` inserts or replaces `integrity` and adds `crossorigin="anonymous"` (or `use-credentials`) to cross-origin resources; idempotent.
- `--check` CI mode: rules `integrity-mismatch` (wrong/stale), `missing-integrity`, `invalid-integrity`, `missing-crossorigin`, `unresolved-resource`, `fetch-failed`, `weak-algorithm`, `remote-unverified`, `dynamic-resource`. Browser-accurate verification (strongest algorithm wins, multiple hashes, base64url).
- Relative, root-absolute and `../` paths, `--base` public paths, `--origin` for same-origin absolute URLs, query strings and fragments, protocol-relative URLs, path-traversal protection, templated URLs reported and skipped.
- JSON manifest (`--manifest`), config file (`.sri-sentinel.json` or package.json) with allowlist (URL/rule/file globs, reason, expiry), ignore globs and per-rule severity.
- Text, JSON, SARIF 2.1.0 and Markdown output; `--fail-on`; exit codes 0/1/2.
- Vite (`sri-sentinel/vite`) and webpack 5 (`sri-sentinel/webpack`) plugins, composite GitHub Action, TypeScript types. Zero runtime dependencies.

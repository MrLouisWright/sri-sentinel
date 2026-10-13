# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

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

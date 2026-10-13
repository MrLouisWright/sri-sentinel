import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, sri, read } from './helpers.js';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'sri-sentinel.js');
const run = (args, cwd) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '' } });

test('--check exits 1 on missing integrity, --write fixes, then exit 0', () => {
  const dir = site({ 'dist/a.js': 'A', 'dist/index.html': '<script src="a.js"></script>' });
  let r = run(['dist', '--check'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /missing-integrity/);
  assert.match(r.stdout, new RegExp(sri('A').replace(/[+/]/g, '\\$&')));
  r = run(['dist', '--write', '--manifest', 'sri.json'], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /1 fixed in 1 file/);
  assert.equal(JSON.parse(read(dir, 'sri.json')).resources['/a.js'].integrity, sri('A'));
  r = run(['dist', '--check'], dir);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no problems/);
});

test('--fail-on, --format, report files, --algorithm and --base', () => {
  const dir = site({ 'a.js': 'A', 'index.html': '<script src="/sub/a.js" integrity="' + sri('A', 'sha256') + '"></script>' });
  assert.equal(run(['--base', '/sub/'], dir).status, 0);
  assert.equal(run(['--base=/sub/', '--fail-on', 'low'], dir).status, 1);
  assert.equal(run(['.'], dir).status, 0, 'unresolved is medium, below default high');
  assert.equal(run(['.', '--fail-on', 'medium'], dir).status, 1);
  const j = run(['--base', '/sub/', '--format', 'json', '--sarif', 'o.sarif', '--markdown', 'o.md', '--json', 'o.json', '-a', 'sha512'], dir);
  assert.equal(JSON.parse(j.stdout).algorithm, 'sha512');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'o.sarif'), 'utf8')).version, '2.1.0');
  assert.ok(fs.existsSync(path.join(dir, 'o.md')) && fs.existsSync(path.join(dir, 'o.json')));
  assert.equal(JSON.parse(run(['--format', 'sarif'], dir).stdout).runs[0].tool.driver.name, 'sri-sentinel');
  assert.match(run(['--format', 'markdown', '--base', '/sub/'], dir).stdout, /weak-algorithm/);
  assert.match(run(['-q', '--base', '/sub/'], dir).stdout, /^1 HTML file\(s\), 1 resource\(s\): 1 low\n$/);
});

test('usage and runtime errors exit 2', () => {
  const dir = site({ 'index.html': '' });
  for (const args of [['--nope'], ['--fail-on', 'x'], ['-a', 'md5'], ['--check', '--write'], ['--format', 'xml'], ['--base'], ['missing-dir']]) {
    const r = run(args, dir);
    assert.equal(r.status, 2, args.join(' ') + r.stderr);
    assert.match(r.stderr, /sri-sentinel:/);
  }
  assert.equal(run([], site({ 'x.txt': '' })).status, 2);
  assert.equal(run(['--help'], dir).status, 0);
  assert.equal(run(['--version'], dir).stdout.trim(), JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
});

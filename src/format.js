import { RULES, SEVERITIES, RANK } from './rules.js';

const C = { critical: '\x1b[35m', high: '\x1b[31m', medium: '\x1b[33m', low: '\x1b[36m', info: '\x1b[90m', dim: '\x1b[2m', bold: '\x1b[1m', green: '\x1b[32m', reset: '\x1b[0m' };
const active = (r) => r.findings.filter((f) => !f.fixed);

export function counts(findings) {
  const c = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const f of findings) c[f.severity]++;
  return c;
}

export function exitCode(result, failOn = 'high') {
  if (failOn === 'none') return 0;
  return active(result).some((f) => RANK[f.severity] >= RANK[failOn]) ? 1 : 0;
}

export function formatText(result, { color = false, fixes = true, summaryOnly = false } = {}) {
  const k = (c, s) => (color ? C[c] + s + C.reset : s);
  const lines = [];
  const byFile = new Map();
  for (const f of result.findings) { if (!byFile.has(f.file)) byFile.set(f.file, []); byFile.get(f.file).push(f); }
  for (const [file, fs] of summaryOnly ? [] : byFile) {
    lines.push(k('bold', file));
    for (const f of fs) {
      lines.push(`  ${k('dim', String(f.line).padStart(4) + ':')} ${k(f.severity, f.severity.padEnd(8))} ${f.message} ${k('dim', '[' + f.rule + ']')}${f.fixed ? ' ' + k('green', '(fixed)') : ''}`);
      if (fixes && f.fix && !f.fixed) lines.push(`        ${k('dim', '↳ ' + f.fix)}`);
    }
    lines.push('');
  }
  const a = active(result);
  const c = counts(a);
  const fixed = result.findings.length - a.length;
  const summary = `${result.files.length} HTML file(s), ${result.resources.length} resource(s): ` + (a.length ? SEVERITIES.filter((s) => c[s]).map((s) => k(s, `${c[s]} ${s}`)).join(', ') : k('green', 'no problems')) +
    (fixed ? `; ${k('green', fixed + ' fixed')} in ${result.written.length} file(s)` : '') + (result.suppressed ? `; ${result.suppressed} allowlisted` : '');
  lines.push(summary);
  return lines.join('\n') + '\n';
}

export function formatJson(result) {
  const a = active(result);
  return JSON.stringify({
    tool: 'sri-sentinel', algorithm: result.config.algorithm, files: result.files, summary: { ...counts(a), total: a.length, fixed: result.findings.length - a.length, suppressed: result.suppressed, resources: result.resources.length },
    findings: result.findings, resources: result.resources, written: result.written,
  }, null, 2) + '\n';
}

const SEC = { critical: '9.5', high: '8.0', medium: '5.5', low: '3.0', info: '0.0' };
const LEVEL = { critical: 'error', high: 'error', medium: 'warning', low: 'note', info: 'note' };

export function formatSarif(result, version = '0.0.0') {
  const rules = Object.entries(RULES).map(([id, r]) => ({ id, name: id, shortDescription: { text: r.title }, defaultConfiguration: { level: LEVEL[r.severity] }, properties: { 'security-severity': SEC[r.severity], tags: ['security', 'sri', 'supply-chain'] } }));
  return JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'sri-sentinel', version, informationUri: 'https://github.com/MrLouisWright/sri-sentinel', rules } },
      results: active(result).map((f) => ({ ruleId: f.rule, level: LEVEL[f.severity], message: { text: `${f.message}. Fix: ${f.fix}` }, locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: f.line } } }], properties: { severity: f.severity, url: f.url } })),
    }],
  }, null, 2) + '\n';
}

const md = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
export function formatMarkdown(result) {
  const a = active(result);
  const c = counts(a);
  const out = ['## sri-sentinel report', ''];
  out.push(`Scanned **${result.files.length}** HTML file(s) and **${result.resources.length}** resource(s) (${result.config.algorithm}).`, '');
  if (!a.length) out.push('✅ No SRI problems found.');
  else {
    out.push(SEVERITIES.filter((s) => c[s]).map((s) => `**${c[s]}** ${s}`).join(' · '), '', '| Severity | File | Line | Rule | Resource | Fix |', '|---|---|---|---|---|---|');
    for (const f of a) out.push(`| ${f.severity} | \`${md(f.file)}\` | ${f.line} | \`${f.rule}\` | \`${md(f.url)}\` | ${md(f.fix)} |`);
  }
  return out.join('\n') + '\n';
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Algorithm = 'sha256' | 'sha384' | 'sha512';
export type RuleId = 'integrity-mismatch' | 'missing-integrity' | 'invalid-integrity' | 'missing-crossorigin' | 'unresolved-resource' | 'fetch-failed' | 'weak-algorithm' | 'remote-unverified' | 'dynamic-resource';
export interface AllowEntry { url?: string; rule?: RuleId | '*'; file?: string; reason?: string; expires?: string }
export interface Config {
  algorithm?: Algorithm; failOn?: Severity | 'none'; base?: string; origin?: string; remote?: boolean;
  crossorigin?: 'anonymous' | 'use-credentials'; timeout?: number; allow?: (AllowEntry | string)[]; allowlist?: (AllowEntry | string)[];
  ignore?: string[]; rules?: Partial<Record<RuleId, Severity | 'off'>>;
}
export interface Finding { rule: RuleId; severity: Severity; file: string; line: number; url: string; message: string; fix: string; expected?: string | null; actual?: string; fixable?: boolean; fixed?: boolean }
export interface Resource { file: string; line: number; tag: 'script' | 'link'; ref: string; url: string; kind: 'local' | 'remote'; crossOrigin: boolean; integrity: string | null; expected?: string }
export interface Manifest { algorithm: Algorithm; resources: Record<string, { integrity: string; file?: string; crossOrigin: boolean }> }
export interface ScanResult { files: string[]; resources: Resource[]; findings: Finding[]; manifest: Manifest; written: string[]; suppressed: number; config: Required<Config> }
export interface ScanOptions { paths?: string[]; cwd?: string; configPath?: string; config?: Config; write?: boolean; remote?: boolean; fetchImpl?: typeof fetch }
export function scan(options?: ScanOptions): Promise<ScanResult>;
export function computeIntegrity(content: string | Uint8Array, algorithm?: Algorithm): string;
export function verifyIntegrity(content: string | Uint8Array, integrity: string): { valid: boolean; ok: boolean; algorithm?: Algorithm; invalid: string[] };
export function parseIntegrity(integrity: string): { tokens: { alg: Algorithm; digest: string }[]; invalid: string[] };
export function loadConfig(dir?: string, explicit?: string): Required<Config>;
export function formatText(result: ScanResult, options?: { color?: boolean; fixes?: boolean; summaryOnly?: boolean }): string;
export function formatJson(result: ScanResult): string;
export function formatSarif(result: ScanResult, version?: string): string;
export function formatMarkdown(result: ScanResult): string;
export function exitCode(result: ScanResult, failOn?: Severity | 'none'): 0 | 1;
export const ALGORITHMS: Algorithm[];
export const SEVERITIES: Severity[];
export const RULES: Record<RuleId, { severity: Severity; title: string }>;

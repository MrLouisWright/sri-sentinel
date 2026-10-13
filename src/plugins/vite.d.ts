import type { Config, Severity } from '../index.js';
export interface SriVitePluginOptions extends Config { failOn?: Severity | 'none'; manifest?: string; silent?: boolean }
export default function sriSentinel(options?: SriVitePluginOptions): { name: string; apply: 'build'; enforce: 'post'; [k: string]: unknown };
export { sriSentinel };

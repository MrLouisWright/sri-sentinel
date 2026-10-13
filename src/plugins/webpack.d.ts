import type { Config, Severity } from '../index.js';
export interface SriWebpackPluginOptions extends Config { failOn?: Severity | 'none'; manifest?: string }
export class SriSentinelPlugin { constructor(options?: SriWebpackPluginOptions); apply(compiler: any): void }
export default SriSentinelPlugin;

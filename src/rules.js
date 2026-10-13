export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
export const RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1, none: 99 };

export const RULES = {
  'integrity-mismatch': { severity: 'critical', title: 'Integrity value does not match the resource (wrong or stale hash)' },
  'missing-integrity': { severity: 'high', title: 'Resource has no integrity attribute' },
  'invalid-integrity': { severity: 'high', title: 'Integrity attribute is malformed or uses an unsupported algorithm' },
  'missing-crossorigin': { severity: 'high', title: 'Cross-origin resource with integrity but no crossorigin attribute (the browser will block it)' },
  'unresolved-resource': { severity: 'medium', title: 'Local resource could not be found, so its integrity cannot be checked' },
  'fetch-failed': { severity: 'medium', title: 'Remote resource could not be fetched' },
  'weak-algorithm': { severity: 'low', title: 'Integrity uses a weaker algorithm than configured' },
  'remote-unverified': { severity: 'info', title: 'Remote integrity not verified (run with --remote)' },
  'dynamic-resource': { severity: 'info', title: 'Dynamic or templated URL skipped' },
};

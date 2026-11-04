/**
 * NEW-204 (P10b): CI runs `npm run lint` (next lint) before the tests, so a lint error fails the
 * build. Errors fail, warnings do not (same rule as the backend and the app).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');

describe('NEW-204: lint runs in CI', () => {
  it('package.json lint is next lint', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.lint).toBe('next lint');
  });

  it('the CI workflow runs npm run lint before npm test', () => {
    const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    const lintAt = ci.indexOf('run: npm run lint');
    expect(lintAt).toBeGreaterThan(-1);
    expect(lintAt).toBeLessThan(ci.indexOf('run: npm test'));
  });
});

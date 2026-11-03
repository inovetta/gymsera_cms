/**
 * NEW-197 (P10 item 7): the test runner (vitest 4 and its ES-module dependencies) does not load
 * on Node 20.17 (ERR_REQUIRE_ESM); it needs a Node that can require() ES modules: 20.19+ or 22.
 * CI's `node-version: 20` takes the latest 20.x, so CI passed while a local 20.17 failed with
 * no hint. package.json now says so, and npm warns on an older Node.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (file: string) => JSON.parse(readFileSync(join(root, file), 'utf8'));

describe('NEW-197: the supported Node version is written down', () => {
  it('package.json engines.node is >=20.19.0', () => {
    expect(read('package.json').engines?.node).toBe('>=20.19.0');
  });

  it('package-lock.json carries the same engines (npm install was run)', () => {
    expect(read('package-lock.json').packages[''].engines?.node).toBe('>=20.19.0');
  });
});

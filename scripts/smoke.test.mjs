import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

const requiredPaths = [
  'apps/web',
  'apps/server',
  'packages/shared',
  'packages/protocol',
  'packages/rules',
  'packages/db',
  'docs/decisions/0001-initial-stack.md',
  '.env.example',
  'pnpm-workspace.yaml',
];

for (const relativePath of requiredPaths) {
  test(`exists: ${relativePath}`, () => {
    assert.equal(existsSync(join(root, relativePath)), true);
  });
}

test('root package manager is pnpm', () => {
  const packageJson = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );

  assert.match(packageJson.packageManager, /^pnpm@/);
});

test('root node engine targets Node 20 or newer', () => {
  const packageJson = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );

  assert.equal(packageJson.engines?.node, '>=20');
});

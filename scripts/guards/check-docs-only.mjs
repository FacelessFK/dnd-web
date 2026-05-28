import { execFileSync } from 'node:child_process';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const allChanged = args.has('--all-changed');

const unknownArgs = [...args].filter((arg) => arg !== '--all-changed');

if (unknownArgs.length > 0) {
  console.error(
    `Unknown option(s): ${unknownArgs.join(', ')}\nUsage: node scripts/guards/check-docs-only.mjs [--all-changed]`,
  );
  process.exit(1);
}

const gitArgs = allChanged
  ? ['diff', '--name-only', 'HEAD']
  : ['diff', '--cached', '--name-only'];

function getChangedPaths() {
  const output = execFileSync('git', gitArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return output
    .split(/\r?\n/u)
    .map((path) => path.trim())
    .filter(Boolean);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/gu, '/');
}

function isRootMarkdown(normalizedPath) {
  return !normalizedPath.includes('/') && normalizedPath.endsWith('.md');
}

function isDocsOnlyPath(filePath) {
  const normalized = normalizePath(filePath);

  return (
    normalized.startsWith('docs/') ||
    normalized.startsWith('.agents/') ||
    normalized === 'AGENTS.md' ||
    normalized === 'CODEX_CONTEXT.md' ||
    isRootMarkdown(normalized)
  );
}

const changedPaths = getChangedPaths();
const blockedPaths = changedPaths.filter((path) => !isDocsOnlyPath(path));

if (blockedPaths.length > 0) {
  const mode = allChanged ? 'changed' : 'staged';
  console.error(`Docs-only guard blocked non-docs ${mode} path(s):`);

  for (const blockedPath of blockedPaths) {
    console.error(`- ${blockedPath}`);
  }

  console.error(
    'This task was expected to be docs-only. Move source, runtime, test, package, script, or config changes to a separately approved task.',
  );
  process.exit(1);
}

const mode = allChanged ? 'changed' : 'staged';
console.log(`Docs-only guard passed: all ${mode} paths are docs-only.`);

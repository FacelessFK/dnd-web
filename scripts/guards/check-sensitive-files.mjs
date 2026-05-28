import { execFileSync } from 'node:child_process';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const allChanged = args.has('--all-changed');

const unknownArgs = [...args].filter((arg) => arg !== '--all-changed');

if (unknownArgs.length > 0) {
  console.error(
    `Unknown option(s): ${unknownArgs.join(', ')}\nUsage: node scripts/guards/check-sensitive-files.mjs [--all-changed]`,
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

function isAllowedTemplate(filePath) {
  const normalized = normalizePath(filePath).toLowerCase();
  const fileName = normalized.split('/').at(-1) ?? normalized;

  return (
    fileName === '.env.example' ||
    fileName === '.env.sample' ||
    normalized.endsWith('.template')
  );
}

function isSensitivePath(filePath) {
  const normalized = normalizePath(filePath).toLowerCase();
  const pathParts = normalized.split('/');
  const fileName = pathParts.at(-1) ?? normalized;

  if (isAllowedTemplate(normalized)) {
    return false;
  }

  return (
    fileName === '.env' ||
    (fileName.startsWith('.env.') && fileName !== '.env.example') ||
    fileName.endsWith('.pem') ||
    fileName.endsWith('.key') ||
    fileName.endsWith('.p12') ||
    fileName.endsWith('.pfx') ||
    fileName === 'secrets.json' ||
    fileName === 'creds.md' ||
    fileName === 'credentials.json' ||
    pathParts.includes('secrets')
  );
}

const changedPaths = getChangedPaths();
const blockedPaths = changedPaths.filter(isSensitivePath);

if (blockedPaths.length > 0) {
  const mode = allChanged ? 'changed' : 'staged';
  console.error(`Sensitive ${mode} file path(s) blocked:`);

  for (const blockedPath of blockedPaths) {
    console.error(`- ${blockedPath}`);
  }

  console.error(
    'Remove these files from the change or replace them with safe examples/templates.',
  );
  process.exit(1);
}

const mode = allChanged ? 'changed' : 'staged';
console.log(`Sensitive-file guard passed: no blocked ${mode} paths found.`);

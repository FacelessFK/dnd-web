#!/usr/bin/env node
/**
 * Applies packages/db/migrations/ in numeric order.
 *
 * The repository has always applied migrations by hand or through the compose
 * `migrate` service, which is fine on a workstation and impossible in CI. This
 * is the same thing without a container: read the directory, sort it, run each
 * file inside its own transaction.
 *
 * Each migration is transactional on its own rather than the whole set being
 * one transaction. A half-applied *file* is the failure worth preventing; a
 * partially applied *sequence* is recoverable by rerunning, because every
 * statement in this repository is `IF NOT EXISTS` style and re-running is
 * therefore a no-op.
 *
 * Nothing here prints the connection string. Errors go through the same
 * redaction the readiness check uses.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Pool } = pg;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');
const migrationsDir = resolve(packageRoot, 'migrations');

loadRepoEnvironment();

main().catch((error) => {
  console.error(`[db-migrate] Migration failed: ${formatDbError(error)}`);
  process.exit(1);
});

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      '[db-migrate] DATABASE_URL is not configured. Set it before applying migrations.',
    );
    process.exit(1);
  }

  const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  if (migrations.length === 0) {
    console.error('[db-migrate] No migrations found.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const client = await pool.connect();

    try {
      for (const migration of migrations) {
        const sql = readFileSync(resolve(migrationsDir, migration), 'utf8');

        await client.query('begin');

        try {
          await client.query(sql);
          await client.query('commit');
        } catch (error) {
          await client.query('rollback').catch(() => undefined);
          throw new Error(
            `${migration}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        console.log(`[db-migrate] applied ${migration}`);
      }

      console.log(`[db-migrate] ${migrations.length} migration(s) applied.`);
    } finally {
      client.release();
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function loadRepoEnvironment() {
  const candidates = [
    resolve(repoRoot, '.env'),
    resolve(packageRoot, '.env'),
    resolve(repoRoot, 'apps/server/.env'),
    resolve(repoRoot, 'apps/web/.env'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    for (const line of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);

      if (!match) {
        continue;
      }

      const [, key, rawValue] = match;

      if (!key || process.env[key] !== undefined) {
        continue;
      }

      process.env[key] = parseEnvValue(rawValue ?? '');
    }

    return;
  }
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  const withoutComment =
    trimmed.startsWith('"') || trimmed.startsWith("'")
      ? trimmed
      : trimmed.replace(/\s+#.*$/, '');

  if (
    (withoutComment.startsWith('"') && withoutComment.endsWith('"')) ||
    (withoutComment.startsWith("'") && withoutComment.endsWith("'"))
  ) {
    return withoutComment.slice(1, -1);
  }

  return withoutComment;
}

function formatDbError(error) {
  const parts = [];

  if (error && typeof error === 'object' && 'code' in error && error.code) {
    parts.push(`code=${error.code}`);
  }

  parts.push(error instanceof Error ? error.message : String(error));

  return redactSecrets(parts.join(' '));
}

function redactSecrets(value) {
  const sensitiveValues = [process.env.DATABASE_URL].filter(Boolean);

  return sensitiveValues.reduce(
    (redacted, secret) => redacted.split(secret).join('[redacted]'),
    String(value),
  );
}

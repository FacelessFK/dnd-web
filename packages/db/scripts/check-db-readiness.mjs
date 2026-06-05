#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Pool } = pg;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');

const requiredTables = [
  'auth_users',
  'auth_sessions',
  'character_records',
  'character_library_entries',
  'completed_command_idempotency_records',
  'command_idempotency_claim_records',
  'session_snapshots',
  'scene_records',
  'active_encounter_records',
  'command_event_outbox_records',
];

loadRepoEnvironment();

main().catch((error) => {
  console.error(
    `[db-readiness] Database readiness failed: ${formatDbError(error)}`,
  );
  process.exit(1);
});

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      '[db-readiness] DATABASE_URL is not configured. Set DATABASE_URL and apply packages/db/migrations/ before running DB-mode validation.',
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const client = await pool.connect();

    try {
      await client.query('select 1');

      const encodingResult = await client.query(`
        select
          current_database() as database_name,
          current_setting('server_encoding') as server_encoding,
          current_setting('client_encoding') as client_encoding
      `);
      const encoding = encodingResult.rows[0] ?? {};
      const databaseName = String(encoding.database_name ?? 'unknown');
      const serverEncoding = String(encoding.server_encoding ?? 'unknown');
      const clientEncoding = String(encoding.client_encoding ?? 'unknown');

      if (
        serverEncoding.toUpperCase() !== 'UTF8' ||
        clientEncoding.toUpperCase() !== 'UTF8'
      ) {
        console.error(
          `[db-readiness] Database "${databaseName}" must use UTF8 for Persian/Unicode Character Library data; got server_encoding=${serverEncoding}, client_encoding=${clientEncoding}. Reprovision the local DB with UTF-8 before DB-mode validation.`,
        );
        process.exitCode = 1;
        return;
      }

      const unicodeProbe = 'Persian readiness probe: فرهاد شخصیت';
      const unicodeResult = await client.query(
        'select $1::text as unicode_probe',
        [unicodeProbe],
      );
      const roundTripped = String(unicodeResult.rows[0]?.unicode_probe ?? '');

      if (roundTripped !== unicodeProbe) {
        console.error(
          '[db-readiness] Unicode round-trip probe failed. Reprovision the local DB with UTF-8 before DB-mode Character Library validation.',
        );
        process.exitCode = 1;
        return;
      }

      const result = await client.query(
        `
          select table_name
          from information_schema.tables
          where table_schema = 'public'
            and table_name = any($1::text[])
        `,
        [requiredTables],
      );
      const presentTables = new Set(
        result.rows.map((row) => String(row.table_name)),
      );
      const missingTables = requiredTables.filter(
        (tableName) => !presentTables.has(tableName),
      );

      if (missingTables.length > 0) {
        console.error(
          `[db-readiness] Missing required tables: ${missingTables.join(
            ', ',
          )}. Apply packages/db/migrations/ before DB-mode validation.`,
        );
        process.exitCode = 1;
        return;
      }

      console.log(
        `[db-readiness] Database connection OK; UTF8 encoding verified for "${databaseName}"; required tables present (${requiredTables.length}).`,
      );
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

  if (error instanceof Error) {
    parts.push(error.message);
  } else {
    parts.push(String(error));
  }

  return redactSecrets(parts.join(' '));
}

function redactSecrets(value) {
  const sensitiveValues = [process.env.DATABASE_URL].filter(Boolean);
  const redacted = sensitiveValues.reduce(
    (current, secret) => current.split(secret).join('[redacted]'),
    String(value),
  );

  return redacted.replace(
    /(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+@/gi,
    '$1[redacted]@',
  );
}

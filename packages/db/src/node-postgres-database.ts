// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./pg.d.ts" />

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { dbSchema } from './schema.js';
import type { DndDatabase } from './character-record-database.js';

export type NodePostgresDndDatabaseConnection = {
  close: () => Promise<void>;
  db: DndDatabase;
};

export function createNodePostgresDndDatabaseConnection(
  databaseUrl: string,
): NodePostgresDndDatabaseConnection {
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  return {
    db: drizzle(pool, {
      schema: dbSchema,
    }),
    close: async () => {
      await pool.end();
    },
  };
}

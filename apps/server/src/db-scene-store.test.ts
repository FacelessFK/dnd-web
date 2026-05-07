import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  SceneRecordDatabase,
  SceneRecordRow,
  SceneRecordWrite,
} from '@dnd/db';

import { DbBackedSceneStore } from './db-scene-store.js';
import { SceneStoreError } from './scene-store.js';

class InMemorySceneRecordDatabase implements SceneRecordDatabase {
  private readonly rows = new Map<string, SceneRecordRow>();
  private clock = 0;

  async getSceneRecord(sceneId: string): Promise<SceneRecordRow | null> {
    const row = this.rows.get(sceneId);

    return row ? this.clone(row) : null;
  }

  async listSceneRecords(): Promise<SceneRecordRow[]> {
    return [...this.rows.values()].map((row) => this.clone(row));
  }

  async updateSceneRecord(
    write: SceneRecordWrite,
  ): Promise<SceneRecordRow | null> {
    const existing = this.rows.get(write.sceneId);

    if (!existing) {
      return null;
    }

    const row: SceneRecordRow = {
      sceneId: write.sceneId,
      sessionId: write.sessionId,
      record: this.clone(write.record),
      createdAt: existing.createdAt,
      updatedAt: this.nextTimestamp(),
    };

    this.rows.set(write.sceneId, this.clone(row));

    return this.clone(row);
  }

  async upsertSceneRecord(write: SceneRecordWrite): Promise<SceneRecordRow> {
    const existing = this.rows.get(write.sceneId);
    const now = this.nextTimestamp();
    const row: SceneRecordRow = {
      sceneId: write.sceneId,
      sessionId: write.sessionId,
      record: this.clone(write.record),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.rows.set(write.sceneId, this.clone(row));

    return this.clone(row);
  }

  private nextTimestamp(): Date {
    const timestamp = new Date(Date.UTC(2026, 3, 23, 0, 30, this.clock, 0));

    this.clock += 1;

    return timestamp;
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

test('db-backed scene store persists scenes across rehydration with clone-safe semantics', async () => {
  const database = new InMemorySceneRecordDatabase();
  const store = await DbBackedSceneStore.fromDatabase(database);

  const createdScene = await store.createScene({
    id: 'scene_11111111-1111-4111-8111-111111111111',
    sessionId: 'ABC123',
    name: 'Durable Chamber',
    grid: {
      cellSizeFeet: 5,
      width: 6,
      height: 6,
    },
    entities: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  createdScene.entities.push({
    id: 'scene_entity_11111111-1111-4111-8111-111111111111',
    type: 'object',
    name: 'Local Mutation',
    position: {
      x: 0,
      y: 0,
    },
    footprint: {
      width: 1,
      height: 1,
    },
    blocksMovement: true,
    blocksVision: false,
    combatant: null,
    hidden: false,
    meta: {},
  });

  const rehydratedStore = await DbBackedSceneStore.fromDatabase(database);
  const rereadScene = rehydratedStore.getScene(
    'scene_11111111-1111-4111-8111-111111111111',
  );

  assert.equal(rereadScene.entities.length, 0);

  const updatedScene = await rehydratedStore.saveScene({
    ...rereadScene,
    entities: [
      {
        id: 'scene_entity_22222222-2222-4222-8222-222222222222',
        type: 'object',
        name: 'Stone Pillar',
        position: {
          x: 2,
          y: 2,
        },
        footprint: {
          width: 1,
          height: 1,
        },
        blocksMovement: true,
        blocksVision: true,
        combatant: null,
        hidden: false,
        meta: {},
      },
    ],
    updatedAt: '2026-01-01T00:05:00.000Z',
  });

  updatedScene.entities[0]?.meta &&
    (updatedScene.entities[0].meta['mutated'] = true);

  const finalStore = await DbBackedSceneStore.fromDatabase(database);
  const finalScene = finalStore.getScene(
    'scene_11111111-1111-4111-8111-111111111111',
  );

  assert.equal(finalScene.entities.length, 1);
  assert.equal(finalScene.entities[0]?.name, 'Stone Pillar');
  assert.equal(finalScene.entities[0]?.meta['mutated'], undefined);
});

test('db-backed scene store fails safely for missing scenes', async () => {
  const store = await DbBackedSceneStore.fromDatabase(
    new InMemorySceneRecordDatabase(),
  );

  assert.throws(
    () => {
      store.getScene('scene_99999999-9999-4999-8999-999999999999');
    },
    (error: unknown) =>
      error instanceof SceneStoreError && error.code === 'scene_not_found',
  );

  await assert.rejects(
    () =>
      store.saveScene({
        id: 'scene_99999999-9999-4999-8999-999999999999',
        sessionId: 'ABC123',
        name: 'Missing Scene',
        grid: {
          cellSizeFeet: 5,
          width: 4,
          height: 4,
        },
        entities: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    (error: unknown) =>
      error instanceof SceneStoreError && error.code === 'scene_not_found',
  );
});

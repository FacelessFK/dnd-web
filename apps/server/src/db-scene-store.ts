import type { SceneRecordDatabase, StoredSceneRecordDocument } from '@dnd/db';
import type { Scene, SceneId } from '@dnd/shared';

import { SceneStoreError, type SceneRepository } from './scene-store.js';

export class DbBackedSceneStore implements SceneRepository {
  private readonly scenes: Map<SceneId, Scene>;

  private constructor(
    private readonly database: SceneRecordDatabase,
    scenes: Map<SceneId, Scene>,
  ) {
    this.scenes = scenes;
  }

  static async fromDatabase(
    database: SceneRecordDatabase,
  ): Promise<DbBackedSceneStore> {
    const rows = await database.listSceneRecords();
    const scenes = new Map<SceneId, Scene>();

    for (const row of rows) {
      scenes.set(row.sceneId, structuredClone(row.record));
    }

    return new DbBackedSceneStore(database, scenes);
  }

  async createScene(scene: Scene): Promise<Scene> {
    const row = await this.database.upsertSceneRecord({
      record: this.toDocument(scene),
      sceneId: scene.id,
      sessionId: scene.sessionId,
    });
    const storedScene = this.fromDocument(row.record);

    this.scenes.set(storedScene.id, this.clone(storedScene));

    return storedScene;
  }

  getScene(sceneId: SceneId): Scene {
    const scene = this.scenes.get(sceneId);

    if (!scene) {
      throw new SceneStoreError(
        'scene_not_found',
        `Scene "${sceneId}" does not exist.`,
      );
    }

    return this.clone(scene);
  }

  async saveScene(scene: Scene): Promise<Scene> {
    const row = await this.database.updateSceneRecord({
      record: this.toDocument(scene),
      sceneId: scene.id,
      sessionId: scene.sessionId,
    });

    if (!row) {
      throw new SceneStoreError(
        'scene_not_found',
        `Scene "${scene.id}" does not exist.`,
      );
    }

    const storedScene = this.fromDocument(row.record);

    this.scenes.set(storedScene.id, this.clone(storedScene));

    return storedScene;
  }

  private toDocument(scene: Scene): StoredSceneRecordDocument {
    return this.clone(scene);
  }

  private fromDocument(document: StoredSceneRecordDocument): Scene {
    return this.clone(document);
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

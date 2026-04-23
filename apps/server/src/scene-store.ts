import type { SessionErrorCode } from '@dnd/protocol';
import type { Scene, SceneId } from '@dnd/shared';

export type SceneRepositoryResult<T> = T | Promise<T>;

export interface SceneRepository {
  createScene(scene: Scene): SceneRepositoryResult<Scene>;
  getScene(sceneId: SceneId): Scene;
  saveScene(scene: Scene): SceneRepositoryResult<Scene>;
}

export class SceneStoreError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SceneStoreError';
  }
}

export class InMemorySceneStore implements SceneRepository {
  private readonly scenes = new Map<SceneId, Scene>();

  createScene(scene: Scene): Scene {
    this.scenes.set(scene.id, this.clone(scene));

    return this.clone(scene);
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

  saveScene(scene: Scene): Scene {
    if (!this.scenes.has(scene.id)) {
      throw new SceneStoreError(
        'scene_not_found',
        `Scene "${scene.id}" does not exist.`,
      );
    }

    this.scenes.set(scene.id, this.clone(scene));

    return this.clone(scene);
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

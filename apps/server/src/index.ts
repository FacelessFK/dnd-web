// Load repo-root .env values before reading process.env configuration.
import 'dotenv/config';

import { createBootstrappedSessionServer } from './server-bootstrap.js';

const port = Number(process.env.SERVER_PORT ?? 2567);
const host = '127.0.0.1';

const bootstrap = await createBootstrappedSessionServer();
const { closePersistence, persistenceMode, server } = bootstrap;

server.on('close', () => {
  void closePersistence().catch((error) => {
    console.error('[server] failed to close persistence resources', error);
  });
});

server.listen(port, host, () => {
  console.log(
    `[server] Phase 12 scene transaction plus session/character/movement/encounter/combat outbox foundation listening on http://${host}:${port}`,
  );

  if (persistenceMode === 'db') {
    console.log(
      '[server] Opt-in DB-backed startup is enabled via SERVER_PERSISTENCE_MODE=db; the runtime now injects the existing DB-backed character, session snapshot, scene, and active-encounter stores plus the current narrow transaction boundaries, covered DB-backed scene-only durable mutations, and covered session, movement, DM character update, encounter, and combat live-command post-commit outbox dispatch, but cold-boot unpublished rows are not auto-redelivered because SSE subscribers are process-local, without replay, multi-process coordination, or full combat continuity guarantees.',
    );
    return;
  }

  console.log(
    '[server] Default startup is still in-memory; injected DB-backed character, session snapshot, scene, and active-encounter stores now support transactional durable idempotency for covered session mutations, covered scene mutations, supported character mutations, covered movement mutations, encounter-only commands, attack, and movement-spending encounter-aware movement on the DB-backed path, plus covered session, movement, DM character update, encounter, and combat live-command post-commit outbox dispatch when DB mode is enabled, but cold-boot unpublished rows are not auto-redelivered because SSE subscribers are process-local, without replay, multi-process coordination, or full combat continuity guarantees.',
  );
});

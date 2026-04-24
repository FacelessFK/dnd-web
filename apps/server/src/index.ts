// Load repo-root .env values before reading process.env configuration.
import 'dotenv/config';

import { createSessionServer } from './session-server.js';

const port = Number(process.env.SERVER_PORT ?? 2567);
const host = '127.0.0.1';

const { server } = createSessionServer();

server.listen(port, host, () => {
  console.log(
    `[server] Phase 11 encounter-aware movement transactional baseline listening on http://${host}:${port}`,
  );
  console.log(
    '[server] Default startup is still in-memory; injected DB-backed character, session snapshot, scene, and active-encounter stores now support transactional durable idempotency for supported character mutations, encounter-only commands, attack, and movement-spending encounter-aware movement on the DB-backed path, without replay, outbox, or full combat continuity guarantees.',
  );
});

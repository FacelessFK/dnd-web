// Load repo-root .env values before reading process.env configuration.
import 'dotenv/config';

import { createSessionServer } from './session-server.js';

const port = Number(process.env.SERVER_PORT ?? 2567);
const host = '127.0.0.1';

const { server } = createSessionServer();

server.listen(port, host, () => {
  console.log(
    `[server] Phase 10 durable session snapshot baseline listening on http://${host}:${port}`,
  );
  console.log(
    '[server] Default startup is still in-memory; injected DB-backed session snapshots, character persistence, and transactional durable idempotency for supported character mutations enable narrow restart recovery without full tactical continuity.',
  );
});

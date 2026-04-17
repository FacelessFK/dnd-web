// Load repo-root .env values before reading process.env configuration.
import 'dotenv/config';
import { createServer } from 'node:http';

const port = Number(process.env.SERVER_PORT ?? 2567);
const host = '127.0.0.1';

const server = createServer((_, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      name: 'dnd-dm-platform-server',
      phase: 'phase-0',
      status: 'ready-for-colyseus-bootstrap',
    }),
  );
});

server.listen(port, host, () => {
  console.log(`[server] Phase 0 baseline listening on http://${host}:${port}`);
  console.log(
    '[server] Colyseus integration is intentionally deferred to Phase 1.',
  );
});

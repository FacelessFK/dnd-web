// Load repo-root .env values before reading process.env configuration.
import 'dotenv/config';

import { createSessionServer } from './session-server.js';

const port = Number(process.env.SERVER_PORT ?? 2567);
const host = '127.0.0.1';

const { server } = createSessionServer();

server.listen(port, host, () => {
  console.log(
    `[server] Phase 5 runtime slice listening on http://${host}:${port}`,
  );
  console.log(
    '[server] Authoritative sessions, encounter turns, turn-usage mutations, and movement foundations are enabled.',
  );
});

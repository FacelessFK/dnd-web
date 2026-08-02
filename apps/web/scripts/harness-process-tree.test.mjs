// The teardown that M3 wave one proved was missing.
//
// These spawn real processes, because the defect was a real one: a wrapper
// exiting while its grandchild kept a port. A mocked `spawn` would have agreed
// the old teardown worked - it called `kill` on everything it was given - so
// every assertion here is made against the kernel's view of a process group
// rather than against a handle's exit code.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  countOwnedProcesses,
  delay,
  getOwnGroupId,
  isGroupAlive,
  isPortOpen,
  isSignalableGroupId,
  ownDirectoryAfter,
  resetOwnedProcessRegistryForTests,
  spawnOwnedProcess,
  stopOwnedProcess,
  teardownOwnedProcesses,
  waitForPortClosed,
} from './harness-process-tree.mjs';

const posix = process.platform !== 'win32';

/**
 * A wrapper that exits the moment its child is running, leaving a grandchild
 * holding a port.
 *
 * This is `corepack -> pnpm -> node --watch -> server` reduced to the part that
 * broke: the handle the harness recorded is not the process that matters.
 */
function grandchildScript(port) {
  return `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(
      `require('node:net').createServer().listen(${port}, '127.0.0.1'); setInterval(() => {}, 1000);`,
    )}], { stdio: 'ignore' });
    // The wrapper's whole job is to leave. Its exit used to end the teardown.
    setTimeout(() => process.exit(0), 150);
  `;
}

/** A child that installs a SIGTERM handler and refuses to die politely. */
const stubbornScript = `
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
  console.log('ready');
`;

async function waitForPortOpen(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isPortOpen(port)) {
      return true;
    }

    await delay(50);
  }

  return false;
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();

    server.unref();
    server.on('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();

      server.close(() => resolvePort(port));
    });
  });
}

test.beforeEach(() => {
  resetOwnedProcessRegistryForTests();
});

test('a group ID that would signal our own session is refused', () => {
  // The single check between a teardown and the developer's terminal. Group 0
  // is "my own group" and would reach the harness and the shell that ran it.
  assert.equal(isSignalableGroupId(0), false);
  assert.equal(isSignalableGroupId(1), false);
  assert.equal(isSignalableGroupId(-5), false);
  assert.equal(isSignalableGroupId(Number.NaN), false);
  assert.equal(isSignalableGroupId(1.5), false);

  // Our own PID can never be an owned group - a detached child leads a group
  // named after its own PID, and this process did not spawn itself.
  assert.equal(isSignalableGroupId(process.pid), false);

  if (posix) {
    const ownGroup = getOwnGroupId();

    // Node has no `process.getpgrp`, so this guard shipped inert once: it
    // compared every candidate against a sentinel and approved all of them.
    // Asserting the lookup resolves is what keeps that from happening again.
    assert.equal(typeof ownGroup, 'number', 'own process group is unknown');
    assert.equal(isSignalableGroupId(ownGroup), false);
    // Any other real group is fair game once it has been recorded as owned.
    assert.equal(isSignalableGroupId(ownGroup + 1_000_000), true);
  }
});

test('killing a wrapper leaves its grandchild alive, which is the defect', async (t) => {
  if (!posix) {
    t.skip('process groups are POSIX-only');

    return;
  }

  const port = await freePort();
  const child = spawn(process.execPath, ['-e', grandchildScript(port)], {
    stdio: 'ignore',
  });

  assert.equal(await waitForPortOpen(port), true, 'grandchild never listened');

  // Exactly what the old teardown did: signal the recorded handle, observe it
  // exit, call it done.
  child.kill('SIGTERM');
  await once(child, 'exit');
  await delay(300);

  assert.equal(
    await isPortOpen(port),
    true,
    'the grandchild should still be holding the port - if it is not, this test no longer reproduces the bug it guards',
  );

  // Clean up the process this test deliberately leaked, by port owner rather
  // than by pattern.
  const orphan = spawn(
    process.execPath,
    [
      '-e',
      `const { execSync } = require('node:child_process');
       try { execSync("fuser -k -TERM ${port}/tcp", { stdio: 'ignore' }); } catch {}`,
    ],
    { stdio: 'ignore' },
  );

  await once(orphan, 'exit');
  await waitForPortClosed(port, { timeoutMs: 5000 });
});

test('owning the group stops the wrapper and the grandchild together', async (t) => {
  if (!posix) {
    t.skip('process groups are POSIX-only');

    return;
  }

  const port = await freePort();
  const record = spawnOwnedProcess(
    'wrapper',
    process.execPath,
    ['-e', grandchildScript(port)],
    { ownedPort: port, stdio: 'ignore' },
  );

  assert.equal(await waitForPortOpen(port), true, 'grandchild never listened');

  const groupId = record.groupId;

  assert.equal(isGroupAlive(groupId), true);

  const result = await stopOwnedProcess(record);

  assert.equal(result.stopped, true);
  // Graceful: the tree took SIGTERM and went, no escalation needed.
  assert.equal(result.escalated, false);
  assert.equal(isGroupAlive(groupId), false);
  assert.equal(
    await waitForPortClosed(port, { timeoutMs: 5000 }),
    true,
    'the port outlived the tree',
  );
});

test('an owned child that ignores SIGTERM is escalated', async (t) => {
  if (!posix) {
    t.skip('process groups are POSIX-only');

    return;
  }

  const record = spawnOwnedProcess('stubborn', process.execPath, [
    '-e',
    stubbornScript,
  ]);

  await once(record.child.stdout, 'data');

  const groupId = record.groupId;
  const result = await stopOwnedProcess(record, { graceMs: 400, killMs: 4000 });

  assert.equal(result.escalated, true, 'SIGKILL was never reached');
  assert.equal(result.stopped, true);
  assert.equal(isGroupAlive(groupId), false);
});

test('escalation reaches only the recorded group', async (t) => {
  if (!posix) {
    t.skip('process groups are POSIX-only');

    return;
  }

  // A process this harness did not start. A pattern-matching teardown would
  // find it - it is another `node -e` - and a group-scoped one cannot.
  const bystander = spawn(process.execPath, ['-e', stubbornScript], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  await once(bystander.stdout, 'data');

  const record = spawnOwnedProcess('stubborn', process.execPath, [
    '-e',
    stubbornScript,
  ]);

  await once(record.child.stdout, 'data');
  await stopOwnedProcess(record, { graceMs: 300, killMs: 4000 });

  assert.equal(
    record.child.exitCode !== null || record.child.signalCode !== null,
    true,
  );
  assert.equal(
    bystander.exitCode === null && bystander.signalCode === null,
    true,
    'an unrelated process was signalled',
  );

  bystander.kill('SIGKILL');
  await once(bystander, 'exit');
});

test('teardown is idempotent and safe to repeat', async (t) => {
  if (!posix) {
    t.skip('process groups are POSIX-only');

    return;
  }

  const port = await freePort();

  spawnOwnedProcess(
    'wrapper',
    process.execPath,
    ['-e', grandchildScript(port)],
    {
      ownedPort: port,
      stdio: 'ignore',
    },
  );

  assert.equal(await waitForPortOpen(port), true);
  assert.equal(countOwnedProcesses(), 1);

  const first = await teardownOwnedProcesses();

  assert.equal(first.length, 1);
  assert.equal(first[0]?.stopped, true);
  assert.equal(countOwnedProcesses(), 0);

  // A second Ctrl-C, or a `finally` running after the error path already tore
  // down. It must not throw and must not signal a reused PID.
  const second = await teardownOwnedProcesses();

  assert.equal(second.length, 0);
  assert.equal(await isPortOpen(port), false);
});

test('teardown after a partial startup stops what did start', async (t) => {
  if (!posix) {
    t.skip('process groups are POSIX-only');

    return;
  }

  // The browser launch that throws before the second profile exists. The
  // server is already running and is exactly what leaks if the failure path
  // skips teardown.
  const port = await freePort();
  const started = spawnOwnedProcess(
    'server',
    process.execPath,
    ['-e', grandchildScript(port)],
    { ownedPort: port, stdio: 'ignore' },
  );

  assert.equal(await waitForPortOpen(port), true);

  const results = await teardownOwnedProcesses();

  assert.equal(results.length, 1);
  assert.equal(isGroupAlive(started.groupId), false);
  assert.equal(await isPortOpen(port), false);
});

test('a profile directory is removed only after its process is gone', async (t) => {
  if (!posix) {
    t.skip('process groups are POSIX-only');

    return;
  }

  const directory = mkdtempSync(resolve(tmpdir(), 'dnd-process-tree-test-'));
  const record = spawnOwnedProcess('holder', process.execPath, [
    '-e',
    stubbornScript,
  ]);

  await once(record.child.stdout, 'data');

  assert.equal(existsSync(directory), true);

  ownDirectoryAfter(record, directory);

  await teardownOwnedProcesses({ graceMs: 300, killMs: 4000 });

  // The ordering is the assertion: the directory survives while the process
  // does, and is gone once teardown has actually reaped it.
  assert.equal(isGroupAlive(record.groupId), false);
  assert.equal(existsSync(directory), false);
});

test('port closure is waited for, not assumed', async (t) => {
  if (!posix) {
    t.skip('process groups are POSIX-only');

    return;
  }

  const port = await freePort();

  assert.equal(await isPortOpen(port), false);

  const record = spawnOwnedProcess(
    'listener',
    process.execPath,
    [
      '-e',
      `require('node:net').createServer().listen(${port}, '127.0.0.1'); setInterval(() => {}, 1000);`,
    ],
    { ownedPort: port, stdio: 'ignore' },
  );

  assert.equal(await waitForPortOpen(port), true);

  await stopOwnedProcess(record);

  assert.equal(await waitForPortClosed(port, { timeoutMs: 5000 }), true);
});

#!/usr/bin/env node
// Who a harness owns, and how it lets go.
//
// Every browser harness in this repository starts an application server and a
// `next dev`, and every one of them used to stop those by calling `kill` on the
// handle `spawn` returned. That signals one process. It is enough when the
// harness spawned the server directly, and it is not enough for the shape three
// harnesses actually use:
//
//     corepack -> pnpm -> node --watch -> the server
//
// `corepack` dies, the rest is reparented to init, and the server keeps its
// port and its database connections. M3 wave one found four of them alive after
// a clean acceptance sweep. Nothing failed - the next run picks a free port -
// so the leak accumulates silently until the machine runs out of something.
//
// The fix is to own a *group* rather than a process. On POSIX a `detached`
// spawn makes the child a process-group leader, so its whole descendant tree
// shares one group ID that a single `kill(-pgid)` reaches however deep the
// wrappers nest. That is the entire trick; the rest of this module is making it
// safe:
//
//  - **Ownership is recorded at spawn, never inferred.** A pattern match over
//    `ps` output is how a harness kills a developer's language server, so there
//    is none here. If this module did not start it, this module will not signal
//    it.
//  - **The group is guarded before every signal.** Group 0 means "my own
//    group" and would signal the harness and its parent shell; a group equal to
//    this process's own is the same mistake with an explicit number. Both are
//    refused rather than trusted.
//  - **Exit of the direct child is not proof the tree is gone.** `corepack`
//    exits immediately once `pnpm` takes over, which is exactly how the leak
//    looked like a successful teardown. Teardown therefore polls the group for
//    emptiness and escalates against the group, not the handle.
//  - **Non-POSIX gets a guarded fallback**, not a negative PID. `kill(-pid)` is
//    meaningless on Windows and there is no pretending otherwise.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';

const isPosix = process.platform !== 'win32';

/** Every process group this harness started and has not yet released. */
const owned = [];

/**
 * The owner record for a spawned child handle.
 *
 * The five harness libraries each expose a `startProcess` returning a plain
 * `ChildProcess`, and dozens of call sites hold onto that handle. Rather than
 * changing all of them to carry a record, the record is findable *from* the
 * handle - so `stopProcess(child)` can reach the whole group without any
 * caller learning that groups exist.
 */
const recordsByChild = new WeakMap();

/** Temporary directories, each paired with the process that must exit first. */
const ownedDirectories = [];

let teardownPromise = null;
let signalHandlersInstalled = false;

/**
 * Whether a group ID is one this module may signal.
 *
 * `kill(-0)` addresses the caller's own group, which on a harness means the
 * harness, the shell that started it, and anything else sharing that session.
 * A recorded group that somehow equals our own is the same accident with the
 * number written down, so both are refused. This is the one check standing
 * between a teardown and a developer's terminal.
 */
export function isSignalableGroupId(groupId, self = process.pid) {
  if (!Number.isInteger(groupId) || groupId <= 1) {
    return false;
  }

  // Our own PID can never be an owned group: a detached child leads a group
  // whose ID is *its* PID, and this process did not spawn itself. Checked
  // separately from the group below because it holds on every platform and
  // needs no lookup that might fail.
  if (groupId === self) {
    return false;
  }

  const ownGroup = getOwnGroupId();

  return ownGroup === null || groupId !== ownGroup;
}

/**
 * This process's own group, or null when the platform will not say.
 *
 * Node has no `process.getpgrp`, which is worth stating because assuming it
 * does is how this guard first shipped inert - it compared every candidate
 * against a sentinel and approved all of them. Linux exposes the real answer as
 * field 5 of `/proc/self/stat`; anywhere else the caller falls back to the
 * PID check above, which is weaker but never wrong.
 */
export function getOwnGroupId() {
  if (!isPosix) {
    return null;
  }

  if (typeof process.getpgrp === 'function') {
    try {
      return process.getpgrp();
    } catch {
      return null;
    }
  }

  try {
    const stat = readFileSync('/proc/self/stat', 'utf8');
    // The command field can contain spaces and parentheses, so fields are read
    // after the final ')' rather than by splitting the whole line.
    const afterComm = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const pgrp = Number.parseInt(afterComm[2] ?? '', 10);

    return Number.isInteger(pgrp) && pgrp > 0 ? pgrp : null;
  } catch {
    return null;
  }
}

/**
 * Whether any process remains in a group.
 *
 * Signal 0 performs the permission and existence check without delivering
 * anything, so this is the question "is the tree gone yet" asked of the kernel
 * rather than of the direct child's exit code - which is what made a wrapper's
 * exit look like a finished teardown.
 */
export function isGroupAlive(groupId) {
  if (!isPosix || !isSignalableGroupId(groupId)) {
    return false;
  }

  try {
    process.kill(-groupId, 0);

    return true;
  } catch (error) {
    // EPERM means processes exist that we may not signal. That cannot happen
    // for a group we created, and reporting "gone" would be a lie, so it counts
    // as alive and teardown will time out loudly rather than silently.
    return error?.code === 'EPERM';
  }
}

/**
 * Start a process this harness owns, as its own group where the platform has
 * them.
 *
 * `detached` here is not "run in the background" - the handle is kept, never
 * unref'd, and stdio stays piped. It exists only so the child leads a group the
 * teardown below can address as a unit.
 */
export function spawnOwnedProcess(name, command, args, options = {}) {
  const child = spawn(command, args, {
    ...options,
    detached: isPosix,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });

  const record = {
    child,
    // On POSIX a detached child leads a group whose ID is its PID. Elsewhere
    // there is no group to address and teardown falls back to the tree walk.
    groupId: isPosix ? child.pid : null,
    name,
    port: options.ownedPort ?? null,
  };

  owned.push(record);
  recordsByChild.set(child, record);

  return record;
}

export function getOwnedRecord(child) {
  return (child && recordsByChild.get(child)) ?? null;
}

/**
 * Stop the tree behind a child handle.
 *
 * The adapter every existing `stopProcess(child)` call site goes through. An
 * unrecorded handle - one spawned before a harness was migrated - still gets
 * the old single-process treatment rather than being silently skipped.
 */
export async function stopOwnedChild(child, options = {}) {
  const record = getOwnedRecord(child);

  if (record) {
    return stopOwnedProcess(record, options);
  }

  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return { escalated: false, stopped: true };
  }

  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), delay(options.graceMs ?? 5000)]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([once(child, 'exit'), delay(options.killMs ?? 5000)]);
  }

  return { escalated: true, stopped: child.exitCode !== null };
}

/** Register a directory that may only be removed once `record` has exited. */
export function ownDirectoryAfter(record, directory) {
  ownedDirectories.push({ directory, record });
}

/**
 * Stop one owned tree: politely, then not.
 *
 * Escalation is deliberately narrow. It is aimed at the recorded group and
 * nothing else, it only happens after the graceful window has actually elapsed,
 * and a group that has already gone is left alone rather than signalled again -
 * a PID that has been reused by then belongs to somebody else.
 */
export async function stopOwnedProcess(
  record,
  { graceMs = 5000, killMs = 5000, pollMs = 100 } = {},
) {
  if (!record || record.stopped) {
    return { escalated: false, stopped: true };
  }

  record.stopped = true;

  const { child } = record;
  const exited = child.exitCode !== null || child.signalCode !== null;
  const childExit = exited ? Promise.resolve() : once(child, 'exit');

  signalTree(record, 'SIGTERM');

  await Promise.race([childExit, delay(graceMs)]);

  const gone = await waitForTreeGone(record, graceMs, pollMs);

  if (gone) {
    return { escalated: false, stopped: true };
  }

  // The tree ignored SIGTERM, or a wrapper exited and left a descendant behind.
  // This is the case the old teardown could not even see.
  signalTree(record, 'SIGKILL');

  const stopped = await waitForTreeGone(record, killMs, pollMs);

  return { escalated: true, stopped };
}

function signalTree(record, signal) {
  const { child, groupId } = record;

  if (isPosix && isSignalableGroupId(groupId)) {
    try {
      process.kill(-groupId, signal);

      return;
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        throw error;
      }

      return;
    }
  }

  if (!isPosix && child.pid) {
    // Windows has no process groups to signal, so the platform's own tree kill
    // stands in for one. Bounded to this PID's descendants; still no pattern
    // matching, still nothing inferred.
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });

    return;
  }

  try {
    child.kill(signal);
  } catch {
    // Already gone.
  }
}

async function waitForTreeGone(record, timeoutMs, pollMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isTreeAlive(record)) {
      return true;
    }

    await delay(pollMs);
  }

  return !isTreeAlive(record);
}

function isTreeAlive(record) {
  if (isPosix && isSignalableGroupId(record.groupId)) {
    return isGroupAlive(record.groupId);
  }

  return record.child.exitCode === null && record.child.signalCode === null;
}

/**
 * Whether a TCP port has actually been released.
 *
 * A process can exit while the socket sits in a lingering state, and the next
 * harness then fails to bind for a reason that has nothing to do with it. This
 * is the check that makes "the server is stopped" mean the port is free.
 */
export function isPortOpen(port, host = '127.0.0.1', timeoutMs = 500) {
  return new Promise((resolveOpen) => {
    const socket = createConnection({ host, port });
    const settle = (open) => {
      socket.destroy();
      resolveOpen(open);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

export async function waitForPortClosed(port, { timeoutMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) {
      return true;
    }

    await delay(100);
  }

  return !(await isPortOpen(port));
}

/**
 * Release everything this harness owns, once.
 *
 * Reverse order, so a browser goes before the server it was talking to. The
 * promise is memoised because a second Ctrl-C during teardown must not start a
 * second teardown and leave half the tree killed - and because the same
 * function runs from normal completion, from a thrown error and from a signal.
 */
export function teardownOwnedProcesses(options = {}) {
  if (teardownPromise) {
    return teardownPromise;
  }

  teardownPromise = (async () => {
    const records = owned.splice(0).reverse();
    const results = [];

    for (const record of records) {
      results.push({
        name: record.name,
        ...(await stopOwnedProcess(record, options)),
      });

      if (record.port) {
        await waitForPortClosed(record.port);
      }
    }

    // Only now. A Chrome profile directory removed while Chrome still holds it
    // comes back, or comes back half-removed, and the next run inherits a
    // profile in a state no product code ever produces.
    for (const { directory, record } of ownedDirectories.splice(0)) {
      if (record && isTreeAlive(record)) {
        continue;
      }

      removeDirectoryWithRetry(directory);
    }

    // Reported by the owner, not by a `ps` grep. Scanning for command patterns
    // after a run is the same ownership-by-inference this module exists to
    // avoid: it cannot tell a leaked harness server from a developer's own
    // `pnpm dev` on the same tree, and it will accuse the second one.
    const survivors = results.filter((result) => !result.stopped);

    if (survivors.length) {
      console.error(
        `[harness-process-tree] ${survivors.length} owned process tree(s) did not stop: ` +
          survivors.map((result) => result.name).join(', '),
      );
    }

    teardownPromise = null;

    return results;
  })();

  return teardownPromise;
}

/**
 * Run teardown on every way a harness can end.
 *
 * A harness that only cleans up on success leaks its whole tree on the first
 * failed assertion - which is the run you are most likely to interrupt and
 * re-run immediately.
 */
export function installOwnedProcessCleanup(extraTeardown) {
  if (signalHandlersInstalled) {
    return;
  }

  signalHandlersInstalled = true;

  const run = async () => {
    if (extraTeardown) {
      await extraTeardown();
    }

    await teardownOwnedProcesses();
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      void run().then(() => {
        process.exit(signal === 'SIGINT' ? 130 : 143);
      });
    });
  }

  process.once('beforeExit', () => {
    void run();
  });
}

/** Test seam: forget every recorded owner without signalling anything. */
export function resetOwnedProcessRegistryForTests() {
  owned.splice(0);
  ownedDirectories.splice(0);
  teardownPromise = null;
}

export function countOwnedProcesses() {
  return owned.length;
}

function removeDirectoryWithRetry(directory, attempts = 10) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      rmSync(directory, { force: true, recursive: true });

      return true;
    } catch {
      spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 120)'], {
        stdio: 'ignore',
      });
    }
  }

  return false;
}

export function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

import { execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type ProcessRow = { pid: number; parent: number; group: number; state: string };

async function processTable(): Promise<ProcessRow[]> {
  const { stdout } = await exec("ps", ["-axo", "pid=,ppid=,pgid=,stat="], {
    timeout: 3000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout
    .trim()
    .split("\n")
    .map((line) => {
      const [pid, parent, group, state] = line.trim().split(/\s+/);
      return { pid: Number(pid), parent: Number(parent), group: Number(group), state: state ?? "" };
    });
}

function signal(pid: number, value: NodeJS.Signals): void {
  try {
    process.kill(pid, value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

/**
 * The CLI owns a process group, but Puppeteer starts another for Chrome.
 * Freeze the owned tree before recording groups, then reclaim both. Never
 * select processes by executable name or touch the daemon's process group.
 */
export async function terminateRenderTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    await exec("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: 5000 }).catch((error) => {
      if (child.exitCode === null && child.signalCode === null) throw error;
    });
    return;
  }
  const owned = new Map<number, ProcessRow>();
  // Reading the table before freezing also verifies the cleanup dependency.
  await processTable();
  const groups = new Set<number>([pid]); // CLI is always spawned detached.
  signal(pid, "SIGSTOP");
  try {
    // Freeze each discovered descendant before taking another snapshot.
    for (let pass = 0; pass < 8; pass++) {
      const rows = await processTable();
      const before = owned.size;
      const root = rows.find((row) => row.pid === pid);
      if (root) owned.set(pid, root);
      let added = true;
      while (added) {
        added = false;
        for (const row of rows) {
          if (owned.has(row.parent) && !owned.has(row.pid)) {
            owned.set(row.pid, row);
            signal(row.pid, "SIGSTOP");
            added = true;
          }
        }
      }
      if (owned.size === before) break;
    }
  } finally {
    // Always release frozen processes, including when inspection fails.
    for (const row of owned.values()) if (owned.has(row.group)) groups.add(row.group);
    for (const group of groups) signal(-group, "SIGKILL");
    for (const target of owned.keys()) signal(target, "SIGKILL");
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    const remaining = (await processTable()).filter(
      (row) => (owned.has(row.pid) || groups.has(row.group)) && !row.state.startsWith("Z"),
    );
    if (!remaining.length) return;
    await pause(20);
  }
  throw new Error("Render processes did not exit after termination");
}

/** Fail before launching a browser if this host cannot inspect its process tree. */
export async function checkProcessCleanup(): Promise<void> {
  if (process.platform !== "win32") await processTable();
}

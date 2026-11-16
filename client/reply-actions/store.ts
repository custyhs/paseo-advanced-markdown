// Pure module: no React, React Native, or SDK runtime imports.

import {
  type CoOwnership,
  computeCoOwnership,
  MIN_CO_OWNED_TEXT_LENGTH,
  turnRef,
} from "./co-ownership.js";
import { isTextKey, type ReplyKey, replyKey } from "./keys.js";
import { groupTurns, type IndexedTurn, type TimelineEntryLike } from "./turns.js";

/** Entries per timeline read. The wired reader passes this to the daemon. */
export const READ_PAGE_SIZE = 200;
/** Pages one read operation may fetch, tail included, while a pending key stays missing. */
export const READ_PAGE_CAP = 5;
/** Spacing between an agent's read operations, measured from when the previous one began reading. */
export const MIN_READ_INTERVAL_MS = 2_000;
/** How long an agent's index outlives its last mounted row. */
export const EVICT_AFTER_MS = 60_000;

/** The slice of a projected daemon timeline page the index reads. */
export interface TimelinePageLike {
  readonly epoch: string;
  readonly entries: readonly TimelineEntryLike[];
  readonly startCursor: unknown;
  readonly hasOlder: boolean;
}

export type TimelineReadOptions = { direction: "tail" } | { direction: "before"; cursor: unknown };

export type TimelineReader = (
  agentId: string,
  options: TimelineReadOptions,
) => Promise<TimelinePageLike>;

export type AgentStatus = "initializing" | "idle" | "running" | "error" | "closed";

/** What one rendered reply row learns about the turn holding its key. */
export interface TurnView {
  readonly turnId: string;
  /** The key is the turn's last reply, where the host anchors its footer. */
  readonly isFinalReply: boolean;
  /** False only for the agent's latest turn while the agent still works. */
  readonly complete: boolean;
  /** The turn keeps a plain reply the plugin could not claim. */
  readonly unprotected: boolean;
  /** The turn's non-empty replies, joined by a blank line. */
  readonly copyText: string;
  readonly endedAt: string;
}

export interface ReplyActionsStore {
  /** Counts a rendered row for the agent; the returned function uncounts it. */
  rowMounted(agentId: string): () => void;
  /** Asks the index to cover a rendered reply key, reading the timeline if needed. */
  requestKey(agentId: string, key: ReplyKey, options: { streaming: boolean }): void;
  noteAgentStatus(agentId: string, status: AgentStatus): void;
  turnView(agentId: string, key: ReplyKey): TurnView | null;
  decisionInputs(): { handedBack: ReadonlySet<ReplyKey>; coOwned: ReadonlySet<ReplyKey> };
  /** Recomputes co-ownership after an ownership-rule change (settings moved). */
  ownershipChanged(): void;
  /** Resolves once no read operation is in flight or waiting. */
  settled(): Promise<void>;
  subscribe(listener: () => void): () => void;
  getVersion(): number;
  dispose(): void;
}

interface ReadOperation {
  cancelled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  wake: (() => void) | null;
}

interface AgentState {
  epoch: string | null;
  entries: readonly TimelineEntryLike[];
  turns: readonly IndexedTurn[];
  requested: Set<ReplyKey>;
  pending: Set<ReplyKey>;
  mounted: number;
  status: AgentStatus | null;
  /** When the agent's last read operation began reading; spacing measures from here. */
  lastReadStartedAt: number;
  evictTimer: ReturnType<typeof setTimeout> | null;
  operation: ReadOperation | null;
}

/** Hand-back tracking lands with the hand-back methods; nothing is handed back yet. */
const NO_HANDED_BACK: ReadonlySet<ReplyKey> = new Set();

/** A turn can still grow while its agent works; an unknown status counts as idle. */
function isWorking(status: AgentStatus | null): boolean {
  return status === "running" || status === "initializing";
}

function mergeBySeqStart(
  base: readonly TimelineEntryLike[],
  incoming: readonly TimelineEntryLike[],
): TimelineEntryLike[] {
  const bySeq = new Map<number, TimelineEntryLike>();
  for (const entry of base) bySeq.set(entry.seqStart, entry);
  for (const entry of incoming) bySeq.set(entry.seqStart, entry);
  return [...bySeq.values()].sort((a, b) => a.seqStart - b.seqStart);
}

function hasMissingKey(
  pending: ReadonlySet<ReplyKey>,
  entries: readonly TimelineEntryLike[],
): boolean {
  if (pending.size === 0) return false;
  const present = new Set<ReplyKey>();
  for (const { item } of entries) {
    if (item.type !== "assistant_message" || typeof item.text !== "string") continue;
    present.add(replyKey({ text: item.text, messageId: item.messageId }));
  }
  for (const key of pending) {
    if (!present.has(key)) return true;
  }
  return false;
}

function sameKeySet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

/**
 * Per-agent index over the daemon timeline. Reply rows request their keys;
 * the store reads timeline pages through the injected reader, groups them
 * into turns, recomputes co-ownership across every loaded agent and answers
 * per-row questions through `turnView`. Written without a class: client
 * bundles are evaluated by Hermes on Android, where runtime class syntax in
 * evaluated code has failed before.
 */
export function createReplyActionsStore(options: {
  read: TimelineReader;
  isOwned(text: string): boolean;
}): ReplyActionsStore {
  const agents = new Map<string, AgentState>();
  const listeners = new Set<() => void>();
  const operations = new Set<Promise<void>>();
  let coOwnership: CoOwnership = { coOwned: new Set(), unprotectedTurns: new Set() };
  let version = 0;
  let disposed = false;

  function notify(): void {
    version += 1;
    for (const listener of [...listeners]) listener();
  }

  function ensureAgent(agentId: string): AgentState {
    let state = agents.get(agentId);
    if (state === undefined) {
      state = {
        epoch: null,
        entries: [],
        turns: [],
        requested: new Set(),
        pending: new Set(),
        mounted: 0,
        status: null,
        lastReadStartedAt: Number.NEGATIVE_INFINITY,
        evictTimer: null,
        operation: null,
      };
      agents.set(agentId, state);
    }
    return state;
  }

  function computeNow(): CoOwnership {
    const turnsByAgent = new Map<string, readonly IndexedTurn[]>();
    for (const [agentId, state] of agents) turnsByAgent.set(agentId, state.turns);
    return computeCoOwnership({
      turnsByAgent,
      handedBackTurns: new Map(),
      isOwned: options.isOwned,
      minTextLength: MIN_CO_OWNED_TEXT_LENGTH,
    });
  }

  function cancelOperation(state: AgentState): void {
    const operation = state.operation;
    if (operation === null) return;
    operation.cancelled = true;
    if (operation.timer !== null) {
      clearTimeout(operation.timer);
      operation.timer = null;
    }
    // Settle the spacing wait so a cancelled operation's promise resolves.
    operation.wake?.();
    state.operation = null;
  }

  async function runReads(
    agentId: string,
    state: AgentState,
    operation: ReadOperation,
  ): Promise<void> {
    const wait = state.lastReadStartedAt + MIN_READ_INTERVAL_MS - Date.now();
    if (wait > 0) {
      await new Promise<void>((resolve) => {
        operation.wake = resolve;
        operation.timer = setTimeout(resolve, wait);
      });
      operation.wake = null;
      operation.timer = null;
    }
    if (operation.cancelled) return;
    state.lastReadStartedAt = Date.now();
    // Buffer locally so a rejected read leaves the committed index untouched.
    let epoch = state.epoch;
    let entries = state.entries;
    try {
      let page = await options.read(agentId, { direction: "tail" });
      if (operation.cancelled) return;
      if (page.epoch === epoch) {
        entries = mergeBySeqStart(entries, page.entries);
      } else {
        // The timeline was rebuilt under this epoch; stored entries are stale.
        epoch = page.epoch;
        entries = mergeBySeqStart([], page.entries);
      }
      let pages = 1;
      // Pending keys may grow while a page is in flight; re-check the live set.
      while (hasMissingKey(state.pending, entries) && page.hasOlder && pages < READ_PAGE_CAP) {
        page = await options.read(agentId, { direction: "before", cursor: page.startCursor });
        if (operation.cancelled) return;
        entries = mergeBySeqStart(entries, page.entries);
        pages += 1;
      }
    } catch {
      // Requested keys stay recorded, so a failing daemon is asked once per key.
      state.pending.clear();
      return;
    }
    state.epoch = epoch;
    state.entries = entries;
    state.turns = groupTurns(entries);
    state.pending.clear();
    coOwnership = computeNow();
    notify();
  }

  function startOperation(agentId: string, state: AgentState): void {
    if (disposed || state.operation !== null) return;
    const operation: ReadOperation = { cancelled: false, timer: null, wake: null };
    state.operation = operation;
    const promise = runReads(agentId, state, operation).finally(() => {
      if (state.operation === operation) state.operation = null;
      operations.delete(promise);
    });
    operations.add(promise);
  }

  function evict(agentId: string, state: AgentState): void {
    state.evictTimer = null;
    if (agents.get(agentId) !== state) return;
    cancelOperation(state);
    agents.delete(agentId);
    coOwnership = computeNow();
    notify();
  }

  return {
    rowMounted(agentId) {
      if (disposed) return () => {};
      const state = ensureAgent(agentId);
      state.mounted += 1;
      if (state.evictTimer !== null) {
        clearTimeout(state.evictTimer);
        state.evictTimer = null;
      }
      let unmounted = false;
      return () => {
        if (unmounted || disposed || agents.get(agentId) !== state) return;
        unmounted = true;
        state.mounted -= 1;
        if (state.mounted === 0) {
          state.evictTimer = setTimeout(() => evict(agentId, state), EVICT_AFTER_MS);
        }
      };
    },
    requestKey(agentId, key, { streaming }) {
      if (disposed) return;
      // A streaming reply without a message id changes text, and with it its key.
      if (streaming && isTextKey(key)) return;
      const state = ensureAgent(agentId);
      if (state.requested.has(key)) return;
      if (state.turns.some((turn) => turn.replies.some((reply) => reply.key === key))) return;
      state.requested.add(key);
      state.pending.add(key);
      startOperation(agentId, state);
    },
    noteAgentStatus(agentId, status) {
      if (disposed) return;
      const state = ensureAgent(agentId);
      if (state.status === status) return;
      const turnEnded = isWorking(state.status) && !isWorking(status);
      state.status = status;
      if (turnEnded && state.mounted > 0) startOperation(agentId, state);
      notify();
    },
    turnView(agentId, key) {
      const state = agents.get(agentId);
      if (state === undefined) return null;
      for (let index = state.turns.length - 1; index >= 0; index -= 1) {
        const turn = state.turns[index]!;
        const replyIndex = turn.replies.findLastIndex((reply) => reply.key === key);
        if (replyIndex < 0) continue;
        return {
          turnId: turn.id,
          isFinalReply: replyIndex === turn.replies.length - 1,
          complete: !(index === state.turns.length - 1 && isWorking(state.status)),
          unprotected: coOwnership.unprotectedTurns.has(turnRef(agentId, turn.id)),
          copyText: turn.replies
            .map((reply) => reply.text.trim())
            .filter((text) => text.length > 0)
            .join("\n\n"),
          endedAt: turn.endedAt,
        };
      }
      return null;
    },
    decisionInputs() {
      return { handedBack: NO_HANDED_BACK, coOwned: coOwnership.coOwned };
    },
    ownershipChanged() {
      const next = computeNow();
      const changed =
        !sameKeySet(coOwnership.coOwned, next.coOwned) ||
        !sameKeySet(coOwnership.unprotectedTurns, next.unprotectedTurns);
      coOwnership = next;
      if (changed) notify();
    },
    async settled() {
      while (operations.size > 0) await Promise.all([...operations]);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getVersion() {
      return version;
    },
    dispose() {
      disposed = true;
      for (const state of agents.values()) {
        if (state.evictTimer !== null) {
          clearTimeout(state.evictTimer);
          state.evictTimer = null;
        }
        cancelOperation(state);
      }
      agents.clear();
      listeners.clear();
    },
  };
}

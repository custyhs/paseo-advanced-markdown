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
  /** The turn's non-empty replies joined untrimmed by a blank line, the host's Copy shape. */
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
  /**
   * Hands the turn holding this key back to the host. Reads the tail first —
   * right away, outside the spacing rule — so the hand-back covers the turn's
   * real final reply. Resolves false when no indexed turn holds the key.
   */
  showOriginal(agentId: string, key: ReplyKey): Promise<boolean>;
  /** Returns the agent's handed-back turns to plugin rendering. */
  restore(agentId: string): void;
  /** How many of the agent's turns are handed back. */
  originalTurnCount(agentId: string): number;
  /** Agents with at least one handed-back turn. */
  agentsWithOriginalView(): readonly string[];
  /**
   * Off, the store answers nothing: `turnView` is null, `decisionInputs` is
   * two empty sets, `requestKey` reads nothing, and every hand-back record is
   * deleted. On restores normal answers from the kept indexes.
   */
  setEnabled(enabled: boolean): void;
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
  /** Skips the spacing wait; `showOriginal` reads the tail right away. */
  immediate: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  wake: (() => void) | null;
  /** Settles when the operation is done; `showOriginal` waits out the slot on it. */
  done: Promise<void> | null;
}

interface AgentState {
  epoch: string | null;
  entries: readonly TimelineEntryLike[];
  turns: readonly IndexedTurn[];
  /** Oldest `startCursor` paging has reached this epoch; reads continue from it. */
  oldestCursor: unknown;
  /** The paging window is spent: a cap ran out or history has no older pages. */
  exhausted: boolean;
  requested: Set<ReplyKey>;
  pending: Set<ReplyKey>;
  mounted: number;
  status: AgentStatus | null;
  /** When the agent's last read operation began reading; spacing measures from here. */
  lastReadStartedAt: number;
  evictTimer: ReturnType<typeof setTimeout> | null;
  operation: ReadOperation | null;
  /** A completion refresh arrived while an operation was active; run one after it. */
  refreshWanted: boolean;
}

/** What a disabled store answers for both decision sets. */
const EMPTY_KEYS: ReadonlySet<ReplyKey> = new Set();

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
  /** Whether the plugin's renderer could draw this text; see `OwnershipDetector`. */
  canRender(text: string): boolean;
}): ReplyActionsStore {
  const agents = new Map<string, AgentState>();
  const listeners = new Set<() => void>();
  const operations = new Set<Promise<void>>();
  /**
   * Handed-back keys per agent, keyed by turn id: the turn's owned keys plus
   * the keys co-owned in it just before recording. Kept off `AgentState` so a
   * hand-back — explicit user state — outlives the index's eviction timer.
   */
  const handedBack = new Map<string, Map<string, ReadonlySet<ReplyKey>>>();
  let handedBackKeys: ReadonlySet<ReplyKey> = EMPTY_KEYS;
  let coOwnership: CoOwnership = { coOwned: new Set(), unprotectedTurns: new Set() };
  let version = 0;
  let enabled = true;
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
        oldestCursor: undefined,
        exhausted: false,
        requested: new Set(),
        pending: new Set(),
        mounted: 0,
        status: null,
        lastReadStartedAt: Number.NEGATIVE_INFINITY,
        evictTimer: null,
        operation: null,
        refreshWanted: false,
      };
      agents.set(agentId, state);
    }
    return state;
  }

  function computeNow(): CoOwnership {
    const turnsByAgent = new Map<string, readonly IndexedTurn[]>();
    for (const [agentId, state] of agents) turnsByAgent.set(agentId, state.turns);
    const handedBackTurns = new Map<string, ReadonlySet<string>>();
    for (const [agentId, records] of handedBack) {
      handedBackTurns.set(agentId, new Set(records.keys()));
    }
    return computeCoOwnership({
      turnsByAgent,
      handedBackTurns,
      isOwned: options.isOwned,
      canRender: options.canRender,
      minTextLength: MIN_CO_OWNED_TEXT_LENGTH,
    });
  }

  function handedBackUnion(): ReadonlySet<ReplyKey> {
    const union = new Set<ReplyKey>();
    for (const records of handedBack.values()) {
      for (const keys of records.values()) {
        for (const key of keys) union.add(key);
      }
    }
    return union;
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
    const wait = operation.immediate
      ? 0
      : state.lastReadStartedAt + MIN_READ_INTERVAL_MS - Date.now();
    if (wait > 0) {
      await new Promise<void>((resolve) => {
        operation.wake = resolve;
        operation.timer = setTimeout(resolve, wait);
      });
      operation.wake = null;
      if (operation.timer !== null) {
        // Woken early; the timer is still pending.
        clearTimeout(operation.timer);
        operation.timer = null;
      }
    }
    if (operation.cancelled) return;
    state.lastReadStartedAt = Date.now();
    // Buffer locally so a rejected read leaves the committed index untouched.
    let epoch = state.epoch;
    let entries = state.entries;
    let oldestCursor = state.oldestCursor;
    let exhausted = state.exhausted;
    try {
      let next: TimelineReadOptions = { direction: "tail" };
      let pages = 0;
      let missing = false;
      while (pages < READ_PAGE_CAP) {
        const page = await options.read(agentId, next);
        if (operation.cancelled) return;
        pages += 1;
        if (page.epoch !== epoch) {
          // The timeline was rebuilt under this epoch; everything read so
          // far is stale, the paging window included.
          epoch = page.epoch;
          entries = [];
          oldestCursor = undefined;
          exhausted = false;
          if (next.direction === "before") {
            // This page's cursor came from the old epoch; restart from the new tail.
            next = { direction: "tail" };
            continue;
          }
        }
        entries = mergeBySeqStart(entries, page.entries);
        // The window spans operations: a tail page only seeds it, while a
        // paged response always reaches older than anything read before.
        if (next.direction === "before" || oldestCursor === undefined) {
          oldestCursor = page.startCursor;
        }
        // Pending keys may grow while a page is in flight; re-check the live set.
        missing = hasMissingKey(state.pending, entries);
        if (!missing || exhausted) break;
        if (!page.hasOlder) {
          exhausted = true;
          break;
        }
        next = { direction: "before", cursor: oldestCursor };
      }
      // A key beyond the spent cap will not be found by more reads either;
      // from here on, missing keys cost one tail read per operation.
      if (missing && pages >= READ_PAGE_CAP) exhausted = true;
    } catch {
      // Requested keys stay recorded, so a failing daemon is asked once per key.
      state.pending.clear();
      return;
    }
    state.epoch = epoch;
    state.entries = entries;
    state.oldestCursor = oldestCursor;
    state.exhausted = exhausted;
    state.turns = groupTurns(entries);
    state.pending.clear();
    coOwnership = computeNow();
    notify();
  }

  function startOperation(
    agentId: string,
    state: AgentState,
    immediate = false,
  ): Promise<void> | null {
    if (disposed || state.operation !== null) return null;
    const operation: ReadOperation = {
      cancelled: false,
      immediate,
      timer: null,
      wake: null,
      done: null,
    };
    state.operation = operation;
    const promise = runReads(agentId, state, operation).finally(() => {
      if (state.operation === operation) state.operation = null;
      operations.delete(promise);
      if (
        state.refreshWanted &&
        enabled &&
        !operation.cancelled &&
        !disposed &&
        agents.get(agentId) === state
      ) {
        state.refreshWanted = false;
        if (state.mounted > 0) startOperation(agentId, state);
      }
    });
    operation.done = promise;
    operations.add(promise);
    return promise;
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
      if (disposed || !enabled) return;
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
      const wasWorking = isWorking(state.status);
      state.status = status;
      // Refresh on both working edges while rows are mounted: completion
      // indexes the finished turn, and the start of a turn brings in the new
      // turn's user message so the previous turn stops being the latest and
      // keeps its footer. A disabled store reads nothing.
      if (enabled && wasWorking !== isWorking(status) && state.mounted > 0) {
        if (state.operation === null) startOperation(agentId, state);
        else state.refreshWanted = true;
      }
      notify();
    },
    turnView(agentId, key) {
      if (!enabled) return null;
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
          // The host's Copy pushes each reply's text untrimmed and joins with a
          // blank line (collectAssistantResponseContent in Paseo's
          // agent-stream/strategy.ts); only all-whitespace replies are left out.
          copyText: turn.replies
            .filter((reply) => reply.text.trim().length > 0)
            .map((reply) => reply.text)
            .join("\n\n"),
          endedAt: turn.endedAt,
        };
      }
      return null;
    },
    decisionInputs() {
      if (!enabled) return { handedBack: EMPTY_KEYS, coOwned: EMPTY_KEYS };
      return { handedBack: handedBackKeys, coOwned: coOwnership.coOwned };
    },
    async showOriginal(agentId, key) {
      if (disposed || !enabled) return false;
      const state = ensureAgent(agentId);
      // One read per agent at a time: wait out the active operation, waking a
      // spacing wait early so the gesture never sits out the interval, then
      // claim the slot with an immediate tail read.
      let read: Promise<void> | null = null;
      while (read === null) {
        // Disposal or setEnabled(false) can land during any await in here; a
        // gesture that outlives either must read and record nothing more.
        if (disposed || !enabled) return false;
        const active = state.operation;
        if (active === null) {
          read = startOperation(agentId, state, true);
          if (read === null) return false; // Disposed while waiting.
        } else {
          active.wake?.();
          await active.done;
        }
      }
      await read;
      if (disposed || !enabled) return false;
      let found: IndexedTurn | null = null;
      for (let index = state.turns.length - 1; index >= 0 && found === null; index -= 1) {
        const turn = state.turns[index]!;
        if (turn.replies.some((reply) => reply.key === key)) found = turn;
      }
      if (found === null) return false;
      let records = handedBack.get(agentId);
      if (records === undefined) {
        records = new Map();
        handedBack.set(agentId, records);
      }
      // Handing the same turn back again keeps its earlier keys: the turn is
      // already skipped by co-ownership, so they would not be re-derived.
      const keys = new Set(records.get(found.id));
      for (const reply of found.replies) {
        if (options.isOwned(reply.text) || coOwnership.coOwned.has(reply.key)) {
          keys.add(reply.key);
        }
      }
      records.set(found.id, keys);
      handedBackKeys = handedBackUnion();
      coOwnership = computeNow();
      notify();
      return true;
    },
    restore(agentId) {
      if (disposed) return;
      handedBack.delete(agentId);
      handedBackKeys = handedBackUnion();
      coOwnership = computeNow();
      notify();
    },
    originalTurnCount(agentId) {
      return handedBack.get(agentId)?.size ?? 0;
    },
    agentsWithOriginalView() {
      return [...handedBack.keys()];
    },
    setEnabled(next) {
      if (disposed || enabled === next) return;
      enabled = next;
      if (!next) {
        handedBack.clear();
        handedBackKeys = EMPTY_KEYS;
        // Off reads nothing, so pending refresh wishes are dropped too.
        for (const state of agents.values()) state.refreshWanted = false;
      }
      coOwnership = computeNow();
      notify();
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
      handedBack.clear();
      handedBackKeys = EMPTY_KEYS;
      listeners.clear();
    },
  };
}

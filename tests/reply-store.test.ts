import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReplyActionsStore,
  EVICT_AFTER_MS,
  MIN_READ_INTERVAL_MS,
  READ_PAGE_CAP,
  type TimelinePageLike,
  type TimelineReadOptions,
} from "../client/reply-actions/store.js";
import { agentic, page, replyEntry, userEntry } from "./helpers/timeline.js";

function harness(
  respond: (
    agentId: string,
    options: TimelineReadOptions,
  ) => TimelinePageLike | Promise<TimelinePageLike>,
  isOwned: (text: string) => boolean = (text) => text.includes("$"),
  canRender: (text: string) => boolean = () => true,
) {
  const calls: Array<{ agentId: string; options: TimelineReadOptions }> = [];
  const store = createReplyActionsStore({
    read: async (agentId, options) => {
      calls.push({ agentId, options });
      return respond(agentId, options);
    },
    isOwned: (text) => isOwned(text),
    canRender: (text) => canRender(text),
  });
  return { store, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("turn index", () => {
  it("reads the tail once for an unknown key and indexes its turn", async () => {
    const { store, calls } = harness(() => page(agentic));
    store.rowMounted("a1");
    store.requestKey("a1", "id:f", { streaming: false });
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    expect(calls).toEqual([{ agentId: "a1", options: { direction: "tail" } }]);
    expect(store.turnView("a1", "id:f")).toEqual({
      turnId: "t1",
      isFinalReply: true,
      complete: true,
      unprotected: false,
      copyText: "Checking first.\n\n$E=mc^2$",
      endedAt: agentic[3]!.timestamp,
    });
    expect(store.decisionInputs().coOwned).toEqual(new Set(["id:c"]));
  });

  it("pages older history until the key appears, up to the cap", async () => {
    const { store, calls } = harness((_agent, options) =>
      page(options.direction === "tail" ? [userEntry(100)] : [userEntry(1)], { hasOlder: true }),
    );
    store.requestKey("a1", "id:missing", { streaming: false });
    await store.settled();
    expect(calls).toHaveLength(READ_PAGE_CAP);
    expect(calls.slice(1).every((call) => call.options.direction === "before")).toBe(true);
    expect(store.turnView("a1", "id:missing")).toBeNull();
  });

  it("reads only the tail for later keys once the paging window is exhausted", async () => {
    const { store, calls } = harness((_agent, options) =>
      page(options.direction === "tail" ? [userEntry(100)] : [userEntry(1)], { hasOlder: true }),
    );
    store.requestKey("a1", "id:missing", { streaming: false });
    await store.settled();
    expect(calls).toHaveLength(READ_PAGE_CAP);
    store.requestKey("a1", "id:also-missing", { streaming: false });
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(calls).toHaveLength(READ_PAGE_CAP + 1);
    expect(calls[READ_PAGE_CAP]!.options).toEqual({ direction: "tail" });
  });

  it("continues paging from the oldest cursor already reached", async () => {
    const pages: Record<string, TimelinePageLike> = {
      tail: page([userEntry(300, "t9"), replyEntry(301, "$t$", { messageId: "t", turnId: "t9" })], {
        startCursor: "c300",
        hasOlder: true,
      }),
      c300: page([userEntry(200, "t5"), replyEntry(201, "$a$", { messageId: "a", turnId: "t5" })], {
        startCursor: "c200",
        hasOlder: true,
      }),
      c200: page([userEntry(100, "t2"), replyEntry(101, "$b$", { messageId: "b", turnId: "t2" })], {
        startCursor: "c100",
        hasOlder: true,
      }),
    };
    const { store, calls } = harness(
      (_agent, options) => pages[options.direction === "tail" ? "tail" : String(options.cursor)]!,
    );
    store.requestKey("a1", "id:a", { streaming: false });
    await store.settled();
    expect(calls.map((call) => call.options)).toEqual([
      { direction: "tail" },
      { direction: "before", cursor: "c300" },
    ]);
    store.requestKey("a1", "id:b", { streaming: false });
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(calls.slice(2).map((call) => call.options)).toEqual([
      { direction: "tail" },
      { direction: "before", cursor: "c200" },
    ]);
    expect(store.turnView("a1", "id:b")).not.toBeNull();
  });

  it("resumes paging after an epoch change resets the window", async () => {
    let epoch = "e1";
    const { store, calls } = harness((_agent, options) =>
      page(options.direction === "tail" ? [userEntry(100)] : [userEntry(1)], {
        hasOlder: true,
        epoch,
      }),
    );
    store.requestKey("a1", "id:missing", { streaming: false });
    await store.settled();
    expect(calls).toHaveLength(READ_PAGE_CAP);
    epoch = "e2";
    store.requestKey("a1", "id:second", { streaming: false });
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(calls).toHaveLength(READ_PAGE_CAP * 2);
  });

  it("does not read for a streaming reply keyed by text", async () => {
    const { store, calls } = harness(() => page(agentic));
    store.requestKey("a1", "text:Partial $x", { streaming: true });
    await store.settled();
    expect(calls).toHaveLength(0);
    store.requestKey("a1", "id:f", { streaming: true });
    await store.settled();
    expect(calls).toHaveLength(1);
  });

  it("joins an in-flight read and spaces later reads per agent", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { store, calls } = harness(async () => {
      await gate;
      return page(agentic);
    });
    store.requestKey("a1", "id:f", { streaming: false });
    store.requestKey("a1", "id:c", { streaming: false });
    release();
    await store.settled();
    expect(calls).toHaveLength(1);
    store.requestKey("a1", "id:new", { streaming: false });
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS - 1);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await store.settled();
    expect(calls).toHaveLength(2);
  });

  it("refreshes the tail on the start of a turn and again on its completion", async () => {
    const { store, calls } = harness(() => page(agentic));
    const unmount = store.rowMounted("a1");
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    store.noteAgentStatus("a1", "running");
    expect(store.turnView("a1", "id:f")?.complete).toBe(false);
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(calls).toHaveLength(2);
    store.noteAgentStatus("a1", "idle");
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(calls).toHaveLength(3);
    unmount();
    store.noteAgentStatus("a1", "running");
    store.noteAgentStatus("a1", "idle");
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS * 2);
    await store.settled();
    expect(calls).toHaveLength(3);
  });

  it("keeps the previous turn's footer when a new turn starts", async () => {
    let entries = [...agentic];
    const { store, calls } = harness(() => page(entries));
    store.rowMounted("a1");
    store.noteAgentStatus("a1", "idle");
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    expect(store.turnView("a1", "id:f")?.complete).toBe(true);
    // A follow-up prompt: the agent starts working and its new turn's user
    // message is already on the daemon timeline.
    entries = [...agentic, userEntry(5, "t2")];
    store.noteAgentStatus("a1", "running");
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(calls).toHaveLength(2);
    const view = store.turnView("a1", "id:f");
    expect(view?.complete).toBe(true);
    expect(view?.isFinalReply).toBe(true);
  });

  it("reads nothing while disabled, and re-enabling restores reads", async () => {
    const { store, calls } = harness(() => page(agentic));
    store.setEnabled(false);
    store.rowMounted("a1");
    store.requestKey("a1", "id:f", { streaming: false });
    store.noteAgentStatus("a1", "running");
    store.noteAgentStatus("a1", "idle");
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS * 2);
    await store.settled();
    expect(calls).toHaveLength(0);
    store.setEnabled(true);
    store.requestKey("a1", "id:f", { streaming: false });
    store.noteAgentStatus("a1", "running");
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(calls).toHaveLength(2);
    expect(store.turnView("a1", "id:f")).not.toBeNull();
  });

  it("re-reads the tail after the active read when a turn completes mid-read", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { store, calls } = harness(async () => {
      if (calls.length === 1) {
        await gate;
        return page([
          userEntry(1, "t1"),
          replyEntry(2, "Partial", { messageId: "f", turnId: "t1" }),
        ]);
      }
      return page(agentic);
    });
    store.rowMounted("a1");
    store.noteAgentStatus("a1", "running");
    store.requestKey("a1", "id:f", { streaming: false });
    store.noteAgentStatus("a1", "idle");
    release();
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(calls.map((call) => call.options.direction)).toEqual(["tail", "tail"]);
    expect(store.turnView("a1", "id:f")?.copyText).toBe("Checking first.\n\n$E=mc^2$");
  });

  it("rebuilds the index when the timeline epoch changes", async () => {
    let epoch = "e1";
    const replaced = [
      userEntry(1, "t9"),
      replyEntry(2, "Only now", { messageId: "n", turnId: "t9" }),
    ];
    const { store } = harness(() =>
      epoch === "e1" ? page(agentic) : page(replaced, { epoch: "e2" }),
    );
    store.rowMounted("a1");
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    epoch = "e2";
    store.requestKey("a1", "id:n", { streaming: false });
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(store.turnView("a1", "id:f")).toBeNull();
    expect(store.turnView("a1", "id:n")?.turnId).toBe("t9");
    expect(store.decisionInputs().coOwned.size).toBe(0);
  });

  it("rebuilds from the tail when an older page arrives from a new epoch", async () => {
    const { store, calls } = harness((_agent, options) => {
      if (options.direction === "before")
        return page([replyEntry(1, "$ghost$", { messageId: "ghost", turnId: "t0" })], {
          epoch: "e2",
        });
      return calls.length === 1
        ? page(
            [userEntry(10, "t2"), replyEntry(11, "Old tail", { messageId: "late", turnId: "t2" })],
            { hasOlder: true },
          )
        : page(agentic, { epoch: "e2" });
    });
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    expect(calls.map((call) => call.options.direction)).toEqual(["tail", "before", "tail"]);
    expect(store.turnView("a1", "id:f")?.turnId).toBe("t1");
    expect(store.turnView("a1", "id:late")).toBeNull();
    expect(store.turnView("a1", "id:ghost")).toBeNull();
    expect(store.decisionInputs().coOwned).toEqual(new Set(["id:c"]));
  });

  it("keeps today's rendering when reads fail and never re-reads the same key", async () => {
    const { store, calls } = harness(() => {
      throw new Error("unsupported");
    });
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    store.requestKey("a1", "id:f", { streaming: false });
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS * 3);
    await store.settled();
    expect(calls).toHaveLength(1);
    expect(store.turnView("a1", "id:f")).toBeNull();
  });

  it("evicts an agent's index after its last row unmounts", async () => {
    const { store } = harness(() => page(agentic));
    const unmount = store.rowMounted("a1");
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    unmount();
    await vi.advanceTimersByTimeAsync(EVICT_AFTER_MS - 1);
    store.rowMounted("a1")();
    await vi.advanceTimersByTimeAsync(EVICT_AFTER_MS - 1);
    expect(store.turnView("a1", "id:f")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(store.turnView("a1", "id:f")).toBeNull();
  });

  it("leaves empty replies out of the Copy text", async () => {
    const entries = [
      userEntry(1, "t1"),
      replyEntry(2, "  ", { messageId: "w", turnId: "t1" }),
      replyEntry(3, "$x$", { messageId: "f", turnId: "t1" }),
    ];
    const { store } = harness(() => page(entries));
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    expect(store.turnView("a1", "id:f")?.copyText).toBe("$x$");
    expect(store.turnView("a1", "id:f")?.unprotected).toBe(true);
  });

  it("keeps host whitespace in the Copy text", async () => {
    const entries = [
      userEntry(1, "t1"),
      replyEntry(2, "Hold on. ", { messageId: "p", turnId: "t1" }),
      replyEntry(3, "$x$", { messageId: "f", turnId: "t1" }),
    ];
    const { store } = harness(() => page(entries));
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    expect(store.turnView("a1", "id:f")?.copyText).toBe("Hold on. \n\n$x$");
  });

  it("leaves a reply the renderer cannot draw unclaimed and flags the turn", async () => {
    const entries = [
      userEntry(1, "t1"),
      replyEntry(2, "A long commentary with a screenshot ![s](https://e/x.png) embedded in it.", {
        messageId: "img",
        turnId: "t1",
      }),
      replyEntry(3, "$x$", { messageId: "f", turnId: "t1" }),
    ];
    const { store } = harness(
      () => page(entries),
      (text) => text.includes("$"),
      (text) => !text.includes("!["),
    );
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    expect(store.decisionInputs().coOwned.size).toBe(0);
    expect(store.turnView("a1", "id:f")?.unprotected).toBe(true);
  });

  it("recomputes co-ownership when ownership rules change and notifies once per change", async () => {
    let owns = true;
    const { store } = harness(
      () => page(agentic),
      (text) => owns && text.includes("$"),
    );
    let notified = 0;
    store.subscribe(() => {
      notified++;
    });
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    const version = store.getVersion();
    owns = false;
    store.ownershipChanged();
    expect(store.decisionInputs().coOwned.size).toBe(0);
    expect(store.getVersion()).toBe(version + 1);
    expect(notified).toBe(2);
  });
});

describe("original view", () => {
  it("reads the tail before handing back and covers the turn's real final reply", async () => {
    let entries = [...agentic];
    const { store, calls } = harness(() => page(entries));
    store.rowMounted("a1");
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    entries = [...agentic, replyEntry(5, "$b$", { messageId: "g", turnId: "t1" })];
    expect(await store.showOriginal("a1", "id:f")).toBe(true);
    expect(calls).toHaveLength(2);
    expect(store.decisionInputs().handedBack).toEqual(new Set(["id:c", "id:f", "id:g"]));
    expect(store.decisionInputs().coOwned.has("id:c")).toBe(false);
    expect(store.originalTurnCount("a1")).toBe(1);
    expect(store.agentsWithOriginalView()).toEqual(["a1"]);
  });

  it("restores an agent's turns", async () => {
    const { store } = harness(() => page(agentic));
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    await store.showOriginal("a1", "id:f");
    store.restore("a1");
    expect(store.decisionInputs().handedBack.size).toBe(0);
    expect(store.decisionInputs().coOwned).toEqual(new Set(["id:c"]));
    expect(store.originalTurnCount("a1")).toBe(0);
  });

  it("returns false when the key is in no indexed turn", async () => {
    const { store } = harness(() => page(agentic));
    expect(await store.showOriginal("a1", "id:nowhere")).toBe(false);
    expect(store.originalTurnCount("a1")).toBe(0);
  });

  it("turning the feature off restores every turn and blanks decisions", async () => {
    const { store, calls } = harness(() => page(agentic));
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    await store.showOriginal("a1", "id:f");
    store.setEnabled(false);
    expect(store.decisionInputs()).toEqual({ handedBack: new Set(), coOwned: new Set() });
    expect(store.originalTurnCount("a1")).toBe(0);
    expect(store.turnView("a1", "id:f")).toBeNull();
    store.requestKey("a1", "id:other", { streaming: false });
    await store.settled();
    expect(calls).toHaveLength(2);
    store.setEnabled(true);
    expect(store.decisionInputs().coOwned).toEqual(new Set(["id:c"]));
  });

  it("records nothing when the feature turns off while the gesture reads", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { store } = harness(async () => {
      await gate;
      return page(agentic);
    });
    const gesture = store.showOriginal("a1", "id:f");
    store.setEnabled(false);
    release();
    expect(await gesture).toBe(false);
    expect(store.originalTurnCount("a1")).toBe(0);
    expect(store.agentsWithOriginalView()).toEqual([]);
    store.setEnabled(true);
    expect(store.decisionInputs().handedBack.size).toBe(0);
  });
});

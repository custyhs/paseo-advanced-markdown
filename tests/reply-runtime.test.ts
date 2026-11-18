import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSFORMER_ID } from "../client/reply-actions/decision.js";
import { createOwnershipDetector } from "../client/reply-actions/ownership.js";
import { createTimelineReader } from "../client/reply-actions/reader.js";
import { createReplyActionsRuntime } from "../client/reply-actions/runtime.js";
import { createTurnStartWatcher } from "../client/reply-actions/turn-watch.js";
import { moduleState } from "../client/module-state.js";
import { detectExtensions, shouldTakeOver } from "../shared/markdown/extensions.js";
import { DEFAULT_MODULE_SETTINGS } from "../shared/settings.js";
import { agentic, page } from "./helpers/timeline.js";

interface FakeTransformer {
  id: string;
  transform(input: {
    item: { type: string; text: string; messageId?: string };
    phase: string;
  }): { items: Array<{ data: Record<string, string> }> } | undefined;
}

function fakeClient() {
  const transformers: FakeTransformer[] = [];
  const pills = new Map<string, { label: string | undefined }>();
  const log: string[] = [];
  return {
    transformers,
    pills,
    log,
    addTimelineTransformer(contribution: FakeTransformer) {
      transformers.push(contribution);
      log.push("add");
      return () => {
        const index = transformers.indexOf(contribution);
        if (index !== -1) transformers.splice(index, 1);
        log.push("remove");
      };
    },
    addComposerPill(contribution: { id: string; button: { label?: string } }) {
      const pill = { label: contribution.button.label };
      pills.set(contribution.id, pill);
      return {
        update(patch: { label?: string }) {
          pill.label = patch.label;
        },
        remove() {
          pills.delete(contribution.id);
        },
      };
    },
  };
}

const ownership = createOwnershipDetector({ detectExtensions, shouldTakeOver });
const reply = (text: string, messageId: string) => ({
  item: { type: "assistant_message", text, messageId },
  phase: "complete",
});
/** Stands in for the daemon's live timeline: `begin` reports an agent's next turn. */
function fakeTurns() {
  const watching = new Map<string, () => void>();
  return {
    watching,
    watch(agentId: string, onTurnStart: () => void) {
      watching.set(agentId, onTurnStart);
      return () => {
        watching.delete(agentId);
      };
    },
    begin(agentId: string) {
      watching.get(agentId)?.();
    },
  };
}

let reads = 0;
function start(watchTurnStart?: (agentId: string, onTurnStart: () => void) => () => void) {
  const client = fakeClient();
  const turns = fakeTurns();
  const runtime = createReplyActionsRuntime({
    client: client as never,
    read: async () => {
      reads += 1;
      return page(agentic);
    },
    ownership,
    settings: moduleState,
    watchTurnStart: watchTurnStart ?? turns.watch,
  });
  return { client, runtime, turns };
}

beforeEach(() => {
  vi.useFakeTimers();
  moduleState.reset();
  reads = 0;
});
afterEach(() => {
  moduleState.reset();
  vi.useRealTimers();
});

describe("reply actions runtime", () => {
  it("registers one transformer during setup", () => {
    const { client } = start();
    expect(client.transformers.map((transformer) => transformer.id)).toEqual([TRANSFORMER_ID]);
    expect(client.log).toEqual(["add"]);
  });

  it("re-registers once per burst of decision changes", async () => {
    const { client, runtime } = start();
    runtime.store.rowMounted("a1");
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    runtime.store.ownershipChanged();
    await vi.advanceTimersByTimeAsync(20);
    expect(client.log).toEqual(["add", "remove", "add"]);
    const [transformer] = client.transformers;
    expect(transformer!.transform(reply("Checking first.", "c"))?.items[0].data.role).toBe(
      "co-owned",
    );
  });

  it("skips re-registration when nothing changed", async () => {
    const { client } = start();
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS });
    await vi.advanceTimersByTimeAsync(20);
    expect(client.log).toEqual(["add"]);
  });

  it("follows module settings", async () => {
    const { client } = start();
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS, math: false });
    await vi.advanceTimersByTimeAsync(20);
    expect(client.transformers[0]!.transform(reply("$E=mc^2$", "f"))).toBeUndefined();
  });

  it("adds a pill on Show original and removes it on restore", async () => {
    const { client, runtime } = start();
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    expect(await runtime.showOriginal("a1", "id:f", "w1")).toBe(true);
    expect(client.pills.has("original-view-a1")).toBe(true);
    runtime.restore("a1");
    expect(client.pills.size).toBe(0);
  });

  it("labels the pill with a phrase short enough for Paseo to show whole", async () => {
    const { client, runtime } = start();
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    await runtime.showOriginal("a1", "id:f", "w1");
    // Paseo 0.16 cut "Original view · 1 turn" off after 19 characters.
    const label = client.pills.get("original-view-a1")?.label ?? "";
    expect(label.length).toBeGreaterThan(0);
    expect(label.length).toBeLessThanOrEqual(16);
  });

  it("returns the turn to plugin rendering when the agent starts its next turn", async () => {
    const { client, runtime, turns } = start();
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    await runtime.showOriginal("a1", "id:f", "w1");
    await vi.advanceTimersByTimeAsync(20);
    expect(client.transformers[0]!.transform(reply("$E=mc^2$", "f"))).toBeUndefined();
    turns.begin("a1");
    await vi.advanceTimersByTimeAsync(20);
    expect(client.transformers[0]!.transform(reply("$E=mc^2$", "f"))?.items[0].data.role).toBe(
      "owned",
    );
    expect(client.pills.size).toBe(0);
    expect(runtime.store.originalTurnCount("a1")).toBe(0);
  });

  it("watches an agent only while it has turns in the original view", async () => {
    const { runtime, turns } = start();
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    expect([...turns.watching.keys()]).toEqual([]);
    await runtime.showOriginal("a1", "id:f", "w1");
    expect([...turns.watching.keys()]).toEqual(["a1"]);
    runtime.restore("a1");
    expect([...turns.watching.keys()]).toEqual([]);
  });

  it("stops watching on dispose", async () => {
    const { runtime, turns } = start();
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    await runtime.showOriginal("a1", "id:f", "w1");
    expect([...turns.watching.keys()]).toEqual(["a1"]);
    runtime.dispose();
    expect([...turns.watching.keys()]).toEqual([]);
  });

  it("keeps Show original and its pill working when turn starts cannot be watched", async () => {
    const { client, runtime } = start(() => {
      throw new Error("timeline subscriptions are unavailable");
    });
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    expect(await runtime.showOriginal("a1", "id:f", "w1")).toBe(true);
    expect(client.pills.has("original-view-a1")).toBe(true);
    runtime.restore("a1");
    expect(client.pills.size).toBe(0);
  });

  it("turning the setting off removes pills and every hand-back", async () => {
    const { client, runtime } = start();
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    await runtime.showOriginal("a1", "id:f", "w1");
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS, forkSafeReplies: false });
    await vi.advanceTimersByTimeAsync(20);
    expect(client.pills.size).toBe(0);
    expect(client.transformers[0]!.transform(reply("$E=mc^2$", "f"))?.items[0].data.role).toBe(
      "owned",
    );
  });

  it("removes the transformer and pills on dispose", async () => {
    const { client, runtime } = start();
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    await runtime.showOriginal("a1", "id:f", "w1");
    runtime.dispose();
    expect(client.transformers).toHaveLength(0);
    expect(client.pills.size).toBe(0);
  });

  it("a host that keeps native footers disables hand-back, co-ownership and reads", async () => {
    const { client, runtime } = start();
    runtime.store.rowMounted("a1");
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    await runtime.showOriginal("a1", "id:f", "w1");
    expect(client.pills.size).toBe(1);
    runtime.noteHostNativeFooter();
    runtime.noteHostNativeFooter();
    await vi.advanceTimersByTimeAsync(20);
    expect(runtime.hostNativeFooter).toBe(true);
    expect(client.log).toEqual(["add", "remove", "add"]);
    expect(client.pills.size).toBe(0);
    expect(runtime.store.decisionInputs()).toEqual({ handedBack: new Set(), coOwned: new Set() });
    const [transformer] = client.transformers;
    expect(transformer!.transform(reply("$E=mc^2$", "f"))?.items[0].data.role).toBe("owned");
    expect(transformer!.transform(reply("Checking first.", "c"))).toBeUndefined();
    const readsBefore = reads;
    runtime.store.requestKey("a1", "id:g", { streaming: false });
    await runtime.store.settled();
    expect(reads).toBe(readsBefore);
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS, math: false });
    await vi.advanceTimersByTimeAsync(20);
    expect(client.transformers[0]!.transform(reply("$E=mc^2$", "f"))).toBeUndefined();
    expect(runtime.store.decisionInputs()).toEqual({ handedBack: new Set(), coOwned: new Set() });
  });
});

describe("createTurnStartWatcher", () => {
  function fakeTimeline(ready: Promise<void> = Promise.resolve()) {
    const handlers: Array<(message: unknown) => void> = [];
    const refs: string[] = [];
    let released = 0;
    const paseo = {
      agents: {
        ref: (agentId: string) => {
          refs.push(agentId);
          return {
            timeline: {
              subscribe(handler: (message: unknown) => void) {
                handlers.push(handler);
                return Object.assign(
                  () => {
                    released += 1;
                  },
                  { ready, subscriptionId: "sub-1", release: async () => undefined },
                );
              },
            },
          };
        },
      },
    };
    return {
      refs,
      emit: (message: unknown) => {
        for (const handler of handlers) handler(message);
      },
      released: () => released,
      watch: createTurnStartWatcher(paseo as never),
    };
  }
  const stream = (event: Record<string, unknown>) => ({
    agentId: "a1",
    event,
    timestamp: "2026-11-18T00:00:00.000Z",
    seq: 7,
    epoch: "e1",
  });

  it("reports a started turn and nothing else from the stream", () => {
    const timeline = fakeTimeline();
    let starts = 0;
    timeline.watch("a1", () => {
      starts += 1;
    });
    expect(timeline.refs).toEqual(["a1"]);
    timeline.emit(
      stream({
        type: "timeline",
        provider: "claude",
        item: { type: "assistant_message", text: "$x$", messageId: "m1" },
      }),
    );
    timeline.emit(stream({ type: "turn_completed", provider: "claude", turnId: "t1" }));
    timeline.emit({ agentId: "a1", event: { type: "replacement", epoch: "e2" } });
    timeline.emit({
      agentId: "a1",
      subscriptionId: "sub-1",
      event: { type: "subscription_restored" },
    });
    timeline.emit({ agentId: "a1", event: { type: "error", error: "lost" } });
    expect(starts).toBe(0);
    timeline.emit(stream({ type: "turn_started", provider: "claude", turnId: "t2" }));
    expect(starts).toBe(1);
  });

  it("releases the subscription when the watch stops", () => {
    const timeline = fakeTimeline();
    const stop = timeline.watch("a1", () => undefined);
    expect(timeline.released()).toBe(0);
    stop();
    expect(timeline.released()).toBe(1);
  });

  it("stays quiet when the subscription cannot be established", async () => {
    const timeline = fakeTimeline(Promise.reject(new Error("no such agent")));
    let starts = 0;
    const stop = timeline.watch("a1", () => {
      starts += 1;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(starts).toBe(0);
    stop();
  });
});

describe("createTimelineReader", () => {
  function fakePaseo(payload: { error: string | null } & Record<string, unknown>) {
    const seen: unknown[] = [];
    const paseo = {
      agents: {
        ref: () => ({
          timeline: {
            refetch: async (options: unknown) => {
              seen.push(options);
              return payload;
            },
          },
        }),
      },
    };
    return { seen, read: createTimelineReader(paseo as never) };
  }

  it("reads projected pages and rejects payload errors", async () => {
    const payload = {
      epoch: "e1",
      entries: agentic,
      startCursor: null,
      hasOlder: false,
      error: null as string | null,
    };
    const { seen, read } = fakePaseo(payload);
    expect((await read("a1", { direction: "tail" })).entries).toHaveLength(4);
    expect(seen).toEqual([{ direction: "tail", limit: 200, projection: "projected" }]);
    payload.error = "boom";
    await expect(read("a1", { direction: "tail" })).rejects.toThrow("boom");
  });

  it("round-trips the cursor into an older-page request", async () => {
    const { seen, read } = fakePaseo({
      epoch: "e1",
      entries: [],
      startCursor: null,
      hasOlder: false,
      error: null,
    });
    const cursor = { seq: 42 };
    await read("a1", { direction: "before", cursor });
    expect(seen).toEqual([{ direction: "before", limit: 200, projection: "projected", cursor }]);
    expect((seen[0] as { cursor: unknown }).cursor).toBe(cursor);
  });

  it("projects items down to the fields the index reads", async () => {
    const { read } = fakePaseo({
      epoch: "e1",
      entries: [
        {
          item: {
            type: "tool_call",
            name: "exec_command",
            agentMessage: { from: "peer" },
            detail: { output: "x".repeat(4096), unifiedDiff: "--- a\n+++ b" },
            output: "raw tool output",
          },
          turnId: "t1",
          timestamp: "2026-11-08T00:00:01.000Z",
          seqStart: 1,
        },
        {
          item: { type: "assistant_message", text: "$x$", messageId: "m", parts: [{ raw: true }] },
          turnId: "t1",
          timestamp: "2026-11-08T00:00:02.000Z",
          seqStart: 2,
        },
      ],
      startCursor: null,
      hasOlder: false,
      error: null,
    });
    const result = await read("a1", { direction: "tail" });
    expect(result.entries.map((entry) => entry.item)).toStrictEqual([
      { type: "tool_call", name: "exec_command", agentMessage: true },
      { type: "assistant_message", text: "$x$", messageId: "m" },
    ]);
  });
});

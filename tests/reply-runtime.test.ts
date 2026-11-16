import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSFORMER_ID } from "../client/reply-actions/decision.js";
import { createOwnershipDetector } from "../client/reply-actions/ownership.js";
import { createTimelineReader } from "../client/reply-actions/reader.js";
import { createReplyActionsRuntime } from "../client/reply-actions/runtime.js";
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
let reads = 0;
function start() {
  const client = fakeClient();
  const runtime = createReplyActionsRuntime({
    client: client as never,
    read: async () => {
      reads += 1;
      return page(agentic);
    },
    ownership,
    settings: moduleState,
  });
  return { client, runtime };
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
    expect(client.pills.get("original-view-a1")?.label).toBe("Original view · 1 turn");
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

describe("createTimelineReader", () => {
  it("reads projected pages and rejects payload errors", async () => {
    const seen: unknown[] = [];
    const payload = {
      epoch: "e1",
      entries: agentic,
      startCursor: null,
      hasOlder: false,
      error: null,
    };
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
    const read = createTimelineReader(paseo as never);
    expect((await read("a1", { direction: "tail" })).entries).toHaveLength(4);
    expect(seen).toEqual([{ direction: "tail", limit: 200, projection: "projected" }]);
    payload.error = "boom" as never;
    await expect(read("a1", { direction: "tail" })).rejects.toThrow("boom");
  });
});

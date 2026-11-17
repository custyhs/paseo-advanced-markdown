import { describe, expect, it } from "vitest";
import {
  computeCoOwnership,
  MIN_CO_OWNED_TEXT_LENGTH,
  turnRef,
} from "../client/reply-actions/co-ownership.js";
import { createOwnershipDetector } from "../client/reply-actions/ownership.js";
import { groupTurns, type TimelineEntryLike } from "../client/reply-actions/turns.js";
import { MAX_DOCUMENT } from "../shared/limits.js";
import { detectExtensions, shouldTakeOver } from "../shared/markdown/extensions.js";
import { replyEntry, toolEntry, userEntry } from "./helpers/timeline.js";

const LONG = "I will read the solver module and check how the loss is normalized first.";
const formulaTurn = (commentary: TimelineEntryLike) => [
  userEntry(1, "t1"),
  commentary,
  toolEntry(3, { turnId: "t1" }),
  replyEntry(4, "$E=mc^2$", { messageId: "f", turnId: "t1" }),
];
const run = (
  byAgent: Record<string, TimelineEntryLike[]>,
  handedBack: Record<string, string[]> = {},
  canRender: (text: string) => boolean = () => true,
) =>
  computeCoOwnership({
    turnsByAgent: new Map(
      Object.entries(byAgent).map(([agent, entries]) => [agent, groupTurns(entries)]),
    ),
    handedBackTurns: new Map(
      Object.entries(handedBack).map(([agent, ids]) => [agent, new Set(ids)]),
    ),
    isOwned: (text) => text.includes("$"),
    canRender,
    minTextLength: MIN_CO_OWNED_TEXT_LENGTH,
  });

describe("computeCoOwnership", () => {
  it("co-owns an id-keyed plain reply before a formula answer", () => {
    const result = run({
      a1: formulaTurn(replyEntry(2, "Checking.", { messageId: "c", turnId: "t1" })),
    });
    expect([...result.coOwned]).toEqual(["id:c"]);
    expect(result.unprotectedTurns.size).toBe(0);
  });

  it("co-owns a long unique text-keyed reply", () => {
    const result = run({ a1: formulaTurn(replyEntry(2, LONG, { turnId: "t1" })) });
    expect([...result.coOwned]).toEqual([`text:${LONG}`]);
  });

  it("leaves a short text-keyed reply native and marks the turn unprotected", () => {
    const result = run({
      a1: formulaTurn(replyEntry(2, "Let me check the tests.", { turnId: "t1" })),
    });
    expect(result.coOwned.size).toBe(0);
    expect([...result.unprotectedTurns]).toEqual([turnRef("a1", "t1")]);
  });

  it("refuses keys that repeat anywhere on the host", () => {
    const repeatedText = run({
      a1: formulaTurn(replyEntry(2, LONG, { turnId: "t1" })),
      a2: [userEntry(1, "u1"), replyEntry(2, LONG, { turnId: "u1" })],
    });
    expect(repeatedText.coOwned.size).toBe(0);
    expect([...repeatedText.unprotectedTurns]).toEqual([turnRef("a1", "t1")]);
    const repeatedId = run({
      a1: formulaTurn(replyEntry(2, "Checking.", { messageId: "dup", turnId: "t1" })),
      a2: [userEntry(1, "u1"), replyEntry(2, "Other", { messageId: "dup", turnId: "u1" })],
    });
    expect(repeatedId.coOwned.size).toBe(0);
  });

  it("skips handed-back turns", () => {
    const result = run(
      { a1: formulaTurn(replyEntry(2, "Checking.", { messageId: "c", turnId: "t1" })) },
      { a1: ["t1"] },
    );
    expect(result.coOwned.size).toBe(0);
    expect(result.unprotectedTurns.size).toBe(0);
  });

  it("co-owns before the last formula reply but never flags a turn that ends natively", () => {
    const result = run({
      a1: [
        userEntry(1, "t1"),
        replyEntry(2, "Short.", { turnId: "t1" }),
        replyEntry(3, "$x$", { messageId: "f", turnId: "t1" }),
        replyEntry(4, "Plain end.", { messageId: "p", turnId: "t1" }),
      ],
    });
    expect(result.coOwned.size).toBe(0);
    expect(result.unprotectedTurns.size).toBe(0);
  });

  it("never co-owns a reply the renderer cannot draw and flags the turn", () => {
    const unrenderable = `${LONG} ![screenshot](https://e/x.png)`;
    const result = run(
      { a1: formulaTurn(replyEntry(2, unrenderable, { messageId: "img", turnId: "t1" })) },
      {},
      (text) => !text.includes("!["),
    );
    expect(result.coOwned.size).toBe(0);
    expect([...result.unprotectedTurns]).toEqual([turnRef("a1", "t1")]);
  });

  it("never co-owns empty or whitespace replies", () => {
    const result = run({ a1: formulaTurn(replyEntry(2, "   ", { messageId: "w", turnId: "t1" })) });
    expect(result.coOwned.size).toBe(0);
    expect([...result.unprotectedTurns]).toEqual([turnRef("a1", "t1")]);
  });
});

describe("ownership detector canRender", () => {
  it("rejects oversized texts and unsupported content from the renderer", () => {
    const detector = createOwnershipDetector({ detectExtensions, shouldTakeOver });
    expect(detector.canRender("A plain commentary line.")).toBe(true);
    expect(detector.canRender("See ![screenshot](https://e/x.png) for the trace.")).toBe(false);
    expect(detector.canRender("a".repeat(MAX_DOCUMENT + 1))).toBe(false);
  });
});

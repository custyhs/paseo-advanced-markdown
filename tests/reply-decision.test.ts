import { describe, expect, it } from "vitest";
import {
  createReplyTransformer,
  decideReply,
  sameSnapshot,
  TRANSFORMER_ID,
  type DecisionSnapshot,
} from "../client/reply-actions/decision.js";
import { createOwnershipDetector } from "../client/reply-actions/ownership.js";
import { MAX_DOCUMENT } from "../shared/limits.js";
import { detectExtensions, shouldTakeOver } from "../shared/markdown/extensions.js";
import { MESSAGE_KIND, MESSAGE_VERSION, messageSchema } from "../shared/message.js";
import { DEFAULT_MODULE_SETTINGS } from "../shared/settings.js";

const ownership = createOwnershipDetector({ detectExtensions, shouldTakeOver });
const snapshot = (over: Partial<DecisionSnapshot> = {}): DecisionSnapshot => ({
  settings: DEFAULT_MODULE_SETTINGS,
  handedBack: new Set(),
  coOwned: new Set(),
  ...over,
});

describe("decideReply", () => {
  it("checks hand-back, then ownership, then co-ownership", () => {
    const formula = { text: "$E=mc^2$", messageId: "f" };
    expect(
      decideReply(formula, snapshot({ handedBack: new Set(["id:f"]) }), ownership),
    ).toBeUndefined();
    expect(decideReply(formula, snapshot(), ownership)).toBe("owned");
    expect(
      decideReply(
        { text: "Checking.", messageId: "c" },
        snapshot({ coOwned: new Set(["id:c"]) }),
        ownership,
      ),
    ).toBe("co-owned");
    expect(
      decideReply({ text: "Checking.", messageId: "c" }, snapshot(), ownership),
    ).toBeUndefined();
  });

  it("follows module settings and the document limit", () => {
    const mathOff = snapshot({ settings: { ...DEFAULT_MODULE_SETTINGS, math: false } });
    expect(decideReply({ text: "$x$" }, mathOff, ownership)).toBeUndefined();
    expect(
      decideReply({ text: `$x$${"a".repeat(MAX_DOCUMENT)}` }, snapshot(), ownership),
    ).toBeUndefined();
  });
});

describe("createReplyTransformer", () => {
  it("emits the reply's id, role and phase", () => {
    const transformer = createReplyTransformer(snapshot(), ownership);
    expect(transformer.id).toBe(TRANSFORMER_ID);
    expect(transformer.query.itemType).toBe("assistant_message");
    expect(
      transformer.transform({
        item: { type: "assistant_message", text: "$x$", messageId: "f" },
        phase: "complete",
      }),
    ).toEqual({
      items: [
        {
          type: "plugin",
          kind: MESSAGE_KIND,
          version: MESSAGE_VERSION,
          data: { text: "$x$", messageId: "f", role: "owned", phase: "complete" },
        },
      ],
      nativeTurnFooter: true,
    });
  });

  it("still accepts data saved before roles existed", () => {
    expect(messageSchema.parse({ text: "x" })).toEqual({ text: "x" });
  });
});

describe("sameSnapshot", () => {
  it("compares by content", () => {
    expect(
      sameSnapshot(
        snapshot({ handedBack: new Set(["a", "b"]) }),
        snapshot({ handedBack: new Set(["b", "a"]) }),
      ),
    ).toBe(true);
    expect(
      sameSnapshot(snapshot(), snapshot({ settings: { ...DEFAULT_MODULE_SETTINGS, math: false } })),
    ).toBe(false);
    expect(sameSnapshot(snapshot(), snapshot({ coOwned: new Set(["c"]) }))).toBe(false);
  });
});

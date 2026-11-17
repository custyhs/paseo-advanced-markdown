import { describe, expect, it } from "vitest";
import { isTextKey, replyKey } from "../client/reply-actions/keys.js";
import { groupTurns } from "../client/reply-actions/turns.js";
import { at, replyEntry, toolEntry, userEntry } from "./helpers/timeline.js";

describe("reply keys", () => {
  it("prefers the message id and falls back to the exact text", () => {
    expect(replyKey({ text: "Hi", messageId: "m1" })).toBe("id:m1");
    expect(replyKey({ text: "Hi" })).toBe("text:Hi");
    expect(replyKey({ text: "Hi", messageId: "" })).toBe("text:Hi");
    expect(isTextKey("text:Hi")).toBe(true);
    expect(isTextKey("id:m1")).toBe(false);
  });
});

describe("groupTurns", () => {
  it("groups by canonical turn id", () => {
    const turns = groupTurns([
      userEntry(1, "t1"),
      replyEntry(2, "Looking", { messageId: "a", turnId: "t1" }),
      toolEntry(3, { turnId: "t1" }),
      replyEntry(4, "$x$", { messageId: "b", turnId: "t1" }),
      userEntry(5, "t2"),
      replyEntry(6, "Done", { messageId: "c", turnId: "t2" }),
    ]);
    expect(turns.map((turn) => turn.id)).toEqual(["t1", "t2"]);
    expect(turns[0]!.replies.map((reply) => reply.key)).toEqual(["id:a", "id:b"]);
    expect(turns[0]!.endedAt).toBe(at(4));
  });

  it("starts turns at triggers when entries have no ids", () => {
    const turns = groupTurns([
      userEntry(1),
      replyEntry(2, "one"),
      toolEntry(3, { name: "heartbeat" }),
      replyEntry(4, "two"),
      toolEntry(5, { agentMessage: { from: "peer" } }),
      replyEntry(6, "three"),
    ]);
    expect(turns.map((turn) => turn.id)).toEqual(["seq:1", "seq:3", "seq:5"]);
    expect(turns.map((turn) => turn.replies.map((reply) => reply.text))).toEqual([
      ["one"],
      ["two"],
      ["three"],
    ]);
  });

  it("lets a trigger without an id join the ids that follow it", () => {
    const turns = groupTurns([
      userEntry(1),
      replyEntry(2, "a", { turnId: "t1" }),
      userEntry(3),
      replyEntry(4, "b", { turnId: "t2" }),
    ]);
    expect(turns.map((turn) => turn.id)).toEqual(["t1", "t2"]);
  });

  it("orders entries by seqStart before grouping", () => {
    const sorted = [userEntry(1, "t1"), replyEntry(2, "a", { turnId: "t1" })];
    expect(groupTurns([...sorted].reverse())).toEqual(groupTurns(sorted));
  });
});

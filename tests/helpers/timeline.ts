import type { TimelinePageLike } from "../../client/reply-actions/store.js";
import type { TimelineEntryLike } from "../../client/reply-actions/turns.js";

export const at = (seq: number) => new Date(Date.UTC(2026, 10, 8, 0, 0, seq)).toISOString();
export const userEntry = (seq: number, turnId?: string): TimelineEntryLike => ({
  item: { type: "user_message", text: "prompt" },
  ...(turnId ? { turnId } : {}),
  timestamp: at(seq),
  seqStart: seq,
});
export const replyEntry = (
  seq: number,
  text: string,
  options: { messageId?: string; turnId?: string } = {},
): TimelineEntryLike => ({
  item: {
    type: "assistant_message",
    text,
    ...(options.messageId ? { messageId: options.messageId } : {}),
  },
  ...(options.turnId ? { turnId: options.turnId } : {}),
  timestamp: at(seq),
  seqStart: seq,
});
export const toolEntry = (
  seq: number,
  options: { turnId?: string; name?: string; agentMessage?: unknown } = {},
): TimelineEntryLike => ({
  item: {
    type: "tool_call",
    name: options.name ?? "exec_command",
    ...(options.agentMessage !== undefined ? { agentMessage: options.agentMessage } : {}),
  },
  ...(options.turnId ? { turnId: options.turnId } : {}),
  timestamp: at(seq),
  seqStart: seq,
});

export const agentic = [
  userEntry(1, "t1"),
  replyEntry(2, "Checking first.", { messageId: "c", turnId: "t1" }),
  toolEntry(3, { turnId: "t1" }),
  replyEntry(4, "$E=mc^2$", { messageId: "f", turnId: "t1" }),
];
export const page = (
  entries: readonly TimelineEntryLike[],
  over: Partial<TimelinePageLike> = {},
): TimelinePageLike => ({
  epoch: "e1",
  entries,
  startCursor: { before: entries[0]?.seqStart ?? 0 },
  hasOlder: false,
  ...over,
});

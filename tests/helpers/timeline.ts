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

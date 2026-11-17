// Pure module: no React, React Native, or SDK runtime imports.

import { type ReplyKey, replyKey } from "./keys.js";

/** The slice of a projected daemon timeline entry that turn grouping reads. */
export interface TimelineEntryLike {
  readonly item: {
    readonly type: string;
    readonly text?: string;
    readonly messageId?: string;
    readonly name?: string;
    readonly agentMessage?: unknown;
  };
  readonly turnId?: string;
  readonly timestamp: string;
  readonly seqStart: number;
}

export interface IndexedReply {
  readonly key: ReplyKey;
  readonly text: string;
  readonly at: string;
}

export interface IndexedTurn {
  readonly id: string;
  readonly replies: readonly IndexedReply[];
  readonly endedAt: string;
}

/**
 * Mirrors `isTimelineTurnTrigger` in Paseo's packages/protocol/src/timeline-turn.ts:
 * a user message, or a tool call that carries an agent message or is the
 * `heartbeat` tool, opens a new turn.
 */
export function isTurnTrigger(item: TimelineEntryLike["item"]): boolean {
  if (item.type === "user_message") return true;
  if (item.type !== "tool_call") return false;
  return item.agentMessage !== undefined || item.name === "heartbeat";
}

/**
 * Mirrors `continuesTimelineTurn` there: canonical turn ids win when both
 * sides have one; otherwise fall back to the trigger heuristic.
 */
function startsTurn(previous: TimelineEntryLike, next: TimelineEntryLike): boolean {
  return previous.turnId !== undefined && next.turnId !== undefined
    ? previous.turnId !== next.turnId
    : isTurnTrigger(next.item);
}

/**
 * Groups timeline entries into turns the way the host renders them. Entries
 * are ordered by `seqStart` first (the input is not mutated); a turn's id is
 * the first defined `turnId` among its entries, else `seq:<seqStart>` of its
 * first entry.
 */
export function groupTurns(entries: readonly TimelineEntryLike[]): IndexedTurn[] {
  const ordered = [...entries].sort((a, b) => a.seqStart - b.seqStart);
  const groups: TimelineEntryLike[][] = [];
  for (const entry of ordered) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    if (previous === undefined || startsTurn(previous, entry)) groups.push([entry]);
    else current!.push(entry);
  }
  return groups.map((group) => {
    const replies: IndexedReply[] = [];
    for (const entry of group) {
      const { item } = entry;
      if (item.type !== "assistant_message" || typeof item.text !== "string") continue;
      replies.push({
        key: replyKey({ text: item.text, messageId: item.messageId }),
        text: item.text,
        at: entry.timestamp,
      });
    }
    return {
      id: group.find((entry) => entry.turnId !== undefined)?.turnId ?? `seq:${group[0]!.seqStart}`,
      replies,
      endedAt: group[group.length - 1]!.timestamp,
    };
  });
}

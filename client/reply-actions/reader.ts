// Pure module: no React, React Native, or SDK runtime imports.

import type { PluginClientContext } from "@getpaseo/plugin/client";
import { READ_PAGE_SIZE, type TimelineReader } from "./store.js";
import type { TimelineEntryLike } from "./turns.js";

type PaseoApiLike = PluginClientContext["paseo"];
type TimelineRefetchOptions = NonNullable<
  Parameters<ReturnType<PaseoApiLike["agents"]["ref"]>["timeline"]["refetch"]>[0]
>;

/**
 * Adapts the SDK timeline API to the store's reader. Reads are projected so
 * the indexed keys line up with the rows the host renders.
 */
export function createTimelineReader(paseo: PaseoApiLike): TimelineReader {
  return async (agentId, options) => {
    const request: TimelineRefetchOptions = {
      direction: options.direction,
      limit: READ_PAGE_SIZE,
      projection: "projected",
    };
    if (options.direction === "before") {
      // The cursor round-trips from a previous page's `startCursor`; the
      // store holds it opaquely, so it narrows back to the SDK type here.
      request.cursor = options.cursor as TimelineRefetchOptions["cursor"];
    }
    const payload = await paseo.agents.ref(agentId).timeline.refetch(request);
    if (payload.error !== null) throw new Error(payload.error);
    return {
      epoch: payload.epoch,
      entries: payload.entries.map((entry) => {
        // Project the item down to the fields turn grouping reads, so tool
        // outputs, diffs and other detail never sit in the index. The
        // protocol widens tool-call fields through an index signature, so
        // the source is read through the index's slice type.
        const source = entry.item as TimelineEntryLike["item"];
        const item: TimelineEntryLike["item"] = {
          type: source.type,
          ...(typeof source.messageId === "string" ? { messageId: source.messageId } : {}),
          ...(typeof source.name === "string" ? { name: source.name } : {}),
          // The turn rule only tests presence, so a marker replaces the message.
          ...(source.agentMessage !== undefined ? { agentMessage: true } : {}),
          ...(source.type === "assistant_message" && typeof source.text === "string"
            ? { text: source.text }
            : {}),
        };
        return { item, turnId: entry.turnId, timestamp: entry.timestamp, seqStart: entry.seqStart };
      }),
      startCursor: payload.startCursor,
      hasOlder: payload.hasOlder,
    };
  };
}

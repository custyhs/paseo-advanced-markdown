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
      entries: payload.entries.map((entry) => ({
        // The protocol widens tool-call fields through an index signature, so
        // the union does not assign to the index's slice; turn grouping
        // re-guards every field it reads from `item`.
        item: entry.item as TimelineEntryLike["item"],
        turnId: entry.turnId,
        timestamp: entry.timestamp,
        seqStart: entry.seqStart,
      })),
      startCursor: payload.startCursor,
      hasOlder: payload.hasOlder,
    };
  };
}

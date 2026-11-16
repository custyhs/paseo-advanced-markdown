// Pure module: no React, React Native, or SDK runtime imports.

import type { PluginTimelineTransformResult } from "@getpaseo/plugin";
import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import {
  MESSAGE_KIND,
  MESSAGE_VERSION,
  type MessageData,
  type ReplyRole,
} from "../../shared/message.js";
import type { ModuleSettings } from "../../shared/settings.js";
import { type ReplyKey, replyKey } from "./keys.js";
import type { OwnershipDetector } from "./ownership.js";

export const TRANSFORMER_ID = "assistant-advanced-markdown";

/**
 * Everything one transformer registration decides from. Registration replaces
 * the whole transformer when a new snapshot differs, so a registered
 * transformer never sees state move under it.
 */
export interface DecisionSnapshot {
  readonly settings: ModuleSettings;
  readonly handedBack: ReadonlySet<ReplyKey>;
  readonly coOwned: ReadonlySet<ReplyKey>;
}

function sameSet(a: ReadonlySet<ReplyKey>, b: ReadonlySet<ReplyKey>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) {
    if (!b.has(key)) return false;
  }
  return true;
}

export function sameSnapshot(a: DecisionSnapshot, b: DecisionSnapshot): boolean {
  // Iterate the fields of both objects so a future ModuleSettings field
  // cannot be forgotten here.
  for (const key of new Set([...Object.keys(a.settings), ...Object.keys(b.settings)])) {
    const field = key as keyof ModuleSettings;
    if (a.settings[field] !== b.settings[field]) return false;
  }
  return sameSet(a.handedBack, b.handedBack) && sameSet(a.coOwned, b.coOwned);
}

/** Hand-back beats ownership, ownership beats co-ownership. */
export function decideReply(
  reply: { text: string; messageId?: string },
  snapshot: DecisionSnapshot,
  ownership: OwnershipDetector,
): ReplyRole | undefined {
  const key = replyKey(reply);
  if (snapshot.handedBack.has(key)) return undefined;
  if (ownership.isOwned(reply.text, snapshot.settings)) return "owned";
  if (snapshot.coOwned.has(key)) return "co-owned";
  return undefined;
}

/**
 * SDK 0.13.0's result type predates the host-footer opt-in, so `transform`
 * builds its result as a value of this wider type; the value is assignable to
 * the SDK result type without the excess-property check a literal would hit.
 */
export type HostFooterTransformResult = PluginTimelineTransformResult & {
  nativeTurnFooter: true;
};

export function createReplyTransformer(
  snapshot: DecisionSnapshot,
  ownership: OwnershipDetector,
): PluginTimelineTransformerContribution<"assistant_message"> {
  return {
    id: TRANSFORMER_ID,
    query: { itemType: "assistant_message" },
    transform({ item, phase }) {
      const role = decideReply(item, snapshot, ownership);
      if (role === undefined) return undefined;
      // The index signature keeps every present field JSON-safe: MessageData
      // alone types its optional fields `string | undefined`, and `undefined`
      // is not assignable to the SDK's PluginTimelineData.
      const data: MessageData & Record<string, string> = { text: item.text, role, phase };
      if (item.messageId !== undefined) data.messageId = item.messageId;
      const result: HostFooterTransformResult = {
        items: [{ type: "plugin", kind: MESSAGE_KIND, version: MESSAGE_VERSION, data }],
        // getpaseo/paseo#9253's host-footer opt-in; released hosts drop the field.
        nativeTurnFooter: true,
      };
      return result;
    },
  };
}

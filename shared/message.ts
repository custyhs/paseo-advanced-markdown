import { z } from "zod";

/** Renderer kind and contract version registered by the client entry. */
export const MESSAGE_KIND = "advanced-markdown";
export const MESSAGE_VERSION = 1;

/** How the plugin came to render a reply. A missing `role` means owned. */
export const REPLY_ROLES = ["owned", "co-owned"] as const;
export type ReplyRole = (typeof REPLY_ROLES)[number];

/**
 * The plugin item carries the host's source item text unchanged. Module state
 * is read from host settings at render time, so a settings change does not
 * rewrite history or change item identity. `messageId`, `role` and `phase`
 * are optional so data saved before fork-safe replies still validates under
 * version 1.
 */
export const messageSchema = z.object({
  text: z.string(),
  messageId: z.string().optional(),
  role: z.enum(REPLY_ROLES).optional(),
  phase: z.enum(["streaming", "complete"]).optional(),
});
export type MessageData = z.infer<typeof messageSchema>;

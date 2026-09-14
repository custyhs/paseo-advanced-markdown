import { z } from "zod";

/** Renderer kind and contract version registered by the client entry. */
export const MESSAGE_KIND = "advanced-markdown";
export const MESSAGE_VERSION = 1;

/**
 * The plugin item carries the host's source item text unchanged. Module state
 * is read from host settings at render time, so a settings change does not
 * rewrite history or change item identity.
 */
export const messageSchema = z.object({
  text: z.string(),
});
export type MessageData = z.infer<typeof messageSchema>;

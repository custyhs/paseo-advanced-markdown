// Pure module: no React, React Native, or SDK runtime imports.

/**
 * Stable identity for an assistant reply. Daemons that assign message ids get
 * `id:<messageId>`; replies without one fall back to `text:<text>` with the
 * exact, untrimmed text, so the key round-trips to the rendered content.
 */
export type ReplyKey = string;

export function replyKey(reply: { text: string; messageId?: string }): ReplyKey {
  return reply.messageId ? `id:${reply.messageId}` : `text:${reply.text}`;
}

export function isTextKey(key: ReplyKey): boolean {
  return key.startsWith("text:");
}

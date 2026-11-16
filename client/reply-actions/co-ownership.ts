// Pure module: no React, React Native, or SDK runtime imports.

import { isTextKey, type ReplyKey } from "./keys.js";
import type { IndexedTurn } from "./turns.js";

/**
 * A text-keyed reply qualifies for co-ownership only when its trimmed text is
 * at least this long; shorter texts repeat too easily to be stable keys.
 */
export const MIN_CO_OWNED_TEXT_LENGTH = 40;

/** Identifies one agent's turn; `\u0000` keeps the two ids from colliding. */
export function turnRef(agentId: string, turnId: string): string {
  return `${agentId}\u0000${turnId}`;
}

export interface CoOwnershipInput {
  readonly turnsByAgent: ReadonlyMap<string, readonly IndexedTurn[]>;
  /** Turn ids per agent whose replies were handed back to the host. */
  readonly handedBackTurns: ReadonlyMap<string, ReadonlySet<string>>;
  readonly isOwned: (text: string) => boolean;
  readonly minTextLength: number;
}

export interface CoOwnership {
  readonly coOwned: ReadonlySet<ReplyKey>;
  /** `turnRef` values for turns with a plain reply the plugin could not claim. */
  readonly unprotectedTurns: ReadonlySet<string>;
}

/**
 * Decides which plain replies the plugin claims alongside the owned ones it
 * already renders. When the plugin owns a turn's last reply, the host anchors
 * its turn footer to the latest reply it still renders natively — an earlier
 * plain reply mid-turn — so those plain replies are co-owned too. A reply is
 * claimable only when its key counts once across every loaded agent's turns
 * (handed-back turns included in the count) and its text passes the length
 * rule for text keys; a turn that ends owned but keeps an unclaimable plain
 * reply is reported in `unprotectedTurns`. Plain replies after the last owned
 * reply stay native: the host's footer already lands below them.
 */
export function computeCoOwnership(input: CoOwnershipInput): CoOwnership {
  const counts = new Map<ReplyKey, number>();
  for (const turns of input.turnsByAgent.values()) {
    for (const turn of turns) {
      for (const reply of turn.replies) {
        counts.set(reply.key, (counts.get(reply.key) ?? 0) + 1);
      }
    }
  }
  const coOwned = new Set<ReplyKey>();
  const unprotectedTurns = new Set<string>();
  for (const [agentId, turns] of input.turnsByAgent) {
    const handedBack = input.handedBackTurns.get(agentId);
    for (const turn of turns) {
      if (handedBack?.has(turn.id)) continue;
      const last = turn.replies.findLastIndex((reply) => input.isOwned(reply.text));
      if (last < 0) continue;
      const finalOwned = last === turn.replies.length - 1;
      for (const reply of turn.replies.slice(0, last)) {
        if (input.isOwned(reply.text)) continue;
        const trimmed = reply.text.trim().length;
        const eligible =
          counts.get(reply.key) === 1 &&
          trimmed > 0 &&
          (!isTextKey(reply.key) || trimmed >= input.minTextLength);
        if (eligible) coOwned.add(reply.key);
        else if (finalOwned) unprotectedTurns.add(turnRef(agentId, turn.id));
      }
    }
  }
  return { coOwned, unprotectedTurns };
}

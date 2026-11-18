// Pure module: no React, React Native, or SDK runtime imports.

import type { PluginClientContext } from "@getpaseo/plugin/client";

type PaseoApiLike = PluginClientContext["paseo"];

/** Calls `onTurnStart` when the agent starts a turn; the returned function stops watching. */
export type TurnStartWatcher = (agentId: string, onTurnStart: () => void) => () => void;

/**
 * Watches an agent's live timeline for the daemon's `turn_started` event.
 * The subscription delivers live events only, so turns that began before the
 * watch never report. Best effort: when the subscription cannot be
 * established nothing is reported, and the turn's pill still restores it.
 */
export function createTurnStartWatcher(paseo: PaseoApiLike): TurnStartWatcher {
  return (agentId, onTurnStart) => {
    const subscription = paseo.agents.ref(agentId).timeline.subscribe((message) => {
      if (message.event.type === "turn_started") onTurnStart();
    });
    subscription.ready.catch(() => undefined);
    return subscription;
  };
}

// Pure module: no React, React Native, or SDK runtime imports.

import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { ModuleSettings } from "../../shared/settings.js";
import { createReplyTransformer, type DecisionSnapshot, sameSnapshot } from "./decision.js";
import type { ReplyKey } from "./keys.js";
import type { OwnershipDetector } from "./ownership.js";
import { createReplyActionsStore, type ReplyActionsStore, type TimelineReader } from "./store.js";
import { createOriginalViewPills } from "./pills.js";
import type { TurnStartWatcher } from "./turn-watch.js";

/** One frame: a burst of notifications collapses into one re-registration. */
const COALESCE_MS = 16;

export interface ReplyActionsRuntime {
  readonly store: ReplyActionsStore;
  /** Hands the turn holding this key back to the host and syncs the agent's pill. */
  showOriginal(agentId: string, key: ReplyKey, workspaceId: string | null): Promise<boolean>;
  /** Returns the agent's handed-back turns to plugin rendering and drops its pill. */
  restore(agentId: string): void;
  /**
   * A row whose props carry `nativeTurnFooter: true` reports it here: the
   * host draws its own turn footers (getpaseo/paseo#9253), so hand-back,
   * co-ownership and index reads stay off for the rest of the session.
   */
  noteHostNativeFooter(): void;
  readonly hostNativeFooter: boolean;
  dispose(): void;
}

/**
 * Owns the turn index store and the registered reply transformer. The
 * transformer decides from an immutable snapshot, so the runtime re-registers
 * it — coalesced to one `setTimeout` per burst — whenever a store or settings
 * change would alter the snapshot. Written without a class: client bundles
 * are evaluated by Hermes on Android, where runtime class syntax in evaluated
 * code has failed before.
 */
export function createReplyActionsRuntime(options: {
  client: Pick<PluginClientContext, "addTimelineTransformer" | "addComposerPill">;
  read: TimelineReader;
  ownership: OwnershipDetector;
  settings: { readonly current: ModuleSettings; subscribe(listener: () => void): () => void };
  watchTurnStart: TurnStartWatcher;
}): ReplyActionsRuntime {
  const { client, ownership, settings } = options;
  const pills = createOriginalViewPills(client);
  /** Agents whose pill was added; store changes drop the ones restored elsewhere. */
  const pillAgents = new Set<string>();
  /** One turn-start watch per agent with handed-back turns, keyed by agent. */
  const turnWatches = new Map<string, () => void>();
  let hostNativeFooter = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const store = createReplyActionsStore({
    read: options.read,
    isOwned: (text) => ownership.isOwned(text, settings.current),
    canRender: (text) => ownership.canRender(text),
  });

  function enabledNow(): boolean {
    return settings.current.forkSafeReplies && !hostNativeFooter;
  }

  function snapshotNow(): DecisionSnapshot {
    return {
      // `forkSafeReplies` here is the effective value — the stored setting
      // and no host-native footer report — not the stored setting itself, so
      // a #9253 host re-registers the transformer like a settings change.
      settings: { ...settings.current, forkSafeReplies: enabledNow() },
      ...store.decisionInputs(),
    };
  }

  function register(snapshot: DecisionSnapshot): { snapshot: DecisionSnapshot; remove(): void } {
    return {
      snapshot,
      remove: client.addTimelineTransformer(createReplyTransformer(snapshot, ownership)),
    };
  }

  store.setEnabled(enabledNow());
  let registered = register(snapshotNow());

  function scheduleUpdate(): void {
    if (disposed || timer !== null) return;
    if (sameSnapshot(registered.snapshot, snapshotNow())) return;
    timer = setTimeout(() => {
      timer = null;
      const next = snapshotNow();
      if (sameSnapshot(registered.snapshot, next)) return;
      registered.remove();
      registered = register(next);
    }, COALESCE_MS);
  }

  function syncPill(agentId: string, workspaceId: string | null): void {
    const count = store.originalTurnCount(agentId);
    pills.sync(agentId, workspaceId, count, () => restore(agentId));
    if (count === 0) pillAgents.delete(agentId);
    else if (workspaceId !== null) pillAgents.add(agentId);
  }

  function restore(agentId: string): void {
    store.restore(agentId);
    syncPill(agentId, null);
  }

  /**
   * The original view exists to reach Paseo's Fork, so it ends when the
   * agent starts its next turn: watch each agent only while it has
   * handed-back turns.
   */
  function syncTurnWatches(listed: ReadonlySet<string>): void {
    for (const [agentId, stop] of [...turnWatches]) {
      if (listed.has(agentId)) continue;
      turnWatches.delete(agentId);
      stop();
    }
    for (const agentId of listed) {
      if (turnWatches.has(agentId)) continue;
      let stop: () => void;
      try {
        stop = options.watchTurnStart(agentId, () => restore(agentId));
      } catch {
        // Best effort: without a watch the turn's pill still restores it.
        stop = () => undefined;
      }
      turnWatches.set(agentId, stop);
    }
  }

  const unsubscribeStore = store.subscribe(() => {
    const listed = new Set(store.agentsWithOriginalView());
    for (const agentId of [...pillAgents]) {
      if (!listed.has(agentId)) syncPill(agentId, null);
    }
    syncTurnWatches(listed);
    scheduleUpdate();
  });
  const unsubscribeSettings = settings.subscribe(() => {
    store.setEnabled(enabledNow());
    store.ownershipChanged();
    scheduleUpdate();
  });

  return {
    store,
    get hostNativeFooter() {
      return hostNativeFooter;
    },
    async showOriginal(agentId, key, workspaceId) {
      const shown = await store.showOriginal(agentId, key);
      syncPill(agentId, workspaceId);
      return shown;
    },
    restore,
    noteHostNativeFooter() {
      if (disposed || hostNativeFooter) return;
      hostNativeFooter = true;
      store.setEnabled(false);
      store.ownershipChanged();
      scheduleUpdate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      unsubscribeSettings();
      unsubscribeStore();
      for (const stop of turnWatches.values()) stop();
      turnWatches.clear();
      registered.remove();
      pills.dispose();
      store.dispose();
      hostNativeFooter = false;
    },
  };
}

/**
 * The bundle is evaluated once per host, so this holder is per host. Reply
 * rows and footers run outside the setup closure and reach the active
 * runtime through it.
 */
let activeRuntime: ReplyActionsRuntime | null = null;

export function setReplyActionsRuntime(runtime: ReplyActionsRuntime | null): void {
  activeRuntime = runtime;
}

export function getReplyActionsRuntime(): ReplyActionsRuntime | null {
  return activeRuntime;
}

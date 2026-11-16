// Pure module: no React, React Native, or SDK runtime imports.

import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { ModuleSettings } from "../../shared/settings.js";
import { createReplyTransformer, type DecisionSnapshot, sameSnapshot } from "./decision.js";
import type { ReplyKey } from "./keys.js";
import type { OwnershipDetector } from "./ownership.js";
import { createReplyActionsStore, type ReplyActionsStore, type TimelineReader } from "./store.js";
import { createOriginalViewPills } from "./pills.js";

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
}): ReplyActionsRuntime {
  const { client, ownership, settings } = options;
  const pills = createOriginalViewPills(client);
  /** Agents whose pill was added; store changes drop the ones restored elsewhere. */
  const pillAgents = new Set<string>();
  let hostNativeFooter = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const store = createReplyActionsStore({
    read: options.read,
    isOwned: (text) => ownership.isOwned(text, settings.current),
  });

  function enabledNow(): boolean {
    return settings.current.forkSafeReplies && !hostNativeFooter;
  }

  function snapshotNow(): DecisionSnapshot {
    return {
      // The snapshot carries the effective fork-safe value, so a host-native
      // footer report re-registers the transformer like a settings change.
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

  const unsubscribeStore = store.subscribe(() => {
    const listed = new Set(store.agentsWithOriginalView());
    for (const agentId of [...pillAgents]) {
      if (!listed.has(agentId)) syncPill(agentId, null);
    }
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

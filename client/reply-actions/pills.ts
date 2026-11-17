// Pure module: no React, React Native, or SDK runtime imports.

import type { PluginClientContext } from "@getpaseo/plugin/client";

type PillRegistration = ReturnType<PluginClientContext["addComposerPill"]>;

/** One composer pill per agent while that agent has handed-back turns. */
export interface OriginalViewPills {
  sync(agentId: string, workspaceId: string | null, count: number, onRestore: () => void): void;
  dispose(): void;
}

function pillLabel(count: number): string {
  return count === 1 ? "Original view · 1 turn" : `Original view · ${count} turns`;
}

/**
 * `addComposerPill` is read only when a pill is first added, never during
 * setup: harness clients may not provide it. Written without a class: client
 * bundles are evaluated by Hermes on Android, where runtime class syntax in
 * evaluated code has failed before.
 */
export function createOriginalViewPills(client: {
  addComposerPill: PluginClientContext["addComposerPill"];
}): OriginalViewPills {
  const registrations = new Map<string, PillRegistration>();
  let disposed = false;
  return {
    sync(agentId, workspaceId, count, onRestore) {
      if (disposed) return;
      const existing = registrations.get(agentId);
      if (count <= 0) {
        if (existing !== undefined) {
          existing.remove();
          registrations.delete(agentId);
        }
        return;
      }
      const label = pillLabel(count);
      if (existing !== undefined) {
        existing.update({ label });
        return;
      }
      // Hand-backs live in memory, so a reload restores the turns anyway;
      // without a workspace there is no composer to anchor the pill to.
      if (workspaceId === null) return;
      registrations.set(
        agentId,
        client.addComposerPill({
          id: `original-view-${agentId}`,
          workspaceId,
          agentId,
          button: {
            title: "Restore formula rendering",
            label,
            icon: "Sigma",
            behavior: { kind: "action", onPress: onRestore },
          },
        }),
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const registration of registrations.values()) registration.remove();
      registrations.clear();
    },
  };
}

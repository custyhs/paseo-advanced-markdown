import { DEFAULT_MODULE_SETTINGS, type ModuleSettings } from "../shared/settings.js";

/**
 * Latest known host settings for this installation. The timeline transformer
 * runs synchronously outside React, so it reads this snapshot; rendered items
 * and the settings screen keep it current through the reactive settings hook.
 * Written without a class: client bundles are evaluated by Hermes on Android,
 * where runtime class syntax in evaluated code has failed before.
 */
interface ModuleStateApi {
  readonly current: ModuleSettings;
  set(values: ModuleSettings): void;
  subscribe(listener: () => void): () => void;
  reset(): void;
}

function createModuleState(): ModuleStateApi {
  let current = DEFAULT_MODULE_SETTINGS;
  const listeners = new Set<() => void>();
  return {
    get current() {
      return current;
    },
    set(values) {
      if (
        values.math === current.math &&
        values.mermaid === current.mermaid &&
        values.fontScale === current.fontScale
      )
        return;
      current = values;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      current = DEFAULT_MODULE_SETTINGS;
      listeners.clear();
    },
  };
}

export const moduleState = createModuleState();

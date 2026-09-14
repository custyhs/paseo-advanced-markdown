import os from "node:os";
import path from "node:path";

/**
 * Stable per-user directory for the Mermaid worker runtime and its browser.
 * It lives outside Paseo's managed plugin checkouts, which move from a staging
 * directory to a versioned directory on activation, so nothing in this plugin
 * depends on the checkout path after preparation. Shared by the preparation
 * script (plain Node) and the daemon-side runtime (bundled TypeScript).
 */
export function resolveCacheRoot(env = process.env, platform = process.platform) {
  const override = env.PASEO_ADVANCED_MARKDOWN_CACHE;
  if (override && override.trim()) return path.resolve(override);
  if (platform === "win32") {
    const base = env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "paseo-advanced-markdown");
  }
  const base = env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(base, "paseo-advanced-markdown");
}

export function cacheLayout(root) {
  return {
    root,
    browsers: path.join(root, "browsers"),
    workers: path.join(root, "worker"),
    manifest: path.join(root, "manifest.json"),
  };
}

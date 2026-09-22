import os from "node:os";
import path from "node:path";

/**
 * Stable per-user directory for renderer assets, the Mermaid worker and browser.
 * It lives outside Paseo's managed plugin checkouts, which move from a staging
 * directory to a versioned directory on activation, so nothing in this plugin
 * depends on the checkout path after preparation. Shared by the preparation
 * script (plain Node) and the daemon-side runtime (bundled TypeScript).
 */
export function resolveCacheRoot(env = process.env, platform = process.platform) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const isAbsolute = (value) =>
    typeof value === "string" &&
    paths.isAbsolute(value) &&
    // A Windows root without a drive still depends on the process's current
    // drive, which can differ between the staging checkout and the daemon.
    (platform !== "win32" || paths.parse(value).root.length > 1);
  const override = env.PASEO_ADVANCED_MARKDOWN_CACHE;
  if (override?.trim()) {
    if (!isAbsolute(override))
      throw new Error("PASEO_ADVANCED_MARKDOWN_CACHE must be an absolute path");
    return paths.normalize(override);
  }
  if (platform === "win32") {
    const base = isAbsolute(env.LOCALAPPDATA)
      ? env.LOCALAPPDATA
      : paths.join(os.homedir(), "AppData", "Local");
    return paths.join(base, "paseo-advanced-markdown");
  }
  const base = isAbsolute(env.XDG_CACHE_HOME)
    ? env.XDG_CACHE_HOME
    : paths.join(os.homedir(), ".cache");
  return paths.join(base, "paseo-advanced-markdown");
}

export function cacheLayout(root) {
  return {
    root,
    assets: path.join(root, "assets"),
    browsers: path.join(root, "browsers"),
    workers: path.join(root, "worker"),
    manifest: path.join(root, "manifest.json"),
  };
}

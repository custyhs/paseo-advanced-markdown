export function resolveCacheRoot(
  env?: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform,
): string;
export function cacheLayout(root: string): {
  root: string;
  browsers: string;
  workers: string;
  manifest: string;
};

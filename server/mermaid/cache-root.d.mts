export function resolveCacheRoot(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string;
export function cacheLayout(root: string): {
  root: string;
  assets: string;
  browsers: string;
  workers: string;
  manifest: string;
};

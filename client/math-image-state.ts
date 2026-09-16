import type { MathRenderOutput } from "../shared/rpc.js";
import type { CachedRender } from "./render-cache.js";

export type MathImageState = {
  identity: string;
  result: CachedRender<MathRenderOutput>;
};

/** Keep readable detail during upgrades, but never reuse another host/theme/expression. */
export function retainedMathImage(
  identity: string,
  latest: CachedRender<MathRenderOutput> | undefined,
  previous?: MathImageState,
): CachedRender<MathRenderOutput> | undefined {
  if (latest?.ok) {
    if (
      previous?.identity === identity &&
      previous.result?.ok &&
      (previous.result.density ?? 2) > (latest.density ?? 2)
    )
      return previous.result;
    return latest;
  }
  if (previous?.identity === identity && previous.result?.ok) return previous.result;
  return latest;
}

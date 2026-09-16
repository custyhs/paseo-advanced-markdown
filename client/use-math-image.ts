import { useRpc } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_MATH_EXPRESSION } from "../shared/limits.js";
import {
  isRetryableMathResult,
  renderMath,
  type MathRenderInput,
  type MathRenderOutput,
} from "../shared/rpc.js";
import { retainedMathImage, type MathImageState } from "./math-image-state.js";
import {
  forgetRender,
  peekRender,
  renderKey,
  requestRender,
  type CachedRender,
} from "./render-cache.js";

export function useMathImage({
  expression,
  display,
  color,
  hostId,
  enabled,
  density,
  seed,
}: MathRenderInput & {
  hostId: string;
  enabled: boolean;
  seed?: Extract<MathRenderOutput, { ok: true }>;
}) {
  const call = useRpc(renderMath);
  const callRef = useRef(call);
  callRef.current = call;
  const identity = renderKey("math", hostId, { expression, display, color });
  const key = renderKey("math", hostId, { expression, display, color, density: density ?? 2 });
  const [settled, setSettled] = useState<{ key: string; result: CachedRender<MathRenderOutput> }>();
  const [previous, setPrevious] = useState<MathImageState | undefined>(
    seed ? { identity, result: seed } : undefined,
  );
  const [attempt, setAttempt] = useState(0);
  const eligible = enabled && expression.length > 0 && expression.length <= MAX_MATH_EXPRESSION;
  const latest = settled?.key === key ? settled.result : peekRender<MathRenderOutput>(key);
  const result = retainedMathImage(identity, latest, previous);

  const sufficient =
    previous?.identity === identity &&
    previous.result?.ok &&
    (previous.result.density ?? 2) >= (density ?? 2);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries the same input after clearing its failed cache entry.
  useEffect(() => {
    if (!eligible || sufficient) return;
    let current = true;
    void requestRender<MathRenderInput, MathRenderOutput>(
      key,
      { expression, display, color, density: density ?? 2 },
      callRef.current,
      {
        retryableReasons: isRetryableMathResult,
      },
    ).then((next) => {
      if (!current) return;
      setSettled({ key, result: next });
      if (next?.ok) setPrevious({ identity, result: next });
    });
    return () => {
      current = false;
    };
  }, [key, identity, expression, display, color, density, eligible, sufficient, attempt]);

  const retry = useCallback(() => {
    forgetRender(key);
    setSettled(undefined);
    setPrevious(undefined);
    setAttempt((value) => value + 1);
  }, [key]);
  return {
    key,
    identity,
    eligible,
    result,
    retry,
    upgrading: result?.ok && !sufficient && latest === undefined,
    retryableDetail:
      result?.ok && (latest === null || (latest && !latest.ok && isRetryableMathResult(latest))),
    limited:
      result?.ok && latest !== undefined && (!latest?.ok || (latest.density ?? 2) < (density ?? 2)),
  };
}

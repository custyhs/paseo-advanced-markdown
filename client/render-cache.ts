// Adapted from paseo-math (Apache-2.0), client/render-cache.ts at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
// Changes: generalized to any image RPC so math and Mermaid share one bounded
// client cache; a retryable failure can be forgotten explicitly.
import { IMAGE_CACHE_BYTES, IMAGE_CACHE_ENTRIES } from "../shared/limits.js";

export type ImageResult = { ok: true; png: string } | { ok: false };
export type RenderCall<Input, Output extends ImageResult> = (input: Input) => Promise<Output>;
/** null means the transport failed: retryable, unlike a deterministic renderer failure. */
export type CachedRender<Output extends ImageResult> = Output | null;

type Entry<Output extends ImageResult> = {
  promise: Promise<CachedRender<Output>>;
  result?: CachedRender<Output>;
  bytes: number;
  expires: number;
};

const MAX_ACTIVE = 4;
// A long proof can mount hundreds of formulas in one render. Keep the queue
// bounded, but large enough that valid formulas do not permanently fall back
// to source merely because the four RPC slots were busy during that mount.
const MAX_QUEUED = 512;
const entries = new Map<string, Entry<ImageResult>>();
const queue: Array<() => void> = [];
let active = 0;
let bytes = 0;
let completed = 0;

export function renderKey(namespace: string, hostId: string, input: unknown): string {
  return JSON.stringify([namespace, hostId, input]);
}

function remove(key: string, entry: Entry<ImageResult>): void {
  entries.delete(key);
  if (entry.result !== undefined) {
    completed--;
    bytes -= entry.bytes;
  }
}

function get(key: string): Entry<ImageResult> | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) {
    remove(key, entry);
    return undefined;
  }
  entries.delete(key);
  entries.set(key, entry);
  return entry;
}

function trim(): void {
  for (const [key, entry] of entries) {
    if (completed <= IMAGE_CACHE_ENTRIES && bytes <= IMAGE_CACHE_BYTES) break;
    // Never evict in-flight work: remounts must share the same request.
    if (entry.result !== undefined) remove(key, entry);
  }
}

export function peekRender<Output extends ImageResult>(
  key: string,
): CachedRender<Output> | undefined {
  return get(key)?.result as CachedRender<Output> | undefined;
}

/** Drops a settled entry so the next request runs again (user retry). */
export function forgetRender(key: string): void {
  const entry = entries.get(key);
  if (entry && entry.result !== undefined) remove(key, entry);
}

export function clearRenderCache(): void {
  for (const [key, entry] of entries) if (entry.result !== undefined) remove(key, entry);
}

export function requestRender<Input, Output extends ImageResult>(
  key: string,
  input: Input,
  call: RenderCall<Input, Output>,
  options: { retryableReasons?: (result: Output) => boolean } = {},
): Promise<CachedRender<Output>> {
  const existing = get(key);
  if (existing) return existing.promise as Promise<CachedRender<Output>>;
  if (active >= MAX_ACTIVE && queue.length >= MAX_QUEUED) {
    return Promise.resolve(null);
  }

  let resolve!: (result: CachedRender<Output>) => void;
  const entry: Entry<Output> = {
    promise: new Promise<CachedRender<Output>>((done) => {
      resolve = done;
    }),
    bytes: key.length * 2,
    expires: Infinity,
  };
  entries.set(key, entry as Entry<ImageResult>);
  // Pending work has its own active/queue bounds, not completed-cache capacity.

  const run = () => {
    active++;
    // Catch synchronous host errors as well as transport rejections.
    Promise.resolve()
      .then(() => call(input))
      .then(
        (result) => finish(result),
        () => finish(null),
      );
  };
  const finish = (result: CachedRender<Output>) => {
    entry.result = result;
    // Transport failures and retryable renderer failures expire; malformed
    // input is deterministic and stays until evicted.
    const retryable =
      result === null || (!result.ok && options.retryableReasons?.(result) === true);
    entry.expires = retryable ? Date.now() + 30_000 : Infinity;
    const added = result?.ok ? result.png.length * 2 : 0;
    entry.bytes += added;
    completed++;
    bytes += entry.bytes;
    active--;
    trim();
    resolve(result);
    queue.shift()?.();
  };
  if (active < MAX_ACTIVE) run();
  else queue.push(run);
  return entry.promise;
}

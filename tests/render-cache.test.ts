import { describe, expect, it } from "vitest";
import {
  clearRenderCache,
  forgetRender,
  peekRender,
  renderKey,
  requestRender,
  type ImageResult,
} from "../client/render-cache.js";

type Output = ({ ok: true; png: string } | { ok: false; reason: "invalid" | "busy" }) & ImageResult;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("client render cache", () => {
  it("deduplicates identical requests and separates hosts and modules", async () => {
    clearRenderCache();
    let calls = 0;
    const call = async () => {
      calls++;
      return { ok: true, png: "AAAA" } as Output;
    };
    const key = renderKey("math", "host-a", { expression: "x", display: false, color: "#000" });
    const [first, second] = await Promise.all([requestRender(key, {}, call), requestRender(key, {}, call)]);
    expect(first).toBe(second);
    expect(calls).toBe(1);
    expect(peekRender<Output>(key)).toEqual({ ok: true, png: "AAAA" });
    expect(renderKey("math", "host-b", { expression: "x" })).not.toBe(renderKey("math", "host-a", { expression: "x" }));
    expect(renderKey("mermaid", "host-a", { source: "x" })).not.toBe(renderKey("math", "host-a", { source: "x" }));
  });

  it("keeps results keyed by input so a stale response cannot overwrite a newer key", async () => {
    clearRenderCache();
    const slow = deferred<Output>();
    const fast = deferred<Output>();
    const keyOld = renderKey("mermaid", "h", { source: "old", theme: "dark" });
    const keyNew = renderKey("mermaid", "h", { source: "new", theme: "dark" });
    const oldPromise = requestRender(keyOld, {}, () => slow.promise);
    const newPromise = requestRender(keyNew, {}, () => fast.promise);
    fast.resolve({ ok: true, png: "NEW" });
    expect(await newPromise).toEqual({ ok: true, png: "NEW" });
    slow.resolve({ ok: true, png: "OLD" });
    expect(await oldPromise).toEqual({ ok: true, png: "OLD" });
    expect(peekRender<Output>(keyNew)).toEqual({ ok: true, png: "NEW" });
    expect(peekRender<Output>(keyOld)).toEqual({ ok: true, png: "OLD" });
  });

  it("treats transport failures and declared retryable failures as expiring, and supports forget", async () => {
    clearRenderCache();
    const keyFail = renderKey("mermaid", "h", { source: "fail" });
    const transport = await requestRender(keyFail, {}, () => Promise.reject(new Error("offline")));
    expect(transport).toBeNull();
    expect(peekRender(keyFail)).toBeNull();
    forgetRender(keyFail);
    expect(peekRender(keyFail)).toBeUndefined();
    let attempts = 0;
    const busyThenOk = async () => (++attempts === 1 ? ({ ok: false, reason: "busy" } as Output) : ({ ok: true, png: "OK" } as Output));
    const keyBusy = renderKey("mermaid", "h", { source: "busy" });
    const first = await requestRender(keyBusy, {}, busyThenOk, { retryableReasons: (r) => !r.ok && r.reason === "busy" });
    expect(first).toEqual({ ok: false, reason: "busy" });
    forgetRender(keyBusy);
    const second = await requestRender(keyBusy, {}, busyThenOk, { retryableReasons: (r) => !r.ok && r.reason === "busy" });
    expect(second).toEqual({ ok: true, png: "OK" });
    const keyInvalid = renderKey("math", "h", { expression: "bad" });
    const invalid = await requestRender(keyInvalid, {}, async () => ({ ok: false, reason: "invalid" }) as Output);
    expect(invalid).toEqual({ ok: false, reason: "invalid" });
    expect(peekRender(keyInvalid)).toEqual({ ok: false, reason: "invalid" });
  });

  it("bounds completed entries by count and bytes without evicting in-flight work", async () => {
    clearRenderCache();
    const pending = deferred<Output>();
    const keyPending = renderKey("math", "h", { expression: "pending" });
    const pendingPromise = requestRender(keyPending, {}, () => pending.promise);
    for (let index = 0; index < 140; index++) {
      await requestRender(renderKey("math", "h", { expression: `e${index}` }), {}, async () => ({ ok: true, png: "P".repeat(1000) }) as Output);
    }
    expect(peekRender(renderKey("math", "h", { expression: "e0" }))).toBeUndefined();
    expect(peekRender(renderKey("math", "h", { expression: "e139" }))).toBeDefined();
    pending.resolve({ ok: true, png: "LATE" });
    expect(await pendingPromise).toEqual({ ok: true, png: "LATE" });
  });
});

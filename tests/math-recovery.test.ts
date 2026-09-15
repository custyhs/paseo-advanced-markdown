import { access, copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderFormula, clearMathCache } from "../server/math/render.js";
import { fontCandidates } from "../server/math/fonts.js";
import { isRetryableMathResult } from "../shared/rpc.js";
import {
  requestRender,
  renderKey,
  clearRenderCache,
  forgetRender,
} from "../client/render-cache.js";

describe("font recovery through the client cache", () => {
  it("retries the same formula after font installation and expires environment failures", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pam-client-font-"));
    const target = path.join(directory, "font.ttc");
    let source: string | undefined;
    for (const candidate of fontCandidates({}, process.platform)) {
      if (
        await access(candidate).then(
          () => true,
          () => false,
        )
      ) {
        source = candidate;
        break;
      }
    }
    expect(source).toBeDefined();
    const previous = process.env.PASEO_ADVANCED_MARKDOWN_FONT;
    const input = { expression: String.raw`y+\text{中文}`, display: true, color: "#111111" };
    const key = renderKey("math", "font-recovery", input);
    let calls = 0;
    const call = () => {
      calls++;
      return renderFormula(input);
    };
    const options = { retryableReasons: isRetryableMathResult };
    try {
      process.env.PASEO_ADVANCED_MARKDOWN_FONT = target;
      clearMathCache();
      clearRenderCache();
      const missing = await requestRender(key, input, call, options);
      expect(missing).toMatchObject({ ok: false, reason: "unavailable" });
      expect(isRetryableMathResult(missing!)).toBe(true);
      // Expiry reissues an unchanged request; it must not remain invalid forever.
      const now = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(now + 31_000);
      await requestRender(key, input, call, options);
      expect(calls).toBe(2);
      clock.mockRestore();
      await copyFile(source!, target);
      // This is exactly what the UI Retry action does; do not clear server cache.
      forgetRender(key);
      const recovered = await requestRender(key, input, call, options);
      expect(recovered?.ok).toBe(true);
      expect(calls).toBe(3);
    } finally {
      vi.restoreAllMocks();
      if (previous === undefined) delete process.env.PASEO_ADVANCED_MARKDOWN_FONT;
      else process.env.PASEO_ADVANCED_MARKDOWN_FONT = previous;
      clearMathCache();
      clearRenderCache();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

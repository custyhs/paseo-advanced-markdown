// Adapted from paseo-math (Apache-2.0) tests/render.test.ts at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
import { describe, expect, it } from "vitest";
import { clearMathCache, mathCacheSize, renderFormula } from "../server/math/render.js";
import type { MathRenderOutput } from "../shared/rpc.js";
import { decodePng, inkCount } from "./helpers/png.js";

type ImageOutput = Extract<MathRenderOutput, { ok: true }>;

async function render(
  expression: string,
  display = false,
  color = "#17202a",
): Promise<ImageOutput> {
  const result = await renderFormula({ expression, display, color });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Rendering failed: ${result.reason}`);
  return result;
}

describe("local math rasterization", () => {
  it("typesets real glyphs with 2x pixels and a descender-aware inline baseline", async () => {
    const result = await render("q_j + 2");
    const decoded = decodePng(result.png);
    expect(decoded.width).toBe(result.width * 2);
    expect(decoded.height).toBe(result.height * 2);
    expect(result.baseline).toBeGreaterThan(1);
    expect(result.baseline).toBeLessThan(result.height - 1);
    expect(inkCount(decoded.rgba)).toBeGreaterThan(30);
    // Padding remains transparent, not an opaque message-sized screenshot.
    expect(decoded.rgba[3]).toBe(0);
  });

  it("lays out display fractions and multiple aligned rows instead of literal TeX", async () => {
    const inline = await render(String.raw`\frac{p}{q}`);
    const display = await render(String.raw`\frac{p}{q}`, true);
    const aligned = await render(
      String.raw`\begin{aligned}p&=q+2\\r&=\frac{p}{q}\end{aligned}`,
      true,
    );
    expect(display.height).toBeGreaterThan(inline.height);
    expect(aligned.height).toBeGreaterThan(display.height);
    expect(inkCount(decodePng(aligned.png).rgba)).toBeGreaterThan(
      inkCount(decodePng(display.png).rgba),
    );
  });

  it("paints with the requested theme color", async () => {
    const light = decodePng((await render("x", false, "#ffffff")).png);
    let whiteInk = 0;
    for (let i = 0; i < light.rgba.length; i += 4) {
      if (light.rgba[i + 3]! > 200 && light.rgba[i]! > 200 && light.rgba[i + 1]! > 200) whiteInk++;
    }
    expect(whiteInk).toBeGreaterThan(10);
  });

  it("keeps invalid TeX and oversized input as source-fallback failures", async () => {
    expect(
      await renderFormula({
        expression: String.raw`\unknownCommand{a}`,
        display: false,
        color: "#111111",
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await renderFormula({ expression: "x".repeat(4097), display: false, color: "#111111" }),
    ).toEqual({ ok: false, reason: "too-large" });
    expect(
      await renderFormula({
        expression: String.raw`\href{https://x}{y}`,
        display: false,
        color: "#111111",
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("caches by expression, mode, and color and can be cleared", async () => {
    clearMathCache();
    const first = await render("a+b", false, "#123456");
    const again = await render("a+b", false, "#123456");
    expect(again).toBe(first);
    expect(mathCacheSize()).toBeGreaterThan(0);
    const dark = await render("a+b", false, "#fafafa");
    expect(dark).not.toBe(first);
    clearMathCache();
    expect(mathCacheSize()).toBe(0);
  });
});

// Adapted from paseo-math (Apache-2.0) tests/render.test.ts at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
import { describe, expect, it } from "vitest";
import { access, copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clearMathCache, mathCacheSize, renderFormula } from "../server/math/render.js";
import { fontCandidates } from "../server/math/fonts.js";
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

  it("typesets characters outside MathJax's fonts using a host font", async () => {
    const result = await render(String.raw`x+\text{中文}`, true);
    const decoded = decodePng(result.png);
    expect(inkCount(decoded.rgba)).toBeGreaterThan(200);
    // The annotation must occupy real width beside the formula, not collapse away.
    const ascii = await render(String.raw`x+\text{ab}`, true);
    expect(result.width).toBeGreaterThan(ascii.width);
  });

  it("explains a missing font instead of reporting invalid TeX", async () => {
    const previous = process.env.PASEO_ADVANCED_MARKDOWN_FONT;
    process.env.PASEO_ADVANCED_MARKDOWN_FONT = "/nonexistent/paseo-advanced-markdown/font.ttf";
    try {
      clearMathCache();
      const result = await renderFormula({
        expression: String.raw`x+\text{中文}`,
        display: true,
        color: "#111111",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("invalid");
        expect(result.message ?? "").toMatch(/font/i);
      }
    } finally {
      if (previous === undefined) delete process.env.PASEO_ADVANCED_MARKDOWN_FONT;
      else process.env.PASEO_ADVANCED_MARKDOWN_FONT = previous;
      clearMathCache();
    }
  });

  it("treats a file that is not a font like a missing font", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pam-badfont-"));
    const target = path.join(directory, "not-a-font.ttf");
    const previous = process.env.PASEO_ADVANCED_MARKDOWN_FONT;
    process.env.PASEO_ADVANCED_MARKDOWN_FONT = target;
    try {
      await writeFile(target, "this is not a font file");
      clearMathCache();
      const result = await renderFormula({
        expression: String.raw`z+\text{中文}`,
        display: true,
        color: "#111111",
      });
      // Silently dropping the glyphs would look like a rendering bug to the reader.
      expect(result.ok, "a broken font must not produce a blank annotation").toBe(false);
      if (!result.ok) expect(result.message ?? "").toMatch(/font/i);
    } finally {
      if (previous === undefined) delete process.env.PASEO_ADVANCED_MARKDOWN_FONT;
      else process.env.PASEO_ADVANCED_MARKDOWN_FONT = previous;
      await rm(directory, { recursive: true, force: true });
      clearMathCache();
    }
  });

  it("picks up a font installed after a failed render, without a reload", async () => {
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
    expect(source, "this host has no readable candidate font to copy").toBeDefined();
    const directory = await mkdtemp(path.join(os.tmpdir(), "pam-font-"));
    const target = path.join(directory, "fallback.ttc");
    const previous = process.env.PASEO_ADVANCED_MARKDOWN_FONT;
    process.env.PASEO_ADVANCED_MARKDOWN_FONT = target;
    try {
      clearMathCache();
      const before = await renderFormula({
        expression: String.raw`y+\text{中文}`,
        display: true,
        color: "#111111",
      });
      expect(before.ok).toBe(false);
      await copyFile(source!, target);
      clearMathCache();
      const after = await renderFormula({
        expression: String.raw`y+\text{中文}`,
        display: true,
        color: "#111111",
      });
      expect(after.ok, "a font installed after the failure must be used").toBe(true);
    } finally {
      if (previous === undefined) delete process.env.PASEO_ADVANCED_MARKDOWN_FONT;
      else process.env.PASEO_ADVANCED_MARKDOWN_FONT = previous;
      await rm(directory, { recursive: true, force: true });
      clearMathCache();
    }
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

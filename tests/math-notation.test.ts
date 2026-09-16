import { describe, expect, it } from "vitest";
import MarkdownIt from "markdown-it";
import { renderFormula } from "../server/math/render.js";
import { markdownExtensions, MATH_BLOCK } from "../shared/markdown/extensions.js";
import { decodePng, inkCount } from "./helpers/png.js";

describe("additional mathematical notation", () => {
  it.each([
    String.raw`\sum_{\mathclap{1\le i\le n}} x_i`,
    String.raw`a\coloneqq b`,
    String.raw`\cancel{x}+\bcancel{y}+\xcancel{z}+\cancelto{0}{w}`,
    String.raw`\begin{gathered}\begin{multlined}a+b+c\\=d+e\end{multlined}\end{gathered}`,
  ])("renders %s through parser, sanitizer, and the real rasterizer", async (expression) => {
    const source = `\`\`\`math\n${expression}\n\`\`\``;
    const tokens = new MarkdownIt().use(markdownExtensions).parse(source, {});
    const math = tokens.find((token) => token.type === MATH_BLOCK);
    expect(math).toBeDefined();
    const result = await renderFormula({
      expression: math!.content,
      display: true,
      color: "#111111",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(inkCount(decodePng(result.png).rgba)).toBeGreaterThan(30);
  });

  it("retains the overhanging glyphs in zero-width mathclap annotations", async () => {
    const expression = String.raw`\sum_{\mathclap{1\le i\le n}} x_i`;
    for (const source of [expression, String.raw`\mathclap{abcdefghijklmnop}`]) {
      const result = await renderFormula({ expression: source, display: true, color: "#111111" });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const image = decodePng(result.png);
      // Cropping the first digit/inequality would leave ink touching the outer edge.
      for (let y = 0; y < image.height; y++) {
        expect(image.rgba[y * image.width * 4 + 3]).toBe(0);
        expect(image.rgba[(y * image.width + image.width - 1) * 4 + 3]).toBe(0);
      }
      expect(inkCount(image.rgba)).toBeGreaterThan(100);
    }
  });

  it("keeps local macros isolated after enabling mathtools and cancel", async () => {
    const valid = await renderFormula({
      expression: String.raw`\newcommand{\localfoo}{x}\cancel{\localfoo}`,
      display: false,
      color: "#111111",
    });
    expect(valid.ok).toBe(true);
    expect(
      await renderFormula({ expression: String.raw`\localfoo`, display: false, color: "#111111" }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it.each([
    String.raw`\href{https://example.com}{\cancel{x}}`,
    String.raw`\style{background:url(https://example.com)}{x}`,
    String.raw`\require{html}\href{https://example.com}{x}`,
    String.raw`\includegraphics{https://example.com/a.png}`,
    String.raw`\color{url(https://example.com)}{\cancel{x}}`,
    String.raw`\cancel[color=url(https://example.com)]{x}`,
    String.raw`\cancel[mathbackground=url(https://example.com)]{x}`,
  ])("rejects resource-bearing TeX: %s", async (expression) => {
    expect(await renderFormula({ expression, display: true, color: "#111111" })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

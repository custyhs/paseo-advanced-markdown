import { describe, expect, it } from "vitest";
import MarkdownIt from "markdown-it";
import { markdownExtensions, MATH_BLOCK, MATH_INLINE } from "../shared/markdown/extensions.js";
const md = new MarkdownIt().use(markdownExtensions);
describe("formula copy payloads", () => {
  it("does not copy Markdown quote markers as TeX", () => {
    const tokens = md.parse("> $$\n>   x+1\n> $$", {});
    const math = tokens.find((token) => token.type === MATH_BLOCK);
    expect(math?.meta?.texSource).toBe("\n  x+1\n");
    expect(math?.content.trim()).toBe("x+1");
    const fenced = md
      .parse("> ```math\n> x+1\n> ```", {})
      .find((token) => token.type === MATH_BLOCK);
    expect(fenced?.meta?.texSource).toBe("x+1\n");
    expect(fenced?.content).toBe("x+1\n");
  });
  for (const [source, tex] of [
    [String.raw`$a &lt; b$`, "a &lt; b"],
    ["\\[\n   x+\\text{中文}\n   \\]", "\n   x+\\text{中文}\n   "],
    ["```math\n\\[\n   x+1\n\\]\n```", "\n   x+1\n"],
    ["```math\n x+1\n```", " x+1\n"],
  ]) {
    it(`preserves expression and original range: ${source}`, () => {
      const tokens = md.parse(source, {}).flatMap((token) => [token, ...(token.children ?? [])]);
      const math = tokens.find((token) => token.type === MATH_BLOCK || token.type === MATH_INLINE);
      expect(math?.meta).toMatchObject({ source, texSource: tex });
    });
  }
});

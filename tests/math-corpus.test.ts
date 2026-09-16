import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import { describe, expect, it } from "vitest";
import { MATH_BLOCK, MATH_INLINE, markdownExtensions } from "../shared/markdown/extensions.js";
import { BENCHMARK_FORMULAS, MATH_READING_CORPUS } from "./fixtures/math-reading.js";

function exactSourceOf(token: Token): string {
  const metadata: unknown = token.meta;
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !("source" in metadata) ||
    typeof metadata.source !== "string"
  ) {
    throw new Error("Formula token has no exact source metadata");
  }
  return metadata.source;
}

describe("versioned mathematical reading sources", () => {
  it("contains unique named scenarios and a fixed 50-formula workload", () => {
    expect(MATH_READING_CORPUS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(MATH_READING_CORPUS.map((fixture) => fixture.id)).size).toBe(
      MATH_READING_CORPUS.length,
    );
    expect(BENCHMARK_FORMULAS).toHaveLength(50);
    expect(new Set(BENCHMARK_FORMULAS.map((fixture) => fixture.expression)).size).toBe(50);
  });

  for (const fixture of MATH_READING_CORPUS) {
    it(`${fixture.id}: preserves exact formula ranges and document order`, () => {
      const tokens: Token[] = [];
      const collect = (token: Token): void => {
        if (token.type === MATH_INLINE || token.type === MATH_BLOCK) tokens.push(token);
        token.children?.forEach(collect);
      };
      new MarkdownIt().use(markdownExtensions).parse(fixture.source, {}).forEach(collect);
      expect(tokens.map(exactSourceOf)).toEqual(fixture.formulas.map((formula) => formula.source));
      expect(tokens.map((token) => token.content.trim())).toEqual(
        fixture.formulas.map((formula) => formula.tex.trim()),
      );
      let position = 0;
      for (const token of tokens) {
        const exactSource = exactSourceOf(token);
        const start = fixture.source.indexOf(exactSource, position);
        expect(start).toBeGreaterThanOrEqual(position);
        expect(Buffer.from(fixture.source.slice(start, start + exactSource.length))).toEqual(
          Buffer.from(exactSource),
        );
        position = start + exactSource.length;
      }
    });
  }
});

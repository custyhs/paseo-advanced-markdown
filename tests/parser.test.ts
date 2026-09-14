// Parser cases adapted from paseo-math (Apache-2.0) tests/parser.test.ts at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
// with Mermaid fence and mixed-content cases added.
import { describe, expect, it } from "vitest";
import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import {
  MATH_BLOCK,
  MATH_INLINE,
  MERMAID_BLOCK,
  detectExtensions,
  markdownExtensions,
  shouldTakeOver,
} from "../shared/markdown/extensions.js";
import type { ExtensionMeta } from "../shared/markdown/extensions.js";
import { compactEquationTags, normalizeTex } from "../shared/tex.js";

const meta = (token: Token): ExtensionMeta => token.meta as unknown as ExtensionMeta;

function parse(source: string): Token[] {
  const tokens: Token[] = [];
  const visit = (token: Token): void => {
    tokens.push(token);
    token.children?.forEach(visit);
  };
  new MarkdownIt().use(markdownExtensions).parse(source, {}).forEach(visit);
  return tokens;
}
function formulas(source: string): Token[] {
  return parse(source).filter((token) => token.type === MATH_INLINE || token.type === MATH_BLOCK);
}
function diagrams(source: string): Token[] {
  return parse(source).filter((token) => token.type === MERMAID_BLOCK);
}
function expressions(source: string): string[] {
  return formulas(source).map((token) => token.content);
}
function text(source: string): string {
  return parse(source)
    .filter((token) => token.type === "text")
    .map((token) => token.content)
    .join("");
}

describe("raw-source math within Markdown", () => {
  it("realigns currency without losing later formulas or prose formatting", () => {
    const source = "Fees $.65, $-9 or $+13; $8+$12; $240 (tax included). **Use** $u$ and $v$.";
    expect(expressions(source)).toEqual(["u", "v"]);
    expect(text(source)).toContain("Fees $.65, $-9 or $+13; $8+$12; $240 (tax included).");
    expect(parse(source).filter((token) => token.type === "strong_open")).toHaveLength(1);
  });

  it("keeps literal prices, escaped dollars, and HOME-style variables as text", () => {
    const source = String.raw`It costs $5 and $10. Set \$HOME first; $x$ stays math.`;
    expect(expressions(source)).toEqual(["x"]);
    expect(text(source)).toContain("It costs $5 and $10.");
    expect(text(source)).toContain("$HOME");
  });

  it("accepts genuinely numeric TeX instead of an operator allowlist", () => {
    expect(expressions(String.raw`$31^\circ$, $7!$, $3, 5, 7$, $5:8$, $6ab + 2$, $-2$.`)).toEqual([
      String.raw`31^\circ`,
      "7!",
      "3, 5, 7",
      "5:8",
      "6ab + 2",
      "-2",
    ]);
  });

  it("protects all code forms and links using Markdown's boundaries", () => {
    const source = [
      "`$a$ \\(b\\)` and $u `code` v$ and $u [reference](https://example.org/$x$) v$",
      "",
      "    $indented$",
      "",
      "~~~text",
      "$tilde$",
      "~~~",
      "",
      "```text",
      "$fenced$",
      "``` not-a-close",
      "$stillCode$",
      "```",
      "",
      "$visible$",
    ].join("\n");
    expect(expressions(source)).toEqual(["visible"]);
    expect(parse(source).filter((token) => token.type === "link_open")).toHaveLength(1);
    expect(
      parse(source)
        .filter((token) => token.type === "code_inline")
        .map((token) => token.content),
    ).toEqual(["$a$ \\(b\\)", "code"]);
    expect(
      parse(source)
        .filter((token) => token.type === "fence")
        .map((token) => token.content),
    ).toEqual(["$tilde$\n", "$fenced$\n``` not-a-close\n$stillCode$\n"]);
  });

  it("keeps Python fences with dollar strings as code", () => {
    const source = 'Run:\n\n```python\nprice = "$5 + $10"\nformula = "$x^2$"\n```\n';
    expect(expressions(source)).toEqual([]);
    expect(detectExtensions(source)).toEqual({ math: false, mermaid: false, unsupported: false });
  });

  it("keeps raw delimiter intent separate from decoded TeX entities", () => {
    const source = String.raw`\$fake$ &#36;fake$ &dollar;fake$ $a*&lt;*b$ $c*&#x3c;*d$ $e*&dollar;8*f$ $g*\&lt;h*i$ $T=\$37$`;
    expect(expressions(source)).toEqual([
      "a*<*b",
      "c*<*d",
      String.raw`e*\$8*f`,
      String.raw`g*\&lt;h*i`,
      String.raw`T=\$37`,
    ]);
  });

  it("consumes TeX markers before Markdown but retains prose wrappers", () => {
    const source = "**Choose $r_*$, then $Q^{r_*}$ and $e_{r_*}$ with *gentle* prose.**";
    expect(expressions(source)).toEqual(["r_*", "Q^{r_*}", "e_{r_*}"]);
    expect(parse(source).filter((token) => token.type === "strong_open")).toHaveLength(1);
    expect(parse(source).filter((token) => token.type === "em_open")).toHaveLength(1);
    expect(expressions(String.raw`$a*b\{c\}d*e$ and $p_{*q_{**r**}*}$ then $a~~b~~c$`)).toEqual([
      String.raw`a*b\{c\}d*e`,
      "p_{*q_{**r**}*}",
      "a~~b~~c",
    ]);
  });

  it("declines partial overlap instead of stealing intentional formatting", () => {
    for (const source of ["**strong $u**v$", "$u**v$ strong**", "*soft $u*v$", "~~gone $u~~v$"]) {
      expect(expressions(source)).toEqual([]);
      const baseline = new MarkdownIt().parse(source, {});
      const baselineChildren = baseline
        .flatMap((token) => token.children ?? [])
        .map((token) => [token.type, token.content]);
      const actualChildren = parse(source)
        .filter((token) => !["paragraph_open", "paragraph_close", "inline"].includes(token.type))
        .map((token) => [token.type, token.content]);
      expect(actualChildren).toEqual(baselineChildren);
    }
  });

  it("preserves source while streaming and promotes only complete delimiters", () => {
    for (const source of [
      "$u",
      "$u+",
      String.raw`\(u+`,
      String.raw`\[u+`,
      "$$\nu+",
      "```math\nu+",
      "```math\nu+\n``` not-closed",
    ]) {
      expect(detectExtensions(source).math).toBe(false);
      expect(expressions(source)).toEqual([]);
    }
    const source = String.raw`Result $u+v$; \(w+z\); inline \[a+b\] ends.`;
    expect(formulas(source).map((token) => [token.type, token.meta])).toEqual([
      [MATH_INLINE, { source: "$u+v$", display: false }],
      [MATH_INLINE, { source: String.raw`\(w+z\)`, display: false }],
      [MATH_INLINE, { source: String.raw`\[a+b\]`, display: true }],
    ]);
    expect(detectExtensions(source).math).toBe(true);
  });

  it("records the exact display source, including delimiters and inner blank lines", () => {
    const dollars = "Before\n\n$$\na^2\n\n+b^2=c^2\n$$\n\nAfter";
    const dollarTokens = formulas(dollars);
    expect(dollarTokens).toHaveLength(1);
    expect(meta(dollarTokens[0]).source).toBe("$$\na^2\n\n+b^2=c^2\n$$");
    expect(dollarTokens[0].content.trim()).toBe("a^2\n\n+b^2=c^2");
    const fenced = "```math\nE = mc^2\n\n\\alpha\n```";
    const fencedTokens = formulas(fenced);
    expect(fencedTokens).toHaveLength(1);
    expect(meta(fencedTokens[0]).source).toBe(fenced);
    expect(fencedTokens[0].content).toBe("E = mc^2\n\n\\alpha\n");
  });

  it("retains blank lines, nested containers, and closing-line prose", () => {
    const source = [
      "> - $$",
      ">   a+b",
      ">",
      ">   c+d",
      ">   $$ After **math**.",
      ">",
      ">   - \\[e+f\\] tail",
    ].join("\n");
    expect(expressions(source).map((value) => value.trim())).toEqual(["a+b\n\nc+d", "e+f"]);
    expect(text(source)).toContain("After math.");
    expect(text(source)).toContain("tail");
    expect(parse(source).filter((token) => token.type === "blockquote_open")).toHaveLength(1);
    expect(parse(source).filter((token) => token.type === "bullet_list_open")).toHaveLength(2);
    expect(formulas(source).every((token) => token.block)).toBe(true);
  });

  it("does not pair displays across a container boundary", () => {
    expect(expressions("- $$\n  unfinished\n\noutside\n$$")).toEqual([]);
    expect(expressions("> $$\n> unfinished\n\noutside\n$$")).toEqual([]);
  });

  it("promotes closed math fences in containers, never lookalike code", () => {
    const source = [
      "> ~~~math",
      "> a+b",
      "> ~~~",
      "",
      "- ```math",
      "  c+d",
      "  ```",
      "",
      "```mathematica",
      "$notMath$",
      "```",
    ].join("\n");
    expect(expressions(source)).toEqual(["a+b\n", "c+d\n"]);
    expect(
      parse(source)
        .filter((token) => token.type === "fence")
        .map((token) => token.info),
    ).toEqual(["mathematica"]);
  });

  it("detects math from tokens rather than dollar-shaped strings", () => {
    for (const source of [
      "$-7 and $.25",
      "`$hidden$`",
      "[label](https://example.org/$hidden$)",
      "&#36;hidden$",
      String.raw`\$hidden$`,
      "mathematics",
    ])
      expect(detectExtensions(source).math).toBe(false);
    expect(detectExtensions("~~~math\nx+y\n~~~").math).toBe(true);
    expect(detectExtensions(`$${"x".repeat(4097)}$`).math).toBe(false);
    expect(detectExtensions(`${"x".repeat(65_536)} $u$`).math).toBe(false);
  });
});

describe("Mermaid fences", () => {
  const flow = "```mermaid\nflowchart LR\n  A[开始] --> B{判断}\n\n  B -->|yes| C\n```";

  it("promotes a closed mermaid fence and records its exact fenced source", () => {
    const tokens = diagrams(flow);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].content).toBe("flowchart LR\n  A[开始] --> B{判断}\n\n  B -->|yes| C\n");
    expect(tokens[0].meta).toEqual({ source: flow, language: "mermaid" });
    expect(tokens[0].block).toBe(true);
    expect(detectExtensions(flow)).toEqual({ math: false, mermaid: true, unsupported: false });
  });

  it("keeps unclosed, empty, lookalike, and oversized fences as ordinary code", () => {
    for (const source of [
      "```mermaid\nflowchart LR\n  A --> B",
      "```mermaid\nflowchart LR\n``` trailing",
      "```mermaid\n\n```",
      "```mermaidjs\nflowchart LR\n```",
      "```javascript\nconst mermaid = 1;\n```",
      `\`\`\`mermaid\n${"x".repeat(32 * 1024 + 1)}\n\`\`\``,
    ]) {
      expect(diagrams(source)).toEqual([]);
      expect(detectExtensions(source).mermaid).toBe(false);
    }
  });

  it("accepts an info string with extra words and tilde fences inside containers", () => {
    const source = [
      "> ~~~mermaid title",
      "> sequenceDiagram",
      ">   Alice->>Bob: 你好",
      "> ~~~",
      "",
      "- ```Mermaid",
      "  classDiagram",
      "  class A",
      "  ```",
    ].join("\n");
    const tokens = diagrams(source);
    expect(tokens.map((token) => token.content)).toEqual([
      "sequenceDiagram\n  Alice->>Bob: 你好\n",
      "classDiagram\nclass A\n",
    ]);
    expect(meta(tokens[0]).source).toBe(
      "~~~mermaid title\n> sequenceDiagram\n>   Alice->>Bob: 你好\n> ~~~",
    );
  });

  it("does not treat dollar signs inside a diagram as math", () => {
    const source = "```mermaid\nflowchart LR\n  A[$5] --> B[$10]\n```";
    expect(expressions(source)).toEqual([]);
    expect(diagrams(source)).toHaveLength(1);
  });
});

describe("mixed content", () => {
  const mixed = [
    "# Title",
    "",
    "Inline $E=mc^2$ and \\(a+b\\) in **prose**.",
    "",
    "$$",
    "\\int_0^1 x\\,dx",
    "$$",
    "",
    "```mermaid",
    "flowchart LR",
    "  A --> B",
    "```",
    "",
    "| a | b |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "```python",
    "print('$x$')",
    "```",
    "",
    "- item [link](https://example.org)",
  ].join("\n");

  it("keeps math, Mermaid, and ordinary Markdown in document order", () => {
    const order = parse(mixed)
      .filter((token) =>
        [
          "heading_open",
          MATH_INLINE,
          MATH_BLOCK,
          MERMAID_BLOCK,
          "table_open",
          "fence",
          "bullet_list_open",
          "link_open",
        ].includes(token.type),
      )
      .map((token) => token.type);
    expect(order).toEqual([
      "heading_open",
      MATH_INLINE,
      MATH_INLINE,
      MATH_BLOCK,
      MERMAID_BLOCK,
      "table_open",
      "fence",
      "bullet_list_open",
      "link_open",
    ]);
    expect(detectExtensions(mixed)).toEqual({ math: true, mermaid: true, unsupported: false });
  });

  it("reports nothing for plain Markdown so the host keeps it", () => {
    for (const source of [
      "# Plain\n\nJust **text** with `code` and a [link](https://example.org).",
      "```ts\nconst x = 1;\n```",
      "",
    ]) {
      expect(detectExtensions(source)).toEqual({ math: false, mermaid: false, unsupported: false });
    }
  });

  it("leaves items with inline images to the host and honors module switches", () => {
    const withImage = "Formula $x$ and ![figure](https://example.org/a.png)";
    const detected = detectExtensions(withImage);
    expect(detected).toEqual({ math: true, mermaid: false, unsupported: true });
    expect(shouldTakeOver(detected, { math: true, mermaid: true })).toBe(false);
    const mathOnly = detectExtensions("Only $x$ here");
    expect(shouldTakeOver(mathOnly, { math: true, mermaid: false })).toBe(true);
    expect(shouldTakeOver(mathOnly, { math: false, mermaid: true })).toBe(false);
    const both = detectExtensions(mixed);
    expect(shouldTakeOver(both, { math: false, mermaid: true })).toBe(true);
    expect(shouldTakeOver(both, { math: false, mermaid: false })).toBe(false);
  });
});

describe("standalone equation tags", () => {
  it("places leading, middle, and grouped tags after the display", () => {
    for (const tex of [String.raw`\tag{1}x=y`, String.raw`x\tag{1}=y`]) {
      expect(compactEquationTags(tex)).toBe(String.raw`x=y\qquad{\text{(}1\text{)}}`);
    }
    expect(compactEquationTags(String.raw`{x\tag*{A}}=y`)).toBe(String.raw`{x}=y\qquad{A}`);
  });

  it("compacts numbered and custom display tags without touching literal TeX", () => {
    expect(
      compactEquationTags(String.raw`x=y\tag{7} + z\tag*{\dagger} + \verb|\tag{hidden}|`),
    ).toBe(String.raw`x=y + z + \verb|\tag{hidden}|\qquad{\text{(}7\text{)}}\qquad{\dagger}`);
    expect(compactEquationTags(String.raw`x\tag{unfinished`)).toBe(String.raw`x\tag{unfinished`);
  });
});

describe("context-limited text percent repair", () => {
  it("repairs balanced text families, nested and escaped braces, just once", () => {
    const source = String.raw`\text{18% {net} \{gain\} and 2\%} + \textbf{7%}`;
    const expected = String.raw`\text{18\% {net} \{gain\} and 2\%} + \textbf{7\%}`;
    expect(normalizeTex(source)).toBe(expected);
    expect(normalizeTex(expected)).toBe(expected);
  });

  it("does not interpret commands inside comments or verbatim", () => {
    expect(normalizeTex(String.raw`\text{unfinished 8%`)).toBe(String.raw`\text{unfinished 8%`);
    expect(normalizeTex(String.raw`a\% + \verb*+6%+`)).toBe(String.raw`a\% + \verb*+6%+`);
  });
});

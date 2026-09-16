/** Fixed assistant-message sources. Never ask a model to regenerate these for visual comparison. */
export const CORPUS_VERSION = "math-reading-v1";

export interface MathReadingFixture {
  id: string;
  source: string;
  formulas: { source: string; tex: string }[];
  expectation: "render" | "source" | "invalid" | "unavailable" | "new-profile" | "host-gap";
  environment?: "missing-font";
  note: string;
}

const inline = (id: string, tex: string, note: string): MathReadingFixture => ({
  id,
  source: `Before $${tex}$ after.`,
  formulas: [{ source: `$${tex}$`, tex }],
  expectation: "render",
  note,
});
const display = (id: string, tex: string, note: string): MathReadingFixture => ({
  id,
  source: `\\[${tex}\\]`,
  formulas: [{ source: `\\[${tex}\\]`, tex }],
  expectation: "render",
  note,
});

// User's reported source, including indentation, punctuation, and Chinese labels.
export const USER_DELTA_SOURCE = String.raw`\[
   \Delta(S)=
   \log\frac{P(S)}{\widehat P(S)}
   +\underbrace{\log\!\left(1-\epsilon_0+\frac{\epsilon_0}{P(S)}\right)}_{\text{随集合变化，不能被共同 offset 吸收}}
   +\underbrace{\widehat b_q-\log\bar P(\varnothing)}_{\text{共同 offset}},
   \]`;

export const MATH_READING_CORPUS: readonly MathReadingFixture[] = [
  inline("inline-energy", "E = mc^2", "Short inline baseline beside prose."),
  inline(
    "inline-fraction",
    String.raw`\frac{1}{1+\frac{1}{x}}`,
    "Tall inline fraction, line spacing.",
  ),
  inline("scripts", "x_{i_j}^{n+1}", "Nested subscript and superscript."),
  inline("inline-sum", String.raw`\sum_{i=1}^{n} i^2`, "Inline operator limits."),
  display("integral", String.raw`\int_0^1 x^2\,dx=\frac{1}{3}`, "Display integral, thin spaces."),
  display("limit", String.raw`\lim_{x\to0}\frac{\sin x}{x}=1`, "Limit operator alignment."),
  display(
    "probability",
    String.raw`P(A\mid B)=\frac{P(A\cap B)}{P(B)}`,
    "Probability and conditional bar.",
  ),
  display(
    "sets",
    String.raw`S=\{x\in\mathbb R:x\ge0\}\setminus\varnothing`,
    "Blackboard symbols and sets.",
  ),
  display("matrix", String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`, "Matrix rows and brackets."),
  display(
    "cases",
    String.raw`f(x)=\begin{cases}x^2&x\ge0\\-x&x<0\end{cases}`,
    "Cases preserve rows and conditions.",
  ),
  display(
    "aligned",
    String.raw`\begin{aligned}(a+b)^2&=a^2+2ab+b^2\\&\ge0\end{aligned}`,
    "Aligned derivation; do not rewrite source.",
  ),
  display("boxed", String.raw`\boxed{x^2+y^2=z^2}`, "Box edges remain visible."),
  display("tag", String.raw`a+b=c\tag{12}`, "Equation tag compacted only for rendering."),
  inline("bold-symbol", String.raw`\boldsymbol\alpha+\mathbf v`, "Bold glyph policy."),
  inline("cjk", String.raw`\alpha_{\text{学习率}}`, "CJK host font required."),
  {
    ...inline(
      "missing-font",
      String.raw`\text{缺字测试}`,
      "A missing configured font yields a recoverable environment result, not invalid TeX.",
    ),
    expectation: "unavailable",
    environment: "missing-font",
  },
  display("bold-cjk", String.raw`\textbf{中文标签}+x`, "Requires bold CJK glyph coverage."),
  {
    id: "user-delta",
    source: USER_DELTA_SOURCE,
    formulas: [
      { source: USER_DELTA_SOURCE, tex: USER_DELTA_SOURCE.slice(2, -2).replace(/^ {3}/gm, "") },
    ],
    expectation: "render",
    note: "Original reported Delta(S); wide underbraces and CJK annotations.",
  },
  display(
    "long-polynomial",
    Array.from({ length: 24 }, (_, i) => `a_{${i}}x^{${i}}`).join("+"),
    "Wide image: use reading-size scroll, never hide terms.",
  ),
  inline(
    "long-inline",
    String.raw`\prod_{i=1}^{n}\left(1+\frac{x_i^2+y_i^2}{1+z_i^2}\right)=\frac{P(S\mid Q)}{P(S)}+\frac{P(S\mid R)}{P(R)}`,
    "Oversized inline promotion preserves preceding/following prose.",
  ),
  display(
    "tall-matrix",
    `\\begin{pmatrix}${Array.from({ length: 12 }, (_, i) => `${i}&${i + 1}`).join("\\\\")}\\end{pmatrix}`,
    "Tall inspector must fit height and width.",
  ),
  {
    ...display(
      "mathclap",
      String.raw`\sum_{\mathclap{1\le i\le j\le n}}a_{ij}`,
      "Requires reviewed mathtools profile.",
    ),
    expectation: "new-profile",
  },
  {
    ...display("coloneqq", String.raw`f(x)\coloneqq x^2`, "Requires reviewed mathtools profile."),
    expectation: "new-profile",
  },
  {
    ...display(
      "cancel",
      String.raw`\frac{\cancel{x}y}{\cancel{x}}=y`,
      "Requires reviewed cancel profile and line geometry.",
    ),
    expectation: "new-profile",
  },
  {
    ...display("cancelto", String.raw`\cancelto{0}{x}+1=1`, "Cancel arrow and target positioning."),
    expectation: "new-profile",
  },
  inline(
    "local-macro",
    String.raw`\newcommand{\local}[1]{\mathbf{#1}}\local{x}`,
    "Macro must remain expression-local.",
  ),
  {
    id: "parenthesis-delimiter",
    source: String.raw`Before \(x+y\) after.`,
    formulas: [{ source: String.raw`\(x+y\)`, tex: "x+y" }],
    expectation: "render",
    note: "Parenthesis source copied exactly.",
  },
  {
    id: "dollar-display",
    source: "$$\nx+y\n$$",
    formulas: [{ source: "$$\nx+y\n$$", tex: "\nx+y\n" }],
    expectation: "render",
    note: "Display newlines retained in source.",
  },
  {
    id: "redundant-fence",
    source: "```math\n\\[x+y\\]\n```",
    formulas: [{ source: "```math\n\\[x+y\\]\n```", tex: "x+y" }],
    expectation: "render",
    note: "Copy source keeps fence and redundant wrapper; render body does not.",
  },
  {
    id: "nested-quote-list",
    source: "> - **First $a_1$ then *$b^2$*.**\n>   Tail $c$.",
    formulas: [
      { source: "$a_1$", tex: "a_1" },
      { source: "$b^2$", tex: "b^2" },
      { source: "$c$", tex: "c" },
    ],
    expectation: "render",
    note: "Container width is narrower than message; preserve strong/em/list nesting.",
  },
  {
    id: "table",
    source: "| Label | Value |\n| --- | --- |\n| *A* | $a^2$ |\n| B | $\\frac{1}{x}$ |",
    formulas: [
      { source: "$a^2$", tex: "a^2" },
      { source: "$\\frac{1}{x}$", tex: String.raw`\frac{1}{x}` },
    ],
    expectation: "render",
    note: "Measure table cell, retain headers and source order.",
  },
  {
    id: "mixed-code",
    source: "`$not_math$` **$x$**\n\n```python\nprice = '$5'\n```",
    formulas: [{ source: "$x$", tex: "x" }],
    expectation: "render",
    note: "Code and emphasis boundaries survive.",
  },
  {
    id: "currency",
    source: String.raw`Prices $5 and $10; escaped \$20; $HOME.`,
    formulas: [],
    expectation: "source",
    note: "No formula request for prices or shell variables.",
  },
  {
    id: "fenced-code",
    source: "```text\n$x$ \\(y\\)\n```",
    formulas: [],
    expectation: "source",
    note: "Ordinary fences never become math.",
  },
  {
    id: "incomplete-inline",
    source: "Before $x+",
    formulas: [],
    expectation: "source",
    note: "Unclosed streaming tail has no invalid-TeX chrome.",
  },
  {
    id: "incomplete-display",
    source: "\\[\nx+",
    formulas: [],
    expectation: "source",
    note: "Incomplete display remains readable source.",
  },
  {
    id: "complete-then-stream",
    source: "Closed $x$ then incomplete $y+",
    formulas: [{ source: "$x$", tex: "x" }],
    expectation: "render",
    note: "Complete formula renders before response completion.",
  },
  {
    ...inline(
      "invalid-tex",
      String.raw`\frac{`,
      "Closed delimiters with invalid TeX: local error/source fallback.",
    ),
    expectation: "invalid",
  },
  {
    ...inline(
      "unsupported-physics",
      String.raw`\pdv{x}{y}`,
      "Physics remains disabled; no silent empty PNG.",
    ),
    expectation: "invalid",
  },
  {
    id: "host-blank-line",
    source: "$$\na^2\n\n+b^2=c^2\n$$",
    formulas: [{ source: "$$\na^2\n\n+b^2=c^2\n$$", tex: "\na^2\n\n+b^2=c^2\n" }],
    expectation: "host-gap",
    note: "Plugin parses whole source, but official 0.8.0 host splits at inner blank line first.",
  },
  {
    id: "host-image",
    source: "Formula $x$ ![plot](https://example.org/plot.png)",
    formulas: [{ source: "$x$", tex: "x" }],
    expectation: "host-gap",
    note: "Entire source item stays with host to preserve image behavior.",
  },
  {
    id: "host-file-link",
    source: "Formula $x$ [file](src/main.ts)",
    formulas: [{ source: "$x$", tex: "x" }],
    expectation: "host-gap",
    note: "Entire source item stays with host to preserve file navigation.",
  },
  {
    id: "entity-source",
    source: "$a&lt;b$",
    formulas: [{ source: "$a&lt;b$", tex: "a<b" }],
    expectation: "render",
    note: "Decoded render body never overwrites original copy range.",
  },
];

/** 50 unique closed expressions: 10 fixed shapes × 5 indexed variants. */
export const BENCHMARK_FORMULAS = Array.from({ length: 50 }, (_, index) => {
  const n = Math.floor(index / 10) + 1;
  const expressions = [
    `E_{${n}}=mc^2`,
    `\\frac{${n}}{1+x^2}`,
    `\\sum_{i=1}^{${n}}i^2`,
    `\\int_0^{${n}}x^2\\,dx`,
    `\\lim_{x\\to${n}}\\frac{\\sin x}{x}`,
    `P(A_{${n}}\\mid B)=\\frac{P(A_{${n}}\\cap B)}{P(B)}`,
    `\\begin{pmatrix}${n}&1\\\\0&${n}\\end{pmatrix}`,
    `\\begin{aligned}f_${n}(x)&=x^2+${n}\\\\f'_${n}(x)&=2x\\end{aligned}`,
    `\\underbrace{x+${n}}_{\\text{中文标注}}`,
    `\\boxed{\\prod_{i=1}^{${n}}(1+x_i^2)=Q_${n}}`,
  ];
  return {
    id: `bench-${String(index + 1).padStart(2, "0")}`,
    expression: expressions[index % 10],
    display: index % 10 >= 2,
  };
});

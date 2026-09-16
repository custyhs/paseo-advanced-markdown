// Record real parser-to-PNG outcomes without interpreting them as visual QA.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MATH_READING_CORPUS, CORPUS_VERSION } from "../../tests/fixtures/math-reading.ts";
const index = process.argv.indexOf("--root");
const root = path.resolve(
  index < 0 ? fileURLToPath(new URL("../../", import.meta.url)) : process.argv[index + 1],
);
const require = createRequire(path.join(root, "package.json"));
const MarkdownIt = require("markdown-it");
const { markdownExtensions, MATH_INLINE, MATH_BLOCK } = await import(
  pathToFileURL(path.join(root, "shared/markdown/extensions.ts")).href
);
const { renderFormula, clearMathCache } = await import(
  pathToFileURL(path.join(root, "server/math/render.ts")).href
);
const parser = new MarkdownIt().use(markdownExtensions);
const results = [];
for (const fixture of MATH_READING_CORPUS) {
  const tokens = [];
  const collect = (token) => {
    if (token.type === MATH_INLINE || token.type === MATH_BLOCK) tokens.push(token);
    token.children?.forEach(collect);
  };
  parser.parse(fixture.source, {}).forEach(collect);
  assert.deepEqual(
    tokens.map((token) => token.meta.source),
    fixture.formulas.map((formula) => formula.source),
    `${fixture.id}: exact source ranges`,
  );
  assert.deepEqual(
    tokens.map((token) => token.content.trim()),
    fixture.formulas.map((formula) => formula.tex.trim()),
    `${fixture.id}: render bodies`,
  );
  const formulas = [];
  const previousFont = process.env.PASEO_ADVANCED_MARKDOWN_FONT;
  if (fixture.environment === "missing-font") {
    clearMathCache();
    process.env.PASEO_ADVANCED_MARKDOWN_FONT = "/path/does-not-exist/math-reading-probe.otf";
  }
  for (const token of tokens) {
    const output = await renderFormula({
      expression: token.content,
      display: token.meta.display,
      color: "#dedede",
    });
    formulas.push({
      exactSource: token.meta.source,
      texSource: token.meta.texSource ?? null,
      display: token.meta.display,
      ok: output.ok,
      ...(output.ok
        ? {
            width: output.width,
            height: output.height,
            pngBytes: Buffer.byteLength(output.png, "base64"),
          }
        : { reason: output.reason }),
    });
  }
  if (fixture.environment === "missing-font") {
    if (previousFont === undefined) delete process.env.PASEO_ADVANCED_MARKDOWN_FONT;
    else process.env.PASEO_ADVANCED_MARKDOWN_FONT = previousFont;
  }
  results.push({ id: fixture.id, expectation: fixture.expectation, formulas });
}
process.stdout.write(
  `${JSON.stringify({ measuredAt: new Date().toISOString(), root, corpus: CORPUS_VERSION, results }, null, 2)}\n`,
);

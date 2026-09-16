// Isolated experiment only: requires @mathjax/src@4.0.0 in --runtime directory.
// Never imports MathJax 4 into the deployed plugin or rewrites mathematical source.
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { MATH_READING_CORPUS } from "../../tests/fixtures/math-reading.ts";
const position = process.argv.indexOf("--runtime");
if (position < 0) throw new Error("Pass --runtime /absolute/isolated/npm-directory");
const root = path.resolve(process.argv[position + 1], "node_modules");
const load = (relative) => import(pathToFileURL(path.join(root, relative)).href);
const { mathjax } = await load("@mathjax/src/mjs/mathjax.js");
const { TeX } = await load("@mathjax/src/mjs/input/tex.js");
const { SVG } = await load("@mathjax/src/mjs/output/svg.js");
const { liteAdaptor } = await load("@mathjax/src/mjs/adaptors/liteAdaptor.js");
const { RegisterHTMLHandler } = await load("@mathjax/src/mjs/handlers/html.js");
const { MathJaxNewcmFont } = await load("@mathjax/mathjax-newcm-font/mjs/svg.js");
await load("@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js");
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const cases = ["long-polynomial", "user-delta", "aligned", "matrix", "long-inline"];
const results = [];
for (const id of cases) {
  const fixture = MATH_READING_CORPUS.find((item) => item.id === id);
  const expression = fixture.formulas[0].tex;
  const sourceHash = createHash("sha256").update(expression).digest("hex");
  for (const width of [320, 800]) {
    for (const mode of ["display-overflow", "display-linebreak", "inline-break", "inline-single"]) {
      const start = performance.now();
      const tex = new TeX({ packages: ["base", "ams"] });
      const svg = new SVG({
        fontCache: "none",
        fontData: MathJaxNewcmFont,
        displayOverflow: mode === "display-linebreak" ? "linebreak" : "overflow",
        linebreaks: { inline: mode === "inline-break", width: "100%" },
      });
      const document = mathjax.document("", { InputJax: tex, OutputJax: svg });
      try {
        const node = document.convert(expression, {
          display: mode.startsWith("display"),
          em: 16,
          ex: 8,
          containerWidth: width,
        });
        const markup = adaptor.outerHTML(node);
        const nodes = adaptor.tags(node, "svg");
        results.push({
          id,
          width,
          mode,
          sourceHash,
          sourceUnchanged: expression === fixture.formulas[0].tex,
          elapsedMs: performance.now() - start,
          svgCount: nodes.length,
          topLevelSvgCount: node.children.filter((item) => item.kind === "svg").length,
          outputBytes: Buffer.byteLength(markup),
          textNodes: adaptor.tags(node, "text").length,
          foreignObjectNodes: adaptor.tags(node, "foreignObject").length,
          pathNodes: adaptor.tags(node, "path").length,
          mathErrors: adaptor.tags(node, "merror").length,
          bounds: nodes.map((item) => ({
            width: adaptor.getAttribute(item, "width"),
            height: adaptor.getAttribute(item, "height"),
            viewBox: adaptor.getAttribute(item, "viewBox"),
          })),
        });
      } catch (error) {
        results.push({
          id,
          width,
          mode,
          sourceHash,
          error: String(error),
          elapsedMs: performance.now() - start,
        });
      } finally {
        document.clear();
      }
    }
  }
}
process.stdout.write(
  `${JSON.stringify({ measuredAt: new Date().toISOString(), version: "4.0.0", font: "mathjax-newcm 4.0.0", note: "SVG typesetting only, no production sanitizer/raster/visual acceptance", results }, null, 2)}\n`,
);

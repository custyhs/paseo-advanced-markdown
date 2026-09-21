import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import { viewerIdentity } from "../client/viewer-identity.js";
import {
  markdownExtensions,
  MATH_BLOCK,
  MATH_INLINE,
  MERMAID_BLOCK,
} from "../shared/markdown/extensions.js";

type Node = {
  type: string;
  key: string;
  index?: number;
  tokenIndex?: number;
  content: string;
  sourceMeta?: { source?: string };
  children: Node[];
};
type Parse = (
  source: string,
  render: (nodes: Node[]) => Node[],
  markdown: InstanceType<typeof MarkdownIt>,
) => Node[];

// Exercise the real dependency parser without importing React Native. Its unpatched
// keys change on every parse, so identity cannot accidentally depend on React keys.
const require = createRequire(import.meta.url);
const bundled = buildSync({
  entryPoints: [require.resolve("react-native-markdown-display/src/lib/parser.js")],
  bundle: true,
  format: "cjs",
  platform: "node",
  write: false,
});
const parserModule = { exports: {} as { default: Parse } };
runInNewContext(bundled.outputFiles[0].text, {
  module: parserModule,
  exports: parserModule.exports,
});
const parse = parserModule.exports.default;
const markdown = new MarkdownIt().use(markdownExtensions);

function entries(source: string) {
  const found: { id: string; key: string; source: string; node: Node; parents: Node[] }[] = [];
  const root: Node = { type: "body", key: "root", content: "", children: [] };
  const visit = (node: Node, parents: Node[]) => {
    if ([MATH_INLINE, MATH_BLOCK, MERMAID_BLOCK].includes(node.type)) {
      const kind = node.type === MERMAID_BLOCK ? "diagram" : "formula";
      const exactSource = node.sourceMeta?.source ?? node.content;
      found.push({
        id: viewerIdentity(kind, node, parents, exactSource),
        key: node.key,
        source: exactSource,
        node,
        parents,
      });
    }
    node.children.forEach((child) => {
      visit(child, [node, ...parents]);
    });
  };
  parse(source, (nodes) => nodes, markdown).forEach((node) => {
    visit(node, [root]);
  });
  return found;
}

describe("viewer identity across Markdown parses", () => {
  it("keeps formula and diagram identities when streaming appends text and rebuilds React keys", () => {
    const source = "First $x^2$.\n\n```mermaid\ngraph TD\nA-->B\n```\n";
    const before = entries(source);
    const after = entries(`${source}\nMore $y$ arrives.`);
    expect(before).toHaveLength(2);
    expect(after).toHaveLength(3);
    for (const [index, original] of before.entries()) {
      expect(after[index].key).not.toBe(original.key);
      expect(after[index].id).toBe(original.id);
    }
  });

  it("distinguishes repeated content within a paragraph and in nested containers", () => {
    const source =
      "$x$ and $x$.\n\n> $x$\n\n- $x$\n- $x$\n\n```mermaid\ngraph TD\nA-->B\n```\n\n```mermaid\ngraph TD\nA-->B\n```";
    const parsed = entries(source);
    expect(parsed).toHaveLength(7);
    expect(new Set(parsed.map(({ id }) => id)).size).toBe(parsed.length);
    expect(entries(`${source}\n\nA later paragraph.`).map(({ id }) => id)).toEqual(
      parsed.map(({ id }) => id),
    );
  });

  it("changes identity when content or original delimiters change at the same path", () => {
    const dollar = entries("$x$")[0];
    const changed = entries("$y$")[0];
    const parenthesized = entries("\\(x\\)")[0];
    expect(changed.id).not.toBe(dollar.id);
    expect(parenthesized.id).not.toBe(dollar.id);
  });

  it("separates content kinds even when their source and AST path match", () => {
    const { node, parents, source, id } = entries("$x$")[0];
    expect(viewerIdentity("diagram", node, parents, source)).not.toBe(id);
  });
});

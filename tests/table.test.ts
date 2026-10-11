import { build } from "esbuild";
import MarkdownIt, { type MarkdownIt as MarkdownParser } from "markdown-it";
import { beforeAll, describe, expect, it } from "vitest";
import { markdownExtensions } from "../shared/markdown/extensions.js";
import { tableSourcePlugin } from "../shared/markdown/table-source.js";
import {
  tableSourceAnchor,
  tableToMarkdown,
  tableToTsv,
  type TableNode,
} from "../shared/markdown/table.js";

// Use the same Markdown-it -> cleanup -> AST pipeline as the actual client.
let parse: (
  source: string,
  render: (nodes: TableNode[]) => TableNode[],
  md: MarkdownParser,
) => TableNode[];
beforeAll(async () => {
  const bundle = await build({
    entryPoints: ["node_modules/react-native-markdown-display/src/lib/parser.js"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  parse = (
    await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
    )
  ).default;
});

function tables(source: string): TableNode[] {
  const md = new MarkdownIt({ html: false, typographer: false, linkify: true }).use(
    markdownExtensions,
  );
  const found: TableNode[] = [];
  function visit(nodes: TableNode[]): void {
    for (const node of nodes) {
      if (node.type === "table") found.push(node);
      else visit(node.children);
    }
  }
  visit(parse(source, (nodes) => nodes, md));
  return found;
}

const richTable = [
  "| Feature | Value |",
  "| :--- | ---: |",
  "| [Guide](https://example.com/guide) | **important** and *emphasis* |",
  "| `a*b` | $x^2$ |",
  "| a \\| b | ~~old~~ &amp; new |",
].join("\n");

describe("table source copying through the real renderer parser", () => {
  it("preserves links, emphasis, code, math, alignment, and escaped pipes", () => {
    const [table] = tables(`Before\n\n${richTable}\n\nAfter`);
    expect(tableToMarkdown(table)).toBe(richTable);
    expect(tableSourceAnchor(table)).toBe(richTable);
    expect(tableToTsv(table)).toBe(
      "Feature\tValue\nGuide\timportant and emphasis\na*b\tx^2\na | b\told & new",
    );
  });

  it("preserves original table line endings", () => {
    const source = richTable.replaceAll("\n", "\r\n");
    const [table] = tables(`Before\r\n\r\n${source}\r\n\r\nAfter`);
    expect(tableToMarkdown(table)).toBe(source);
    expect(tableSourceAnchor(table)).toBe(source);
  });

  it("copies blockquote and list tables as standalone Markdown and keeps the original anchor", () => {
    const containers = [
      richTable
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n"),
      richTable
        .split("\n")
        .map((line, index) => `${index ? "  " : "- "}${line}`)
        .join("\n"),
      richTable
        .split("\n")
        .map((line, index) => `> ${index ? "  " : "- "}${line}`)
        .join("\n"),
    ];
    for (const source of containers) {
      const [table] = tables(source);
      expect(tableToMarkdown(table)).toBe(richTable);
      expect(tableSourceAnchor(table)).toBe(source);
      expect(tables(tableToMarkdown(table)!)).toHaveLength(1);
    }
  });

  it("includes only referenced definitions, including collapsed and shortcut links", () => {
    const source = [
      "| A | B |",
      "| --- | --- |",
      "| [Project][docs] | [Index][] and [API] |",
      "| `[unused]` | \\[unused] |",
    ].join("\n");
    const definitions = [
      '[docs]: <https://example.com/docs> "Docs title"',
      "[index]: https://example.com/index",
      "[api]: https://example.com/api",
    ];
    const [table] = tables(
      `${source}\n\n${definitions.join("\n\n")}\n\n[unused]: https://unused.example`,
    );
    expect(tableToMarkdown(table)).toBe(`${source}\n\n${definitions.join("\n\n")}`);
    expect(tableSourceAnchor(table)).toBe(source);
    expect(tableToTsv(tables(tableToMarkdown(table)!)[0])).toBe(tableToTsv(table));
  });

  it("handles definitions before tables, multiline titles, duplicate labels, and nested definitions", () => {
    const definition = '[docs]: https://example.com/docs\n  "First title"';
    const tableSource = "| A |\n| --- |\n| [Project][DOCS] |";
    const source = `> ${definition.replaceAll("\n", "\n> ")}\n>\n${tableSource
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")}\n\n[docs]: https://wrong.example`;
    const [table] = tables(source);
    expect(tableToMarkdown(table)).toBe(`${tableSource}\n\n${definition}`);
    expect(source).toContain(tableSourceAnchor(table));
  });

  it("does not append direct-link or unrelated table reference definitions", () => {
    const first = "| A |\n| --- |\n| [same URL](https://example.com) |";
    const second = "| B |\n| --- |\n| [ref] |";
    const definition = "[ref]: https://example.com";
    const parsed = tables(`${first}\n\n${second}\n\n${definition}`);
    expect(parsed).toHaveLength(2);
    expect(tableToMarkdown(parsed[0])).toBe(first);
    expect(tableToMarkdown(parsed[1])).toBe(`${second}\n\n${definition}`);
  });

  it("does not leak source or definitions when the parser is reused", () => {
    const md = new MarkdownIt().use(tableSourcePlugin);
    md.parse("[ref]: https://example.com", {});
    const source = "| A |\n| --- |\n| [ref] |";
    const token = md.parse(source, {}).find((token) => token.type === "table_open");
    expect(token?.meta?.tableMarkdown).toBe(source);
    expect(token?.meta?.tableAnchor).toBe(source);
  });

  it("does not invent Markdown when source metadata is missing or invalid", () => {
    for (const sourceMeta of [undefined, null, "text", {}, { tableMarkdown: 42 }]) {
      const table: TableNode = { children: [], sourceMeta };
      expect(tableToMarkdown(table)).toBeUndefined();
      expect(tableSourceAnchor(table)).toBeUndefined();
    }
  });

  it("keeps spreadsheet cells intact when inline text contains tabs or line breaks", () => {
    const [table] = tables("| A | B |\n| --- | --- |\n| one&#9;two&#10;three&#13;four | `x\ty` |");
    expect(tableToTsv(table)).toBe("A\tB\none two three four\tx y");
  });
});

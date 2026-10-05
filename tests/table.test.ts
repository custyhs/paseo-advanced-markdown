import { describe, expect, it } from "vitest";
import { tableToMarkdown, tableToTsv, type TableNode } from "../shared/markdown/table.js";

// Mirror the shape react-native-markdown-display hands the table rule:
// table -> thead/tbody -> tr -> th|td -> inline (whose content is the cell text).
function cell(text: string): TableNode {
  return { content: "", children: [{ content: text, children: [] }] };
}
function row(cells: string[]): TableNode {
  return { content: "", children: cells.map(cell) };
}
function section(rows: TableNode[]): TableNode {
  return { content: "", children: rows };
}
function table(header: string[], ...rows: string[][]): TableNode {
  return { content: "", children: [section([row(header)]), section(rows.map(row))] };
}

describe("table serialization", () => {
  it("re-serializes a table to GFM with a header separator row", () => {
    const node = table(["Provider", "Model"], ["OpenAI", "gpt"], ["Anthropic", "claude"]);
    expect(tableToMarkdown(node)).toBe(
      "| Provider | Model |\n| --- | --- |\n| OpenAI | gpt |\n| Anthropic | claude |",
    );
  });

  it("escapes pipes inside cells", () => {
    const node = table(["Expr", "Value"], ["a | b", "1"]);
    expect(tableToMarkdown(node)).toContain("| a \\| b | 1 |");
  });

  it("serializes to TSV with no escaping of pipes and tabs replaced", () => {
    const node = table(["A", "B"], ["x | y", "1\t2"]);
    expect(tableToTsv(node)).toBe("A\tB\nx | y\t1 2");
  });

  it("keeps multi-node cell text in order", () => {
    const node: TableNode = {
      content: "",
      children: [
        section([
          {
            content: "",
            children: [
              {
                content: "",
                children: [
                  {
                    content: "",
                    children: [
                      { content: "fuse_", children: [] },
                      { content: "seg", children: [] },
                    ],
                  },
                  { content: "/full_v8", children: [] },
                ],
              },
            ],
          },
        ]),
      ],
    };
    expect(tableToTsv(node)).toBe("fuse_seg/full_v8");
  });
});

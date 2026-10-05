// Serialization for parsed GFM tables, kept free of React Native imports so it
// can be unit tested and reused by the table renderer's copy actions.

/** The parsed shape these helpers need; the full AST node satisfies it. */
export interface TableNode {
  content?: string;
  children: TableNode[];
}

/** Concatenates every descendant's text, matching how the cells render. */
function nodeText(node: TableNode): string {
  return (node.content ?? "") + node.children.map(nodeText).join("");
}

function tableRows(table: TableNode): TableNode[] {
  return table.children.flatMap((section) => section.children);
}

/** Serializes a parsed table back to GFM so it can be pasted elsewhere. */
export function tableToMarkdown(table: TableNode): string {
  const lines = tableRows(table).map((row, rowIndex) => {
    const cells = row.children.map((cell) => nodeText(cell).replace(/\|/g, "\\|"));
    const line = `| ${cells.join(" | ")} |`;
    // markdown-it marks the header with th_open, so row 0 is always the header.
    if (rowIndex !== 0) return line;
    return `${line}\n| ${cells.map(() => "---").join(" | ")} |`;
  });
  return lines.join("\n");
}

/** Serializes a parsed table to TSV so spreadsheets paste it into columns. */
export function tableToTsv(table: TableNode): string {
  return tableRows(table)
    .map((row) => row.children.map((cell) => nodeText(cell).replace(/\t/g, " ")).join("\t"))
    .join("\n");
}

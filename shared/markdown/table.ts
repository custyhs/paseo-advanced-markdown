// Copy helpers are free of React Native imports and consume the renderer's AST.

/** The parsed shape these helpers need; the full AST node satisfies it. */
export interface TableNode {
  type?: string;
  content?: string;
  sourceMeta?: unknown;
  children: TableNode[];
}

/** Concatenates visible cell text, keeping explicit breaks as word separators. */
function nodeText(node: TableNode): string {
  if (node.type === "softbreak" || node.type === "hardbreak") return " ";
  return (node.content ?? "") + node.children.map(nodeText).join("");
}

function tableRows(table: TableNode): TableNode[] {
  return table.children.flatMap((section) => section.children);
}

function sourceField(table: TableNode, field: "tableMarkdown" | "tableAnchor"): string | undefined {
  const meta = table.sourceMeta;
  if (typeof meta !== "object" || meta === null || !(field in meta)) return undefined;
  const value = (meta as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Return preserved Markdown, never a lossy reconstruction from rendered text. */
export function tableToMarkdown(table: TableNode): string | undefined {
  return sourceField(table, "tableMarkdown");
}

/** Locate this table in the original message even when copy adds reference definitions. */
export function tableSourceAnchor(table: TableNode): string | undefined {
  return sourceField(table, "tableAnchor");
}

/** Plain text for spreadsheets: tabs and line breaks inside cells cannot create new cells. */
export function tableToTsv(table: TableNode): string {
  return tableRows(table)
    .map((row) => row.children.map((cell) => nodeText(cell).replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\n");
}

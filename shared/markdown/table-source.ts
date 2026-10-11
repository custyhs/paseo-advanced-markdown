import type { MarkdownIt, StateBlock, Token } from "markdown-it";

export interface TableSourceMeta {
  /** Standalone table plus the reference definitions needed to paste it. */
  tableMarkdown: string;
  /** Unmodified range in the message, including any enclosing container prefix. */
  tableAnchor: string;
}

interface SourceLine {
  text: string;
  ending: string;
}
interface ParseContext {
  lines: SourceLine[];
  references: Map<string, string>;
}

const TABLE_CONTEXT = Symbol("table-source");

function sourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  for (const match of source.matchAll(pattern)) {
    if (!match[0]) break;
    lines.push({ text: match[1], ending: match[2] });
  }
  return lines;
}

function context(state: StateBlock): ParseContext | undefined {
  return state.env[TABLE_CONTEXT] as ParseContext | undefined;
}

/** Read while blockquote/list offsets are active, before the block parser restores them. */
function standaloneSource(state: StateBlock, start: number, end: number): string {
  const lines = state.getLines(start, end, state.blkIndent, false).split("\n");
  const original = context(state)?.lines;
  return lines
    .map(
      (line, index) =>
        line + (index < lines.length - 1 ? (original?.[start + index]?.ending ?? "\n") : ""),
    )
    .join("");
}

function sourceAnchor(state: StateBlock, start: number, end: number): string {
  const lines = context(state)?.lines;
  if (!lines) {
    const first = state.src.lastIndexOf("\n", state.bMarks[start] - 1) + 1;
    return state.src.slice(first, state.eMarks[end - 1]);
  }
  return lines
    .slice(start, end)
    .map((line, index) => line.text + (index < end - start - 1 ? line.ending : ""))
    .join("");
}

function usedReferences(tokens: Token[], labels: Set<string>): void {
  for (const token of tokens) {
    // Markdown-it 15 records the resolved label only on actual reference links.
    // Inspecting parsed tokens avoids mistaking code or escaped brackets for links.
    if (
      (token.type === "link_open" || token.type === "image") &&
      typeof token.meta?.label === "string"
    ) {
      labels.add(token.meta.label);
    }
    if (token.children) usedReferences(token.children, labels);
  }
}

/** Preserve table Markdown before AST conversion discards the source syntax. */
export function tableSourcePlugin(md: MarkdownIt): void {
  const tableRule = md.block.ruler.__rules__.find((rule) => rule.name === "table");
  const referenceRule = md.block.ruler.__rules__.find((rule) => rule.name === "reference");
  if (!tableRule || !referenceRule)
    throw new Error("Required Markdown table rules are unavailable");
  const table = tableRule.fn;
  const reference = referenceRule.fn;

  md.core.ruler.before("normalize", "table_original_source", (state) => {
    state.env[TABLE_CONTEXT] = {
      lines: sourceLines(state.src),
      references: new Map<string, string>(),
    } satisfies ParseContext;
  });
  md.block.ruler.at(
    "table",
    (state, start, end, silent) => {
      const firstToken = state.tokens.length;
      if (!table(state, start, end, silent)) return false;
      if (!silent) {
        state.tokens[firstToken].meta = {
          ...state.tokens[firstToken].meta,
          tableMarkdown: standaloneSource(state, start, state.line),
          tableAnchor: sourceAnchor(state, start, state.line),
        } satisfies TableSourceMeta;
      }
      return true;
    },
    { alt: tableRule.alt },
  );
  md.block.ruler.at(
    "reference",
    (state, start, end, silent) => {
      if (!reference(state, start, end, silent)) return false;
      if (!silent) {
        const token = state.tokens[state.tokens.length - 1];
        const label = token.meta?.label;
        const references = context(state)?.references;
        // CommonMark resolves duplicate definitions to the first occurrence.
        if (typeof label === "string" && references && !references.has(label)) {
          references.set(label, standaloneSource(state, start, state.line));
        }
      }
      return true;
    },
    { alt: referenceRule.alt },
  );
  md.core.ruler.after("inline", "table_reference_sources", (state) => {
    const references = (state.env[TABLE_CONTEXT] as ParseContext | undefined)?.references;
    if (!references?.size) return;
    let tableToken: Token | undefined;
    let labels = new Set<string>();
    for (const token of state.tokens) {
      if (token.type === "table_open") {
        tableToken = token;
        labels = new Set<string>();
      } else if (token.type === "table_close" && tableToken) {
        const definitions = [...labels].flatMap((label) => {
          const source = references.get(label);
          return source === undefined ? [] : [source];
        });
        if (definitions.length && tableToken.meta) {
          tableToken.meta.tableMarkdown += `\n\n${definitions.join("\n\n")}`;
        }
        tableToken = undefined;
      } else if (tableToken) {
        usedReferences([token], labels);
      }
    }
  });
}

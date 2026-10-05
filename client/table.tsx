// A GFM row is a flex row, so nothing lines its cells up with the rows around
// it. Every cell in a column gets the same flex basis and grow factor, derived
// from the column's text, so all rows resolve to the same column widths. A
// column never gets narrower than its longest word and holds a few words per
// line before wrapping; a table whose columns cannot fit at that width scrolls
// horizontally inside the message instead of squeezing every column to width/N.
// Estimates run slightly wide so semibold headers do not break mid-word.
import { ScrollView, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { tableToMarkdown, tableToTsv } from "../shared/markdown/table.js";
import type { ASTNode } from "./generated/markdown.js";
import { ActionBar } from "./action-bar.js";

const CHARACTER_WIDTH_EM = 0.62;
const MIN_COLUMN_EM = 4;
const WRAP_COLUMN_EM = 5;
const MAX_COLUMN_EM = 16;
// Matches the border on the plugin's markdown `th` / `td` styles.
const CELL_BORDER_WIDTH = 1;
const WORD_BREAK = /[\s-]+/;
const OVERFLOW_EPSILON = 1;
export const TABLE_CELL_PADDING = 6;

interface TableColumn {
  minWidth: number;
  preferredWidth: number;
}

const TableColumnsContext = createContext<readonly TableColumn[]>([]);

// Container nodes (th, td, textgroup, link) carry no `content`, despite the type.
function nodeText(node: ASTNode): string {
  return (node.content ?? "") + node.children.map(nodeText).join("");
}

function tableColumns(table: ASTNode, fontSize: number): TableColumn[] {
  const rows = table.children.flatMap((section) => section.children);
  const firstRow = rows[0];
  if (!firstRow) return [];
  const columns = firstRow.children.map(() => ({ longestWord: 0, longestText: 0 }));
  for (const row of rows) {
    row.children.forEach((cell, index) => {
      const column = columns[index];
      if (!column) return;
      const text = nodeText(cell);
      const longestWord = text
        .split(WORD_BREAK)
        .reduce((max, word) => Math.max(max, word.length), 0);
      column.longestWord = Math.max(column.longestWord, longestWord);
      column.longestText = Math.max(column.longestText, text.length);
    });
  }
  const chrome = TABLE_CELL_PADDING * 2 + CELL_BORDER_WIDTH;
  const toWidth = (em: number) =>
    Math.ceil(Math.min(MAX_COLUMN_EM, Math.max(MIN_COLUMN_EM, em)) * fontSize) + chrome;
  return columns.map(({ longestWord, longestText }) => {
    const wordEm = longestWord * CHARACTER_WIDTH_EM;
    const textEm = longestText * CHARACTER_WIDTH_EM;
    return {
      minWidth: toWidth(Math.max(wordEm, Math.min(textEm, WRAP_COLUMN_EM))),
      preferredWidth: toWidth(textEm),
    };
  });
}

export function MarkdownTable({
  table,
  fontSize,
  frameStyle,
  theme,
  compact,
  children,
}: {
  table: ASTNode;
  fontSize: number;
  frameStyle: ViewStyle;
  theme: PluginTheme;
  compact: boolean;
  children: ReactNode;
}) {
  const columns = useMemo(() => tableColumns(table, fontSize), [table, fontSize]);
  const toast = useToast();
  const copy = useCallback(
    async (text: string, label: string) => {
      try {
        await copyText(text);
        toast.show(`${label} copied`, { variant: "success" });
      } catch {
        toast.error(`Unable to copy ${label}.`);
      }
    },
    [toast],
  );
  // Sized explicitly so the content is not laid out from unwrapped text width.
  const contentStyle = useMemo(
    () => ({
      width: columns.reduce((width, column) => width + column.minWidth, 0),
      minWidth: "100%" as const,
    }),
    [columns],
  );
  const [frameWidth, setFrameWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const overflows = frameWidth > 0 && contentWidth > frameWidth + OVERFLOW_EPSILON;
  return (
    <View style={{ alignSelf: "stretch" }}>
      <ScrollView
        // Android only shows a persistent scrollbar that was on when the view was
        // created; turning it on later leaves the bar hidden until the first
        // scroll. Remount once overflow is known.
        key={overflows ? "overflows" : "fits"}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator
        persistentScrollbar={overflows}
        onLayout={(event: LayoutChangeEvent) => {
          const width = event.nativeEvent.layout.width;
          if (width > 0) setFrameWidth(width);
        }}
        onContentSizeChange={(width: number) => {
          if (width > 0) setContentWidth(width);
        }}
        style={frameStyle}
        contentContainerStyle={contentStyle}
      >
        <View style={{ flex: 1 }}>
          <TableColumnsContext.Provider value={columns}>{children}</TableColumnsContext.Provider>
        </View>
      </ScrollView>
      <ActionBar
        theme={theme}
        compact={compact}
        actions={[
          {
            key: "copy-markdown",
            icon: "Copy",
            label: "Copy table",
            onPress: () => void copy(tableToMarkdown(table), "Table"),
          },
          {
            key: "copy-tsv",
            icon: "Copy",
            label: "Copy as TSV",
            onPress: () => void copy(tableToTsv(table), "Table (TSV)"),
          },
        ]}
      />
    </View>
  );
}

export function MarkdownTableCell({
  cell,
  cellStyle,
  children,
}: {
  cell: ASTNode;
  cellStyle: ViewStyle;
  children: ReactNode;
}) {
  const column = useContext(TableColumnsContext)[cell.index];
  const widthStyle = useMemo(
    () =>
      column
        ? { flexBasis: column.minWidth, flexGrow: column.preferredWidth, flexShrink: 0 }
        : undefined,
    [column],
  );
  return <View style={[cellStyle, widthStyle]}>{children}</View>;
}

import {
  cloneElement,
  useCallback,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Text, View, type TextStyle } from "react-native";
import { Formula, type FormulaProps } from "./formula.js";
import { MathLayoutContext } from "./math-context.js";
import { splitInlineTree } from "./inline-segments.js";

/** A block boundary owned by the Markdown tree, including inside table cells. */
export function MathTextGroup({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const [width, setWidth] = useState(0);
  const [overflow, setOverflow] = useState<ReadonlySet<string>>(new Set());
  const reportOverflow = useCallback((id: string, value: boolean) => {
    setOverflow((previous) => {
      if (previous.has(id) === value) return previous;
      const next = new Set(previous);
      if (value) next.add(id);
      else next.delete(id);
      // Streaming replaces formula identities; bound stale entries in mounted groups.
      if (next.size > 512) next.delete(next.values().next().value as string);
      return next;
    });
  }, []);
  const context = useMemo(() => ({ width, reportOverflow }), [width, reportOverflow]);
  const segments = splitInlineTree(
    children,
    (element) =>
      element.type === Formula && overflow.has((element.props as FormulaProps).formulaId),
    (element, ancestors) => {
      const link = [...ancestors]
        .reverse()
        .find(
          (ancestor) => typeof (ancestor.props as { onPress?: unknown }).onPress === "function",
        );
      return cloneElement(element as ReactElement<FormulaProps>, {
        promoted: true,
        onOpenLink: link ? (link.props as { onPress: () => void }).onPress : undefined,
      });
    },
  );
  return (
    <MathLayoutContext.Provider value={context}>
      <View
        style={{ width: "100%", minWidth: 0 }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {segments.map((segment, index) =>
          segment.kind === "block" ? (
            segment.node
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: ordered fragments of the same Markdown textgroup; runs are deliberately remounted on promotion.
            <Text key={`run:${index}`} selectable style={style}>
              {segment.nodes}
            </Text>
          ),
        )}
      </View>
    </MathLayoutContext.Provider>
  );
}

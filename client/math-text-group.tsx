import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Platform, StyleSheet, Text, View, type TextProps, type TextStyle } from "react-native";
import { Formula, type FormulaProps } from "./formula.js";
import { MathInlineLineHeightContext, MathLayoutContext } from "./math-context.js";
import type { InlineFormulaLayout } from "./math-layout.js";
import { attachFollowingPunctuation, splitInlineTree } from "./inline-segments.js";
import { inlineRunLineHeight, withInlineLineHeight } from "./inline-text.js";

const isText = (element: ReactElement) => element.type === Text;

function formulaIdsIn(children: ReactNode, ids = new Set<string>()): Set<string> {
  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    if (child.type === Formula) ids.add((child.props as FormulaProps).formulaId);
    else if (child.props.children != null) formulaIdsIn(child.props.children, ids);
  });
  return ids;
}

/** A block boundary owned by the Markdown tree, including inside table cells. */
export function MathTextGroup({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const [width, setWidth] = useState(0);
  const [metrics, setMetrics] = useState<ReadonlyMap<string, InlineFormulaLayout>>(new Map());
  const currentIds = useMemo(() => formulaIdsIn(children), [children]);
  const reportLayout = useCallback(
    (id: string, value: InlineFormulaLayout | undefined) => {
      setMetrics((previous) => {
        const old = previous.get(id);
        if (old?.promote === value?.promote && old?.lineHeight === value?.lineHeight)
          return previous;
        const next = new Map(previous);
        if (value) next.set(id, value);
        else next.delete(id);
        // A live formula still needs its measurement to leave the loading placeholder.
        for (const key of next.keys()) if (!currentIds.has(key)) next.delete(key);
        return next;
      });
    },
    [currentIds],
  );
  const context = useMemo(() => ({ width, reportLayout }), [width, reportLayout]);
  const segments = attachFollowingPunctuation(
    splitInlineTree(
      children,
      (element) =>
        element.type === Formula &&
        metrics.get((element.props as FormulaProps).formulaId)?.promote === true,
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
    ),
  );
  const baseLineHeight = style?.lineHeight ?? (style?.fontSize ? style.fontSize * 1.5 : 0);
  const native = Platform.OS === "ios" || Platform.OS === "android";
  return (
    <MathLayoutContext.Provider value={context}>
      <View
        style={{ width: "100%", minWidth: 0 }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {segments.map((segment, index) => {
          if (segment.kind === "block") {
            return cloneElement(segment.node as ReactElement<FormulaProps>, {
              trailingPunctuation: segment.trailing,
            });
          }
          const lineHeight = native
            ? inlineRunLineHeight(segment.nodes, baseLineHeight, (element) => {
                const formula =
                  element.type === Formula ? (element.props as FormulaProps) : undefined;
                const originalStyle =
                  formula?.textStyle ??
                  (isText(element)
                    ? StyleSheet.flatten((element.props as TextProps).style)
                    : undefined);
                const originalHeight =
                  originalStyle?.lineHeight ??
                  (originalStyle?.fontSize ? originalStyle.fontSize * 1.5 : 0);
                return Math.max(
                  originalHeight,
                  formula ? (metrics.get(formula.formulaId)?.lineHeight ?? 0) : 0,
                );
              }) || 24
            : baseLineHeight;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: ordered fragments of the same Markdown textgroup; runs are deliberately remounted on promotion.
            <MathInlineLineHeightContext.Provider key={`run:${index}`} value={lineHeight}>
              <Text selectable style={native ? [style, { lineHeight }] : style}>
                {native ? withInlineLineHeight(segment.nodes, isText, lineHeight) : segment.nodes}
              </Text>
            </MathInlineLineHeightContext.Provider>
          );
        })}
      </View>
    </MathLayoutContext.Provider>
  );
}

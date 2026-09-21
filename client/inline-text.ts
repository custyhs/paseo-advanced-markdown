import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type { StyleProp, TextStyle } from "react-native";

export function inlineRunLineHeight(
  children: ReactNode,
  base: number,
  nodeLineHeight: (element: ReactElement) => number | undefined,
): number {
  let height = base;
  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    height = Math.max(height, nodeLineHeight(child) ?? base);
    if (child.props.children != null) {
      height = Math.max(height, inlineRunLineHeight(child.props.children, base, nodeLineHeight));
    }
  });
  return height;
}

/** Every native text fragment must share the run's paragraph style, even in links/emphasis. */
export function withInlineLineHeight(
  children: ReactNode,
  isText: (element: ReactElement) => boolean,
  lineHeight: number,
): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ children?: ReactNode; style?: StyleProp<TextStyle> }>(child))
      return child;
    const text = isText(child);
    if (!text && child.props.children == null) return child;
    return cloneElement(
      child,
      text ? { style: [child.props.style, { lineHeight }] } : {},
      withInlineLineHeight(child.props.children, isText, lineHeight),
    );
  });
}

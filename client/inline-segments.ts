import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export type InlineSegment =
  | { kind: "inline"; nodes: ReactNode[] }
  | { kind: "block"; node: ReactNode };

/** Split at complete math nodes, reopening surrounding emphasis/link wrappers. */
export function splitInlineTree(
  children: ReactNode,
  isBlock: (element: ReactElement) => boolean,
  block: (element: ReactElement, ancestors: ReactElement[]) => ReactNode,
  ancestors: ReactElement[] = [],
): InlineSegment[] {
  const result: InlineSegment[] = [];
  const append = (segment: InlineSegment) => {
    const last = result.at(-1);
    if (segment.kind === "inline" && last?.kind === "inline") last.nodes.push(...segment.nodes);
    else result.push(segment);
  };
  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) {
      if (child != null) append({ kind: "inline", nodes: [child] });
    } else if (isBlock(child)) {
      append({ kind: "block", node: block(child, ancestors) });
    } else if (child.props.children != null) {
      const inner = splitInlineTree(child.props.children, isBlock, block, [...ancestors, child]);
      if (inner.every((segment) => segment.kind === "inline")) {
        append({ kind: "inline", nodes: [child] });
      } else {
        inner.forEach((segment, index) => {
          append(
            segment.kind === "block"
              ? segment
              : {
                  kind: "inline",
                  nodes: [
                    cloneElement(
                      child,
                      // biome-ignore lint/suspicious/noArrayIndexKey: deterministic split fragments of one immutable AST wrapper, not a reorderable list.
                      { key: `${child.key ?? "wrapper"}:${index}` },
                      segment.nodes,
                    ),
                  ],
                },
          );
        });
      }
    } else append({ kind: "inline", nodes: [child] });
  });
  return result;
}

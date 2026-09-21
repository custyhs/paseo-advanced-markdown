import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export type InlineSegment =
  | { kind: "inline"; nodes: ReactNode[] }
  | { kind: "block"; node: ReactNode; trailing?: ReactNode[] };

const FOLLOWING_PUNCTUATION = /^[，。；：！？、）】》」』,.;:!?)\]]+/;

function takePunctuationPrefix(children: ReactNode): {
  punctuation: ReactNode[];
  remaining: ReactNode[];
} {
  const punctuation: ReactNode[] = [];
  const remaining: ReactNode[] = [];
  let stopped = false;
  Children.forEach(children, (child) => {
    if (child == null) return;
    if (stopped) {
      remaining.push(child);
      return;
    }
    if (typeof child === "string") {
      const prefix = child.match(FOLLOWING_PUNCTUATION)?.[0] ?? "";
      if (prefix) punctuation.push(prefix);
      const rest = child.slice(prefix.length);
      if (rest) {
        remaining.push(rest);
        stopped = true;
      }
    } else if (isValidElement<{ children?: ReactNode }>(child) && child.props.children != null) {
      const inner = takePunctuationPrefix(child.props.children);
      if (inner.punctuation.length) {
        punctuation.push(
          inner.remaining.length ? cloneElement(child, undefined, inner.punctuation) : child,
        );
      }
      if (inner.remaining.length) {
        remaining.push(
          inner.punctuation.length ? cloneElement(child, undefined, inner.remaining) : child,
        );
        stopped = true;
      }
    } else {
      remaining.push(child);
      stopped = true;
    }
  });
  return { punctuation, remaining };
}

/** Keep adjacent closing punctuation with promoted math without rewriting its source. */
export function attachFollowingPunctuation(segments: InlineSegment[]): InlineSegment[] {
  const result: InlineSegment[] = [];
  for (const segment of segments) {
    const previous = result.at(-1);
    if (segment.kind === "inline" && previous?.kind === "block") {
      const { punctuation, remaining } = takePunctuationPrefix(segment.nodes);
      if (punctuation.length) {
        result[result.length - 1] = {
          ...previous,
          trailing: [...(previous.trailing ?? []), ...punctuation],
        };
        if (remaining.length) result.push({ kind: "inline", nodes: remaining });
        continue;
      }
    }
    if (segment.kind !== "inline" || segment.nodes.length) result.push(segment);
  }
  return result;
}

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

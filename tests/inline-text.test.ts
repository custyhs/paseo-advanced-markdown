import {
  Children,
  createElement as h,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it } from "vitest";
import { inlineRunLineHeight, withInlineLineHeight } from "../client/inline-text.js";
import { splitInlineTree } from "../client/inline-segments.js";

type TextProps = { style?: unknown; onPress?: () => void; children?: ReactNode };
const isText = (element: ReactElement) => element.type === "text";

function textNodes(children: ReactNode): ReactElement<TextProps>[] {
  const nodes: ReactElement<TextProps>[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<TextProps>(child)) return;
    if (isText(child)) nodes.push(child);
    nodes.push(...textNodes(child.props.children));
  });
  return nodes;
}

describe("native inline text line height", () => {
  it("overrides every inherited text line height while preserving emphasis and link actions", () => {
    const onPress = () => {};
    const regular = { color: "#eee", lineHeight: 24 };
    const bold = [{ fontWeight: "700" }, { lineHeight: 20 }];
    const link = { color: "#0a0", lineHeight: 22 };
    const original = h(
      "text",
      { style: regular },
      "before",
      h("text", { style: bold }, "bold", h("text", { style: link, onPress }, "linked")),
      "after",
    );
    const nodes = textNodes(withInlineLineHeight(original, isText, 47));
    expect(nodes.map((node) => node.props.style)).toEqual([
      [regular, { lineHeight: 47 }],
      [bold, { lineHeight: 47 }],
      [link, { lineHeight: 47 }],
    ]);
    expect(nodes[2].props.onPress).toBe(onPress);
    expect(nodes[2].props.children).toEqual(["linked"]);
    expect(original.props.style).toBe(regular);
    expect(textNodes(original)[1].props.style).toBe(bold);
  });

  it("does not change formula geometry or source when reserving text space", () => {
    const formula = h("math", {
      formulaId: "fraction",
      source: "$a/b$",
      textStyle: { lineHeight: 24 },
    });
    const result = withInlineLineHeight(["before", formula, "after"], isText, 47);
    const nodes = Children.toArray(result);
    expect((nodes[1] as ReactElement).props).toBe(formula.props);
    expect(nodes[0]).toBe("before");
    expect(nodes[2]).toBe("after");
  });

  it("uses only formulas present in each run, excluding promoted and stale formulas", () => {
    const required = new Map([
      ["short", 30],
      ["fraction", 47],
      ["tall", 133],
      ["removed", 250],
    ]);
    const height = (element: ReactElement) =>
      element.type === "math"
        ? required.get((element.props as { formulaId: string }).formulaId)
        : undefined;
    const tree = [
      h("text", null, "before", h("math", { formulaId: "short" })),
      h("math", { formulaId: "tall" }),
      h("text", null, h("text", null, h("math", { formulaId: "fraction" })), "after"),
    ];
    const segments = splitInlineTree(
      tree,
      (element) =>
        element.type === "math" && (element.props as { formulaId: string }).formulaId === "tall",
      (element) => element,
    );
    expect(
      segments.map((segment) =>
        segment.kind === "inline" ? inlineRunLineHeight(segment.nodes, 24, height) : "block",
      ),
    ).toEqual([30, "block", 47]);
    expect(inlineRunLineHeight("ordinary prose", 24, height)).toBe(24);
  });
});

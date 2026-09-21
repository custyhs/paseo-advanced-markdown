import {
  Children,
  createElement as h,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it } from "vitest";
import {
  attachFollowingPunctuation,
  splitInlineTree,
  type InlineSegment,
} from "../client/inline-segments.js";

describe("promoted formula reading order", () => {
  const math = h("math", { key: "formula" }, "x+y");
  const split = (children: ReactNode) =>
    splitInlineTree(
      children,
      (e) => e.type === "math",
      (e) => e,
    );
  it("reopens nested emphasis around the complete formula, outside text wrappers", () => {
    const result = split(
      h("strong", { key: "bold" }, "before", h("em", { key: "italic" }, math, "after")),
    );
    expect(result.map((s) => s.kind)).toEqual(["inline", "block", "inline"]);
    expect(result[1]).toEqual({ kind: "block", node: math });
    const first =
      result[0].kind === "inline"
        ? (result[0].nodes[0] as ReactElement<{ children: ReactNode[] }>)
        : null;
    expect(first?.type).toBe("strong");
    expect(first?.props.children).toEqual(["before"]);
    const last =
      result[2].kind === "inline"
        ? (result[2].nodes[0] as ReactElement<{
            children: ReactElement<{ children: ReactNode[] }>[];
          }>)
        : null;
    expect(last?.type).toBe("strong");
    expect(last?.props.children[0].type).toBe("em");
    expect(last?.props.children[0].props.children).toEqual(["after"]);
  });
  it("retains the link context and exact expression for promoted math", () => {
    const contexts: ReactElement[][] = [];
    const result = splitInlineTree(
      h("a", { href: "https://example.org" }, math),
      () => false,
      (e) => e,
    );
    expect(result[0].kind).toBe("inline");
    splitInlineTree(
      h("a", { href: "https://example.org" }, math),
      (e) => e.type === "math",
      (e, a) => {
        contexts.push(a);
        return e;
      },
    );
    expect(contexts[0][0].props).toMatchObject({ href: "https://example.org" });
  });
  it("keeps ordinary content in one unchanged text run", () => {
    const strong = h("strong", null, "a");
    expect(split(["before", strong, "after"])).toEqual([
      { kind: "inline", nodes: ["before", strong, "after"] },
    ]);
  });
});

describe("punctuation following promoted formulas", () => {
  const math = h("math", { key: "formula", source: "$x+y$" }, "x+y");
  const text = (node: ReactNode): string => {
    let value = "";
    Children.forEach(node, (child) => {
      if (typeof child === "string" || typeof child === "number") value += child;
      else if (isValidElement<{ children?: ReactNode }>(child)) value += text(child.props.children);
    });
    return value;
  };
  const following = (nodes: ReactNode[]): InlineSegment[] => [
    { kind: "block", node: math },
    { kind: "inline", nodes },
  ];
  const trailing = (segment: InlineSegment) => (segment.kind === "block" ? segment.trailing : []);
  const inline = (segment: InlineSegment) => (segment.kind === "inline" ? segment.nodes : []);

  it("moves a punctuation-only run onto the formula and removes the empty run", () => {
    const result = attachFollowingPunctuation(following(["。"]));
    expect(result).toEqual([{ kind: "block", node: math, trailing: ["。"] }]);
    expect((result[0] as { node: ReactElement<{ source: string }> }).node.props.source).toBe(
      "$x+y$",
    );
  });

  it("moves the complete consecutive Chinese and English closing punctuation prefix", () => {
    const punctuation = "，。；：！？、）】》」』,.;:!?)]";
    const result = attachFollowingPunctuation(following([`${punctuation}正文`]));
    expect(text(trailing(result[0]))).toBe(punctuation);
    expect(text(inline(result[1]))).toBe("正文");
  });

  it("preserves Text, emphasis and link props on both sides of a split wrapper", () => {
    const onPress = () => undefined;
    const style = { color: "purple", fontSize: 18 };
    const link = h("a", { key: "link", href: "https://example.org", onPress }, "。）正文");
    const wrapper = h("Text", { key: "text", style }, h("strong", { key: "bold" }, link));
    const after = h("em", { key: "after" }, "余文");
    const result = attachFollowingPunctuation(following([wrapper, after]));
    expect(text(trailing(result[0]))).toBe("。）");
    expect(text(inline(result[1]))).toBe("正文余文");
    for (const nodes of [trailing(result[0]), inline(result[1])]) {
      const outer = nodes?.[0] as ReactElement<{ children: ReactElement[]; style: unknown }>;
      expect(outer.type).toBe("Text");
      expect(outer.key).toBe("text");
      expect(outer.props.style).toBe(style);
      const strong = outer.props.children[0] as ReactElement<{ children: ReactElement[] }>;
      expect(strong.type).toBe("strong");
      expect(strong.key).toBe("bold");
      const movedLink = strong.props.children[0] as ReactElement<{
        href: string;
        onPress: () => void;
      }>;
      expect(movedLink.type).toBe("a");
      expect(movedLink.key).toBe("link");
      expect(movedLink.props.href).toBe("https://example.org");
      expect(movedLink.props.onPress).toBe(onPress);
    }
    expect(inline(result[1])[1]).toBe(after);
    expect(text(wrapper)).toBe("。）正文");
  });

  it("collects consecutive punctuation across adjacent differently styled nodes", () => {
    const first = h("Text", { style: { color: "red" } }, "，");
    const second = h("strong", null, h("em", null, "。）剩余"));
    const result = attachFollowingPunctuation(following([first, second]));
    expect(trailing(result[0])?.[0]).toBe(first);
    expect(text(trailing(result[0]))).toBe("，。）");
    expect(text(inline(result[1]))).toBe("剩余");
  });

  it.each([" 。", "\n。", "\t，", "正文，", "（说明）", "(note)"])(
    "does not skip a leading boundary in %j",
    (source) => {
      const segments = following([h("Text", null, h("strong", null, source))]);
      const result = attachFollowingPunctuation(segments);
      expect(result).toEqual(segments);
      expect(result[0]).toBe(segments[0]);
      expect(result[1]).toBe(segments[1]);
    },
  );

  it("stops after punctuation when whitespace separates later punctuation", () => {
    const result = attachFollowingPunctuation(following(["，", " \n。正文"]));
    expect(text(trailing(result[0]))).toBe("，");
    expect(inline(result[1])).toEqual([" \n。正文"]);
  });

  it("does not cross a number or an opaque leaf element to reach punctuation", () => {
    for (const boundary of [0, h("image", { key: "image" })]) {
      const segments = following([boundary, "。"]);
      expect(attachFollowingPunctuation(segments)).toEqual(segments);
    }
  });

  it("attaches punctuation to the immediately preceding block among consecutive formulas", () => {
    const next = h("math", { key: "next" }, "a+b");
    const last = h("math", { key: "last" }, "c+d");
    const result = attachFollowingPunctuation([
      { kind: "block", node: math },
      { kind: "block", node: next },
      { kind: "inline", nodes: ["。"] },
      { kind: "block", node: last },
      { kind: "inline", nodes: ["，剩余"] },
    ]);
    expect(result).toEqual([
      { kind: "block", node: math },
      { kind: "block", node: next, trailing: ["。"] },
      { kind: "block", node: last, trailing: ["，"] },
      { kind: "inline", nodes: ["剩余"] },
    ]);
  });

  it("preserves an existing suffix without mutating input segments or their nodes", () => {
    const existing = h("Text", null, "）");
    const nodes = ["。剩余"];
    const segments: InlineSegment[] = [
      { kind: "block", node: math, trailing: [existing] },
      { kind: "inline", nodes },
    ];
    Object.freeze(nodes);
    segments.forEach(Object.freeze);
    Object.freeze(segments);
    const result = attachFollowingPunctuation(segments);
    expect(trailing(result[0])).toEqual([existing, "。"]);
    expect(inline(result[1])).toEqual(["剩余"]);
    expect(trailing(segments[0])).toEqual([existing]);
    expect(nodes).toEqual(["。剩余"]);
    expect(attachFollowingPunctuation(result)).toEqual(result);
  });

  it("retains surrounding reading order and does not move ordinary inline punctuation", () => {
    const before: InlineSegment = { kind: "inline", nodes: ["前文。"] };
    const result = attachFollowingPunctuation([before, ...following(["，正文"])]);
    expect(result[0]).toBe(before);
    expect(text(trailing(result[1]))).toBe("，");
    expect(text(inline(result[2]))).toBe("正文");
  });
});

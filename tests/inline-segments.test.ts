import { createElement as h, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { splitInlineTree } from "../client/inline-segments.js";

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

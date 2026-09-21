import { getEventListeners } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enableHorizontalDrag } from "../client/web.js";

const platform = vi.hoisted(() => ({ OS: "web" }));
vi.mock("react-native", () => ({ Platform: platform }));

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  platform.OS = "web";
});

class BrowserTarget extends EventTarget {
  override removeEventListener(
    ...[type, listener, options]: Parameters<EventTarget["removeEventListener"]>
  ) {
    // Node 24 fails to remove capture listeners with boolean `true`; browsers
    // accept it. Normalize the public DOM shorthand for this Node-only fixture.
    super.removeEventListener(
      type,
      listener,
      typeof options === "boolean" ? { capture: options } : options,
    );
  }
}

function fixture({ clientWidth = 300, scrollWidth = 900, scrollLeft = 120 } = {}) {
  const ownerDocument = Object.assign(new BrowserTarget(), {
    defaultView: new BrowserTarget(),
    getSelection: () => ({ removeAllRanges: vi.fn() }),
  });
  const node = Object.assign(new BrowserTarget(), {
    ownerDocument,
    clientWidth,
    scrollWidth,
    scrollLeft,
    style: { cursor: "", userSelect: "" },
  });
  const scrollView = { getScrollableNode: vi.fn(() => node) };
  const install = () => {
    const cleanup = enableHorizontalDrag(scrollView);
    if (cleanup) cleanups.push(cleanup);
    return cleanup;
  };
  return { node, ownerDocument, scrollView, install };
}

function mouse(
  target: EventTarget,
  type: "mousedown" | "mousemove" | "mouseup" | "click",
  clientX: number,
  { clientY = 50, button = 0, buttons = type === "mouseup" || type === "click" ? 0 : 1 } = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pageX: { value: clientX },
    pageY: { value: clientY },
    button: { value: button },
    buttons: { value: buttons },
    detail: { value: type === "click" ? 1 : 0 },
  });
  target.dispatchEvent(event);
  return event;
}

describe("horizontal image dragging", () => {
  it("pans from the initial offset even outside the image and clamps both edges", () => {
    const { node, ownerDocument, install } = fixture();
    install();
    mouse(node, "mousedown", 200);
    mouse(ownerDocument, "mousemove", 150);
    expect(node.scrollLeft).toBe(170);
    mouse(ownerDocument, "mousemove", -1_000);
    expect(node.scrollLeft).toBe(600);
    mouse(ownerDocument, "mousemove", 2_000);
    expect(node.scrollLeft).toBe(0);
    mouse(ownerDocument, "mouseup", 2_000);
    mouse(ownerDocument, "mousemove", 150, { buttons: 0 });
    expect(node.scrollLeft).toBe(0);
  });

  it("does not pan or cancel a click within the 6px threshold", () => {
    const { node, ownerDocument, install } = fixture();
    install();
    const click = vi.fn();
    node.addEventListener("click", click);
    mouse(node, "mousedown", 100);
    const move = mouse(ownerDocument, "mousemove", 106);
    expect(node.scrollLeft).toBe(120);
    expect(move.defaultPrevented).toBe(false);
    mouse(ownerDocument, "mouseup", 106);
    expect(mouse(node, "click", 106).defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledOnce();
  });

  it("suppresses a dragged click even after returning to the press origin", () => {
    const { node, ownerDocument, install } = fixture();
    install();
    const click = vi.fn();
    node.addEventListener("click", click);
    mouse(node, "mousedown", 100);
    mouse(ownerDocument, "mousemove", 50);
    expect(node.scrollLeft).toBe(170);
    mouse(ownerDocument, "mousemove", 100);
    expect(node.scrollLeft).toBe(120);
    mouse(ownerDocument, "mouseup", 100);
    expect(mouse(node, "click", 100).defaultPrevented).toBe(true);
    expect(click).not.toHaveBeenCalled();
  });

  it("preserves an ordinary click without movement", () => {
    const { node, ownerDocument, install } = fixture();
    install();
    const click = vi.fn();
    node.addEventListener("click", click);
    mouse(node, "mousedown", 100);
    mouse(ownerDocument, "mouseup", 100);
    expect(mouse(node, "click", 100).defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledOnce();
    expect(node.scrollLeft).toBe(120);
  });

  it("allows the next click after suppressing a completed drag", () => {
    const { node, ownerDocument, install } = fixture();
    install();
    const click = vi.fn();
    node.addEventListener("click", click);
    mouse(node, "mousedown", 100);
    mouse(ownerDocument, "mousemove", 50);
    mouse(ownerDocument, "mouseup", 50);
    mouse(node, "click", 50);
    expect(click).not.toHaveBeenCalled();
    mouse(node, "mousedown", 80);
    mouse(ownerDocument, "mouseup", 80);
    expect(mouse(node, "click", 80).defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledOnce();
  });

  it("leaves non-overflowing content and its mouse events untouched", () => {
    const { node, ownerDocument, install } = fixture({ scrollWidth: 300, scrollLeft: 0 });
    install();
    const click = vi.fn();
    node.addEventListener("click", click);
    expect(mouse(node, "mousedown", 100).defaultPrevented).toBe(false);
    expect(mouse(ownerDocument, "mousemove", 20).defaultPrevented).toBe(false);
    mouse(ownerDocument, "mouseup", 20);
    expect(mouse(node, "click", 20).defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledOnce();
    expect(node.scrollLeft).toBe(0);
  });

  it("removes document listeners and stops moving when unmounted during a drag", () => {
    const { node, ownerDocument, install } = fixture();
    node.style.cursor = "pointer";
    node.style.userSelect = "auto";
    const cleanup = install();
    expect(cleanup).toBeTypeOf("function");
    mouse(node, "mousedown", 100);
    mouse(ownerDocument, "mousemove", 50);
    expect(node.scrollLeft).toBe(170);
    cleanup?.();
    expect(getEventListeners(ownerDocument, "mousemove")).toHaveLength(0);
    expect(getEventListeners(ownerDocument, "mouseup")).toHaveLength(0);
    expect(getEventListeners(ownerDocument.defaultView, "blur")).toHaveLength(0);
    expect(getEventListeners(node, "mousedown")).toHaveLength(0);
    expect(getEventListeners(node, "click")).toHaveLength(0);
    expect(getEventListeners(node, "dragstart")).toHaveLength(0);
    expect(node.style).toEqual({ cursor: "pointer", userSelect: "auto" });
    mouse(ownerDocument, "mousemove", 0);
    mouse(ownerDocument, "mouseup", 0);
    expect(node.scrollLeft).toBe(170);
    expect(mouse(node, "click", 0).defaultPrevented).toBe(false);
  });

  it.each(["ios", "android"])("does not inspect or modify native %s scroll views", (os) => {
    platform.OS = os;
    const { scrollView, ownerDocument, node, install } = fixture();
    expect(install()).toBeUndefined();
    expect(scrollView.getScrollableNode).not.toHaveBeenCalled();
    expect(getEventListeners(node, "mousedown")).toHaveLength(0);
    expect(getEventListeners(ownerDocument, "mousemove")).toHaveLength(0);
  });
});

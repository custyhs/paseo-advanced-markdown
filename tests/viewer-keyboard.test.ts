import { describe, expect, it, vi } from "vitest";
import { viewerKeyboardEntry } from "../client/web.js";

const platform = vi.hoisted(() => ({ OS: "web" }));
vi.mock("react-native", () => ({ Platform: platform }));

function event(key: string, repeat = false) {
  return { key, repeat, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

describe("viewer keyboard activation", () => {
  it("opens on Space release so the focused modal close control cannot consume the same press", () => {
    const open = vi.fn();
    const reset = vi.fn();
    const entry = viewerKeyboardEntry(open, reset);
    const down = event(" ");
    entry.onKeyDownCapture?.(down);
    expect(open).not.toHaveBeenCalled();
    expect(reset).toHaveBeenCalledOnce();
    expect(down.preventDefault).toHaveBeenCalledOnce();
    expect(down.stopPropagation).toHaveBeenCalledOnce();
    const up = event(" ");
    entry.onKeyUpCapture?.(up);
    expect(open).toHaveBeenCalledOnce();
    expect(up.preventDefault).toHaveBeenCalledOnce();
    expect(up.stopPropagation).toHaveBeenCalledOnce();
  });

  it("opens once for Enter, suppressing repeated keydown and leaving Tab alone", () => {
    const open = vi.fn();
    const entry = viewerKeyboardEntry(open, vi.fn());
    entry.onKeyDownCapture?.(event("Enter"));
    entry.onKeyDownCapture?.(event("Enter", true));
    entry.onKeyUpCapture?.(event("Enter"));
    const tab = event("Tab");
    entry.onKeyDownCapture?.(tab);
    expect(open).toHaveBeenCalledOnce();
    expect(tab.preventDefault).not.toHaveBeenCalled();
  });

  it("does not install browser keyboard handlers on native clients", () => {
    platform.OS = "ios";
    try {
      expect(viewerKeyboardEntry(vi.fn(), vi.fn())).toEqual({});
    } finally {
      platform.OS = "web";
    }
  });
});

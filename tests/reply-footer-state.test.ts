import { describe, expect, it } from "vitest";
import { footerMode, formatEndTime } from "../client/reply-actions/footer-state.js";
import type { TurnView } from "../client/reply-actions/store.js";

const view = (over: Partial<TurnView> = {}): TurnView => ({
  turnId: "t1",
  isFinalReply: true,
  complete: true,
  unprotected: false,
  copyText: "x",
  endedAt: "2026-11-08T01:02:03.000Z",
  ...over,
});

describe("footerMode", () => {
  it("shows the footer only under the final owned reply of a complete turn", () => {
    expect(footerMode({ enabled: true, role: "owned", view: view() })).toBe("footer");
    expect(footerMode({ enabled: true, role: "owned", view: view({ unprotected: true }) })).toBe(
      "footer-with-warning",
    );
    expect(footerMode({ enabled: false, role: "owned", view: view() })).toBe("hidden");
    expect(footerMode({ enabled: true, role: "co-owned", view: view() })).toBe("hidden");
    expect(footerMode({ enabled: true, role: "owned", view: null })).toBe("hidden");
    expect(footerMode({ enabled: true, role: "owned", view: view({ isFinalReply: false }) })).toBe(
      "hidden",
    );
    expect(footerMode({ enabled: true, role: "owned", view: view({ complete: false }) })).toBe(
      "hidden",
    );
    expect(footerMode({ enabled: true, role: "owned", view: view(), hostNativeFooter: true })).toBe(
      "hidden",
    );
  });
});

describe("formatEndTime", () => {
  it("shows the time today and the date otherwise", () => {
    expect(
      formatEndTime(new Date(2026, 10, 8, 9, 5).toISOString(), new Date(2026, 10, 8, 23, 0)),
    ).toBe("09:05");
    expect(
      formatEndTime(new Date(2026, 10, 7, 23, 59).toISOString(), new Date(2026, 10, 8, 9, 0)),
    ).toBe("2026-11-07 23:59");
  });
});

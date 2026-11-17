import { describe, expect, it } from "vitest";
import { DEFAULT_MODULE_SETTINGS, MATH_SCALES, moduleSettings } from "../shared/settings.js";

import { moduleState } from "../client/module-state.js";

describe("formula-size settings", () => {
  it("enables math by default and leaves optional enhancements to Paseo", () => {
    expect(DEFAULT_MODULE_SETTINGS).toEqual({
      math: true,
      codeBlocks: false,
      tables: false,
      forkSafeReplies: true,
      fontScale: "default",
      mathScale: 1,
    });
  });

  it("notifies mounted consumers when only formula size changes", () => {
    moduleState.reset();
    let changes = 0;
    const unsubscribe = moduleState.subscribe(() => {
      changes++;
    });
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS, mathScale: 2 });
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS, mathScale: 2 });
    expect(changes).toBe(1);
    expect(moduleState.current.fontScale).toBe(DEFAULT_MODULE_SETTINGS.fontScale);
    unsubscribe();
    moduleState.reset();
  });
  it("ignores old Mermaid preferences without resetting unrelated preferences", () => {
    expect(moduleSettings.schema.parse({ math: false, mermaid: true, fontScale: "large" })).toEqual(
      {
        math: false,
        codeBlocks: false,
        tables: false,
        forkSafeReplies: true,
        fontScale: "large",
        mathScale: 1,
      },
    );
    expect(DEFAULT_MODULE_SETTINGS.mathScale).toBe(1);
    expect(DEFAULT_MODULE_SETTINGS.codeBlocks).toBe(false);
    expect(DEFAULT_MODULE_SETTINGS.tables).toBe(false);
  });

  it("strips a retired Mermaid field while retaining all supported saved values", () => {
    const supported = {
      math: false,
      codeBlocks: true,
      tables: true,
      forkSafeReplies: true,
      fontScale: "large",
      mathScale: 1.5,
    };
    for (const mermaid of [true, false, "old-value"]) {
      const parsed = moduleSettings.schema.parse({ ...supported, mermaid });
      expect(parsed).toEqual(supported);
      expect(parsed).not.toHaveProperty("mermaid");
    }
  });

  it.each(MATH_SCALES)("round-trips the %s formula-size preset independently", (mathScale) => {
    const stored = {
      math: true,
      codeBlocks: false,
      tables: false,
      forkSafeReplies: true,
      fontScale: "small",
      mathScale,
    };
    expect(moduleSettings.schema.parse(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it.each([0, -1, 0.85, 3, Number.NaN, Number.POSITIVE_INFINITY, "1.5", null])(
    "rejects unsupported formula size %s instead of silently changing the user's preference",
    (mathScale) => {
      expect(moduleSettings.schema.safeParse({ mathScale }).success).toBe(false);
    },
  );

  it("keeps Show original for Fork on for values saved before it existed", () => {
    const saved = {
      math: true,
      codeBlocks: false,
      tables: false,
      fontScale: "default",
      mathScale: 1,
    };
    expect(moduleSettings.schema.parse(saved).forkSafeReplies).toBe(true);
    expect(moduleSettings.schema.parse({ forkSafeReplies: false }).forkSafeReplies).toBe(false);
  });

  it("notifies when only Show original for Fork changes", () => {
    moduleState.reset();
    let changes = 0;
    const unsubscribe = moduleState.subscribe(() => {
      changes++;
    });
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS, forkSafeReplies: false });
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS, forkSafeReplies: false });
    expect(changes).toBe(1);
    unsubscribe();
    moduleState.reset();
  });
});

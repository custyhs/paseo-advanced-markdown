import { describe, expect, it } from "vitest";
import { DEFAULT_MODULE_SETTINGS, MATH_SCALES, moduleSettings } from "../shared/settings.js";

import { moduleState } from "../client/module-state.js";

describe("formula-size settings", () => {
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
  it("defaults old host records to 100% without resetting unrelated preferences", () => {
    expect(moduleSettings.schema.parse({ math: false, mermaid: true, fontScale: "large" })).toEqual(
      {
        math: false,
        mermaid: true,
        fontScale: "large",
        mathScale: 1,
      },
    );
    expect(DEFAULT_MODULE_SETTINGS.mathScale).toBe(1);
  });

  it.each(MATH_SCALES)("round-trips the %s formula-size preset independently", (mathScale) => {
    const stored = { math: true, mermaid: false, fontScale: "small", mathScale };
    expect(moduleSettings.schema.parse(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it.each([0, -1, 0.85, 3, Number.NaN, Number.POSITIVE_INFINITY, "1.5", null])(
    "rejects unsupported formula size %s instead of silently changing the user's preference",
    (mathScale) => {
      expect(moduleSettings.schema.safeParse({ mathScale }).success).toBe(false);
    },
  );
});

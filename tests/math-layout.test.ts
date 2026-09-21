import { describe, expect, it } from "vitest";
import { formulaScale, preferredFormulaScale } from "../client/formula-scale.js";
import {
  chooseMathDensity,
  fitFormula,
  inlineFormulaLayout,
  inspectorScale,
} from "../client/math-layout.js";
import { MATH_SCALES } from "../shared/settings.js";

describe("formula reading size", () => {
  it("applies text size, native text scale and the saved math preference once", () => {
    const reading = { fontSize: 20, fontScale: 1.2, block: true, display: true, platform: "web" };
    expect(preferredFormulaScale(reading)).toBe(1.5);
    expect(preferredFormulaScale({ ...reading, mathScale: 1.5 })).toBe(2.25);
    expect(preferredFormulaScale({ ...reading, mathScale: 1.5, platform: "ios" })).toBe(2.8125);
  });

  it.each(MATH_SCALES)(
    "keeps inline size independent from the native display calibration at %s",
    (mathScale) => {
      const inline = {
        fontSize: 16,
        fontScale: 1,
        block: false,
        display: false,
        platform: "ios",
        mathScale,
      };
      expect(preferredFormulaScale(inline)).toBe(mathScale);
      expect(preferredFormulaScale({ ...inline, block: true })).toBe(mathScale);
      expect(preferredFormulaScale({ ...inline, block: true, display: true })).toBe(
        mathScale * 1.25,
      );
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "uses a finite default for invalid reading inputs %s",
    (value) => {
      expect(
        preferredFormulaScale({
          fontSize: value,
          fontScale: value,
          mathScale: value,
          block: false,
          display: false,
          platform: "web",
        }),
      ).toBe(1);
    },
  );

  it("preserves the legacy layout until all formula callers opt into container measurement", () => {
    const props = {
      fontSize: 16,
      fontScale: 1,
      block: false,
      display: false,
      platform: "web",
      maxInlineWidth: 100,
      width: 400,
    };
    expect(formulaScale(props)).toBe(0.25);
    expect(formulaScale({ ...props, block: true })).toBe(1);
  });
});

describe("formula inspection", () => {
  it("fits diagrams independently of the scaled reading size and keeps 100% tied to reading", () => {
    const diagram = {
      width: 1000,
      height: 500,
      preferredScale: 0.4,
      viewportWidth: 800,
      viewportHeight: 600,
      fitCeiling: 1,
    };
    expect(inspectorScale({ ...diagram, zoom: "fit" })).toBe(0.8);
    expect(inspectorScale({ ...diagram, zoom: 1 })).toBe(0.4);
    expect(
      inspectorScale({ ...diagram, viewportWidth: 2000, viewportHeight: 2000, zoom: "fit" }),
    ).toBe(1);
  });
  it("fits both dimensions with bounded enlargement and keeps manual zoom when the viewport changes", () => {
    const formula = { width: 400, height: 300, preferredScale: 1.5 };
    const viewport = { viewportWidth: 500, viewportHeight: 300 };
    expect(inspectorScale({ ...formula, ...viewport, zoom: "fit" })).toBe(1);
    expect(inspectorScale({ ...formula, ...viewport, viewportHeight: 900, zoom: "fit" })).toBe(
      1.25,
    );
    expect(
      inspectorScale({ ...formula, viewportWidth: 2000, viewportHeight: 2000, zoom: "fit" }),
    ).toBe(2.25);
    expect(inspectorScale({ ...formula, ...viewport, zoom: 2 })).toBe(3);
    expect(inspectorScale({ ...formula, viewportWidth: 200, viewportHeight: 100, zoom: 2 })).toBe(
      3,
    );
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "retains reading size before valid inspector measurements or zoom %s",
    (value) => {
      const props = {
        width: 400,
        height: 300,
        preferredScale: 1.5,
        viewportWidth: 100,
        viewportHeight: 200,
      };
      expect(inspectorScale({ ...props, viewportWidth: value, zoom: "fit" })).toBe(1.5);
      expect(inspectorScale({ ...props, height: value, zoom: "fit" })).toBe(1.5);
      expect(inspectorScale({ ...props, zoom: value })).toBe(1.5);
    },
  );
});

describe("formula raster detail", () => {
  it("rounds effective screen demand up to a bounded bucket without requesting every resize", () => {
    expect(chooseMathDensity(1, 0.75)).toBe(1);
    expect(chooseMathDensity(2, 1)).toBe(2);
    expect(chooseMathDensity(3, 1.1)).toBe(4);
    expect(chooseMathDensity(3, 1.2)).toBe(4);
    expect(chooseMathDensity(3, 1.5)).toBe(6);
    expect(chooseMathDensity(3, 2.5)).toBe(8);
    expect(chooseMathDensity(3, 20)).toBe(8);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "uses the compatible 2x default for invalid density input %s",
    (value) => {
      expect(chooseMathDensity(value, 1)).toBe(2);
      expect(chooseMathDensity(3, value)).toBe(2);
    },
  );
});

describe("formula container fitting", () => {
  it("fits within the 15% shrink budget and otherwise keeps the saved reading size", () => {
    const formula = { width: 200, preferredScale: 1.5 };
    expect(fitFormula({ ...formula, availableWidth: 500 })).toEqual({
      scale: 1.5,
      overflow: false,
      measured: true,
    });
    expect(fitFormula({ ...formula, availableWidth: 255 })).toEqual({
      scale: 1.275,
      overflow: false,
      measured: true,
    });
    expect(fitFormula({ ...formula, availableWidth: 254 })).toEqual({
      scale: 1.5,
      overflow: true,
      measured: true,
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not promote or create a zero-sized image before valid width %s",
    (value) => {
      expect(fitFormula({ width: 200, preferredScale: 1.5, availableWidth: value })).toEqual({
        scale: 1.5,
        overflow: false,
        measured: false,
      });
      expect(fitFormula({ width: value, preferredScale: 1.5, availableWidth: 200 })).toEqual({
        scale: 1.5,
        overflow: false,
        measured: false,
      });
      expect(fitFormula({ width: 200, preferredScale: value, availableWidth: 200 })).toEqual({
        scale: 1,
        overflow: false,
        measured: false,
      });
    },
  );

  it("recomputes nested-width fit across every saved preset without stretching small formulas", () => {
    for (const mathScale of MATH_SCALES) {
      for (const fontSize of [16, 20, 24]) {
        const preferredScale = preferredFormulaScale({
          fontSize,
          fontScale: 1,
          mathScale,
          block: true,
          display: true,
          platform: "web",
        });
        expect(fitFormula({ width: 32, preferredScale, availableWidth: 160 })).toEqual({
          scale: preferredScale,
          overflow: false,
          measured: true,
        });
        const wide = fitFormula({ width: 400, preferredScale, availableWidth: 160 });
        expect(wide).toEqual({ scale: preferredScale, overflow: true, measured: true });
      }
    }
  });
});

describe("native inline formula height", () => {
  const tall = {
    height: 57.5,
    baseline: 26.490208984375,
    scale: 1,
    lineHeight: 24,
    fontScale: 1,
    platform: "ios",
  };

  it.each(["ios", "android"])(
    "promotes the reported tall fraction at both reading sizes on %s",
    (platform) => {
      for (const [scale, lineHeight] of [
        [1, 89],
        [1.5, 133],
      ]) {
        expect(inlineFormulaLayout({ ...tall, platform, scale })).toEqual({
          lineHeight,
          promote: true,
        });
      }
    },
  );

  it.each(["ios", "android"])(
    "keeps ordinary up/down arrows, fractions, and sums inline at 150%% on %s",
    (platform) => {
      const examples = [
        { label: "up/down arrows", height: 24, baseline: 17.9712, lineHeight: 46 },
        { label: "fraction", height: 23, baseline: 15.2192, lineHeight: 47 },
        { label: "sum", height: 21, baseline: 13.637408203124998, lineHeight: 43 },
      ];
      for (const { label, height, baseline, lineHeight } of examples) {
        expect(
          inlineFormulaLayout({ ...tall, platform, height, baseline, scale: 1.5 }),
          label,
        ).toEqual({ lineHeight, promote: false });
      }
    },
  );

  it.each(["ios", "android"])("keeps a short x_i inline at 150%% on %s", (platform) => {
    expect(
      inlineFormulaLayout({
        ...tall,
        platform,
        height: 12,
        baseline: 8.072,
        scale: 1.5,
      }),
    ).toEqual({ lineHeight: 24, promote: false });
  });

  it("keeps normalized line height and promotion stable under system text scaling", () => {
    const examples = [
      { height: 12, baseline: 8.072, lineHeight: 24, promote: false },
      { height: 24, baseline: 17.9712, lineHeight: 46, promote: false },
      { height: 23, baseline: 15.2192, lineHeight: 47, promote: false },
      { height: 21, baseline: 13.637408203124998, lineHeight: 43, promote: false },
      { height: 57.5, baseline: 26.490208984375, lineHeight: 133, promote: true },
    ];
    for (const fontScale of [1, 1.25, 1.5, 2]) {
      for (const { height, baseline, lineHeight, promote } of examples) {
        expect(
          inlineFormulaLayout({
            ...tall,
            height,
            baseline,
            scale: 1.5 * fontScale,
            fontScale,
          }),
        ).toEqual({ lineHeight, promote });
      }
    }
  });

  it("includes the image's downward baseline translation in its vertical extent", () => {
    const image = { ...tall, height: 20, baseline: 20 };
    expect(inlineFormulaLayout(image)).toEqual({ lineHeight: 24, promote: false });
    expect(inlineFormulaLayout({ ...image, baseline: 10 })).toEqual({
      lineHeight: 30,
      promote: false,
    });
    expect(inlineFormulaLayout({ ...image, height: 25, baseline: 0 })).toEqual({
      lineHeight: 50,
      promote: true,
    });
    expect(inlineFormulaLayout({ ...image, baseline: 30 })).toEqual({
      lineHeight: 24,
      promote: false,
    });
  });

  it("keeps exactly twice the base line height inline and promotes only beyond it", () => {
    const exact = { ...tall, height: 32, baseline: 16 };
    expect(inlineFormulaLayout(exact)).toEqual({ lineHeight: 48, promote: false });
    expect(inlineFormulaLayout({ ...exact, scale: 1.0001 })).toEqual({
      lineHeight: 49,
      promote: true,
    });
    expect(inlineFormulaLayout({ ...exact, scale: 2, fontScale: 2 })).toEqual({
      lineHeight: 48,
      promote: false,
    });
  });

  it("rounds layout height up without using that rounding to decide promotion", () => {
    const image = { ...tall, height: 32, lineHeight: 24.25 };
    expect(inlineFormulaLayout({ ...image, baseline: 15.625 })).toEqual({
      lineHeight: 49,
      promote: false,
    });
    expect(inlineFormulaLayout({ ...image, baseline: 15.375 })).toEqual({
      lineHeight: 49,
      promote: true,
    });
  });

  it("preserves web inline layout even for the reported tall fraction", () => {
    expect(inlineFormulaLayout({ ...tall, platform: "web", scale: 1.5 })).toEqual({
      lineHeight: 24,
      promote: false,
    });
    expect(inlineFormulaLayout({ ...tall, platform: "web", lineHeight: 30.5 })).toEqual({
      lineHeight: 30.5,
      promote: false,
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "waits for valid positive geometry and text metrics instead of promoting input %s",
    (value) => {
      for (const field of ["height", "scale", "lineHeight", "fontScale"] as const) {
        expect(inlineFormulaLayout({ ...tall, lineHeight: 30, [field]: value }), field).toEqual({
          lineHeight: field === "lineHeight" ? 24 : 30,
          promote: false,
        });
      }
      expect(inlineFormulaLayout({ ...tall, platform: "web", lineHeight: value })).toEqual({
        lineHeight: 24,
        promote: false,
      });
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not promote before a valid nonnegative baseline is available: %s",
    (baseline) => {
      expect(inlineFormulaLayout({ ...tall, baseline, lineHeight: 30 })).toEqual({
        lineHeight: 30,
        promote: false,
      });
    },
  );
});

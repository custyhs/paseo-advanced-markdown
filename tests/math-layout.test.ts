import { describe, expect, it } from "vitest";
import { formulaScale, preferredFormulaScale } from "../client/formula-scale.js";
import { chooseMathDensity, fitFormula, inspectorScale } from "../client/math-layout.js";
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
  it("fits both dimensions without stretching and keeps manual zoom when the viewport changes", () => {
    const formula = { width: 400, height: 300, preferredScale: 1.5 };
    const viewport = { viewportWidth: 500, viewportHeight: 300 };
    expect(inspectorScale({ ...formula, ...viewport, zoom: "fit" })).toBe(1);
    expect(inspectorScale({ ...formula, ...viewport, viewportHeight: 900, zoom: "fit" })).toBe(
      1.25,
    );
    expect(
      inspectorScale({ ...formula, viewportWidth: 2000, viewportHeight: 2000, zoom: "fit" }),
    ).toBe(1.5);
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

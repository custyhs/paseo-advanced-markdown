import { describe, expect, it } from "vitest";
import { fitScale } from "../server/mermaid/render.js";
import { MAX_IMAGE_EDGE, MAX_IMAGE_PIXELS } from "../shared/limits.js";

describe("diagram scale fitting", () => {
  it("keeps the crisp 2x scale for ordinary diagrams", () => {
    expect(fitScale(402, 102)).toBe(2);
    expect(fitScale(1000, 800)).toBe(2);
  });

  it("lowers the scale so tall or wide diagrams fit the pixel and edge budgets", () => {
    const tall = fitScale(788, 6206);
    expect(tall).not.toBeNull();
    expect(tall!).toBeLessThan(2);
    expect(788 * tall! * (6206 * tall!)).toBeLessThanOrEqual(MAX_IMAGE_PIXELS);
    expect(6206 * tall!).toBeLessThanOrEqual(MAX_IMAGE_EDGE);
    const wide = fitScale(5000, 300);
    expect(wide).not.toBeNull();
    expect(5000 * wide!).toBeLessThanOrEqual(MAX_IMAGE_EDGE);
  });

  it("refuses diagrams that would need less than the minimum scale", () => {
    expect(fitScale(20_000, 20_000)).toBeNull();
    expect(fitScale(0, 10)).toBeNull();
  });
});

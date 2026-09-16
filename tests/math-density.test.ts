import { describe, expect, it } from "vitest";
import { clearMathCache, renderFormula } from "../server/math/render.js";
import { mathRenderInput, mathRenderOutput } from "../shared/rpc.js";
import { MAX_IMAGE_EDGE, MAX_IMAGE_PIXELS } from "../shared/limits.js";
import { decodePng, inkCount } from "./helpers/png.js";

const request = { expression: String.raw`q_j+\frac{1}{2}`, display: false, color: "#123456" };

describe("math image density", () => {
  it("keeps old RPC requests and responses compatible", async () => {
    expect(mathRenderInput.parse(request)).toEqual(request);
    const result = await renderFormula(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.density).toBe(2);
    const { density: _, ...legacy } = result;
    expect(mathRenderOutput.safeParse(legacy).success).toBe(true);
    const pixels = decodePng(result.png);
    expect(pixels.width).toBe(result.width * 2);
    expect(pixels.height).toBe(result.height * 2);
  });

  it("increases real image detail without changing logical geometry or baseline", async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 6, 8].map((density) => renderFormula({ ...request, density })),
    );
    let geometry: unknown;
    let previousInk = 0;
    for (const result of results) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const current = [result.width, result.height, result.baseline];
      geometry ??= current;
      expect(current).toEqual(geometry);
      const pixels = decodePng(result.png);
      expect(Math.abs(pixels.width - result.width * result.density!)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(pixels.height - result.height * result.density!)).toBeLessThanOrEqual(0.5);
      const ink = inkCount(pixels.rgba);
      expect(ink).toBeGreaterThan(previousInk);
      previousInk = ink;
    }
  });

  it("rejects nonfinite density and clamps finite values before raster allocation", async () => {
    for (const density of [NaN, Infinity, -Infinity]) {
      expect(mathRenderInput.safeParse({ ...request, density }).success).toBe(false);
      expect(await renderFormula({ ...request, density })).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    for (const [requested, expected] of [
      [-3, 1],
      [0, 1],
      [1.1, 2],
      [3.5, 4],
      [1e12, 8],
    ]) {
      const result = await renderFormula({ ...request, density: requested });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.density).toBe(expected);
    }
  });

  it("returns a lower-density usable image when larger detail exceeds raster budgets", async () => {
    const result = await renderFormula({
      expression: String.raw`\rule{1100px}{900px}`,
      display: true,
      color: "#444444",
      density: 8,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.density).toBeLessThan(8);
    const pixels = decodePng(result.png);
    expect(pixels.width).toBeLessThanOrEqual(MAX_IMAGE_EDGE);
    expect(pixels.height).toBeLessThanOrEqual(MAX_IMAGE_EDGE);
    expect(pixels.width * pixels.height).toBeLessThanOrEqual(MAX_IMAGE_PIXELS);
  });

  it("separates cached density and theme variants and coalesces font-dependent work", async () => {
    clearMathCache();
    const low = await renderFormula({ ...request, density: 2 });
    const high = await renderFormula({ ...request, density: 4 });
    expect(high).not.toBe(low);
    expect(await renderFormula({ ...request, density: 4 })).toBe(high);
    expect(await renderFormula({ ...request, density: 4, color: "#ffffff" })).not.toBe(high);
    const same = await Promise.all(
      Array.from({ length: 8 }, () =>
        renderFormula({
          ...request,
          expression: String.raw`\text{中文密度}`,
          density: 3,
        }),
      ),
    );
    expect(same[0]?.ok).toBe(true);
    for (const output of same) expect(output).toBe(same[0]);
  });
});

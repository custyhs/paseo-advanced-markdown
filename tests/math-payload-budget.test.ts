import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResvgRenderOptions } from "@resvg/resvg-wasm";
import { MAX_IMAGE_BASE64 } from "../shared/limits.js";

const raster = vi.hoisted(() => ({
  densities: [] as number[],
  imagesFreed: 0,
  allTooLarge: false,
}));

vi.mock("@resvg/resvg-wasm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@resvg/resvg-wasm")>();
  return {
    ...actual,
    Resvg: function Rasterizer(svg: string, options?: ResvgRenderOptions) {
      const renderer = new actual.Resvg(svg, options);
      const render = renderer.render.bind(renderer);
      vi.spyOn(renderer, "render").mockImplementation(() => {
        const density = options?.fitTo?.mode === "zoom" ? options.fitTo.value : 1;
        raster.densities.push(density);
        const image = render();
        // Fault-inject an incompressible payload while preserving real typesetting,
        // SVG checks, raster allocation, and lower-density PNG output.
        if (raster.allTooLarge || density > 2) {
          vi.spyOn(image, "asPng").mockReturnValue(new Uint8Array(MAX_IMAGE_BASE64 * 0.75 + 1));
        }
        const free = image.free.bind(image);
        vi.spyOn(image, "free").mockImplementation(() => {
          raster.imagesFreed++;
          free();
        });
        return image;
      });
      return renderer;
    },
  };
});

import { clearMathCache, renderFormula } from "../server/math/render.js";
import { decodePng, inkCount } from "./helpers/png.js";

afterEach(() => {
  clearMathCache();
  raster.densities = [];
  raster.imagesFreed = 0;
  raster.allTooLarge = false;
});

describe("math RPC payload budget", () => {
  it("retains a real lower-detail image when higher-density PNGs exceed the payload limit", async () => {
    const result = await renderFormula({
      expression: "x+y",
      display: true,
      color: "#111111",
      density: 8,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.density).toBe(2);
    expect(result.png.length).toBeLessThanOrEqual(MAX_IMAGE_BASE64);
    expect(inkCount(decodePng(result.png).rgba)).toBeGreaterThan(30);
    expect(raster.densities).toEqual([8, 6, 4, 3, 2]);
    expect(raster.imagesFreed).toBe(raster.densities.length);
  });

  it("stops at minimum detail and releases every rejected image", async () => {
    raster.allTooLarge = true;
    expect(
      await renderFormula({ expression: "x+y", display: true, color: "#111111", density: 2 }),
    ).toEqual({ ok: false, reason: "too-large" });
    expect(raster.densities).toEqual([2, 1]);
    expect(raster.imagesFreed).toBe(2);
  });
});

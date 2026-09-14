// Adapted from paseo-math (Apache-2.0) tests/render.test.ts at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { clearMathCache, mathCacheSize, renderFormula } from "../server/math/render.js";
import type { MathRenderOutput } from "../shared/rpc.js";

type ImageOutput = Extract<MathRenderOutput, { ok: true }>;

async function render(
  expression: string,
  display = false,
  color = "#17202a",
): Promise<ImageOutput> {
  const result = await renderFormula({ expression, display, color });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Rendering failed: ${result.reason}`);
  return result;
}

// Decode actual renderer PNGs, rather than mocking WASM or inspecting SVG source.
export function decodePng(base64: string): {
  width: number;
  height: number;
  rgba: Uint8Array;
} {
  const png = Buffer.from(base64, "base64");
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0)
    throw new Error("Expected non-interlaced RGBA8 PNG");
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT")
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const filtered = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)]!;
    if (filter > 4) throw new Error("Invalid PNG filter");
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= 4 ? rgba[index - 4]! : 0;
      const up = y > 0 ? rgba[index - stride]! : 0;
      const upperLeft = x >= 4 && y > 0 ? rgba[index - stride - 4]! : 0;
      const prediction = left + up - upperLeft;
      const dl = Math.abs(prediction - left);
      const du = Math.abs(prediction - up);
      const dc = Math.abs(prediction - upperLeft);
      const paeth = dl <= du && dl <= dc ? left : du <= dc ? up : upperLeft;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : paeth;
      rgba[index] = (filtered[y * (stride + 1) + x + 1]! + predictor) & 255;
    }
  }
  return { width, height, rgba };
}

export function inkCount(rgba: Uint8Array): number {
  let count = 0;
  for (let index = 3; index < rgba.length; index += 4)
    if (rgba[index]! > 0) count++;
  return count;
}

describe("local math rasterization", () => {
  it("typesets real glyphs with 2x pixels and a descender-aware inline baseline", async () => {
    const result = await render("q_j + 2");
    const decoded = decodePng(result.png);
    expect(decoded.width).toBe(result.width * 2);
    expect(decoded.height).toBe(result.height * 2);
    expect(result.baseline).toBeGreaterThan(1);
    expect(result.baseline).toBeLessThan(result.height - 1);
    expect(inkCount(decoded.rgba)).toBeGreaterThan(30);
    // Padding remains transparent, not an opaque message-sized screenshot.
    expect(decoded.rgba[3]).toBe(0);
  });

  it("lays out display fractions and multiple aligned rows instead of literal TeX", async () => {
    const inline = await render(String.raw`\frac{p}{q}`);
    const display = await render(String.raw`\frac{p}{q}`, true);
    const aligned = await render(
      String.raw`\begin{aligned}p&=q+2\\r&=\frac{p}{q}\end{aligned}`,
      true,
    );
    expect(display.height).toBeGreaterThan(inline.height);
    expect(aligned.height).toBeGreaterThan(display.height);
    expect(inkCount(decodePng(aligned.png).rgba)).toBeGreaterThan(
      inkCount(decodePng(display.png).rgba),
    );
  });

  it("paints with the requested theme color", async () => {
    const light = decodePng((await render("x", false, "#ffffff")).png);
    let whiteInk = 0;
    for (let i = 0; i < light.rgba.length; i += 4) {
      if (light.rgba[i + 3]! > 200 && light.rgba[i]! > 200 && light.rgba[i + 1]! > 200)
        whiteInk++;
    }
    expect(whiteInk).toBeGreaterThan(10);
  });

  it("keeps invalid TeX and oversized input as source-fallback failures", async () => {
    expect(
      await renderFormula({ expression: String.raw`\unknownCommand{a}`, display: false, color: "#111111" }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await renderFormula({ expression: "x".repeat(4097), display: false, color: "#111111" }),
    ).toEqual({ ok: false, reason: "too-large" });
    expect(
      await renderFormula({ expression: String.raw`\href{https://x}{y}`, display: false, color: "#111111" }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("caches by expression, mode, and color and can be cleared", async () => {
    clearMathCache();
    const first = await render("a+b", false, "#123456");
    const again = await render("a+b", false, "#123456");
    expect(again).toBe(first);
    expect(mathCacheSize()).toBeGreaterThan(0);
    const dark = await render("a+b", false, "#fafafa");
    expect(dark).not.toBe(first);
    clearMathCache();
    expect(mathCacheSize()).toBe(0);
  });
});

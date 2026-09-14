import { inflateSync } from "node:zlib";
import { expect } from "vitest";

// Decode actual renderer PNGs, rather than mocking WASM or inspecting SVG source.
export function decodePng(base64: string): {
  width: number;
  height: number;
  rgba: Uint8Array;
} {
  const png = Buffer.from(base64, "base64");
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
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
  for (let index = 3; index < rgba.length; index += 4) if (rgba[index]! > 0) count++;
  return count;
}

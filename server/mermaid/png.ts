/** Reads the IHDR size of a PNG without decoding pixels. */
export function pngDimensions(png: Buffer): { width: number; height: number } | null {
  if (png.length < 24) return null;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!png.subarray(0, 8).equals(signature)) return null;
  if (png.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

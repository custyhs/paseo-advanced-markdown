import { MAX_IMAGE_EDGE, MAX_IMAGE_PIXELS } from "../../shared/limits.js";

/** Shared with the client policy; arbitrary inputs cannot create unlimited variants. */
export const MATH_DENSITIES = [1, 2, 3, 4, 6, 8] as const;

export function resolveMathDensity(requested: number | undefined): number | undefined {
  if (requested === undefined) return 2;
  if (!Number.isFinite(requested)) return undefined;
  const bounded = Math.max(1, Math.min(8, requested));
  return MATH_DENSITIES.find((density) => density >= bounded);
}

/** Check allocation bounds before constructing a rasterizer, including pixel rounding. */
export function mathDensityCandidates(width: number, height: number, requested: number): number[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  return MATH_DENSITIES.filter((density) => {
    if (density > requested) return false;
    const pixelsWide = Math.ceil(width * density);
    const pixelsHigh = Math.ceil(height * density);
    return (
      pixelsWide <= MAX_IMAGE_EDGE &&
      pixelsHigh <= MAX_IMAGE_EDGE &&
      pixelsWide * pixelsHigh <= MAX_IMAGE_PIXELS
    );
  }).reverse();
}

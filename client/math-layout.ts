/** Automatic fitting may not erase the user's reading-size preference. */
export const MIN_AUTOMATIC_MATH_FIT = 0.85;
export const MATH_DENSITY_BUCKETS = [1, 2, 3, 4, 6, 8] as const;

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Pixel density changes image detail, never logical dimensions or baseline. */
export function chooseMathDensity(pixelRatio: number, effectiveScale: number): number {
  if (!positive(pixelRatio) || !positive(effectiveScale)) return 2;
  const required = pixelRatio * effectiveScale;
  return MATH_DENSITY_BUCKETS.find((density) => density >= required) ?? 8;
}

export function fitFormula({
  width,
  preferredScale,
  availableWidth,
}: {
  width: number;
  preferredScale: number;
  availableWidth: number;
}): { scale: number; overflow: boolean; measured: boolean } {
  const scale = positive(preferredScale) ? preferredScale : 1;
  if (!positive(width) || !positive(availableWidth) || !positive(preferredScale)) {
    return { scale, overflow: false, measured: false };
  }
  const fit = availableWidth / width;
  if (fit >= scale) return { scale, overflow: false, measured: true };
  if (fit >= scale * MIN_AUTOMATIC_MATH_FIT) {
    return { scale: fit, overflow: false, measured: true };
  }
  return { scale, overflow: true, measured: true };
}

/** Fit is a temporary overview; numeric zoom is relative to the saved reading size. */
export function inspectorScale({
  width,
  height,
  preferredScale,
  viewportWidth,
  viewportHeight,
  zoom,
}: {
  width: number;
  height: number;
  preferredScale: number;
  viewportWidth: number;
  viewportHeight: number;
  zoom: "fit" | number;
}): number {
  const reading = positive(preferredScale) ? preferredScale : 1;
  if (zoom !== "fit") {
    const scale = reading * zoom;
    return positive(scale) ? scale : reading;
  }
  if (![width, height, viewportWidth, viewportHeight].every(positive)) return reading;
  const fit = Math.min(reading, viewportWidth / width, viewportHeight / height);
  return positive(fit) ? fit : reading;
}

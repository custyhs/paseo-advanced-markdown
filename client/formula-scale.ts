// Adapted from paseo-math (Apache-2.0), client/formula-scale.ts at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
// Changes: none beyond this attribution header.

export function formulaScale({
  fontSize,
  fontScale,
  block,
  display,
  platform,
  maxInlineWidth,
  width,
}: {
  fontSize: number;
  fontScale: number;
  block: boolean;
  display: boolean;
  platform: string;
  maxInlineWidth: number;
  width: number;
}): number {
  const mobileDisplay = block && display && (platform === "android" || platform === "ios");
  const natural = (fontSize / 16) * fontScale * (mobileDisplay ? 1.25 : 1);
  // Blocks scroll at their readable size; only inline attachments fit the row.
  return block ? natural : Math.min(natural, Math.max(1, maxInlineWidth) / width);
}

// Adapted from paseo-math (Apache-2.0), client/formula-scale.ts at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
// Changes: separate the preferred reading size from inline fitting and apply
// the independent formula-size preference before any container adaptation.

export interface FormulaReadingSize {
  fontSize: number;
  fontScale: number;
  mathScale?: number;
  block: boolean;
  display: boolean;
  platform: string;
}

export function preferredFormulaScale({
  fontSize,
  fontScale,
  mathScale = 1,
  block,
  display,
  platform,
}: FormulaReadingSize): number {
  const mobileDisplay = block && display && (platform === "android" || platform === "ios");
  const positive = (value: number, fallback: number) =>
    Number.isFinite(value) && value > 0 ? value : fallback;
  const scale =
    (positive(fontSize, 16) / 16) *
    positive(fontScale, 1) *
    positive(mathScale, 1) *
    (mobileDisplay ? 1.25 : 1);
  return positive(scale, 1);
}

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

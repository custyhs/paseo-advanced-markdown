import { readFile } from "node:fs/promises";

/**
 * MathJax has no glyphs for CJK and other scripts outside its math fonts; it
 * emits `<text>` and expects the renderer to supply a font. resvg has no system
 * font access in WebAssembly, so the daemon reads one font file from the host
 * and hands it over as a buffer. One font is enough: it is the only face in the
 * database, so every family request resolves to it.
 */
const CANDIDATES: Readonly<Record<string, readonly string[]>> = {
  darwin: [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/Supplemental/Songti.ttc",
    "/Library/Fonts/Arial Unicode.ttf",
  ],
  linux: [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/arphic/uming.ttc",
  ],
  win32: [
    "C:\\Windows\\Fonts\\msyh.ttc",
    "C:\\Windows\\Fonts\\simsun.ttc",
    "C:\\Windows\\Fonts\\msjh.ttc",
    "C:\\Windows\\Fonts\\arialuni.ttf",
  ],
};

/** The override wins over the platform list; both are host configuration, never message content. */
export function fontCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): readonly string[] {
  const override = env.PASEO_ADVANCED_MARKDOWN_FONT?.trim();
  if (override) return [override];
  return CANDIDATES[platform] ?? [];
}

// Accepted sfnt signatures. A file that is not a font would leave resvg with no
// usable face and silently drop the glyphs, which reads as a rendering bug.
const SIGNATURES = ["\u0000\u0001\u0000\u0000", "OTTO", "ttcf", "true", "typ1"];

function isFontFile(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  const header = buffer.subarray(0, 4).toString("latin1");
  return SIGNATURES.includes(header);
}

let cache: { key: string; font: Uint8Array } | undefined;

/** Reads and caches the first readable candidate. Returns null when none exists. */
export async function loadTextFont(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<Uint8Array | null> {
  const candidates = fontCandidates(env, platform);
  const key = candidates.join("|");
  if (cache?.key === key) return cache.font;
  for (const candidate of candidates) {
    const buffer = await readFile(candidate).catch(() => null);
    if (buffer && isFontFile(buffer)) {
      cache = { key, font: new Uint8Array(buffer) };
      return cache.font;
    }
  }
  // A missing font is not cached: installing one must take effect without a
  // plugin reload, and probing a handful of paths is cheap.
  return null;
}

export function forgetTextFont(): void {
  cache = undefined;
}

export function missingFontMessage(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const candidates = fontCandidates(env, platform);
  const looked = candidates.length ? candidates.join(", ") : "no known location on this platform";
  return `This formula needs a text font for characters outside MathJax's math fonts, and none was found (looked in: ${looked}). Install one or set PASEO_ADVANCED_MARKDOWN_FONT to a font file.`.slice(
    0,
    512,
  );
}

import { readFile, stat } from "node:fs/promises";
import { create, type Font } from "fontkit";

/**
 * MathJax has no glyphs for CJK and other scripts outside its math fonts; it
 * emits `<text>` and expects the renderer to supply a font. resvg has no system
 * font access in WebAssembly, so the daemon supplies validated host font buffers,
 * including a separate bold face when the selected collection lacks one.
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

export interface TextFont {
  buffers: Uint8Array[];
  family: string;
}

type FontFile = { key: string; buffer: Uint8Array; faces: Font[] };
// Regular and bold may be separate large collections on Linux.
const cache = new Map<string, FontFile>();

async function readFont(candidate: string): Promise<FontFile | null> {
  try {
    const info = await stat(candidate);
    if (!info.isFile() || info.size > 128 * 1024 * 1024) return null;
    const key = `${candidate}|${info.size}|${info.mtimeMs}`;
    const cached = cache.get(candidate);
    if (cached?.key === key) return cached;
    const buffer = await readFile(candidate);
    // resvg accepts sfnt fonts, not WOFF containers.
    if (
      !["\u0000\u0001\u0000\u0000", "OTTO", "ttcf", "true"].includes(
        buffer.subarray(0, 4).toString("latin1"),
      )
    )
      return null;
    const parsed = create(buffer);
    const font = {
      key,
      buffer: new Uint8Array(buffer),
      faces: "fonts" in parsed ? parsed.fonts : [parsed],
    };
    cache.delete(candidate);
    cache.set(candidate, font);
    while (cache.size > 2) cache.delete(cache.keys().next().value!);
    return font;
  } catch {
    return null;
  }
}

function covers(font: Font, codepoints: number[]): boolean {
  try {
    return codepoints.every(
      (cp) => font.hasGlyphForCodePoint(cp) && font.glyphForCodePoint(cp).path.commands.length > 0,
    );
  } catch {
    return false;
  }
}

function boldCandidates(candidate: string): string[] {
  return [
    ...new Set([
      candidate.replace(/-Regular(?=\.(?:ttc|ttf|otf)$)/i, "-Bold"),
      candidate.replace(/\.(ttc|ttf|otf)$/i, "-Bold.$1"),
      candidate.replace(/\.(ttc|ttf|otf)$/i, " Bold.$1"),
      candidate.replace(/(msyh|msjh)\.ttc$/i, "$1bd.ttc"),
    ]),
  ].filter((name) => name !== candidate);
}

/** Validate glyph outlines and requested weight before resvg sees the fonts. */
export async function loadTextFont(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  needsBold = false,
): Promise<TextFont | null> {
  const codepoints = [
    ...new Set([...text].filter((char) => !/\s/u.test(char)).map((char) => char.codePointAt(0)!)),
  ];
  for (const candidate of fontCandidates(env, platform)) {
    const file = await readFont(candidate);
    if (!file) continue;
    const face = file.faces.find((font) => covers(font, codepoints));
    if (!face) continue;
    const boldFace = (font: Font) =>
      font.familyName === face.familyName &&
      font["OS/2"].usWeightClass >= 600 &&
      covers(font, codepoints);
    const buffers = [file.buffer];
    if (needsBold && !file.faces.some(boldFace)) {
      let bold: FontFile | null = null;
      for (const sibling of boldCandidates(candidate)) {
        const other = await readFont(sibling);
        if (other?.faces.some(boldFace)) {
          bold = other;
          break;
        }
      }
      if (!bold) continue;
      buffers.push(bold.buffer);
    }
    return { buffers, family: face.familyName };
  }
  // Failed results are not cached: a new/replaced font is usable on retry.
  return null;
}

export function forgetTextFont(): void {
  cache.clear();
}

export function missingFontMessage(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const candidates = fontCandidates(env, platform);
  const looked = candidates.length ? candidates.join(", ") : "no known location on this platform";
  return `This formula needs a text font for characters outside MathJax's math fonts, but no usable font covers the characters and requested weight (looked in: ${looked}). Install one or set PASEO_ADVANCED_MARKDOWN_FONT to a font file.`.slice(
    0,
    512,
  );
}

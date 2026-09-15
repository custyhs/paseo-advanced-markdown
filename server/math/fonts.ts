import { readFile, stat } from "node:fs/promises";
import { create, type Font } from "fontkit";

/**
 * MathJax has no glyphs for CJK and other scripts outside its math fonts; it
 * emits `<text>` and expects the renderer to supply a font. resvg has no system
 * font access in WebAssembly, so the daemon reads one font file from the host
 * and hands it over as a buffer. Font parsing and glyph coverage are checked before the buffer is accepted.
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
  buffer: Uint8Array;
  family: string;
}

let cache: { key: string; buffer: Uint8Array; faces: Font[] } | undefined;

/** Validate the font itself and every fallback character before resvg sees it. */
export async function loadTextFont(
  text: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<TextFont | null> {
  const codepoints = [
    ...new Set([...text].filter((char) => !/\s/u.test(char)).map((char) => char.codePointAt(0)!)),
  ];
  for (const candidate of fontCandidates(env, platform)) {
    try {
      const info = await stat(candidate);
      if (!info.isFile() || info.size > 128 * 1024 * 1024) continue;
      const key = `${candidate}|${info.size}|${info.mtimeMs}`;
      if (cache?.key !== key) {
        const buffer = await readFile(candidate);
        // resvg's font database accepts sfnt fonts, not WOFF containers.
        if (
          !["\u0000\u0001\u0000\u0000", "OTTO", "ttcf", "true"].includes(
            buffer.subarray(0, 4).toString("latin1"),
          )
        )
          continue;
        const parsed = create(buffer);
        const faces = "fonts" in parsed ? parsed.fonts : [parsed];
        cache = { key, buffer: new Uint8Array(buffer), faces };
      }
      const face = cache.faces.find((font) =>
        codepoints.every((cp) => {
          if (!font.hasGlyphForCodePoint(cp)) return false;
          // Force lazy outline parsing too: a valid cmap alone is insufficient.
          return font.glyphForCodePoint(cp).path.commands.length > 0;
        }),
      );
      if (face) return { buffer: cache.buffer, family: face.familyName };
    } catch {
      // Corrupt/unreadable candidates must not prevent a later usable font.
    }
  }
  // Failed results are not cached: a new/replaced font is usable on retry.
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
  return `This formula needs a text font for characters outside MathJax's math fonts, but no usable font covers them (looked in: ${looked}). Install one or set PASEO_ADVANCED_MARKDOWN_FONT to a font file.`.slice(
    0,
    512,
  );
}

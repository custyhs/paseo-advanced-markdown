// Adapted from paseo-math (Apache-2.0), server/render.ts at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
// Changes: shared limits and RPC types, a clearable bounded cache, and a
// status accessor for the settings screen.

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import type { LiteElement } from "mathjax-full/js/adaptors/lite/Element.js";
import type { MmlNode } from "mathjax-full/js/core/MmlTree/MmlNode.js";
import type TexError from "mathjax-full/js/input/tex/TexError.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import "mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import "mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js";
import "mathjax-full/js/input/tex/configmacros/ConfigMacrosConfiguration.js";
import "mathjax-full/js/input/tex/verb/VerbConfiguration.js";
import "mathjax-full/js/input/tex/color/ColorConfiguration.js";
import "mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js";
import type { MathRenderInput, MathRenderOutput } from "../../shared/rpc.js";
import { compactEquationTags, normalizeTex } from "../../shared/tex.js";
import {
  IMAGE_CACHE_BYTES,
  IMAGE_CACHE_ENTRIES,
  MAX_IMAGE_BASE64,
  MAX_MATH_EXPRESSION,
} from "../../shared/limits.js";
import { BoundedCache } from "../cache.js";
import { loadTextFont, missingFontMessage } from "./fonts.js";
import { wasmBase64 } from "../generated/wasm.js";

const EM = 16;
const DENSITY = 2;
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 1024;
const MAX_PNG_BASE64 = MAX_IMAGE_BASE64;
const MAX_SVG = 1_000_000;
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
let wasmReady: Promise<void> | undefined;

class RenderFailure extends Error {
  constructor(
    readonly reason: "invalid" | "too-large",
    readonly detail?: string,
  ) {
    super(detail ?? reason);
  }
}

// Geometry and validated text are allowed; resource references are rejected.
const svgElements: Record<string, true> = {
  svg: true,
  g: true,
  // MathJax falls back to <text> for characters its math fonts do not cover.
  // The rasterizer draws those with a host font; see ./fonts.ts.
  text: true,
  path: true,
  rect: true,
  line: true,
  polygon: true,
  polyline: true,
  circle: true,
  ellipse: true,
};
const svgAttributes: Record<string, true> = {
  xmlns: true,
  width: true,
  height: true,
  viewBox: true,
  preserveAspectRatio: true,
  transform: true,
  d: true,
  x: true,
  y: true,
  x1: true,
  y1: true,
  x2: true,
  y2: true,
  cx: true,
  cy: true,
  r: true,
  rx: true,
  ry: true,
  points: true,
  fill: true,
  stroke: true,
  "stroke-width": true,
  "stroke-linecap": true,
  "stroke-linejoin": true,
  "stroke-miterlimit": true,
  "stroke-dasharray": true,
  "stroke-dashoffset": true,
  "fill-rule": true,
  "font-size": true,
  "font-family": true,
  "font-style": true,
  "font-weight": true,
  "text-anchor": true,
};
const MAX_TEXT_CONTENT = 256;

/** Rejects anything the rasterizer should not see; reports whether text glyphs are needed. */
function sanitize(root: LiteElement): { text: string } {
  const pending = [root];
  let count = 0;
  let text = "";
  while (pending.length) {
    const node = pending.pop()!;
    if (++count > 16_384) throw new RenderFailure("too-large");
    if (!Object.hasOwn(svgElements, node.kind)) throw new RenderFailure("invalid");
    for (const { name, value } of adaptor.allAttributes(node)) {
      if (name === "style" || name === "role" || name === "focusable" || name.startsWith("data-")) {
        adaptor.removeAttribute(node, name);
      } else if (!Object.hasOwn(svgAttributes, name)) {
        throw new RenderFailure("invalid");
      } else if (
        (name === "fill" || name === "stroke") &&
        !/^(?:[a-z]+|#[\da-f]{3,8})$/i.test(value)
      ) {
        throw new RenderFailure("invalid");
      } else if (name === "font-family" && !/^[\w\s,'"-]{1,128}$/.test(value)) {
        throw new RenderFailure("invalid");
      } else if (name === "font-size" && !/^[\d.]{1,12}(?:px|em|ex|pt)?$/.test(value)) {
        throw new RenderFailure("invalid");
      }
    }
    const weight = adaptor.getAttribute(node, "font-weight");
    if (weight !== undefined && !/^(?:normal|bold|[1-9]00)$/.test(String(weight))) {
      throw new RenderFailure("invalid");
    }
    for (const child of node.children) {
      if (!("children" in child)) {
        // Character data is only meaningful inside <text>; nothing else may carry it.
        if (node.kind !== "text" || typeof child.value !== "string")
          throw new RenderFailure("invalid");
        if (child.value.length > MAX_TEXT_CONTENT) throw new RenderFailure("too-large");
        text += child.value;
        continue;
      }
      pending.push(child);
    }
  }
  return { text };
}

function themeColor(color: string): { rgb: string; alpha: number } {
  if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)) {
    throw new RenderFailure("invalid");
  }
  let hex = color.slice(1).toLowerCase();
  if (hex.length <= 4) hex = [...hex].map((digit) => digit + digit).join("");
  return {
    rgb: `#${hex.slice(0, 6)}`,
    alpha: hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1,
  };
}

function typeset(input: MathRenderInput): {
  svg: string;
  width: number;
  height: number;
  baseline: number;
  text: string;
} {
  const color = themeColor(input.color);
  // TeX configuration creates fresh newcommand/configmacros maps. Conversion is
  // synchronous: independent formulas never share or interleave mutable macros.
  const tex = new TeX({
    packages: [
      "base",
      "ams",
      "boldsymbol",
      "newcommand",
      "configmacros",
      "verb",
      "color",
      "textmacros",
    ],
    maxMacros: 512,
    maxBuffer: 16_384,
    formatError: (_jax: unknown, error: TexError) => {
      throw new RenderFailure(
        /^(?:MaxBufferSize|MaxMacroSub)/.test(error.id) ? "too-large" : "invalid",
      );
    },
  });
  tex.postFilters.add(() => {
    let count = 0;
    tex.parseOptions.root.walkTree((node) => {
      if (++count > 4096) throw new RenderFailure("too-large");
      if (node.kind === "merror") throw new RenderFailure("invalid");
      const attributes = (node as MmlNode).attributes;
      if (attributes && ["href", "src", "style"].some((name) => attributes.isSet(name))) {
        throw new RenderFailure("invalid");
      }
    });
  });
  const output = new SVG({ fontCache: "none" });
  const document = mathjax.document("", {
    InputJax: tex,
    OutputJax: output,
    compileError: (_document: unknown, _math: unknown, error: unknown) => {
      throw error;
    },
    typesetError: (_document: unknown, _math: unknown, error: unknown) => {
      throw error;
    },
  });
  try {
    // Initialize the TeX color environment too: \rule otherwise bakes in black.
    const expression = input.display ? compactEquationTags(input.expression) : input.expression;
    const container = document.convert(`\\color{${color.rgb}} ${normalizeTex(expression)}`, {
      display: input.display,
      em: EM,
      ex: EM * 0.442,
      containerWidth: MAX_WIDTH,
    });
    const svg = adaptor.tags(container, "svg")[0];
    if (!svg) throw new RenderFailure("invalid");
    const viewBox = String(adaptor.getAttribute(svg, "viewBox") ?? "")
      .trim()
      .split(/\s+/)
      .map(Number);
    if (viewBox.length !== 4 || !viewBox.every(Number.isFinite)) throw new RenderFailure("invalid");
    const [x, y, unitsWidth, unitsHeight] = viewBox as [number, number, number, number];
    if (unitsWidth <= 0 || unitsHeight <= 0) throw new RenderFailure("invalid");
    // MathJax's viewBox is in 1000 units/em. One logical pixel of padding
    // protects edge antialiasing; round outward to whole 2x raster pixels.
    const width = Math.ceil(((unitsWidth * EM) / 1000 + 2) * DENSITY) / DENSITY;
    const height = Math.ceil(((unitsHeight * EM) / 1000 + 2) * DENSITY) / DENSITY;
    if (width > MAX_WIDTH || height > MAX_HEIGHT) throw new RenderFailure("too-large");
    const baseline = Math.max(0, Math.min(height, (-y * EM) / 1000 + 1));
    const { text } = sanitize(svg);
    adaptor.setAttribute(
      svg,
      "viewBox",
      `${x - 1000 / EM} ${y - 1000 / EM} ${(width * 1000) / EM} ${(height * 1000) / EM}`,
    );
    adaptor.setAttribute(svg, "width", width * DENSITY);
    adaptor.setAttribute(svg, "height", height * DENSITY);
    adaptor.setAttribute(svg, "color", color.rgb);
    adaptor.setAttribute(svg, "opacity", color.alpha);
    const serialized = adaptor.outerHTML(svg);
    if (serialized.length > MAX_SVG) throw new RenderFailure("too-large");
    return { svg: serialized, width, height, baseline, text };
  } finally {
    document.clear();
  }
}

const cache = new BoundedCache<MathRenderOutput>(IMAGE_CACHE_ENTRIES, IMAGE_CACHE_BYTES);

function remember(key: string, output: MathRenderOutput): MathRenderOutput {
  // Charge two bytes/UTF-16 code unit conservatively, including source keys.
  const bytes = 2 * (key.length + (output.ok ? output.png.length : 32)) + 128;
  return cache.set(key, Object.freeze(output), bytes);
}

export function mathCacheSize(): number {
  return cache.size;
}

export function clearMathCache(): void {
  cache.clear();
}

/** Logical 16px-em dimensions; PNG pixels are 2x; baseline is measured from the top. */
export async function renderFormula(input: MathRenderInput): Promise<MathRenderOutput> {
  if (
    typeof input.expression !== "string" ||
    !input.expression.trim() ||
    typeof input.display !== "boolean" ||
    typeof input.color !== "string"
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (input.expression.length > MAX_MATH_EXPRESSION) return { ok: false, reason: "too-large" };
  if (input.color.length > 9) return { ok: false, reason: "invalid" };
  const key = JSON.stringify([input.expression, input.display, input.color.toLowerCase()]);
  const cached = cache.get(key);
  if (cached) return cached;
  // Await before allocating TeX trees so a burst during WASM startup retains
  // inputs only. After this await rendering is synchronous and serialized.
  try {
    wasmReady ??= initWasm(Buffer.from(wasmBase64, "base64")).catch((error) => {
      wasmReady = undefined;
      throw error;
    });
    await wasmReady;
    const readyCached = cache.get(key);
    if (readyCached) return readyCached;
    const { svg, width, height, baseline, text } = typeset(input);
    // Fonts are read only for formulas that need glyph fallback, and a missing
    // font is an environment problem, so it is reported rather than cached.
    const font = text ? await loadTextFont(text) : null;
    if (text && !font) {
      return { ok: false, reason: "unavailable", message: missingFontMessage() };
    }
    const renderer = new Resvg(svg, {
      font: {
        fontBuffers: font ? [font.buffer] : [],
        ...(font
          ? {
              defaultFontFamily: font.family,
              serifFamily: font.family,
              sansSerifFamily: font.family,
              monospaceFamily: font.family,
            }
          : {}),
      },
    });
    try {
      const image = renderer.render();
      try {
        const pngBytes = image.asPng();
        if (Math.ceil(pngBytes.length / 3) * 4 > MAX_PNG_BASE64)
          throw new RenderFailure("too-large");
        const png = Buffer.from(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength).toString(
          "base64",
        );
        return remember(key, { ok: true, png, width, height, baseline });
      } finally {
        image.free();
      }
    } finally {
      renderer.free();
    }
  } catch (error) {
    if (!(error instanceof RenderFailure)) {
      // Never report an environment or renderer fault as bad TeX, and leave a
      // trace in the plugin log. Such failures are not cached.
      console.error("[advanced-markdown] math render failed", error);
      const cause = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: "failed", message: `Renderer error: ${cause}`.slice(0, 512) };
    }
    return remember(key, {
      ok: false,
      reason: error.reason,
      ...(error.detail ? { message: error.detail } : {}),
    });
  }
}

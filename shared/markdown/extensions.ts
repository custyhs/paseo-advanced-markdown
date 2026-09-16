// Adapted from paseo-math (Apache-2.0), shared/markdown-math.ts at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
// Changes: closed ```mermaid fences become mermaid_block tokens, the fence
// override records the exact fenced source range for both math and Mermaid,
// and detection reports each module separately.
import MarkdownIt, {
  type MarkdownIt as MarkdownParser,
  type StateInline,
  type StateBlock,
  type Token,
} from "markdown-it";
import {
  MAX_DOCUMENT,
  MAX_INLINE_RUN,
  MAX_MATH_EXPRESSION,
  MAX_MERMAID_SOURCE,
} from "../limits.js";

/** Token types the extensions add. Renderers match on these names. */
export const MATH_INLINE = "math_inline";
export const MATH_BLOCK = "math_block";
export const MERMAID_BLOCK = "mermaid_block";

export interface ExtensionMeta {
  /** Exact source range, including delimiters or fence lines. */
  source: string;
  texSource?: string;
  display?: boolean;
  language?: string;
}

type Candidate = {
  start: number;
  body: number;
  close: number;
  end: number;
  display: boolean;
};
type Marker = { pos: number; text: string };

function escaped(source: string, pos: number): boolean {
  let count = 0;
  while (pos > 0 && source[--pos] === "\\") count++;
  return count % 2 !== 0;
}

// Only entity syntax is decoded; Markdown's unescapeAll on the complete TeX
// payload would destroy \{, \$, and other meaningful TeX escapes.
function expressionText(source: string, md: MarkdownParser): string {
  let result = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "\\" && i + 1 < source.length) {
      result += char + source[++i];
    } else if (char === "&") {
      let end = i + 1;
      const limit = Math.min(source.length, i + 33);
      while (end < limit && source[end] !== ";") end++;
      if (end < limit) {
        const entity = source.slice(i, end + 1);
        const decoded = md.utils.unescapeAll(entity);
        if (decoded !== entity) {
          result += decoded.replace(/\$/g, "\\$");
          i = end;
          continue;
        }
      }
      result += char;
    } else result += char;
  }
  return result;
}

function currency(source: string, candidate: Candidate): boolean {
  const body = source.slice(candidate.body, candidate.close);
  const number = /^[+-]?(?:\d[\d,]*(?:\.\d*)?|\.\d+)/.exec(body);
  if (!number) return false;
  // A dollar immediately introducing another number is a price, not a closer.
  if (/^[+-]?(?:\d|\.\d)/.test(source.slice(candidate.end, candidate.end + 3))) return true;
  const rest = body.slice(number[0].length);
  if (!rest) return false; // Explicitly closed numeric formulas, e.g. $17$.
  if (/^\s+[A-Za-z]/.test(rest)) return true;
  if (/^\s*\(/.test(rest) && /[A-Za-z]{2}/.test(rest)) return true;
  return /^\s*(?:[;,/+-]\s*)?$/.test(rest);
}

/** Probe real Markdown rules, not a competing code/link/fence scanner. */
function discover(
  state: StateInline,
  probing: { depth: number },
  balancePairs: (state: StateInline) => void,
): Map<number, Candidate> {
  const source = state.src;
  const found = new Map<number, Candidate>();
  if (source.length > MAX_INLINE_RUN) return found;
  const probe = new state.md.inline.State(source, state.md, state.env, []);
  const protectedAt = new Uint8Array(source.length);
  const positions = new Map<number, number>();
  const rules = state.md.inline.ruler.getRules("");
  probing.depth++;
  try {
    while (probe.pos < probe.posMax) {
      const start = probe.pos;
      const before = probe.tokens.length;
      const delimitersBefore = probe.delimiters.length;
      let matched = false;
      if (probe.level < state.md.options.maxNesting) {
        for (const rule of rules) {
          if (rule(probe, false)) {
            matched = true;
            break;
          }
        }
      }
      if (!matched) probe.pending += source[probe.pos++];
      if (probe.pos <= start) throw new Error("Markdown inline rule did not advance");
      for (let i = before; i < probe.tokens.length; i++) {
        const type = probe.tokens[i].type;
        if (
          type === "code_inline" ||
          type === "link_open" ||
          type === "image" ||
          type === "html_inline"
        ) {
          protectedAt.fill(1, start, probe.pos);
          break;
        }
      }
      const count = probe.delimiters.length - delimitersBefore;
      if (count > 0) {
        const width = source[start] === "~" ? 2 : 1;
        const offset = width === 2 ? (probe.pos - start) % 2 : 0;
        for (let i = 0; i < count; i++) {
          positions.set(probe.delimiters[delimitersBefore + i].token, start + offset + i * width);
        }
      }
    }
    if (probe.pending) probe.pushPending();
    balancePairs(probe);
  } finally {
    probing.depth--;
  }

  const markers: Marker[] = [];
  for (let i = 0; i < source.length; i++) {
    if (protectedAt[i]) {
      markers.push({ pos: i, text: "boundary" });
      while (i + 1 < source.length && protectedAt[i + 1]) i++;
    } else if (source[i] === "\n") markers.push({ pos: i, text: "newline" });
    else if (source[i] === "\\") {
      if ("()[]".includes(source[i + 1] ?? "") && i + 1 < source.length) {
        markers.push({ pos: i, text: source.slice(i, i + 2) });
      }
      i++; // TeX/Markdown escaped characters cannot become delimiters.
    } else if (source[i] === "$") {
      const text = source[i + 1] === "$" ? "$$" : "$";
      markers.push({ pos: i, text });
      i += text.length - 1;
    }
  }
  const next = new Map<string, number>();
  const closing = new Int32Array(markers.length).fill(-1);
  for (let i = markers.length - 1; i >= 0; i--) {
    const marker = markers[i];
    if (marker.text === "boundary") {
      next.clear();
      continue;
    }
    if (marker.text === "newline") {
      next.delete("$");
      next.delete("\\)");
      continue;
    }
    const target = marker.text === "\\(" ? "\\)" : marker.text === "\\[" ? "\\]" : marker.text;
    closing[i] = next.get(target) ?? -1;
    next.set(marker.text, i);
  }
  const candidates: Candidate[] = [];
  let consumed = -1;
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    if (marker.pos < consumed || !["$", "$$", "\\(", "\\["].includes(marker.text)) continue;
    const endMarker = markers[closing[i]];
    if (!endMarker) continue;
    const candidate = {
      start: marker.pos,
      body: marker.pos + marker.text.length,
      close: endMarker.pos,
      end: endMarker.pos + endMarker.text.length,
      display: marker.text === "$$" || marker.text === "\\[",
    };
    const body = source.slice(candidate.body, candidate.close);
    if (!body.trim() || body.length > MAX_MATH_EXPRESSION) continue;
    if (marker.text === "$" && (/^\s|\s$/.test(body) || currency(source, candidate))) continue;
    candidates.push(candidate);
    consumed = candidate.end;
  }

  // Markers paired entirely within math (even across two formulas) belong to
  // TeX. A marker paired with prose makes the whole connected set ambiguous.
  const owners = new Int32Array(source.length);
  const parent = candidates.map((_, i) => i);
  const invalid = new Set<number>();
  function root(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  candidates.forEach((candidate, i) => {
    owners.fill(i + 1, candidate.body, candidate.close);
  });
  for (const delimiter of probe.delimiters) {
    if (delimiter.end < 0) continue;
    const a = positions.get(delimiter.token);
    const b = positions.get(probe.delimiters[delimiter.end].token);
    if (a === undefined || b === undefined) continue;
    const left = owners[a] - 1;
    const right = owners[b] - 1;
    if (left >= 0 && right >= 0) parent[root(left)] = root(right);
    else if (left >= 0) invalid.add(left);
    else if (right >= 0) invalid.add(right);
  }
  const invalidRoots = new Set([...invalid].map(root));
  candidates.forEach((candidate, i) => {
    if (!invalidRoots.has(root(i))) found.set(candidate.start, candidate);
  });
  return found;
}

// Display-block structure follows the public Apache-2.0 Paseo PR #2562
// markdown-math.ts by ekalvi; boundary, source, and container handling differs.
function mathBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const opening = state.src.slice(start, start + 2);
  if (opening !== "$$" && opening !== "\\[") return false;
  const closing = opening === "$$" ? "$$" : "\\]";
  const lines: string[] = [];
  const originalLines: string[] = [];
  let size = 0;
  for (let line = startLine; line < endLine; line++) {
    if (line > startLine && state.sCount[line] < state.blkIndent && !state.isEmpty(line))
      return false;
    // A lazy blockquote continuation is prose outside the display container.
    if (line > startLine && state.sCount[line] < 0) return false;
    const lineStart = state.bMarks[line] + state.tShift[line];
    const text = state.src.slice(lineStart + (line === startLine ? 2 : 0), state.eMarks[line]);
    let close = text.indexOf(closing);
    while (close >= 0 && escaped(text, close)) close = text.indexOf(closing, close + 2);
    const originalStart =
      line === startLine
        ? start + 2
        : state.bMarks[line] + Math.min(state.tShift[line], state.blkIndent);
    if (close < 0) {
      originalLines.push(state.src.slice(originalStart, state.eMarks[line]));
      lines.push(text);
      size += text.length + 1;
      if (size > MAX_MATH_EXPRESSION) return false;
      continue;
    }
    originalLines.push(
      state.src.slice(originalStart, lineStart + (line === startLine ? 2 : 0) + close),
    );
    lines.push(text.slice(0, close));
    const expression = lines.join("\n");
    if (!expression.trim() || expression.length > MAX_MATH_EXPRESSION) return false;
    if (silent) return true;
    const token = state.push(MATH_BLOCK, "math", 0);
    token.block = true;
    token.content = expressionText(expression, state.md);
    token.markup = opening;
    token.map = [startLine, line + 1];
    token.meta = {
      source: state.src.slice(start, lineStart + (line === startLine ? 2 : 0) + close + 2),
      texSource: originalLines.join("\n"),
      display: true,
    } satisfies ExtensionMeta;
    const trailing = text.slice(close + 2).trimStart();
    if (trailing) {
      state.push("paragraph_open", "p", 1).map = [line, line + 1];
      const inline = state.push("inline", "", 0);
      inline.content = trailing;
      inline.map = [line, line + 1];
      inline.children = [];
      state.push("paragraph_close", "p", -1);
    }
    state.line = line + 1;
    return true;
  }
  return false;
}

/**
 * A `math` fence already declares display math, but authors and agents often
 * wrap its body in delimiters as well. MathJax has no `\[` in math mode, so the
 * whole formula would fail. Drop exactly one wrapper when the body is a single
 * wrapped expression; leave anything else untouched.
 */
function unwrapDisplayDelimiters(content: string): string {
  const trimmed = content.trim();
  for (const [open, close] of [
    ["\\[", "\\]"],
    ["$$", "$$"],
    ["\\(", "\\)"],
    ["$", "$"],
  ] as const) {
    if (trimmed.length <= open.length + close.length) continue;
    if (!trimmed.startsWith(open) || !trimmed.endsWith(close)) continue;
    const inner = trimmed.slice(open.length, trimmed.length - close.length);
    if (!inner.trim() || inner.includes(open) || inner.includes(close)) continue;
    return inner;
  }
  return content;
}

/** Info-string language of a fence, lowercased; extra words are ignored. */
function fenceLanguage(info: string): string {
  return (info.trim().split(/\s+/)[0] ?? "").toLowerCase();
}

export function markdownExtensions(md: MarkdownParser): void {
  // Pinned Markdown 15 packages expose state classes and named rule registries.
  // Capture the real rules rather than maintaining a competing Markdown scanner.
  const balancePairs = md.inline.ruler2.__rules__.find((rule) => rule.name === "balance_pairs")?.fn;
  const fence = md.block.ruler.__rules__.find((rule) => rule.name === "fence")?.fn;
  if (!balancePairs || !fence) throw new Error("Required Markdown rules are unavailable");
  const probing = { depth: 0 };
  const cache = new WeakMap<StateInline, Map<number, Candidate>>();
  md.inline.ruler.before("escape", MATH_INLINE, (state, silent) => {
    if (probing.depth || (state.src[state.pos] !== "$" && state.src[state.pos] !== "\\"))
      return false;
    let candidates = cache.get(state);
    if (!candidates) {
      candidates = discover(state, probing, balancePairs);
      cache.set(state, candidates);
    }
    const candidate = candidates.get(state.pos);
    if (!candidate || candidate.end > state.posMax) return false;
    if (!silent) {
      const token = state.push(MATH_INLINE, "math", 0);
      token.content = expressionText(state.src.slice(candidate.body, candidate.close), md);
      token.markup = state.src.slice(candidate.start, candidate.body);
      token.meta = {
        source: state.src.slice(candidate.start, candidate.end),
        texSource: state.src.slice(candidate.body, candidate.close),
        display: candidate.display,
      } satisfies ExtensionMeta;
    }
    state.pos = candidate.end;
    return true;
  });
  md.block.ruler.before("fence", MATH_BLOCK, mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.block.ruler.at(
    "fence",
    (state, startLine, endLine, silent) => {
      if (!fence(state, startLine, endLine, silent)) return false;
      if (silent) return true;
      const token = state.tokens[state.tokens.length - 1];
      const language = fenceLanguage(token.info);
      if (language !== "math" && language !== "mermaid") return true;
      const limit = language === "math" ? MAX_MATH_EXPRESSION : MAX_MERMAID_SOURCE;
      if (token.content.length > limit) return true;
      // Inspect the actual fence rule's final line while container offsets are
      // still active. Core-phase offsets no longer describe nested containers.
      // An unclosed fence stays ordinary code so streaming input keeps its source.
      const last = state.line - 1;
      if (
        last <= startLine ||
        state.sCount[last] - state.blkIndent >= 4 ||
        state.sCount[last] < state.blkIndent
      )
        return true;
      const close = state.src.slice(state.bMarks[last] + state.tShift[last], state.eMarks[last]);
      let count = 0;
      while (close[count] === token.markup[0]) count++;
      if (count < token.markup.length || close.slice(count).trim()) return true;
      const source = state.src.slice(
        state.bMarks[startLine] + state.tShift[startLine],
        state.eMarks[last],
      );
      if (language === "math") {
        token.type = MATH_BLOCK;
        token.tag = "math";
        const originalBody = state.getLines(startLine + 1, last, state.blkIndent, true);
        const texSource = unwrapDisplayDelimiters(originalBody);
        token.content = expressionText(unwrapDisplayDelimiters(token.content), md);
        token.meta = { source, texSource, display: true } satisfies ExtensionMeta;
        return true;
      }
      if (!token.content.trim()) return true;
      token.type = MERMAID_BLOCK;
      token.tag = "mermaid";
      token.meta = { source, language } satisfies ExtensionMeta;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
}

export interface DetectedExtensions {
  math: boolean;
  mermaid: boolean;
  /** Nodes the plugin renderer does not cover (inline images). The host keeps such items. */
  unsupported: boolean;
}

const NONE: DetectedExtensions = Object.freeze({ math: false, mermaid: false, unsupported: false });

let detector: MarkdownParser | undefined;

/** Reports which modules have at least one complete token in the source. */
export function detectExtensions(source: string): DetectedExtensions {
  if (source.length > MAX_DOCUMENT) return NONE;
  const mayHaveMath = source.includes("$") || source.includes("\\(") || source.includes("\\[");
  const mayHaveFence = source.includes("```") || source.includes("~~~");
  if (!mayHaveMath && !mayHaveFence) return NONE;
  if (!mayHaveMath && !/mermaid/i.test(source) && !/math/i.test(source)) return NONE;
  if (!detector) {
    detector = new MarkdownIt().use(markdownExtensions);
    detector.validateLink = () => true;
  }
  let math = false;
  let mermaid = false;
  let unsupported = false;
  const pending: Token[] = [...detector.parse(source, {})];
  while (pending.length) {
    const token = pending.pop()!;
    if (token.type === MATH_INLINE || token.type === MATH_BLOCK) math = true;
    else if (token.type === MERMAID_BLOCK) mermaid = true;
    else if (token.type === "image") unsupported = true;
    else if (
      token.type === "link_open" &&
      !/^(?:https?:\/\/|mailto:)/i.test(String(token.attrGet("href") ?? ""))
    )
      unsupported = true;
    if (token.children) for (const child of token.children) pending.push(child);
  }
  if (!math && !mermaid) return NONE;
  return { math, mermaid, unsupported };
}

export function hasAnyExtension(detected: DetectedExtensions): boolean {
  return detected.math || detected.mermaid;
}

/** Whether the plugin should own the item given which modules are enabled. */
export function shouldTakeOver(
  detected: DetectedExtensions,
  enabled: { math: boolean; mermaid: boolean },
): boolean {
  if (detected.unsupported) return false;
  return (detected.math && enabled.math) || (detected.mermaid && enabled.mermaid);
}

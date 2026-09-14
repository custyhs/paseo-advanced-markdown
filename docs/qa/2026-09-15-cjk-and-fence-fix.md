# Fix log: CJK text and redundant fence delimiters (2026-09-15)

Reported from real use: a ```` ```math ```` fence containing `\[ … \]` with
Chinese `\underbrace` labels showed "Invalid TeX; showing source" while the
inline formulas in the same message rendered.

## Two independent causes

Each one alone was enough to fail the formula; both were present.

| Cause | Evidence |
| --- | --- |
| The fence body was wrapped in `\[ … \]`. A `math` fence already means display math, so the parser handed the wrapper to MathJax, which has no `\[` in math mode. | `TEX[UndefinedControlSequence] Undefined control sequence \[`; bare `\[ … \]` outside a fence was never affected because the parser strips those delimiters. |
| Chinese characters. MathJax has no CJK glyphs, so it emits `<text>` for the rasterizer to draw with a system font. The SVG sanitizer allowed geometry only and rejected `<text>`. | `a+\text{中文}` produced SVG nodes `text:2 path:2`; `a+\text{ok}` produced `path:4`. Bare CJK and CJK punctuation failed the same way. |

The second one also mislabelled itself: the TeX was valid, but the status said
"Invalid TeX".

## Fixes

- The `math` fence drops exactly one redundant display wrapper (`\[…\]`,
  `$$…$$`, `\(…\)`, `$…$`) when the whole body is a single wrapped expression.
  Anything else, including two formulas in one fence, is left untouched, and
  the copied source is always the original fenced text.
- The sanitizer accepts `<text>` with a restricted attribute allowlist, and the
  daemon reads one host text font and passes it to resvg. Fonts are read only
  for formulas that need glyph fallback. A missing or unusable font is reported
  with its cause instead of being called invalid TeX, is not cached, and a font
  installed later is picked up without a plugin reload. Files that are not
  fonts are rejected by their signature so glyphs cannot silently vanish.
- Unexpected renderer errors now carry their cause to the client and to the
  plugin log.

## Verification

| Check | Result |
| --- | --- |
| New tests (fence unwrap, CJK render, missing font, late-installed font, non-font file) | 55 tests pass |
| `npm run smoke` with the released 0.8.0 compiler and official projection | pass |
| Official daemon 0.8.0 (port 6790) + official browser web UI | the reported formula, an inline `$\alpha_{\text{学习率}}$`, and a `$$`-wrapped fence with Chinese all render; invalid TeX still keeps its source |

One detour worth recording: the first attempt to verify on the official daemon
still failed because that host had the plugin installed from the published
`v0.1.1` tag, not from the working copy. `paseo plugin ls` shows the source and
commit; check it before concluding a fix did not work.

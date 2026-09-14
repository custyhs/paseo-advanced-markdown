# QA log: official Paseo 0.8.0 browser web UI (2026-09-14)

Environment: [environment.md](environment.md). Plugin commit: see `git log` for
the commit that added this file. Captures live in `.smoke/web/` (ignored by Git);
the facts below are copied from the JSON reports produced by
`scripts/qa/web-capture.mjs`.

## Fixture

A Claude agent on the isolated daemon was asked to echo `SAMPLE.md` verbatim.
The reply is one assistant message with: a heading, two inline formulas
(`$…$`, `\(…\)`), literal prices (`$5 and $10`), inline code containing `$x$`,
a `$$` display block, a ```` ```math ```` fence with an inner blank line, a
```` ```mermaid ```` flowchart with Chinese labels, a table with `$\alpha$` and
`$\beta$` cells, a Python fence containing `$5 + $10`, and a list item with a
link and `\[ … \]`.

## Results

| Check | 1280×900 (dark) | 390×844 (dark) |
| --- | --- | --- |
| Plugin images (`img[src^=data:image/png]`) | 8 | 8 |
| Inline formulas rendered inline with prose | yes (E = mc², a² + b² = c²) | yes |
| Display `$$`, `math` fence (inner blank line), list `\[…\]` | rendered | rendered |
| Mermaid flowchart, Chinese labels, dark theme | rendered at 440×206 logical | scaled to fit with hint, Expand button |
| Prices, inline-code `$x$`, Python fence | plain text / code | plain text / code |
| Table with math cells | rendered | rendered |
| Page horizontal overflow (`scrollWidth > clientWidth`) | none | none |
| Console errors or page errors | 0 | 0 |
| Action buttons present | Copy source / Show source per block, Expand on diagram, "Copy this message's source" | same |

Clipboard (read back with `navigator.clipboard.readText()` after clicking):

| Button | Clipboard |
| --- | --- |
| Block "Copy source" #0 (display math) | `$$\n\int_0^1 x^2 \, dx = \frac{1}{3}\n$$` (38 chars, exact range with delimiters) |
| Block "Copy source" #2 (Mermaid) | the full ```` ```mermaid … ``` ```` fence (92 chars) |
| "Copy this message's source" | the entire source item, 634 chars, byte-identical to `SAMPLE.md` |

Baseline with the plugin disabled (`paseo plugin disable advanced-markdown`):
0 plugin images; the host shows `$E = mc^2$` literally, renders `\(a^2 + b^2 = c^2\)`
as `(a^2 + b^2 = c^2)` (Markdown escape stripping), shows the `math` and
`mermaid` fences as code blocks, and shows `$\alpha$` in the table. Re-enabling
the plugin restored the rendered view without reloading the daemon.

## Timeline behavior confirmed with official code (`npm run smoke`)

Using the compiler shipped in `@getpaseo/server@0.8.0` and the app's
`transformTimelineItem`, `projectPluginTimelineItems`, and `applyStreamEvent`
at tag `v0.8.0`:

- Growing assistant text keeps one row whose identity does not change; the row
  becomes a plugin item at the first closed delimiter and stays a plugin item.
- The host promotes completed Markdown blocks into separate source items while
  streaming: `Intro / $$…$$ / Outro` becomes three items and only the middle one
  is a plugin item. On history fetch the message is one item (the 634-char
  copy above).
- A `math` or `mermaid` fence with an inner blank line stays one block; an
  unclosed fence stays an ordinary assistant row until it closes.
- Bare `$$` display math with an inner blank line is split by the host into
  `$$\na^2` and `+b^2=c^2\n$$`; both stay host rows with readable source. The
  plugin does not join them. Use a `math` fence for multi-paragraph display math.
- Items with inline images, plain items, and user messages stay with the host.
- With another plugin registered earlier that also matches Mermaid items, that
  plugin owns the item (first result wins); this plugin does not fight for it.

## Hermes

`HERMES_BIN=<react-native 0.81 hermes> npm run smoke:hermes` evaluates the
compiled client bundle in Hermes with and without `-Xes6-class`: setup,
incremental math + Mermaid projection, plain/code/image fallbacks, and cleanup
pass. The final client bundle contains no class syntax (checked by `npm run smoke`).

## Lifecycle

`paseo plugin reload advanced-markdown` replaced the plugin subprocess; no
`chrome-headless-shell` or `mermaid-cli` processes and no
`paseo-advanced-markdown-*` temp directories remained afterwards.

## Not covered here

iOS and Android clients (no emulator or Xcode on this host), light theme
captures, and Electron desktop. See the task list for their status.

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

## Full-spec sample (agent `advanced-markdown sample 2`)

Blockquote with inline math, ordered list items with math, a very long display
formula, invalid TeX beside valid math, six Mermaid types (sequence, class,
state, ER, Gantt, a 20-node wide flowchart), an invalid Mermaid fence, prices,
inline code, and a `math` fence with a matrix.

| Check | Result (1280×900, dark) |
| --- | --- |
| Plugin images | 11 = 4 formulas + 6 diagrams + 1 matrix fence |
| Invalid TeX `$\unknowncommand{x}$` | shown as source inline; `$\alpha + \beta$` beside it rendered |
| Invalid Mermaid fence | source with "Mermaid error: Parse error on line 2:" and a Retry button; the valid diagrams around it rendered |
| Wide diagrams | "Scaled to fit; expand for full size" hint; Expand opens a modal titled Diagram with Zoom 1x/1.5x/2x/3x controls (12 images while open) |
| Show source | replaces the block image with its source and a "Show formula" / "Show diagram" button (10 images while one is toggled) |
| Long display formula | horizontal scroll inside the block; no page overflow |

## Load sample (agent `advanced-markdown sample 3`: 50 inline + 50 display formulas + 5 diagrams)

| Measurement | Value |
| --- | --- |
| Time from navigation until all 105 images are decoded, host caches cold (plugin just reloaded) | 3.5 s |
| Same, host caches warm, fresh page | 1.26 s |
| Page with 8 images, warm | 1.28 s (page load dominates) |
| Plugin subprocess RSS | ~50 MiB idle after reload; ~50 MiB after serving the 105-image page (formulas only); ~213 MiB after also serving the 400-node diagrams from the RPC probe |
| Lingering `chrome-headless-shell` processes after the run | 0 |

## Settings and hosts

Settings were changed through the daemon's `settings.modules.write` RPC (the
same path the settings screen uses) and the agent page was re-captured:

| State on host A | Result on host A | Host B (second isolated daemon, port 6791, same plugin) |
| --- | --- | --- |
| Mermaid off | 7 images; the Mermaid block shows source with "Mermaid module is off; showing source" | settings still both on; its page shows 8 images including the diagram |
| Both off | 0 images; the row returns to Paseo's renderer (raw `$E = mc^2$`, no plugin copy button) | unaffected |
| Restored | 8 images | unaffected |

The settings screen (Settings → Plugins → Advanced Markdown) renders on the
official web UI with both switches, the text-size select, and the runtime
status rows filled from the status RPC.

## Streaming (agent `streaming capture 2`)

Captures while the reply was streaming showed the plugin rendering each
completed block while the live tail stayed readable source (18 images at 14 s
with the "10." list item still plain). After the turn completed the single
reconciled row rendered all 105 images with no fallback status.

## Git source install, update, and rollback

See `docs/release/0.1.0-rc.1.md` for the table; run on host B against a local
bare repository (`file:///tmp/pam.git`) with the manifest's three preparation
commands executed by the daemon in its staging directory.

## Official iPhone and second-Mac clients (user-reported, 2026-09-14)

The plugin was installed with `paseo plugin install` on this machine's
production daemon (fork build 0.8.0-beta.1, accepted by the `0.8.0` requirement
through its stable core) without restarting the daemon; the status RPC through
that daemon reported both engines ready. The user then reported from the
official App Store iPhone app (0.8.0) and from Paseo on a second Mac that
formulas and Mermaid diagrams display correctly, including the sample embedded
in an assistant reply (inline math, `$$` block, flowchart).

Confirmed by the user: images render on iOS and on the second Mac's client.
Not yet reported: device and client versions, copy toast, Show source, Expand
modal, the settings screen, the offline fallback, and text-size changes.
Android was not run (no device).

## Not covered here

Android clients, the detailed iOS checklist rows listed above, and the
Electron desktop checklist beyond basic rendering. See the task list.

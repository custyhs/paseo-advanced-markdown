# Usage and rendering limits

[Back to README](../README.md) · [Installation](installation.md)

This guide describes v0.4.0 (Paseo >=0.13.0).
For older installations, see the [v0.3.2 guide](https://github.com/custyhs/paseo-advanced-markdown/blob/v0.3.2/docs/usage.md).

## Reading formulas

Formula size offers 75%, 100%, 125%, 150%, and 200%, relative to the text size.
This preference is shared by clients of the selected host and affects only math.
Reset formula size restores 100% without changing prose, Mermaid, or module switches.

Each paragraph/list/table cell measures its own width. A formula can shrink by
up to 15% to fit; longer formulas keep their reading size and scroll horizontally.
An oversized inline formula moves into a scrollable block at the same source
position. Short formulas do not stretch to fill the available width.
On native clients, ordinary fractions, sums, and scripts stay inline, with line
height reserved from their image metrics across the text run. Formulas requiring
more than two normal lines move into a separate block, with adjacent closing
punctuation kept beside the image. The latest native layout still needs iPhone
and Android device validation.
On desktop, drag an overflowing formula left or right to pan; releasing a drag
does not open the viewer. Trackpad and touch scrolling remain available.

Click or tap a formula, diagram, or its source placeholder to open the shared
viewer. Keyboard users can activate the same entries. The conversation shows no
hover toolbar or tap-to-reveal action row. Source remains selectable, and dragging
or selecting text does not open the viewer.

The viewer has **Preview** and **Source** modes. **Fit** shows the complete image
inside the available width and height; **−** and **+** adjust temporary zoom, with
scrolling for larger images. The percentage is relative to the saved reading size
and does not change the Formula size setting. Diagrams start fitted within the
viewer without enlargement. Use the modal's close control to return to reading.
Overflowing previews also support mouse dragging. Source mode retains text selection.

Loading, failed, and disabled-module entries open on readable source. **Preview**
becomes available when an image is ready. Recoverable failures expose **Retry**
inside the viewer. Copy actions stay available in either mode; **Copy LaTeX**
preserves the original expression body, excluding a redundant outer wrapper.

Sharper PNGs are requested by display density and scale, up to 8×. Available
images stay visible while more detail loads. Image/payload limits can cap detail;
zoom cannot provide unlimited resolution. Images have source accessibility labels,
not semantic MathML navigation or selectable mathematical glyphs.

The reviewed TeX profile adds `mathtools` and `cancel`, including `\mathclap`,
`\coloneqq`, `\cancel`, and `\cancelto`. Undefined macros fail locally; custom
macro definitions do not carry across formulas. Markdown link labels keep their
existing literal behavior. See the [host limitations](qa/math-reading-gaps.md).

## Reading code blocks

Ordinary code blocks use Paseo's Markdown component, including its syntax
highlighting and copy control. Enable **Enhanced code scrolling** to use the plugin's plain
text viewer instead: overflowing blocks support mouse dragging on desktop.
**Select text** switches to text selection; **Drag to scroll** switches back.
**Copy source** copies the original block body in either mode. Short code blocks
and native clients keep their usual text selection and scrolling.

## Reading diagrams

Mermaid uses Paseo's renderer by default, including inside a message with math.
Enable **Enhanced Mermaid viewer** to use the plugin's server-rendered images and shared
viewer. Existing installations keep their saved choice. Incomplete or oversized
diagram fences in plugin-owned messages remain source.

## Reading tables

Enable **Tables**, then use **Open table** below a table to open its viewer.
**Preview** keeps the rendered cells; **Source** shows the copyable Markdown.
**Copy Markdown** preserves links, emphasis, inline code, formulas, column
alignment, and escaped pipes. For tables inside lists or quotes, it removes the
outer container markers; referenced link definitions are included when needed.
**More → Copy as TSV** copies displayed cell text for spreadsheets. Tabs and line
breaks within a cell become spaces so they cannot create extra columns or rows.

Tables scroll horizontally when their columns cannot fit. Links and text selection
remain available in the conversation; copying actions live inside the viewer.
Turning **Tables** off restores the standard table layout in plugin-owned messages
as well as leaving ordinary table-only messages to Paseo.

## Settings

Settings → Plugins → Advanced Markdown, per host:

- Math formulas on/off (on by default). Disabled math shows its source in a
  plugin-owned message.
- Enhanced Mermaid viewer on/off (off by default). Off uses Paseo's renderer; on uses
  the plugin's image viewer. A message with no enabled plugin enhancement stays
  with Paseo. Reopen the conversation after changing which messages are claimed.
- Enhanced code scrolling on/off (off by default). When on, fenced and indented code blocks
  use the plugin's drag-to-scroll and selection controls. Off uses Paseo's code
  rendering, including within messages that also contain math.
- Tables on/off (off by default). When on, Markdown tables keep readable column
  widths and scroll horizontally inside the message instead of squeezing every
  column to a fraction of the message width.
- Text size inside plugin rows.
- Formula size and its independent reset.
- Runtime status: engine versions, browser, cache directory, queue and cache
  counts.

These switches do not change Paseo's built-in Mermaid rendering for rows the
plugin does not own.

Mermaid, code blocks and tables are opt-in enhancements. Math remains enabled by
default. Copying a code block copies its source, without the fence. Use the table
viewer to copy Markdown or TSV.

## What is rendered, and what is not

| Content | Behavior |
| --- | --- |
| Complete inline or display math, closed `math` fence | image; click or tap to inspect and copy |
| A `math` fence whose body is itself wrapped in `\[…\]`, `$$…$$`, `\(…\)`, or `$…$` | the redundant wrapper is ignored, the formula renders |
| Complete `mermaid` fence | Paseo's diagram renderer by default; plugin image and viewer when Enhanced Mermaid viewer is enabled |
| Unclosed delimiters or fences while streaming | readable source until closed |
| Prices (`$5 and $10`), `\$`, inline code, other fences | plain text / code |
| Footnote markers and definitions (`[^note]`, `[^note]: …`) | readable text; formulas in definition lines render, without footnote navigation |
| Invalid or oversized TeX/Mermaid | readable source; ordinary code limits below still apply |
| Any ordinary code block or table over its budget, including beside math or diagrams | the entire timeline row is left to Paseo’s renderer |
| Local source-file links beside formulas or diagrams | clickable read-only source preview on the selected host; supports relative paths, absolute paths, `file://` URLs, `:line` and `#Lline` anchors |
| Messages with inline images or unsupported link schemes | left to Paseo's renderer |
| User messages, tool output, other timeline rows | unchanged |

Current Paseo transformers receive the accumulated assistant message, including
blank lines inside `$$` display math. Incomplete delimiters stay as source until
closed. The paragraph-splitting behavior in the 0.8 QA records is historical.

Local file links open a plugin preview because Paseo's public timeline SDK does
not expose file-tab navigation. Files are read only after a click, relative to
the conversation's working directory on its host. The preview shows up to 200
lines / 32 KiB around the requested line and can copy the path or displayed source.
Only UTF-8 regular files up to 1 MiB are supported; missing, binary, or larger
files show an error. HTTP(S) and mail links keep their usual behavior.

Copy scopes: copying happens inside the viewer. In **Preview**, **Copy LaTeX** or
**Copy Mermaid** copies the original expression or diagram body. In **Source**,
**Copy Markdown** copies the exact block, including its delimiters or fence.
**More** offers the other copy format and **Copy fragment Markdown**,
which copies the source message supplied to the plugin, including its prose and
other blocks. A turn can contain several assistant messages: this action does
not collect the other messages or replace Paseo's **Copy turn** action.

## Limitations

| Limit | Value |
| --- | --- |
| Formula | 4096 characters |
| Mermaid definition | 32 KiB |
| Ordinary code block | 65,536 JavaScript string units, including a parsed trailing newline |
| Table | 400 cells per table, including the header; multiple tables are budgeted separately |
| Image | 2,000,000 base64 characters; 8 M raster pixels and 4096 px longest edge (large diagrams are re-rendered at a lower scale, down to 0.5x) |
| Math raster | Density 1/2/3/4/6/8; logical size independent of density; lower detail is used when an image budget is reached |
| Math queue | 1 rendering, up to 128 waiting inputs; duplicate requests share work |
| Mermaid queue | 1 running, 8 waiting per plugin process; 15 s per task |
| Caches | 128 images / 8 MiB on the host and in each client |

Rendering happens on the selected daemon host only. Message content never
leaves it; the render browser runs with networking disabled.

# Usage and rendering limits

[Back to README](../README.md) · [Installation](installation.md)

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

In messages rendered by this plugin, overflowing code blocks support mouse dragging
on desktop. **Select text** switches to text selection; **Drag to scroll** switches
back. **Copy source** copies the entire original block body in either mode. Short
code blocks and native clients keep their usual text selection and scrolling.

## Settings

Settings → Plugins → Advanced Markdown, per host:

- Math formulas on/off, Mermaid diagrams on/off. A disabled module shows its
  source. A message whose enabled content is exhausted returns to Paseo's own
  renderer the next time it is displayed; rows already on screen update after a
  reload or when the conversation is reopened.
- Code blocks on/off (off by default). When on, fenced and indented code blocks
  render with a horizontal scroll instead of wrapping long lines and breaking
  indentation. Messages that also contain math, diagrams, or tables are shown by
  the plugin regardless.
- Tables on/off (off by default). When on, Markdown tables keep readable column
  widths and scroll horizontally inside the message instead of squeezing every
  column to a fraction of the message width.
- Text size inside plugin rows.
- Formula size and its independent reset.
- Runtime status: engine versions, browser, cache directory, queue and cache
  counts.

These switches do not change Paseo's built-in Mermaid rendering for rows the
plugin does not own.

Code blocks and tables are off by default so an update does not change which rows
the plugin owns; turn them on to fix wrapped folder trees and squeezed tables on
narrow screens. Copying a code block still copies its source, without the fence.
Tables render with **Copy table** (GFM) and **Copy as TSV** actions so the data
pastes into a chat or a spreadsheet.

## What is rendered, and what is not

| Content | Behavior |
| --- | --- |
| Complete inline or display math, closed `math` fence | image; click or tap to inspect and copy |
| A `math` fence whose body is itself wrapped in `\[…\]`, `$$…$$`, `\(…\)`, or `$…$` | the redundant wrapper is ignored, the formula renders |
| Complete `mermaid` fence: flowchart, sequence, class, state, ER, Gantt (verified); other types on a best-effort basis | image; click or tap to inspect and copy |
| Unclosed delimiters or fences while streaming | readable source until closed |
| Prices (`$5 and $10`), `\$`, inline code, other fences | plain text / code |
| Footnote markers and definitions (`[^note]`, `[^note]: …`) | readable text; formulas in definition lines render, without footnote navigation |
| Invalid TeX, invalid Mermaid, oversized input | source with a short reason; other content still renders |
| Local source-file links beside formulas or diagrams | clickable read-only source preview on the selected host; supports relative paths, absolute paths, `file://` URLs, `:line` and `#Lline` anchors |
| Messages with inline images or unsupported link schemes | left to Paseo's renderer |
| User messages, tool output, other timeline rows | unchanged |

Bare `$$` display math that contains a blank line is split by Paseo while
streaming; each half stays readable source. Use a ```` ```math ```` fence for
multi-paragraph display math.

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
which copies the timeline row's text. Paseo may split one long reply into several
rows while it streams; this last action copies only the row containing the entry.

## Limitations

| Limit | Value |
| --- | --- |
| Formula | 4096 characters |
| Mermaid definition | 32 KiB |
| Image | 2,000,000 base64 characters; 8 M raster pixels and 4096 px longest edge (large diagrams are re-rendered at a lower scale, down to 0.5x) |
| Math raster | Density 1/2/3/4/6/8; logical size independent of density; lower detail is used when an image budget is reached |
| Math queue | 1 rendering, up to 128 waiting inputs; duplicate requests share work |
| Mermaid queue | 1 running, 8 waiting per plugin process; 15 s per task |
| Caches | 128 images / 8 MiB on the host and in each client |

Rendering happens on the selected daemon host only. Message content never
leaves it; the render browser runs with networking disabled.

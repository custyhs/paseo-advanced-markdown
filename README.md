# Advanced Markdown for Paseo

Renders math formulas and Mermaid diagrams inside assistant messages in
[Paseo](https://paseo.sh) 0.8.x and 0.9.x, as an installable plugin. No Paseo fork, no
patch: the official app, daemon, and plugin SDK are the only dependencies.

- Math: `$…$`, `\(…\)`, `$$…$$`, `\[…\]`, and ```` ```math ```` fences,
  typeset on the host with MathJax and rasterized with resvg.
- Mermaid: ```` ```mermaid ```` fences rendered on the host with the pinned
  Mermaid CLI and a plugin-managed Chrome headless shell.
- Both in one message, mixed with ordinary Markdown (headings, emphasis,
  lists, quotes, tables, code, HTTP(S) links).
- Chinese bold text and boxed equation borders are preserved.
- Copy TeX and original source, formula/diagram inspection, light and dark themes,
  and per-host size/module settings.

**v0.2.0** adds a shared formula/diagram viewer, mouse dragging for overflowing
formulas and code, and fixes for footnote rendering and native inline formula
layout. See the [release notes](docs/release/0.2.0.md) and
[validation record](docs/qa/click-viewer.md). The latest iPhone layout adjustment
still needs device confirmation; Android UI validation remains pending.

## Requirements

| Side | Requirement |
| --- | --- |
| Paseo | app and daemon **>=0.8.0 <0.10.0**; compiler/SDK checks cover 0.8.0 and 0.9.0-beta.2 (see the [compatibility record](docs/qa/paseo-0.9-compatibility.md)) |
| Daemon host | Node ≥ 22.22 and npm on `PATH` for the preparation step, Git, about 700 MiB of disk in the plugin cache, network access during installation only |
| Text font | A font covering any non-Latin characters used inside formulas (Chinese, Japanese, Korean, …). macOS and most desktop Linux installs already have one; see [Text inside formulas](#text-inside-formulas) |
| Daemon host OS | verified on macOS arm64; Linux needs a CJK font (`fonts-noto-cjk`), `ps` (`procps`), the usual Chrome shared libraries, and either unprivileged user namespaces or `PASEO_ADVANCED_MARKDOWN_NO_SANDBOX=1` in the daemon's environment (Ubuntu 24.04 restricts them by default); Windows is untested |
| Clients | official browser web UI verified in detail; prior rendering flow verified by the maintainer on official iOS/Paseo 0.8.0 (2026-09-14) and another Mac; v0.2.0's latest iPhone layout and Android UI remain unverified (see `docs/qa/`) |

Plugins must be enabled on the daemon (Settings → Plugins, or `pluginsEnabled`
in `config.json`).

Paseo also checks prereleases against their stable core, so `0.9.0-beta.2`
meets this range. This is a bounded compatibility policy, not a claim that every
0.8/0.9 build has received device QA. **v0.1.5** adds this compatibility range;
tags through v0.1.4 still require exactly 0.8.0. Install v0.2.0 for the current release.

## Install

From Git, pinned to a tag (recommended):

```bash
paseo plugin add custyhs/paseo-advanced-markdown --ref v0.2.0
paseo plugin ls
```

Paseo runs the manifest's preparation commands on the daemon host:
`npm ci`, `npm run build`, and `npm run prepare-browser`. The last one installs
the pinned Mermaid CLI runtime and Chrome headless shell into
`~/.cache/paseo-advanced-markdown` (or `$XDG_CACHE_HOME/paseo-advanced-markdown`,
`%LOCALAPPDATA%\paseo-advanced-markdown` on Windows; override with
`PASEO_ADVANCED_MARKDOWN_CACHE`). That directory is outside Paseo's managed
checkouts, so plugin updates reuse it and a removed plugin can be cleaned up by
deleting it.

From a local checkout:

```bash
git clone https://github.com/custyhs/paseo-advanced-markdown.git
cd paseo-advanced-markdown
npm ci && npm run build && npm run prepare-browser
paseo plugin install "$PWD"
```

Put `--host <host:port>` before `plugin` to target a daemon other than the
CLI's default one. `paseo plugin add` and `plugin install` mean you trust this
codebase: its server side runs unsandboxed on the daemon host.

## Update and roll back

```bash
paseo plugin update advanced-markdown        # tracks the ref you installed
```

A fixed tag does not advance to the next release. If `paseo plugin update --help`
lists `--ref`, switch an existing Git installation without removing its settings:

```bash
paseo plugin update advanced-markdown --ref v0.2.0
```

Older CLIs require removing and adding the plugin with the new tag; record your
plugin settings before removal, because removal deletes them. To roll back, use
`v0.1.5`, which supports the same Paseo version range. Tags through v0.1.4 require
exactly Paseo 0.8.0 and cannot be used to roll back on 0.9.

A failed preparation during `plugin update` keeps the installed version running. Updates never touch
chat history, Drafts, or other plugins.

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
| Messages with inline images or links requiring host file navigation | left to Paseo's renderer |
| User messages, tool output, other timeline rows | unchanged |

Bare `$$` display math that contains a blank line is split by Paseo while
streaming; each half stays readable source. Use a ```` ```math ```` fence for
multi-paragraph display math.

Copy scopes: copying happens inside the viewer. In **Preview**, **Copy LaTeX** or
**Copy Mermaid** copies the original expression or diagram body. In **Source**,
**Copy Markdown** copies the exact block, including its delimiters or fence.
**More** offers the other copy format and **Copy fragment Markdown**,
which copies the timeline row's text. Paseo may split one long reply into several
rows while it streams; this last action copies only the row containing the entry.

## Reading code blocks

In messages rendered by this plugin, overflowing code blocks support mouse dragging
on desktop. **Select text** switches to text selection; **Drag to scroll** switches
back. **Copy source** copies the entire original block body in either mode. Short
code blocks and native clients keep their usual text selection and scrolling.

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
existing literal behavior. See the [host limitations](docs/qa/math-reading-gaps.md).

## Text inside formulas

MathJax's math fonts cover Latin, Greek, and mathematical symbols. Anything else,
including Chinese, Japanese, and Korean in `\text{…}`, needs a text font on the
daemon host. The plugin reads a font collection, plus a matching bold companion when needed, and hands them to the rasterizer; it
looks for these, in order, and the first parseable font covering all required fallback characters wins:

| Platform | Looked for |
| --- | --- |
| macOS | PingFang, Hiragino Sans GB, STHeiti Light, Songti, Arial Unicode |
| Linux | Noto Sans/Serif CJK, WenQuanYi Zen Hei, AR PL UMing |
| Windows | Microsoft YaHei, SimSun, Microsoft JhengHei, Arial Unicode MS |

Set `PASEO_ADVANCED_MARKDOWN_FONT` in the daemon's environment to use a specific
font file instead. On a minimal Linux host, install one first, for example
`apt-get install fonts-noto-cjk`. When no usable font is found the formula keeps
its source and says so; installing a font takes effect on the next render, with
no plugin reload. For font and renderer failures, open the source placeholder and
use **Retry** in the viewer. A damaged font or missing glyph returns source with
an error instead of a successful blank image. If bold text is requested,
the font must include a matching bold face; common sibling filenames such as
`NotoSansCJK-Bold.ttc` are discovered automatically.

## Settings

Settings → Plugins → Advanced Markdown, per host:

- Math formulas on/off, Mermaid diagrams on/off. A disabled module shows its
  source. A message whose enabled content is exhausted returns to Paseo's own
  renderer the next time it is displayed; rows already on screen update after a
  reload or when the conversation is reopened.
- Text size inside plugin rows.
- Formula size and its independent reset.
- Runtime status: engine versions, browser, cache directory, queue and cache
  counts.

These switches do not change Paseo's built-in Mermaid rendering for rows the
plugin does not own.

## Limits

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

## Other timeline plugins

Paseo gives an assistant row to the first plugin whose transformer claims it.
Do not enable this plugin together with another plugin that replaces assistant
rows containing math or Mermaid (for example a separate math plugin); disable
one of them.

## Development

```bash
npm ci
npm run build            # portable Markdown bundle, resvg WASM, runtime manifest
npm run prepare-browser  # Mermaid runtime + Chrome headless shell into the cache
npm run typecheck && npm run lint && npm run format:check
npm test                 # parser, renderer, cache, Mermaid, fault injection
npm run paseo-source     # official Paseo 0.8.0 app sources for the smoke
npm run smoke            # 0.8 compiler + official projection + RPCs
HERMES_BIN=… npm run smoke:hermes
```

To check a newer compiler/SDK without changing the 0.8 development lockfile:

```bash
npm install --prefix .compat-runtime --no-save --package-lock=false @getpaseo/server@0.9.0-beta.2 @getpaseo/plugin@0.9.0-beta.2
PASEO_COMPAT_RUNTIME=.compat-runtime npm run smoke
```

The app projection/stream fixtures remain pinned to 0.8.0. The selected compiler,
manifest validator, SDK registrations and RPC handlers use the selected runtime;
this smoke does not replace a real 0.9 client/device check.

QA notes and evidence: `docs/qa/`. Licensing: Apache-2.0, see `LICENSE` and
`NOTICE` (parts adapted from q5m-ai/paseo-math).

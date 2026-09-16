# Advanced Markdown for Paseo

Renders math formulas and Mermaid diagrams inside assistant messages in
[Paseo](https://paseo.sh) 0.8.0, as an installable plugin. No Paseo fork, no
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

The mathematical reading controls below are implemented in the **unreleased
0.2 candidate**. The published installation command still selects v0.1.3. New
native iPhone/Electron interaction verification is pending; see the
[candidate evidence](docs/qa/math-reading-candidate.md).

## Requirements

| Side | Requirement |
| --- | --- |
| Paseo | app and daemon **0.8.0** (the manifest pins `requirements.paseo` to `0.8.0`; other releases are untested) |
| Daemon host | Node ≥ 22.22 and npm on `PATH` for the preparation step, Git, about 700 MiB of disk in the plugin cache, network access during installation only |
| Text font | A font covering any non-Latin characters used inside formulas (Chinese, Japanese, Korean, …). macOS and most desktop Linux installs already have one; see [Text inside formulas](#text-inside-formulas) |
| Daemon host OS | verified on macOS arm64; Linux needs a CJK font (`fonts-noto-cjk`), `ps` (`procps`), the usual Chrome shared libraries, and either unprivileged user namespaces or `PASEO_ADVANCED_MARKDOWN_NO_SANDBOX=1` in the daemon's environment (Ubuntu 24.04 restricts them by default); Windows is untested |
| Clients | official browser web UI verified in detail; official iOS app and a second Mac's desktop client verified for rendering by the maintainer; Android untested (see `docs/qa/`) |

Plugins must be enabled on the daemon (Settings → Plugins, or `pluginsEnabled`
in `config.json`).

## Install

From Git, pinned to a tag (recommended):

```bash
paseo plugin add custyhs/paseo-advanced-markdown --ref v0.1.3
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
paseo plugin remove advanced-markdown
paseo plugin add custyhs/paseo-advanced-markdown --ref v0.1.2   # roll back
```

A fixed tag does not advance to the next release. To switch from `v0.1.2` to
`v0.1.3`, remove the plugin and add it with `--ref v0.1.3`.

A failed preparation during `plugin update` keeps the installed version running. Updates never touch
chat history, Drafts, or other plugins.

## What is rendered, and what is not

| Content | Behavior |
| --- | --- |
| Complete inline or display math, closed `math` fence | image; source on copy |
| A `math` fence whose body is itself wrapped in `\[…\]`, `$$…$$`, `\(…\)`, or `$…$` | the redundant wrapper is ignored, the formula renders |
| Complete `mermaid` fence: flowchart, sequence, class, state, ER, Gantt (verified); other types on a best-effort basis | image; source on copy; Expand for full size |
| Unclosed delimiters or fences while streaming | readable source until closed |
| Prices (`$5 and $10`), `\$`, inline code, other fences | plain text / code |
| Invalid TeX, invalid Mermaid, oversized input | source with a short reason; other content still renders |
| Messages with inline images or links requiring host file navigation | left to Paseo's renderer |
| User messages, tool output, other timeline rows | unchanged |

Bare `$$` display math that contains a blank line is split by Paseo while
streaming; each half stays readable source. Use a ```` ```math ```` fence for
multi-paragraph display math.

Copy scopes: **Copy source** under a formula or diagram copies exactly that
block, delimiters included. **Copy this message's source** copies the timeline
row's text. Paseo may split one long reply into several rows while it streams;
each row copies itself.

## Reading formulas

Formula size offers 75%, 100%, 125%, 150%, and 200%, relative to the text size.
This preference is shared by clients of the selected host and affects only math.
Reset formula size restores 100% without changing prose, Mermaid, or module switches.

Each paragraph/list/table cell measures its own width. A formula can shrink by
up to 15% to fit; longer formulas keep their reading size and scroll horizontally.
An oversized inline formula moves into a scrollable block at the same source
position. Short formulas do not stretch to fill the available width.

On non-compact mouse/trackpad browsers, the formula toolbar appears on hover or
keyboard focus. Its space stays reserved so the conversation does not move.
Compact, native, and non-hover touch clients keep the buttons visible. Inspector,
source-mode and retry controls remain visible.

Tap a formula or use its keyboard-accessible entry to inspect it. **Fit** starts
with the complete image inside the available width and height. **Reading size**
restores the saved size; 1.5×/2×/3× provide temporary zoom with scrolling.
These controls do not change the saved formula-size setting. **Show source**,
**Copy TeX**, **Copy source**, and **Close formula** are available in the inspector.
Copy TeX preserves the original expression body (excluding a redundant outer
wrapper); Copy source includes the original delimiters or fence.

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
no plugin reload. Font and renderer failures expose Retry, including an inline
Retry control beside inline formulas. A damaged font or missing glyph returns
source with an error instead of a successful blank image. If bold text is requested,
the font must include a matching bold face; common sibling filenames such as
`NotoSansCJK-Bold.ttc` are discovered automatically.

## Settings

Settings → Plugins → Advanced Markdown, per host:

- Math formulas on/off, Mermaid diagrams on/off. A disabled module shows its
  source. A message whose enabled content is exhausted returns to Paseo's own
  renderer the next time it is displayed; rows already on screen update after a
  reload or when the conversation is reopened.
- Text size inside plugin rows.
- Formula size and its independent reset (unreleased candidate).
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
npm run smoke            # released compiler + official projection + RPCs
HERMES_BIN=… npm run smoke:hermes
```

QA notes and evidence: `docs/qa/`. Licensing: Apache-2.0, see `LICENSE` and
`NOTICE` (parts adapted from q5m-ai/paseo-math).

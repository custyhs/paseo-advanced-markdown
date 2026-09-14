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
- Copy source per formula, per diagram, and per message; show source; retry;
  expand diagrams; light and dark themes; per-host module switches.

## Requirements

| Side | Requirement |
| --- | --- |
| Paseo | app and daemon **0.8.0** (the manifest pins `requirements.paseo` to `0.8.0`; other releases are untested) |
| Daemon host | Node ≥ 22.22 and npm on `PATH` for the preparation step, Git, about 700 MiB of disk in the plugin cache, network access during installation only |
| Daemon host OS | verified on macOS arm64; Linux needs a CJK font (`fonts-noto-cjk`) for Chinese labels and the usual Chrome shared libraries; Windows is untested |
| Clients | official browser web UI verified; Electron desktop, iOS, and Android are untested (see `docs/qa/`) |

Plugins must be enabled on the daemon (Settings → Plugins, or `pluginsEnabled`
in `config.json`).

## Install

From Git, pinned to a tag (recommended):

```bash
paseo plugin add custyhs/paseo-advanced-markdown --ref v0.1.0
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
paseo plugin add custyhs/paseo-advanced-markdown --ref v0.1.0   # pin an earlier tag
```

A failed preparation keeps the installed version running. Updates never touch
chat history, Drafts, or other plugins.

## What is rendered, and what is not

| Content | Behavior |
| --- | --- |
| Complete inline or display math, closed `math` fence | image; source on copy |
| Complete `mermaid` fence: flowchart, sequence, class, state, ER, Gantt (verified); other types on a best-effort basis | image; source on copy; Expand for full size |
| Unclosed delimiters or fences while streaming | readable source until closed |
| Prices (`$5 and $10`), `\$`, inline code, other fences | plain text / code |
| Invalid TeX, invalid Mermaid, oversized input | source with a short reason; other content still renders |
| Messages with inline images | left to Paseo's renderer |
| User messages, tool output, other timeline rows | unchanged |

Bare `$$` display math that contains a blank line is split by Paseo while
streaming; each half stays readable source. Use a ```` ```math ```` fence for
multi-paragraph display math.

Copy scopes: **Copy source** under a formula or diagram copies exactly that
block, delimiters included. **Copy this message's source** copies the timeline
row's text. Paseo may split one long reply into several rows while it streams;
each row copies itself.

## Settings

Settings → Plugins → Advanced Markdown, per host:

- Math formulas on/off, Mermaid diagrams on/off. A disabled module shows its
  source. A message whose enabled content is exhausted returns to Paseo's own
  renderer the next time it is displayed; rows already on screen update after a
  reload or when the conversation is reopened.
- Text size inside plugin rows.
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

# Installation and troubleshooting

[Back to README](../README.md) · [Usage](usage.md) · [Development](development.md)

## Requirements

v0.4.0 requires **Paseo app and daemon >=0.13.0**, with no upper version limit.
See [host integration](qa/host-integration.md) for the separate client fix required
to retain reply actions in transformed messages.

| Side | Requirement |
| --- | --- |
| Paseo | app and daemon **>=0.13.0**, with no upper version limit; use v0.3.2 for Paseo 0.11–0.12 and v0.3.0 for Paseo 0.8–0.10; see the version-specific checks and platform coverage in the [release notes](release/0.4.0.md) |
| Daemon host | Node ≥ 22.22 and npm on `PATH` for the preparation step, Git, about 700 MiB of disk in the plugin cache, network access during installation only |
| Text font | A font covering any non-Latin characters used inside formulas (Chinese, Japanese, Korean, …). macOS and most desktop Linux installs already have one; see [Text inside formulas](#text-inside-formulas) |
| Daemon host OS | verified on macOS arm64; Linux needs a CJK font (`fonts-noto-cjk`), `ps` (`procps`), the usual Chrome shared libraries, and either unprivileged user namespaces or `PASEO_ADVANCED_MARKDOWN_NO_SANDBOX=1` in the daemon's environment (Ubuntu 24.04 restricts them by default); Windows is untested |
| Clients | patched Paseo 0.15.0-beta.1 browser UI verified at desktop and phone widths; native iOS/Android UI remains unverified (see [validation record](qa/host-integration.md)) |

Plugins must be enabled on the daemon (Settings → Plugins, or `pluginsEnabled`
in `config.json`).

Paseo checks prereleases against their stable core, so `0.13.0-beta.1` and
`0.15.0-beta.1` meet this range. Compiler and package checks cover official
0.13.0 and 0.14.0. An accepted version range does not imply device validation;
see the [release notes](release/0.4.0.md) for coverage and limitations.

## Install

From Git, pinned to a tag (recommended):

```bash
paseo plugin add custyhs/paseo-advanced-markdown --ref v0.4.0
paseo plugin ls
```

Paseo runs the manifest's preparation commands on the daemon host:
`npm ci`, `npm run build`, and `npm run prepare-browser`. The last one prepares
the formula assets and installs the pinned Mermaid CLI runtime and Chrome headless shell into
`~/.cache/paseo-advanced-markdown` (or `$XDG_CACHE_HOME/paseo-advanced-markdown`,
`%LOCALAPPDATA%\paseo-advanced-markdown` on Windows; override with
`PASEO_ADVANCED_MARKDOWN_CACHE`, which must be an absolute path). Relative
`XDG_CACHE_HOME` and `LOCALAPPDATA` values are ignored. That directory is outside Paseo's managed
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
paseo plugin update advanced-markdown --ref v0.4.0
```

For an existing npm installation:

```bash
paseo plugin update advanced-markdown --version 0.4.0
```

To roll back, select `--ref v0.3.2` for Git or `--version 0.3.2` for npm.
That release supports Paseo >=0.11.0. Paseo 0.8–0.10 users must stay on v0.3.0.
Older compatibility ranges are recorded in the [release notes](release/).

A failed preparation during `plugin update` keeps the installed version running. Updates never touch
chat history, Drafts, or other plugins.

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

## Renderer errors

Missing or damaged formula assets are verified and repaired offline at startup.
If a formula or diagram fails, open its source placeholder and choose **Retry**.
For missing glyphs, follow [Text inside formulas](#text-inside-formulas).

Local directory reloads do not run manifest build commands. After changing source,
run `npm run build` before reloading. Mermaid also needs `npm run prepare-browser`
when its worker or browser is absent. `npm run prepare-assets` is available for
explicit formula asset preparation; use the same cache environment as the daemon.

If automatic recovery fails, the error identifies the asset and cache path.
Check write permissions, or reinstall/rebuild the plugin if its bundled recovery
data is damaged. See [asset recovery](development.md#asset-recovery) for the
startup mechanism and validation.

## Conflicting timeline plugins

Paseo gives an assistant row to the first plugin whose transformer claims it.
Do not enable this plugin together with another plugin that replaces assistant
rows containing math or Mermaid (for example a separate math plugin); disable
one of them.

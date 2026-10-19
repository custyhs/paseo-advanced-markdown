# Development and packaging

[Back to README](../README.md) · [Installation](installation.md)

## Local setup

```bash
npm ci
npm run build            # Markdown/MathJax bundles, formula assets, runtime manifest
npm run prepare-browser  # formula assets, Mermaid runtime and browser into the cache
npm run typecheck && npm run lint && npm run format:check
npm run paseo-source     # pinned app projection/stream fixtures for the smoke
npm run smoke            # 0.11.0 compiler/SDK + pinned fixtures + RPCs
HERMES_BIN=… npm run smoke:hermes
```

For local regression tests, run the relevant file with
`npx vitest run tests/<file>.test.ts --bail=1`. The full suite runs in GitHub CI.

The development compiler and SDK use official Paseo 0.11.0, the minimum supported
release. To check 0.12.0 without changing that baseline:

```bash
npm install --prefix .compat-runtime --no-save --package-lock=false @getpaseo/server@0.12.0 @getpaseo/plugin@0.12.0
PASEO_COMPAT_RUNTIME=.compat-runtime npm run smoke
```

The app projection/stream fixtures remain pinned to 0.8.0 as a legacy regression
fixture; this does not extend the supported Paseo range. The selected compiler,
manifest validator, SDK registrations and RPC handlers use the selected runtime;
this smoke does not replace a real client/device check for the selected version.

## Prepare an npm package

```bash
npm run pack
npm run smoke:package
PASEO_COMPAT_RUNTIME=.compat-runtime npm run smoke:package
```

`npm run pack` builds the generated modules and writes
`.smoke/npm/paseo-advanced-markdown-<version>.tgz`, plus a file inventory and integrity
hash in `.smoke/npm/pack.json`. It does not publish anything. The generated package
contains the runtime sources, original resvg WASM, precompiled MathJax renderer,
static MathJax SVG font data, preparation scripts,
worker lockfile, and a production `npm-shrinkwrap.json`. Host libraries and build
tools are excluded from its dependencies. The precompiled renderer uses the same
MathJax 3.2.2 profile as the Git source and includes its license. Unused MathJax
speech/XML dependencies are not installed; dependency overrides in a published
package do not reliably control the consuming application's dependency graph.

The repository stays private in npm metadata because its manifest prepares a Git
checkout with `npm ci` and a source build. The generated npm package is public-ready
and its manifest prepares the formula assets, Mermaid worker and browser. Publish the
generated `.tgz`, not the repository directory; do not use bare `npm pack` here.
Keep the package and GitHub source versions aligned before publication.

Packaging counts every JS/TS source file shipped under `client/`, `server/`,
`shared/`, and `scripts/`, plus the root entries, including generated modules and
declarations. It fails above 2,000,000 bytes in total or per file, or 200 files.
The count is saved in `.smoke/npm/source-budget.json` and does not depend on the
community scanner's import traversal.

`smoke:package` installs the tarball outside the checkout with lifecycle scripts
disabled and production dependencies only. It runs the package's preparation,
moves the installation to simulate activation, compiles both entries with the
selected official Paseo compiler, and renders real formula and Mermaid PNGs
through the compiled RPC handlers. It also clears or corrupts the formula cache
and removes the original data files after compilation to verify offline startup
recovery from the in-memory bundle. Its browser cache and
reports stay under `.smoke/npm/`; it does not reload the production plugin or daemon.

## Asset recovery

The WASM and font JSON are data files. Preparation checks their SHA256 and size
and copies them to content-addressed paths under the cache's `assets/` directory.
The build also produces compressed recovery data, imported into the server bundle
because Paseo evaluates that bundle in memory without a reliable package path.
Before loading the renderer, startup verifies both assets and restores missing or
damaged copies offline. The first render can also recover a binary removed after
startup. Valid cache files are reused; old versions are retained for running
processes and rollback. Recovery never installs dependencies or downloads a browser.

For manual preparation and error recovery, see [Renderer errors](installation.md#renderer-errors).

## Validation records

See [QA records](qa/), the [initial npm package validation](qa/npm-package.md),
and [release notes](release/) for version-specific evidence and device limitations.

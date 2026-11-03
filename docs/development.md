# Development and packaging

[Back to README](../README.md) · [Installation](installation.md)

## Local setup

```bash
npm ci --ignore-scripts
npm run build           # Markdown/MathJax bundles, formula assets, version metadata
npm run prepare-assets  # verify and copy bundled formula assets into the cache
npm run typecheck && npm run lint && npm run format:check
npm run paseo-source     # pinned app projection/stream fixtures for the smoke
npm run smoke            # 0.13.0 compiler/SDK + legacy fixtures + RPCs
HERMES_BIN=… npm run smoke:hermes
```

For local regression tests, run the relevant file with
`npx vitest run tests/<file>.test.ts --bail=1`. The full suite runs in GitHub CI.

The development compiler and SDK use official Paseo 0.13.0, the minimum supported
release for the public `Markdown` and consolidated client UI exports. To check
0.14.0 without changing that baseline:

```bash
npm install --prefix .compat-runtime --no-save --package-lock=false @getpaseo/server@0.14.0 @getpaseo/plugin@0.14.0
PASEO_COMPAT_RUNTIME=.compat-runtime npm run smoke
```

The app projection/stream fixtures remain pinned to 0.8.0 as a legacy regression
fixture; this does not extend the supported Paseo range. The selected compiler,
manifest validator, SDK registrations and RPC handlers use the selected runtime;
this smoke does not replace a real client/device check for the selected version.
Current reply-action and collapse regressions use the actual host presentation
pipeline, not the legacy fixture. See [host integration](qa/host-integration.md).

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
static MathJax SVG font data, offline asset-preparation scripts, `OVERVIEW.md`,
listing images, and a production `npm-shrinkwrap.json`. It contains no Mermaid CLI
worker, Puppeteer browser installer, or Chrome download script. Host libraries and build
tools are excluded from its dependencies. The precompiled renderer uses the same
MathJax 3.2.2 profile as the Git source and includes its license. Unused MathJax
speech/XML dependencies are not installed; dependency overrides in a published
package do not reliably control the consuming application's dependency graph.

The repository stays private in npm metadata because its manifest prepares a Git
checkout with `npm ci --ignore-scripts` and a source build. The generated npm package is public-ready
and its manifest only prepares bundled formula assets offline. Publish the
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
selected official Paseo compiler, and renders real formula PNGs through the
compiled RPC handler. It verifies that preparation and activation create no browser
or Mermaid worker runtime. It also clears or corrupts the formula cache
and removes the original data files after compilation to verify offline startup
recovery from the in-memory bundle. Its isolated installation and cache use temporary
directories that are removed afterward; reports stay under `.smoke/npm/`.
It does not reload the production plugin or daemon.

## Publish with GitHub Actions

Use [Publish npm package](https://github.com/custyhs/paseo-advanced-markdown/actions/workflows/publish.yml)
for stable releases. It runs on demand; pushes and tags do not publish packages.
Select an existing `vX.Y.Z` tag and leave **publish** off for a rehearsal. The
workflow builds and tests the package, checks installation against Paseo 0.13.0,
0.14.0 and 0.15.0-beta.1, and retains the tarball as the `npm-package` artifact.
Turn **publish** on to publish that run's checked tarball to npm's `latest` tag.
An already published version cannot be overwritten. When a rerun produces the
same artifact as the published version, it skips uploading and verifies the
existing package; different bytes fail the run.

The workflow builds its triggering commit so npm's provenance identifies the
actual source. For new releases, dispatch from the release tag:

```bash
gh workflow run publish.yml --ref v0.4.2 -f release_tag=v0.4.2 -f publish=false
# After checking the rehearsal, change publish=false to publish=true.
```

For the existing v0.4.1 tag, which predates this workflow, use `--ref main` and
`-f release_tag=v0.4.1`. This only works when the tag is an ancestor and all
intervening file differences are under `.github/` or `docs/`. Package sources,
README, screenshots, dependencies and build scripts must match the tag. Do not
move a published tag or check out a different commit inside the workflow.

### One-time npm authorization

In the package's npm **Settings → Trusted publishing**, authorize:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `custyhs` |
| Repository | `paseo-advanced-markdown` |
| Workflow filename | `publish.yml` |
| Environment name | Leave empty |
| Allowed actions | Allow direct `npm publish` |

Alternatively, after `npm login`, run this with an account that owns the package
and has 2FA enabled. Complete the interactive npm authentication prompt:

```bash
npx --yes npm@11.21.1 trust github paseo-advanced-markdown \
  --repo=custyhs/paseo-advanced-markdown \
  --file=publish.yml --allow-publish \
  --registry=https://registry.npmjs.org/
```

No `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret is needed. Only the publishing job can
request an OIDC credential. Configure the trust relationship when ready to publish:
npm requires its first successful publish within two days, or the unused
configuration expires. See [npm's Trusted Publishing documentation](https://docs.npmjs.com/trusted-publishers/)
for current requirements and [npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
for CLI authorization.

After publication, download that run's `npm-package` artifact and use its tarball
for the GitHub release attachment and its integrity for the directory review.
A previous local package can differ from the CI build; the workflow verifies the
registry contains exactly the CI-validated artifact. npm can accept an upload
before its processing makes the version readable, so verification waits up to
ten minutes. If that wait expires, inspect the registry before rerunning; wait
until processing finishes rather than attempting another upload.

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

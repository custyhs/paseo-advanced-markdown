# Paseo 0.12 compatibility — 2026-10-19

Advanced Markdown 0.3.1 supports app and daemon versions
`>=0.11.0 <0.13.0`. The development compiler and SDK baseline moves to official
0.11.0. No production renderer code or runtime dependencies changed.

The official `@getpaseo/server`, `@getpaseo/plugin`, and `@getpaseo/protocol`
0.12.0 packages identify commit
`cafe4b01c8522ff39560241c5deb01427dc8dc5b`, matching the official
[v0.12.0 release](https://github.com/getpaseo/paseo/releases/tag/v0.12.0).

## Compiler, SDK, and package checks

- The APIs used for timeline registration, RPCs, settings, modals, scrolling,
  and copying retain their contracts. The development SDK uses 0.11.0.
- `tests/paseo-compatibility.test.ts`: 38 passing app and daemon version gates:
  representative 0.11 and 0.12 prerelease/stable/patch versions are accepted;
  versions before 0.11 and 0.13 prerelease/stable versions are rejected.
- `tests/asset-startup.test.ts`: 3 passing cases with the 0.11.0 compiler. Its
  host fixture now implements the updated settings-registration contract.
- Source smoke with the official 0.11.0 and 0.12.0 compiler/SDK passed both bundle loaders,
  registration, RPC validation, formula/CJK/Mermaid rendering, and invalid-input
  fallback. Its projection and stream fixtures remain pinned to 0.8.0;
  the browser checks below exercise the actual 0.12 client.
- The final package, rebuilt with the 0.11.0 development baseline and revised
  requirement, passed isolated production-only installation with both 0.11.0
  and 0.12.0. Checks included both entry compilers, real formula and Mermaid PNG
  rendering, relocation, empty-cache startup, and corrupt-WASM/missing-font
  recovery without original assets. The production dependency audit reported
  zero vulnerabilities.
- Build, typecheck, lint, and formatting passed after the baseline update.
  Lint retains two pre-existing informational notices.
  The full suite runs in GitHub Actions: the validation job uses 0.11.0,
  and the separate compatibility matrix contains 0.12.0.

Reproduce the new-runtime checks without replacing the baseline dependencies:

```bash
npm install --prefix .compat-runtime --no-save --package-lock=false @getpaseo/server@0.12.0 @getpaseo/plugin@0.12.0
npx vitest run tests/paseo-compatibility.test.ts --bail=1
PASEO_COMPAT_RUNTIME=.compat-runtime PASEO_REQUIRE_MERMAID=1 npm run smoke
npm run pack
PASEO_COMPAT_RUNTIME=.compat-runtime npm run smoke:package
npm run smoke:package
```

## Official client checks

The official 0.12.0 daemon and its bundled web UI ran with a mock provider,
separate `PASEO_HOME`, prepared renderer cache, and temporary localhost port.
Chrome viewports were 1280 × 900 and 390 × 780. All 43 browser assertions passed:

- 15 table checks: module toggles, Preview/Source, exact Markdown and TSV
  clipboard contents at both widths, links, horizontal wheel/touch scrolling,
  and no document overflow or browser runtime errors.
- 25 formula, Mermaid, and code checks: real rendered images, viewer opening,
  zoom and mode switching, exact expression/Markdown/source clipboard contents,
  code scrolling by wheel, desktop drag, and phone touch, and no document overflow.
- 3 continuous-stream checks: appending under the same message ID keeps the
  table viewer open, copied Markdown includes the new row, and a formula inside
  the table preview opens the shared formula viewer.

The stream check covers the actual 0.12 path, which now projects complete source
messages instead of pre-splitting their Markdown into blocks. Phone screenshots
of the formula, Mermaid, and table viewers were visually reviewed. The isolated
daemon was stopped after QA.

## Platform coverage and evidence

The daemon checks ran on macOS arm64 with an isolated browser/runtime cache.
Native iOS/Android devices, Electron-specific behavior, and Windows were not
tested in this release. Phone-width web checks do not validate native sheets;
Paseo 0.12 changed their internals while preserving the plugin adapter.

Accepting the 0.12 series is a support policy; future 0.12.x releases were not
available for testing. No production daemon or installed plugin was changed.

Local evidence is retained under `.smoke/compat-0.12-*.log`,
`.smoke/compat-0.12-source-report.json`, `.smoke/compat-0.12-ui/`, and
`.smoke/npm/smoke-{0.11.0,0.12.0}.json`.
These generated files are ignored by Git.

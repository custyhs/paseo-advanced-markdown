# Paseo 0.9 compatibility repair — 2026-09-21

Base: Advanced Markdown v0.1.4, commit `7b0d32d54bb3`.
Release: Advanced Markdown v0.1.5.
Target: official Paseo 0.8.0 and 0.9.0-beta.2 on macOS arm64.

## Cause and change

The original production log rejected the plugin before compilation: `requires Paseo 0.8.0.
Your daemon is 0.9.0-beta.2`. The manifest was an exact version pin. It also
rejected patch 0.8.1, reproduced with the official validator in the regression test.

The repaired requirement is `>=0.8.0 <0.10.0`. Both app and daemon use Paseo's
validator, which also compares prereleases using their stable core. Tests cover
0.8.0, 0.8.1, 0.9.0-beta.2, 0.9.0 and 0.9.1; versions before 0.8, 0.10 (including
its prereleases), 1.0 and unknown versions remain rejected. These version-gate
cases are not device validation for every accepted release.

The development dependencies remain pinned to 0.8.0. No parser, formula/diagram
renderer, RPC contract, source operation, layout or settings behavior changed.

## Evidence

The initial audit used the installed app archive: twenty of its twenty-two SDK
JavaScript modules and the compiler matched 0.8.0 byte for byte; only unused
ACP/provider modules changed. Static inspection of the 0.9 frontend found the
timeline transformer, renderer props, settings hooks and used native/UI exports.
The release checks separately installed the published 0.9.0-beta.2 server and SDK
in `.compat-runtime`, preserving the 0.8.0 development dependencies and lockfile.

| Check | Result |
| --- | --- |
| Official version validator, app and daemon | 20 focused cases passed; old manifest failed |
| Official 0.8 compiler, registration harness and math RPCs | Passed |
| Published official 0.9.0-beta.2 compiler, registration harness and math RPCs | Passed |
| Chinese bold/boxed PNG, invalid TeX fallback | Passed through compiled bundles |
| Streaming/projection, host navigation fallthrough | Passed against unchanged pinned 0.8 app source fixtures, not a 0.9 UI test |
| New-version SDK/frontend contract review | Static comparison passed |
| Hermes client evaluation with selected 0.9 compiler/SDK | Both default flags and `-Xes6-class` passed |
| Build / typecheck / lint / format | Passed; two existing lint info messages |
| Mermaid unavailable fallback | Passed during the initial restricted checks |
| Mermaid real Chrome rendering | Passed with both compilers, including invalid-diagram fallback |
| Required-browser smoke guard | An empty cache failed with the expected assertion when `PASEO_REQUIRE_MERMAID=1` |
| Current daemon loading | Existing v0.1.4 checkout with the repaired manifest was `running` on 0.9.0-beta.2; `Plugin ready` at 2026-09-21 16:13:54 +08:00 |
| Current real-client rendering | Not repeated; daemon readiness does not prove client rendering |
| GitHub validation | Release is gated on both `validate` and `compatibility` jobs for the release commit |
| iPhone/Android | Not repeated |

Both local compiler runs produced a 103.5 × 34.5 logical-pixel formula, a
43 × 26 Chinese bold/boxed formula, and a 402 × 102 Mermaid diagram at scale 2.
The Mermaid runtime was ready with Mermaid CLI 11.17.0 and Chrome for Testing
153.0.8010.36. CI sets `PASEO_REQUIRE_MERMAID=1` for both compiler runs, so a missing
browser fails instead of satisfying the unavailable-runtime fallback.

Commands used for release checks:

```bash
npm run build
npm run typecheck
npm run lint
npm run format:check
npx vitest run tests/paseo-compatibility.test.ts --bail=1
PASEO_REQUIRE_MERMAID=1 npm run smoke
npm install --prefix .compat-runtime --no-save --package-lock=false @getpaseo/server@0.9.0-beta.2 @getpaseo/plugin@0.9.0-beta.2
PASEO_COMPAT_RUNTIME=.compat-runtime PASEO_REQUIRE_MERMAID=1 npm run smoke
PASEO_COMPAT_RUNTIME=.compat-runtime HERMES_BIN=<RN-0.81-hermes> npm run smoke:hermes
```

Full-suite verification runs in CI. Projection and streaming fixtures remain
pinned to 0.8.0; neither these harnesses nor Hermes evaluation provide 0.9 device
UI acceptance. This release work did not change the production installation,
settings, app or daemon, or restart the service.

# Regression verification: 0.1.3

Date: 2026-09-15. Baseline: v0.1.2 (`9a3bb4d`).

The six regressions found during the code audit are fixed without changing Paseo.
Tests use local fonts, the pinned real Chrome headless shell, and the released
Paseo 0.8.0 compiler. The full plugin suite runs in GitHub Actions.

| Regression | Evidence |
| --- | --- |
| Mermaid timeout or stop left Chrome descendants running | `tests/mermaid-process-tree.test.ts`: both cases start real Chrome through a CLI child, record owned PIDs, verify none remain alive, and open a page in an unrelated browser afterward |
| `\textbf{中文}` was rejected by the SVG attribute validator | `tests/math-render.test.ts`: plain and bold Chinese both render, with different PNGs; a separately installed bold face is loaded when the regular collection lacks it |
| Missing fonts remained cached as invalid TeX in the client | `tests/math-recovery.test.ts`: an actual client-cache request fails, a font is installed, the failure expires, and the same request succeeds; no manual cache reset between failure and success |
| A font header or cmap was mistaken for usable glyph data | `tests/math-render.test.ts`: truncated sfnt input and a real Latin-only font reject Chinese rather than returning a successful blank annotation |
| `\boxed` silently lost its border | `tests/math-render.test.ts`: raster assertions check the enclosing border and increased dimensions |
| Taking over math items disabled host file links | `tests/parser.test.ts`: relative, file, Windows-path and custom links return the item to the host; HTTP(S) and mailto remain supported |

## Local commands and results

- `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`: passed. Biome reports one existing configuration deprecation notice.
- `npx vitest run tests/parser.test.ts --bail=1`: 28 tests passed.
- `npx vitest run tests/math-render.test.ts --bail=1`: 12 tests passed.
- `npx vitest run tests/math-recovery.test.ts --bail=1`: 1 test passed.
- `npx vitest run tests/mermaid-lifecycle.test.ts --bail=1`: 4 tests passed.
- `npx vitest run tests/mermaid-process-tree.test.ts --bail=1`: 2 tests passed, including the real 15-second timeout.
- `npx vitest run tests/mermaid-render.test.ts --bail=1`: 8 tests passed, including six diagram types and a live HTTP positive control for the browser network test.
- `npm run smoke`: passed. The released compiler evaluates the client and server bundles; the bundled server renders `\boxed{\textbf{中文}}`, valid/invalid math and Mermaid. The Chinese box PNG was visually inspected and contains both glyphs and all four border edges.
- `HERMES_BIN=… npm run smoke:hermes`: passed with both default flags and the ES6 class flag. This evaluates registration and projection with host stubs; it is not a device UI test.
- `npm audit --omit=dev --audit-level=moderate`: passed with one existing low-severity Babel advisory in the locked dependency tree.

The first Ubuntu CI run caught identical regular/bold Chinese output with the
regular-only Noto collection. The loader now supplies the matching bold
collection as well; the existing raster comparison remains the regression gate.

The local commands above were run as targeted files, sometimes in the same
Vitest invocation. The complete plugin suite was not run locally.

## Platform scope

Host tests run on macOS arm64; CI runs the full suite and compiler smoke on
Ubuntu with Noto CJK, a Latin font, `ps`, and the real pinned browser.
Windows process termination is implemented with `taskkill /T`, but is untested.

The previous iPhone and second-Mac verification remains evidence for the
existing rendering flow. Native devices were not retested for 0.1.3. The new
inline Retry control still needs device interaction verification. Android
remains untested; Hermes evaluation does not establish native UI correctness.

The production daemon on port 6767 was not restarted or modified for this release.

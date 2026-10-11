# Code and table review — 2026-10-11

Follow-up to PR #1, based on `c34da969`. The optional code/table modules remain
off by default. No production daemon or installed plugin was changed for QA.

## Automated checks

- `tests/parser.test.ts`: 41 passing cases, including mixed-content overflow,
  exact code boundaries, Unicode, nested containers, and independent table budgets.
- `tests/table.test.ts`: 9 passing cases through the real Markdown-it and
  `react-native-markdown-display` AST pipeline. Covers formatting, escaped pipes,
  CRLF, nested containers, reference definitions, parser reuse, and TSV cell boundaries.
- Build, typecheck, lint, and formatting checks pass. Lint reports only the existing
  Biome configuration deprecation and `String.raw` informational notices.

Run the two test files individually with `npx vitest run <file> --bail=1`.
The full suite and compatibility matrix run in GitHub Actions.

## Official client check

Used the official Paseo `0.11.0-beta.3` compiler, daemon, and bundled web UI with
an isolated home, mock provider, and temporary localhost port. Chrome viewports
were 1280 × 900 and 390 × 780. Sixteen browser assertions passed:

- Tables off retains the standard layout in a formula-owned message. Switching
  it on updates that visible message; switching it off closes the table viewer.
- The reading surface has one **Open table** entry. Copy actions live in the
  shared viewer. Preview and Source work at both widths.
- The actual clipboard preserves the original links, bold text, inline code,
  math delimiters, and column alignment. TSV matches the expected plain cell text.
- Table links do not open the viewer. Horizontal wheel and touch input scroll a
  424 px table inside its 356 px viewport, without opening a viewer or overflowing
  the phone document.
- During live streaming, appending a row under the same message ID keeps the
  viewer open and updates its copied Markdown. A formula inside the table preview
  opens the formula viewer.
- No browser runtime errors were recorded.

Local reports and cropped screenshots are in the ignored `.smoke/pr1-fix-qa/`
directory of the development checkout. The temporary daemon was stopped afterward.

## Limits of this check

Phone-width browser testing does not validate native iOS/Android. Native sheet
portals require the plugin's viewer context to be provided inside the preview;
that bridge was checked against host code, without a device run. Windows was not
tested.

The fixture also tried appending to an already-ended message loaded from history.
That host history-to-live transition remounted the row and closed its viewer;
continuous live streaming passed the separate check above.

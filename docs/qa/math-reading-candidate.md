# Mathematical reading candidate evidence — 2026-09-16

Implementation commit: `a0b211066ec483f14c47f95a141b95c2f1758b51`, on local branch
`math-reading-parity` in `/Users/cyouwa/projects/paseo-advanced-markdown`, based on
v0.1.3 commit `839c81bb8b9af9bc5e8336c19fbeb2f682034aa3`.
The package version still reads 0.1.3; that is not a published candidate identity.
The temporary checkout was used for parallel implementation; the independent
plugin repository now owns the committed result.
Measured renderer SHA-256:
`73e0e6972dcb05fbf2501bfc035faf3e1f4846bdfd242c46344693da3cfb9388`.
No production daemon was targeted by these measurements.

## Fixed-corpus host comparison

`scripts/qa/math-corpus-probe.mjs` runs the real selected parser and renderer,
asserts exact formula ranges/render bodies, and records outcomes. The baseline
imports the unchanged original repository; the candidate imports the temporary
implementation checkout. Both are recorded in `docs/qa/evidence/`.

- All 43 fixtures preserve identical source ranges between versions.
- Direct metadata checks confirm the user's Delta(S) Copy TeX body retains its
  original indentation/newlines, `a&lt;b` retains the entity spelling, and the
  redundant fenced `\\[x+y\\]` body is `x+y`; the whole source remains unchanged.
  This is payload evidence, not a browser/iPhone clipboard test.
- `mathclap`, `coloneqq`, `cancel`, and `cancelto` change from local `invalid`
  failures to successful PNGs.
- The malformed TeX and unsupported physics cases remain local `invalid`
  results. The explicit missing-font case remains `unavailable`.
- Render-success fixtures still produce images. This proves conversion, not
  glyph-perfect visual output or native readability.
- Geometry changes against v0.1.3 require visual review: boxed height 28→28.5,
  bold Chinese height 17.5→18.5, and the 12-row matrix height 264.5→314 at unchanged
  width 78. Density invariance means comparing candidate densities to one
  another; it does not establish identical typesetting to the previous profile.

## Frozen 50-formula benchmark

Same machine, versions, color, logical size and 50 unique expression inputs as
the [baseline](math-reading-baseline.md). Each density is a fresh process and
runs sequentially, not concurrently. Cold includes first WASM/font setup;
warm reuses the same 50 keys. Measurements at 07:58:41–42 UTC.

```sh
node --import tsx scripts/qa/math-benchmark.mjs --density 2 \
  --root /private/tmp/paseo-math-reading-parity
```

| Metric | v0.1.3, density 2 range | Candidate 2 | Candidate 3 | Candidate 4 |
| --- | ---: | ---: | ---: | ---: |
| Cold total, ms | 205.39–211.00 | 206.68 | 219.78 | 238.69 |
| Cold formula p95, ms | 5.17–10.41 | 6.49 | 6.37 | 7.66 |
| Slowest formula, ms | 41.67–44.26 | 29.63 | 28.47 | 29.10 |
| Warm total, ms | 0.258–0.267 | 0.260 | 0.315 | 0.386 |
| PNG bytes | 181,316 | 181,340 | 289,885 | 404,948 |
| JSON bytes, excluding transport | 245,041 | 245,705 | 390,445 | 543,849 |
| Process peak RSS, MiB | 348.6–366.6 | 393.1 | 391.7 | 397.9 |
| Cached entries / failures | 50 / 0 | 50 / 0 | 50 / 0 | 50 / 0 |

All measured host budgets pass: density 2 cold≤500 ms, p95≤25 ms, max≤100 ms,
warm≤10 ms, PNG≤209,000 bytes, JSON≤282,000 bytes and RSS≤512 MiB. Higher-density
runs pass the provisional cold≤2 s / RSS≤768 MiB ceilings. At density 4, payload
is about 2.22× density 2: improved detail is not free. A single candidate run per
density is a regression check, not a claim of a statistically meaningful speedup.

Evidence: `math-reading-candidate-density-{2,3,4}.json` and
`math-reading-candidate-corpus.json`. These measurements exclude daemon RPC,
browser paint/scrolling, screen orientation, clipboard and native interaction.
Host renderer-cache reuse is not proof of client request deduplication.

## Task evidence ledger

This ledger records this QA work's evidence. It is not an instruction to check
off tasks whose actual-client clauses remain unexecuted. Update the browser and
device rows only after recording the relevant build and actual source.

| Task | Available evidence | Still required / status |
| --- | --- | --- |
| 1.1 | 43 fixed fixtures, exact-source/body assertions, baseline/candidate parser→PNG outcomes, error/host-gap classifications | Complete for corpus/source evidence |
| 1.2 | Baseline matrix explicitly lists unobserved reference clients | Controlled official web/native/reference captures not performed here |
| 1.3 | Three v0.1.3 host runs, frozen budgets, candidate density 2/3/4 comparison | Interaction/paint/RPC baseline still unmeasured |
| 2.1 | Relevant density/layout/settings regression test files exist | Aggregate their actual RED/GREEN execution evidence in release review |
| 2.2 | Candidate density 2/3/4 produces successful fixed-workload outputs | Boundary/additive compatibility/budget tests recorded separately |
| 2.3 | Host warm outputs remain cached | Client coalescing/stale/upgrade/width-only behavior requires its tests and UI evidence |
| 2.4 | Nested list/quote/table and oversized inline corpus sources are fixed | Official web/iPhone structure, fitting and interaction QA pending |
| 2.5 | Wide polynomial, tall matrix, Chinese labels are available | Inspector fit/reset/zoom/scroll/orientation QA pending |
| 2.6 | Setting tests and source are separate implementation work | Mounted update, failed save, persistence and two-host/two-client UI QA pending |
| 3.1 | Original source ranges are unchanged | Exact Copy TeX/body and actual clipboard checks recorded separately; iPhone pending |
| 3.2 | Four reviewed profile cases become successful; matrix/cases/aligned remain successful | Profile isolation/attribute tests recorded separately |
| 3.3 | CJK/bold/boxed still render; missing font and invalid TeX remain recoverable/local | Review changed image geometry; external-resource rejection is tested separately |
| 3.4 | 40-case isolated MathJax 4 experiment, hashes, SVG counts/bytes/timing/font observations | Complete experiment; explicit defer decision, no production upgrade |
| 4.1 | Fixed closed-plus-incomplete/incomplete-only parser cases | Actual stream timing and density-upgrade layout trace pending |
| 4.2 | Missing-font fault probe stays unavailable without losing source | Client disconnect/retry/modal/accessibility/memory cleanup QA pending |
| 4.3 | Executed official host splitter + fallthrough reproductions; capability gap table | Complete source/API reproduction report; native semantic interaction remains unobserved |
| 5.1 | Same-corpus host comparison passes; density budgets pass | Full platform/theme/size/inspector/stream matrix pending; Android unverified |
| 5.2 | Typecheck passed during integration; corpus test file passed 44 checks | Root integration owns final build/lint/format/affected tests/compiler/Hermes evidence |
| 5.3 | Fixed local Git SHA installed, rolled back to v0.1.3, then reinstalled on 6790 | Cached-client/reconnect compatibility still needs explicit validation |
| 5.4 | Candidate/baseline/gap/experiment documents separate actual evidence and unobserved rows | Root release review owns final tag/install command; not released or deployed here |

The subsequent [formula toolbar hover check](formula-toolbar-hover.md) records
the desktop reveal behavior and touch/keyboard fallback added to this candidate.

## Official browser execution

The official 0.8.0 web UI on isolated daemon `127.0.0.1:6790` loaded the candidate
from its local directory. Chrome ran at device scale factor 2 on macOS; these are
browser viewport tests, not iPhone device tests. The script
`scripts/qa/math-reading-web.mjs` restores host settings in its finally block.

- Widths 360/390/430/1280: nine images rendered, no document overflow or console
  errors. Long inline math in emphasis, lists, and narrow table cells retains its
  source position; the cell's image scrolls without widening the page. Ordinary
  Markdown links retain their literal/math-exclusion behavior.
- Changing only mathScale to 200% updates mounted inline images. Prose, code,
  source, and Mermaid keep their sizes. Returning to the saved settings succeeds;
  a stale settings revision returns conflict.
- Enter on the inline formula entry opens the inspector. Copy TeX yields exactly
  `E=mc^2`, Copy source yields `$E=mc^2$`. Source viewing and the explicit Close
  formula button work; reopening starts at Fit.
- A wide formula fits to 374px on a 390px viewport. Reading size restores 595px
  inside its scroll area. Manual scale remains unchanged when resizing to 430px;
  switching back to Fit recomputes its bounds. A tall 12-row matrix fits the
  available height; 3× enlarges it inside the scroll area without page overflow.
- A separate dark-theme 390px capture verified the original Chinese formula and
  its complete fit-to-window view. The new profile's full matrix and mathclap ink
  were visually inspected; no missing rows/leftmost characters were observed.

Evidence: [report](evidence/math-reading-web.json),
[nested layout](evidence/math-reading-nested-390.png),
[fit](evidence/math-reading-wide-fit.png),
[reading size](evidence/math-reading-wide-reading.png),
[tall fit](evidence/math-reading-tall-fit.png).

During QA the host's compact modal did not dismiss with Escape. The plugin now
provides an explicit keyboard/touch Close formula control and protects a newly
opened selection from an old modal's delayed close callback. The host title-bar
close action remains available. Width-adaptive screenshots do not establish
native text baseline, touch scrolling, pinch behavior, or OS text scaling.

## Integration checks

Build, both TypeScript projects, Biome lint/format, targeted math/parser/settings
and layout tests passed. The published official 0.8.0 compiler smoke loaded both
bundles and exercised projection/RPC paths. Hermes evaluated registration,
projection and cleanup with default and ES6-class flags; this is engine loading,
not native UI evidence. Twelve real Mermaid render/lifecycle tests passed,
including timeout, crash, missing runtime, stop cleanup and network isolation.
All 65 observed worker/browser descendants had exited after the tests.

New native iPhone/Electron captures, all presets on two real clients, disconnected
inspection/recovery, stream paint timing and repeated-inspection memory remain
pending. Android and ChatGPT/Codex reference-client captures are unobserved.
The fixed 50-formula host benchmark is not an interaction benchmark. Production
6767 and its plugin registrations were not changed.

## Fixed-ref installation and rollback

The official CLI installed implementation SHA `a0b211066ec483f14c47f95a141b95c2f1758b51`
through `plugin add file:///Users/cyouwa/projects/paseo-advanced-markdown --ref <sha>`
on host `127.0.0.1:6790`. The managed checkout completed preparation and reported
`source: git`, `status: running`, and the matching commit. The actual plugin RPC
rendered `\cancel{x}` with `ok: true`, `density: 4`.

The same host was rolled back to commit `839c81bb8b9af9bc5e8336c19fbeb2f682034aa3`
(v0.1.3). It ran successfully and again returned `invalid` for the unsupported
`\cancel` command. The fixed candidate was then reinstalled from the persistent
local plugin repository. This exercises local Git distribution, not GitHub release
availability or the CI pipeline. The host is left on the candidate for local QA.

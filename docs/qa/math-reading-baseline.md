# Mathematical reading baseline — 2026-09-16

Baseline: v0.1.3, commit `839c81bb8b9af9bc5e8336c19fbeb2f682034aa3`.
Measurements import the unchanged original repository at
`/Users/cyouwa/projects/paseo-advanced-markdown`, not the implementation checkout.
The renderer SHA-256 is `ca42ae086d10baf2bf1b60b50be886a56f6f403cd5b139bd8bd0a5361afaf812`.

## Fixed sources

[`math-reading-v1`](../../tests/fixtures/math-reading.ts) contains 43 named
assistant-source fixtures. Each has exact expected formula ranges, render-body
expectations, and a render/source/error/new-profile/host-gap classification.
The user's Chinese Delta(S) text is preserved including indentation and comma.
The parser can normalize the rendering body; its copied source range must not
change. The 44 checks in `tests/math-corpus.test.ts` pass on 2026-09-16. The
independent corpus probe also asserts all exact ranges and render bodies while
importing the original v0.1.3 parser. These are source checks, not visual acceptance.
The separate parser-to-PNG probe records baseline outcomes in
`docs/qa/evidence/math-reading-v013-corpus.json`: the four new-profile fixtures
fail as invalid on v0.1.3, the intentional malformed/unsupported cases fail
locally, and an explicit nonexistent-font override yields `unavailable`.

The [fixed transcript](samples/math-reading-50.md) uses 50 unique expressions (10 shapes × 5 indexed
variants), including fractions, integrals, matrices, aligned derivations, and CJK.
Transcript SHA-256:
`00c0accf4efb7a95419b9ef66826da4c5c6c7cf6237cc7cd2b495ee741a6f45c`.
Do not replace the corpus with independently generated model responses when
comparing clients. Verify the emitted assistant source first.
The transcript digest includes the fixture's original inline/display flag; this
metadata correction does not alter the 50 renderer inputs or measured timings.

## Host measurements frozen before implementation

Three fresh Node processes, 2026-09-16 07:49–07:50 UTC. Apple M4, 16 GiB RAM,
macOS Darwin 25.6.0 arm64, Node 24.15.0, MathJax 3.2.2, resvg-wasm 2.6.2.
Logical em/text size 16 px, formula multiplier 100%, density 2, color `#dedede`.
No browser viewport, browser theme state, daemon transport, or iPhone is involved.
The cold batch includes first WASM and CJK font initialization. The warm batch
reuses all 50 keys in the same process.

```sh
node --import tsx scripts/qa/math-benchmark.mjs \
  --root /Users/cyouwa/projects/paseo-advanced-markdown \
  --out /private/tmp/math-reading-v013-baseline.json
```

| Metric | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| Cold total, ms | 205.71 | 211.00 | 205.39 |
| Cold formula p95, ms | 5.17 | 10.41 | 7.66 |
| Cold slowest formula, ms | 41.67 | 42.12 | 44.26 |
| Warm total, ms | 0.258 | 0.263 | 0.267 |
| PNG bytes, 50 outputs | 181,316 | 181,316 | 181,316 |
| JSON result bytes, excluding RPC envelope | 245,041 | 245,041 | 245,041 |
| Largest PNG, bytes | 7,205 | 7,205 | 7,205 |
| Cached entries | 50 | 50 | 50 |
| Process peak RSS, MiB | 355.2 | 366.6 | 348.6 |
| Render failures | 0 | 0 | 0 |

JSON evidence is retained in `docs/qa/evidence/math-reading-v013-run-{1,2,3}.json`.
RSS includes V8, module loading, WASM and fonts; it is not the cache size.
Point samples can miss brief peaks, so the process maximum is also recorded.
Warm results still account for serialization and output bytes: a renderer-cache
hit does not itself prove that the client avoids a duplicate RPC.

## Candidate budgets

Frozen on 2026-09-16 before the implementation renderer is measured:

| Scope | Acceptance budget | Reason |
| --- | --- | --- |
| Density 2 cold batch | ≤500 ms; p95 ≤25 ms; max ≤100 ms | About 2× the slowest baseline, with initialization/GC margin |
| Density 2 warm batch | ≤10 ms; zero render failures | Allows timing noise while requiring a cached result path |
| Density 2 total payload | ≤282,000 JSON bytes and ≤209,000 PNG bytes | About 15% headroom for additive metadata; no unrequested density increase |
| Density 2 process peak RSS | ≤512 MiB for this isolated script | 40% headroom over the highest baseline; includes font/WASM startup |
| Higher-density batch | Report separately at density 3/4; target ≤2 s cold, ≤768 MiB process peak | Provisional engineering ceiling, not a measured high-density baseline |
| Each image/cache | 4096 px edge, 8,000,000 pixels, 2,000,000 base64 chars; existing 8 MiB/128-entry cache limits | Existing memory/payload contract, independent of preferred display size |
| Density upgrade geometry | Identical logical width, height, baseline | A sharper image must not move text |
| Width-only resize within density bucket | Zero additional render requests | Container fit is client geometry, not host typesetting |
| Repeated identical in-flight request | One shared request per host/key | Prevent duplicate work during mounting |

UI interaction budgets are explicit **targets pending baseline capture**: update
local fitting on the next layout/render cycle, no viewport jump on density
upgrade, retain the old image while sharper detail loads, and no retained active
inspector after repeated close/open cycles. Do not report these as measured or
mark the full interaction portion of task 1.3 complete until instrumented web and
native traces exist. Network latency and browser paint cannot be inferred from
the direct host numbers above.

## Versioned comparison matrix

| Client | Exact-source corpus verified | Current capture evidence | Status |
| --- | --- | --- | --- |
| Original v0.1.3 direct parser/host on macOS | Yes, local fixtures | Source tests + benchmark JSON | Observed for parser/host only |
| Official Paseo 0.8.0 browser web | Not yet for this corpus | Older release captures do not establish this baseline | Not observed |
| Official Paseo Electron | Not yet for this corpus | None in this baseline | Not observed |
| Official Paseo iPhone | Not yet for this corpus/build | Prior user QA predates this design | Not observed |
| ChatGPT web | Not yet | Static bundle research is not an emitted-source visual comparison | Not observed |
| ChatGPT iPhone | Not yet | No current device/build capture | Not observed |
| Codex macOS | Not yet | Installed bundle inspection is not visual corpus evidence | Not observed |
| Android | Not yet | No device/emulator capture | Unverified |

For each future capture record client build, OS, viewport, theme, text size,
formula-size setting, density, streaming/historical state, and actual assistant
source. Missing glyphs, changed mathematical meaning, clipping, source-copy
errors and inaccessible controls fail individually; they cannot be averaged away.

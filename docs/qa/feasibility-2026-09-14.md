# Minimal loop feasibility report (2026-09-14)

Scope: math + Mermaid in one assistant item on official Paseo 0.8.0, rendered on
the host, displayed by the official web client. Environment:
[environment.md](environment.md). Evidence: [official web QA log](2026-09-14-official-web-0.8.0.md),
`.smoke/report.json` (smoke), `.smoke/rpc-probe*.json` (real daemon RPC probe).

## Verdict

Both renderers work on the official daemon and the official browser web client
without any change to Paseo. Continue to the full feature set. No Paseo patch
was needed or made.

## Install footprint (macOS arm64 host)

| Item | Size | Notes |
| --- | --- | --- |
| Plugin checkout `node_modules` (build + math) | see `du -sh node_modules` on the host; math needs only `mathjax-full`, `@resvg/resvg-wasm`, `markdown-it`, `react-native-markdown-display` at runtime | bundled into the daemon-side bundle by Paseo's compiler |
| Mermaid worker runtime (`~/.cache/paseo-advanced-markdown/worker/<key>`) | 462 MiB | pinned `@mermaid-js/mermaid-cli@11.17.0` + `puppeteer@25.11.0` and their dependencies, `npm ci --omit=dev` |
| Chrome headless shell 153.0.8010.36 (`…/browsers`) | 208 MiB on disk, 94 MiB download | Chrome for Testing, installed through `@puppeteer/browsers` into the plugin cache, not `~/.cache/puppeteer` |
| Preparation time | 23 s total on a warm npm cache and ~10 MB/s download | `npm run prepare-browser`; a second run is a no-op |

Math needs no browser and no download beyond npm packages.

## Latency (real daemon RPC, `scripts/qa/rpc-probe.mjs`)

| Case | Cold | Warm (cache hit) |
| --- | --- | --- |
| Math display formula | 32 ms | 1 ms |
| Math new inline formula | 5 ms | — |
| Mermaid small flowchart (dark) | 613–818 ms (browser launch per task) | 1 ms |
| Mermaid 60-node flowchart | 1.2 s | — |
| Mermaid 150-node flowchart | 1.8 s | — |
| Mermaid 400-node flowchart | 6.2 s (two passes: 2x, then fitted scale) | — |
| Ten different diagrams at once | 9 rendered serially at ~330 ms each (max 3.1 s), the 10th refused as `busy` | — |
| Invalid TeX / invalid Mermaid | 2 ms / ~300 ms, `invalid` with a short cause | cached |

Each Mermaid task launches its own Chrome headless shell through the pinned CLI
(no shared browser yet). Warm-path latency is dominated by launch (~300 ms). A
long-lived browser is a later optimization, not needed for the loop.

## Image and RPC limits (verified through the daemon)

| Limit | Value | Evidence |
| --- | --- | --- |
| Math expression | 4096 chars | 4097 chars → `too-large` |
| Mermaid definition | 32 KiB | larger → `too-large` before spawning |
| PNG payload | 2,000,000 base64 chars per response | 400-node diagram = 392 K chars (287 KiB) passed through `plugin.rpc.invoke` |
| Raster budget | 8 M pixels and 4096 px longest edge | tall diagrams are re-rendered once at a fitted scale (0.5–2); 60 nodes → 788×6206 logical at 0.66x |
| Refusal | below 0.5x → `too-large` | unit test |
| Queue | 1 running + 8 waiting per plugin process, 15 s per task | probe burst; fault-injection tests (hung CLI killed at 15 s, temp dir removed) |
| Caches | 128 entries / 8 MiB on each side | unit tests |
| Input validation | Zod on both sides | `theme: "neon"` rejected by the daemon; unknown method rejected |

## Browser and process reclamation

- After renders, no `chrome-headless-shell` or `mermaid-cli` processes remain
  (checked with `pgrep` after the probe and after `paseo plugin reload`).
- Every task uses its own temp directory under `os.tmpdir()`; none remain.
- `paseo plugin reload` replaced the plugin subprocess (pid 88635 → 89579) and
  the plugin re-registered once; the web UI kept rendering afterwards.

## Platforms exercised

| Platform | State |
| --- | --- |
| Official daemon 0.8.0 (npm CLI) on macOS arm64 | verified |
| Official browser web UI 0.8.0 (bundled, Chrome 152 headless) | verified: dark, light, 1280 and 390 px |
| Hermes (RN 0.81 runtime, bundle evaluation only) | verified with and without `-Xes6-class` |
| Official Electron desktop 0.8.0 | not run: it would manage the production daemon on port 6767 |
| Official iOS / Android apps | not run: no simulator or emulator on this host |

## Decisions carried forward

- Keep the pinned CLI-per-task design for the first release; measure a shared
  browser later only if warm latency matters.
- Keep 2x rendering with fitted fallback; ship the 16384 logical size cap in the
  RPC contract (raster stays ≤ 4096 px edge).
- Client and daemon both treat `busy`, `timeout`, `unavailable`, and `failed`
  as retryable and never cache them.

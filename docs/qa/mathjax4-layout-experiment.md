# MathJax 4 width-aware layout experiment

Decision, 2026-09-16: **defer the production engine upgrade**. Width-aware display
breaking is feasible without changing the input TeX, but the current image
contract, font/sanitizer policy, layout cache identity and device QA require a
separate migration. The current release keeps MathJax 3 and uses adaptive fit,
reading-size scrolling and inspection.

## Reproduction

The experiment installs fixed `@mathjax/src@4.0.0` and its
`@mathjax/mathjax-newcm-font@4.0.0` dependency in a separate temporary npm root.
No production plugin dependency, process or configuration changes.

```sh
npm install --prefix /private/tmp/paseo-mathjax4-probe \
  --ignore-scripts --no-audit --no-fund @mathjax/src@4.0.0
node --import tsx scripts/qa/mathjax4-probe.mjs \
  --runtime /private/tmp/paseo-mathjax4-probe
```

Five existing corpus expressions × two container widths (320/800 logical px) ×
four modes (display overflow, display linebreak, inline breaking, inline single
SVG) = 40 cases. Logical em 16, ex 8, default NewCM font, font cache disabled,
TeX base/ams packages, Node 24.15.0 on Apple M4/macOS. Each case makes a fresh
TeX document. Timings include construction and conversion, but exclude imports,
PNG rasterization, fonts loaded by resvg, IPC and browser paint.

The input expressions come directly from the versioned fixtures; SHA-256 hashes
and unchanged-input assertions are in
[`mathjax4-layout.json`](evidence/mathjax4-layout.json). No discretionary breaks
or source rewrites are inserted by our code.

## Observed at width 320

| Expression / mode | Top-level SVGs | Serialized bytes | Construction + conversion, ms |
| --- | ---: | ---: | ---: |
| Long polynomial, display overflow | 1 | 86,397 | 22.68 |
| Long polynomial, display linebreak | 1 | 86,719 | 16.62 |
| Long polynomial, inline breaking | 24 | 100,093 | 16.44 |
| Long polynomial, inline single | 1 | 86,382 | 14.24 |
| User Delta(S), display overflow | 1 | 34,799 | 16.28 |
| User Delta(S), display linebreak | 1 | 35,022 | 12.29 |
| User Delta(S), inline breaking | 4 | 36,527 | 13.16 |
| Long fraction/product, display linebreak | 1 | 25,709 | 11.09 |
| Long fraction/product, inline breaking | 3 | 26,360 | 12.20 |

These are one-run feasibility timings, not a benchmark establishing an engine
speedup. Output bytes are serialized SVG/HTML, not the PNG/RPC bytes reported by
the v0.1.3 benchmark.

The long polynomial display viewBox changes from width/height
`85394.3 / 1057.3` to `17956.9 / 7833.3` at width 320, and
`42718 / 2483.4` at width 800. This demonstrates real layout reflow with a
single top-level SVG. Short aligned/matrix cases retain their geometry.

Chinese Delta(S) has one top-level display SVG containing four additional
nested SVGs and three text nodes. Counting every descendant SVG as a separate
formula would be incorrect. Host text fonts are still needed; upgrading MathJax
does not remove the CJK font problem. This experiment does not certify the new
markup against the production sanitizer or verify the final CJK pixels.

## Why defer

1. Inline breaking intentionally returns several independent SVGs for browser
   line layout. Taking only the first would discard terms. A single-image
   backend must disable inline breaking or implement a new multi-part contract.
2. Width-aware display layout changes image height and glyph placement. Width
   would become a host cache/request input; current local fitting and density
   changes deliberately preserve logical geometry.
3. NewCM differs from the MathJax 3 TeX font. Baselines, CJK composition, sanitizer
   attributes, raster bounds and package behavior need a complete migration
   corpus and actual web/iPhone comparison.
4. Source immutability and SVG production are observed. Successful semantic
   preservation, clipping, final PNG appearance, phone interactions and
   accessibility are not visually verified by this script.

The [official line-breaking documentation](https://docs.mathjax.org/en/v4.0/output/linebreaks.html)
describes the separate display/inline paths and recommends disabling inline
breaking for Node applications that need a single SVG. Our experiment confirms
that boundary on the selected corpus; it is not an implementation commitment.

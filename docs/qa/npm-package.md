# npm package validation — 2026-09-22

The `paseo-advanced-markdown@0.2.1` tarball passes isolated installation, official
Paseo compilation, rendering, and community source-budget checks. This record
does not establish npm registry publication or paseo.cafe admission.

## Artifact

- Command: `npm run pack`.
- Output: `.smoke/npm/paseo-advanced-markdown-0.2.1.tgz`.
- Archive: 1,712,991 bytes; unpacked: 4,821,929 bytes; 69 files.
- SHA256: `9c655b8c1f78e857407d2672b336ec2102ff8a7dd27b19b897d387406430564b`.
- SHA512 integrity: `sha512-OD5TuYvmXEpH0z3ep7bHCcW/0p3HfZjmPF6J62zKqWPYwdLpYHRVKH6SvKOeysjQJkAEQrsigMmw/cBzbcNoIg==`.

The npm manifest prepares formula assets and the browser worker; it does not
install development dependencies or build source. Git keeps its source-install
commands. MathJax 3.2.2's existing TeX/SVG profile is precompiled with its license.
Unused speech/XML dependencies are excluded because package dependency overrides
do not control the consuming application, and tarball installs did not honor
the shrinkwrap used in an earlier candidate. The final production graph requires
no override.

The exact resvg binary (2,478,606 bytes) and 24 static MathJax SVG font modules
(1,059,652 bytes of JSON) are independent data files. Preparation verifies their
SHA256 and size before copying them into the content-addressed asset cache.
Runtime reads verify them again. No executable source is encoded as a data file.
Old asset hashes remain available for running versions and rollback.

## Verification

On macOS arm64, Node 24.15.0 and npm 11.12.1:

| Check | Result |
| --- | --- |
| Build, typecheck, lint, formatting, diff whitespace | Passed; two pre-existing lint informational messages |
| Generated binary/font fidelity | 2 tests passed |
| Cache preparation, corruption repair, relocation, real PNG | 5 tests passed |
| Absolute/default cache path behavior, including Windows path syntax | 17 tests passed |
| Complete source budget guard | 6 tests passed |
| Math renderer regressions | 12 tests passed |
| Mermaid worker lifecycle and failure isolation | 4 tests passed |
| Font-data extraction comparison | 26 SVG outputs byte-identical across 13 expressions in inline/display modes |
| Clean tarball installation | Passed outside the checkout, lifecycle scripts disabled, production dependencies only |
| Consumer production dependency audit | 0 vulnerabilities |
| Official Paseo 0.8.0 compiler and compiled RPCs | Passed after moving the prepared installation |
| Official Paseo 0.9.0-beta.2 compiler and compiled RPCs | Passed after moving the prepared installation |

Both runtime checks verified the exact tarball SHA512, compiled client/server
entries, checked the reported plugin version, rendered formula PNGs including
mathtools/cancel/bold Chinese, and rendered a real Mermaid PNG. Their reports are
`.smoke/npm/smoke-0.8.0.json` and `.smoke/npm/smoke-0.9.0-beta.2.json`.
The preparation used the isolated `.smoke/npm/cache`; production plugin settings,
worker cache and daemon were not reloaded or changed.

The CI workflow includes package installation/render checks alongside the full
suite and Git source-install smoke. Local checks do not establish a remote CI
result or iPhone/Android UI acceptance. Windows path unit tests do not establish
Windows installation support.

## Community scanner and complete source budget

The unmodified paseo.cafe scanner at commit
`7cf30f35182d25c88f231c5c53acfb8016188971` passed on a separate OS temporary
extraction of this exact tarball: 43 source files, 807,234 bytes, no blocking or
advisory findings. Running outside this checkout avoids ancestor TypeScript
configuration affecting resolution. The scanner source SHA256 is
`6484c8984369b380b7c4d21b0443ec9d5fd2929e57be1244c67cf3e5ea5ac447`;
upstream main at `28c3521db46be74198ddfe5b5a4944ea1af60a76` has the same scanner.
See `.smoke/npm/scanner-report.json` for the archive hash, command, and findings.

Its import parser can omit children of the minified renderer. A separate package
guard therefore counts every shipped JS/TS source under the runtime and script
directories plus root entries, including generated modules and declaration files:

| Complete inventory | Result | Limit |
| --- | --- | --- |
| Source files | 55 | 200 |
| Total source bytes | 1,135,725 | 2,000,000 |
| Largest source, `server/math/render.js` | 660,429 | 2,000,000 |

The source budget is satisfied independently of import traversal. WASM and font
JSON are binary/data assets carried in the package. No scanner finding is
suppressed. Remote registry metadata checks and catalog review remain separate.

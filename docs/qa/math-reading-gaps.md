# Remaining mathematical reading gaps

Observed 2026-09-16 with official Paseo 0.8.0 source commit
`b8e24677e12b226c7c38c1c3a40649daa9f1152f` and plugin v0.1.3 source.
These are reproducible source/API boundaries, not claims of visual QA on iPhone.

```sh
node --import tsx scripts/qa/math-host-gaps.mjs \
  --paseo-source /Users/cyouwa/projects/paseo-advanced-markdown/.paseo-source
```

## Source boundaries

| Gap | Minimal source/reproduction | Observed behavior | Plugin scope / possible host capability |
| --- | --- | --- | --- |
| Bare display math containing blank lines | `$$\na^2\n\n+b^2=c^2\n$$` | `splitMarkdownBlocks` returns `["$$\na^2", "+b^2=c^2\n$$"]`; the formula never reaches the plugin as one item | Do not stitch neighboring items. A host block-delimiter/parser extension could preserve the range. A closed `math` fence already preserves the blank line. |
| Host-owned image in same item | `Formula $x$ ![plot](https://example.org/plot.png)` | Detector sees math and `unsupported:true`; transformer returns no replacement | Whole item remains host-owned. A public host Markdown/image component or token-level extension could avoid choosing between image and math. |
| File navigation link in same item | `Formula $x$ [file](src/main.ts)` | Same fallthrough as image; ordinary HTTPS links remain supported | Preserve host file-opening semantics. A public navigation/link renderer contract is required before taking over this case. |
| Whole-reply copy / numbering across items | `First $x$.\n\nSecond $y$.` | Host makes two source items. Each plugin renderer receives only its item's `text`; its copy action cannot promise the complete reply | Keep copy labelled by item scope. A host-owned reply-copy hook/full-reply source capability is needed; do not infer boundaries by agent IDs or visual adjacency. |
| Native semantic selection | A rendered `x^2` PNG, surrounded by text | Images carry source accessibility labels; neither selectable glyph text nor a semantic math tree is present | Source copy and inspection are feasible. Semantic speech/navigation, mixed-selection math extraction and rich Word-equation paste require a different host/client accessibility/selection contract. |

The first four rows were verified by executing the official splitter and plugin
detector; the selection row follows from the shipped Image/source-label API and
is not a device screen-reader test. `client/message.tsx` copies its `text` prop;
`index.client.tsx` passes exactly `item.text`, without neighboring source items.

## Plugin-owned improvements and retained limits

- Density changes must preserve logical dimensions and the original copied source.
- Ordinary HTTPS/mail links remain inside supported plugin items. File, custom
  protocol, relative and image behavior must continue to fall through to the host.
- No source stitching or private/unsupported host SDK imports are introduced by
  these evidence helpers. They import the official splitter only in a local QA
  script, not a deployed client/server bundle.
- Unsupported TeX (`\\pdv`, chemistry, arbitrary packages) is a local formula
  error, not evidence of a Markdown-parser failure. This phase adds only reviewed
  mathtools/cancel coverage.
- CJK requires a host font with complete glyph coverage. Source preservation is
  tested without fonts; successful image output must additionally pass the real
  font/render tests. Missing or incomplete fonts must stay recoverable.

## Unobserved evidence

Current-design native iPhone behavior, VoiceOver interactions, Android, actual
whole-reply clipboard behavior of reference apps, and the fixed corpus in
ChatGPT/Codex are not observed. The [baseline matrix](math-reading-baseline.md)
owns those statuses. An unchanged public API limitation is not a reason to mark
device execution complete.

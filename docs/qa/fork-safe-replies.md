# Fork-safe replies on official Paseo 0.16.0

Plugin: branch `feat/fork-safe-replies` at the commit that adds this file, built with
`npm run build` and installed as a directory plugin. Host: official `@getpaseo/cli@0.16.0`
from npm with its bundled web UI, on the isolated harness described in
[environment.md](environment.md#official-0160-daemon-and-web-ui-isolated). No host patch.

Better Paseo 1.6.0 was installed next to the plugin from a copy of the production
checkout (commit `c85f2412` plus the user's local `server/tasks-chunk.ts` edit), because
both plugins together are the configuration the user runs. Its reply toggle decides
whether Paseo's Fork can appear at all, so the record below names its state per check.

## Fixture

A scratch git repository (`README.md`, `notes.txt`) as the workspace. Three sessions:

- **Claude** (`claude/claude-opus-5-5`, mode `bypassPermissions`), three turns:
  1. `ls` → quadratic-formula derivation ending in display math. No plain reply before
     the tool call — the reply opens after the tool.
  2. a dictated 101-character unique plain reply → `cat notes.txt` → distance-formula
     derivation ending in display math.
  3. the dictated 19-character reply "Checking the files." → `ls` → the same reply
     again → `cat README.md` → Pythagorean theorem as display math.
- **Codex** (`codex/gpt-6-astra`, mode `auto`), one turn: a short plain reply → `ls` →
  quadratic-formula derivation ending in display math.
- **Fork verification** (Claude): one short prompt sent in the draft that Fork in a new
  tab created, asking only for the last display-math formula in the attached history.

Captures: real headless Google Chrome 157 at 1100×900 and 390×844, dark scheme, app
language pinned to English through `@paseo:app-settings`, driven by
[`scripts/qa/reply-actions-web.mjs`](../../scripts/qa/reply-actions-web.mjs) (a sibling
of `web-capture.mjs` that can press Show original, the composer pill, Paseo's Fork menu,
toggle a settings switch, reload, and mark plugin images across a re-registration).
Per-step facts for every run are in [evidence/fork-safe-runs/](evidence/fork-safe-runs/).

On 0.16.0 the app's default chat display is **Collapse turns**. Runs that pin the
language write the app-settings blob, which resets chat display to **Full**; the
Collapse-turns runs set `chatDisplay: "collapseTurns"` explicitly. Each result below
names the view it ran in.

## Results

Counts are `aria-label` matches recorded by the helper; "Fork" is Paseo's
"Fork chat from here" trigger.

| Check | Result | Evidence |
| --- | --- | --- |
| Footer only under final replies of completed formula turns | Pass, both widths. Claude: 3 footers for 3 turns; Codex: 1. Commentary rows, user rows and tool rows show none. Before any Show original the host shows 0 Fork triggers anywhere (the #9256 gap this feature works around). | [1100](evidence/fork-safe-footer-full-1100.png), [390](evidence/fork-safe-show-original-390.png), runs `off-claude-1100`, `m-claude`, `off-codex-1100` |
| Show original → Paseo's footer | Pass, both widths, both providers. The turn re-renders as TeX source and Paseo's own footer (Copy, Fork ▾, "Worked for 9s") appears under the answer: Fork count 0 → 1. | [1100](evidence/fork-safe-show-original-fork-menu-1100.png), [codex](evidence/fork-safe-codex-show-1100.png), [390](evidence/fork-safe-show-original-390.png) |
| Fork in a new tab carries history through the final answer | Pass. On 0.16.0, Fork in a new tab opens a draft agent tab carrying a "Chat history" attachment. Sending one prompt that asks only for the last display-math formula in the attached history returned the distance formula — the final answer of the forked turn, not the earlier quadratic one a pre-answer cut would have produced. | [menu](evidence/fork-safe-show-original-fork-menu-1100.png), [draft](evidence/fork-safe-fork-draft-1100.png), [reply](evidence/fork-safe-fork-reply-1100.png), [390 menu](evidence/fork-safe-fork-menu-390.png) |
| Pill restores | Pass, both widths. "Original view · 1 turn" appears above the composer (icon Sigma, accessible name "Restore formula rendering"); pressing it restores plugin rendering and removes the pill. | [1100](evidence/fork-safe-pill-restored-1100.png), runs `off-claude-1100`, `m-collapse`, `m-codex` |
| Reload restores | Pass, both widths. After Show original, reloading the page brings back plugin rendering: no pill, no TeX literals, 3 footers, 0 Fork. | [1100](evidence/fork-safe-reloaded-1100.png), runs `off-claude-reload`, `m-claude` |
| Mid-history hand-back keeps the reply in view | Pass. Pressing Show original on the middle Claude turn (and restoring it) keeps that turn's final reply in the viewport: measured element tops 129/148 px at 1100, partially visible at the top edge at 390. | runs `off-claude-1100` (`inview` steps), `m-claude` |
| No image re-render on transformer re-registration | Pass. All 39 Claude formula images were tagged in the DOM; after Show original on one turn the other turns' 21 images kept their tags (same nodes, no re-mount, no RPC re-render). After restore the handed-back turn re-draws its own 18 images; the other 21 still carry tags. | runs `off-claude-1100`, `bp-on-1100` (`mark`/`marks` steps) |
| Whole-turn Copy with a co-owned commentary | Pass. Copy turn on the Codex turn put 536 characters on the clipboard: the co-owned plain reply, a blank line, then the final reply's full source. | run `off-codex-1100` (`copy` step) |
| Full and Collapse turns views | Pass. The Full-view results are the rows above. Under Collapse turns a co-owned formula turn folds behind the host's "View turn details" with its answer visible and its plugin footer under the answer; 0 Fork folded and expanded. Show original keeps it folded: "View turn details" remains, the answer becomes TeX, and Paseo's footer sits under it (Fork 0 → 1). Restore via pill works folded. | [folded](evidence/fork-safe-collapse-folded-1100.png), [expanded](evidence/fork-safe-collapse-expanded-1100.png), [Show original folded](evidence/fork-safe-collapse-show-1100.png), [390](evidence/fork-safe-collapse-show-390.png), runs `collapse-flow`, `m-collapse` |
| Daemon restart, reloaded Claude chat | Partial — see below. Co-ownership held for every turn after a real daemon stop/start: 3 plugin footers, 0 Fork, no warning, both widths. | [1100](evidence/fork-safe-restart-claude-1100.png), runs `restart-1100`, `m-restart` |
| First-use toast | Pass. The first Show original of a page shows "Paseo now draws this turn. If its Fork does not appear, another plugin is drawing replies. In Better Paseo, turn off Plugin markdown for replies." | [toast](evidence/fork-safe-better-paseo-on-toast-1100.png) |
| No horizontal overflow, no console errors | Pass. `scrollWidth == clientWidth` at both widths in every run; 0 console or page errors in every recorded run. | every run JSON |

## Better Paseo

Checks that ran with "Plugin markdown for replies" **on** (the default): the first-use
toast run — footers, Show original, pill, restore and the image-mark check all behaved
the same, but after Show original the reply is drawn by Better Paseo (its own footer:
Copy, model, time, duration — no Fork), so Paseo's Fork count stayed 0. That is the
situation the toast names, and why the toggle must be off for the Fork checks.
Evidence: [toast + Better Paseo footer](evidence/fork-safe-better-paseo-on-toast-1100.png),
run `bp-on-1100`.

Every other result in the table ran with the toggle **off**
([settings screenshot](evidence/fork-safe-better-paseo-toggle-off-1100.png)) and Better
Paseo still installed and enabled with its other settings untouched. The setting is
host-scoped, so one change covered all later sessions.

## The restart warning did not trigger

The plan expected the short repeated "Checking the files." turn to show the footer
warning after a daemon restart, on the premise that a reloaded Claude chat loses
per-message ids and short or repeated text cannot be claimed by text key. On this host
the premise did not hold: after a real `daemon stop`/`daemon start`, every reloaded
assistant item — Claude and Codex — still carried its original stable `messageId`
(verified in the timeline JSON), so every commentary stayed co-owned by id key and no
warning line appeared. That is the correct behavior for the keys that were present;
fork safety held everywhere (0 Fork triggers anchored before any final answer).

The warning path itself is exercised elsewhere: `footerMode` unit tests render the
warning for unprotected turns (Task 8), and the pinned-host pipeline check shows 0.15.3
and 0.16.0 anchoring Paseo's footer at an unclaimed short commentary
(`npm run qa:reply-actions`, "short commentary" cases). What this real-client pass
could not produce is a real 0.16.0 timeline whose replies lack ids.

## Not checked

- Electron desktop, iOS and Android clients. No Xcode or Android SDK on this host; the
  compact web layout at 390×844 is the only small-screen evidence.
- The Hermes bundle smoke (`npm run smoke:hermes`) still has not run on this machine:
  `HERMES_BIN` is unset (declared gap since Task 8). `client/reply-actions/co-ownership.ts`
  uses `Array.prototype.findLastIndex` (ES2023), flagged in Task 3 for Android QA.
- Footer behavior while a turn is still streaming. Only completed turns were exercised;
  the completion gating is covered by the store unit tests.
- A real timeline with id-less replies (see the restart section).
- `Fork in a new workspace`, and sending after Fork on 0.15.x hosts.

# Open follow-ups

[Back to README](../README.md) · [Development](development.md)

Minor findings that reviews deferred, mostly from the fork-safe replies work in 0.5.0.
None blocked a release. Delete an item when a change resolves it.

## Rendering

- With **Tables** on, a last column of long prose is squeezed narrow, its rows grow tall,
  and the table viewer shows mostly blank rows.
- Consecutive `$$…$$` blocks stack with no vertical gap between them.
- `detectExtensions`' cheap gate misses bare autolinks for `canRender`.

## Reply actions

- Eviction is keyed on row mounts, not chat visibility. Changing it needs native-list
  evidence. Cost today: an extra read and re-projection after 60 s off-screen on
  virtualized lists.
- A timeline rebuild that lands exactly on the last cap page is labelled exhausted
  (epoch mismatch at the cap boundary). Keys older than the tail then stay unfound until
  eviction or the next epoch change.
- `store.ts` duplicates `groupTurns`' reply derivation; export a helper from `turns.ts`.
  At about 520 lines, its operation machinery could split out.
- `dispose` does not clear `coOwnership`. Records for agents that never mount are
  unbounded. A throwing `isOwned` or subscriber rejects the operation promise and
  `settled()`.
- The operation's `finally` consumes `refreshWanted` even when `mounted === 0`, so an
  unmount and remount within `EVICT_AFTER_MS` during a read drops the owed refresh until
  the next working→idle cycle.
- Turn-end refresh and `refreshWanted` have no `enabled` gate, and `setEnabled(false)`
  does not cancel a read in flight; a read that completes while disabled still merges
  into the kept index.
- Eviction firing mid-gesture cancels the immediate read, so the hand-back records from
  the index as it was before the read.
- `restore` and `showOriginal` on the runtime have no `disposed` guard. They are
  unreachable after dispose today, through the nulled holder.
- Show original has no in-flight guard (a double tap costs one redundant tail read), and
  `showOriginal(...).then` has no `.catch` (nothing rejects today).
- `FOOTER_COPY`'s comment says "every string", but the copy-error string lives outside
  it. `action-bar.tsx`'s comment still says "code-block actions".
- `Array.prototype.findLastIndex` in `co-ownership.ts` is ES2023. Android QA should
  exercise that path; `npm run smoke:hermes` only evaluates the bundle.

## Tests

- Turns: the `startsTurn` branch "previous has a turnId, next lacks one, next is not a
  trigger → continues", and `groupTurns([])`.
- Co-ownership: a handed-back turn's reply blocking co-ownership elsewhere, the exact
  40-character `>=` boundary, and duplicate keys within one agent.
- Render cache: eviction, no-cache and clear. `Record<string, string>` on `data` disables
  excess-property checks; an exact-shape test mitigates that.
- Store: eviction or dispose during a read, rejection with a joined key, `showOriginal`
  during a read, dispose mid-gesture, `showOriginal` for an evicted agent, and the
  `await active.done` contention-then-disable path.
- Reader: the `before`/cursor branch. The "skips re-registration when nothing changed"
  test is short-circuited by `moduleState.set`'s equality guard.
- Pinned-host check: nothing pins the case count, so a shortened `CASES` list still
  exits 0.

## Tooling

- The pin-failure message in `scripts/lib/paseo-checkout.mjs` names neither the label nor
  the directory.
- The probe's `report.json` path resolves relative to the bundle, a trap when running it
  outside the runner. `scripts/` is outside both tsconfigs, so the `.ts` probe is never
  typechecked.
- `scripts/qa/reply-actions-web.mjs`'s header omits the `type:` and `key:` steps.
- Check output carries noise: two Biome `noUselessStringRaw` infos in
  `tests/math-copy.test.ts`, a Biome deprecation info, and the smoke's `fs.F_OK`
  deprecation.

## Records

- The fork-safe QA record's capture conditions (English UI, named view) are overbroad for
  its earliest Better Paseo run. The timeline-id dump behind the partial restart result
  is not committed. "No RPC re-render" is shown by node identity, not image hashes. Two
  exploratory probes in the committed run JSONs lack a purpose note.
- The README's known limits condense three consequences: the first-load window of a
  running turn, the early Fork of identical owned replies, and a late duplicate's missing
  footer. `usage.md`'s reload sentence can read as per-agent.

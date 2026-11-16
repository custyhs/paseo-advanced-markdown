# Fork-safe replies: Show original and turn awareness

Status: approved 2026-11-08. Written 2026-11-07; text-key policy settled 2026-11-08; host-native
footer compatibility (section 11) and the 0.16.0 findings added 2026-11-16.
Plugin: advanced-markdown 0.4.1, next minor release.
Hosts: official Paseo 0.16.0 is the reference, and 0.15.3 stays pinned in the pipeline check. The
plugin's floor stays Paseo 0.13.0.

## Why

Advanced Markdown claims assistant replies that contain math, and code blocks or tables when
those modules are on, and draws them as plugin rows. Paseo builds a turn's footer (Copy, Fork,
duration) from native assistant rows only. Walking up from the end of a turn, it anchors Copy and
Fork to the nearest native reply in that turn. On every released Paseo through 0.16.0 this causes
two failures:

1. **No footer.** When every reply in a turn is a plugin row, the turn has no Copy, no Fork and
   no duration.
2. **A Fork that cuts too early.** When a plain reply comes before a plugin-rendered final reply,
   Paseo anchors the footer to the plain reply. Fork then drops everything after it, including
   the final answer, and Copy copies only the plain reply. Coding agents produce this shape
   often: a short plain message, some tool calls, then an answer with formulas.

The plugin SDK cannot invoke Paseo's Fork. The host-side fixes are not in a release:
getpaseo/paseo#9253, a transformer opt-in that keeps the host footer under a plugin-rendered
reply; #7462; and the body-override patch in custyhs/paseo@74c11e85a. Section 11 adopts the
#9253 contract ahead of a release. The maintainer's priority is that Fork works while Advanced
Markdown and Better Paseo are both enabled.

## What the user sees

A completed turn whose final reply the plugin draws gets a small plugin footer under that reply:

```
  Final equation: E = mc²               typeset
  Copy · Show original · 14:32
```

**Show original** hands the whole turn back to Paseo. Paseo renders it natively, so formulas
show as TeX source, and draws its own footer with Fork:

```
  Final equation: $E = mc^2$
  Copy · Fork ▾ · Worked for 2m 10s
```

A composer pill for that agent states how many turns are in the original view and restores them
when pressed. Reloading the app restores them too.

Some turns cannot be fully protected, for example when an earlier plain reply's text repeats. In
those, Paseo's own footer stays visible below with a Fork that stops early, and the plugin footer
adds one line saying so and pointing to Show original.

Turns without plugin-rendered replies are unchanged. The in-flight Fork next to the running
indicator is unaffected.

## Goals

1. In every completed turn whose final reply the plugin draws, one press of **Show original**
   brings back Paseo's footer, with Fork anchored to the turn's final reply and Copy covering the
   whole turn.
2. Paseo never shows a Fork anchored before the final reply of a turn the plugin touched, except
   during the first-load window and in unprotected turns, where the plugin footer warns about it.
   Both are described under Known limitations.
3. One press restores plugin rendering. A reload restores it as well.
4. Goals 1 to 3 hold with Better Paseo enabled and its **Plugin markdown for replies** off.
5. Turns with no plugin-rendered reply look and behave exactly as today.
6. On a host that keeps its own footer for plugin-rendered replies (getpaseo/paseo#9253), formula
   replies stay typeset under Paseo's own footer with Fork, and the plugin draws no footer, co-owns
   nothing and reads no timelines.

## Non-goals

- Reimplementing Fork or any other host action in the plugin.
- Duration, model or token details in the plugin footer.
- Reaching Paseo's footer while Better Paseo's **Plugin markdown for replies** is on. Paseo gives
  each reply to the first plugin that claims it, in plugin id order, so a reply this plugin
  declines goes to Better Paseo.
- Persisting the original view across reloads or sharing it between clients.
- Paseo's Copy in turns whose final reply is native while an earlier reply is a plugin row. Fork
  is correct there. Copy leaves out the plugin rows, as it does today.
- Host changes. The upstream fix is a separate track.

## Anti-goals

The change has failed, even if it works mechanically, when any of these happen:

- Outside the first-load window, a visible Paseo Fork in a turn this plugin touched is anchored
  before the turn's final reply, and the plugin footer does not warn about it.
- Showing or restoring the original view moves the pressed turn's final reply out of view, or
  remounts rows outside that turn.
- Chats without formulas change in appearance or lose Paseo's footer.
- Long chats get slower: per-row daemon reads, bursts of re-projection, or formula images
  rendered again.

## Constraints

Host and SDK facts the design rests on. File references are to getpaseo/paseo v0.16.0; every file
named here is byte-identical in v0.15.3 except where a bullet says otherwise.

- **Transformer input.** A transformer receives `{ item, phase }`. For a reply, `item` is
  `{ type, text, messageId? }`, with no agent id, turn id, timestamp or row id
  (`packages/app/src/plugins/timeline/model.ts`). Per-reply decisions must key on `messageId`,
  or on the exact text when there is none.
- **Recomputation.** Transformers run synchronously and must be deterministic. Paseo caches
  projections per composed transform function, and composes a new one only when a plugin
  registers or removes a contribution (`plugins/timeline/index.ts`, `plugins/timeline/projection.ts`).
  To change the answer for rows already on screen, remove the transformer and register it again.
  Each re-registration re-projects every timeline on that host. Projected row ids derive from
  source ids, so rows are not remounted. Better Paseo's preference switches rely on the same
  mechanism.
- **First claim wins.** Paseo consults plugins sorted by id, so `advanced-markdown` runs before
  `better-paseo`, and stops at the first transformer that returns items (`plugins/registry.ts`,
  `model.ts`). Returning `undefined` passes the reply on to the next plugin. No result keeps a
  reply native and stops the chain.
- **Footer anchoring.** The footer is anchored to the nearest native reply found walking up from
  the end of the turn (`agent-stream/layout.ts`, `findTurnFooterSource`). Turn membership compares
  canonical turn ids. Without ids, a `user_message`, or a `tool_call` that carries `agentMessage`
  or is named `heartbeat`, starts a turn (`packages/protocol/src/timeline-turn.ts`). Plugin rows
  keep their source turn id. Unchanged between 0.15.3 and 0.16.0.
- **Renderer props.** A timeline renderer gets `agentId`, `item.data`, `timestamp`, `theme`, `host`
  and `layout`. It gets no navigation and no turn context.
- **SDK floor.** All of these exist in SDK 0.13.0: `usePaseo().agents.ref(id).timeline.refetch()`,
  whose entries carry `item`, optional `turnId` and `timestamp`, and whose responses carry
  `epoch`, `startCursor` and `hasOlder`; `useAgent()`; `addComposerPill()`, returning an
  update/remove registration; the public `Markdown` component; `copyText`; `useToast`.
- **Projection.** Paseo's app reads timelines with `projection: "projected"`, which merges streamed
  chunks into one reply. The index must read the same projection so texts and ids match what the
  transformer sees.
- **Message ids.** Codex replies carry `messageId` live and in history. Claude Code's streamed
  replies carry it, but replies rebuilt from the Claude transcript do not
  (`convertHistoryEntry` and `appendTextBlockToTimeline` in
  `packages/server/src/server/agent/providers/claude/agent.ts`, unchanged in 0.16.0). The
  0.16.0 real-client QA found that a daemon restart kept the ids of the Claude replies it
  reloaded, so transcript-rebuilt, id-less replies are rarer than this design first assumed;
  they still exist, so text keys must stay supported. Short plain texts repeat within a chat
  and across chats. Message ids do not repeat across chats in practice: Claude uses UUIDs and
  Codex uses `msg_` ids.
- **Collapse turns.** Since 0.14, new installs default to the Collapse turns view
  (`chatDisplay: "collapseTurns"` in `packages/app/src/hooks/use-settings/storage.ts`). On 0.15.x
  a turn folds the work before its last native reply (`findLastAssistantIndex` in
  `agent-stream/turn-collapse/model.ts`) and ignores plugin rows. 0.16.0 ships getpaseo/paseo#8811:
  `findLastReplyIndex` counts plugin rows projected from replies as replies, so folding follows
  them. Neither version changes the footer. On 0.16.0 a folded turn whose final reply is a plugin
  row shows no footer at all, because the walk up from that row meets the summary row and then the
  prompt; an early-anchored footer appears only once the turn is expanded.
- **Host-native footer opt-in.** getpaseo/paseo#9253, open since 2026-11-10, adds
  `nativeTurnFooter?: boolean` to the transform result and to the renderer props. When a
  transformer returns exactly one item for an `assistant_message` with `nativeTurnFooter: true`,
  projection keeps the original message on the row as `turnFooterSource`, the footer walk treats
  the row as that original, Copy uses its text, timing and the fork boundary use its id, and the
  renderer receives `nativeTurnFooter: true`. `parseTransformResult` on every released host reads
  only `items` and drops other fields, checked at v0.13.0 and v0.16.0, and released hosts pass no
  such prop. The PR head is `ffa02c5d81970c6ffbda9d3802287ed9f06648d6`.
- **Paseo 0.13.x.** On 0.13 a response continues across turn ids until the next user message, and
  without ids only a user message starts a turn (`agent-stream/turn-membership.ts` at v0.13.0).
  The rule described under Footer anchoring holds from 0.14.0. The SDK does not expose the app
  version, so the plugin cannot pick a rule per client.
- **Public Markdown.** The SDK `Markdown` component passes only the text to Paseo's renderer.
  Native replies also pass the workspace root, server and client, which Paseo uses for local
  images and workspace paths. Whole replies drawn with it would lose those.

## Design

### Terms

- **Reply key**: `messageId` when present, otherwise the exact reply text.
- **Owned reply**: a reply the plugin claims on its own today, meaning within `MAX_DOCUMENT` and
  `shouldTakeOver` under the current module settings.
- **Co-owned reply**: a reply the plugin would not claim on its own, claimed because it comes
  before an owned reply in the same turn.
- **Handed-back turn**: a turn whose replies the plugin declines so that Paseo renders them.

### 1. Decision snapshot and re-registration

The transformer's answer depends on three inputs: module settings, the handed-back key set and the
co-owned key set. Keep them in one immutable snapshot, and let each registered transformer close
over one snapshot. When an input changes, coalesce changes so that a burst produces one
re-registration, then remove the transformer and register it again under the same id. Skip
re-registration when the new snapshot equals the old one. Keep the existing parse caches outside
the registration, so re-registering never re-parses a reply.

Including module settings closes an existing gap: today a settings change does not re-project rows
already on screen.

The transformer checks, in order:

1. Key in the handed-back set: return `undefined`.
2. Owned: return today's item.
3. Key in the co-owned set: return a plugin item marked co-owned.
4. Otherwise: return `undefined`.

Plugin item data gains the reply's `messageId` when present and its role, owned or co-owned. The
renderer derives the key from them.

Every result also carries `nativeTurnFooter: true` next to `items`, the opt-in of section 11.

### 2. Turn index

One index per agent, built from that agent's daemon timeline and shared by all of its rows.

- **Contents.** Per turn: its replies in order, each with key, text, timestamp and whether it would
  be owned under the current settings; the timestamp of the turn's last entry; whether the turn is
  complete.
- **Grouping.** By `turnId` when entries have it, otherwise by the trigger rule in Constraints.
- **Completion.** Every turn is complete except the latest one while the agent's status is
  `initializing` or `running`.
- **Reads.** A mounted row whose key is missing from its agent's index requests a read: the tail
  first, then older pages from `startCursor` while `hasOlder`, up to a cap. Paging continues from the
  oldest cursor the agent's epoch has reached, and once the window is exhausted — a cap ran out or
  history has no older pages — a missing key costs one tail read per operation. One read per agent
  is in flight at a time, and later requests join it. Reads are rate-limited per agent. A row
  triggers at most one read per key. A row keyed by text never triggers a read while its reply is
  streaming, because its key changes with every chunk.
- **Refresh.** Read the tail again when the agent's status crosses into or out of working while
  any of its rows is mounted: completion indexes the finished turn, and the start of a turn brings
  in the new turn's user message so the previous turn stops being the latest and keeps its footer.
  Rebuild from scratch when a response's `epoch` differs from the index's.
- **Lifetime.** Memory only. Evict an agent's index some time after its last row unmounts, and
  clear everything on plugin dispose.
- **Failure.** When a read fails or a key is not found within the cap, that reply gets no footer
  and no co-ownership, which is today's behavior.

### 3. Co-ownership

In each indexed turn, every reply that is not owned and comes before the turn's last owned reply
is co-owned. The rule needs no completion state, so it also covers the running turn, which is
usually corrected before it completes. When the final reply is native, the extra co-owned replies
do no harm, because Paseo anchors to that native final reply. Handed-back turns are skipped.
A reply the plugin's renderer could not draw on its own — over the document limit or carrying
content detection marks unsupported — is never co-owned, so a formula-final turn that keeps one
is unprotected. Section 4 limits which keys may be co-owned. Recompute the co-owned set whenever an index, the
handed-back set or the module settings change.

Co-owned replies render through the plugin's existing message renderer, the path owned replies
use, including its file-link preview. The public `Markdown` component is not used for whole
replies, because it would drop local image and workspace path resolution. Co-owned rows have no
plugin footer.

### 4. Key uniqueness

The transformer cannot tell chats apart, so one key can match several replies on the host. Text
keys repeat often. Message ids from Claude and Codex do not.

- **Co-ownership needs a unique key.** A reply is co-owned only when its key occurs exactly once
  among the replies of every index loaded on the host, counting owned, co-owned and native replies
  across all agents. A text key must also reach a minimum length, so short acknowledgements never
  qualify. Recompute on every index change, so a duplicate found later revokes co-ownership.
- **Late duplicates.** A chat that has not been indexed yet can hold a duplicate. There the reply
  turns into a plugin row and requests its own index read, which reveals the duplicate and revokes
  co-ownership. Until that read returns, the row is plugin-drawn. If it is that turn's final reply,
  the turn shows no Paseo footer for that time.
- **Hand-back.** Show original hands back owned replies by whatever key they have, text included.
  Texts the plugin claims contain formulas, or code and tables when those modules are on, and they
  rarely repeat. When they do repeat, the identical replies switch to the original view together.
  Co-owned replies are handed back by their unique keys.
- **Unprotected turns.** A formula-final turn can keep an earlier native reply that could not be
  co-owned. Its plugin footer then states that Paseo's Fork below stops before this answer and
  points to Show original.

### 5. Plugin footer

Shown under an owned reply when the index marks it as the final reply of a complete turn. Hidden
while the turn runs, while its index loads, and when the feature setting is off.

Contents, left to right:

- **Copy**: the turn's replies joined by a blank line, the same text Paseo's Copy produces for a
  native turn.
- **Show original**.
- **End time**: the timestamp of the turn's last entry.
- **Warning**, in unprotected turns only: one line stating that Paseo's Fork below stops before
  this answer and that Show original forks from here.

### 6. Show original and restore

Show original:

1. Adds the keys of the turn's owned and co-owned replies to the handed-back set, and records the
   turn under its agent. Native replies need no entry, and adding their text keys would reach
   identical replies elsewhere.
2. Updates the snapshot. The coalesced re-registration hands the turn to Paseo, which draws its
   footer with Fork on the final reply.
3. Adds or updates that agent's composer pill. Its id derives from the agent id, its label states
   how many turns are in the original view, and pressing it restores them all. The workspace id
   comes from `useAgent`.
4. On first use in a session, shows a toast: when Paseo's Fork does not appear, another plugin is
   drawing replies, and Better Paseo users should turn off **Plugin markdown for replies**.

Restore removes that agent's keys from the handed-back set, updates the snapshot and removes the
pill. A reload clears all state.

### 7. Setting

Add a host-scoped switch, on by default, to the Modules settings, labelled along the lines of
"Show original for Fork". Off disables the footer, co-ownership and hand-back, leaving today's
behavior exactly. Its hint tells users to turn it off on a Paseo client that keeps reply actions
for plugin-rendered rows, and when Better Paseo's **Plugin markdown for replies** is on. Add it as
a defaulted field. Bump the settings version with a migration only if the SDK rejects stored
values without it.

### 8. Better Paseo

- **Plugin markdown for replies off**, the supported combination. Plain replies are native with
  Paseo's footer. Advanced Markdown owns formula replies and co-owns earlier plain replies in those
  turns. Better Paseo keeps its tool cards, reasoning, todos and Tasks board. Ctrl+F falls back to
  Paseo's find, which cannot reach plugin rows.
- **Plugin markdown for replies on.** No Paseo footer exists anywhere, so co-ownership protects
  nothing. It only moves co-owned plain replies from Better Paseo's styling to this plugin's.
  Show original hands turns to Better Paseo, so Fork stays unavailable. The plugin cannot read
  another plugin's settings. The setting hint, the toast and the README cover this case.

### 9. Collapse turns on Paseo 0.15.x

Folding and a correct Fork depend on the same native reply, so on 0.15.x they conflict. Once a
formula-final turn's earlier plain replies are co-owned, the turn has no native reply and does not
fold. Show original makes the turn native and Paseo folds its work behind a summary line. Restore
unfolds it. Fork takes priority, so co-ownership stays as designed. Paseo 0.16.0 includes #8811 and
folds plugin rows like native replies: there the co-owned turn folds with its formula answer
visible, and Show original changes nothing about folding. The difference exists on 0.15.x only,
without a plugin change.

### 10. Paseo 0.13.x

The plugin's floor stays 0.13.0, and the index groups turns by the 0.14 rule. On 0.13.x clients,
Paseo's footer can reach back across turns started by heartbeats or agent messages, so such a
response can still show an early-anchored Fork before Show original. Show original itself works,
because the final reply becomes native. Document this as a 0.13.x limitation. The pipeline check
pins 0.15.3, 0.16.0 and the #9253 head.

### 11. Hosts with native turn footers

getpaseo/paseo#9253 lets a transformer keep Paseo's footer for the reply it replaces. The plugin
adopts its contract now, so a host that ships it gets the native footer without a plugin release:

- **Transformer.** Every result, owned or co-owned, carries `nativeTurnFooter: true` next to
  `items`. Released hosts drop the field.
- **Renderer.** A row whose props carry `nativeTurnFooter: true` draws no plugin footer: Paseo's
  own Copy, Fork and duration sit under it, anchored to the original reply. The first such row
  reports to the runtime that this host keeps native footers.
- **Runtime.** Once reported, the host keeps native footers for the rest of the session: the
  runtime disables the store as if the setting were off, which clears hand-backs and pills, stops
  timeline reads and empties the co-owned set, and re-registers the transformer. Rows on such a
  host never request index reads. The setting stays visible and has no further effect there.
- **Order.** Detection runs in the first owned row's mount effect, before that row would request a
  read, so co-ownership never starts on such a host and nothing flashes.

What it does not cover: a host patched with the body override (custyhs/paseo@74c11e85a) passes no
prop, so there the setting hint still applies. If upstream merges the opt-in under another field
name, the plugin needs a follow-up release; until then the field is inert.

## Known limitations

- **First load.** When a chat opens, a turn with a plain reply before a plugin-rendered final reply
  shows Paseo's early-anchored footer until the index read returns: one round trip on a local
  host, longer over the relay. The same window appears when a running turn finishes, if its
  replies have no `messageId`.
- **Unprotected turns.** When an earlier plain reply in a formula-final turn has a short or repeated
  key, or content the plugin's renderer cannot draw, it cannot be co-owned. Paseo's early Fork stays in that turn, with the plugin footer's
  warning above it, until Show original. It happens in chats whose replies carry no message id
  and are keyed by text; the 0.16.0 QA could not produce one through a daemon restart.
- **Identical owned replies.** Owned replies with the same text switch to the original view
  together. An identical owned reply in the middle of another formula-final turn would then give
  that turn an early Fork until restore.
- **Late duplicates.** A duplicate in a chat that has not been indexed yet draws one reply as
  plugin-rendered for one index round trip. If that reply ends its turn, the turn shows no Paseo
  footer for that time.
- **Read-only panes.** Paseo offers no Fork in read-only subagent panes. If the index loads there,
  Show original restores only Copy and time.
- **Renamed opt-in.** If #9253 lands under another field or prop name, hosts with it behave like
  today's hosts until a plugin release follows. The field the plugin sends stays inert there.

## Evidence

`.smoke/show-original-probe-0.15.3/` (gitignored) runs the current transformer, wrapped in the
planned decision order, through Paseo v0.15.3's projection, layout and fork-boundary sources. The
host files involved are byte-identical in 0.15.0-beta.1 and 0.15.3. Rows are synthetic with
canonical turn ids. The agentic turn is plain commentary, a tool call, then a formula answer.

| Case | Paseo footer | Fork anchored to | Copy |
| --- | --- | --- | --- |
| Single formula reply, before Show original | none | none | none |
| Single formula reply, after | shown | final reply | final reply |
| Agentic turn, before, no co-ownership | shown | commentary | commentary only |
| Agentic turn, after | shown | final reply | whole turn |
| Agentic turn, commentary co-owned, before | none | none | none |
| Agentic turn, commentary co-owned, after | shown | final reply | whole turn |
| Agentic turn, Better Paseo reply markdown on, after | none | none | none |

The third row is the failure this design removes. The fifth shows co-ownership removing it.

`.smoke/show-original-probe-0.16.0/` repeats the run against v0.16.0 sources with identical
results. `probe-collapse.ts` in both directories runs the agentic turn through `collapseTurns`
before the layout; the cells give the Paseo footer's anchor:

| Agentic turn, Collapse turns view | 0.15.3 folded | 0.15.3 expanded | 0.16.0 folded | 0.16.0 expanded |
| --- | --- | --- | --- | --- |
| Commentary native, before Show original | commentary | commentary | none | commentary |
| Commentary co-owned, before | none | none | none | none |
| Commentary co-owned, after | final reply | final reply | final reply | final reply |

## Verification expected

- **Unit tests** for pure logic: reply keys; turn grouping with and without turn ids; owned
  prediction under each module setting; the co-ownership rule, including running turns and native
  final replies; key uniqueness, including the minimum text length, counting across agents and
  revocation when a duplicate appears; unprotected-turn detection; transformer decision order;
  snapshot equality and coalescing; Copy text; the `nativeTurnFooter` flag on every result; the hidden
  footer mode and the skipped read when the renderer prop is present; the runtime disabling the
  store once a host reports native footers.
- **Host pipeline.** Turn the probe into a reproducible check against pinned host sources, v0.15.3,
  v0.16.0 and the #9253 head, fetched the way `scripts/paseo-source.mjs` fetches 0.8.0. On the
  #9253 head every formula-final turn must show Paseo's footer anchored to the final reply before
  any Show original. Assert the evidence table, plus a
  formula reply between plain replies with a native final reply, a turn without turn ids, two
  formula replies with a plain reply between them, and a text-keyed commentary that repeats in
  another turn, which must stay native and leave that other turn's footer intact.
- **Real client.** Use an isolated daemon home, never the production daemon on port 6767, and
  follow `docs/qa`. Check web at wide and compact widths:
  - the footer appears only under final replies of completed formula turns;
  - Show original produces Paseo's footer;
  - Fork in a new tab carries history through the final answer;
  - the pill restores, and a reload restores;
  - the pressed turn's final reply stays in view when a turn in the middle of history is handed
    back or restored;
  - formula images are not rendered again on re-registration;
  - the same checks hold with Better Paseo enabled and its reply markdown off;
  - the same checks hold in both the Full and the Collapse turns views, including the fold that
    Show original causes under Collapse turns;
  - in a Claude chat reloaded after a daemon restart, a long unique commentary is co-owned, and a
    short or repeated one leaves the turn unprotected with the warning shown.

  Record Electron and native devices where available, and state what was not checked. No release
  carries #9253, so its behavior is covered by the pipeline check only.

## Docs to update

- README, "Reply actions and compatibility": Show original, the Better Paseo setting, the host-fix
  status, and that a host with #9253 shows Paseo's footer under typeset replies with no setting
  change.
- OVERVIEW, "Data access and limitations": the plugin now reads each open chat's timeline through
  Paseo's API to find turn boundaries and copy turns.
- `docs/qa/host-integration.md`: link the new evidence. Release notes for the version.

## Left to the builder

- Module layout and names, and whether the index is a small store with React bindings.
- Visual details: icons, labels, spacing matched to Paseo's footer, pill wording, time format.
- Coalescing window, page size, page cap, rate limit and eviction delay.
- The minimum text length for co-ownership, as long as short acknowledgements such as "Done." or
  "Let me check the tests." never qualify.
- How the index learns that a turn completed: an agent subscription or `useAgent` in rows.
- Whether `MESSAGE_VERSION` changes for the new data fields.
- The release version number.

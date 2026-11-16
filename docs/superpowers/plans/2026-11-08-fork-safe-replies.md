# Fork-safe Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users reach Paseo's own Copy and Fork for turns Advanced Markdown renders, through a
Show original action, and stop Paseo from showing a Fork that cuts such a turn short.

**Architecture:** A per-agent turn index, read from the daemon timeline through the SDK, tells the
plugin which replies form a turn. A pure co-ownership pass claims plain replies that precede a
formula answer, guarded by key uniqueness. One immutable decision snapshot drives the timeline
transformer, which is removed and re-registered, coalesced, whenever the snapshot changes. Show
original moves a turn's keys into a handed-back set, and a composer pill restores them.

**Tech Stack:** TypeScript, React 19 and React Native provided by the host, Paseo plugin SDK
0.13.0, zod 4, vitest 3, esbuild, biome.

**Spec:** `docs/superpowers/specs/2026-11-07-fork-safe-replies-design.md`

## Global Constraints

- The Paseo floor stays `>=0.13.0` in `paseo-plugin.json`. The reference host is official Paseo
  0.16.0, commit `c54bc39e7997c03a07402c09df2e825889432557` (tag `v0.16.0`). Paseo 0.15.3, commit
  `d91ae138cb931447635e94296023414a58bedcc5` (tag `v0.15.3`), stays pinned in the pipeline check.
- Every transform result carries `nativeTurnFooter: true` next to `items`, the opt-in of
  getpaseo/paseo#9253. A row whose props carry `nativeTurnFooter: true` draws no plugin footer,
  requests no index read, and reports host-native footers to the runtime, which then keeps
  `store.setEnabled(false)` for the rest of the session.
- Client code must not use `class` syntax, because Hermes on Android has failed on it. Follow the
  factory-function style of `client/module-state.ts`.
- No new runtime dependencies.
- Never render a whole reply with the SDK's public `Markdown` component. Co-owned replies go
  through `MessageView` like owned replies.
- Timeline reads use `projection: "projected"`.
- Index and hand-back state live in memory only.
- A text key qualifies for co-ownership only when it is unique across every loaded index and its
  trimmed text has at least `MIN_CO_OWNED_TEXT_LENGTH = 40` characters. A message-id key needs
  uniqueness only.
- The setting is field `forkSafeReplies`, host scope, default `true`, label "Show original for
  Fork".
- Read `client.paseo` and call `client.addComposerPill` lazily, never during setup. The smoke
  harness's fake client provides neither.
- Never start, stop or target the production daemon on `127.0.0.1:6767`.
- Run tests one file at a time: `npx vitest run tests/<file>.test.ts --bail=1`. The full suite runs
  in CI.
- Work on branch `feat/fork-safe-replies` from `main`, and commit after every task.

## Review Focus

1. Turning **Show original for Fork** off while turns are in the original view: every turn returns
   to plugin rendering and every pill disappears. Tests in Task 6 and Task 7.
2. Timeline reads that fail, from an older daemon, a network error or an `error` field in the
   payload: rows keep today's rendering, show no footer, and the same key is never read again in a
   loop. Tests in Task 5 and Task 7.
3. A replaced timeline, with a new `epoch` after a rewind or compaction: the index is rebuilt from
   the new page, so co-ownership and footers follow the new turns. Test in Task 5.
4. Show original pressed after the turn gained replies while the chat was hidden: the plugin reads
   the tail first, so the hand-back covers the turn's real final reply. Test in Task 6.
5. Empty or whitespace-only replies: never co-owned and left out of the plugin's Copy text. Tests
   in Task 3 and Task 5.
6. A host that passes `nativeTurnFooter: true` to the renderer: no plugin footer, no reads, every
   hand-back and pill cleared, the co-owned set empty, and the setting without further effect.
   Tests in Task 7 and Task 8.

## File Structure

| File | Responsibility |
| --- | --- |
| `client/reply-actions/keys.ts` | Reply keys: `id:` or `text:` prefix |
| `client/reply-actions/turns.ts` | Timeline entry shape and turn grouping, mirroring the host rule |
| `client/reply-actions/co-ownership.ts` | Pure co-ownership and unprotected-turn computation |
| `client/reply-actions/ownership.ts` | Cached "would the plugin claim this text" check |
| `client/reply-actions/decision.ts` | Decision snapshot, decision order, transformer factory |
| `client/reply-actions/store.ts` | Per-host state: indexes, reads, hand-back, listeners |
| `client/reply-actions/reader.ts` | Adapter from `client.paseo` timeline reads to the store's reader |
| `client/reply-actions/pills.ts` | Composer pill per agent in the original view |
| `client/reply-actions/runtime.ts` | Wiring: snapshot, coalesced re-registration, pills, settings |
| `client/reply-actions/footer-state.ts` | Pure footer visibility, time format and copy strings |
| `client/reply-actions/footer.tsx` | Row hook and footer component |
| `scripts/lib/paseo-checkout.mjs` | Sparse checkout of pinned Paseo sources, shared by two scripts |
| `scripts/host-source.mjs` | Pinned Paseo host sources: 0.15.3, 0.16.0 and the #9253 head |
| `scripts/qa/reply-actions-probe.ts`, `scripts/qa/reply-actions.mjs` | Host pipeline check |
| `tests/helpers/timeline.ts` | Timeline entry builders for tests |

Modified: `shared/settings.ts`, `shared/message.ts`, `client/module-state.ts`,
`client/settings.tsx`, `client/message.tsx`, `index.client.tsx`, `scripts/smoke.mjs`,
`scripts/paseo-source.mjs`, `package.json`, `.gitignore`, `biome.json`, `.github/workflows/ci.yml`,
README, OVERVIEW and docs.

---

### Task 1: Show original for Fork setting

**Files:**
- Modify: `shared/settings.ts` (schema)
- Modify: `client/module-state.ts` (equality check in `set`)
- Modify: `client/settings.tsx` (new switch after **Tables**)
- Test: `tests/math-settings.test.ts`

**Interfaces:**
- Produces: `ModuleSettings.forkSafeReplies: boolean`, default `true`.

- [ ] **Step 1: Create the branch and commit the design documents**

```bash
git checkout -b feat/fork-safe-replies
git add docs/superpowers
git commit -m "docs: design and plan fork-safe replies"
```

- [ ] **Step 2: Write the failing tests**

Add `forkSafeReplies: true` to every full settings object asserted with `toEqual` in
`tests/math-settings.test.ts`, then add:

```ts
it("keeps Show original for Fork on for values saved before it existed", () => {
  const saved = { math: true, codeBlocks: false, tables: false, fontScale: "default", mathScale: 1 };
  expect(moduleSettings.schema.parse(saved).forkSafeReplies).toBe(true);
  expect(moduleSettings.schema.parse({ forkSafeReplies: false }).forkSafeReplies).toBe(false);
});

it("notifies when only Show original for Fork changes", () => {
  moduleState.reset();
  let changes = 0;
  const unsubscribe = moduleState.subscribe(() => {
    changes++;
  });
  moduleState.set({ ...DEFAULT_MODULE_SETTINGS, forkSafeReplies: false });
  moduleState.set({ ...DEFAULT_MODULE_SETTINGS, forkSafeReplies: false });
  expect(changes).toBe(1);
  unsubscribe();
  moduleState.reset();
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run tests/math-settings.test.ts --bail=1`
Expected: FAIL, `forkSafeReplies` missing.

- [ ] **Step 4: Implement**

Add `forkSafeReplies: z.boolean().default(true)` to the schema, keeping `version: 1`. Add
`values.forkSafeReplies === current.forkSafeReplies` to the equality check in `moduleState.set`.
In `client/settings.tsx`, add a `SettingsSwitch` after **Tables**, bound like the others:

- label: `Show original for Fork`
- hint: `Adds Show original under replies this plugin draws. It hands the turn back to Paseo, so Paseo's Copy and Fork return. Turn this off on a Paseo client that keeps reply actions for plugin-rendered messages, or when Better Paseo's Plugin markdown for replies is on.`

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run tests/math-settings.test.ts --bail=1 && npm run typecheck`
Expected: PASS, typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add shared/settings.ts client/module-state.ts client/settings.tsx tests/math-settings.test.ts
git commit -m "feat: add the Show original for Fork setting"
```

### Task 2: Reply keys and turn grouping

**Files:**
- Create: `client/reply-actions/keys.ts`, `client/reply-actions/turns.ts`, `tests/helpers/timeline.ts`
- Test: `tests/reply-turns.test.ts`

**Interfaces:**
- Produces, in `keys.ts`:
  - `type ReplyKey = string`
  - `replyKey(reply: { text: string; messageId?: string }): ReplyKey`, returning `id:<messageId>`
    for a non-empty id and `text:<text>` otherwise
  - `isTextKey(key: ReplyKey): boolean`
- Produces, in `turns.ts`:
  - `interface TimelineEntryLike { readonly item: { readonly type: string; readonly text?: string; readonly messageId?: string; readonly name?: string; readonly agentMessage?: unknown }; readonly turnId?: string; readonly timestamp: string; readonly seqStart: number }`
  - `interface IndexedReply { readonly key: ReplyKey; readonly text: string; readonly at: string }`
  - `interface IndexedTurn { readonly id: string; readonly replies: readonly IndexedReply[]; readonly endedAt: string }`
  - `isTurnTrigger(item: TimelineEntryLike["item"]): boolean`
  - `groupTurns(entries: readonly TimelineEntryLike[]): IndexedTurn[]`

- [ ] **Step 1: Write the test helpers**

```ts
// tests/helpers/timeline.ts
import type { TimelineEntryLike } from "../../client/reply-actions/turns.js";

export const at = (seq: number) => new Date(Date.UTC(2026, 10, 8, 0, 0, seq)).toISOString();
export const userEntry = (seq: number, turnId?: string): TimelineEntryLike => ({
  item: { type: "user_message", text: "prompt" },
  ...(turnId ? { turnId } : {}),
  timestamp: at(seq),
  seqStart: seq,
});
export const replyEntry = (
  seq: number,
  text: string,
  options: { messageId?: string; turnId?: string } = {},
): TimelineEntryLike => ({
  item: { type: "assistant_message", text, ...(options.messageId ? { messageId: options.messageId } : {}) },
  ...(options.turnId ? { turnId: options.turnId } : {}),
  timestamp: at(seq),
  seqStart: seq,
});
export const toolEntry = (
  seq: number,
  options: { turnId?: string; name?: string; agentMessage?: unknown } = {},
): TimelineEntryLike => ({
  item: {
    type: "tool_call",
    name: options.name ?? "exec_command",
    ...(options.agentMessage !== undefined ? { agentMessage: options.agentMessage } : {}),
  },
  ...(options.turnId ? { turnId: options.turnId } : {}),
  timestamp: at(seq),
  seqStart: seq,
});
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/reply-turns.test.ts
import { describe, expect, it } from "vitest";
import { isTextKey, replyKey } from "../client/reply-actions/keys.js";
import { groupTurns } from "../client/reply-actions/turns.js";
import { at, replyEntry, toolEntry, userEntry } from "./helpers/timeline.js";

describe("reply keys", () => {
  it("prefers the message id and falls back to the exact text", () => {
    expect(replyKey({ text: "Hi", messageId: "m1" })).toBe("id:m1");
    expect(replyKey({ text: "Hi" })).toBe("text:Hi");
    expect(replyKey({ text: "Hi", messageId: "" })).toBe("text:Hi");
    expect(isTextKey("text:Hi")).toBe(true);
    expect(isTextKey("id:m1")).toBe(false);
  });
});

describe("groupTurns", () => {
  it("groups by canonical turn id", () => {
    const turns = groupTurns([
      userEntry(1, "t1"),
      replyEntry(2, "Looking", { messageId: "a", turnId: "t1" }),
      toolEntry(3, { turnId: "t1" }),
      replyEntry(4, "$x$", { messageId: "b", turnId: "t1" }),
      userEntry(5, "t2"),
      replyEntry(6, "Done", { messageId: "c", turnId: "t2" }),
    ]);
    expect(turns.map((turn) => turn.id)).toEqual(["t1", "t2"]);
    expect(turns[0]!.replies.map((reply) => reply.key)).toEqual(["id:a", "id:b"]);
    expect(turns[0]!.endedAt).toBe(at(4));
  });

  it("starts turns at triggers when entries have no ids", () => {
    const turns = groupTurns([
      userEntry(1),
      replyEntry(2, "one"),
      toolEntry(3, { name: "heartbeat" }),
      replyEntry(4, "two"),
      toolEntry(5, { agentMessage: { from: "peer" } }),
      replyEntry(6, "three"),
    ]);
    expect(turns.map((turn) => turn.id)).toEqual(["seq:1", "seq:3", "seq:5"]);
    expect(turns.map((turn) => turn.replies.map((reply) => reply.text))).toEqual([
      ["one"],
      ["two"],
      ["three"],
    ]);
  });

  it("lets a trigger without an id join the ids that follow it", () => {
    const turns = groupTurns([
      userEntry(1),
      replyEntry(2, "a", { turnId: "t1" }),
      userEntry(3),
      replyEntry(4, "b", { turnId: "t2" }),
    ]);
    expect(turns.map((turn) => turn.id)).toEqual(["t1", "t2"]);
  });

  it("orders entries by seqStart before grouping", () => {
    const sorted = [userEntry(1, "t1"), replyEntry(2, "a", { turnId: "t1" })];
    expect(groupTurns([...sorted].reverse())).toEqual(groupTurns(sorted));
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run tests/reply-turns.test.ts --bail=1`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement `keys.ts` and `turns.ts`**

`groupTurns` sorts a copy by `seqStart`, then starts a new turn at the first entry and wherever this
rule says so, which mirrors `continuesTimelineTurn` in Paseo's `packages/protocol/src/timeline-turn.ts`:

```ts
const startsTurn = (previous: TimelineEntryLike, next: TimelineEntryLike) =>
  previous.turnId !== undefined && next.turnId !== undefined
    ? previous.turnId !== next.turnId
    : isTurnTrigger(next.item);
```

`isTurnTrigger` is true for a `user_message`, and for a `tool_call` whose `agentMessage` is defined
or whose `name` is `heartbeat`. A turn's `id` is the first defined `turnId` among its entries, else
`seq:<seqStart of its first entry>`. Its replies are its `assistant_message` entries with string
text, in order. `endedAt` is the timestamp of its last entry.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/reply-turns.test.ts --bail=1 && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/reply-actions/keys.ts client/reply-actions/turns.ts tests/helpers/timeline.ts tests/reply-turns.test.ts
git commit -m "feat: group timeline entries into turns for reply actions"
```

### Task 3: Co-ownership

**Files:**
- Create: `client/reply-actions/co-ownership.ts`
- Test: `tests/reply-co-ownership.test.ts`

**Interfaces:**
- Consumes: `groupTurns`, `IndexedTurn`, `ReplyKey`, `isTextKey` from Task 2.
- Produces:
  - `const MIN_CO_OWNED_TEXT_LENGTH = 40`
  - `turnRef(agentId: string, turnId: string): string`, returning `` `${agentId}\u0000${turnId}` ``
  - `interface CoOwnershipInput { readonly turnsByAgent: ReadonlyMap<string, readonly IndexedTurn[]>; readonly handedBackTurns: ReadonlyMap<string, ReadonlySet<string>>; readonly isOwned: (text: string) => boolean; readonly minTextLength: number }`
  - `interface CoOwnership { readonly coOwned: ReadonlySet<ReplyKey>; readonly unprotectedTurns: ReadonlySet<string> }`, where `unprotectedTurns` holds `turnRef` values
  - `computeCoOwnership(input: CoOwnershipInput): CoOwnership`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/reply-co-ownership.test.ts
import { describe, expect, it } from "vitest";
import {
  computeCoOwnership,
  MIN_CO_OWNED_TEXT_LENGTH,
  turnRef,
} from "../client/reply-actions/co-ownership.js";
import { groupTurns, type TimelineEntryLike } from "../client/reply-actions/turns.js";
import { replyEntry, toolEntry, userEntry } from "./helpers/timeline.js";

const LONG = "I will read the solver module and check how the loss is normalized first.";
const formulaTurn = (commentary: TimelineEntryLike) => [
  userEntry(1, "t1"),
  commentary,
  toolEntry(3, { turnId: "t1" }),
  replyEntry(4, "$E=mc^2$", { messageId: "f", turnId: "t1" }),
];
const run = (byAgent: Record<string, TimelineEntryLike[]>, handedBack: Record<string, string[]> = {}) =>
  computeCoOwnership({
    turnsByAgent: new Map(Object.entries(byAgent).map(([agent, entries]) => [agent, groupTurns(entries)])),
    handedBackTurns: new Map(Object.entries(handedBack).map(([agent, ids]) => [agent, new Set(ids)])),
    isOwned: (text) => text.includes("$"),
    minTextLength: MIN_CO_OWNED_TEXT_LENGTH,
  });

describe("computeCoOwnership", () => {
  it("co-owns an id-keyed plain reply before a formula answer", () => {
    const result = run({ a1: formulaTurn(replyEntry(2, "Checking.", { messageId: "c", turnId: "t1" })) });
    expect([...result.coOwned]).toEqual(["id:c"]);
    expect(result.unprotectedTurns.size).toBe(0);
  });

  it("co-owns a long unique text-keyed reply", () => {
    const result = run({ a1: formulaTurn(replyEntry(2, LONG, { turnId: "t1" })) });
    expect([...result.coOwned]).toEqual([`text:${LONG}`]);
  });

  it("leaves a short text-keyed reply native and marks the turn unprotected", () => {
    const result = run({ a1: formulaTurn(replyEntry(2, "Let me check the tests.", { turnId: "t1" })) });
    expect(result.coOwned.size).toBe(0);
    expect([...result.unprotectedTurns]).toEqual([turnRef("a1", "t1")]);
  });

  it("refuses keys that repeat anywhere on the host", () => {
    const repeatedText = run({
      a1: formulaTurn(replyEntry(2, LONG, { turnId: "t1" })),
      a2: [userEntry(1, "u1"), replyEntry(2, LONG, { turnId: "u1" })],
    });
    expect(repeatedText.coOwned.size).toBe(0);
    expect([...repeatedText.unprotectedTurns]).toEqual([turnRef("a1", "t1")]);
    const repeatedId = run({
      a1: formulaTurn(replyEntry(2, "Checking.", { messageId: "dup", turnId: "t1" })),
      a2: [userEntry(1, "u1"), replyEntry(2, "Other", { messageId: "dup", turnId: "u1" })],
    });
    expect(repeatedId.coOwned.size).toBe(0);
  });

  it("skips handed-back turns", () => {
    const result = run(
      { a1: formulaTurn(replyEntry(2, "Checking.", { messageId: "c", turnId: "t1" })) },
      { a1: ["t1"] },
    );
    expect(result.coOwned.size).toBe(0);
    expect(result.unprotectedTurns.size).toBe(0);
  });

  it("co-owns before the last formula reply but never flags a turn that ends natively", () => {
    const result = run({
      a1: [
        userEntry(1, "t1"),
        replyEntry(2, "Short.", { turnId: "t1" }),
        replyEntry(3, "$x$", { messageId: "f", turnId: "t1" }),
        replyEntry(4, "Plain end.", { messageId: "p", turnId: "t1" }),
      ],
    });
    expect(result.coOwned.size).toBe(0);
    expect(result.unprotectedTurns.size).toBe(0);
  });

  it("never co-owns empty or whitespace replies", () => {
    const result = run({ a1: formulaTurn(replyEntry(2, "   ", { messageId: "w", turnId: "t1" })) });
    expect(result.coOwned.size).toBe(0);
    expect([...result.unprotectedTurns]).toEqual([turnRef("a1", "t1")]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/reply-co-ownership.test.ts --bail=1`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `computeCoOwnership`**

Count every reply key across every agent's turns, handed-back turns included. Then, for each turn
not listed in `handedBackTurns`:

```ts
const last = findLastIndex(turn.replies, (reply) => isOwned(reply.text));
if (last < 0) continue;
const finalOwned = last === turn.replies.length - 1;
for (const reply of turn.replies.slice(0, last)) {
  if (isOwned(reply.text)) continue;
  const trimmed = reply.text.trim().length;
  const eligible =
    counts.get(reply.key) === 1 &&
    trimmed > 0 &&
    (!isTextKey(reply.key) || trimmed >= minTextLength);
  if (eligible) coOwned.add(reply.key);
  else if (finalOwned) unprotectedTurns.add(turnRef(agentId, turn.id));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/reply-co-ownership.test.ts --bail=1 && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/reply-actions/co-ownership.ts tests/reply-co-ownership.test.ts
git commit -m "feat: co-own plain replies that precede a formula answer"
```

### Task 4: Message data, ownership check and decision snapshot

**Files:**
- Modify: `shared/message.ts`
- Create: `client/reply-actions/ownership.ts`, `client/reply-actions/decision.ts`
- Test: `tests/reply-decision.test.ts`

**Interfaces:**
- Consumes: `replyKey`, `ReplyKey` from Task 2; `ModuleSettings`, `DEFAULT_MODULE_SETTINGS` from
  Task 1.
- Produces, in `shared/message.ts`:
  - `const REPLY_ROLES = ["owned", "co-owned"] as const` and `type ReplyRole`
  - `messageSchema` gains optional `messageId: z.string()`, `role: z.enum(REPLY_ROLES)` and
    `phase: z.enum(["streaming", "complete"])`. `MESSAGE_VERSION` stays `1`, so data saved
    without these fields still validates. A missing `role` means owned.
- Produces, in `ownership.ts`:
  - `interface OwnershipDetector { isOwned(text: string, settings: ModuleSettings): boolean; clear(): void }`
  - `createOwnershipDetector(deps: { detectExtensions(text: string): DetectedExtensions; shouldTakeOver(detected: DetectedExtensions, enabled: { math: boolean; codeBlocks: boolean; tables: boolean }): boolean }): OwnershipDetector`
- Produces, in `decision.ts`:
  - `const TRANSFORMER_ID = "assistant-advanced-markdown"`
  - `interface DecisionSnapshot { readonly settings: ModuleSettings; readonly handedBack: ReadonlySet<ReplyKey>; readonly coOwned: ReadonlySet<ReplyKey> }`
  - `sameSnapshot(a: DecisionSnapshot, b: DecisionSnapshot): boolean`
  - `decideReply(reply: { text: string; messageId?: string }, snapshot: DecisionSnapshot, ownership: OwnershipDetector): ReplyRole | undefined`
  - `createReplyTransformer(snapshot: DecisionSnapshot, ownership: OwnershipDetector): PluginTimelineTransformerContribution<"assistant_message">`
  - `type HostFooterTransformResult = PluginTimelineTransformResult & { nativeTurnFooter: true }`,
    the value `transform` returns. SDK 0.13.0's result type has no such field, so build the result
    as a value of this type, never as an object literal typed as the SDK result.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/reply-decision.test.ts
import { describe, expect, it } from "vitest";
import {
  createReplyTransformer,
  decideReply,
  sameSnapshot,
  TRANSFORMER_ID,
  type DecisionSnapshot,
} from "../client/reply-actions/decision.js";
import { createOwnershipDetector } from "../client/reply-actions/ownership.js";
import { MAX_DOCUMENT } from "../shared/limits.js";
import { detectExtensions, shouldTakeOver } from "../shared/markdown/extensions.js";
import { MESSAGE_KIND, MESSAGE_VERSION, messageSchema } from "../shared/message.js";
import { DEFAULT_MODULE_SETTINGS } from "../shared/settings.js";

const ownership = createOwnershipDetector({ detectExtensions, shouldTakeOver });
const snapshot = (over: Partial<DecisionSnapshot> = {}): DecisionSnapshot => ({
  settings: DEFAULT_MODULE_SETTINGS,
  handedBack: new Set(),
  coOwned: new Set(),
  ...over,
});

describe("decideReply", () => {
  it("checks hand-back, then ownership, then co-ownership", () => {
    const formula = { text: "$E=mc^2$", messageId: "f" };
    expect(decideReply(formula, snapshot({ handedBack: new Set(["id:f"]) }), ownership)).toBeUndefined();
    expect(decideReply(formula, snapshot(), ownership)).toBe("owned");
    expect(decideReply({ text: "Checking.", messageId: "c" }, snapshot({ coOwned: new Set(["id:c"]) }), ownership)).toBe("co-owned");
    expect(decideReply({ text: "Checking.", messageId: "c" }, snapshot(), ownership)).toBeUndefined();
  });

  it("follows module settings and the document limit", () => {
    const mathOff = snapshot({ settings: { ...DEFAULT_MODULE_SETTINGS, math: false } });
    expect(decideReply({ text: "$x$" }, mathOff, ownership)).toBeUndefined();
    expect(decideReply({ text: `$x$${"a".repeat(MAX_DOCUMENT)}` }, snapshot(), ownership)).toBeUndefined();
  });
});

describe("createReplyTransformer", () => {
  it("emits the reply's id, role and phase", () => {
    const transformer = createReplyTransformer(snapshot(), ownership);
    expect(transformer.id).toBe(TRANSFORMER_ID);
    expect(transformer.query.itemType).toBe("assistant_message");
    expect(
      transformer.transform({ item: { type: "assistant_message", text: "$x$", messageId: "f" }, phase: "complete" }),
    ).toEqual({
      items: [
        {
          type: "plugin",
          kind: MESSAGE_KIND,
          version: MESSAGE_VERSION,
          data: { text: "$x$", messageId: "f", role: "owned", phase: "complete" },
        },
      ],
      nativeTurnFooter: true,
    });
  });

  it("still accepts data saved before roles existed", () => {
    expect(messageSchema.parse({ text: "x" })).toEqual({ text: "x" });
  });
});

describe("sameSnapshot", () => {
  it("compares by content", () => {
    expect(sameSnapshot(snapshot({ handedBack: new Set(["a", "b"]) }), snapshot({ handedBack: new Set(["b", "a"]) }))).toBe(true);
    expect(sameSnapshot(snapshot(), snapshot({ settings: { ...DEFAULT_MODULE_SETTINGS, math: false } }))).toBe(false);
    expect(sameSnapshot(snapshot(), snapshot({ coOwned: new Set(["c"]) }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/reply-decision.test.ts --bail=1`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`createOwnershipDetector` moves the text cache from `index.client.tsx` lines 23 to 73 unchanged in
behavior: at most 256 entries and 512 KiB of cached text, texts over 512 KiB not cached. The
object-keyed `WeakMap` is dropped, because transformer inputs are fresh clones. `isOwned` returns
false over `MAX_DOCUMENT`, otherwise `shouldTakeOver(detect(text), settings)`. `sameSnapshot`
compares every `ModuleSettings` field and both sets by size and membership. The transformer's
`transform` returns `{ items: [{ type: "plugin", kind: MESSAGE_KIND, version: MESSAGE_VERSION, data }], nativeTurnFooter: true }`
for a role, with `data` holding `text`, `messageId` when present, `role` and `phase`, and returns
`undefined` otherwise. `nativeTurnFooter` is getpaseo/paseo#9253's opt-in: a host with it keeps
Paseo's footer under the row, and released hosts drop the field. Put a one-line comment naming the
PR next to it. `index.client.tsx` is not changed in this task.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/reply-decision.test.ts --bail=1 && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/message.ts client/reply-actions/ownership.ts client/reply-actions/decision.ts tests/reply-decision.test.ts
git commit -m "feat: decide reply ownership from an immutable snapshot"
```

### Task 5: Turn index store

**Files:**
- Create: `client/reply-actions/store.ts`
- Test: `tests/reply-store.test.ts`

**Interfaces:**
- Consumes: `TimelineEntryLike`, `groupTurns` (Task 2); `computeCoOwnership`,
  `MIN_CO_OWNED_TEXT_LENGTH`, `turnRef` (Task 3); `ReplyKey`, `isTextKey` (Task 2).
- Produces:
  - `const READ_PAGE_SIZE = 200`, `READ_PAGE_CAP = 5`, `MIN_READ_INTERVAL_MS = 2_000`, `EVICT_AFTER_MS = 60_000`
  - `interface TimelinePageLike { readonly epoch: string; readonly entries: readonly TimelineEntryLike[]; readonly startCursor: unknown; readonly hasOlder: boolean }`
  - `type TimelineReadOptions = { direction: "tail" } | { direction: "before"; cursor: unknown }`
  - `type TimelineReader = (agentId: string, options: TimelineReadOptions) => Promise<TimelinePageLike>`
  - `type AgentStatus = "initializing" | "idle" | "running" | "error" | "closed"`
  - `interface TurnView { readonly turnId: string; readonly isFinalReply: boolean; readonly complete: boolean; readonly unprotected: boolean; readonly copyText: string; readonly endedAt: string }`
  - `createReplyActionsStore(options: { read: TimelineReader; isOwned(text: string): boolean }): ReplyActionsStore`
  - `ReplyActionsStore` methods in this task: `rowMounted(agentId): () => void`,
    `requestKey(agentId, key, options: { streaming: boolean }): void`,
    `noteAgentStatus(agentId, status: AgentStatus): void`,
    `turnView(agentId, key): TurnView | null`,
    `decisionInputs(): { handedBack: ReadonlySet<ReplyKey>; coOwned: ReadonlySet<ReplyKey> }`,
    `ownershipChanged(): void`, `settled(): Promise<void>`,
    `subscribe(listener: () => void): () => void`, `getVersion(): number`, `dispose(): void`.
    Task 6 adds the hand-back methods.

- [ ] **Step 1: Add shared fixtures to the test helpers**

Add to `tests/helpers/timeline.ts`, with the import at the top of the file, so later test files
import fixtures from a helper and never from another test file:

```ts
import type { TimelinePageLike } from "../../client/reply-actions/store.js";

export const agentic = [
  userEntry(1, "t1"),
  replyEntry(2, "Checking first.", { messageId: "c", turnId: "t1" }),
  toolEntry(3, { turnId: "t1" }),
  replyEntry(4, "$E=mc^2$", { messageId: "f", turnId: "t1" }),
];
export const page = (
  entries: readonly TimelineEntryLike[],
  over: Partial<TimelinePageLike> = {},
): TimelinePageLike => ({
  epoch: "e1",
  entries,
  startCursor: { before: entries[0]?.seqStart ?? 0 },
  hasOlder: false,
  ...over,
});
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/reply-store.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReplyActionsStore,
  EVICT_AFTER_MS,
  MIN_READ_INTERVAL_MS,
  READ_PAGE_CAP,
  type TimelinePageLike,
  type TimelineReadOptions,
} from "../client/reply-actions/store.js";
import { agentic, page, replyEntry, userEntry } from "./helpers/timeline.js";

function harness(
  respond: (agentId: string, options: TimelineReadOptions) => TimelinePageLike | Promise<TimelinePageLike>,
  isOwned: (text: string) => boolean = (text) => text.includes("$"),
) {
  const calls: Array<{ agentId: string; options: TimelineReadOptions }> = [];
  const store = createReplyActionsStore({
    read: async (agentId, options) => {
      calls.push({ agentId, options });
      return respond(agentId, options);
    },
    isOwned: (text) => isOwned(text),
  });
  return { store, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("turn index", () => {
  it("reads the tail once for an unknown key and indexes its turn", async () => {
    const { store, calls } = harness(() => page(agentic));
    store.rowMounted("a1");
    store.requestKey("a1", "id:f", { streaming: false });
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    expect(calls).toEqual([{ agentId: "a1", options: { direction: "tail" } }]);
    expect(store.turnView("a1", "id:f")).toEqual({
      turnId: "t1",
      isFinalReply: true,
      complete: true,
      unprotected: false,
      copyText: "Checking first.\n\n$E=mc^2$",
      endedAt: agentic[3]!.timestamp,
    });
    expect(store.decisionInputs().coOwned).toEqual(new Set(["id:c"]));
  });

  it("pages older history until the key appears, up to the cap", async () => {
    const { store, calls } = harness((_agent, options) =>
      page(options.direction === "tail" ? [userEntry(100)] : [userEntry(1)], { hasOlder: true }),
    );
    store.requestKey("a1", "id:missing", { streaming: false });
    await store.settled();
    expect(calls).toHaveLength(READ_PAGE_CAP);
    expect(calls.slice(1).every((call) => call.options.direction === "before")).toBe(true);
    expect(store.turnView("a1", "id:missing")).toBeNull();
  });

  it("does not read for a streaming reply keyed by text", async () => {
    const { store, calls } = harness(() => page(agentic));
    store.requestKey("a1", "text:Partial $x", { streaming: true });
    await store.settled();
    expect(calls).toHaveLength(0);
    store.requestKey("a1", "id:f", { streaming: true });
    await store.settled();
    expect(calls).toHaveLength(1);
  });

  it("joins an in-flight read and spaces later reads per agent", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { store, calls } = harness(async () => {
      await gate;
      return page(agentic);
    });
    store.requestKey("a1", "id:f", { streaming: false });
    store.requestKey("a1", "id:c", { streaming: false });
    release();
    await store.settled();
    expect(calls).toHaveLength(1);
    store.requestKey("a1", "id:new", { streaming: false });
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS - 1);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await store.settled();
    expect(calls).toHaveLength(2);
  });

  it("refreshes the tail when a running turn completes while rows are mounted", async () => {
    const { store, calls } = harness(() => page(agentic));
    const unmount = store.rowMounted("a1");
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    store.noteAgentStatus("a1", "running");
    expect(store.turnView("a1", "id:f")?.complete).toBe(false);
    store.noteAgentStatus("a1", "idle");
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(calls).toHaveLength(2);
    unmount();
    store.noteAgentStatus("a1", "running");
    store.noteAgentStatus("a1", "idle");
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(calls).toHaveLength(2);
  });

  it("rebuilds the index when the timeline epoch changes", async () => {
    let epoch = "e1";
    const replaced = [userEntry(1, "t9"), replyEntry(2, "Only now", { messageId: "n", turnId: "t9" })];
    const { store } = harness(() => (epoch === "e1" ? page(agentic) : page(replaced, { epoch: "e2" })));
    store.rowMounted("a1");
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    epoch = "e2";
    store.requestKey("a1", "id:n", { streaming: false });
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS);
    await store.settled();
    expect(store.turnView("a1", "id:f")).toBeNull();
    expect(store.turnView("a1", "id:n")?.turnId).toBe("t9");
    expect(store.decisionInputs().coOwned.size).toBe(0);
  });

  it("keeps today's rendering when reads fail and never re-reads the same key", async () => {
    const { store, calls } = harness(() => {
      throw new Error("unsupported");
    });
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    store.requestKey("a1", "id:f", { streaming: false });
    await vi.advanceTimersByTimeAsync(MIN_READ_INTERVAL_MS * 3);
    await store.settled();
    expect(calls).toHaveLength(1);
    expect(store.turnView("a1", "id:f")).toBeNull();
  });

  it("evicts an agent's index after its last row unmounts", async () => {
    const { store } = harness(() => page(agentic));
    const unmount = store.rowMounted("a1");
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    unmount();
    await vi.advanceTimersByTimeAsync(EVICT_AFTER_MS - 1);
    store.rowMounted("a1")();
    await vi.advanceTimersByTimeAsync(EVICT_AFTER_MS - 1);
    expect(store.turnView("a1", "id:f")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(store.turnView("a1", "id:f")).toBeNull();
  });

  it("leaves empty replies out of the Copy text", async () => {
    const entries = [
      userEntry(1, "t1"),
      replyEntry(2, "  ", { messageId: "w", turnId: "t1" }),
      replyEntry(3, "$x$", { messageId: "f", turnId: "t1" }),
    ];
    const { store } = harness(() => page(entries));
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    expect(store.turnView("a1", "id:f")?.copyText).toBe("$x$");
    expect(store.turnView("a1", "id:f")?.unprotected).toBe(true);
  });

  it("recomputes co-ownership when ownership rules change and notifies once per change", async () => {
    let owns = true;
    const { store } = harness(() => page(agentic), (text) => owns && text.includes("$"));
    let notified = 0;
    store.subscribe(() => {
      notified++;
    });
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    const version = store.getVersion();
    owns = false;
    store.ownershipChanged();
    expect(store.decisionInputs().coOwned.size).toBe(0);
    expect(store.getVersion()).toBe(version + 1);
    expect(notified).toBe(2);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run tests/reply-store.test.ts --bail=1`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `createReplyActionsStore` in `client/reply-actions/store.ts`**

Per agent, keep: entries sorted by `seqStart`, the index `epoch`, grouped turns, keys already
requested, pending keys, mounted row count, last status, the start time of the last read
operation, an eviction timer and the in-flight operation. Behavior:

- `requestKey` ignores a key when the key is indexed, already requested for that agent, or a text
  key with `streaming: true`. Otherwise it records the key as requested, adds it to pending, and
  starts or joins the agent's read operation.
- A read operation waits until `MIN_READ_INTERVAL_MS` after the agent's previous operation began,
  then reads `{ direction: "tail" }`. A tail with a different `epoch` replaces the entries; one with
  the same epoch merges by `seqStart`, page entries replacing stored ones. While a pending key is
  missing, `hasOlder` is true and fewer than `READ_PAGE_CAP` pages were read, it reads
  `{ direction: "before", cursor: page.startCursor }` and merges. It then regroups with
  `groupTurns`, recomputes co-ownership over all agents with `computeCoOwnership`, clears pending,
  bumps the version and notifies. On a rejected read it clears pending and leaves the index and
  the requested keys as they were.
- `noteAgentStatus` records the status. A change from `running` or `initializing` to any other
  status, while the agent has mounted rows, schedules a tail read under the same interval rule.
- `turnView` finds the turn holding the key. `complete` is false only for the agent's latest
  indexed turn while its status is `running` or `initializing`; an unknown status counts as idle.
  `copyText` joins the turn's replies with non-empty trimmed text by a blank line, and
  `unprotected` reads `unprotectedTurns`.
- `rowMounted` counts rows. When the count reaches zero, a timer of `EVICT_AFTER_MS` drops the
  agent's state and recomputes co-ownership. A new mount cancels the timer.
- `ownershipChanged` recomputes co-ownership and notifies when the result differs.
- `settled` resolves once no operation is in flight or waiting.
- `dispose` cancels all timers, clears all state and drops listeners.
- `decisionInputs` returns an empty `handedBack` set until Task 6.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/reply-store.test.ts --bail=1 && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/reply-actions/store.ts tests/reply-store.test.ts tests/helpers/timeline.ts
git commit -m "feat: index agent turns from the daemon timeline"
```

### Task 6: Hand-back in the store

**Files:**
- Modify: `client/reply-actions/store.ts`
- Test: `tests/reply-store.test.ts`

**Interfaces:**
- Produces, added to `ReplyActionsStore`:
  - `showOriginal(agentId: string, key: ReplyKey): Promise<boolean>`
  - `restore(agentId: string): void`
  - `originalTurnCount(agentId: string): number`
  - `agentsWithOriginalView(): readonly string[]`
  - `setEnabled(enabled: boolean): void`

- [ ] **Step 1: Write the failing tests**

Append to `tests/reply-store.test.ts`:

```ts
describe("original view", () => {
  it("reads the tail before handing back and covers the turn's real final reply", async () => {
    let entries = [...agentic];
    const { store, calls } = harness(() => page(entries));
    store.rowMounted("a1");
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    entries = [...agentic, replyEntry(5, "$b$", { messageId: "g", turnId: "t1" })];
    expect(await store.showOriginal("a1", "id:f")).toBe(true);
    expect(calls).toHaveLength(2);
    expect(store.decisionInputs().handedBack).toEqual(new Set(["id:c", "id:f", "id:g"]));
    expect(store.decisionInputs().coOwned.has("id:c")).toBe(false);
    expect(store.originalTurnCount("a1")).toBe(1);
    expect(store.agentsWithOriginalView()).toEqual(["a1"]);
  });

  it("restores an agent's turns", async () => {
    const { store } = harness(() => page(agentic));
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    await store.showOriginal("a1", "id:f");
    store.restore("a1");
    expect(store.decisionInputs().handedBack.size).toBe(0);
    expect(store.decisionInputs().coOwned).toEqual(new Set(["id:c"]));
    expect(store.originalTurnCount("a1")).toBe(0);
  });

  it("returns false when the key is in no indexed turn", async () => {
    const { store } = harness(() => page(agentic));
    expect(await store.showOriginal("a1", "id:nowhere")).toBe(false);
    expect(store.originalTurnCount("a1")).toBe(0);
  });

  it("turning the feature off restores every turn and blanks decisions", async () => {
    const { store, calls } = harness(() => page(agentic));
    store.requestKey("a1", "id:f", { streaming: false });
    await store.settled();
    await store.showOriginal("a1", "id:f");
    store.setEnabled(false);
    expect(store.decisionInputs()).toEqual({ handedBack: new Set(), coOwned: new Set() });
    expect(store.originalTurnCount("a1")).toBe(0);
    expect(store.turnView("a1", "id:f")).toBeNull();
    store.requestKey("a1", "id:other", { streaming: false });
    await store.settled();
    expect(calls).toHaveLength(2);
    store.setEnabled(true);
    expect(store.decisionInputs().coOwned).toEqual(new Set(["id:c"]));
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/reply-store.test.ts --bail=1`
Expected: FAIL, `showOriginal` is not a function.

- [ ] **Step 3: Implement**

`showOriginal` reads the tail right away, outside the interval rule, merges it and recomputes. It
then finds the turn holding the key, records under the agent that turn's owned keys plus the keys
co-owned in it just before recording, recomputes, notifies, and resolves `true`. With no such turn
it resolves `false`. `decisionInputs().handedBack` is the union of all recorded keys. Recorded turns
are passed to `computeCoOwnership` as `handedBackTurns`. `restore` deletes the agent's records,
recomputes and notifies. `setEnabled(false)` deletes every record and makes `decisionInputs` return
two empty sets, `turnView` return `null` and `requestKey` do nothing. `setEnabled(true)` restores
normal answers from the kept indexes. Both notify.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/reply-store.test.ts --bail=1 && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/reply-actions/store.ts tests/reply-store.test.ts
git commit -m "feat: hand turns back to Paseo and restore them"
```

### Task 7: Runtime, reader, pills and plugin wiring

**Files:**
- Create: `client/reply-actions/reader.ts`, `client/reply-actions/pills.ts`, `client/reply-actions/runtime.ts`
- Modify: `index.client.tsx` (replace the transformer block, lines 22 to 87)
- Modify: `scripts/smoke.mjs` (renderer data expectation near line 296)
- Test: `tests/reply-runtime.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4 to 6.
- Produces:
  - `createTimelineReader(paseo: PluginClientContext["paseo"]): TimelineReader`, calling
    `paseo.agents.ref(agentId).timeline.refetch({ ...options, limit: READ_PAGE_SIZE, projection: "projected" })`,
    throwing when the payload's `error` is non-null, and mapping `epoch`, `entries` (`item`,
    `turnId`, `timestamp`, `seqStart`), `startCursor` and `hasOlder`
  - `interface OriginalViewPills { sync(agentId: string, workspaceId: string | null, count: number, onRestore: () => void): void; dispose(): void }`
  - `createOriginalViewPills(client: { addComposerPill: PluginClientContext["addComposerPill"] }): OriginalViewPills`
  - `interface ReplyActionsRuntime { readonly store: ReplyActionsStore; showOriginal(agentId: string, key: ReplyKey, workspaceId: string | null): Promise<boolean>; restore(agentId: string): void; noteHostNativeFooter(): void; readonly hostNativeFooter: boolean; dispose(): void }`
  - `createReplyActionsRuntime(options: { client: Pick<PluginClientContext, "addTimelineTransformer" | "addComposerPill">; read: TimelineReader; ownership: OwnershipDetector; settings: { readonly current: ModuleSettings; subscribe(listener: () => void): () => void } }): ReplyActionsRuntime`
  - `setReplyActionsRuntime(runtime: ReplyActionsRuntime | null): void` and
    `getReplyActionsRuntime(): ReplyActionsRuntime | null`, a module-level holder. The bundle is
    evaluated once per host, so this holder is per host.

- [ ] **Step 1: Write the failing tests**

The test file defines `fakeClient()`. Its `addTimelineTransformer` pushes the contribution onto
`transformers`, logs `"add"`, and returns a cleanup that removes it and logs `"remove"`. Its
`addComposerPill` stores `{ label: button.label }` in a `pills` map under the contribution's `id`,
and returns `update(patch)`, which copies `patch.label`, and `remove()`, which deletes the entry.

```ts
// tests/reply-runtime.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSFORMER_ID } from "../client/reply-actions/decision.js";
import { createOwnershipDetector } from "../client/reply-actions/ownership.js";
import { createTimelineReader } from "../client/reply-actions/reader.js";
import { createReplyActionsRuntime } from "../client/reply-actions/runtime.js";
import { moduleState } from "../client/module-state.js";
import { detectExtensions, shouldTakeOver } from "../shared/markdown/extensions.js";
import { DEFAULT_MODULE_SETTINGS } from "../shared/settings.js";
import { agentic, page } from "./helpers/timeline.js";

const ownership = createOwnershipDetector({ detectExtensions, shouldTakeOver });
const reply = (text: string, messageId: string) => ({
  item: { type: "assistant_message", text, messageId },
  phase: "complete",
});
let reads = 0;
function start() {
  const client = fakeClient();
  const runtime = createReplyActionsRuntime({
    client: client as never,
    read: async () => {
      reads += 1;
      return page(agentic);
    },
    ownership,
    settings: moduleState,
  });
  return { client, runtime };
}

beforeEach(() => {
  vi.useFakeTimers();
  moduleState.reset();
  reads = 0;
});
afterEach(() => {
  moduleState.reset();
  vi.useRealTimers();
});

describe("reply actions runtime", () => {
  it("registers one transformer during setup", () => {
    const { client } = start();
    expect(client.transformers.map((transformer) => transformer.id)).toEqual([TRANSFORMER_ID]);
    expect(client.log).toEqual(["add"]);
  });

  it("re-registers once per burst of decision changes", async () => {
    const { client, runtime } = start();
    runtime.store.rowMounted("a1");
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    runtime.store.ownershipChanged();
    await vi.advanceTimersByTimeAsync(20);
    expect(client.log).toEqual(["add", "remove", "add"]);
    const [transformer] = client.transformers;
    expect(transformer!.transform(reply("Checking first.", "c"))?.items[0].data.role).toBe("co-owned");
  });

  it("skips re-registration when nothing changed", async () => {
    const { client } = start();
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS });
    await vi.advanceTimersByTimeAsync(20);
    expect(client.log).toEqual(["add"]);
  });

  it("follows module settings", async () => {
    const { client } = start();
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS, math: false });
    await vi.advanceTimersByTimeAsync(20);
    expect(client.transformers[0]!.transform(reply("$E=mc^2$", "f"))).toBeUndefined();
  });

  it("adds a pill on Show original and removes it on restore", async () => {
    const { client, runtime } = start();
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    expect(await runtime.showOriginal("a1", "id:f", "w1")).toBe(true);
    expect(client.pills.get("original-view-a1")?.label).toBe("Original view · 1 turn");
    runtime.restore("a1");
    expect(client.pills.size).toBe(0);
  });

  it("turning the setting off removes pills and every hand-back", async () => {
    const { client, runtime } = start();
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    await runtime.showOriginal("a1", "id:f", "w1");
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS, forkSafeReplies: false });
    await vi.advanceTimersByTimeAsync(20);
    expect(client.pills.size).toBe(0);
    expect(client.transformers[0]!.transform(reply("$E=mc^2$", "f"))?.items[0].data.role).toBe("owned");
  });

  it("removes the transformer and pills on dispose", async () => {
    const { client, runtime } = start();
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    await runtime.showOriginal("a1", "id:f", "w1");
    runtime.dispose();
    expect(client.transformers).toHaveLength(0);
    expect(client.pills.size).toBe(0);
  });

  it("a host that keeps native footers disables hand-back, co-ownership and reads", async () => {
    const { client, runtime } = start();
    runtime.store.rowMounted("a1");
    runtime.store.requestKey("a1", "id:f", { streaming: false });
    await runtime.store.settled();
    await runtime.showOriginal("a1", "id:f", "w1");
    expect(client.pills.size).toBe(1);
    runtime.noteHostNativeFooter();
    runtime.noteHostNativeFooter();
    await vi.advanceTimersByTimeAsync(20);
    expect(runtime.hostNativeFooter).toBe(true);
    expect(client.log).toEqual(["add", "remove", "add"]);
    expect(client.pills.size).toBe(0);
    expect(runtime.store.decisionInputs()).toEqual({ handedBack: new Set(), coOwned: new Set() });
    const [transformer] = client.transformers;
    expect(transformer!.transform(reply("$E=mc^2$", "f"))?.items[0].data.role).toBe("owned");
    expect(transformer!.transform(reply("Checking first.", "c"))).toBeUndefined();
    const readsBefore = reads;
    runtime.store.requestKey("a1", "id:g", { streaming: false });
    await runtime.store.settled();
    expect(reads).toBe(readsBefore);
    moduleState.set({ ...DEFAULT_MODULE_SETTINGS, math: false });
    await vi.advanceTimersByTimeAsync(20);
    expect(client.transformers[0]!.transform(reply("$E=mc^2$", "f"))).toBeUndefined();
    expect(runtime.store.decisionInputs()).toEqual({ handedBack: new Set(), coOwned: new Set() });
  });
});

describe("createTimelineReader", () => {
  it("reads projected pages and rejects payload errors", async () => {
    const seen: unknown[] = [];
    const payload = { epoch: "e1", entries: agentic, startCursor: null, hasOlder: false, error: null };
    const paseo = {
      agents: {
        ref: () => ({
          timeline: {
            refetch: async (options: unknown) => {
              seen.push(options);
              return payload;
            },
          },
        }),
      },
    };
    const read = createTimelineReader(paseo as never);
    expect((await read("a1", { direction: "tail" })).entries).toHaveLength(4);
    expect(seen).toEqual([{ direction: "tail", limit: 200, projection: "projected" }]);
    payload.error = "boom" as never;
    await expect(read("a1", { direction: "tail" })).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/reply-runtime.test.ts --bail=1`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the runtime, reader and pills**

`createReplyActionsRuntime` builds the store with `isOwned: (text) => ownership.isOwned(text, settings.current)`
and calls `store.setEnabled(settings.current.forkSafeReplies && !hostNativeFooter)`, where
`hostNativeFooter` is a runtime flag that starts `false`. It registers
`createReplyTransformer(snapshot, ownership)` once during setup, where the snapshot is
`{ settings: settings.current, ...store.decisionInputs() }`. On a store change or a settings change
it computes the next snapshot. When `sameSnapshot` says it differs and no update is scheduled, it
schedules one with `setTimeout(..., 16)`. The scheduled update recomputes the snapshot, and if it
still differs, calls the old registration's cleanup and then registers the new transformer. A
settings change first calls `store.setEnabled(...)`, with the same expression, and
`store.ownershipChanged()`. `noteHostNativeFooter` sets the flag; its first call also calls
`store.setEnabled(false)` and `store.ownershipChanged()` and schedules the snapshot update the way
a settings change does, and later calls do nothing. The flag is per host, like the runtime, and
`dispose` resets it.

`showOriginal` awaits `store.showOriginal`, then calls
`pills.sync(agentId, workspaceId, store.originalTurnCount(agentId), () => this.restore(agentId))`.
`restore` calls `store.restore` and syncs the pill with count `0`. On every store change, the
runtime syncs a count of `0` for each agent with a pill that `store.agentsWithOriginalView()` no
longer lists. `dispose` cancels the scheduled update, removes the transformer and the pills, and
disposes the store.

`createOriginalViewPills` keeps one registration per agent, with id `original-view-<agentId>`.
`sync` with a positive count and a known `workspaceId` adds the pill or updates its label. A count
of `0` removes it. A `null` workspace id adds nothing, and reload restores in that case. The button
is `{ title: "Restore formula rendering", label, icon: "Sigma", behavior: { kind: "action", onPress: onRestore } }`,
with label `Original view · 1 turn` or `Original view · <n> turns`.

- [ ] **Step 4: Wire `index.client.tsx`**

Keep the lazy `require` style and the settings read. Delete the transformer block and the
`objects` and `sources` caches. Then:

```ts
const ownership = createOwnershipDetector({ detectExtensions, shouldTakeOver });
const runtime = createReplyActionsRuntime({
  client,
  ownership,
  settings: moduleState,
  // Read `client.paseo` per call: setup must not touch it.
  read: (agentId, options) => createTimelineReader(client.paseo)(agentId, options),
});
setReplyActionsRuntime(runtime);
```

The returned cleanup calls `runtime.dispose()`, `setReplyActionsRuntime(null)` and
`ownership.clear()` before the existing resets.

- [ ] **Step 5: Update the smoke expectation**

In `scripts/smoke.mjs`, change the renderer data assertion in the inline-math case to
`{ text: assembled, messageId: "synthetic-message", role: "owned", phase: "complete" }`. Paseo
0.8.0 always reports `complete` for assistant replies, and its `parseTransformResult` reads only
`items`, so the result's `nativeTurnFooter` field never reaches row data.

- [ ] **Step 6: Run the checks**

Run: `npx vitest run tests/reply-runtime.test.ts --bail=1 && npm run build && npm run typecheck && npm run lint && npm run format:check`
Expected: PASS and exit 0.

Run: `npm run paseo-source && npm run smoke`
Expected: the smoke report completes with no assertion failure, and the smoke still registers
exactly one transformer.

- [ ] **Step 7: Commit**

```bash
git add client/reply-actions/reader.ts client/reply-actions/pills.ts client/reply-actions/runtime.ts index.client.tsx scripts/smoke.mjs tests/reply-runtime.test.ts
git commit -m "feat: wire reply actions into the plugin entry"
```

### Task 8: Reply footer in the renderer

**Files:**
- Create: `client/reply-actions/footer-state.ts`, `client/reply-actions/footer.tsx`
- Modify: `client/message.tsx` (`MessageView`)
- Test: `tests/reply-footer-state.test.ts`

**Interfaces:**
- Consumes: `getReplyActionsRuntime` (Task 7); `TurnView` (Task 5); `ReplyRole`, `replyKey`.
- Produces:
  - `type FooterMode = "hidden" | "footer" | "footer-with-warning"`
  - `footerMode(input: { enabled: boolean; role: ReplyRole; view: TurnView | null; hostNativeFooter?: boolean }): FooterMode`
  - `formatEndTime(iso: string, now: Date): string`, giving `HH:MM` on the same local day and
    `YYYY-MM-DD HH:MM` otherwise, 24-hour and zero-padded
  - `FOOTER_COPY`, holding the exact strings below
  - `useReplyRow(agentId: string, key: ReplyKey, phase: "streaming" | "complete", hostNativeFooter: boolean): void`
  - `ReplyFooter(props: { agentId: string; replyKey: ReplyKey; theme: PluginTheme; compact: boolean; hostNativeFooter: boolean }): JSX.Element | null`

`FOOTER_COPY` strings:

| Key | Text |
| --- | --- |
| `copyLabel` | `Copy turn` |
| `copied` | `Copied turn` |
| `showOriginal` | `Show original` |
| `warning` | `Paseo's Fork below stops before this answer. Use Show original to fork from here.` |
| `firstUse` | `Paseo now draws this turn. If its Fork does not appear, another plugin is drawing replies. In Better Paseo, turn off Plugin markdown for replies.` |

- [ ] **Step 1: Write the failing tests**

```ts
// tests/reply-footer-state.test.ts
import { describe, expect, it } from "vitest";
import { footerMode, formatEndTime } from "../client/reply-actions/footer-state.js";
import type { TurnView } from "../client/reply-actions/store.js";

const view = (over: Partial<TurnView> = {}): TurnView => ({
  turnId: "t1",
  isFinalReply: true,
  complete: true,
  unprotected: false,
  copyText: "x",
  endedAt: "2026-11-08T01:02:03.000Z",
  ...over,
});

describe("footerMode", () => {
  it("shows the footer only under the final owned reply of a complete turn", () => {
    expect(footerMode({ enabled: true, role: "owned", view: view() })).toBe("footer");
    expect(footerMode({ enabled: true, role: "owned", view: view({ unprotected: true }) })).toBe("footer-with-warning");
    expect(footerMode({ enabled: false, role: "owned", view: view() })).toBe("hidden");
    expect(footerMode({ enabled: true, role: "co-owned", view: view() })).toBe("hidden");
    expect(footerMode({ enabled: true, role: "owned", view: null })).toBe("hidden");
    expect(footerMode({ enabled: true, role: "owned", view: view({ isFinalReply: false }) })).toBe("hidden");
    expect(footerMode({ enabled: true, role: "owned", view: view({ complete: false }) })).toBe("hidden");
    expect(footerMode({ enabled: true, role: "owned", view: view(), hostNativeFooter: true })).toBe("hidden");
  });
});

describe("formatEndTime", () => {
  it("shows the time today and the date otherwise", () => {
    expect(formatEndTime(new Date(2026, 10, 8, 9, 5).toISOString(), new Date(2026, 10, 8, 23, 0))).toBe("09:05");
    expect(formatEndTime(new Date(2026, 10, 7, 23, 59).toISOString(), new Date(2026, 10, 8, 9, 0))).toBe("2026-11-07 23:59");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/reply-footer-state.test.ts --bail=1`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `footer-state.ts`**

Pure functions and constants only, with no React or React Native imports, so the test runs in Node.

- [ ] **Step 4: Implement `footer.tsx` and change `MessageView`**

`useReplyRow` does nothing without a runtime. With `hostNativeFooter` true, its only effect calls
`runtime.noteHostNativeFooter()`, so the row never counts as mounted and never requests a read.
Otherwise:
- an effect calls `store.rowMounted(agentId)` and returns its cleanup;
- an effect calls `store.requestKey(agentId, key, { streaming: phase === "streaming" })`;
- `useAgent(agentId, (agent) => agent.status)` feeds an effect that calls `store.noteAgentStatus`,
  skipping a `null` status.

`ReplyFooter` reads `useSyncExternalStore(store.subscribe, store.getVersion)` and computes
`store.turnView(agentId, replyKey)` in a `useMemo` keyed on that version. The snapshot must be the
version number: a fresh `TurnView` object would re-render forever. It reads `enabled` from
`useSettings(moduleSettings)`, falling back to `moduleState.current.forkSafeReplies`, and
`useAgent(agentId, (agent) => agent.workspaceId)` for the pill, and passes `hostNativeFooter` to
`footerMode`. It renders nothing in mode `hidden`. Otherwise it renders one row in the style of `client/action-bar.tsx`: a `Copy` icon
button labelled `FOOTER_COPY.copyLabel` that calls `copyText(view.copyText)` and then
`toast.show(FOOTER_COPY.copied)`; a `Show original` button that awaits
`runtime.showOriginal(agentId, replyKey, workspaceId)` and, the first time per session, shows
`FOOTER_COPY.firstUse`; and `formatEndTime(view.endedAt, new Date())` in muted text. In mode
`footer-with-warning` it adds `FOOTER_COPY.warning` below in muted text.

In `MessageView`, derive `role = item.data.role ?? "owned"`,
`key = replyKey({ text: item.data.text, messageId: item.data.messageId })`,
`phase = item.data.phase ?? "complete"` and
`hostNativeFooter = (props as { nativeTurnFooter?: boolean }).nativeTurnFooter === true`, with a
one-line comment naming getpaseo/paseo#9253, since SDK 0.13.0's props type has no such field. Call
`useReplyRow(agentId, key, phase, hostNativeFooter)` for both roles, because co-owned rows must
request their own index read to catch late duplicates. Return a `View` that holds the existing
`MemoizedMessage` and, for owned rows only, `ReplyFooter` with `hostNativeFooter`. Keep the footer
outside `MemoizedMessage`, so store updates do not re-render the formulas.

- [ ] **Step 5: Run the checks**

Run: `npx vitest run tests/reply-footer-state.test.ts --bail=1 && npm run build && npm run typecheck && npm run lint && npm run format:check && npm run smoke`
Expected: PASS and exit 0. When `HERMES_BIN` is available, also run `npm run smoke:hermes`.

- [ ] **Step 6: Commit**

```bash
git add client/reply-actions/footer-state.ts client/reply-actions/footer.tsx client/message.tsx tests/reply-footer-state.test.ts
git commit -m "feat: show the reply footer with Show original"
```

### Task 9: Host pipeline check against pinned Paseo hosts

**Files:**
- Create: `scripts/lib/paseo-checkout.mjs`, `scripts/host-source.mjs`, `scripts/qa/reply-actions-probe.ts`, `scripts/qa/reply-actions.mjs`
- Modify: `scripts/paseo-source.mjs`, `package.json`, `.gitignore`, `biome.json`, `.github/workflows/ci.yml`, `docs/development.md`

**Interfaces:**
- Produces: `ensurePaseoCheckout({ revision, directory, paths, label, ref? }): void` in
  `scripts/lib/paseo-checkout.mjs`; npm scripts `host-source` and `qa:reply-actions`.

- [ ] **Step 1: Extract the checkout helper**

Move the body of `scripts/paseo-source.mjs` into `ensurePaseoCheckout`, keeping its checks: pinned
revision reached and no local modifications. `scripts/paseo-source.mjs` keeps its exported
`revision` and `source` and calls the helper.

Run: `npm run paseo-source`
Expected: prints `Official Paseo sources ready at ... (b8e24677e12b, tag v0.8.0)`.

- [ ] **Step 2: Add `scripts/host-source.mjs`**

Call the helper once per pinned host, with paths `packages/app/src` and `packages/protocol/src`:

| Label | Revision | Directory | Fetch ref |
| --- | --- | --- | --- |
| `v0.15.3` | `d91ae138cb931447635e94296023414a58bedcc5` | `.paseo-host-0.15.3` | the revision |
| `v0.16.0` | `c54bc39e7997c03a07402c09df2e825889432557` | `.paseo-host-0.16.0` | the revision |
| `pr-9253` | `ffa02c5d81970c6ffbda9d3802287ed9f06648d6` | `.paseo-host-pr-9253` | `refs/pull/9253/head` |

`ref` is what the helper passes to `git fetch --depth 1 origin`; it defaults to the revision. The
checkout must still reach the pinned revision, so a force-pushed PR fails the pin loudly instead of
drifting. Add the three directories to `.gitignore` and their `!`-prefixed names to biome's
`files.includes`. Add the npm scripts `"host-source": "node scripts/host-source.mjs"` and
`"qa:reply-actions": "node scripts/qa/reply-actions.mjs"`.

Run: `npm run host-source`
Expected: prints one ready line per host, with `d91ae138cb93`, `c54bc39e7997` and `ffa02c5d8197`.

- [ ] **Step 3: Write the probe**

`scripts/qa/reply-actions-probe.ts` uses the real plugin modules: `createReplyActionsStore` with a
reader that returns each case's timeline entries, `createOwnershipDetector` over
`shared/markdown/extensions.ts`, and `createReplyTransformer`. It feeds Paseo's own
`transformTimelineItem`, `projectPluginTimelineItems`, `layoutStream`, `createStreamStrategy` and
`resolveAssistantTurnForkBoundary` from `<host>/packages/app/src`, where `<host>` is the pinned
checkout named by the `PASEO_HOST` environment variable. Build stream items
and timeline entries from one case description, so their ids, turn ids and texts match. For each
footer host in `layout.history[].completedFooter` and `layout.auxiliaryTurnFooter`, record the
anchored item id, the fork boundary from `resolveAssistantTurnForkBoundary({ items, startIndex, supportsTimelineCursor: true })`,
and the Copy text from `strategy.collectAssistantResponseContent(items, startIndex)`. Call
`layoutStream({ strategy, isTurnActive: false, history: items, liveHead: [], timingByItemId })`
with a timing entry `{ durationMs: 1000, completedAt }` per item, and create the strategy with:

```ts
createStreamStrategy({
  render: () => null, orderTailReverse: false, orderHeadReverse: false,
  assistantTurnTraversalStep: -1, edgeSlot: "footer", historyLiveBoundaryEdge: "last",
  liveHeadHistoryBoundaryEdge: "first", frameChildOrder: "content-then-footer",
  flatListInverted: false, overlayScrollbarInverted: false,
  bottomAnchorTransportBehavior: { verificationDelayFrames: 0, verificationRetryMode: "recheck" },
  disableParentScrollOnInlineDetailsExpansion: false, anchorBottomOnContentSizeChange: false,
  animateManualScrollToBottom: false, useVirtualizedList: false,
  isNearBottom: () => true, getBottomOffset: () => 0,
} as never);
```

Stream items take the shape `{ kind: "assistant_message", id, turnId, messageId, timelineCursor: { epoch: "probe", seq }, timestamp, text }`,
with `user_message` and agent `tool_call` items shaped the same way, the tool call carrying
`payload: { source: "agent", data: { callId, name: "exec_command", status: "completed", detail: {}, error: null } }`.
For "after" cases, call `store.showOriginal` on the final reply first. Better Paseo is a second installed plugin, id `better-paseo`, whose transformer
claims every non-empty reply. Assert, and write `.smoke/reply-actions/report.json`:

| Case | Rows of the turn | Paseo footer anchored to | Copy | Unprotected |
| --- | --- | --- | --- | --- |
| single, before | user, formula `f` | none | none | no |
| single, after | same | `f` | the formula | no |
| short commentary, before | user, text-keyed "Let me check the tests.", tool, formula `f` | the commentary | the commentary | yes |
| short commentary, after | same | `f` | whole turn | no |
| id commentary, before | user, commentary `c`, tool, formula `f` | none | none | no |
| id commentary, after | same | `f` | whole turn | no |
| id commentary, Better Paseo, after | same | none | none | no |
| native final | user, commentary `a`, formula `f`, plain final `p` | `p` | `p` only | no |
| no turn ids, before | as id commentary, no turn ids | none | none | no |
| no turn ids, after | same | `f` | whole turn | no |
| two formulas, before | user, formula `f1`, plain `m`, formula `f2` | none | none | no |
| two formulas, after | same | `f2` | whole turn | no |
| repeated text | agent 1: user, a text-keyed commentary of at least 40 characters, tool, formula; agent 2: user, the same commentary as its final reply. Index both agents. | agent 1: the commentary; agent 2: its final reply | agent 1: the commentary; agent 2: its reply | agent 1: yes |

The fork boundary of every anchored footer must point at the anchored item.

Run every case against each pinned host. On `pr-9253`, projection keeps the original reply on each
plugin row as `turnFooterSource`, so every "before" case whose final reply is a plugin row expects
Paseo's footer anchored to that final reply with Copy covering the whole turn; "after" cases keep
the expectations above; the native-final case keeps its anchor and fork boundary at the native
final reply while its Copy covers the whole turn, because that host builds Copy from every row's
original reply; and the Unprotected column is not asserted there, because the renderer-side
detection that disables the index is outside this pipeline. Write one report section per host.

- [ ] **Step 4: Write the runner**

`scripts/qa/reply-actions.mjs` bundles the probe with esbuild to `.smoke/reply-actions/probe.mjs`
and imports it, exiting non-zero on any assertion failure. These settings already ran Paseo's
layout functions in Node:

```js
await build({
  entryPoints: [probe], outfile, bundle: true, platform: "node", format: "esm",
  packages: "external",
  plugins: [{
    name: "paseo-host-stubs",
    setup(b) {
      b.onResolve({ filter: /^@\/styles\/theme$/ }, () => ({ path: "spacing", namespace: "stub" }));
      b.onResolve({ filter: /^@getpaseo\/protocol\/timeline-turn$/ }, () => ({
        path: path.join(host, "packages/protocol/src/timeline-turn.ts"),
      }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: "export const SPACING = { 1: 4, 2: 8, 4: 16, 8: 32 };",
        loader: "js",
      }));
    },
  }],
});
```

`host` is the absolute path of the checkout named by `PASEO_HOST`; the runner loops over the three
labels and builds the probe once per host.

- [ ] **Step 5: Run it**

Run: `npm run host-source && npm run qa:reply-actions`
Expected: exit 0, and `.smoke/reply-actions/report.json` lists all 13 cases as passed for each of
the three hosts.

- [ ] **Step 6: Add it to CI and the development guide**

In `.github/workflows/ci.yml`, after `npm run smoke` in the main job, add `npm run host-source` and
`npm run qa:reply-actions`. In `docs/development.md`, add both commands to Local setup with one line
on what the check proves.

- [ ] **Step 7: Commit**

```bash
git add scripts .gitignore biome.json package.json .github/workflows/ci.yml docs/development.md
git commit -m "test: check reply actions against pinned Paseo host functions"
```

### Task 10: Real-client QA on an isolated Paseo 0.16.0 host

**Files:**
- Create: `docs/qa/fork-safe-replies.md`, screenshots under `docs/qa/evidence/`
- Modify: `docs/qa/environment.md` (0.16.0 harness section)

- [ ] **Step 1: Start the isolated host**

```bash
H=~/projects/paseo-harness-0.16.0
mkdir -p "$H/npm" "$H/home"
npm install --prefix "$H/npm" @getpaseo/cli@0.16.0
env -u PASEO_AGENT_ID -u PASEO_HOME "$H/npm/node_modules/.bin/paseo" daemon start --home "$H/home" --port 6792 --web-ui --no-relay
```

Install this branch's checkout and Better Paseo into that home through the CLI's plugin commands.
Check with `paseo --host 127.0.0.1:6792 plugin ls`. Every command targets `127.0.0.1:6792`.

- [ ] **Step 2: Produce the turns**

Create a Claude Code agent and a Codex agent in the isolated host. In each, send a prompt that
makes the agent run one shell command, then answer with display math. A suitable prompt is "Run
`ls`, then derive the quadratic formula and end with it as display math." Also produce a turn whose
plain commentary repeats a short phrase.

- [ ] **Step 3: Check the behavior**

At widths 1100 and 390, using `scripts/qa/web-capture.mjs` for screenshots, check and record:
- the footer appears only under final replies of completed formula turns;
- Show original produces Paseo's footer, and Fork in a new tab carries history through the final
  answer;
- the pill restores, and reloading the page restores;
- the pressed turn's final reply stays in view when a turn in the middle of history is handed back
  or restored;
- formula images do not render again when the transformer re-registers;
- with Better Paseo's Plugin markdown for replies off, the same checks hold;
- the Full and the Collapse turns views both hold; under Collapse turns a co-owned formula turn
  folds with its answer visible and shows no Paseo Fork while folded or expanded, and Show original
  keeps it folded with Paseo's footer under the answer;
- after restarting the isolated daemon, the reloaded Claude chat co-owns a long unique commentary,
  and a short repeated one shows the warning.

- [ ] **Step 4: Write the record and stop the host**

Write `docs/qa/fork-safe-replies.md` in the style of `docs/qa/host-integration.md`: environment,
results per check, screenshots, and what was not checked, such as Electron, iOS and Android. Add the
0.16.0 harness to `docs/qa/environment.md`. Then stop the host:

```bash
env -u PASEO_AGENT_ID -u PASEO_HOME "$H/npm/node_modules/.bin/paseo" daemon stop --home "$H/home"
```

- [ ] **Step 5: Commit**

```bash
git add docs/qa
git commit -m "docs: record fork-safe replies QA on Paseo 0.16.0"
```

### Task 11: Documentation, release notes and version

**Files:**
- Modify: `README.md` (section "Reply actions and compatibility"), `OVERVIEW.md` ("Data access and
  limitations"), `docs/usage.md`, `docs/qa/host-integration.md`, `package.json`, `package-lock.json`
- Create: `docs/release/0.5.0.md`

- [ ] **Step 1: Rewrite the user-facing docs**

The README section describes Show original, the pill, the setting, the Better Paseo requirement,
the warning in unprotected turns, Collapse turns on 0.15.x, the 0.13.x limitation, the spec's Known
limitations, the upstream host fix as the long-term path, and that a host with getpaseo/paseo#9253
shows Paseo's footer under typeset replies with no setting change. Link the spec and the QA record. OVERVIEW adds that the plugin reads
each open chat's timeline through Paseo's API to find turn boundaries and copy turns, and replaces
the paragraph that says unpatched clients lose the controls. `docs/usage.md` gets a short section
on Show original. `docs/qa/host-integration.md` links the pipeline check and the QA record.

- [ ] **Step 2: Write the release notes and bump the version**

Write `docs/release/0.5.0.md` in the format of `docs/release/0.4.1.md`, with sections for changes,
compatibility and validation. Validation cites the targeted test files, the pipeline report and the
QA record. Then run:

```bash
npm version 0.5.0 --no-git-tag-version
npm run build
```

- [ ] **Step 3: Run the checks**

Run: `npm run typecheck && npm run lint && npm run format:check && npx vitest run tests/paseo-compatibility.test.ts --bail=1`
Expected: exit 0 and PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md OVERVIEW.md docs package.json package-lock.json
git commit -m "release: prepare v0.5.0 fork-safe replies"
```

Tagging and publishing stay with the maintainer's release workflow.

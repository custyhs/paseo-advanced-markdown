// Pipeline check: drives the plugin's real reply-actions modules through one
// pinned official Paseo host's own projection, layout, Copy and fork-boundary
// functions, and asserts where the host's turn footer lands for each case.
// Built and run per host by scripts/qa/reply-actions.mjs; `paseo-host/...`
// imports resolve into the checkout picked by the PASEO_HOST label.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createReplyTransformer,
  type DecisionSnapshot,
  TRANSFORMER_ID,
} from "../../client/reply-actions/decision.js";
import { type ReplyKey, replyKey } from "../../client/reply-actions/keys.js";
import { createOwnershipDetector } from "../../client/reply-actions/ownership.js";
import { createReplyActionsStore } from "../../client/reply-actions/store.js";
import type { TimelineEntryLike } from "../../client/reply-actions/turns.js";
import { detectExtensions, shouldTakeOver } from "../../shared/markdown/extensions.js";
import { DEFAULT_MODULE_SETTINGS } from "../../shared/settings.js";
import { layoutStream } from "paseo-host/agent-stream/layout.ts";
import { createStreamStrategy } from "paseo-host/agent-stream/strategy.ts";
import { resolveAssistantTurnForkBoundary } from "paseo-host/agent-stream/turn-boundary.ts";
import { transformTimelineItem } from "paseo-host/plugins/timeline/model.ts";
import { projectPluginTimelineItems } from "paseo-host/plugins/timeline/projection.ts";

const HOST_LABEL = process.env.PASEO_HOST ?? "unknown";
/** #9253 keeps the original reply on plugin rows as `turnFooterSource`. */
const IS_PR_HOST = HOST_LABEL === "pr-9253";

// --- Case descriptions: one source for stream items and timeline entries. ---

interface ReplyRowSpec {
  readonly kind: "reply";
  /** Stream item id, and the name expectations use for this reply. */
  readonly ref: string;
  readonly text: string;
  /** Absent for text-keyed replies. */
  readonly messageId?: string;
}

type RowSpec = { readonly kind: "user" } | { readonly kind: "tool" } | ReplyRowSpec;

interface AgentExpectation {
  /** Ref of the reply the host footer anchors to; null for no footer. */
  readonly footer: string | null;
  /** Refs whose texts, joined by a blank line, are the host's Copy. */
  readonly copy: readonly string[];
  /** `turnView(final reply).unprotected`; not asserted on the PR host. */
  readonly unprotected: boolean;
}

interface AgentSpec {
  readonly agentId: string;
  readonly rows: readonly RowSpec[];
  readonly expect: AgentExpectation;
  /**
   * Override for pr-9253, which keeps the original reply on plugin rows as
   * `turnFooterSource`: a "before" turn ending in a plugin row keeps the host
   * footer, anchored to that final reply, with Copy covering the whole turn.
   */
  readonly expectPr9253?: Pick<AgentExpectation, "footer" | "copy">;
}

interface CaseSpec {
  readonly name: string;
  readonly agents: readonly AgentSpec[];
  /** Omit canonical turn ids from stream items and timeline entries. */
  readonly noTurnIds?: true;
  /** Hand each agent's final reply back through the store first. */
  readonly showOriginal?: true;
  /** Install Better Paseo, which claims every non-empty reply, after ours. */
  readonly betterPaseo?: true;
}

const USER_PROMPT = "derive it";
const FORMULA = "Final equation: $E=mc^2$";
const SECOND_FORMULA = "So $a^2 + b^2 = c^2$ holds.";
const SHORT_COMMENTARY = "Let me check the tests.";
const ID_COMMENTARY = "Let me check the derivation first.";
const SETUP_COMMENTARY = "Setting up the symbols first.";
const PLAIN_MIDDLE = "Now the general case.";
const PLAIN_FINAL = "Proof complete; see the formula above.";
/** Text-keyed and >= MIN_CO_OWNED_TEXT_LENGTH, so only repetition blocks it. */
const LONG_COMMENTARY = "Let me re-run the whole suite before answering this one.";

const user = { kind: "user" } as const;
const tool = { kind: "tool" } as const;
const reply = (ref: string, text: string, messageId?: string): ReplyRowSpec => ({
  kind: "reply",
  ref,
  text,
  ...(messageId !== undefined ? { messageId } : {}),
});

const singleRows = [user, reply("f", FORMULA, "f")];
const shortCommentaryRows = [
  user,
  reply("commentary", SHORT_COMMENTARY),
  tool,
  reply("f", FORMULA, "f"),
];
const idCommentaryRows = [user, reply("c", ID_COMMENTARY, "c"), tool, reply("f", FORMULA, "f")];
const twoFormulaRows = [
  user,
  reply("f1", FORMULA, "f1"),
  reply("m", PLAIN_MIDDLE, "m"),
  reply("f2", SECOND_FORMULA, "f2"),
];

const CASES: readonly CaseSpec[] = [
  {
    name: "single, before",
    agents: [
      {
        agentId: "a1",
        rows: singleRows,
        expect: { footer: null, copy: [], unprotected: false },
        expectPr9253: { footer: "f", copy: ["f"] },
      },
    ],
  },
  {
    name: "single, after",
    showOriginal: true,
    agents: [
      {
        agentId: "a1",
        rows: singleRows,
        expect: { footer: "f", copy: ["f"], unprotected: false },
      },
    ],
  },
  {
    name: "short commentary, before",
    agents: [
      {
        agentId: "a1",
        rows: shortCommentaryRows,
        expect: { footer: "commentary", copy: ["commentary"], unprotected: true },
        expectPr9253: { footer: "f", copy: ["commentary", "f"] },
      },
    ],
  },
  {
    name: "short commentary, after",
    showOriginal: true,
    agents: [
      {
        agentId: "a1",
        rows: shortCommentaryRows,
        expect: { footer: "f", copy: ["commentary", "f"], unprotected: false },
      },
    ],
  },
  {
    name: "id commentary, before",
    agents: [
      {
        agentId: "a1",
        rows: idCommentaryRows,
        expect: { footer: null, copy: [], unprotected: false },
        expectPr9253: { footer: "f", copy: ["c", "f"] },
      },
    ],
  },
  {
    name: "id commentary, after",
    showOriginal: true,
    agents: [
      {
        agentId: "a1",
        rows: idCommentaryRows,
        expect: { footer: "f", copy: ["c", "f"], unprotected: false },
      },
    ],
  },
  {
    name: "id commentary, Better Paseo, after",
    showOriginal: true,
    betterPaseo: true,
    agents: [
      {
        agentId: "a1",
        rows: idCommentaryRows,
        expect: { footer: null, copy: [], unprotected: false },
      },
    ],
  },
  {
    name: "native final",
    agents: [
      {
        agentId: "a1",
        rows: [
          user,
          reply("a", SETUP_COMMENTARY, "a"),
          reply("f", FORMULA, "f"),
          reply("p", PLAIN_FINAL, "p"),
        ],
        expect: { footer: "p", copy: ["p"], unprotected: false },
        // The plan's table keeps `p` only on pr-9253 too, but the PR maps the
        // footer host's items to their `turnFooterSource` originals wherever
        // the anchor sits (layout.ts getTurnFooterItems), so the measured Copy
        // covers the whole turn. The anchor and fork boundary stay at `p`.
        expectPr9253: { footer: "p", copy: ["a", "f", "p"] },
      },
    ],
  },
  {
    name: "no turn ids, before",
    noTurnIds: true,
    agents: [
      {
        agentId: "a1",
        rows: idCommentaryRows,
        expect: { footer: null, copy: [], unprotected: false },
        expectPr9253: { footer: "f", copy: ["c", "f"] },
      },
    ],
  },
  {
    name: "no turn ids, after",
    noTurnIds: true,
    showOriginal: true,
    agents: [
      {
        agentId: "a1",
        rows: idCommentaryRows,
        expect: { footer: "f", copy: ["c", "f"], unprotected: false },
      },
    ],
  },
  {
    name: "two formulas, before",
    agents: [
      {
        agentId: "a1",
        rows: twoFormulaRows,
        expect: { footer: null, copy: [], unprotected: false },
        expectPr9253: { footer: "f2", copy: ["f1", "m", "f2"] },
      },
    ],
  },
  {
    name: "two formulas, after",
    showOriginal: true,
    agents: [
      {
        agentId: "a1",
        rows: twoFormulaRows,
        expect: { footer: "f2", copy: ["f1", "m", "f2"], unprotected: false },
      },
    ],
  },
  {
    name: "repeated text",
    agents: [
      {
        agentId: "a1",
        rows: [user, reply("commentary", LONG_COMMENTARY), tool, reply("f", FORMULA, "f")],
        expect: { footer: "commentary", copy: ["commentary"], unprotected: true },
        expectPr9253: { footer: "f", copy: ["commentary", "f"] },
      },
      {
        agentId: "a2",
        rows: [user, reply("echo", LONG_COMMENTARY)],
        expect: { footer: "echo", copy: ["echo"], unprotected: false },
      },
    ],
  },
];

// --- Host-shaped stream items and store-shaped timeline entries. ---

interface StreamCursor {
  readonly epoch: string;
  readonly seq: number;
}

interface StreamItemLike {
  readonly kind: string;
  readonly id: string;
  readonly turnId?: string;
  readonly messageId?: string;
  readonly timelineCursor: StreamCursor;
  readonly timestamp: Date;
  readonly text?: string;
  readonly payload?: unknown;
  /** Present on projected plugin rows. */
  readonly sourceId?: string;
  readonly pluginId?: string;
}

const EPOCH = "probe";
const at = (seq: number) => new Date(Date.UTC(2026, 10, 8, 0, 0, seq));
const COMPLETED_AT = at(0);

function buildAgent(
  spec: AgentSpec,
  noTurnIds: boolean,
): { entries: TimelineEntryLike[]; items: StreamItemLike[] } {
  const turnId = noTurnIds ? undefined : `turn-${spec.agentId}`;
  const turn = turnId !== undefined ? { turnId } : {};
  const entries: TimelineEntryLike[] = [];
  const items: StreamItemLike[] = [];
  spec.rows.forEach((row, index) => {
    const seq = index + 1;
    const timestamp = at(seq);
    const entryBase = { ...turn, timestamp: timestamp.toISOString(), seqStart: seq };
    const itemBase = { ...turn, timelineCursor: { epoch: EPOCH, seq }, timestamp };
    if (row.kind === "user") {
      entries.push({ item: { type: "user_message", text: USER_PROMPT }, ...entryBase });
      items.push({
        kind: "user_message",
        id: `user-${spec.agentId}`,
        messageId: `user-${spec.agentId}-m`,
        ...itemBase,
        text: USER_PROMPT,
      });
    } else if (row.kind === "tool") {
      entries.push({ item: { type: "tool_call", name: "exec_command" }, ...entryBase });
      items.push({
        kind: "tool_call",
        id: `tool-${spec.agentId}-${seq}`,
        ...itemBase,
        payload: {
          source: "agent",
          data: {
            callId: `call-${seq}`,
            name: "exec_command",
            status: "completed",
            detail: {},
            error: null,
          },
        },
      });
    } else {
      entries.push({
        item: {
          type: "assistant_message",
          text: row.text,
          ...(row.messageId !== undefined ? { messageId: row.messageId } : {}),
        },
        ...entryBase,
      });
      items.push({
        kind: "assistant_message",
        id: row.ref,
        ...(row.messageId !== undefined ? { messageId: row.messageId } : {}),
        ...itemBase,
        text: row.text,
      });
    }
  });
  return { entries, items };
}

function finalReply(spec: AgentSpec): ReplyRowSpec {
  const last = spec.rows.findLast((row) => row.kind === "reply");
  if (last === undefined || last.kind !== "reply") {
    throw new Error(`case agent ${spec.agentId} has no reply row`);
  }
  return last;
}

function replyByRef(spec: AgentSpec, ref: string): ReplyRowSpec & { seq: number } {
  const index = spec.rows.findIndex((row) => row.kind === "reply" && row.ref === ref);
  const row = spec.rows[index];
  if (row === undefined || row.kind !== "reply") {
    throw new Error(`case agent ${spec.agentId} has no reply ref ${ref}`);
  }
  return { ...row, seq: index + 1 };
}

// --- The host pipeline, set up exactly as the real stream view does. ---

const strategy = createStreamStrategy({
  render: () => null,
  orderTailReverse: false,
  orderHeadReverse: false,
  assistantTurnTraversalStep: -1,
  edgeSlot: "footer",
  historyLiveBoundaryEdge: "last",
  liveHeadHistoryBoundaryEdge: "first",
  frameChildOrder: "content-then-footer",
  flatListInverted: false,
  overlayScrollbarInverted: false,
  bottomAnchorTransportBehavior: { verificationDelayFrames: 0, verificationRetryMode: "recheck" },
  disableParentScrollOnInlineDetailsExpansion: false,
  anchorBottomOnContentSizeChange: false,
  animateManualScrollToBottom: false,
  useVirtualizedList: false,
  isNearBottom: () => true,
  getBottomOffset: () => 0,
} as never);

interface TurnFooterHostLike {
  readonly itemId: string;
  readonly items: StreamItemLike[];
  readonly startIndex: number;
}

interface LayoutLike {
  readonly history: readonly { completedFooter: TurnFooterHostLike | null }[];
  readonly auxiliaryTurnFooter: TurnFooterHostLike | null;
}

interface ForkBoundaryLike {
  readonly boundaryCursor?: StreamCursor;
  readonly boundaryMessageId?: string;
}

/** Better Paseo with "Plugin markdown for replies" on claims every reply. */
const betterPaseoReplies = {
  id: "omp-enhanced-assistant",
  query: { itemType: "assistant_message" },
  transform(input: { item: { text: string } }) {
    return input.item.text.trim()
      ? {
          items: [
            { type: "plugin", kind: "omp-assistant", version: 1, data: { text: input.item.text } },
          ],
        }
      : undefined;
  },
};

const rowName = (item: StreamItemLike) =>
  item.kind === "plugin" ? `plugin:${item.pluginId}` : item.kind;

interface FooterReport {
  readonly anchoredTo: string;
  readonly fork: ForkBoundaryLike | null;
  readonly copy: string;
}

interface AgentReport {
  agent: string;
  rows: string;
  footer: FooterReport | "none";
  unprotected?: boolean;
}

interface CaseReport {
  name: string;
  passed: boolean;
  agents: AgentReport[];
  failures?: string[];
}

async function runCase(spec: CaseSpec): Promise<CaseReport> {
  const failures: string[] = [];
  const fail = (agentId: string, message: string) => failures.push(`${agentId}: ${message}`);
  const detector = createOwnershipDetector({ detectExtensions, shouldTakeOver });
  const entriesByAgent = new Map<string, TimelineEntryLike[]>();
  const itemsByAgent = new Map<string, StreamItemLike[]>();
  for (const agent of spec.agents) {
    const built = buildAgent(agent, spec.noTurnIds === true);
    entriesByAgent.set(agent.agentId, built.entries);
    itemsByAgent.set(agent.agentId, built.items);
  }
  const store = createReplyActionsStore({
    read: async (agentId) => ({
      epoch: EPOCH,
      entries: entriesByAgent.get(agentId) ?? [],
      startCursor: null,
      hasOlder: false,
    }),
    isOwned: (text) => detector.isOwned(text, DEFAULT_MODULE_SETTINGS),
  });
  const agentReports: AgentReport[] = [];
  try {
    const finalKeys = new Map<string, ReplyKey>();
    for (const agent of spec.agents) {
      const key = replyKey(finalReply(agent));
      finalKeys.set(agent.agentId, key);
      store.rowMounted(agent.agentId);
      store.requestKey(agent.agentId, key, { streaming: false });
    }
    await store.settled();
    if (spec.showOriginal === true) {
      for (const agent of spec.agents) {
        const handed = await store.showOriginal(agent.agentId, finalKeys.get(agent.agentId)!);
        if (!handed) fail(agent.agentId, "showOriginal found no indexed turn for the final reply");
      }
    }
    const snapshot: DecisionSnapshot = {
      settings: DEFAULT_MODULE_SETTINGS,
      ...store.decisionInputs(),
    };
    const plugins = [
      {
        id: "advanced-markdown",
        timelineTransformers: [createReplyTransformer(snapshot, detector)],
      },
      ...(spec.betterPaseo === true
        ? [{ id: "better-paseo", timelineTransformers: [betterPaseoReplies] }]
        : []),
    ];
    type TransformInput = {
      item: { type: string; text?: string; messageId?: string };
      phase: "streaming" | "complete";
      sourceId: string;
    };
    const transform = (input: TransformInput) => transformTimelineItem({ ...input, plugins });

    for (const agent of spec.agents) {
      const expectation =
        IS_PR_HOST && agent.expectPr9253 !== undefined
          ? { ...agent.expect, ...agent.expectPr9253 }
          : agent.expect;
      const items = itemsByAgent.get(agent.agentId)!;
      const projected = projectPluginTimelineItems(
        items as never,
        transform as never,
      ) as StreamItemLike[];
      const layout = layoutStream({
        strategy,
        isTurnActive: false,
        history: projected,
        liveHead: [],
        timingByItemId: new Map(
          projected.map((item) => [item.id, { durationMs: 1000, completedAt: COMPLETED_AT }]),
        ),
      } as never) as LayoutLike;
      const footerHosts: TurnFooterHostLike[] = [
        ...layout.history.flatMap((row) => (row.completedFooter ? [row.completedFooter] : [])),
        ...(layout.auxiliaryTurnFooter ? [layout.auxiliaryTurnFooter] : []),
      ];
      const report: AgentReport = {
        agent: agent.agentId,
        rows: projected.map(rowName).join(" | "),
        footer: "none",
      };
      agentReports.push(report);

      if (expectation.footer === null) {
        if (footerHosts.length > 0) {
          fail(
            agent.agentId,
            `expected no host footer, got ${footerHosts.map((host) => host.itemId).join(", ")}`,
          );
        }
      } else if (footerHosts.length !== 1) {
        fail(
          agent.agentId,
          `expected one host footer anchored to ${expectation.footer}, got ${
            footerHosts.length === 0 ? "none" : footerHosts.map((host) => host.itemId).join(", ")
          }`,
        );
      } else {
        const footerHost = footerHosts[0]!;
        const ref = replyByRef(agent, expectation.footer);
        const anchorRow = projected.find((row) => row.id === ref.ref || row.sourceId === ref.ref);
        const fork = resolveAssistantTurnForkBoundary({
          items: footerHost.items,
          startIndex: footerHost.startIndex,
          supportsTimelineCursor: true,
        }) as ForkBoundaryLike | undefined;
        const copy = strategy.collectAssistantResponseContent(
          footerHost.items as never,
          footerHost.startIndex,
        ) as string;
        report.footer = { anchoredTo: footerHost.itemId, fork: fork ?? null, copy };
        if (footerHost.itemId !== ref.ref && footerHost.itemId !== anchorRow?.id) {
          fail(
            agent.agentId,
            `footer anchored to ${footerHost.itemId}, expected ${ref.ref} (${anchorRow?.id})`,
          );
        }
        // The fork boundary must point at the anchored reply: whichever
        // identifying fields it carries have to name that reply.
        if (fork === undefined) {
          fail(agent.agentId, "no fork boundary for the anchored footer");
        } else {
          if (fork.boundaryMessageId !== undefined && fork.boundaryMessageId !== ref.messageId) {
            fail(
              agent.agentId,
              `fork boundary message id ${fork.boundaryMessageId}, expected ${ref.messageId}`,
            );
          }
          if (
            fork.boundaryCursor !== undefined &&
            (fork.boundaryCursor.epoch !== EPOCH || fork.boundaryCursor.seq !== ref.seq)
          ) {
            fail(
              agent.agentId,
              `fork boundary cursor seq ${fork.boundaryCursor.seq}, expected ${ref.seq}`,
            );
          }
          if (fork.boundaryMessageId === undefined && fork.boundaryCursor === undefined) {
            fail(agent.agentId, "fork boundary carries neither a cursor nor a message id");
          }
        }
        const expectedCopy = expectation.copy
          .map((copyRef) => replyByRef(agent, copyRef).text)
          .join("\n\n");
        if (copy !== expectedCopy) {
          fail(
            agent.agentId,
            `Copy ${JSON.stringify(copy)}, expected ${JSON.stringify(expectedCopy)}`,
          );
        }
      }

      if (!IS_PR_HOST) {
        const view = store.turnView(agent.agentId, finalKeys.get(agent.agentId)!);
        if (view === null) {
          fail(agent.agentId, "turnView answered nothing for the final reply");
        } else {
          report.unprotected = view.unprotected;
          if (view.unprotected !== expectation.unprotected) {
            fail(
              agent.agentId,
              `turnView.unprotected is ${view.unprotected}, expected ${expectation.unprotected}`,
            );
          }
        }
      }
    }
  } finally {
    store.dispose();
  }
  return {
    name: spec.name,
    passed: failures.length === 0,
    agents: agentReports,
    ...(failures.length > 0 ? { failures } : {}),
  };
}

// --- Run every case, merge this host's section into the report, assert. ---

const caseReports: CaseReport[] = [];
for (const spec of CASES) {
  caseReports.push(await runCase(spec));
}

const reportPath = fileURLToPath(new URL("./report.json", import.meta.url));
const existing = existsSync(reportPath)
  ? (JSON.parse(readFileSync(reportPath, "utf8")) as { hosts?: Record<string, unknown> })
  : {};
const passed = caseReports.filter((entry) => entry.passed).length;
writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      transformer: TRANSFORMER_ID,
      hosts: {
        ...existing.hosts,
        [HOST_LABEL]: { passed, total: caseReports.length, cases: caseReports },
      },
    },
    null,
    2,
  )}\n`,
);

const failedCases = caseReports.filter((entry) => !entry.passed);
if (failedCases.length > 0) {
  const details = failedCases
    .map((entry) => `  ${entry.name}\n${(entry.failures ?? []).map((f) => `    ${f}`).join("\n")}`)
    .join("\n");
  throw new Error(`${failedCases.length} of ${caseReports.length} cases failed:\n${details}`);
}
console.log(`reply-actions[${HOST_LABEL}]: ${passed}/${caseReports.length} cases passed`);

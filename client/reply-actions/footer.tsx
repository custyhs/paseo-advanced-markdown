import type { PluginTheme } from "@getpaseo/plugin";
import { useAgent, useSettings } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/ui";
import { type JSX, useEffect, useMemo, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { moduleSettings } from "../../shared/settings.js";
import { ActionBar } from "../action-bar.js";
import { moduleState } from "../module-state.js";
import { FOOTER_COPY, footerMode, formatEndTime } from "./footer-state.js";
import type { ReplyKey } from "./keys.js";
import { getReplyActionsRuntime } from "./runtime.js";

// Stable stand-ins so a runtime-less render (tests, pre-setup) keeps hook order.
const noStoreSubscribe = () => () => {};
const noStoreVersion = () => 0;

/** The first-use toast fires once per bundle evaluation. */
let firstUseToastShown = false;

/**
 * Reports a rendered reply row to the turn index: owned and co-owned rows
 * both count as mounted and request their key, so late duplicates are caught.
 * With `hostNativeFooter` the host draws its own turn footers
 * (getpaseo/paseo#9253); the row only reports that and stays out of the index.
 */
export function useReplyRow(
  agentId: string,
  key: ReplyKey,
  phase: "streaming" | "complete",
  hostNativeFooter: boolean,
): void {
  const status = useAgent(agentId, (agent) => agent.status);
  useEffect(() => {
    const runtime = getReplyActionsRuntime();
    if (runtime === null) return;
    if (hostNativeFooter) {
      runtime.noteHostNativeFooter();
      return;
    }
    return runtime.store.rowMounted(agentId);
  }, [agentId, hostNativeFooter]);
  useEffect(() => {
    if (hostNativeFooter) return;
    getReplyActionsRuntime()?.store.requestKey(agentId, key, {
      streaming: phase === "streaming",
    });
  }, [agentId, key, phase, hostNativeFooter]);
  useEffect(() => {
    if (hostNativeFooter || status === null) return;
    getReplyActionsRuntime()?.store.noteAgentStatus(agentId, status);
  }, [agentId, status, hostNativeFooter]);
}

/**
 * Copy, Show original and the turn's end time under an owned final reply,
 * plus the fork warning when the turn keeps a plain reply the plugin could
 * not claim. Lives outside `MemoizedMessage`, so store updates re-render
 * this row and never the formulas above it.
 */
export function ReplyFooter({
  agentId,
  replyKey,
  theme,
  compact,
  hostNativeFooter,
}: {
  agentId: string;
  replyKey: ReplyKey;
  theme: PluginTheme;
  compact: boolean;
  hostNativeFooter: boolean;
}): JSX.Element | null {
  const runtime = getReplyActionsRuntime();
  const store = runtime === null ? null : runtime.store;
  const toast = useToast();
  // The snapshot is the version number: a fresh `TurnView` object per
  // snapshot would never compare equal and re-render forever.
  const version = useSyncExternalStore(
    store === null ? noStoreSubscribe : store.subscribe,
    store === null ? noStoreVersion : store.getVersion,
  );
  const view = useMemo(() => {
    // The store mutates in place; `version` keys the recompute to its notifications.
    void version;
    return store === null ? null : store.turnView(agentId, replyKey);
  }, [store, version, agentId, replyKey]);
  const settings = useSettings(moduleSettings);
  const enabled =
    settings.status === "ready"
      ? settings.values.forkSafeReplies
      : moduleState.current.forkSafeReplies;
  const workspaceId = useAgent(agentId, (agent) => agent.workspaceId);
  const mode = footerMode({ enabled, role: "owned", view, hostNativeFooter });
  if (mode === "hidden" || runtime === null || view === null) return null;
  const copyTurn = () => {
    copyText(view.copyText)
      .then(() => toast.show(FOOTER_COPY.copied))
      .catch(() => toast.error("Unable to copy the turn."));
  };
  const showOriginal = () => {
    void runtime.showOriginal(agentId, replyKey, workspaceId).then((shown) => {
      if (!shown || firstUseToastShown) return;
      firstUseToastShown = true;
      toast.show(FOOTER_COPY.firstUse);
    });
  };
  return (
    <View>
      <ActionBar
        theme={theme}
        compact={compact}
        actions={[
          { key: "copy", icon: "Copy", label: FOOTER_COPY.copyLabel, onPress: copyTurn },
          { key: "original", icon: "Eye", label: FOOTER_COPY.showOriginal, onPress: showOriginal },
        ]}
        hint={formatEndTime(view.endedAt, new Date())}
      />
      {mode === "footer-with-warning" ? (
        <Text
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: compact ? 11 : 12,
            marginTop: 4,
          }}
        >
          {FOOTER_COPY.warning}
        </Text>
      ) : null}
    </View>
  );
}

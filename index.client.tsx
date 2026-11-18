import type { PluginClientContext } from "@getpaseo/plugin/client";
import { settingsRpc } from "@getpaseo/plugin";

function setupPlugin(client: PluginClientContext) {
  // Keep client dependencies lazy so an Android evaluation failure includes the
  // dependency stack in the plugin status instead of only its final message.
  const { MessageView } = require("./client/message.js") as typeof import("./client/message.js");
  const { SettingsScreen } =
    require("./client/settings.js") as typeof import("./client/settings.js");
  const { detectExtensions, shouldTakeOver } =
    require("./client/generated/markdown.js") as typeof import("./client/generated/markdown.js");
  const { messageSchema, MESSAGE_KIND, MESSAGE_VERSION } =
    require("./shared/message.js") as typeof import("./shared/message.js");
  const { moduleSettings } =
    require("./shared/settings.js") as typeof import("./shared/settings.js");
  const { moduleState } =
    require("./client/module-state.js") as typeof import("./client/module-state.js");
  const { clearRenderCache } =
    require("./client/render-cache.js") as typeof import("./client/render-cache.js");
  const { createOwnershipDetector } =
    require("./client/reply-actions/ownership.js") as typeof import("./client/reply-actions/ownership.js");
  const { createTimelineReader } =
    require("./client/reply-actions/reader.js") as typeof import("./client/reply-actions/reader.js");
  const { createTurnStartWatcher } =
    require("./client/reply-actions/turn-watch.js") as typeof import("./client/reply-actions/turn-watch.js");
  const { createReplyActionsRuntime, setReplyActionsRuntime } =
    require("./client/reply-actions/runtime.js") as typeof import("./client/reply-actions/runtime.js");
  const { resetFirstUseToast } =
    require("./client/reply-actions/footer.js") as typeof import("./client/reply-actions/footer.js");

  // The transformer runs outside React; seed the module snapshot from the host
  // once, then keep it current from rendered items and the settings screen.
  let disposed = false;
  void client
    .rpc(settingsRpc(moduleSettings.id).read, {})
    .then((read) => {
      if (disposed || read.status !== "ready") return;
      const parsed = moduleSettings.schema.safeParse(read.values ?? {});
      if (parsed.success) moduleState.set(parsed.data);
    })
    .catch(() => undefined);

  client.addTimelineRenderer({
    kind: MESSAGE_KIND,
    version: MESSAGE_VERSION,
    schema: messageSchema,
    Component: MessageView,
  });
  client.addSettingsScreen({
    id: "modules",
    title: "Advanced Markdown",
    icon: "Sigma",
    Component: SettingsScreen,
  });
  const ownership = createOwnershipDetector({ detectExtensions, shouldTakeOver });
  const runtime = createReplyActionsRuntime({
    client,
    ownership,
    settings: moduleState,
    // Read `client.paseo` per call: setup must not touch it, because harness
    // clients may not provide it.
    read: (agentId, options) => createTimelineReader(client.paseo)(agentId, options),
    watchTurnStart: (agentId, onTurnStart) =>
      createTurnStartWatcher(client.paseo)(agentId, onTurnStart),
  });
  setReplyActionsRuntime(runtime);
  return () => {
    disposed = true;
    runtime.dispose();
    setReplyActionsRuntime(null);
    resetFirstUseToast();
    ownership.clear();
    moduleState.reset();
    clearRenderCache();
  };
}

export default function contribute(client: PluginClientContext) {
  try {
    return setupPlugin(client);
  } catch (error) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    throw new Error(`advanced-markdown client initialization failed:\n${detail}`);
  }
}

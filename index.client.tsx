import type { PluginClientContext } from "@getpaseo/plugin/client";
import { settingsRpc } from "@getpaseo/plugin";

function setupPlugin(client: PluginClientContext) {
  // Keep client dependencies lazy so an Android evaluation failure includes the
  // dependency stack in the plugin status instead of only its final message.
  const { MessageView } = require("./client/message.js") as typeof import("./client/message.js");
  const { SettingsScreen } = require("./client/settings.js") as typeof import("./client/settings.js");
  const { detectExtensions, shouldTakeOver } = require("./client/generated/markdown.js") as typeof import("./client/generated/markdown.js");
  const { messageSchema, MESSAGE_KIND, MESSAGE_VERSION } = require("./shared/message.js") as typeof import("./shared/message.js");
  const { moduleSettings } = require("./shared/settings.js") as typeof import("./shared/settings.js");
  const { moduleState } = require("./client/module-state.js") as typeof import("./client/module-state.js");
  const { clearRenderCache } = require("./client/render-cache.js") as typeof import("./client/render-cache.js");
  const { MAX_DOCUMENT } = require("./shared/limits.js") as typeof import("./shared/limits.js");

  type Detected = ReturnType<typeof detectExtensions>;
  const objects = new WeakMap<object, { text: string; result: Detected }>();
  // Projection may clone settled items. Bound retained source while avoiding
  // reparsing those clones on every unrelated transcript/composer update.
  const sources = new Map<string, Detected>();
  let sourceCharacters = 0;

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
  // Paseo 0.8 projects assembled assistant text at render time. Its phase is
  // "complete" even while that text grows; do not use phase to gate rendering.
  client.addTimelineTransformer({
    id: "assistant-advanced-markdown",
    query: { itemType: "assistant_message" },
    transform({ item }) {
      const remembered = objects.get(item);
      let result = remembered?.text === item.text ? remembered.result : sources.get(item.text);
      if (result === undefined) {
        result = detectExtensions(item.text);
        if (item.text.length <= 512 * 1024) {
          sources.set(item.text, result);
          sourceCharacters += item.text.length;
          for (const source of sources.keys()) {
            if (sources.size <= 256 && sourceCharacters <= 512 * 1024) break;
            sources.delete(source);
            sourceCharacters -= source.length;
          }
        }
      }
      objects.set(item, { text: item.text, result });
      if (item.text.length > MAX_DOCUMENT) return undefined;
      if (!shouldTakeOver(result, moduleState.current)) return undefined;
      return {
        items: [
          {
            type: "plugin" as const,
            kind: MESSAGE_KIND,
            version: MESSAGE_VERSION,
            data: { text: item.text },
          },
        ],
      };
    },
  });
  return () => {
    disposed = true;
    sources.clear();
    sourceCharacters = 0;
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

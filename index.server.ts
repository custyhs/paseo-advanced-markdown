import "./server/assets/startup.mjs";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { renderMath, renderMermaid, runtimeStatus } from "./shared/rpc.js";
import { moduleSettings } from "./shared/settings.js";
import { clearMathCache, mathCacheSize, renderFormula } from "./server/math/render.js";
import {
  mermaidCacheSize,
  mermaidQueueLength,
  renderDiagram,
  stopMermaid,
} from "./server/mermaid/render.js";
import { resolveMermaidRuntime } from "./server/mermaid/runtime.js";
import { MERMAID_CLI_VERSION, PLUGIN_VERSION } from "./server/generated/runtime.js";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(moduleSettings);
  server.handle(renderMath, (input) => renderFormula(input));
  server.handle(renderMermaid, (input) => renderDiagram(input));
  server.handle(runtimeStatus, async () => {
    const mermaid = await resolveMermaidRuntime();
    return {
      plugin: { version: PLUGIN_VERSION },
      math: { engine: "MathJax 3.2.2 + resvg 2.6.2", cached: mathCacheSize() },
      mermaid: mermaid.ready
        ? {
            ready: true,
            cli: `@mermaid-js/mermaid-cli ${mermaid.runtime.mermaidCliVersion}`,
            browser: mermaid.runtime.browserVersion ?? mermaid.runtime.executablePath,
            cacheRoot: mermaid.cacheRoot,
            queued: mermaidQueueLength(),
            cached: mermaidCacheSize(),
          }
        : {
            ready: false,
            cli: `@mermaid-js/mermaid-cli ${MERMAID_CLI_VERSION}`,
            browser: null,
            cacheRoot: mermaid.cacheRoot,
            queued: mermaidQueueLength(),
            cached: mermaidCacheSize(),
            message: mermaid.message,
          },
    };
  });
  return async () => {
    await stopMermaid();
    clearMathCache();
  };
}

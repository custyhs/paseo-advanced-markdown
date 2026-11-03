import "./server/assets/startup.mjs";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { renderMath, runtimeStatus } from "./shared/rpc.js";
import { moduleSettings } from "./shared/settings.js";
import { clearMathCache, mathCacheSize, renderFormula } from "./server/math/render.js";
import { resolveCacheRoot } from "./server/cache-root.mjs";
import { PLUGIN_VERSION } from "./server/generated/runtime.js";
import { previewFile } from "./shared/file-preview.js";
import { readFilePreview } from "./server/files/preview.js";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(moduleSettings);
  server.handle(previewFile, readFilePreview);
  server.handle(renderMath, (input) => renderFormula(input));
  server.handle(runtimeStatus, async () => {
    return {
      plugin: { version: PLUGIN_VERSION },
      math: {
        engine: "MathJax 3.2.2 + resvg 2.6.2",
        cached: mathCacheSize(),
        cacheRoot: resolveCacheRoot(),
      },
    };
  });
  return async () => {
    clearMathCache();
  };
}

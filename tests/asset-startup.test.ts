import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PluginServerContribution } from "@getpaseo/plugin/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { preparedAssetPath, readPreparedAssetSync } from "../server/assets/store.mjs";
import assets from "../server/generated/assets.json";
import { renderMath } from "../shared/rpc.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const temporary: string[] = [];
let factory: (load: NodeJS.Require) => { default: PluginServerContribution };

async function cacheFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pam-startup-"));
  temporary.push(dir);
  const cache = path.join(dir, "cache");
  vi.stubEnv("PASEO_ADVANCED_MARKDOWN_CACHE", cache);
  return cache;
}

function startPlugin() {
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
  const entry = factory(require);
  const cleanup = entry.default({
    registerSettings() {},
    handle(contract, handler) {
      for (const asset of Object.values(assets))
        expect(readPreparedAssetSync(asset).length).toBe(asset.bytes);
      handlers.set(contract.name, async (input) =>
        contract.output.parseAsync(
          await handler(contract.input.parse(input), {
            get paseo(): never {
              throw new Error("Asset recovery must not call the daemon API");
            },
          }),
        ),
      );
    },
    registerProvider() {},
    on: () => () => {},
    before: () => () => {},
  });
  return { cleanup, handlers };
}

beforeAll(async () => {
  const compiler = path.join(
    root,
    "node_modules/@getpaseo/server/dist/server/server/plugins/compiler.js",
  );
  const { compilePlugin } = await import(pathToFileURL(compiler).href);
  const { serverBundle } = await compilePlugin({ server: path.join(root, "index.server.ts") });
  // biome-ignore lint/security/noGlobalEval: evaluate the official compiler output like Paseo
  const evaluate = globalThis.eval;
  factory = evaluate(serverBundle);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("compiled plugin startup", () => {
  it("prepares both renderer assets before registering handlers with an empty cache", async () => {
    await cacheFixture();
    const { cleanup } = startPlugin();
    await cleanup();
  });

  it("repairs same-size corruption and a deleted font table on reload", async () => {
    const cache = await cacheFixture();
    await startPlugin().cleanup();
    const changed = readPreparedAssetSync(assets.resvg);
    changed[100] ^= 1;
    await writeFile(preparedAssetPath(assets.resvg), changed);
    await rm(preparedAssetPath(assets.fonts));
    // Startup must preserve the expensive browser/worker cache and old assets.
    const retained = ["manifest.json", "worker/ready", "browsers/ready", "assets/old.wasm"];
    for (const name of retained) {
      await mkdir(path.dirname(path.join(cache, name)), { recursive: true });
      await writeFile(path.join(cache, name), "retain");
    }
    await startPlugin().cleanup();
    for (const name of retained)
      expect(await readFile(path.join(cache, name), "utf8")).toBe("retain");
  });

  it("recovers a cache cleared after startup and renders a real formula through RPC", async () => {
    const cache = await cacheFixture();
    const { cleanup, handlers } = startPlugin();
    try {
      await rm(path.join(cache, "assets"), { recursive: true });
      const result = renderMath.output.parse(
        await handlers.get(renderMath.name)!({
          expression: String.raw`\frac{1}{2} + \sqrt{x^2+y^2}`,
          display: true,
          color: "#ffffff",
        }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.message);
      expect(Buffer.from(result.png, "base64").subarray(0, 8).toString("hex")).toBe(
        "89504e470d0a1a0a",
      );
      expect(result.width).toBeGreaterThan(20);
      expect(readPreparedAssetSync(assets.resvg).length).toBe(assets.resvg.bytes);
    } finally {
      await cleanup();
    }
  });
});

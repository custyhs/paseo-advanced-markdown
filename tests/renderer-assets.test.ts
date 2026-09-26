import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareAssets } from "../scripts/lib/prepare-assets.mjs";
import {
  preparedAssetPath,
  ensurePreparedAssetSync,
  readPreparedAsset,
  readPreparedAssetSync,
} from "../server/assets/store.mjs";
import { readRuntimeAsset, readRuntimeAssetSync } from "../server/assets/runtime.mjs";
import assets from "../server/generated/assets.json";
import { renderFormula } from "../server/math/render.js";
import { decodePng, inkCount } from "./helpers/png.js";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary: string[] = [];
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pam-assets-"));
  temporary.push(dir);
  return { dir, env: { PASEO_ADVANCED_MARKDOWN_CACHE: path.join(dir, "cache") } };
}
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("packaged renderer assets", () => {
  it("restores missing and corrupt runtime assets offline with sync and async readers", async () => {
    const { env } = await fixture();
    for (const asset of Object.values(assets)) {
      const original = await readFile(path.join(root, "server/generated", asset.file));
      expect(readRuntimeAssetSync(asset, env).equals(original)).toBe(true);
      const damaged = Buffer.from(original);
      damaged[100] ^= 1;
      await writeFile(preparedAssetPath(asset, env), damaged);
      expect((await readRuntimeAsset(asset, env)).equals(original)).toBe(true);
    }
  });

  it("leaves valid cached assets untouched without reading recovery data", async () => {
    const { env } = await fixture();
    await prepareAssets(root, env);
    const target = preparedAssetPath(assets.resvg, env);
    const before = await stat(target);
    const source = vi.fn((): Buffer => {
      throw new Error("Valid cache must not need recovery data");
    });
    expect(ensurePreparedAssetSync(assets.resvg, source, env).length).toBe(assets.resvg.bytes);
    expect(source).not.toHaveBeenCalled();
    const after = await stat(target);
    expect({ ino: after.ino, mtimeMs: after.mtimeMs }).toEqual({
      ino: before.ino,
      mtimeMs: before.mtimeMs,
    });
  });

  it("reports the asset and cache path when recovery cannot write", async () => {
    const { env } = await fixture();
    await writeFile(env.PASEO_ADVANCED_MARKDOWN_CACHE, "obstructed cache");
    expect(() => readRuntimeAssetSync(assets.resvg, env)).toThrow(
      `Renderer asset resvg.wasm could not be restored at ${preparedAssetPath(assets.resvg, env)}`,
    );
    await expect(readRuntimeAsset(assets.resvg, env)).rejects.toThrow(/Check cache permissions/);
  });

  it("handles simultaneous cold starts without leaving partial or temporary assets", async () => {
    const { env } = await fixture();
    const code = [
      `import { readRuntimeAssetSync } from ${JSON.stringify(new URL("../server/assets/runtime.mjs", import.meta.url).href)};`,
      `for (const asset of ${JSON.stringify(Object.values(assets))}) readRuntimeAssetSync(asset);`,
    ].join("\n");
    const exec = promisify(execFile);
    await Promise.all(
      [0, 1, 2].map(() =>
        exec(process.execPath, ["--input-type=module", "-e", code], {
          env: { ...process.env, ...env },
        }),
      ),
    );
    for (const asset of Object.values(assets))
      expect(readPreparedAssetSync(asset, env).length).toBe(asset.bytes);
    expect((await readdir(path.dirname(preparedAssetPath(assets.resvg, env)))).sort()).toEqual(
      Object.values(assets)
        .map((asset) => path.basename(preparedAssetPath(asset, env)))
        .sort(),
    );
  });

  it("prepares the exact pinned WASM and readable font data without a browser", async () => {
    const { env } = await fixture();
    await prepareAssets(root, env);
    const original = await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm"));
    expect((await readPreparedAsset(assets.resvg, env)).equals(original)).toBe(true);
    expect(readPreparedAssetSync(assets.resvg, env).equals(original)).toBe(true);
    expect(
      Object.keys(JSON.parse(readPreparedAssetSync(assets.fonts, env).toString("utf8"))).length,
    ).toBeGreaterThan(10);
  });

  it("rejects missing or changed cached bytes and repairs them from the package", async () => {
    const { env } = await fixture();
    await expect(readPreparedAsset(assets.resvg, env)).rejects.toThrow(/not prepared/);
    expect(() => readPreparedAssetSync(assets.resvg, env)).toThrow(/not prepared/);
    await prepareAssets(root, env);
    const bytes = await readPreparedAsset(assets.resvg, env);
    const changed = Buffer.from(bytes);
    changed[100] ^= 1;
    await writeFile(preparedAssetPath(assets.resvg, env), changed);
    await expect(readPreparedAsset(assets.resvg, env)).rejects.toThrow(/integrity/);
    expect(() => readPreparedAssetSync(assets.resvg, env)).toThrow(/integrity/);
    await prepareAssets(root, env);
    expect((await readPreparedAsset(assets.resvg, env)).equals(bytes)).toBe(true);
  });

  it("survives checkout relocation and preserves assets used by older versions", async () => {
    const { dir, env } = await fixture();
    const checkout = path.join(dir, "staging");
    await mkdir(path.join(checkout, "server/generated"), { recursive: true });
    for (const file of ["assets.json", ...Object.values(assets).map((asset) => asset.file)]) {
      await cp(
        path.join(root, "server/generated", file),
        path.join(checkout, "server/generated", file),
      );
    }
    await prepareAssets(checkout, env);
    const oldFile = path.join(
      path.dirname(preparedAssetPath(assets.resvg, env)),
      "older-version.wasm",
    );
    await writeFile(oldFile, "old data");
    const activated = path.join(dir, "activated");
    await rename(checkout, activated);
    await prepareAssets(activated, env);
    await rm(activated, { recursive: true });
    expect((await readPreparedAsset(assets.resvg, env)).length).toBe(assets.resvg.bytes);
    expect(await readFile(oldFile, "utf8")).toBe("old data");
  });

  it("rejects a damaged packaged asset before putting it in the cache", async () => {
    const { dir, env } = await fixture();
    const checkout = path.join(dir, "broken");
    await mkdir(path.join(checkout, "server/generated"), { recursive: true });
    await writeFile(
      path.join(checkout, "server/generated/assets.json"),
      JSON.stringify({ resvg: assets.resvg }),
    );
    await writeFile(path.join(checkout, "server/generated", assets.resvg.file), "broken");
    await expect(prepareAssets(checkout, env)).rejects.toThrow(/integrity/);
    await expect(readPreparedAsset(assets.resvg, env)).rejects.toThrow(/not prepared/);
  });

  it("initializes the renderer from the prepared binary and produces real PNGs", async () => {
    const { env } = await fixture();
    await prepareAssets(root, env);
    vi.stubEnv("PASEO_ADVANCED_MARKDOWN_CACHE", env.PASEO_ADVANCED_MARKDOWN_CACHE);
    for (const display of [false, true]) {
      const result = await renderFormula({
        expression: String.raw`\frac{p}{q}`,
        display,
        color: "#ffffff",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`Rendering failed: ${result.reason}`);
      const image = decodePng(result.png);
      expect(image.width).toBe(result.width * 2);
      expect(image.height).toBe(result.height * 2);
      expect(inkCount(image.rgba)).toBeGreaterThan(30);
    }
  });
});

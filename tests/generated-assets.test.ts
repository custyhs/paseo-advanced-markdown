import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import assets from "../server/generated/assets.json";

const require = createRequire(import.meta.url);
const generated = new URL("../server/generated/", import.meta.url);

describe("generated renderer data assets", () => {
  it("preserves the exact pinned rasterizer binary with a matching integrity descriptor", async () => {
    const original = await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm"));
    const packaged = await readFile(new URL(assets.resvg.file, generated));
    expect(packaged.equals(original)).toBe(true);
    expect(assets.resvg.bytes).toBe(packaged.length);
    expect(assets.resvg.sha256).toBe(createHash("sha256").update(packaged).digest("hex"));
  });

  it("preserves every SVG font export after resolving its static metrics and paths", async () => {
    const fontRoot = path.join(
      path.dirname(require.resolve("mathjax-full/package.json")),
      "js/output/svg/fonts/tex",
    );
    const files = (await readdir(fontRoot)).filter((name) => name.endsWith(".js")).sort();
    const bytes = await readFile(new URL(assets.fonts.file, generated));
    const packaged = JSON.parse(bytes.toString("utf8"));
    expect(Object.keys(packaged).sort()).toEqual(files);
    expect(files).toHaveLength(24);
    for (const filename of files) {
      const original = Object.fromEntries(Object.entries(require(path.join(fontRoot, filename))));
      expect(packaged[filename]).toStrictEqual(original);
    }
    expect(assets.fonts.bytes).toBe(bytes.length);
    expect(assets.fonts.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});

import { describe, expect, it } from "vitest";
import { checkPackageSourceBudget } from "../scripts/lib/package-budget.mjs";

describe("published package source budget", () => {
  it("counts generated JS and declarations even when no entry imports them", () => {
    expect(
      checkPackageSourceBudget([
        { path: "index.client.tsx", size: 10 },
        { path: "index.server.ts", size: 20 },
        { path: "client/generated/unused.js", size: 30 },
        { path: "client/generated/unused.d.ts", size: 40 },
        { path: "server/generated/unused.mjs", size: 50 },
        { path: "server/generated/unused.d.mts", size: 60 },
        { path: "shared/contract.cts", size: 70 },
        { path: "scripts/prepare-browser.mjs", size: 80 },
        { path: "server/generated/resvg.wasm", size: 3_000_000 },
        { path: "server/generated/font-data.json", size: 1_000_000 },
        { path: "README.md", size: 100 },
      ]),
    ).toEqual({
      sourceFiles: 8,
      sourceBytes: 360,
      largestSource: { path: "scripts/prepare-browser.mjs", size: 80 },
    });
  });

  it("accepts the exact cumulative byte limit", () => {
    expect(
      checkPackageSourceBudget([
        { path: "server/math/render.js", size: 1_900_000 },
        { path: "client/generated/markdown.d.ts", size: 100_000 },
      ]).sourceBytes,
    ).toBe(2_000_000);
  });

  it("rejects a cumulative overflow even when each file is within the limit", () => {
    expect(() =>
      checkPackageSourceBudget([
        { path: "server/math/render.js", size: 1_900_000 },
        { path: "client/generated/unreferenced.d.ts", size: 100_001 },
      ]),
    ).toThrow("Package source total exceeds 2000000 bytes: 2000001");
  });

  it("rejects one oversized generated source with its path and size", () => {
    expect(() =>
      checkPackageSourceBudget([{ path: "server/generated/wasm.ts", size: 2_000_001 }]),
    ).toThrow("Package source file exceeds 2000000 bytes: server/generated/wasm.ts (2000001)");
  });

  it("accepts 200 source files and rejects the 201st", () => {
    const files = Array.from({ length: 200 }, (_, index) => ({
      path: `shared/generated/${index}.ts`,
      size: 1,
    }));
    expect(checkPackageSourceBudget(files).sourceFiles).toBe(200);
    expect(() =>
      checkPackageSourceBudget([...files, { path: "client/generated/extra.d.ts", size: 1 }]),
    ).toThrow("Package source count exceeds 200 files: 201");
  });

  it("rejects invalid sizes instead of silently bypassing the total", () => {
    expect(() =>
      checkPackageSourceBudget([{ path: "server/generated/data.js", size: Number.NaN }]),
    ).toThrow("Invalid package source size");
  });
});

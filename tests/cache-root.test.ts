import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCacheRoot } from "../server/mermaid/cache-root.mjs";

afterEach(() => vi.restoreAllMocks());

describe("renderer cache root", () => {
  it.each(["linux", "darwin"] as const)("uses the home cache by default on %s", (platform) => {
    vi.spyOn(os, "homedir").mockReturnValue("/home/example");
    expect(resolveCacheRoot({}, platform)).toBe("/home/example/.cache/paseo-advanced-markdown");
  });

  it("uses the Windows local application directory by default", () => {
    vi.spyOn(os, "homedir").mockReturnValue("C:\\Users\\example");
    expect(resolveCacheRoot({}, "win32")).toBe(
      "C:\\Users\\example\\AppData\\Local\\paseo-advanced-markdown",
    );
  });

  it("normalizes an absolute override before consulting platform defaults", () => {
    expect(
      resolveCacheRoot(
        {
          PASEO_ADVANCED_MARKDOWN_CACHE: "/renderer/candidate/../shared",
          XDG_CACHE_HOME: "relative",
        },
        "linux",
      ),
    ).toBe("/renderer/shared");
  });

  it.each([
    ["D:\\renderer\\candidate\\..\\shared", "D:\\renderer\\shared"],
    ["\\\\server\\share\\renderer", "\\\\server\\share\\renderer"],
  ])("accepts fully qualified Windows override %s", (override, expected) => {
    expect(resolveCacheRoot({ PASEO_ADVANCED_MARKDOWN_CACHE: override }, "win32")).toBe(expected);
  });

  it.each([
    ["linux", "relative/cache"],
    ["darwin", "../cache"],
    ["win32", "relative\\cache"],
    ["win32", "C:relative\\cache"],
    ["win32", "\\cache"],
  ] as const)("rejects cwd-dependent override %s:%s", (platform, override) => {
    expect(() => resolveCacheRoot({ PASEO_ADVANCED_MARKDOWN_CACHE: override }, platform)).toThrow(
      "PASEO_ADVANCED_MARKDOWN_CACHE must be an absolute path",
    );
  });

  it("uses an absolute XDG directory and treats a blank override as unset", () => {
    expect(
      resolveCacheRoot(
        { PASEO_ADVANCED_MARKDOWN_CACHE: "  ", XDG_CACHE_HOME: "/var/cache/user" },
        "linux",
      ),
    ).toBe("/var/cache/user/paseo-advanced-markdown");
  });

  it("ignores a relative XDG directory instead of resolving it against the checkout", () => {
    vi.spyOn(os, "homedir").mockReturnValue("/home/example");
    expect(resolveCacheRoot({ XDG_CACHE_HOME: "relative/cache" }, "linux")).toBe(
      "/home/example/.cache/paseo-advanced-markdown",
    );
  });

  it("uses an absolute Windows local application directory", () => {
    expect(resolveCacheRoot({ LOCALAPPDATA: "D:\\LocalData" }, "win32")).toBe(
      "D:\\LocalData\\paseo-advanced-markdown",
    );
  });

  it.each(["relative\\cache", "D:cache", "\\cache"])(
    "ignores cwd-dependent LOCALAPPDATA %s",
    (localAppData) => {
      vi.spyOn(os, "homedir").mockReturnValue("C:\\Users\\example");
      expect(resolveCacheRoot({ LOCALAPPDATA: localAppData }, "win32")).toBe(
        "C:\\Users\\example\\AppData\\Local\\paseo-advanced-markdown",
      );
    },
  );
});

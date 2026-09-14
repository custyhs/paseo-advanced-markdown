// Exercises the real pinned Mermaid CLI and Chrome headless shell. Requires a
// prepared cache root: PASEO_ADVANCED_MARKDOWN_CACHE=<root> npm run prepare-browser.
import { access } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { cacheLayout, resolveCacheRoot } from "../server/mermaid/cache-root.mjs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  browserArguments,
  mermaidCacheSize,
  renderDiagram,
  resetMermaidForTests,
  stopMermaid,
} from "../server/mermaid/render.js";
import { resolveMermaidRuntime } from "../server/mermaid/runtime.js";
import { decodePng, inkCount } from "./helpers/png.js";

const layout = cacheLayout(resolveCacheRoot());
let prepared = false;
beforeAll(async () => {
  prepared = await access(layout.manifest).then(
    () => true,
    () => false,
  );
});

const flow = [
  "flowchart LR",
  "  A[开始] --> B{是否通过?}",
  "  B -->|是| C[发布]",
  "  B -->|否| D[修复]",
  "  D --> A",
].join("\n");

describe("Mermaid rendering through the pinned local runtime", () => {
  it("reports an actionable unavailable state when nothing is prepared", async () => {
    const resolution = await resolveMermaidRuntime({
      PASEO_ADVANCED_MARKDOWN_CACHE: "/nonexistent/paseo-advanced-markdown",
    });
    expect(resolution.ready).toBe(false);
    if (!resolution.ready) expect(resolution.message).toMatch(/not prepared/);
  });

  it("rejects empty and oversized definitions before touching the browser", async () => {
    resetMermaidForTests();
    expect(await renderDiagram({ source: "   ", theme: "default" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await renderDiagram({ source: "x".repeat(32 * 1024 + 1), theme: "default" })).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  it("renders a flowchart with Chinese labels to a transparent 2x PNG", async (context) => {
    if (!prepared) return context.skip();
    resetMermaidForTests();
    const started = Date.now();
    const result = await renderDiagram({ source: flow, theme: "default" });
    const coldMs = Date.now() - started;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const decoded = decodePng(result.png);
    expect(decoded.width).toBe(result.width * result.scale);
    expect(decoded.height).toBe(result.height * result.scale);
    expect(decoded.width).toBeGreaterThan(200);
    expect(inkCount(decoded.rgba)).toBeGreaterThan(1000);
    // Transparent background: corner pixel carries no alpha.
    expect(decoded.rgba[3]).toBe(0);
    const again = await renderDiagram({ source: flow, theme: "default" });
    expect(again).toBe(result);
    expect(mermaidCacheSize()).toBe(1);
    console.log(
      JSON.stringify({
        coldMs,
        width: result.width,
        height: result.height,
        pngKiB: Math.round((result.png.length * 3) / 4 / 1024),
      }),
    );
  });

  it("renders the dark theme as a different image", async (context) => {
    if (!prepared) return context.skip();
    const light = await renderDiagram({ source: flow, theme: "default" });
    const dark = await renderDiagram({ source: flow, theme: "dark" });
    expect(light.ok && dark.ok).toBe(true);
    if (light.ok && dark.ok) expect(dark.png).not.toBe(light.png);
  });

  it("keeps invalid syntax as an invalid failure with a short cause", async (context) => {
    if (!prepared) return context.skip();
    const result = await renderDiagram({ source: "notadiagram\n  A --> B", theme: "default" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid");
      expect((result.message ?? "").length).toBeLessThanOrEqual(512);
    }
  });

  it("renders sequence, class, state, ER, and Gantt diagrams", async (context) => {
    if (!prepared) return context.skip();
    const sources = {
      sequence: "sequenceDiagram\n  Alice->>Bob: 你好\n  Bob-->>Alice: Hi",
      class:
        "classDiagram\n  class Animal {\n    +String name\n    +speak()\n  }\n  Animal <|-- Dog",
      state: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> [*]",
      er: "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE : contains",
      gantt:
        "gantt\n  title 计划\n  dateFormat YYYY-MM-DD\n  section A\n  任务一 :a1, 2026-09-01, 3d\n  任务二 :after a1, 2d",
    };
    const timings: Record<string, number> = {};
    for (const [name, source] of Object.entries(sources)) {
      const started = Date.now();
      const result = await renderDiagram({ source, theme: "default" });
      timings[name] = Date.now() - started;
      expect(result.ok, `${name}: ${JSON.stringify(result)}`).toBe(true);
      if (result.ok) expect(inkCount(decodePng(result.png).rgba)).toBeGreaterThan(500);
    }
    console.log(JSON.stringify({ warmMs: timings }));
  });

  it("cannot reach the network with the launch flags the worker uses", async (context) => {
    if (!prepared) return context.skip();
    const runtime = await resolveMermaidRuntime();
    if (!runtime.ready) throw new Error(runtime.message);
    let hits = 0;
    const server = createServer((_request, response) => {
      hits++;
      response.end("<html><body>reached</body></html>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const result = spawnSync(
        runtime.runtime.executablePath,
        [...browserArguments(), "--dump-dom", `http://127.0.0.1:${port}/probe`],
        { encoding: "utf8", timeout: 20_000 },
      );
      expect(result.stdout).not.toContain("reached");
      expect(hits).toBe(0);
      // A diagram that names a remote image still renders without contacting it.
      const result2 = await renderDiagram({
        source: `flowchart LR\n  A["<img src='http://127.0.0.1:${port}/img.png'>label"] --> B`,
        theme: "default",
      });
      expect(result2.ok).toBe(true);
      expect(hits).toBe(0);
    } finally {
      server.close();
    }
  }, 40_000);

  it("stops cleanly without leaving children", async () => {
    await stopMermaid();
    expect(mermaidCacheSize()).toBe(0);
    resetMermaidForTests();
  });
});

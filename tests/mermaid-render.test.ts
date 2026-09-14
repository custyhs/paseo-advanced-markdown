// Exercises the real pinned Mermaid CLI and Chrome headless shell. Requires a
// prepared cache root: PASEO_ADVANCED_MARKDOWN_CACHE=<root> npm run prepare-browser.
import { access } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { cacheLayout, resolveCacheRoot } from "../server/mermaid/cache-root.mjs";
import {
  mermaidCacheSize,
  renderDiagram,
  resetMermaidForTests,
  stopMermaid,
} from "../server/mermaid/render.js";
import { resolveMermaidRuntime } from "../server/mermaid/runtime.js";
import { decodePng, inkCount } from "./math-render.test.js";

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
    const resolution = await resolveMermaidRuntime({ PASEO_ADVANCED_MARKDOWN_CACHE: "/nonexistent/paseo-advanced-markdown" });
    expect(resolution.ready).toBe(false);
    if (!resolution.ready) expect(resolution.message).toMatch(/not prepared/);
  });

  it("rejects empty and oversized definitions before touching the browser", async () => {
    resetMermaidForTests();
    expect(await renderDiagram({ source: "   ", theme: "default" })).toEqual({ ok: false, reason: "invalid" });
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
    console.log(JSON.stringify({ coldMs, width: result.width, height: result.height, pngKiB: Math.round((result.png.length * 3) / 4 / 1024) }));
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
      class: "classDiagram\n  class Animal {\n    +String name\n    +speak()\n  }\n  Animal <|-- Dog",
      state: "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> [*]",
      er: "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE : contains",
      gantt: "gantt\n  title 计划\n  dateFormat YYYY-MM-DD\n  section A\n  任务一 :a1, 2026-09-01, 3d\n  任务二 :after a1, 2d",
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

  it("stops cleanly without leaving children", async () => {
    await stopMermaid();
    expect(mermaidCacheSize()).toBe(0);
    resetMermaidForTests();
  });
});

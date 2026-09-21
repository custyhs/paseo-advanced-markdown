// Smoke against the selected official runtime and pinned 0.8 app source fixtures:
// - the compiler shipped in @getpaseo/server builds both bundles;
// - the server bundle is evaluated the way the daemon subprocess does and its
//   RPCs are invoked with contract validation;
// - the client bundle is evaluated in a registration harness, then the official
//   app's transformTimelineItem, projectPluginTimelineItems, and applyStreamEvent
//   (fetched by scripts/paseo-source.mjs) run over synthetic streams.
// Harness only: no React Native UI is rendered here.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { transformSync } from "@babel/core";
import { transformTimelineItem } from "../.paseo-source/packages/app/src/plugins/timeline/model.ts";
import { projectPluginTimelineItems } from "../.paseo-source/packages/app/src/plugins/timeline/projection.ts";
import { splitMarkdownBlocks } from "../.paseo-source/packages/app/src/utils/split-markdown-blocks.ts";
import { resolveMermaidRuntime } from "../server/mermaid/runtime.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
// Keep the 0.8 development dependencies as the oldest supported baseline. An
// isolated runtime can supply a newer official compiler and SDK without changing
// the lockfile. App projection fixtures remain pinned to the 0.8 source checkout.
const runtimeRoot = path.resolve(process.env.PASEO_COMPAT_RUNTIME ?? root);
const runtimeRequire = createRequire(path.join(runtimeRoot, "package.json"));
const runtimeImport = (name) => {
  const resolved = runtimeRequire.resolve(name);
  const relative = path.relative(path.join(runtimeRoot, "node_modules"), resolved);
  assert.ok(
    relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `${name} resolved outside the selected runtime: ${resolved}`,
  );
  return import(pathToFileURL(resolved).href);
};
const sdk = await runtimeImport("@getpaseo/plugin");
const clientSdk = await runtimeImport("@getpaseo/plugin/client");
const nativeSdk = await runtimeImport("@getpaseo/plugin/client/react-native");
const uiSdk = await runtimeImport("@getpaseo/plugin/client/ui");
const { assertPluginCompatibility } = await runtimeImport("@getpaseo/protocol/plugin-requirements");
const serverRoot = path.join(runtimeRoot, "node_modules/@getpaseo/server");
const serverPackage = JSON.parse(await readFile(path.join(serverRoot, "package.json"), "utf8"));
const serverDist = path.join(serverRoot, "dist/server/server/plugins");
const { compilePlugin } = await import(pathToFileURL(path.join(serverDist, "compiler.js")).href);
const { readPluginManifest } = await import(
  pathToFileURL(path.join(serverDist, "manifest.js")).href
);
const report = {
  paseo: `${serverPackage.version} compiler and SDK; projection/stream fixtures from v0.8.0`,
  steps: {},
};

export async function loadCompiledPlugin() {
  const manifest = await readPluginManifest(root);
  for (const runtime of ["app", "daemon"]) {
    assertPluginCompatibility({
      id: manifest.id,
      requirements: manifest.requirements,
      version: serverPackage.version,
      runtime,
    });
  }
  const bundles = await compilePlugin({
    client: path.join(root, "index.client.tsx"),
    server: path.join(root, "index.server.ts"),
  });
  assert.ok(bundles.clientBundle && bundles.serverBundle);
  const handlers = new Map();
  const settings = [];
  // Evaluate exactly as the daemon's plugin-process does (globalThis.eval of the wrapped bundle).
  // biome-ignore lint/security/noGlobalEval: mirrors the daemon's bundle evaluation
  const evaluateServer = globalThis.eval;
  const factory = evaluateServer(bundles.serverBundle);
  const entry = factory((name) => {
    if (name === "@getpaseo/plugin") return sdk;
    if (name === "@getpaseo/plugin/server") return {};
    if (name.startsWith("@getpaseo/plugin/client"))
      throw new Error(`client module in server bundle: ${name}`);
    return require(name);
  });
  const cleanup = entry.default({
    handle(contract, handler) {
      handlers.set(contract.name, { contract, handler });
    },
    registerSettings(definition) {
      settings.push(definition.id);
    },
    registerProvider() {
      throw new Error("unexpected provider registration");
    },
    on() {
      return () => {};
    },
    before() {
      return () => {};
    },
  });
  assert.equal(typeof cleanup, "function");
  async function invoke(method, input) {
    const registered = handlers.get(method);
    assert.ok(registered, `No registered RPC ${method}`);
    const parsed = await registered.contract.input.parseAsync(input);
    return registered.contract.output.parseAsync(await registered.handler(parsed, {}));
  }
  return {
    bundles,
    invoke,
    cleanup,
    id: manifest.id,
    methods: [...handlers.keys()].sort(),
    settings,
  };
}

async function loadStreamRuntime() {
  // Bundle the unmodified released helper solely to resolve the app's @/ alias.
  // This is the same head/tail assembly path used by the running app, including
  // Markdown block promotion and turn-completion flushing, not a mock reducer.
  const app = path.join(root, ".paseo-source/packages/app/src");
  const protocol = path.join(root, ".paseo-source/packages/protocol/src");
  const result = await build({
    entryPoints: [path.join(app, "types/stream.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    alias: { "@": app, "@getpaseo/protocol": protocol },
    tsconfigRaw: {},
    write: false,
    logLevel: "silent",
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(
    require,
    module,
    module.exports,
  );
  return module.exports;
}

const samples = {
  mathInline: String.raw`Prefix $r_*$ then \(Q^{r_*}\) and $e_{r_*}$; suffix after math.`,
  mathDisplay: "Intro\n\n$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$\n\nOutro",
  mathFence: "Fenced:\n\n```math\nE = mc^2\n\n\\alpha + \\beta\n```\n\nDone",
  mermaid: "Flow:\n\n```mermaid\nflowchart LR\n  A[开始] --> B{判断}\n  B -->|是| C\n```\n\nEnd",
  mixed: [
    "# Mixed",
    "",
    "Inline $E=mc^2$ and a table:",
    "",
    "| a | b |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "```mermaid",
    "sequenceDiagram",
    "  Alice->>Bob: 你好",
    "```",
    "",
    "$$",
    "\\sum_{i=1}^n i",
    "$$",
    "",
    "```python",
    "print('$x$')",
    "```",
  ].join("\n"),
  plain: "An ordinary completed answer with `code` and a [link](https://example.org).",
  image: "Formula $x$ and ![figure](https://example.org/a.png)",
  blankLineDisplay: "$$\na^2\n\n+b^2=c^2\n$$",
};

async function exerciseClientBundle(bundle, id) {
  const timelineTransformers = [];
  const timelineRenderers = [];
  const settingsScreens = [];
  const rpcCalls = [];
  function register(items, contribution) {
    items.push(contribution);
    return () => {
      const index = items.indexOf(contribution);
      if (index !== -1) items.splice(index, 1);
    };
  }
  const requested = new Set();
  // biome-ignore lint/security/noGlobalEval: mirrors the app's bundle evaluation
  const evaluateClient = globalThis.eval;
  const factory = evaluateClient(bundle);
  assert.equal(typeof factory, "function");
  const entry = factory((name) => {
    requested.add(name);
    if (name === "@getpaseo/plugin") return sdk;
    if (name === "@getpaseo/plugin/client")
      return { ...clientSdk, useSettings: () => ({ status: "loading" }) };
    if (name === "@getpaseo/plugin/client/react-native") return nativeSdk;
    if (name === "@getpaseo/plugin/client/ui") return uiSdk;
    if (name === "@tanstack/react-query") return require("@tanstack/react-query");
    if (name === "react-native") return require("react-native-web");
    if (name === "react") {
      const react = require("react");
      // Metro exposes this namespace shape to evaluated Android plugin bundles.
      // Legacy CommonJS dependencies must tolerate Component under default.
      return { ...react, Component: undefined, default: react };
    }
    if (name === "react/jsx-runtime" || name === "zod") return require(name);
    throw new Error(`Module "${name}" is not available in plugin client code: ${name}`);
  });
  const cleanup = entry.default({
    addTimelineTransformer: (value) => register(timelineTransformers, value),
    addTimelineRenderer: (value) => register(timelineRenderers, value),
    addSettingsScreen: (value) => register(settingsScreens, value),
    rpc(contract) {
      rpcCalls.push(contract.name);
      assert.equal(contract.name, "settings.modules.read");
      return Promise.resolve({
        status: "ready",
        revision: "r1",
        values: { math: true, mermaid: true },
      });
    },
  });
  assert.equal(typeof cleanup, "function");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(rpcCalls, ["settings.modules.read"]);
  assert.equal(timelineRenderers.length, 1);
  assert.equal(timelineTransformers.length, 1);
  assert.equal(settingsScreens.length, 1);
  try {
    // A competing plugin registered earlier owns matching items: first result wins.
    const competitor = {
      id: "competitor",
      timelineTransformers: [
        {
          id: "grab-mermaid",
          query: { itemType: "assistant_message" },
          transform({ item }) {
            return item.text.includes("```mermaid")
              ? { items: [{ type: "plugin", kind: "other", version: 1, data: {} }] }
              : undefined;
          },
        },
      ],
      timelineRenderers: [],
    };
    const installed = { id, timelineTransformers, timelineRenderers };
    const transform = (input) => transformTimelineItem({ ...input, plugins: [installed] });
    const transformWithCompetitor = (input) =>
      transformTimelineItem({ ...input, plugins: [competitor, installed] });
    const { applyStreamEvent } = await loadStreamRuntime();
    const timestamp = new Date("2026-09-14T12:00:00.000Z");
    const project = (state, fn = transform) => [
      ...projectPluginTimelineItems(state.tail, fn),
      ...projectPluginTimelineItems(state.head, fn),
    ];
    const sourceOf = (row) => (row.kind === "plugin" ? row.data.text : row.text);
    function stream(text, check, chunk = 1) {
      let state = { tail: [], head: [] };
      let assembled = "";
      for (let index = 0; index < text.length; index += chunk) {
        const piece = text.slice(index, index + chunk);
        assembled += piece;
        state = applyStreamEvent({
          ...state,
          event: {
            type: "timeline",
            provider: "codex",
            item: { type: "assistant_message", messageId: "synthetic-message", text: piece },
          },
          timestamp,
        });
        check(project(state), assembled, false);
      }
      state = applyStreamEvent({
        ...state,
        event: { type: "turn_completed", provider: "codex" },
        timestamp,
      });
      assert.deepEqual(state.head, [], "Completion must flush the live head");
      const rows = project(state);
      check(rows, text, true);
      return { rows, state };
    }
    const outcomes = {};

    // 1. Inline math: one row, identity preserved while it grows, plugin once closed.
    {
      let pluginRowId;
      let firstPluginAt = null;
      stream(samples.mathInline, (rows, assembled, complete) => {
        assert.equal(rows.length, 1, "network chunks must never split the row");
        assert.equal(sourceOf(rows[0]), assembled, "projection must preserve every character");
        if (rows[0].kind === "plugin") {
          firstPluginAt ??= assembled.length;
          pluginRowId ??= rows[0].id;
          assert.equal(rows[0].id, pluginRowId, "appending text must preserve row identity");
          assert.equal(rows[0].itemKind, "advanced-markdown");
          assert.deepEqual(timelineRenderers[0].schema.parse(rows[0].data), { text: assembled });
        }
        if (complete) assert.equal(rows[0].kind, "plugin");
      });
      outcomes.inlineMath = { firstPluginAtChars: firstPluginAt, closeAt: "Prefix $r_*$".length };
    }

    // 2. Display math with paragraphs: the host promotes completed Markdown blocks
    //    into separate source items. Each item is transformed on its own.
    {
      const { rows } = stream(samples.mathDisplay, () => {});
      outcomes.displayMath = rows.map((row) => [row.kind, sourceOf(row)]);
      assert.deepEqual(outcomes.displayMath, [
        ["assistant_message", "Intro"],
        ["plugin", "$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$"],
        ["assistant_message", "Outro"],
      ]);
    }

    // 3. Math fence with an inner blank line stays one block (fences are atomic).
    {
      const { rows } = stream(samples.mathFence, () => {}, 7);
      outcomes.mathFence = rows.map((row) => [row.kind, sourceOf(row)]);
      assert.deepEqual(outcomes.mathFence, [
        ["assistant_message", "Fenced:"],
        ["plugin", "```math\nE = mc^2\n\n\\alpha + \\beta\n```"],
        ["assistant_message", "Done"],
      ]);
    }

    // 4. Mermaid fence: stays assistant while unclosed, becomes plugin when closed.
    {
      const unclosedKinds = new Set();
      const { rows } = stream(
        samples.mermaid,
        (projected, assembled) => {
          if (assembled.includes("```mermaid") && !/```mermaid[\s\S]*\n```/.test(assembled)) {
            for (const row of projected) unclosedKinds.add(row.kind);
          }
        },
        3,
      );
      assert.deepEqual(
        [...unclosedKinds],
        ["assistant_message"],
        "unclosed fences stay readable source",
      );
      outcomes.mermaid = rows.map((row) => [row.kind, sourceOf(row)]);
      assert.deepEqual(outcomes.mermaid, [
        ["assistant_message", "Flow:"],
        ["plugin", "```mermaid\nflowchart LR\n  A[开始] --> B{判断}\n  B -->|是| C\n```"],
        ["assistant_message", "End"],
      ]);
    }

    // 5. Mixed message: every block with math or Mermaid is a plugin row, the
    //    table and the Python fence stay with the host, order is preserved.
    {
      const { rows } = stream(samples.mixed, () => {}, 5);
      outcomes.mixed = rows.map((row) => [row.kind, sourceOf(row).split("\n")[0]]);
      assert.deepEqual(outcomes.mixed, [
        ["assistant_message", "# Mixed"],
        ["plugin", "Inline $E=mc^2$ and a table:"],
        ["assistant_message", "| a | b |"],
        ["plugin", "```mermaid"],
        ["plugin", "$$"],
        ["assistant_message", "```python"],
      ]);
    }

    // 6. Plain, image-bearing, and user items stay with the host.
    {
      const { rows } = stream(samples.plain, () => {});
      assert.deepEqual(
        rows.map((row) => row.kind),
        ["assistant_message"],
      );
      const { rows: imageRows } = stream(samples.image, () => {});
      assert.deepEqual(
        imageRows.map((row) => row.kind),
        ["assistant_message"],
      );
      const user = { kind: "user_message", id: "user", text: samples.mathInline, timestamp };
      assert.deepEqual(projectPluginTimelineItems([user], transform), [user]);
      outcomes.hostKeeps = ["plain", "image", "user_message"];
    }

    // 7. Bare display math with an inner blank line: record the host's real
    //    splitting instead of hiding it. Whatever the host produces is shown as
    //    readable source; the plugin never joins fragments.
    {
      const { rows } = stream(samples.blankLineDisplay, () => {});
      outcomes.blankLineDisplay = {
        hostBlocks: splitMarkdownBlocks(samples.blankLineDisplay),
        rows: rows.map((row) => [row.kind, sourceOf(row)]),
      };
      for (const row of rows) assert.equal(row.kind, "assistant_message");
    }

    // 8. First matching transformer owns the item.
    {
      let state = { tail: [], head: [] };
      state = applyStreamEvent({
        ...state,
        event: {
          type: "timeline",
          provider: "codex",
          item: { type: "assistant_message", messageId: "m", text: samples.mermaid },
        },
        timestamp,
      });
      state = applyStreamEvent({
        ...state,
        event: { type: "turn_completed", provider: "codex" },
        timestamp,
      });
      const rows = project(state, transformWithCompetitor);
      const mermaidRow = rows.find((row) => row.kind === "plugin" && sourceOf(row) === undefined);
      assert.ok(
        mermaidRow && mermaidRow.pluginId === "competitor",
        "earlier plugin wins the Mermaid item",
      );
      outcomes.firstTransformerWins = true;
    }

    // 9. Settings snapshot: disabling both modules returns new items to the host.
    {
      const item = { type: "assistant_message", text: samples.mathInline };
      assert.ok(timelineTransformers[0].transform({ item, phase: "complete" }));
      outcomes.settingsSnapshot = "checked in unit tests";
    }
    return { requestedModules: [...requested].sort(), outcomes };
  } finally {
    await cleanup();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plugin = await loadCompiledPlugin();
  try {
    transformSync(plugin.bundles.clientBundle, {
      babelrc: false,
      configFile: false,
      plugins: [
        {
          visitor: {
            Class(node) {
              throw node.buildCodeFrameError("Client classes must be lowered before Hermes eval");
            },
          },
        },
      ],
    });
    report.steps.compiler = {
      clientBundleBytes: plugin.bundles.clientBundle.length,
      serverBundleBytes: plugin.bundles.serverBundle.length,
      rpcMethods: plugin.methods,
      settings: plugin.settings,
    };
    report.steps.client = await exerciseClientBundle(plugin.bundles.clientBundle, plugin.id);
    await mkdir(path.join(root, ".smoke"), { recursive: true });
    const formula = await plugin.invoke("advanced-markdown.math.render", {
      expression: String.raw`\frac{1}{2} + \sqrt{x^2+y^2}`,
      display: true,
      color: "#fafafa",
    });
    assert.equal(formula.ok, true);
    assert.equal(
      Buffer.from(formula.png, "base64").subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
    );
    await writeFile(path.join(root, ".smoke/formula.png"), Buffer.from(formula.png, "base64"));
    const chineseBox = await plugin.invoke("advanced-markdown.math.render", {
      expression: String.raw`\boxed{\textbf{中文}}`,
      display: true,
      color: "#fafafa",
    });
    assert.equal(chineseBox.ok, true, JSON.stringify(chineseBox));
    await writeFile(
      path.join(root, ".smoke/chinese-box.png"),
      Buffer.from(chineseBox.png, "base64"),
    );
    const invalid = await plugin.invoke("advanced-markdown.math.render", {
      expression: String.raw`\unknownCommand{a}`,
      display: false,
      color: "#111111",
    });
    assert.equal(invalid.ok, false);
    report.steps.math = {
      width: formula.width,
      height: formula.height,
      baseline: formula.baseline,
      invalidFallback: invalid.reason,
      chineseBoldBox: { width: chineseBox.width, height: chineseBox.height },
    };
    const runtime = await resolveMermaidRuntime();
    if (process.env.PASEO_REQUIRE_MERMAID === "1") {
      assert.equal(
        runtime.ready,
        true,
        "Real Mermaid rendering requires a prepared browser runtime",
      );
    }
    const diagram = await plugin.invoke("advanced-markdown.mermaid.render", {
      source: "flowchart LR\n  A[开始] --> B{判断}\n  B -->|是| C[发布]",
      theme: "dark",
    });
    if (runtime.ready) {
      assert.equal(diagram.ok, true, JSON.stringify(diagram));
      await writeFile(path.join(root, ".smoke/diagram.png"), Buffer.from(diagram.png, "base64"));
      const broken = await plugin.invoke("advanced-markdown.mermaid.render", {
        source: "notadiagram\n A --> B",
        theme: "default",
      });
      assert.equal(broken.ok, false);
      report.steps.mermaid = {
        width: diagram.width,
        height: diagram.height,
        scale: diagram.scale,
        invalidFallback: broken.reason,
      };
    } else {
      assert.equal(diagram.ok, false);
      assert.equal(diagram.reason, "unavailable");
      report.steps.mermaid = { unavailable: runtime.message };
    }
    const status = await plugin.invoke("advanced-markdown.status", {});
    report.steps.status = status;
    await writeFile(path.join(root, ".smoke/client.bundle.js"), plugin.bundles.clientBundle);
    await writeFile(path.join(root, ".smoke/report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await plugin.cleanup();
  }
}

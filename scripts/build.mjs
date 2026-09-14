// Build-time steps adapted from paseo-math (Apache-2.0), scripts/build.mjs at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
// Changes: bundles this plugin's extension parser, emits a runtime manifest for
// the daemon side, and keeps the resvg WASM embedding.
import { build } from "esbuild";
import { transformAsync } from "@babel/core";
import transformClasses from "@babel/plugin-transform-classes";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readWorkerSpec } from "./lib/worker-key.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const markdownRoot = path.dirname(
  require.resolve("react-native-markdown-display/package.json"),
);

await mkdir(path.join(root, "client/generated"), { recursive: true });
await mkdir(path.join(root, "server/generated"), { recursive: true });

// Adapt Paseo's Apache-2.0 stable-key patch at c43df5d4c398571f62584b4ad5a629b5fd3b4599.
// Apply in memory to the pinned dependency, never mutate the user's node_modules.
function replaceExact(source, from, to) {
  if (!source.includes(from))
    throw new Error("Pinned Markdown source changed; review stable-key patch");
  return source.replace(from, to);
}
await build({
  stdin: {
    contents:
      'export { default } from "react-native-markdown-display"; export { default as MarkdownIt } from "markdown-it"; export { markdownExtensions, detectExtensions, hasAnyExtension, shouldTakeOver, MATH_INLINE, MATH_BLOCK, MERMAID_BLOCK } from "./shared/markdown/extensions.ts";',
    resolveDir: root,
    loader: "ts",
  },
  outfile: path.join(root, "client/generated/markdown.js"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  alias: {
    "markdown-it": path.dirname(require.resolve("markdown-it/package.json")),
    "react-native-fit-image": path.join(root, "client/fit-image.ts"),
  },
  target: "es2020",
  define: { "process.env.NODE_ENV": '"production"' },
  jsx: "automatic",
  loader: { ".js": "jsx" },
  external: ["react", "react/jsx-runtime", "react-native"],
  legalComments: "eof",
  plugins: [
    {
      name: "stable-markdown-keys",
      setup(context) {
        context.onLoad(
          { filter: /(?:AstRenderer|tokensToAST)\.js$/ },
          async ({ path: filename }) => {
            if (!filename.startsWith(markdownRoot + path.sep)) return;
            let source = await readFile(filename, "utf8");
            if (filename.endsWith("AstRenderer.js")) {
              source = replaceExact(
                source,
                "import getUniqueID from './util/getUniqueID';",
                "",
              );
              source = replaceExact(
                source,
                "key: getUniqueID(),",
                "key: 'rnmr_root',",
              );
            } else {
              source = replaceExact(
                source,
                "import getUniqueID from './getUniqueID';",
                "",
              );
              source = replaceExact(
                source,
                "function createNode(token, tokenIndex)",
                "function createNode(token, tokenIndex, parentKey)",
              );
              source = replaceExact(
                source,
                "const content = token.content;",
                "const content = token.content;\n  const keyPath = parentKey ? `${parentKey}.${tokenIndex}` : `${tokenIndex}`;",
              );
              source = replaceExact(
                source,
                "key: getUniqueID() + '_' + type,",
                "key: `rnmr_${keyPath}_${type}`,",
              );
              source = replaceExact(
                source,
                "children: tokensToAST(token.children)",
                "children: tokensToAST(token.children, keyPath)",
              );
              source = replaceExact(
                source,
                "function tokensToAST(tokens)",
                "function tokensToAST(tokens, parentKey = '')",
              );
              source = replaceExact(
                source,
                "createNode(token, i)",
                "createNode(token, i, parentKey)",
              );
            }
            return { contents: source, loader: "jsx" };
          },
        );
      },
    },
  ],
});
// Hermes' runtime eval class transform fails on this bundled dependency graph.
// Lower classes before Paseo's second compilation, rather than relying on eval
// to transform them on the phone. Keep all other syntax and ESM exports intact.
const markdownFile = path.join(root, "client/generated/markdown.js");
const lowered = await transformAsync(await readFile(markdownFile, "utf8"), {
  filename: markdownFile,
  babelrc: false,
  configFile: false,
  plugins: [transformClasses],
});
if (!lowered?.code) throw new Error("Markdown class lowering produced no code");
await writeFile(markdownFile, lowered.code + "\n");
// The pinned renderer's declarations still import Markdown 10's private Token
// path. Keep its real types, adapted to the public Markdown 15 export, alongside
// the portable bundle. Do not modify installed dependency files.
await writeFile(
  path.join(root, "client/generated/markdown-types.d.ts"),
  replaceExact(
    await readFile(path.join(markdownRoot, "src/index.d.ts"), "utf8"),
    "import Token from 'markdown-it/lib/token';",
    "import type { Token } from 'markdown-it';",
  ),
);
await writeFile(
  path.join(root, "client/generated/markdown.d.ts"),
  [
    'export { default } from "./markdown-types.js";',
    'export type { ASTNode, RenderFunction, RenderRules } from "./markdown-types.js";',
    'export { default as MarkdownIt } from "markdown-it";',
    'export { markdownExtensions, detectExtensions, hasAnyExtension, shouldTakeOver, MATH_INLINE, MATH_BLOCK, MERMAID_BLOCK } from "../../shared/markdown/extensions.js";',
    "",
  ].join("\n"),
);
const wasm = await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm"));
await writeFile(
  path.join(root, "server/generated/wasm.ts"),
  `// Generated by scripts/build.mjs; contains only the pinned resvg WASM binary.\nexport const wasmBase64 = ${JSON.stringify(wasm.toString("base64"))};\n`,
);
// The daemon side needs stable identifiers for its cache directory and status
// report. The worker's install is keyed by its lockfile and browser build so a
// dependency bump produces a fresh, side-by-side runtime.
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const worker = await readWorkerSpec(root);
await writeFile(
  path.join(root, "server/generated/runtime.ts"),
  [
    "// Generated by scripts/build.mjs; identifiers only, no absolute paths.",
    `export const PLUGIN_VERSION = ${JSON.stringify(pkg.version)};`,
    `export const WORKER_KEY = ${JSON.stringify(worker.key)};`,
    `export const MERMAID_CLI_VERSION = ${JSON.stringify(worker.mermaidCliVersion)};`,
    `export const BROWSER = ${JSON.stringify(worker.browser)};`,
    `export const BROWSER_BUILD_ID = ${JSON.stringify(worker.buildId)};`,
    "",
  ].join("\n"),
);
console.log(
  `Prepared portable Markdown, rasterizer assets, and runtime manifest (worker ${worker.key}).`,
);

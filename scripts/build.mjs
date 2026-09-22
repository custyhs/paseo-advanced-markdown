// Build-time steps adapted from paseo-math (Apache-2.0), scripts/build.mjs at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
// Changes: bundles this plugin's extension parser, emits a runtime manifest for
// the daemon side, and prepares standalone renderer data assets.
import { build } from "esbuild";
import { transformAsync } from "@babel/core";
import transformClasses from "@babel/plugin-transform-classes";
import { deepStrictEqual } from "node:assert";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readWorkerSpec } from "./lib/worker-key.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const markdownRoot = path.dirname(require.resolve("react-native-markdown-display/package.json"));
const mathjaxRoot = path.dirname(require.resolve("mathjax-full/package.json"));

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
              source = replaceExact(source, "import getUniqueID from './util/getUniqueID';", "");
              source = replaceExact(source, "key: getUniqueID(),", "key: 'rnmr_root',");
            } else {
              source = replaceExact(source, "import getUniqueID from './getUniqueID';", "");
              source = replaceExact(
                source,
                "function createNode(token, tokenIndex)",
                "function createNode(token, tokenIndex, parentKey)",
              );
              source = replaceExact(
                source,
                "const content = token.content;",
                // biome-ignore lint/suspicious/noTemplateCurlyInString: literal JS source text
                "const content = token.content;\n  const keyPath = parentKey ? `${parentKey}.${tokenIndex}` : `${tokenIndex}`;",
              );
              source = replaceExact(
                source,
                "key: getUniqueID() + '_' + type,",
                // biome-ignore lint/suspicious/noTemplateCurlyInString: literal JS source text
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
await writeFile(markdownFile, `${lowered.code}\n`);
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
// Keep data outside executable source. Installation verifies and copies these
// assets to the content-addressed cache before the plugin checkout is activated.
await writeFile(path.join(root, "server/generated/resvg.wasm"), wasm);
await rm(path.join(root, "server/generated/wasm.ts"), { force: true });
const fontRoot = path.join(mathjaxRoot, "js/output/svg/fonts/tex");
const fontModules = {};
for (const filename of (await readdir(fontRoot)).filter((name) => name.endsWith(".js")).sort()) {
  // These leaf modules apply AddPaths to static character metrics. Snapshot the
  // resulting plain data; FontData classes, variant inheritance, delimiters and
  // all other rendering algorithms remain in the JavaScript bundle.
  const exports = Object.fromEntries(Object.entries(require(path.join(fontRoot, filename))));
  deepStrictEqual(JSON.parse(JSON.stringify(exports)), exports);
  fontModules[filename] = exports;
}
const fonts = Buffer.from(JSON.stringify(fontModules));
await writeFile(path.join(root, "server/generated/mathjax-fonts.json"), fonts);
const descriptor = (file, bytes) => ({
  file,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  bytes: bytes.length,
});
await writeFile(
  path.join(root, "server/generated/assets.json"),
  `${JSON.stringify(
    {
      resvg: descriptor("resvg.wasm", wasm),
      fonts: descriptor("mathjax-fonts.json", fonts),
    },
    null,
    2,
  )}\n`,
);

// The npm artifact installs this file at server/math/render.js. Only MathJax's
// reviewed TeX/SVG profile is bundled; its unused speech/XML dependency tree is
// not installed. Keep local modules external at their original relative paths.
const mathEntry = path.join(root, "server/math/render.ts");
const mathBundle = await build({
  entryPoints: [mathEntry],
  outfile: path.join(root, "server/generated/math-render.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  minify: true,
  external: ["@resvg/resvg-wasm"],
  legalComments: "eof",
  banner: {
    js: [
      "/*! MathJax 3.2.2 — Apache-2.0; see ../generated/mathjax.LICENSE and mathjax.NOTICE.",
      " * Copyright (c) 2009-2022 The MathJax Consortium.",
      " * Copyright (c) 2018-2022 Omar Al-Ithawi and The MathJax Consortium.",
      " * Generated from server/math/render.ts with the existing TeX/SVG configuration.",
      " * This module is installed at server/math/render.js in the npm artifact.",
      " */",
    ].join("\n"),
  },
  metafile: true,
  plugins: [
    {
      name: "math-package-boundary",
      setup(context) {
        context.onResolve({ filter: /^advanced-markdown:font-data$/ }, () => ({
          path: "./font-data.mjs",
          external: true,
        }));
        context.onResolve({ filter: /^\./ }, (args) =>
          args.importer === mathEntry ? { path: args.path, external: true } : undefined,
        );
        context.onLoad(
          { filter: /[/\\]output[/\\]svg[/\\]fonts[/\\]tex[/\\][^/\\]+\.js$/ },
          (args) => {
            if (path.dirname(args.path) !== fontRoot) return;
            const filename = path.basename(args.path);
            const data = fontModules[filename];
            if (!data) throw new Error(`Missing MathJax font data for ${filename}`);
            return {
              contents: [
                'import { fontModule } from "advanced-markdown:font-data";',
                ...Object.keys(data).map((name) => {
                  if (!/^[A-Za-z_$][\w$]*$/.test(name))
                    throw new Error(`Invalid MathJax font export ${name}`);
                  return `export const ${name} = fontModule(${JSON.stringify(filename)})[${JSON.stringify(name)}];`;
                }),
              ].join("\n"),
              loader: "js",
            };
          },
        );
      },
    },
  ],
});
for (const input of Object.keys(mathBundle.metafile.inputs)) {
  const filename = path.resolve(root, input);
  if (filename !== mathEntry && !filename.startsWith(mathjaxRoot + path.sep)) {
    throw new Error(`Unexpected dependency in the bundled MathJax profile: ${input}`);
  }
}
await writeFile(
  path.join(root, "server/generated/mathjax.LICENSE"),
  await readFile(path.join(mathjaxRoot, "LICENSE")),
);
await writeFile(
  path.join(root, "server/generated/mathjax.NOTICE"),
  [
    "MathJax 3.2.2 (https://github.com/mathjax/MathJax-src/tree/3.2.2)",
    "Copyright (c) 2009-2022 The MathJax Consortium.",
    "Copyright (c) 2018-2022 Omar Al-Ithawi and The MathJax Consortium.",
    "Licensed under Apache-2.0; the complete license is in mathjax.LICENSE.",
    "",
    "This plugin bundles the existing core/TeX/SVG profile and configurations",
    "into server/math/render.js. Static SVG font metrics and paths are stored",
    "unchanged in mathjax-fonts.json; rendering algorithms remain JavaScript.",
    "Other changes are bundling and minification. Speech and XML packages",
    "are not included. The build entry and integration are available in the",
    "plugin's source repository under scripts/build.mjs and server/math/render.ts.",
    "",
  ].join("\n"),
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

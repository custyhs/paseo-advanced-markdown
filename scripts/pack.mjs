import assert from "node:assert/strict";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNpm } from "./lib/npm.mjs";
import { checkPackageSourceBudget } from "./lib/package-budget.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".smoke/npm");
const staging = path.join(output, "package");
process.stdout.write(await runNpm(["run", "build"], root));
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

// Keep Git preparation in the checkout. The npm artifact contains generated
// modules and only needs the host-specific browser preparation after install.
const files = [
  "index.client.tsx",
  "index.server.ts",
  "client",
  "server",
  "shared",
  "worker/package.json",
  "worker/package-lock.json",
  "worker/browser.json",
  "scripts/prepare-browser.mjs",
  "scripts/prepare-assets.mjs",
  "scripts/lib/prepare-assets.mjs",
  "scripts/lib/worker-key.mjs",
  "README.md",
  "images",
  "LICENSE",
  "NOTICE",
];
for (const file of files) {
  await mkdir(path.dirname(path.join(staging, file)), { recursive: true });
  await cp(path.join(root, file), path.join(staging, file), { recursive: true });
}
// The public package uses the same renderer, precompiled with only its MathJax
// profile. This avoids installing MathJax's unused speech/XML dependencies and
// keeps build-time MathJax types out of the consumer's compilation graph.
await cp(
  path.join(staging, "server/generated/math-render.js"),
  path.join(staging, "server/math/render.js"),
);
await rm(path.join(staging, "server/math/render.ts"));
await rm(path.join(staging, "server/generated/math-render.js"));
const sourcePackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const {
  private: _private,
  devDependencies: _development,
  scripts: _scripts,
  overrides: _overrides,
  ...metadata
} = sourcePackage;
const packageJson = {
  ...metadata,
  files: [...files, "paseo-plugin.json", "npm-shrinkwrap.json"],
  scripts: {
    "prepare-browser": sourcePackage.scripts["prepare-browser"],
    "prepare-assets": sourcePackage.scripts["prepare-assets"],
  },
  publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
};
const manifest = JSON.parse(await readFile(path.join(root, "paseo-plugin.json"), "utf8"));
manifest.build = [["node", "scripts/prepare-browser.mjs"]];
await writeFile(path.join(staging, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
await writeFile(path.join(staging, "paseo-plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
// Seed from the reviewed development lock instead of resolving fresh ranges
// on every pack. npm removes the development-only graph for this package.
await cp(path.join(root, "package-lock.json"), path.join(staging, "package-lock.json"));
process.stdout.write(
  await runNpm(
    ["install", "--package-lock-only", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"],
    staging,
  ),
);
process.stdout.write(await runNpm(["shrinkwrap"], staging));
const [packed] = JSON.parse(
  await runNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", output], staging),
);
const packedFiles = new Set(packed.files.map((file) => file.path));
const sourceBudget = checkPackageSourceBudget(packed.files);
for (const required of [
  "client/generated/markdown.js",
  "server/generated/resvg.wasm",
  "server/generated/mathjax-fonts.json",
  "server/generated/assets.json",
  "server/generated/asset-recovery.json",
  "server/generated/runtime.ts",
  "server/math/render.js",
  "server/generated/mathjax.LICENSE",
  "worker/package-lock.json",
  "npm-shrinkwrap.json",
  "scripts/prepare-browser.mjs",
  "images/01-math-overview.jpg",
  "images/02-formula-viewer.jpg",
  "images/03-mermaid-diagram.jpg",
])
  assert.ok(packedFiles.has(required), `Missing package asset: ${required}`);
assert.ok(!packedFiles.has("scripts/build.mjs"), "The npm package must not require a source build");
assert.ok(
  !packedFiles.has("server/math/render.ts"),
  "MathJax must be precompiled in the npm package",
);
await writeFile(path.join(output, "pack.json"), `${JSON.stringify(packed, null, 2)}\n`);
await writeFile(
  path.join(output, "source-budget.json"),
  `${JSON.stringify(sourceBudget, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      artifact: path.join(output, packed.filename),
      version: packed.version,
      size: packed.size,
      unpackedSize: packed.unpackedSize,
      files: packed.files.length,
      integrity: packed.integrity,
      sourceBudget,
    },
    null,
    2,
  ),
);

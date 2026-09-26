import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { runNpm } from "./lib/npm.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".smoke/npm");
const packed = JSON.parse(await readFile(path.join(output, "pack.json"), "utf8"));
const tarball = path.resolve(process.argv[2] ?? path.join(output, packed.filename));
const integrity = `sha512-${createHash("sha512")
  .update(await readFile(tarball))
  .digest("base64")}`;
assert.equal(integrity, packed.integrity, "Tarball differs from the recorded package inventory");
// Outside the checkout: a missing production dependency must not silently
// resolve through this repository's development node_modules.
const runtimeRoot = path.resolve(process.env.PASEO_COMPAT_RUNTIME ?? root);
const runtimeRequire = createRequire(path.join(runtimeRoot, "package.json"));
const serverRoot = path.join(runtimeRoot, "node_modules/@getpaseo/server");
const serverPackage = JSON.parse(await readFile(path.join(serverRoot, "package.json"), "utf8"));
let workspace = await realpath(await mkdtemp(path.join(os.tmpdir(), "paseo-markdown-package-")));
let pluginRoot = path.join(workspace, "node_modules", packed.name);
const report = {
  package: `${packed.name}@${packed.version}`,
  integrity,
  paseo: serverPackage.version,
};

try {
  await writeFile(path.join(workspace, "package.json"), '{"private":true}\n');
  process.stdout.write(
    await runNpm(
      ["install", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", tarball],
      workspace,
    ),
  );
  const installed = JSON.parse(await readFile(path.join(pluginRoot, "package.json"), "utf8"));
  assert.equal(installed.version, packed.version);
  assert.notEqual(installed.private, true);
  assert.equal(installed.devDependencies, undefined);
  let packageRequire = createRequire(path.join(pluginRoot, "package.json"));
  for (const dependency of Object.keys(installed.dependencies)) {
    assert.ok(
      packageRequire.resolve(dependency).startsWith(workspace + path.sep),
      `${dependency} escaped isolated install`,
    );
  }
  for (const dependency of [
    "react-native",
    "react-native-markdown-display",
    "@getpaseo/server",
    "esbuild",
    "mathjax-full",
    "speech-rule-engine",
    "@xmldom/xmldom",
  ]) {
    await assert.rejects(access(path.join(workspace, "node_modules", dependency)));
  }
  process.stdout.write(await runNpm(["audit", "--omit=dev", "--audit-level=moderate"], workspace));
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, "paseo-plugin.json"), "utf8"));
  assert.equal(manifest.id, "advanced-markdown");
  assert.deepEqual(manifest.build, [["node", "scripts/prepare-browser.mjs"]]);

  // Exercise the actual package preparation with a separate cache. The user's
  // production worker/browser cache must not be pruned or rewritten by QA.
  process.env.PASEO_ADVANCED_MARKDOWN_CACHE = path.join(output, "cache");
  const prepared = await exec(process.execPath, ["scripts/prepare-browser.mjs"], {
    cwd: pluginRoot,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  process.stdout.write(prepared.stdout);
  if (prepared.stderr) process.stderr.write(prepared.stderr);

  // Paseo activates a prepared candidate by moving its checkout. Asset reads
  // must survive that move, including MathJax's module-initialization reads.
  await rename(workspace, `${workspace}-activated`);
  workspace = `${workspace}-activated`;
  pluginRoot = path.join(workspace, "node_modules", packed.name);
  packageRequire = createRequire(path.join(pluginRoot, "package.json"));
  report.relocatedAfterPreparation = true;

  const serverDist = path.join(serverRoot, "dist/server/server/plugins");
  const { compilePlugin } = await import(pathToFileURL(path.join(serverDist, "compiler.js")).href);
  const { assertPluginCompatibility } = await import(
    pathToFileURL(runtimeRequire.resolve("@getpaseo/protocol/plugin-requirements")).href
  );
  for (const runtime of ["app", "daemon"])
    assertPluginCompatibility({
      id: manifest.id,
      requirements: manifest.requirements,
      version: serverPackage.version,
      runtime,
    });
  const bundles = await compilePlugin({
    client: path.join(pluginRoot, "index.client.tsx"),
    server: path.join(pluginRoot, "index.server.ts"),
  });
  assert.ok(bundles.clientBundle && bundles.serverBundle);
  const sdk = await import(pathToFileURL(runtimeRequire.resolve("@getpaseo/plugin")).href);
  // biome-ignore lint/security/noGlobalEval: evaluates the official compiler output like the daemon
  const evaluate = globalThis.eval;
  function startPlugin() {
    const handlers = new Map();
    const entry = evaluate(bundles.serverBundle)((name) => {
      if (name === "@getpaseo/plugin") return sdk;
      if (name === "@getpaseo/plugin/server") return {};
      if (name === "zod") return runtimeRequire(name);
      return packageRequire(name);
    });
    const cleanup = entry.default({
      handle(contract, handler) {
        handlers.set(contract.name, { contract, handler });
      },
      registerSettings() {},
      on() {
        return () => {};
      },
      before() {
        return () => {};
      },
    });
    assert.equal(typeof cleanup, "function");
    async function invoke(method, input) {
      const { contract, handler } = handlers.get(method);
      return contract.output.parseAsync(await handler(await contract.input.parseAsync(input), {}));
    }
    return { cleanup, invoke };
  }

  const assets = JSON.parse(
    await readFile(path.join(pluginRoot, "server/generated/assets.json"), "utf8"),
  );
  const assetPath = (asset) =>
    path.join(
      process.env.PASEO_ADVANCED_MARKDOWN_CACHE,
      "assets",
      `${asset.sha256}${path.extname(asset.file)}`,
    );
  async function assertAssetCache() {
    for (const asset of Object.values(assets)) {
      const bytes = await readFile(assetPath(asset));
      assert.equal(bytes.length, asset.bytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
    }
  }
  // Neither preexisting cache files nor a runtime path back to the source may
  // hide a broken startup. The compiled bundle must contain its recovery data.
  await rm(path.join(process.env.PASEO_ADVANCED_MARKDOWN_CACHE, "assets"), {
    recursive: true,
    force: true,
  });
  for (const filename of [
    ...Object.values(assets).map((asset) => asset.file),
    "asset-recovery.json",
  ])
    await rm(path.join(pluginRoot, "server/generated", filename));
  const { cleanup, invoke } = startPlugin();
  try {
    await assertAssetCache();
    const status = await invoke("advanced-markdown.status", {});
    assert.equal(status.plugin.version, packed.version);
    assert.equal(status.mermaid.ready, true);
    for (const [name, method, input] of [
      [
        "formula",
        "advanced-markdown.math.render",
        { expression: String.raw`\frac{1}{2} + \sqrt{x^2+y^2}`, display: true, color: "#fafafa" },
      ],
      [
        "math-profile",
        "advanced-markdown.math.render",
        {
          expression: String.raw`\cancel{x} + \mathclap{abc} + \coloneqq + \boxed{\textbf{中文}}`,
          display: true,
          color: "#fafafa",
        },
      ],
      [
        "diagram",
        "advanced-markdown.mermaid.render",
        { source: "flowchart LR\n  A[Start] --> B[Packed plugin]", theme: "dark" },
      ],
    ]) {
      const result = await invoke(method, input);
      assert.equal(result.ok, true, JSON.stringify(result));
      const png = Buffer.from(result.png, "base64");
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      await writeFile(path.join(output, `${name}-${serverPackage.version}.png`), png);
      report[name] = { width: result.width, height: result.height };
    }
    report.bundles = { client: bundles.clientBundle.length, server: bundles.serverBundle.length };
  } finally {
    await cleanup();
  }

  const changed = await readFile(assetPath(assets.resvg));
  changed[100] ^= 1;
  await writeFile(assetPath(assets.resvg), changed);
  await rm(assetPath(assets.fonts));
  const restarted = startPlugin();
  try {
    await assertAssetCache();
    const result = await restarted.invoke("advanced-markdown.math.render", {
      expression: String.raw`\frac{a+b}{c+d}`,
      display: false,
      color: "#fafafa",
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(
      Buffer.from(result.png, "base64").subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
    );
    report.startupRecovery = ["empty-cache", "corrupt-wasm-and-missing-fonts"];
    report.recoveryWithoutPackageFiles = true;
    report.status = "passed";
  } finally {
    await restarted.cleanup();
  }
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, `smoke-${serverPackage.version}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}

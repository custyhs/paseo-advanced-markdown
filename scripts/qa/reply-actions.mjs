// Builds scripts/qa/reply-actions-probe.ts once per pinned official Paseo
// host and runs it, so the plugin's real reply-actions modules are checked
// against each host's own projection, layout, Copy and fork-boundary code.
// Importing host-source.mjs verifies (or fetches) the pinned checkouts first.
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { hosts } from "../host-source.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const probe = path.join(root, "scripts/qa/reply-actions-probe.ts");
const outDir = path.join(root, ".smoke/reply-actions");
const outfile = path.join(outDir, "probe.mjs");

mkdirSync(outDir, { recursive: true });
// The probe merges one section per host; stale sections must not survive.
rmSync(path.join(outDir, "report.json"), { force: true });

const failed = [];
for (const { label, directory } of hosts) {
  const host = path.join(root, directory);
  await build({
    entryPoints: [probe],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    plugins: [
      {
        name: "paseo-host-stubs",
        setup(b) {
          b.onResolve({ filter: /^paseo-host\// }, (args) => ({
            path: path.join(host, "packages/app/src", args.path.slice("paseo-host/".length)),
          }));
          b.onResolve({ filter: /^@\/styles\/theme$/ }, () => ({
            path: "spacing",
            namespace: "stub",
          }));
          b.onResolve({ filter: /^@getpaseo\/protocol\/timeline-turn$/ }, () => ({
            path: path.join(host, "packages/protocol/src/timeline-turn.ts"),
          }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            contents: "export const SPACING = { 1: 4, 2: 8, 4: 16, 8: 32 };",
            loader: "js",
          }));
        },
      },
    ],
  });
  process.env.PASEO_HOST = label;
  try {
    // The query keeps each host's build out of the module cache of the last.
    await import(`${pathToFileURL(outfile).href}?host=${label}`);
  } catch (error) {
    failed.push(label);
    console.error(
      `reply-actions[${label}] FAILED: ${error instanceof Error ? error.message : error}`,
    );
  }
}
if (failed.length > 0) process.exit(1);

// Fetches the exact official Paseo 0.8.0 app sources used by the smoke test:
// the timeline transformer model, projection, and stream reducers are app code
// that no npm package ships. Only the released compiler comes from npm.
import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const revision = "b8e24677e12b226c7c38c1c3a40649daa9f1152f"; // commit of getpaseo/paseo tag v0.8.0 (tag object e432c9b4)
export const source = fileURLToPath(new URL("../.paseo-source", import.meta.url));
const remote = "https://github.com/getpaseo/paseo.git";
const paths = ["packages/app/src", "packages/protocol/src", "packages/plugin/src"];

function run(args, cwd, capture = false, allowFailure = false) {
  const result = spawnSync("git", args, {
    cwd,
    stdio: capture ? ["ignore", "pipe", allowFailure ? "ignore" : "inherit"] : "inherit",
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (allowFailure) return "";
    throw new Error(`git ${args.join(" ")} exited ${result.status}`);
  }
  return capture ? result.stdout.trim() : "";
}

let present = true;
try {
  await access(source);
} catch {
  present = false;
}
if (!present) {
  run(["init", "-q", source], process.cwd());
  run(["remote", "add", "origin", remote], source);
  run(["sparse-checkout", "set", "--no-cone", ...paths], source);
}
if (run(["rev-parse", "--verify", "-q", "HEAD"], source, true, true) !== revision) {
  run(["fetch", "--depth", "1", "origin", revision], source);
  run(["checkout", "-q", "--detach", revision], source);
}
if (run(["rev-parse", "HEAD"], source, true) !== revision) {
  throw new Error("Official source checkout did not reach the pinned revision");
}
if (run(["status", "--porcelain"], source, true)) {
  throw new Error("Refusing to use a modified .paseo-source; reset it first");
}
console.log(`Official Paseo sources ready at ${source} (${revision.slice(0, 12)}, tag v0.8.0)`);

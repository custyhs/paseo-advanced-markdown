// Shared fetcher for pinned official Paseo sources: sparse checkout of the
// given paths at an exact revision. `ref` is what `git fetch --depth 1 origin`
// receives (a PR head ref, for example) and defaults to the revision; the
// HEAD-equals-pin check runs after the fetch either way, so a force-pushed ref
// fails loudly instead of silently changing what dependents run against.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const remote = "https://github.com/getpaseo/paseo.git";

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

export function ensurePaseoCheckout({ revision, directory, paths, label, ref = revision }) {
  if (!existsSync(directory)) {
    run(["init", "-q", directory], process.cwd());
    run(["remote", "add", "origin", remote], directory);
    run(["sparse-checkout", "set", "--no-cone", ...paths], directory);
  }
  if (run(["rev-parse", "--verify", "-q", "HEAD"], directory, true, true) !== revision) {
    run(["fetch", "--depth", "1", "origin", ref], directory);
    run(["checkout", "-q", "--detach", revision], directory);
  }
  if (run(["rev-parse", "HEAD"], directory, true) !== revision) {
    throw new Error(
      `The ${label} checkout at ${directory} did not reach the pinned revision ${revision}`,
    );
  }
  if (run(["status", "--porcelain"], directory, true)) {
    throw new Error(`Refusing to use a modified ${directory}; reset it first`);
  }
  console.log(`Official Paseo sources ready at ${directory} (${revision.slice(0, 12)}, ${label})`);
}

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function runNpm(args, cwd, env = process.env) {
  // npm's JS entry also works on Windows without invoking npm.cmd through a shell.
  assert.ok(process.env.npm_execpath, "Run this script through its npm run command");
  const result = await exec(process.execPath, [process.env.npm_execpath, ...args], {
    cwd,
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout;
}

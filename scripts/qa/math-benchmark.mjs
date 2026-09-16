// Run: node --import tsx scripts/qa/math-benchmark.mjs --root /absolute/plugin/root
// Each invocation is a fresh process. Cold includes first WASM/font initialization;
// warm repeats the same 50 keys. This is host rendering, not UI/RPC performance.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BENCHMARK_FORMULAS, CORPUS_VERSION } from "../../tests/fixtures/math-reading.ts";

const option = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const root = path.resolve(option("root", fileURLToPath(new URL("../../", import.meta.url))));
const density = Number(option("density", "2"));
const outputPath = option("out", "");
const modulePath = path.join(root, "server/math/render.ts");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const rendererHash = createHash("sha256")
  .update(await readFile(modulePath))
  .digest("hex");
const source = BENCHMARK_FORMULAS.map(({ expression, display }) =>
  display ? `\\[${expression}\\]` : `\\(${expression}\\)`,
).join("\n\n");
const fixtureHash = createHash("sha256").update(source).digest("hex");
const { renderFormula, clearMathCache, mathCacheSize } = await import(
  pathToFileURL(modulePath).href
);
const command = (binary, args) => {
  try {
    return execFileSync(binary, args, { encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
};
clearMathCache();
const memoryBefore = process.memoryUsage();
const results = [];
for (const mode of ["cold", "warm"]) {
  const durations = [];
  let imageBytes = 0;
  let payloadBytes = 0;
  let maxImageBytes = 0;
  let peakSampledRss = process.memoryUsage().rss;
  const failures = [];
  const started = performance.now();
  for (const fixture of BENCHMARK_FORMULAS) {
    const start = performance.now();
    const output = await renderFormula({
      expression: fixture.expression,
      display: fixture.display,
      color: "#dedede",
      density,
    });
    durations.push(performance.now() - start);
    payloadBytes += Buffer.byteLength(JSON.stringify(output));
    if (output.ok) {
      const bytes = Buffer.byteLength(output.png, "base64");
      imageBytes += bytes;
      maxImageBytes = Math.max(maxImageBytes, bytes);
    } else failures.push({ id: fixture.id, reason: output.reason });
    peakSampledRss = Math.max(peakSampledRss, process.memoryUsage().rss);
  }
  const totalMs = performance.now() - started;
  durations.sort((a, b) => a - b);
  results.push({
    mode,
    totalMs,
    p50Ms: durations[Math.floor(durations.length * 0.5)],
    p95Ms: durations[Math.ceil(durations.length * 0.95) - 1],
    maxMs: durations.at(-1),
    imageBytes,
    payloadBytes,
    maxImageBytes,
    cacheEntries: mathCacheSize(),
    peakSampledRss,
    memoryAfter: process.memoryUsage(),
    failures,
  });
}
const report = {
  measuredAt: new Date().toISOString(),
  corpus: CORPUS_VERSION,
  fixtureCount: BENCHMARK_FORMULAS.length,
  transcriptSha256: fixtureHash,
  rendererSha256: rendererHash,
  root,
  commit: command("git", ["-C", root, "rev-parse", "HEAD"]),
  version: pkg.version,
  node: process.version,
  os: `${os.type()} ${os.release()} ${os.arch()}`,
  hardware: os.cpus()[0]?.model,
  ramBytes: os.totalmem(),
  density,
  logicalEm: 16,
  textSize: 16,
  formulaSize: 1,
  color: "#dedede",
  scope: "direct host render; no daemon transport, browser, interaction, or native measurements",
  memoryBefore,
  results,
  processMaxRssKiB: process.resourceUsage().maxRSS,
};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) await writeFile(outputPath, json);
process.stdout.write(json);

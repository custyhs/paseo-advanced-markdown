// Reproduce official host boundaries without launching or modifying any daemon.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { detectExtensions, shouldTakeOver } from "../../shared/markdown/extensions.ts";
const option = process.argv.indexOf("--paseo-source");
if (option < 0) throw new Error("Pass --paseo-source /absolute/official-v0.8.0-checkout");
const sourceRoot = path.resolve(process.argv[option + 1]);
const { splitMarkdownBlocks } = await import(
  pathToFileURL(path.join(sourceRoot, "packages/app/src/utils/split-markdown-blocks.ts")).href
);
const inputs = {
  bareDisplay: "$$\na^2\n\n+b^2=c^2\n$$",
  fencedDisplay: "```math\na^2\n\n+b^2=c^2\n```",
  image: "Formula $x$ ![plot](https://example.org/plot.png)",
  fileLink: "Formula $x$ [file](src/main.ts)",
  ordinaryLink: "Formula $x$ [web](https://example.org/)",
  twoParagraphs: "First $x$.\n\nSecond $y$.",
};
const evidence = Object.entries(inputs).map(([name, source]) => {
  const detected = detectExtensions(source);
  return {
    name,
    source,
    blocks: splitMarkdownBlocks(source),
    detected,
    takeover: shouldTakeOver(detected, { math: true, mermaid: true }),
  };
});
process.stdout.write(`${JSON.stringify({ sourceRoot, evidence }, null, 2)}\n`);

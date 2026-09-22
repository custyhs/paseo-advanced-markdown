import { fileURLToPath } from "node:url";
import { prepareAssets } from "./lib/prepare-assets.mjs";

const assets = await prepareAssets(fileURLToPath(new URL("../", import.meta.url)));
console.log(`[advanced-markdown] prepared renderer assets: ${assets.join(", ")}`);

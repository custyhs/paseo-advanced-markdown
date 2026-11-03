import assets from "../generated/assets.json" with { type: "json" };
import { readRuntimeAssetSync } from "./runtime.mjs";

// Run before renderer module initialization, including the npm font table read.
// Only bundled formula data is repaired here; no downloads or executable installs.
for (const asset of Object.values(assets)) readRuntimeAssetSync(asset);

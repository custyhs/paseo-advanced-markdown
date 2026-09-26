import assets from "../generated/assets.json" with { type: "json" };
import { readRuntimeAssetSync } from "./runtime.mjs";

// Run before renderer module initialization, including the npm font table read.
// Only the small formula assets are repaired here; browser installation remains
// an explicit preparation step and startup never downloads dependencies.
for (const asset of Object.values(assets)) readRuntimeAssetSync(asset);

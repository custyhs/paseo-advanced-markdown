import { brotliDecompressSync } from "node:zlib";
import recovery from "../generated/asset-recovery.json" with { type: "json" };
import { ensurePreparedAssetSync } from "./store.mjs";

// Paseo evaluates an in-memory bundle without a plugin directory. Import the
// recovery data so the compiler carries it with that bundle, even after moving
// an installation. Decompress only on a cache miss, then verify the exact bytes.
export function readRuntimeAssetSync(asset, env = process.env) {
  return ensurePreparedAssetSync(
    asset,
    () => {
      const encoded = recovery[asset.sha256];
      if (typeof encoded !== "string")
        throw new Error(`No offline recovery data for ${asset.file}`);
      return brotliDecompressSync(Buffer.from(encoded, "base64"), {
        maxOutputLength: asset.bytes,
      });
    },
    env,
  );
}

export async function readRuntimeAsset(asset, env = process.env) {
  return readRuntimeAssetSync(asset, env);
}

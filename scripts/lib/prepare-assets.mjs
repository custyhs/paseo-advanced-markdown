import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ensurePreparedAssetSync } from "../../server/assets/store.mjs";

/** Copy packaged data before the plugin checkout is moved to its activated path. */
export async function prepareAssets(root, env = process.env) {
  const generated = path.join(root, "server/generated");
  const descriptors = JSON.parse(await readFile(path.join(generated, "assets.json"), "utf8"));
  for (const asset of Object.values(descriptors)) {
    ensurePreparedAssetSync(asset, () => readFileSync(path.join(generated, asset.file)), env);
  }
  // Content-addressed assets are deliberately retained. An older plugin process
  // may still need its data while a candidate is being prepared or rolled back.
  return Object.keys(descriptors);
}

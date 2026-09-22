import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { preparedAssetPath, readPreparedAsset, verifyAsset } from "../../server/assets/store.mjs";

/** Copy packaged data before the plugin checkout is moved to its activated path. */
export async function prepareAssets(root, env = process.env) {
  const generated = path.join(root, "server/generated");
  const descriptors = JSON.parse(await readFile(path.join(generated, "assets.json"), "utf8"));
  for (const asset of Object.values(descriptors)) {
    const target = preparedAssetPath(asset, env);
    try {
      await readPreparedAsset(asset, env);
      continue;
    } catch {
      // A missing or damaged cached copy can only be repaired from the package.
    }
    const bytes = verifyAsset(await readFile(path.join(generated, asset.file)), asset);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    await readPreparedAsset(asset, env);
  }
  // Content-addressed assets are deliberately retained. An older plugin process
  // may still need its data while a candidate is being prepared or rolled back.
  return Object.keys(descriptors);
}

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLayout, resolveCacheRoot } from "../mermaid/cache-root.mjs";

const repair = 'Run "npm run prepare-assets" in the plugin directory or reinstall the plugin.';

export function preparedAssetPath(asset, env = process.env) {
  if (
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    !Number.isSafeInteger(asset.bytes) ||
    asset.bytes <= 0 ||
    !/^[a-z0-9-]+\.(?:wasm|json)$/.test(asset.file)
  )
    throw new Error("Invalid renderer asset descriptor");
  return path.join(
    cacheLayout(resolveCacheRoot(env)).assets,
    `${asset.sha256}${path.extname(asset.file)}`,
  );
}

export function verifyAsset(bytes, asset) {
  if (
    bytes.length !== asset.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== asset.sha256
  )
    throw new Error(`Renderer asset ${asset.file} failed its integrity check. ${repair}`);
  return bytes;
}

export function readPreparedAssetSync(asset, env = process.env) {
  let bytes;
  try {
    bytes = readFileSync(preparedAssetPath(asset, env));
  } catch {
    throw new Error(`Renderer asset ${asset.file} is not prepared. ${repair}`);
  }
  return verifyAsset(bytes, asset);
}

export async function readPreparedAsset(asset, env = process.env) {
  let bytes;
  try {
    bytes = await readFile(preparedAssetPath(asset, env));
  } catch {
    throw new Error(`Renderer asset ${asset.file} is not prepared. ${repair}`);
  }
  return verifyAsset(bytes, asset);
}

// Shared by installation and startup. The source is read only when the cached
// bytes are missing or invalid; old content-addressed versions stay available.
export function ensurePreparedAssetSync(asset, loadSource, env = process.env) {
  const target = preparedAssetPath(asset, env);
  try {
    return verifyAsset(readFileSync(target), asset);
  } catch {
    // Recover only from a source that passes the same integrity check.
  }
  try {
    const bytes = verifyAsset(loadSource(), asset);
    mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, bytes, { flag: "wx" });
      renameSync(temporary, target);
    } finally {
      rmSync(temporary, { force: true });
    }
    return readPreparedAssetSync(asset, env);
  } catch (cause) {
    throw new Error(
      `Renderer asset ${asset.file} could not be restored at ${target}: ${cause instanceof Error ? cause.message : String(cause)} Check cache permissions or reinstall the plugin.`,
      { cause },
    );
  }
}

import type { RendererAsset } from "./store.mjs";

export function readRuntimeAssetSync(asset: RendererAsset, env?: NodeJS.ProcessEnv): Buffer;
export function readRuntimeAsset(asset: RendererAsset, env?: NodeJS.ProcessEnv): Promise<Buffer>;

export interface RendererAsset {
  file: string;
  sha256: string;
  bytes: number;
}
export function preparedAssetPath(asset: RendererAsset, env?: NodeJS.ProcessEnv): string;
export function verifyAsset(bytes: Buffer, asset: RendererAsset): Buffer;
export function readPreparedAssetSync(asset: RendererAsset, env?: NodeJS.ProcessEnv): Buffer;
export function readPreparedAsset(asset: RendererAsset, env?: NodeJS.ProcessEnv): Promise<Buffer>;

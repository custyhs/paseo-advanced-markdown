import { readRuntimeAssetSync } from "../assets/runtime.mjs";
import assets from "../generated/assets.json" with { type: "json" };

// Load the verified static SVG font tables once. MathJax mutates character
// options during rendering, so keep shared object identities and do not freeze.
const modules = JSON.parse(readRuntimeAssetSync(assets.fonts).toString("utf8"));

export function fontModule(name) {
  const data = modules[name];
  if (!data) throw new Error(`Unknown MathJax font data module: ${name}`);
  return data;
}

// Fetches the exact official Paseo 0.8.0 app sources used by the smoke test:
// the timeline transformer model, projection, and stream reducers are app code
// that no npm package ships. Only the released compiler comes from npm.
import { fileURLToPath } from "node:url";
import { ensurePaseoCheckout } from "./lib/paseo-checkout.mjs";

export const revision = "b8e24677e12b226c7c38c1c3a40649daa9f1152f"; // commit of getpaseo/paseo tag v0.8.0 (tag object e432c9b4)
export const source = fileURLToPath(new URL("../.paseo-source", import.meta.url));

ensurePaseoCheckout({
  revision,
  directory: source,
  paths: ["packages/app/src", "packages/protocol/src", "packages/plugin/src"],
  label: "tag v0.8.0",
});

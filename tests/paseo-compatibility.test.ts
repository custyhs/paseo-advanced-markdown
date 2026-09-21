import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertPluginCompatibility } from "@getpaseo/protocol/plugin-requirements";

const manifest = JSON.parse(readFileSync(new URL("../paseo-plugin.json", import.meta.url), "utf8"));

describe.each(["app", "daemon"] as const)("Paseo %s compatibility", (runtime) => {
  it.each(["0.8.0", "0.8.1", "0.9.0-beta.2", "0.9.0", "0.9.1"])(
    "accepts %s using the official version gate",
    (version) => {
      expect(() => assertPluginCompatibility({ ...manifest, runtime, version })).not.toThrow();
    },
  );

  it.each(["0.7.9", "0.10.0-beta.1", "0.10.0", "1.0.0", "invalid"])(
    "rejects unsupported or unknown version %s",
    (version) => {
      expect(() => assertPluginCompatibility({ ...manifest, runtime, version })).toThrow();
    },
  );
});

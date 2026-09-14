import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const FONT_SCALES = ["small", "default", "large"] as const;
export type FontScale = (typeof FONT_SCALES)[number];

/** Host-scoped module switches. A disabled module shows its source instead of rendering. */
export const moduleSettings = defineSettings({
  id: "modules",
  scope: "host",
  version: 1,
  schema: z.object({
    math: z.boolean().default(true),
    mermaid: z.boolean().default(true),
    fontScale: z.enum(FONT_SCALES).default("default"),
  }),
});

export type ModuleSettings = z.output<typeof moduleSettings.schema>;

export const DEFAULT_MODULE_SETTINGS: ModuleSettings = moduleSettings.schema.parse({});

export function fontScaleToBaseSize(scale: FontScale, compact: boolean): number {
  const base = compact ? 14 : 16;
  if (scale === "small") return base - 2;
  if (scale === "large") return base + 2;
  return base;
}

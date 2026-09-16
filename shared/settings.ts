import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const FONT_SCALES = ["small", "default", "large"] as const;
export type FontScale = (typeof FONT_SCALES)[number];
export const MATH_SCALES = [0.75, 1, 1.25, 1.5, 2] as const;
export type MathScale = (typeof MATH_SCALES)[number];

/** Host-scoped module switches. A disabled module shows its source instead of rendering. */
export const moduleSettings = defineSettings({
  id: "modules",
  scope: "host",
  version: 1,
  schema: z.object({
    math: z.boolean().default(true),
    mermaid: z.boolean().default(true),
    fontScale: z.enum(FONT_SCALES).default("default"),
    mathScale: z.literal(MATH_SCALES).default(1),
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

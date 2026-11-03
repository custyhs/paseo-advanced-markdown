import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { MAX_IMAGE_BASE64, MAX_MATH_EXPRESSION } from "./limits.js";

const hexColor = z.string().regex(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i);

export const mathRenderInput = z.object({
  expression: z.string().min(1).max(MAX_MATH_EXPRESSION),
  display: z.boolean(),
  color: hexColor,
  /** Finite requested detail; the host clamps and buckets this before allocation. */
  density: z.number().finite().optional(),
});

export const mathRenderOutput = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    png: z.string().max(MAX_IMAGE_BASE64),
    /** Logical size at a 16px em, independent of PNG pixel density. */
    width: z.number().positive().max(2048),
    height: z.number().positive().max(1024),
    /** Distance from the top edge to the text baseline, logical pixels. */
    baseline: z.number().nonnegative().max(1024),
    /** Actual pixel density after resource-limit fallback; absent on older hosts (2x). */
    density: z.number().finite().min(1).max(8).optional(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["invalid", "too-large", "unavailable", "failed"]),
    message: z.string().max(512).optional(),
  }),
]);

export const renderMath = defineRpc({
  name: "advanced-markdown.math.render",
  input: mathRenderInput,
  output: mathRenderOutput,
});
export type MathRenderInput = z.infer<typeof mathRenderInput>;
export type MathRenderOutput = z.infer<typeof mathRenderOutput>;

export function isRetryableMathResult(result: MathRenderOutput): boolean {
  return !result.ok && (result.reason === "unavailable" || result.reason === "failed");
}

/** Diagnostics for the settings screen; never carries message content. */
export const runtimeStatusOutput = z.object({
  plugin: z.object({ version: z.string() }),
  math: z.object({
    engine: z.string(),
    cached: z.number().int().nonnegative(),
    cacheRoot: z.string(),
  }),
});

export const runtimeStatus = defineRpc({
  name: "advanced-markdown.status",
  input: z.object({}),
  output: runtimeStatusOutput,
});
export type RuntimeStatus = z.infer<typeof runtimeStatusOutput>;

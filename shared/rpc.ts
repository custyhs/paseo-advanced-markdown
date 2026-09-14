import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { MAX_IMAGE_BASE64, MAX_MATH_EXPRESSION, MAX_MERMAID_SOURCE } from "./limits.js";

const hexColor = z.string().regex(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i);

export const mathRenderInput = z.object({
  expression: z.string().min(1).max(MAX_MATH_EXPRESSION),
  display: z.boolean(),
  color: hexColor,
});

export const mathRenderOutput = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    png: z.string().max(MAX_IMAGE_BASE64),
    /** Logical size at a 16px em; PNG pixels are 2x. */
    width: z.number().positive().max(2048),
    height: z.number().positive().max(1024),
    /** Distance from the top edge to the text baseline, logical pixels. */
    baseline: z.number().nonnegative().max(1024),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["invalid", "too-large"]),
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

export const MERMAID_THEMES = ["default", "dark"] as const;
export type MermaidTheme = (typeof MERMAID_THEMES)[number];

export const MERMAID_FAILURE_REASONS = [
  /** The definition does not parse or the engine rejected it. */
  "invalid",
  /** Input or output exceeds a published limit. */
  "too-large",
  /** The task exceeded its time budget and was terminated. */
  "timeout",
  /** The bounded queue was full. Retry later. */
  "busy",
  /** The pinned browser or worker runtime is not installed on this host. */
  "unavailable",
  /** The worker failed for another reason; message carries a short cause. */
  "failed",
] as const;

export const mermaidRenderInput = z.object({
  source: z.string().min(1).max(MAX_MERMAID_SOURCE),
  theme: z.enum(MERMAID_THEMES),
});

export const mermaidRenderOutput = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    png: z.string().max(MAX_IMAGE_BASE64),
    /** Logical size at 1x; PNG pixels are `scale` times larger and stay within MAX_IMAGE_EDGE. */
    width: z.number().positive().max(16384),
    height: z.number().positive().max(16384),
    scale: z.number().positive().max(4),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(MERMAID_FAILURE_REASONS),
    message: z.string().max(512).optional(),
  }),
]);

export const renderMermaid = defineRpc({
  name: "advanced-markdown.mermaid.render",
  input: mermaidRenderInput,
  output: mermaidRenderOutput,
});
export type MermaidRenderInput = z.infer<typeof mermaidRenderInput>;
export type MermaidRenderOutput = z.infer<typeof mermaidRenderOutput>;

/** Diagnostics for the settings screen; never carries message content. */
export const runtimeStatusOutput = z.object({
  plugin: z.object({ version: z.string() }),
  math: z.object({ engine: z.string(), cached: z.number().int().nonnegative() }),
  mermaid: z.object({
    ready: z.boolean(),
    cli: z.string(),
    browser: z.string().nullable(),
    cacheRoot: z.string(),
    queued: z.number().int().nonnegative(),
    cached: z.number().int().nonnegative(),
    message: z.string().max(512).optional(),
  }),
});

export const runtimeStatus = defineRpc({
  name: "advanced-markdown.status",
  input: z.object({}),
  output: runtimeStatusOutput,
});
export type RuntimeStatus = z.infer<typeof runtimeStatusOutput>;

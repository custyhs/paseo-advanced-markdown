// Budgets shared by the client and the daemon subprocess. Values are candidates
// from the plan; the feasibility report records what real RPC payloads allow.

/** Longest inline or display TeX expression the math module accepts. */
export const MAX_MATH_EXPRESSION = 4096;
/** Longest Mermaid definition the diagram module accepts. */
export const MAX_MERMAID_SOURCE = 32 * 1024;
/** Longest inline run that the math tokenizer probes with real Markdown rules. */
export const MAX_INLINE_RUN = 65_536;
/** Longest source item the transformer will scan. Larger items stay with the host. */
export const MAX_DOCUMENT = 1_048_576;
/** Largest rendered image, as base64 text, that one RPC response may carry. */
export const MAX_IMAGE_BASE64 = 2_000_000;
/** Largest rendered image in raster pixels (about 4096 x 2048). */
export const MAX_IMAGE_PIXELS = 8_000_000;
/** Longest raster edge; Android decodes larger bitmaps unreliably. */
export const MAX_IMAGE_EDGE = 4096;
/** Lowest device scale a diagram may fall back to before it is refused. */
export const MIN_DIAGRAM_SCALE = 0.5;
/** Longest wall-clock time for one Mermaid render task. */
export const MERMAID_TASK_TIMEOUT_MS = 15_000;
/** Mermaid render tasks running at once inside one plugin process. */
export const MERMAID_CONCURRENCY = 1;
/** Mermaid render tasks waiting for a slot before new ones are refused. */
export const MERMAID_QUEUE_LIMIT = 8;
/** Bounded image cache on each side, in bytes and entries. */
export const IMAGE_CACHE_BYTES = 8 * 1024 * 1024;
export const IMAGE_CACHE_ENTRIES = 128;

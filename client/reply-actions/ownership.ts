// Pure module: no React, React Native, or SDK runtime imports.

import { MAX_DOCUMENT } from "../../shared/limits.js";
import type { DetectedExtensions } from "../../shared/markdown/extensions.js";
import type { ModuleSettings } from "../../shared/settings.js";

/** Bounds on retained source text: entries, and characters overall or per text. */
const MAX_CACHED_SOURCES = 256;
const MAX_CACHED_CHARACTERS = 512 * 1024;

export interface OwnershipDetector {
  /** Whether the plugin claims this reply text under these settings. */
  isOwned(text: string, settings: ModuleSettings): boolean;
  /**
   * Whether the plugin's renderer could draw this text at all: within
   * `MAX_DOCUMENT` and free of content detection marks unsupported.
   */
  canRender(text: string): boolean;
  clear(): void;
}

/**
 * Detection cache keyed by source text. Projection may clone settled items, so
 * object identity cannot key the cache; the bounds keep retained source small,
 * and texts over the character budget are detected but never cached. Detection
 * itself is settings-independent, so one entry serves every settings snapshot.
 */
export function createOwnershipDetector(deps: {
  detectExtensions(text: string): DetectedExtensions;
  shouldTakeOver(
    detected: DetectedExtensions,
    enabled: { math: boolean; codeBlocks: boolean; tables: boolean },
  ): boolean;
}): OwnershipDetector {
  const sources = new Map<string, DetectedExtensions>();
  let sourceCharacters = 0;
  function detect(text: string): DetectedExtensions {
    let result = sources.get(text);
    if (result === undefined) {
      result = deps.detectExtensions(text);
      if (text.length <= MAX_CACHED_CHARACTERS) {
        sources.set(text, result);
        sourceCharacters += text.length;
        for (const source of sources.keys()) {
          if (sources.size <= MAX_CACHED_SOURCES && sourceCharacters <= MAX_CACHED_CHARACTERS) {
            break;
          }
          sources.delete(source);
          sourceCharacters -= source.length;
        }
      }
    }
    return result;
  }
  return {
    isOwned(text, settings) {
      // Larger items stay with the host, so skip detection entirely.
      if (text.length > MAX_DOCUMENT) return false;
      return deps.shouldTakeOver(detect(text), settings);
    },
    canRender(text) {
      // detectExtensions reports nothing for oversized texts, so the length
      // bound is checked here before the cached detection.
      if (text.length > MAX_DOCUMENT) return false;
      return !detect(text).unsupported;
    },
    clear() {
      sources.clear();
      sourceCharacters = 0;
    },
  };
}

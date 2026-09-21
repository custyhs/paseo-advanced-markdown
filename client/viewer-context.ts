import { createContext, useContext } from "react";
import type { MathRenderOutput } from "../shared/rpc.js";

export type ViewerImage = { uri: string; width: number; height: number };
export type ViewerSelection = {
  id: string;
  kind: "formula" | "diagram";
  /** Exact block, including original delimiters or fence. */
  source: string;
  /** Exact expression/definition body for LaTeX or Mermaid copying. */
  body: string;
  image?: ViewerImage;
  readingScale?: number;
  status?: string;
  retry?: () => void;
  canRetry?: boolean;
  onOpenLink?: () => void;
  math?: {
    expression: string;
    display: boolean;
    color: string;
    hostId: string;
    enabled: boolean;
    preferredScale: number;
    seed?: Extract<MathRenderOutput, { ok: true }>;
  };
};

export const ContentViewerContext = createContext<{
  open(selection: ViewerSelection): void;
  update(selection: ViewerSelection): void;
} | null>(null);
export const useContentViewer = () => useContext(ContentViewerContext);

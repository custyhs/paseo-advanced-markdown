import { createContext } from "react";
import type { InlineFormulaLayout } from "./math-layout.js";

export const MathLayoutContext = createContext<{
  width: number;
  reportLayout(id: string, layout: InlineFormulaLayout | undefined): void;
} | null>(null);

export const MathInlineLineHeightContext = createContext<number | undefined>(undefined);

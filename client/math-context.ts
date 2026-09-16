import { createContext } from "react";

export const MathLayoutContext = createContext<{
  width: number;
  reportOverflow(id: string, overflow: boolean): void;
} | null>(null);

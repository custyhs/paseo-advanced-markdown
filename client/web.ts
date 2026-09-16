import { useLayoutEffect } from "react";
import { Platform } from "react-native";

// Browser APIs are confined to this guarded module per the public plugin SDK.
type StyleNode = { textContent: string | null; remove(): void };
declare const document: {
  createElement(tag: "style"): StyleNode;
  head: { appendChild(node: StyleNode): void };
};
const FORMULA_ACTION_STYLES = `
@media (hover: hover) and (pointer: fine) {
  [data-pam-formula-frame="hover"] > [data-pam-formula-actions] {
    opacity: 0;
    pointer-events: none;
  }
  [data-pam-formula-frame="hover"]:hover > [data-pam-formula-actions],
  [data-pam-formula-frame="hover"]:focus-within > [data-pam-formula-actions] {
    opacity: 1;
    pointer-events: auto;
  }
}`;

// Each host bundle owns its style node; unloading one cannot remove another's styles.
let users = 0;
let style: StyleNode | undefined;
export function useFormulaActionStyles(): void {
  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    if (!style) {
      style = document.createElement("style");
      style.textContent = FORMULA_ACTION_STYLES;
      document.head.appendChild(style);
    }
    users++;
    return () => {
      if (--users === 0) {
        style?.remove();
        style = undefined;
      }
    };
  }, []);
}

export function formulaFrameMarker(compact: boolean) {
  if (Platform.OS !== "web") return {};
  return { dataSet: { pamFormulaFrame: compact ? "always" : "hover" } };
}

export function formulaActionsMarker() {
  if (Platform.OS !== "web") return {};
  return { dataSet: { pamFormulaActions: "" } };
}

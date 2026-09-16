import { useLayoutEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";

// Browser APIs are confined to this guarded module per the public plugin SDK.
type StyleNode = { textContent: string | null; remove(): void };
declare const document: {
  createElement(tag: "style"): StyleNode;
  head: { appendChild(node: StyleNode): void };
};
type HoverQuery = {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
};
declare const window: { matchMedia(query: string): HoverQuery };
let hoverQuery: HoverQuery | undefined;
function getHoverQuery(): HoverQuery | undefined {
  if (Platform.OS !== "web") return;
  hoverQuery ??= window.matchMedia("(hover: hover) and (pointer: fine)");
  return hoverQuery;
}
function subscribeHover(listener: () => void): () => void {
  const query = getHoverQuery();
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}
const hoverSnapshot = () => getHoverQuery()?.matches ?? false;
const nativeSnapshot = () => false;

export function useFormulaTapActions(compact: boolean): boolean {
  const canHover = useSyncExternalStore(subscribeHover, hoverSnapshot, nativeSnapshot);
  return compact || !canHover;
}

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

export function formulaFrameMarker(tapToReveal: boolean) {
  if (Platform.OS !== "web") return {};
  return { dataSet: { pamFormulaFrame: tapToReveal ? "tap" : "hover" } };
}

export function formulaActionsMarker() {
  if (Platform.OS !== "web") return {};
  return { dataSet: { pamFormulaActions: "" } };
}

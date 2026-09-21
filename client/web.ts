import { Platform } from "react-native";

// Browser-only APIs stay in this guarded module per the public plugin SDK.
declare const document: { getSelection(): { isCollapsed: boolean } | null };

export function hasTextSelection(): boolean {
  return Platform.OS === "web" && document.getSelection()?.isCollapsed === false;
}

type MouseInput = {
  button: number;
  clientX: number;
  detail: number;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
};
type MouseTarget = {
  addEventListener(type: string, listener: (event: MouseInput) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: MouseInput) => void, capture?: boolean): void;
};
type HorizontalScrollNode = MouseTarget & {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  style: { userSelect: string; cursor: string };
  ownerDocument: MouseTarget & { defaultView: MouseTarget | null };
};

/** Install only on non-selectable content; clean up before enabling text selection. */
export function enableHorizontalDrag(scrollView: { getScrollableNode(): unknown } | null) {
  if (Platform.OS !== "web" || !scrollView) return;
  const node = scrollView.getScrollableNode() as HorizontalScrollNode;
  const owner = node.ownerDocument;
  let origin: { x: number; scrollLeft: number } | undefined;
  let suppressClick = false;
  let dragging = false;
  let previousUserSelect = "";
  let previousCursor = "";
  const end = () => {
    if (!origin) return;
    origin = undefined;
    node.style.userSelect = previousUserSelect;
    node.style.cursor = previousCursor;
    owner.removeEventListener("mousemove", move);
    owner.removeEventListener("mouseup", end);
    owner.defaultView?.removeEventListener("blur", end);
  };
  const move = (event: MouseInput) => {
    if (!origin) return;
    const distance = event.clientX - origin.x;
    if (!dragging && Math.abs(distance) <= 6) return;
    dragging = true;
    suppressClick = true;
    event.preventDefault();
    node.style.userSelect = "none";
    node.style.cursor = "grabbing";
    node.scrollLeft = Math.max(
      0,
      Math.min(node.scrollWidth - node.clientWidth, origin.scrollLeft - distance),
    );
  };
  const start = (event: MouseInput) => {
    if (event.button !== 0) return;
    end();
    suppressClick = false;
    dragging = false;
    if (node.scrollWidth <= node.clientWidth + 1) return;
    origin = { x: event.clientX, scrollLeft: node.scrollLeft };
    previousUserSelect = node.style.userSelect;
    previousCursor = node.style.cursor;
    owner.addEventListener("mousemove", move);
    owner.addEventListener("mouseup", end);
    owner.defaultView?.addEventListener("blur", end);
  };
  const click = (event: MouseInput) => {
    // Keyboard/assistive clicks have detail 0 and must remain available after a drag.
    if (suppressClick && event.detail !== 0) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    suppressClick = false;
  };
  const preventImageDrag = (event: MouseInput) => {
    if (origin) event.preventDefault();
  };
  node.addEventListener("mousedown", start);
  node.addEventListener("click", click, true);
  node.addEventListener("dragstart", preventImageDrag);
  return () => {
    end();
    node.removeEventListener("mousedown", start);
    node.removeEventListener("click", click, true);
    node.removeEventListener("dragstart", preventImageDrag);
  };
}

export function viewerKeyboardEntry(open: () => void, resetGesture: () => void) {
  if (Platform.OS !== "web") return {};
  return {
    tabIndex: 0 as const,
    onKeyDownCapture(event: {
      key: string;
      repeat: boolean;
      preventDefault(): void;
      stopPropagation(): void;
    }) {
      if (event.key !== "Enter" && event.key !== " ") return;
      resetGesture();
      // Own activation before Pressable or the native button can synthesize a second click.
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter" && !event.repeat) open();
    },
    onKeyUpCapture(event: { key: string; preventDefault(): void; stopPropagation(): void }) {
      if (event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      // Open on release so Space cannot also activate the newly focused modal close button.
      open();
    },
  };
}

export function viewerMouseEntry(
  start: (point: { pageX: number; pageY: number }) => void,
  move: (point: { pageX: number; pageY: number }) => void,
) {
  if (Platform.OS !== "web") return {};
  return {
    onMouseDown(event: { nativeEvent: { pageX: number; pageY: number } }) {
      start(event.nativeEvent);
    },
    onMouseMove(event: { nativeEvent: { pageX: number; pageY: number } }) {
      move(event.nativeEvent);
    },
    // Leaving and returning is still a drag, even if the final coordinates match.
    onMouseLeave() {
      move({ pageX: Number.POSITIVE_INFINITY, pageY: Number.POSITIVE_INFINITY });
    },
  };
}

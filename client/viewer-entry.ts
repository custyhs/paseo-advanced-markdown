import { useRef } from "react";
import type { GestureResponderEvent } from "react-native";
import { createActivationGesture } from "./activation-gesture.js";
import { hasTextSelection, viewerKeyboardEntry, viewerMouseEntry } from "./web.js";

/** A drag or text selection must never activate the content underneath it. */
export function useViewerEntry(open: () => void) {
  const gesture = useRef(createActivationGesture()).current;
  const start = (point: { pageX: number; pageY: number }) => {
    gesture.start({ x: point.pageX, y: point.pageY });
  };
  const move = (point: { pageX: number; pageY: number }) => {
    gesture.move({ x: point.pageX, y: point.pageY });
  };
  return {
    ...viewerKeyboardEntry(open, () => gesture.start()),
    ...viewerMouseEntry(start, move),
    onTouchStart(event: GestureResponderEvent) {
      start(event.nativeEvent);
    },
    onTouchMove(event: GestureResponderEvent) {
      move(event.nativeEvent);
    },
    onPressMove(event: GestureResponderEvent) {
      move(event.nativeEvent);
    },
    onPress(event: GestureResponderEvent) {
      event.stopPropagation();
      move(event.nativeEvent);
      if (gesture.shouldActivate(hasTextSelection())) open();
    },
  };
}

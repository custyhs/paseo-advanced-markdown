type Point = { x: number; y: number };

/** Track the whole gesture: returning to the press origin must not turn a drag into a click. */
export function createActivationGesture() {
  let origin: Point | undefined;
  let dragged = false;

  return {
    /** Keyboard activation has no point; starting still clears the previous gesture. */
    start(point?: Point) {
      origin = point;
      dragged = false;
    },
    move(point?: Point) {
      if (origin && point && Math.hypot(point.x - origin.x, point.y - origin.y) > 6) {
        dragged = true;
      }
    },
    shouldActivate(hasTextSelection = false) {
      const activate = !dragged && !hasTextSelection;
      origin = undefined;
      dragged = false;
      return activate;
    },
  };
}

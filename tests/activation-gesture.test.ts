import { describe, expect, it } from "vitest";
import { createActivationGesture } from "../client/activation-gesture.js";

describe("content viewer activation", () => {
  it("opens for a click or tap without movement", () => {
    const gesture = createActivationGesture();
    gesture.start({ x: 100, y: 100 });
    expect(gesture.shouldActivate()).toBe(true);
  });

  it("allows movement up to the 6px threshold", () => {
    const gesture = createActivationGesture();
    gesture.start({ x: 100, y: 100 });
    gesture.move({ x: 106, y: 100 });
    expect(gesture.shouldActivate()).toBe(true);
  });

  it.each([
    { x: 107, y: 100 },
    { x: 93, y: 100 },
    { x: 100, y: 107 },
    { x: 100, y: 93 },
    { x: 105, y: 105 },
  ])("does not open after dragging from (100, 100) to $x, $y", (point) => {
    const gesture = createActivationGesture();
    gesture.start({ x: 100, y: 100 });
    gesture.move(point);
    expect(gesture.shouldActivate()).toBe(false);
  });

  it("does not open when a drag returns to its starting point", () => {
    const gesture = createActivationGesture();
    gesture.start({ x: 100, y: 100 });
    gesture.move({ x: 140, y: 100 });
    gesture.move({ x: 100, y: 100 });
    expect(gesture.shouldActivate()).toBe(false);
  });

  it("keeps selected text from opening the viewer", () => {
    const gesture = createActivationGesture();
    gesture.start({ x: 100, y: 100 });
    expect(gesture.shouldActivate(true)).toBe(false);
  });

  it("allows a new click after a completed or cancelled drag", () => {
    const gesture = createActivationGesture();
    for (const completed of [true, false]) {
      gesture.start({ x: 100, y: 100 });
      gesture.move({ x: 140, y: 100 });
      if (completed) expect(gesture.shouldActivate()).toBe(false);
      gesture.start({ x: 100, y: 100 });
      expect(gesture.shouldActivate()).toBe(true);
    }
  });

  it("allows keyboard activation without pointer coordinates after a cancelled drag", () => {
    const gesture = createActivationGesture();
    gesture.start({ x: 100, y: 100 });
    gesture.move({ x: 140, y: 100 });
    gesture.start();
    gesture.move();
    expect(gesture.shouldActivate()).toBe(true);
  });
});

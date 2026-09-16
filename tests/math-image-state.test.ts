import { describe, expect, it } from "vitest";
import { retainedMathImage } from "../client/math-image-state.js";

const image = { ok: true as const, png: "pixels", width: 20, height: 10, baseline: 8, density: 2 };
describe("formula detail transitions", () => {
  it("keeps lower detail while loading or when an upgrade fails", () => {
    const previous = { identity: "host:color:tex", result: image };
    for (const latest of [undefined, null, { ok: false as const, reason: "too-large" as const }]) {
      expect(retainedMathImage(previous.identity, latest, previous)).toBe(image);
    }
    const upgraded = { ...image, density: 4 };
    expect(
      retainedMathImage(previous.identity, image, {
        identity: previous.identity,
        result: upgraded,
      }),
    ).toBe(upgraded);
    expect(retainedMathImage(previous.identity, upgraded, previous)).toBe(upgraded);
  });
  it("does not show a previous expression, host, or theme", () => {
    for (const identity of ["other-host:color:tex", "host:other-color:tex", "host:color:new-tex"]) {
      expect(
        retainedMathImage(identity, undefined, { identity: "host:color:tex", result: image }),
      ).toBeUndefined();
    }
  });
});

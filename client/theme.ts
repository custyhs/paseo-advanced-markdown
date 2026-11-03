import { processColor, type TextStyle } from "react-native";

/** Normalizes any React Native color to #rrggbb or #rrggbbaa for the daemon. */
export function colorHex(color: TextStyle["color"], fallback: string): string {
  if (typeof color === "string" && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color))
    return color;
  const value = processColor(color ?? fallback);
  if (typeof value !== "number") return "#808080";
  // React Native processColor produces ARGB on all platforms (signed on Android).
  return `#${(value & 0xffffff).toString(16).padStart(6, "0")}${(value >>> 24).toString(16).padStart(2, "0")}`;
}

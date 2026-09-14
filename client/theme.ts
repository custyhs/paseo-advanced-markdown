import type { PluginTheme } from "@getpaseo/plugin";
import { processColor, type TextStyle } from "react-native";
import type { MermaidTheme } from "../shared/rpc.js";

/** Normalizes any React Native color to #rrggbb or #rrggbbaa for the daemon. */
export function colorHex(color: TextStyle["color"], fallback: string): string {
  if (typeof color === "string" && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color))
    return color;
  const value = processColor(color ?? fallback);
  if (typeof value !== "number") return "#808080";
  // React Native processColor produces ARGB on all platforms (signed on Android).
  return `#${(value & 0xffffff).toString(16).padStart(6, "0")}${(value >>> 24).toString(16).padStart(2, "0")}`;
}

function channel(hex: string, index: number): number {
  const digits =
    hex.length <= 5 ? hex[index + 1] + hex[index + 1] : hex.slice(index * 2 + 1, index * 2 + 3);
  return parseInt(digits, 16) / 255;
}

/** Relative luminance of a hex color; used to pick a Mermaid theme. */
export function luminance(color: string): number {
  const hex = colorHex(color, "#ffffff");
  const linear = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return (
    0.2126 * linear(channel(hex, 0)) +
    0.7152 * linear(channel(hex, 1)) +
    0.0722 * linear(channel(hex, 2))
  );
}

export function isDarkTheme(theme: PluginTheme): boolean {
  return luminance(theme.colors.surface0) < 0.4;
}

export function mermaidThemeFor(theme: PluginTheme): MermaidTheme {
  return isDarkTheme(theme) ? "dark" : "default";
}

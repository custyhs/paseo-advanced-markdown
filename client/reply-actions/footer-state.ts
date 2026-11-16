// Pure module: no React, React Native, or SDK runtime imports.

import type { ReplyRole } from "../../shared/message.js";
import type { TurnView } from "./store.js";

export type FooterMode = "hidden" | "footer" | "footer-with-warning";

/** Every string the footer shows, in one place for tests and QA. */
export const FOOTER_COPY = {
  copyLabel: "Copy turn",
  copied: "Copied turn",
  showOriginal: "Show original",
  warning: "Paseo's Fork below stops before this answer. Use Show original to fork from here.",
  firstUse:
    "Paseo now draws this turn. If its Fork does not appear, another plugin is drawing replies. In Better Paseo, turn off Plugin markdown for replies.",
} as const;

/**
 * The footer appears only under the final owned reply of a complete turn,
 * never when the host draws its own turn footers (getpaseo/paseo#9253).
 */
export function footerMode(input: {
  enabled: boolean;
  role: ReplyRole;
  view: TurnView | null;
  hostNativeFooter?: boolean;
}): FooterMode {
  const { enabled, role, view, hostNativeFooter = false } = input;
  if (hostNativeFooter || !enabled || role !== "owned" || view === null) return "hidden";
  if (!view.isFinalReply || !view.complete) return "hidden";
  return view.unprotected ? "footer-with-warning" : "footer";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `HH:MM` on the same local day as `now`, `YYYY-MM-DD HH:MM` otherwise. */
export function formatEndTime(iso: string, now: Date): string {
  const ended = new Date(iso);
  const time = `${pad(ended.getHours())}:${pad(ended.getMinutes())}`;
  const sameDay =
    ended.getFullYear() === now.getFullYear() &&
    ended.getMonth() === now.getMonth() &&
    ended.getDate() === now.getDate();
  if (sameDay) return time;
  return `${ended.getFullYear()}-${pad(ended.getMonth() + 1)}-${pad(ended.getDate())} ${time}`;
}

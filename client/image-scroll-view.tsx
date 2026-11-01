import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef } from "react";
import type { ScrollView as NativeScrollView, ScrollViewProps } from "react-native";
import { enableHorizontalDrag } from "./web.js";

/** Image-only horizontal canvas: native touch scrolling plus desktop mouse panning. */
export function ImageScrollView(props: ScrollViewProps) {
  const ref = useRef<NativeScrollView>(null);
  useEffect(() => enableHorizontalDrag(ref.current), []);
  return <ScrollView {...props} ref={ref} horizontal />;
}

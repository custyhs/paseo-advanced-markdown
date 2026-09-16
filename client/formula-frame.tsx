import type { ReactNode } from "react";
import { View } from "react-native";
import { useFormulaActionStyles, formulaFrameMarker, formulaActionsMarker } from "./web.js";

/** Controls share the formula's hover/focus area and keep their layout slot. */
export function FormulaFrame({
  children,
  actions,
  compact,
}: {
  children: ReactNode;
  actions: ReactNode;
  compact: boolean;
}) {
  useFormulaActionStyles();
  return (
    <View
      {...formulaFrameMarker(compact)}
      style={{ minWidth: 0, width: "100%", marginVertical: 4 }}
    >
      {children}
      <View {...formulaActionsMarker()}>{actions}</View>
    </View>
  );
}

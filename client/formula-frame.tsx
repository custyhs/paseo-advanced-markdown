import { useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  useFormulaActionStyles,
  useFormulaTapActions,
  formulaFrameMarker,
  formulaActionsMarker,
} from "./web.js";

type Disclosure = {
  tapToReveal: boolean;
  expanded: boolean;
  toggle: (event: { stopPropagation(): void }) => void;
};

/** Hover keeps its layout slot; an explicit tap can expand the compact action row. */
export function FormulaFrame({
  children,
  actions,
  compact,
}: {
  children: (disclosure: Disclosure) => ReactNode;
  actions: ReactNode;
  compact: boolean;
}) {
  useFormulaActionStyles();
  const tapToReveal = useFormulaTapActions(compact);
  const [expanded, setExpanded] = useState(false);
  return (
    <View
      {...formulaFrameMarker(tapToReveal)}
      style={{ minWidth: 0, width: "100%", marginVertical: 4 }}
    >
      {children({
        tapToReveal,
        expanded,
        toggle: (event) => {
          event.stopPropagation();
          setExpanded((value) => !value);
        },
      })}
      {(!tapToReveal || expanded) && <View {...formulaActionsMarker()}>{actions}</View>}
    </View>
  );
}

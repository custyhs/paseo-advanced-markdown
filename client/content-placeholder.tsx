import type { PluginTheme } from "@getpaseo/plugin";
import { Pressable, Text, View, type TextStyle } from "react-native";
import { monospace } from "./code-block.js";
import { useViewerEntry } from "./viewer-entry.js";

/** Source remains a viewer entry even before an image exists. No inline actions. */
export function ContentPlaceholder({
  source,
  status,
  theme,
  textStyle,
  onPress,
}: {
  source: string;
  status?: string;
  theme: PluginTheme;
  textStyle: TextStyle;
  onPress(): void;
}) {
  const entry = useViewerEntry(onPress);
  return (
    <Pressable
      {...entry}
      accessibilityRole="button"
      accessibilityLabel={`View source: ${source}`}
      style={{ width: "100%", minWidth: 0, marginVertical: 6 }}
    >
      <View style={{ gap: 4 }}>
        <Text
          selectable
          style={[textStyle, { color: theme.colors.foreground, fontFamily: monospace }]}
        >
          {source}
        </Text>
        {status ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{status}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

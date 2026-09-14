import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { Pressable, Text, View } from "react-native";

export interface ActionItem {
  key: string;
  icon: string;
  label: string;
  onPress(): void;
  disabled?: boolean;
}

/** Compact row of icon buttons rendered under a formula or diagram. */
export function ActionBar({
  actions,
  theme,
  compact,
  hint,
}: {
  actions: ActionItem[];
  theme: PluginTheme;
  compact: boolean;
  hint?: string;
}) {
  const colors = theme.colors;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: compact ? 4 : 8,
        marginTop: 4,
      }}
    >
      {actions.map((action) => (
        <Pressable
          key={action.key}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          disabled={action.disabled}
          onPress={action.onPress}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 8,
            minHeight: 28,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: pressed ? colors.surface2 : colors.surface1,
            opacity: action.disabled ? 0.5 : 1,
          })}
        >
          <Icon name={action.icon} size={12} color={colors.foregroundMuted} />
          <Text style={{ color: colors.foregroundMuted, fontSize: compact ? 11 : 12 }}>
            {action.label}
          </Text>
        </Pressable>
      ))}
      {hint ? (
        <Text style={{ color: colors.foregroundMuted, fontSize: compact ? 11 : 12, flexShrink: 1 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

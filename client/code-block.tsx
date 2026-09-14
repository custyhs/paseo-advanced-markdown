import { copyText, useToast } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useCallback } from "react";
import { Platform, ScrollView, Text, View, type TextStyle } from "react-native";
import { ActionBar } from "./action-bar.js";

export const monospace =
  Platform.OS === "ios"
    ? "Menlo"
    : Platform.OS === "android"
      ? "monospace"
      : "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * Plain, copyable source display used for ordinary fences, unclosed or
 * disabled extension blocks, and the source view behind rendered images.
 */
export function CodeBlock({
  source,
  copySource,
  label,
  theme,
  compact,
  textStyle,
  status,
  actions,
}: {
  /** Text shown in the block. */
  source: string;
  /** Text placed on the clipboard; defaults to `source`. */
  copySource?: string;
  label?: string;
  theme: PluginTheme;
  compact: boolean;
  textStyle: TextStyle;
  status?: string;
  actions?: Parameters<typeof ActionBar>[0]["actions"];
}) {
  const colors = theme.colors;
  const toast = useToast();
  const onCopy = useCallback(async () => {
    try {
      await copyText(copySource ?? source);
      toast.show("Source copied", { variant: "success" });
    } catch {
      toast.error("Unable to copy the source.");
    }
  }, [copySource, source, toast]);
  return (
    <View
      style={{
        width: "100%",
        marginVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface1,
        padding: compact ? 8 : 10,
      }}
    >
      {label ? (
        <Text
          style={{ color: colors.foregroundMuted, fontSize: compact ? 11 : 12, marginBottom: 4 }}
        >
          {label}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator style={{ width: "100%", flexGrow: 0 }}>
        <Text
          selectable
          accessibilityLabel={label ? `${label}: ${source}` : source}
          style={[
            textStyle,
            {
              color: colors.foreground,
              fontFamily: monospace,
              fontSize: (textStyle.fontSize ?? 16) - 2,
              lineHeight: ((textStyle.fontSize ?? 16) - 2) * 1.5,
            },
          ]}
        >
          {source.replace(/\n$/, "")}
        </Text>
      </ScrollView>
      <ActionBar
        theme={theme}
        compact={compact}
        hint={status}
        actions={[
          { key: "copy", icon: "Copy", label: "Copy source", onPress: () => void onCopy() },
          ...(actions ?? []),
        ]}
      />
    </View>
  );
}

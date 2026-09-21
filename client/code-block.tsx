import { ScrollView, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Text,
  View,
  type ScrollView as NativeScrollView,
  type TextStyle,
} from "react-native";
import { ActionBar } from "./action-bar.js";
import { enableHorizontalDrag } from "./web.js";

export const monospace =
  Platform.OS === "ios"
    ? "Menlo"
    : Platform.OS === "android"
      ? "monospace"
      : "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * Plain, copyable source display used for ordinary fences, unclosed or
 * disabled extension blocks.
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
  const scrollRef = useRef<NativeScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [selectText, setSelectText] = useState(false);
  const canDrag =
    Platform.OS === "web" && !compact && viewportWidth > 0 && contentWidth > viewportWidth + 1;
  const dragEnabled = canDrag && !selectText;
  useEffect(() => {
    if (dragEnabled) return enableHorizontalDrag(scrollRef.current);
  }, [dragEnabled]);
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
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          if (width > 0) setViewportWidth(width);
        }}
        onContentSizeChange={(width) => {
          if (width > 0) setContentWidth(width);
        }}
        style={{ width: "100%", flexGrow: 0 }}
      >
        <Text
          selectable={!dragEnabled}
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
          ...(canDrag
            ? [
                {
                  key: "interaction",
                  icon: selectText ? "MoveHorizontal" : "TextCursor",
                  label: selectText ? "Drag to scroll" : "Select text",
                  onPress: () => setSelectText((selected) => !selected),
                },
              ]
            : []),
          ...(actions ?? []),
        ]}
      />
    </View>
  );
}

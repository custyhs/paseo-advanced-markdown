import { Modal, ScrollView } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

const ZOOMS = [1, 1.5, 2, 3] as const;

/** Full-size, scrollable view of a rendered block image. */
export function ZoomModal({
  open,
  onOpenChange,
  title,
  uri,
  width,
  height,
  label,
  theme,
  compact,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  uri: string;
  /** Logical image size at 1x. */
  width: number;
  height: number;
  label: string;
  theme: PluginTheme;
  compact: boolean;
}) {
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1);
  const colors = theme.colors;
  return (
    <Modal title={title} open={open} onOpenChange={onOpenChange}>
      <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, flex: 1 }}>
        <View
          style={{ flexDirection: "row", gap: 8, padding: compact ? 8 : 12, alignItems: "center" }}
        >
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>Zoom</Text>
          {ZOOMS.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Zoom ${value}x`}
              onPress={() => setZoom(value)}
              style={{
                paddingHorizontal: 10,
                minHeight: 28,
                justifyContent: "center",
                borderRadius: 6,
                borderWidth: 1,
                borderColor: zoom === value ? colors.accent : colors.border,
                backgroundColor: zoom === value ? colors.accent : colors.surface1,
              }}
            >
              <Text
                style={{
                  color: zoom === value ? colors.accentForeground : colors.foreground,
                  fontSize: 12,
                }}
              >
                {value}x
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: compact ? 8 : 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <Image
              source={{ uri }}
              accessible
              accessibilityLabel={label}
              resizeMode="contain"
              fadeDuration={0}
              style={{ width: width * zoom, height: height * zoom }}
            />
          </ScrollView>
        </ScrollView>
      </Modal.Content>
    </Modal>
  );
}

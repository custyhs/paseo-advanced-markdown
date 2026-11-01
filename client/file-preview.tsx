import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal, ScrollView, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import { previewFile } from "../shared/file-preview.js";
import { monospace } from "./code-block.js";

type Appearance = { theme: PluginTheme; compact: boolean };

/** Mounted only after a reader activates a local file link. */
export function FilePreview({
  href,
  agentId,
  hostId,
  theme,
  compact,
  onClose,
}: Appearance & {
  href: string;
  agentId: string;
  hostId: string;
  onClose(): void;
}) {
  const call = useRpc(previewFile);
  const query = useQuery({
    queryKey: ["advanced-markdown", "file-preview", hostId, agentId, href],
    queryFn: () => call({ agentId, href }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Each activation reads the current file; closing the viewer releases its contents.
    gcTime: 0,
    staleTime: 0,
  });
  const result = query.data?.ok ? query.data : undefined;
  let failure: string | undefined;
  if (query.isError) failure = query.error.message;
  else if (query.data && !query.data.ok) failure = query.data.message;
  const colors = theme.colors;
  const toast = useToast();
  const copy = async (text: string, label: string) => {
    try {
      await copyText(text);
      toast.show(`${label} copied`, { variant: "success" });
    } catch {
      toast.error(`Unable to copy ${label}.`);
    }
  };
  const empty = result?.totalLines === 1 && result.content.length === 0;
  const lines = result && !empty ? result.content.split("\n") : [];
  const endLine = result ? result.startLine + lines.length - 1 : 0;
  const appearance = { theme, compact };
  return (
    <Modal
      title="File preview"
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ padding: compact ? 12 : 16, gap: 12 }}>
        <Text
          selectable
          style={{ color: colors.foreground, fontFamily: monospace, fontSize: 12, lineHeight: 18 }}
        >
          {result?.path ?? href}
        </Text>
        {result ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
              <FileButton
                {...appearance}
                label="Copy path"
                onPress={() => void copy(result.path, "File path")}
              />
              <FileButton
                {...appearance}
                label="Copy source"
                accessibilityLabel="Copy displayed source"
                onPress={() => void copy(result.content, "Displayed source")}
              />
            </View>
            <Text style={{ color: colors.foregroundMuted, fontSize: 12, lineHeight: 18 }}>
              {empty
                ? "Empty file"
                : `Lines ${result.startLine}–${endLine} of ${result.totalLines}`}
              {result.lineStart !== null
                ? ` · Linked ${
                    result.lineEnd !== null && result.lineEnd !== result.lineStart
                      ? `lines ${result.lineStart}–${result.lineEnd}`
                      : `line ${result.lineStart}`
                  }`
                : ""}
              {result.truncated ? " · Partial preview; Copy source copies only the shown text" : ""}
            </Text>
            {lines.length > 0 && (
              // Modal.Content owns vertical scrolling, including native sheet gestures.
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                contentContainerStyle={{ minWidth: "100%", paddingVertical: 8 }}
                style={{ backgroundColor: colors.surface1, borderRadius: 6 }}
              >
                <View style={{ flexGrow: 1 }}>
                  {lines.map((line, index) => {
                    const number = result.startLine + index;
                    const linked =
                      result.lineStart !== null &&
                      number >= result.lineStart &&
                      number <= (result.lineEnd ?? result.lineStart);
                    return (
                      <View
                        key={number}
                        style={{
                          flexDirection: "row",
                          backgroundColor: linked ? colors.surface2 : "transparent",
                          borderLeftWidth: 2,
                          borderLeftColor: linked ? colors.accent : "transparent",
                        }}
                      >
                        <Text
                          style={{
                            width: String(endLine).length * 9 + 20,
                            paddingRight: 10,
                            textAlign: "right",
                            fontFamily: monospace,
                            fontSize: 13,
                            lineHeight: 21,
                            color: linked ? colors.accent : colors.foregroundMuted,
                          }}
                        >
                          {number}
                        </Text>
                        <Text
                          selectable
                          style={{
                            paddingRight: 12,
                            fontFamily: monospace,
                            fontSize: 13,
                            lineHeight: 21,
                            color: colors.foreground,
                          }}
                        >
                          {line || " "}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </>
        ) : query.isFetching ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.foregroundMuted, fontSize: 14 }}
          >
            Loading file…
          </Text>
        ) : (
          <View style={{ gap: 8, alignItems: "flex-start" }}>
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: colors.foregroundMuted, fontSize: 14 }}
            >
              {failure ?? "Unable to load this file."}
            </Text>
            <FileButton {...appearance} label="Retry" onPress={() => void query.refetch()} />
          </View>
        )}
      </Modal.Content>
    </Modal>
  );
}

function FileButton({
  label,
  accessibilityLabel,
  onPress,
  theme,
  compact,
}: Appearance & {
  label: string;
  accessibilityLabel?: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: compact ? 44 : 32,
        paddingHorizontal: 10,
        borderRadius: 6,
        justifyContent: "center",
        backgroundColor: pressed ? theme.colors.surface2 : "transparent",
      })}
    >
      <Text style={{ fontSize: 14, color: theme.colors.foregroundMuted }}>{label}</Text>
    </Pressable>
  );
}

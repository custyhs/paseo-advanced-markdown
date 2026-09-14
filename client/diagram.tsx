import { useRpc } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, View, type TextStyle } from "react-native";
import {
  renderMermaid,
  type MermaidRenderInput,
  type MermaidRenderOutput,
  type MermaidTheme,
} from "../shared/rpc.js";
import { MAX_MERMAID_SOURCE } from "../shared/limits.js";
import { ActionBar } from "./action-bar.js";
import { CodeBlock } from "./code-block.js";
import {
  forgetRender,
  peekRender,
  renderKey,
  requestRender,
  type CachedRender,
} from "./render-cache.js";
import { ZoomModal } from "./zoom-modal.js";

type DiagramProps = {
  /** Diagram definition inside the fence. */
  definition: string;
  /** Exact fenced source range; the copy target. */
  source: string;
  hostId: string;
  theme: PluginTheme;
  mermaidTheme: MermaidTheme;
  compact: boolean;
  enabled: boolean;
  textStyle: TextStyle;
  /** Width available to the message body, in logical pixels. */
  containerWidth: number;
};

const RETRYABLE = new Set(["busy", "timeout", "unavailable", "failed"]);

function statusFor(
  result: CachedRender<MermaidRenderOutput> | undefined,
  eligible: boolean,
): string {
  if (!eligible) return "Diagram is too long to render";
  if (result === undefined) return "Rendering diagram…";
  if (result === null) return "Host unreachable; showing source";
  if (result.ok) return "";
  switch (result.reason) {
    case "invalid":
      return result.message
        ? `Mermaid error: ${result.message}`
        : "Mermaid could not parse this diagram";
    case "too-large":
      return result.message ?? "Diagram exceeds the size budget";
    case "timeout":
      return "Rendering timed out";
    case "busy":
      return "Renderer is busy; retry shortly";
    case "unavailable":
      return result.message ?? "Mermaid runtime is not available on this host";
    default:
      return result.message ?? "Rendering failed";
  }
}

export const Diagram = memo(function Diagram({
  definition,
  source,
  hostId,
  theme,
  mermaidTheme,
  compact,
  enabled,
  textStyle,
  containerWidth,
}: DiagramProps) {
  const call = useRpc(renderMermaid);
  const callRef = useRef(call);
  callRef.current = call;
  const input: MermaidRenderInput = { source: definition, theme: mermaidTheme };
  const key = renderKey("mermaid", hostId, input);
  const [settled, setSettled] = useState<{
    key: string;
    result: CachedRender<MermaidRenderOutput>;
  }>();
  const [failedImage, setFailedImage] = useState<string>();
  const [showSource, setShowSource] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const toast = useToast();
  const cached = peekRender<MermaidRenderOutput>(key);
  const result = settled?.key === key ? settled.result : cached;
  const eligible =
    enabled && definition.trim().length > 0 && definition.length <= MAX_MERMAID_SOURCE;

  // biome-ignore lint/correctness/useExhaustiveDependencies: key already encodes definition and theme; attempt forces a retry
  useEffect(() => {
    if (!eligible) return;
    let current = true;
    void requestRender<MermaidRenderInput, MermaidRenderOutput>(key, input, callRef.current, {
      retryableReasons: (output) => !output.ok && RETRYABLE.has(output.reason),
    }).then((next) => {
      if (current) setSettled({ key, result: next });
    });
    return () => {
      current = false;
    };
  }, [key, eligible, attempt]);

  const retry = useCallback(() => {
    forgetRender(key);
    setSettled(undefined);
    setFailedImage(undefined);
    setAttempt((value) => value + 1);
  }, [key]);

  const copy = useCallback(async () => {
    try {
      await copyText(source);
      toast.show("Diagram source copied", { variant: "success" });
    } catch {
      toast.error("Unable to copy the source.");
    }
  }, [source, toast]);

  const usable = eligible && result?.ok && failedImage !== key;
  if (!usable || showSource) {
    const status = enabled ? statusFor(result, eligible) : "Mermaid module is off; showing source";
    const retryable =
      enabled &&
      (result === null ||
        failedImage === key ||
        (result && !result.ok && RETRYABLE.has(result.reason)));
    return (
      <CodeBlock
        source={definition}
        copySource={source}
        label="mermaid"
        theme={theme}
        compact={compact}
        textStyle={textStyle}
        status={showSource && usable ? undefined : status}
        actions={[
          ...(usable
            ? [
                {
                  key: "render",
                  icon: "GitBranch",
                  label: "Show diagram",
                  onPress: () => setShowSource(false),
                },
              ]
            : []),
          ...(retryable
            ? [{ key: "retry", icon: "RefreshCw", label: "Retry", onPress: retry }]
            : []),
        ]}
      />
    );
  }

  const uri = `data:image/png;base64,${result.png}`;
  const available = Math.max(64, containerWidth - 16);
  const fit = Math.min(1, available / result.width);
  const width = Math.round(result.width * fit);
  const height = Math.round(result.height * fit);
  const colors = theme.colors;
  return (
    <View style={{ width: "100%", marginVertical: 6 }}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Diagram: ${definition}`}
        accessibilityHint="Opens the diagram at full size"
        onPress={() => setZoomOpen(true)}
        style={{
          alignSelf: "flex-start",
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface1,
          padding: 8,
        }}
      >
        <Image
          key={key}
          source={{ uri }}
          accessible
          accessibilityLabel={definition}
          resizeMode="contain"
          fadeDuration={0}
          onError={() => setFailedImage(key)}
          style={{ width, height }}
        />
      </Pressable>
      <ActionBar
        theme={theme}
        compact={compact}
        hint={fit < 1 ? "Scaled to fit; expand for full size" : undefined}
        actions={[
          { key: "copy", icon: "Copy", label: "Copy source", onPress: () => void copy() },
          { key: "source", icon: "Code", label: "Show source", onPress: () => setShowSource(true) },
          { key: "expand", icon: "Maximize2", label: "Expand", onPress: () => setZoomOpen(true) },
        ]}
      />
      {zoomOpen ? (
        <ZoomModal
          open={zoomOpen}
          onOpenChange={setZoomOpen}
          title="Diagram"
          uri={uri}
          width={result.width}
          height={result.height}
          label={definition}
          theme={theme}
          compact={compact}
        />
      ) : null}
    </View>
  );
});

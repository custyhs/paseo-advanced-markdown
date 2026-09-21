import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, View, type TextStyle } from "react-native";
import {
  renderMermaid,
  type MermaidRenderInput,
  type MermaidRenderOutput,
  type MermaidTheme,
} from "../shared/rpc.js";
import { MAX_MERMAID_SOURCE } from "../shared/limits.js";
import { ContentPlaceholder } from "./content-placeholder.js";
import {
  forgetRender,
  peekRender,
  renderKey,
  requestRender,
  type CachedRender,
} from "./render-cache.js";
import { useContentViewer, type ViewerSelection } from "./viewer-context.js";
import { useViewerEntry } from "./viewer-entry.js";

type DiagramProps = {
  viewerId: string;
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
  viewerId,
  definition,
  source,
  hostId,
  theme,
  mermaidTheme,
  enabled,
  textStyle,
  containerWidth,
}: DiagramProps) {
  const viewer = useContentViewer();
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
  const [attempt, setAttempt] = useState(0);
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

  const image = useMemo(
    () =>
      eligible && result?.ok && failedImage !== key
        ? { uri: `data:image/png;base64,${result.png}`, width: result.width, height: result.height }
        : undefined,
    [eligible, result, failedImage, key],
  );
  const status = image
    ? undefined
    : !enabled
      ? "Mermaid module is off; showing source"
      : failedImage === key
        ? "Unable to display diagram; showing source"
        : !definition.trim()
          ? "Diagram is empty; showing source"
          : statusFor(result, eligible);
  const retryable =
    enabled &&
    (result === null ||
      failedImage === key ||
      (result && !result.ok && RETRYABLE.has(result.reason)));
  const fit = image ? Math.min(1, Math.max(64, containerWidth) / image.width) : 1;
  const selection = useMemo<ViewerSelection>(
    () => ({
      id: viewerId,
      kind: "diagram",
      source,
      body: definition,
      image,
      readingScale: fit,
      status,
      canRetry: !!retryable,
      retry: eligible ? retry : undefined,
    }),
    [viewerId, source, definition, image, fit, status, retryable, eligible, retry],
  );
  const updateViewer = viewer?.update;
  useEffect(() => {
    updateViewer?.(selection);
  }, [selection, updateViewer]);
  const openViewer = viewer?.open;
  const open = useCallback(() => openViewer?.(selection), [openViewer, selection]);
  const entry = useViewerEntry(open);

  if (!image) {
    return (
      <ContentPlaceholder
        source={definition}
        theme={theme}
        textStyle={textStyle}
        status={status}
        onPress={open}
      />
    );
  }

  const width = Math.round(image.width * fit);
  const height = Math.round(image.height * fit);
  return (
    <View style={{ width: "100%", marginVertical: 8 }}>
      <Pressable
        {...entry}
        accessibilityRole="button"
        accessibilityLabel={`View diagram: ${definition}`}
        style={{ alignSelf: "flex-start" }}
      >
        <Image
          key={key}
          source={{ uri: image.uri }}
          accessible={false}
          resizeMode="contain"
          fadeDuration={0}
          onError={() => setFailedImage(key)}
          style={{ width, height }}
        />
      </Pressable>
    </View>
  );
});

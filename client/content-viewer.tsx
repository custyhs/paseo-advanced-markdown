import type { PluginTheme } from "@getpaseo/plugin";
import { Modal, ScrollView, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Image, PixelRatio, Pressable, Text, View, useWindowDimensions } from "react-native";
import { monospace } from "./code-block.js";
import { ImageScrollView } from "./image-scroll-view.js";
import { chooseMathDensity, inspectorScale } from "./math-layout.js";
import { useMathImage } from "./use-math-image.js";
import { ContentViewerContext, type ViewerImage, type ViewerSelection } from "./viewer-context.js";

type Appearance = { theme: PluginTheme; compact: boolean };

/** One modal owner outside native Text, shared by every entry in a timeline row. */
export function ContentViewerProvider({
  children,
  source,
  resetKey,
  theme,
  compact,
}: Appearance & {
  children: ReactNode;
  source: string;
  resetKey: string;
}) {
  const [active, setActive] = useState<{ selection: ViewerSelection; session: number }>();
  const session = useRef(0);
  const scope = useRef(resetKey);
  const api = useMemo(
    () => ({
      open(selection: ViewerSelection) {
        setActive({ selection, session: ++session.current });
      },
      update(selection: ViewerSelection) {
        setActive((current) =>
          current?.selection.id === selection.id && current.selection !== selection
            ? { ...current, selection }
            : current,
        );
      },
    }),
    [],
  );
  useEffect(() => {
    if (scope.current !== resetKey) {
      scope.current = resetKey;
      setActive(undefined);
    }
  }, [resetKey]);
  useEffect(() => {
    setActive((current) =>
      current && !source.includes(current.selection.source) ? undefined : current,
    );
  }, [source]);
  return (
    <ContentViewerContext.Provider value={api}>
      {children}
      {active && (
        <ContentViewer
          key={active.session}
          selection={active.selection}
          rowSource={source}
          theme={theme}
          compact={compact}
          onClose={() =>
            setActive((current) => (current?.session === active.session ? undefined : current))
          }
        />
      )}
    </ContentViewerContext.Provider>
  );
}

function ViewerButton({
  label,
  accessibilityLabel,
  onPress,
  selected,
  disabled,
  theme,
  compact,
}: Appearance & {
  label: string;
  accessibilityLabel?: string;
  onPress(): void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const colors = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: compact ? 44 : 32,
        paddingHorizontal: 10,
        borderRadius: 6,
        justifyContent: "center",
        backgroundColor: selected || pressed ? colors.surface2 : "transparent",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Text style={{ fontSize: 14, color: selected ? colors.foreground : colors.foregroundMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function ContentViewer({
  selection,
  rowSource,
  onClose,
  theme,
  compact,
}: Appearance & {
  selection: ViewerSelection;
  rowSource: string;
  onClose(): void;
}) {
  const [mode, setMode] = useState<"preview" | "source">(selection.image ? "preview" : "source");
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [more, setMore] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [failedImage, setFailedImage] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const viewportHeight = Math.max(120, Math.min(420, windowHeight * 0.5));
  const reading = selection.math?.preferredScale ?? selection.readingScale ?? 1;
  const image = selection.image;
  const imageUri = image?.uri;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new source image clears only its previous decode failure.
  useEffect(() => setFailedImage(false), [imageUri]);
  const scale = image
    ? inspectorScale({
        width: image.width,
        height: image.height,
        preferredScale: reading,
        viewportWidth: viewportWidth - 24,
        viewportHeight: viewportHeight - 24,
        // Raster diagrams keep their original size until explicitly enlarged.
        fitCeiling: selection.kind === "diagram" ? 1 : undefined,
        zoom,
      })
    : reading;
  const preview = mode === "preview" && image && !failedImage;
  const toast = useToast();
  const copy = async (text: string, label: string) => {
    try {
      await copyText(text);
      toast.show(`${label} copied`, { variant: "success" });
      setMore(false);
    } catch {
      toast.error(`Unable to copy ${label}.`);
    }
  };
  const appearance = { theme, compact };
  const bodyLabel = selection.kind === "formula" ? "LaTeX" : "Mermaid";
  const sourceMode = mode === "source" || !image || failedImage;
  const retry = () => {
    setFailedImage(false);
    selection.retry?.();
  };
  const zoomBy = (factor: number) =>
    setZoom(Math.min(8, Math.max(0.1, (scale / reading) * factor)));
  return (
    <Modal
      title={selection.kind === "formula" ? "Formula" : "Diagram"}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Content contentContainerStyle={{ padding: compact ? 12 : 16, gap: 12 }}>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
            <View
              style={{
                flexDirection: "row",
                borderRadius: 6,
                backgroundColor: theme.colors.surface1,
              }}
            >
              <ViewerButton
                {...appearance}
                label="Preview"
                selected={!sourceMode}
                disabled={!image || failedImage}
                onPress={() => setMode("preview")}
              />
              <ViewerButton
                {...appearance}
                label="Source"
                selected={sourceMode}
                onPress={() => setMode("source")}
              />
            </View>
            <View style={{ flex: 1 }} />
            <ViewerButton
              {...appearance}
              label={`Copy ${sourceMode ? "Markdown" : bodyLabel}`}
              onPress={() =>
                void copy(
                  sourceMode ? selection.source : selection.body,
                  sourceMode ? "Markdown source" : bodyLabel,
                )
              }
            />
            <ViewerButton
              {...appearance}
              label="More"
              selected={more}
              onPress={() => setMore(!more)}
            />
          </View>
          {more && (
            <View
              style={{
                alignItems: "flex-start",
                padding: 4,
                borderRadius: 6,
                backgroundColor: theme.colors.surface1,
              }}
            >
              <ViewerButton
                {...appearance}
                label={`Copy ${sourceMode ? bodyLabel : "Markdown source"}`}
                onPress={() =>
                  void copy(
                    sourceMode ? selection.body : selection.source,
                    sourceMode ? bodyLabel : "Markdown source",
                  )
                }
              />
              <ViewerButton
                {...appearance}
                label="Copy fragment Markdown"
                onPress={() => void copy(rowSource, "Message fragment Markdown")}
              />
              {selection.onOpenLink && (
                <ViewerButton {...appearance} label="Open link" onPress={selection.onOpenLink} />
              )}
            </View>
          )}
          {preview && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <ViewerButton
                {...appearance}
                label="Fit"
                selected={zoom === "fit"}
                onPress={() => setZoom("fit")}
              />
              <ViewerButton
                {...appearance}
                label="−"
                accessibilityLabel="Zoom out"
                disabled={scale / reading <= 0.1}
                onPress={() => zoomBy(1 / 1.25)}
              />
              <Text
                accessibilityLabel="Zoom relative to reading size"
                style={{
                  width: 52,
                  textAlign: "center",
                  color: theme.colors.foregroundMuted,
                  fontSize: 12,
                }}
              >
                {Math.round((scale / reading) * 100)}%
              </Text>
              <ViewerButton
                {...appearance}
                label="+"
                accessibilityLabel="Zoom in"
                disabled={scale / reading >= 8}
                onPress={() => zoomBy(1.25)}
              />
            </View>
          )}
        </View>
        {selection.status || failedImage ? (
          <View style={{ gap: 4, alignItems: "flex-start" }}>
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}
            >
              {failedImage ? "Image unavailable; showing source" : selection.status}
            </Text>
            {(selection.canRetry || failedImage) && selection.retry && (
              <ViewerButton {...appearance} label="Retry" onPress={retry} />
            )}
          </View>
        ) : null}
        <View
          style={{ minWidth: 0, width: "100%" }}
          onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        >
          {preview ? (
            selection.math ? (
              <FormulaPreview
                selection={selection}
                scale={scale}
                viewportWidth={viewportWidth}
                viewportHeight={viewportHeight}
                theme={theme}
                compact={compact}
                onImageError={() => setFailedImage(true)}
              />
            ) : (
              <ImagePreview
                image={image}
                label={selection.source}
                scale={scale}
                viewportWidth={viewportWidth}
                viewportHeight={viewportHeight}
                onImageError={() => setFailedImage(true)}
              />
            )
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              contentContainerStyle={{ padding: 12 }}
              style={{ backgroundColor: theme.colors.surface1, borderRadius: 6 }}
            >
              <Text
                selectable
                style={{
                  fontFamily: monospace,
                  fontSize: 14,
                  lineHeight: 21,
                  color: theme.colors.foreground,
                }}
              >
                {selection.source}
              </Text>
            </ScrollView>
          )}
        </View>
      </Modal.Content>
    </Modal>
  );
}

type PreviewProps = {
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  onImageError(): void;
};

function FormulaPreview({
  selection,
  theme,
  compact,
  ...preview
}: Appearance & PreviewProps & { selection: ViewerSelection }) {
  const math = selection.math!;
  const detail = useMathImage({
    ...math,
    density: chooseMathDensity(PixelRatio.get(), preview.scale),
  });
  const [failedDetail, setFailedDetail] = useState<string>();
  const candidate = detail.result?.ok
    ? {
        uri: `data:image/png;base64,${detail.result.png}`,
        width: detail.result.width,
        height: detail.result.height,
      }
    : selection.image!;
  const image = candidate.uri === failedDetail ? selection.image! : candidate;
  const decodeFailed = failedDetail === candidate.uri;
  const retryDetail = () => {
    setFailedDetail(undefined);
    detail.retry();
  };
  return (
    <View style={{ gap: 8 }}>
      <ImagePreview
        {...preview}
        image={image}
        label={selection.source}
        onImageError={() => {
          if (image.uri !== selection.image!.uri) setFailedDetail(image.uri);
          else preview.onImageError();
        }}
      />
      {detail.upgrading || detail.limited || decodeFailed ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}
        >
          {detail.upgrading && !decodeFailed
            ? "Loading sharper image…"
            : "Showing available image detail"}
        </Text>
      ) : null}
      {(detail.retryableDetail || decodeFailed) && (
        <ViewerButton
          theme={theme}
          compact={compact}
          label="Retry image detail"
          onPress={retryDetail}
        />
      )}
    </View>
  );
}

function ImagePreview({
  image,
  label,
  scale,
  viewportWidth,
  onImageError,
}: PreviewProps & { image: ViewerImage; label: string }) {
  const width = image.width * scale;
  const height = image.height * scale;
  const canvasHeight = Math.max(96, height + 24);
  return (
    // Modal.Content owns vertical scrolling, including native sheet gestures.
    <View style={{ minHeight: canvasHeight, justifyContent: "center" }}>
      <ImageScrollView
        showsHorizontalScrollIndicator
        nestedScrollEnabled
        contentContainerStyle={{
          minWidth: viewportWidth,
          padding: 12,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image
          source={{ uri: image.uri }}
          accessible
          accessibilityLabel={label}
          resizeMode="contain"
          fadeDuration={0}
          onError={onImageError}
          style={{ width, height }}
        />
      </ImageScrollView>
    </View>
  );
}

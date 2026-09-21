// Adapted from paseo-math (Apache-2.0); see NOTICE.
import type { PluginTheme } from "@getpaseo/plugin";
import { memo, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Image,
  PixelRatio,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
} from "react-native";
import { isRetryableMathResult, type MathRenderOutput } from "../shared/rpc.js";
import { ContentPlaceholder } from "./content-placeholder.js";
import { ImageScrollView } from "./image-scroll-view.js";
import { preferredFormulaScale } from "./formula-scale.js";
import { MathInlineLineHeightContext, MathLayoutContext } from "./math-context.js";
import { chooseMathDensity, fitFormula, inlineFormulaLayout } from "./math-layout.js";
import type { CachedRender } from "./render-cache.js";
import { useMathImage } from "./use-math-image.js";
import { useContentViewer, type ViewerSelection } from "./viewer-context.js";
import { useViewerEntry } from "./viewer-entry.js";

export type FormulaProps = {
  formulaId: string;
  viewerId: string;
  expression: string;
  /** Original expression body before entity decoding or normalization. */
  texSource?: string;
  /** Exact source range including delimiters or fence; never reconstructed. */
  source: string;
  display: boolean;
  block: boolean;
  promoted?: boolean;
  trailingPunctuation?: ReactNode[];
  onOpenLink?: () => void;
  mathScale?: number;
  color: string;
  hostId: string;
  theme: PluginTheme;
  compact: boolean;
  enabled: boolean;
  textStyle: TextStyle;
  maxInlineWidth: number;
};

function statusFor(result: CachedRender<MathRenderOutput> | undefined, eligible: boolean): string {
  if (!eligible) return "Formula is too long to render";
  if (result === undefined) return "Rendering formula…";
  if (result === null) return "Host unreachable; showing source";
  if (result.ok) return "";
  return (
    result.message ??
    (result.reason === "too-large"
      ? "Formula is too large to render"
      : "Invalid TeX; showing source")
  );
}

export const Formula = memo(function Formula(props: FormulaProps) {
  const {
    expression,
    source,
    texSource,
    display,
    block,
    promoted,
    trailingPunctuation,
    color,
    hostId,
    theme,
    enabled,
    textStyle,
    maxInlineWidth,
    formulaId,
    viewerId,
    mathScale,
    onOpenLink,
  } = props;
  const layout = useContext(MathLayoutContext);
  const allocatedLineHeight = useContext(MathInlineLineHeightContext);
  const viewer = useContentViewer();
  const { fontScale } = useWindowDimensions();
  const [blockWidth, setBlockWidth] = useState(0);
  const [failedImage, setFailedImage] = useState<string>();
  const fontSize = textStyle.fontSize ?? 16;
  const preferredScale = preferredFormulaScale({
    fontSize,
    fontScale,
    block,
    display,
    platform: Platform.OS,
    mathScale,
  });
  // Preferred density also covers the permitted 15% fit reduction. Resizing a
  // paragraph therefore never starts a second RPC just to discard image detail.
  const detail = useMathImage({
    expression,
    display,
    color,
    hostId,
    enabled,
    density: chooseMathDensity(PixelRatio.get(), preferredScale),
  });
  const { result, eligible, key, retry: retryRender } = detail;
  const availableWidth = block ? blockWidth : (layout?.width ?? maxInlineWidth);
  const fit = fitFormula({ width: result?.ok ? result.width : 0, preferredScale, availableWidth });
  const inlineLayout = inlineFormulaLayout({
    height: result?.ok ? result.height : 0,
    baseline: result?.ok ? result.baseline : 0,
    scale: fit.scale,
    lineHeight: textStyle.lineHeight ?? fontSize * 1.5,
    fontScale,
    platform: Platform.OS,
  });
  const needsPromotion = fit.overflow || inlineLayout.promote;
  const reportLayout = layout?.reportLayout;
  useEffect(() => {
    if (!block)
      reportLayout?.(
        formulaId,
        enabled && eligible && fit.measured
          ? { promote: needsPromotion, lineHeight: inlineLayout.lineHeight }
          : undefined,
      );
  }, [
    block,
    enabled,
    eligible,
    fit.measured,
    needsPromotion,
    inlineLayout.lineHeight,
    formulaId,
    reportLayout,
  ]);
  const asBlock = block || promoted;
  const rendered = eligible && result?.ok && failedImage !== key ? result : undefined;
  const retry = useCallback(() => {
    setFailedImage(undefined);
    retryRender();
  }, [retryRender]);
  const status = !enabled
    ? "Math module is off; showing source"
    : failedImage === key
      ? "Formula image unavailable; showing source"
      : statusFor(result, eligible);
  const retryable =
    enabled &&
    (result === null ||
      failedImage === key ||
      (result !== undefined && isRetryableMathResult(result)));
  const selection = useMemo<ViewerSelection>(
    () => ({
      id: viewerId,
      kind: "formula",
      source,
      body: texSource ?? expression,
      image: rendered
        ? {
            uri: `data:image/png;base64,${rendered.png}`,
            width: rendered.width,
            height: rendered.height,
          }
        : undefined,
      status: status || undefined,
      retry: eligible ? retry : undefined,
      canRetry: !!retryable,
      math: {
        expression,
        display,
        color,
        hostId,
        enabled,
        preferredScale,
        seed: rendered,
      },
      onOpenLink,
    }),
    [
      viewerId,
      source,
      texSource,
      expression,
      rendered,
      status,
      retryable,
      eligible,
      retry,
      display,
      color,
      hostId,
      enabled,
      preferredScale,
      onOpenLink,
    ],
  );
  const updateViewer = viewer?.update;
  useEffect(() => {
    updateViewer?.(selection);
  }, [selection, updateViewer]);
  const entry = useViewerEntry(() => viewer?.open(selection));
  const native = Platform.OS === "ios" || Platform.OS === "android";
  const waitingForLineHeight = native && (allocatedLineHeight ?? 0) < inlineLayout.lineHeight;
  const inlineTextStyle = native ? [textStyle, { lineHeight: allocatedLineHeight }] : textStyle;
  let body: ReactNode;
  if (!rendered || !fit.measured || (!asBlock && (needsPromotion || waitingForLineHeight))) {
    body = asBlock ? (
      <View>
        <ContentPlaceholder
          source={source}
          theme={theme}
          textStyle={textStyle}
          status={status || undefined}
          onPress={() => viewer?.open(selection)}
        />
        {trailingPunctuation?.length ? (
          <Text selectable style={textStyle}>
            {trailingPunctuation}
          </Text>
        ) : null}
      </View>
    ) : (
      <Text
        {...entry}
        selectable
        accessibilityRole="button"
        accessibilityLabel={`Inspect formula: ${source}`}
        style={inlineTextStyle}
      >
        {source}
      </Text>
    );
  } else {
    const width = rendered.width * fit.scale;
    const height = rendered.height * fit.scale;
    const descent = Math.max(0, rendered.height - rendered.baseline) * fit.scale;
    const image = (
      <Image
        key={key}
        source={{ uri: `data:image/png;base64,${rendered.png}` }}
        accessible
        accessibilityLabel={source}
        resizeMode="contain"
        fadeDuration={0}
        onError={() => setFailedImage(key)}
        style={{ width, height, ...(asBlock ? {} : { transform: [{ translateY: descent }] }) }}
      />
    );
    body = asBlock ? (
      <ImageScrollView
        showsHorizontalScrollIndicator
        nestedScrollEnabled
        style={{ maxWidth: "100%", marginVertical: promoted ? 4 : 0 }}
        contentContainerStyle={{ alignItems: "flex-end" }}
      >
        <Pressable {...entry} accessibilityRole="button" accessibilityLabel="Inspect formula">
          {image}
        </Pressable>
        {trailingPunctuation?.length ? (
          <Text selectable style={[textStyle, { paddingBottom: descent }]}>
            {trailingPunctuation}
          </Text>
        ) : null}
      </ImageScrollView>
    ) : (
      <Text
        {...entry}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Inspect formula: ${source}`}
        style={[
          textStyle,
          {
            lineHeight: native
              ? allocatedLineHeight
              : Math.max(textStyle.lineHeight ?? fontSize * 1.5, (height + descent) / fontScale),
          },
        ]}
      >
        {/* Native attachments drop text attributes; this fragment carries the run's paragraph style. */}
        {native ? "\u200b" : null}
        {image}
      </Text>
    );
  }
  // Always keep the measurement wrapper, including before the first RPC/layout.
  return block ? (
    <View
      style={{ width: "100%", minWidth: 0 }}
      onLayout={(event) => setBlockWidth(event.nativeEvent.layout.width)}
    >
      {body}
    </View>
  ) : (
    body
  );
});

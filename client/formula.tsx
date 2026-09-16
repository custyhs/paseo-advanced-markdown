// Adapted from paseo-math (Apache-2.0); see NOTICE.
import { copyText, useToast } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { memo, useContext, useEffect, useState, type ReactNode } from "react";
import {
  Image,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
} from "react-native";
import { isRetryableMathResult, type MathRenderOutput } from "../shared/rpc.js";
import { ActionBar } from "./action-bar.js";
import { CodeBlock } from "./code-block.js";
import { preferredFormulaScale } from "./formula-scale.js";
import { MathLayoutContext } from "./math-context.js";
import { useMathInspector } from "./math-inspector.js";
import { chooseMathDensity, fitFormula } from "./math-layout.js";
import type { CachedRender } from "./render-cache.js";
import { useMathImage } from "./use-math-image.js";

export type FormulaProps = {
  formulaId: string;
  expression: string;
  /** Original expression body before entity decoding or normalization. */
  texSource?: string;
  /** Exact source range including delimiters or fence; never reconstructed. */
  source: string;
  display: boolean;
  block: boolean;
  promoted?: boolean;
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
    color,
    hostId,
    theme,
    compact,
    enabled,
    textStyle,
    maxInlineWidth,
    formulaId,
    mathScale,
    onOpenLink,
  } = props;
  const layout = useContext(MathLayoutContext);
  const inspect = useMathInspector();
  const toast = useToast();
  const { fontScale } = useWindowDimensions();
  const [blockWidth, setBlockWidth] = useState(0);
  const [failedImage, setFailedImage] = useState<string>();
  const [showSource, setShowSource] = useState(false);
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
  const { result, eligible, key } = detail;
  const availableWidth = block ? blockWidth : (layout?.width ?? maxInlineWidth);
  const fit = fitFormula({ width: result?.ok ? result.width : 0, preferredScale, availableWidth });
  const reportOverflow = layout?.reportOverflow;
  useEffect(() => {
    if (!block)
      reportOverflow?.(formulaId, !!(enabled && eligible && fit.measured && fit.overflow));
  }, [block, enabled, eligible, fit.measured, fit.overflow, formulaId, reportOverflow]);
  const asBlock = block || promoted;
  const usable = eligible && result?.ok && failedImage !== key && fit.measured;
  const retry = () => {
    setFailedImage(undefined);
    detail.retry();
  };
  const copy = async (text: string, label: string) => {
    try {
      await copyText(text);
      toast.show(`${label} copied`, { variant: "success" });
    } catch {
      toast.error("Unable to copy the formula.");
    }
  };
  const sourceText = (
    <Text selectable style={textStyle} accessibilityLabel={source}>
      {source}
    </Text>
  );
  let body: ReactNode;
  if (!usable || showSource || (!asBlock && fit.overflow)) {
    const status = enabled ? statusFor(result, eligible) : "Math module is off; showing source";
    const retryable =
      enabled &&
      (result === null ||
        failedImage === key ||
        (result !== undefined && isRetryableMathResult(result)));
    body = asBlock ? (
      <CodeBlock
        source={source}
        label="math"
        theme={theme}
        compact={compact}
        textStyle={textStyle}
        status={showSource && usable ? undefined : status}
        actions={[
          ...(usable
            ? [
                {
                  key: "render",
                  icon: "Sigma",
                  label: "Show formula",
                  onPress: () => setShowSource(false),
                },
              ]
            : []),
          ...(retryable
            ? [{ key: "retry", icon: "RefreshCw", label: "Retry", onPress: retry }]
            : []),
        ]}
      />
    ) : retryable ? (
      <Text style={textStyle}>
        {sourceText}{" "}
        <Text
          accessibilityRole="button"
          accessibilityLabel={`Retry formula: ${status}`}
          onPress={retry}
          style={{ color: theme.colors.accent }}
        >
          Retry
        </Text>
      </Text>
    ) : (
      sourceText
    );
  } else {
    const width = result.width * fit.scale;
    const height = result.height * fit.scale;
    const descent = Math.max(0, result.height - result.baseline) * fit.scale;
    const open = (event?: { stopPropagation(): void }) => {
      event?.stopPropagation();
      inspect({ ...props, preferredScale, image: result });
    };
    const image = (
      <Image
        key={key}
        source={{ uri: `data:image/png;base64,${result.png}` }}
        accessible
        accessibilityLabel={source}
        resizeMode="contain"
        fadeDuration={0}
        onError={() => setFailedImage(key)}
        style={{ width, height, ...(asBlock ? {} : { transform: [{ translateY: descent }] }) }}
      />
    );
    body = asBlock ? (
      <View style={{ minWidth: 0, width: "100%", marginVertical: 4 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          nestedScrollEnabled
          style={{ maxWidth: "100%" }}
        >
          <Pressable accessibilityRole="button" accessibilityLabel="Inspect formula" onPress={open}>
            {image}
          </Pressable>
        </ScrollView>
        <ActionBar
          theme={theme}
          compact={compact}
          hint={fit.overflow ? "Scroll to read · Expand for details" : undefined}
          actions={[
            { key: "expand", icon: "Maximize2", label: "Expand", onPress: open },
            {
              key: "tex",
              icon: "Copy",
              label: "Copy TeX",
              onPress: () => {
                void copy(texSource ?? expression, "TeX");
              },
            },
            {
              key: "source",
              icon: "Copy",
              label: "Copy source",
              onPress: () => {
                void copy(source, "Formula source");
              },
            },
            { key: "show", icon: "Code", label: "Show source", onPress: () => setShowSource(true) },
            ...(onOpenLink
              ? [{ key: "link", icon: "ExternalLink", label: "Open link", onPress: onOpenLink }]
              : []),
          ]}
        />
      </View>
    ) : (
      <Text
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Inspect formula: ${source}`}
        onPress={open}
        style={[
          textStyle,
          {
            lineHeight: Math.max(
              textStyle.lineHeight ?? fontSize * 1.5,
              (height + descent) / fontScale,
            ),
          },
        ]}
      >
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

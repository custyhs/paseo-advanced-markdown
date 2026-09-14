// Adapted from paseo-math (Apache-2.0), client/formula.tsx at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
// Changes: shared image cache, block-level source toggle, copy, and retry
// actions, module-disabled source display, and theme-aware status text.
import { useRpc } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Image, Platform, ScrollView, Text, useWindowDimensions, type TextStyle } from "react-native";
import { renderMath, type MathRenderInput, type MathRenderOutput } from "../shared/rpc.js";
import { MAX_MATH_EXPRESSION } from "../shared/limits.js";
import { CodeBlock } from "./code-block.js";
import { formulaScale } from "./formula-scale.js";
import { forgetRender, peekRender, renderKey, requestRender, type CachedRender } from "./render-cache.js";

type FormulaProps = {
  expression: string;
  /** Exact source range including delimiters; the copy target. */
  source: string;
  display: boolean;
  block: boolean;
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
  return result.reason === "too-large" ? "Formula is too large to render" : "Invalid TeX; showing source";
}

export const Formula = memo(function Formula({
  expression,
  source,
  display,
  block,
  color,
  hostId,
  theme,
  compact,
  enabled,
  textStyle,
  maxInlineWidth,
}: FormulaProps) {
  const call = useRpc(renderMath);
  const callRef = useRef(call);
  callRef.current = call;
  const input: MathRenderInput = { expression, display, color };
  const key = renderKey("math", hostId, input);
  const [settled, setSettled] = useState<{ key: string; result: CachedRender<MathRenderOutput> }>();
  const [failedImage, setFailedImage] = useState<string>();
  const [showSource, setShowSource] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { fontScale } = useWindowDimensions();
  const cached = peekRender<MathRenderOutput>(key);
  const result = settled?.key === key ? settled.result : cached;
  const eligible = enabled && expression.length > 0 && expression.length <= MAX_MATH_EXPRESSION;

  useEffect(() => {
    if (!eligible) return;
    let current = true;
    void requestRender<MathRenderInput, MathRenderOutput>(key, { expression, display, color }, callRef.current).then(
      (next) => {
        if (current) setSettled({ key, result: next });
      },
    );
    return () => {
      current = false;
    };
  }, [key, expression, display, color, eligible, attempt]);

  const retry = useCallback(() => {
    forgetRender(key);
    setSettled(undefined);
    setFailedImage(undefined);
    setAttempt((value) => value + 1);
  }, [key]);

  const sourceText = (
    <Text selectable style={textStyle} accessibilityLabel={source}>
      {source}
    </Text>
  );

  const usable = eligible && result?.ok && failedImage !== key && (block || maxInlineWidth > 1);
  if (!usable || (block && showSource)) {
    if (!block) return sourceText;
    const status = enabled ? statusFor(result, eligible) : "Math module is off; showing source";
    const retryable = enabled && (result === null || failedImage === key);
    return (
      <CodeBlock
        source={source}
        label="math"
        theme={theme}
        compact={compact}
        textStyle={textStyle}
        status={showSource && usable ? undefined : status}
        actions={[
          ...(usable
            ? [{ key: "render", icon: "Sigma", label: "Show formula", onPress: () => setShowSource(false) }]
            : []),
          ...(retryable ? [{ key: "retry", icon: "RefreshCw", label: "Retry", onPress: retry }] : []),
        ]}
      />
    );
  }

  const fontSize = textStyle.fontSize ?? 16;
  const scale = formulaScale({
    fontSize,
    fontScale,
    block,
    display,
    platform: Platform.OS,
    maxInlineWidth,
    width: result.width,
  });
  const width = result.width * scale;
  const height = result.height * scale;
  const descent = Math.max(0, result.height - result.baseline) * scale;
  const image = (
    <Image
      key={key}
      source={{ uri: `data:image/png;base64,${result.png}` }}
      accessible
      accessibilityLabel={source}
      resizeMode="contain"
      fadeDuration={0}
      onError={() => setFailedImage(key)}
      style={{
        width,
        height,
        ...(block ? {} : { transform: [{ translateY: descent }] }),
      }}
    />
  );

  if (block) {
    return (
      <BlockFormula
        image={image}
        source={source}
        theme={theme}
        compact={compact}
        onShowSource={() => setShowSource(true)}
      />
    );
  }

  // Native inline images occupy a text attachment ending at the baseline.
  // Shift its descender below that baseline, reserving enough line height for
  // both the attachment and descender instead of clipping tall fractions.
  return (
    <Text
      accessible
      accessibilityLabel={source}
      style={[
        textStyle,
        {
          lineHeight: Math.max(textStyle.lineHeight ?? fontSize * 1.5, (height + descent) / fontScale),
        },
      ]}
    >
      {image}
    </Text>
  );
});

function BlockFormula({
  image,
  source,
  theme,
  compact,
  onShowSource,
}: {
  image: React.ReactElement;
  source: string;
  theme: PluginTheme;
  compact: boolean;
  onShowSource(): void;
}) {
  // Lazy import keeps the action bar out of the inline path.
  const { ActionBar } = require("./action-bar.js") as typeof import("./action-bar.js");
  const { copyText, useToast } = require("@getpaseo/plugin/client/react-native") as typeof import("@getpaseo/plugin/client/react-native");
  const toast = useToast();
  const copy = useCallback(async () => {
    try {
      await copyText(source);
      toast.show("Formula source copied", { variant: "success" });
    } catch {
      toast.error("Unable to copy the source.");
    }
  }, [source, toast]);
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        removeClippedSubviews={false}
        style={{ width: "100%", flexGrow: 0, marginTop: 6 }}
        contentContainerStyle={{ padding: 4 }}
        accessibilityLabel={`Formula: ${source}`}
      >
        {image}
      </ScrollView>
      <ActionBar
        theme={theme}
        compact={compact}
        actions={[
          { key: "copy", icon: "Copy", label: "Copy source", onPress: () => void copy() },
          { key: "source", icon: "Code", label: "Show source", onPress: onShowSource },
        ]}
      />
    </>
  );
}

import { Modal, copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Image, PixelRatio, ScrollView, Text, View } from "react-native";
import type { FormulaProps } from "./formula.js";
import type { MathRenderOutput } from "../shared/rpc.js";
import { CodeBlock } from "./code-block.js";
import { ActionBar } from "./action-bar.js";
import { chooseMathDensity, inspectorScale } from "./math-layout.js";
import { useMathImage } from "./use-math-image.js";

type Selection = FormulaProps & {
  preferredScale: number;
  image: Extract<MathRenderOutput, { ok: true }>;
};
const InspectorContext = createContext<(formula: Selection) => void>(() => {});
export const useMathInspector = () => useContext(InspectorContext);

/** Modal ownership stays outside native Text, including for inline entry points. */
export function MathInspectorProvider({
  children,
  source,
  resetKey,
}: {
  children: ReactNode;
  source: string;
  resetKey: string;
}) {
  const [selection, setSelection] = useState<Selection>();
  const scope = useRef(resetKey);
  useEffect(() => {
    if (scope.current !== resetKey) {
      scope.current = resetKey;
      setSelection(undefined);
    }
  }, [resetKey]);
  useEffect(() => {
    if (selection && !source.includes(selection.source)) setSelection(undefined);
  }, [source, selection]);
  return (
    <InspectorContext.Provider value={setSelection}>
      {children}
      {selection && (
        <MathInspector
          key={selection.formulaId}
          selection={selection}
          onClose={() => setSelection((current) => (current === selection ? undefined : current))}
        />
      )}
    </InspectorContext.Provider>
  );
}

function MathInspector({ selection, onClose }: { selection: Selection; onClose(): void }) {
  const [showSource, setShowSource] = useState(false);
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const toast = useToast();
  const padding = selection.compact ? 8 : 12;
  const scale = inspectorScale({
    width: selection.image.width,
    height: selection.image.height,
    preferredScale: selection.preferredScale,
    viewportWidth: viewport.width - padding * 2,
    viewportHeight: viewport.height - padding * 2,
    zoom,
  });
  const detail = useMathImage({
    ...selection,
    density: chooseMathDensity(PixelRatio.get(), scale),
    seed: selection.image,
  });
  const result = detail.result?.ok ? detail.result : selection.image;
  const copy = async (text: string, label: string) => {
    try {
      await copyText(text);
      toast.show(`${label} copied`, { variant: "success" });
    } catch {
      toast.error("Unable to copy the formula.");
    }
  };
  return (
    <Modal
      title="Formula"
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Content scrollable={false} contentContainerStyle={{ padding: 0, flex: 1 }}>
        <View style={{ paddingHorizontal: padding }}>
          <ActionBar
            theme={selection.theme}
            compact={selection.compact}
            actions={[
              {
                key: "fit",
                icon: "Minimize2",
                label: zoom === "fit" ? "Fit (selected)" : "Fit",
                onPress: () => setZoom("fit"),
              },
              ...[1, 1.5, 2, 3].map((value) => ({
                key: `zoom:${value}`,
                icon: "ZoomIn",
                label: `${value === 1 ? "Reading size" : `${value}×`}${zoom === value ? " (selected)" : ""}`,
                onPress: () => setZoom(value),
              })),
              {
                key: "tex",
                icon: "Copy",
                label: "Copy TeX",
                onPress: () => {
                  void copy(selection.texSource ?? selection.expression, "TeX");
                },
              },
              {
                key: "source",
                icon: "Copy",
                label: "Copy source",
                onPress: () => {
                  void copy(selection.source, "Formula source");
                },
              },
              {
                key: "source-view",
                icon: "Code",
                label: showSource ? "Show formula" : "Show source",
                onPress: () => setShowSource(!showSource),
              },
              { key: "close", icon: "X", label: "Close formula", onPress: onClose },
              ...(detail.retryableDetail
                ? [
                    {
                      key: "retry",
                      icon: "RefreshCw",
                      label: "Retry detail",
                      onPress: detail.retry,
                    },
                  ]
                : []),
            ]}
          />
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: selection.theme.colors.foregroundMuted, fontSize: 12 }}
          >
            {detail.upgrading
              ? "Loading sharper image…"
              : detail.limited
                ? detail.retryableDetail
                  ? "Host detail unavailable; keeping the current image"
                  : "Image detail limit reached; keeping the current image"
                : "Zoom is temporary; reading size follows Formula size."}
          </Text>
        </View>
        <View
          style={{ flex: 1, minHeight: 120 }}
          onLayout={(event) => setViewport(event.nativeEvent.layout)}
        >
          {showSource ? (
            <ScrollView style={{ flex: 1 }}>
              <CodeBlock
                source={selection.source}
                label="math"
                theme={selection.theme}
                compact={selection.compact}
                textStyle={selection.textStyle}
              />
            </ScrollView>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding }} nestedScrollEnabled>
              <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
                <Image
                  source={{ uri: `data:image/png;base64,${result.png}` }}
                  accessible
                  accessibilityLabel={selection.source}
                  resizeMode="contain"
                  fadeDuration={0}
                  style={{ width: result.width * scale, height: result.height * scale }}
                />
              </ScrollView>
            </ScrollView>
          )}
        </View>
      </Modal.Content>
    </Modal>
  );
}

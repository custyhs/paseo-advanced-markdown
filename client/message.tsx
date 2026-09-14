// Message renderer adapted from paseo-math (Apache-2.0), client/math-message.tsx at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
// Changes: Mermaid blocks, host-scoped module settings, plugin font scale,
// copyable code blocks, and item-level copy labelled by its actual scope.
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { copyText, Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, Text, View, type TextStyle } from "react-native";
import type { MessageData } from "../shared/message.js";
import { fontScaleToBaseSize, moduleSettings, type ModuleSettings } from "../shared/settings.js";
import Markdown, {
  MarkdownIt,
  markdownExtensions,
  MATH_BLOCK,
  MATH_INLINE,
  MERMAID_BLOCK,
  type ASTNode,
  type RenderFunction,
  type RenderRules,
} from "./generated/markdown.js";
import { CodeBlock, monospace } from "./code-block.js";
import { Diagram } from "./diagram.js";
import { Formula } from "./formula.js";
import { moduleState } from "./module-state.js";
import { colorHex, mermaidThemeFor } from "./theme.js";

const markdown = new MarkdownIt({
  html: false,
  typographer: false,
  linkify: true,
}).use(markdownExtensions);

// The dependency's runtime retains token.meta, but its public ASTNode type
// omits sourceMeta. Narrow that field instead of serializing TeX into markup.
type ExtensionNode = ASTNode & { sourceMeta?: unknown; info?: string };

function metaString(meta: unknown, field: string): string | undefined {
  if (meta && typeof meta === "object" && field in meta) {
    const value = (meta as Record<string, unknown>)[field];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function metaBoolean(meta: unknown, field: string): boolean | undefined {
  if (meta && typeof meta === "object" && field in meta) {
    const value = (meta as Record<string, unknown>)[field];
    return typeof value === "boolean" ? value : undefined;
  }
  return undefined;
}

function useModuleSettings(): ModuleSettings {
  const settings = useSettings(moduleSettings);
  const ready = settings.status === "ready" ? settings.values : null;
  useEffect(() => {
    if (ready) moduleState.set(ready);
  }, [ready]);
  return ready ?? moduleState.current;
}

export function MessageView(props: PluginTimelineItemProps<MessageData>) {
  const modules = useModuleSettings();
  return <MemoizedMessage {...props} modules={modules} />;
}

const MemoizedMessage = memo(
  function MessageBody({
    item,
    host,
    theme,
    layout,
    modules,
  }: PluginTimelineItemProps<MessageData> & { modules: ModuleSettings }) {
    const { text } = item.data;
    const colors = theme.colors;
    const toast = useToast();
    const [width, setWidth] = useState(0);
    const fontSize = fontScaleToBaseSize(modules.fontScale, layout.compact);
    const mermaidTheme = mermaidThemeFor(theme);
    const styles = useMemo(
      () => ({
        body: {
          color: colors.foreground,
          fontSize,
          lineHeight: fontSize * 1.5,
        },
        textgroup: { flexShrink: 1 },
        paragraph: { marginTop: 4, marginBottom: 8 },
        heading1: { fontSize: fontSize * 1.8, lineHeight: fontSize * 2.3, marginVertical: 8 },
        heading2: { fontSize: fontSize * 1.5, lineHeight: fontSize * 2, marginVertical: 6 },
        heading3: { fontSize: fontSize * 1.25, lineHeight: fontSize * 1.75, marginVertical: 4 },
        heading4: { fontSize: fontSize * 1.1, lineHeight: fontSize * 1.6, marginVertical: 4 },
        blockquote: {
          color: colors.foregroundMuted,
          backgroundColor: colors.surface1,
          borderColor: colors.border,
          paddingVertical: 4,
        },
        link: { color: colors.accent },
        code_inline: {
          color: colors.foreground,
          backgroundColor: colors.surface2,
          borderColor: colors.border,
          fontFamily: monospace,
          padding: 1,
        },
        hr: { backgroundColor: colors.border },
        table: { borderColor: colors.border },
        tr: { borderColor: colors.border },
        th: { padding: 6 },
        td: { padding: 6 },
        blocklink: { borderColor: colors.border },
      }),
      [
        fontSize,
        colors.foreground,
        colors.foregroundMuted,
        colors.surface1,
        colors.surface2,
        colors.border,
        colors.accent,
      ],
    );

    const rules = useMemo<RenderRules>(() => {
      const mathRule: RenderFunction = (node: ExtensionNode, _children, _parents, _styles, inherited: TextStyle = {}) => {
        const meta = node.sourceMeta;
        const source =
          metaString(meta, "source") ??
          `${node.markup}${node.content}${node.markup === "\\(" ? "\\)" : node.markup === "\\[" ? "\\]" : node.markup}`;
        return (
          <Formula
            key={node.key}
            expression={node.content}
            source={source}
            display={metaBoolean(meta, "display") ?? node.type === MATH_BLOCK}
            block={node.type === MATH_BLOCK}
            color={colorHex(inherited.color, colors.foreground)}
            hostId={host.id}
            theme={theme}
            compact={layout.compact}
            enabled={modules.math}
            textStyle={inherited}
            maxInlineWidth={Math.max(1, width - 48)}
          />
        );
      };
      const mermaidRule: RenderFunction = (node: ExtensionNode, _children, _parents, _styles, inherited: TextStyle = {}) => (
        <Diagram
          key={node.key}
          definition={node.content}
          source={metaString(node.sourceMeta, "source") ?? node.content}
          hostId={host.id}
          theme={theme}
          mermaidTheme={mermaidTheme}
          compact={layout.compact}
          enabled={modules.mermaid}
          textStyle={inherited}
          containerWidth={Math.max(64, width - 48)}
        />
      );
      const codeRule: RenderFunction = (node: ExtensionNode, _children, _parents, _styles, inherited: TextStyle = {}) => (
        <CodeBlock
          key={node.key}
          source={node.content}
          label={(node.info ?? "").trim().split(/\s+/)[0] || undefined}
          theme={theme}
          compact={layout.compact}
          textStyle={inherited}
        />
      );
      return {
        [MATH_INLINE]: mathRule,
        [MATH_BLOCK]: mathRule,
        [MERMAID_BLOCK]: mermaidRule,
        fence: codeRule,
        code_block: codeRule,
        text: (node, _children, _parents, ruleStyles, inherited = {}) => (
          <Text key={node.key} selectable style={[inherited, ruleStyles.text]}>
            {node.content}
          </Text>
        ),
        code_inline: (node, _children, _parents, ruleStyles, inherited = {}) => (
          <Text key={node.key} selectable style={[inherited, ruleStyles.code_inline]}>
            {node.content}
          </Text>
        ),
      };
    }, [colors.foreground, host.id, width, theme, layout.compact, modules.math, modules.mermaid, mermaidTheme]);

    const onLinkPress = useCallback(
      (url: string) => {
        // Opening happens only after a user's press, never while parsing/rendering.
        // Refuse custom app/file/script schemes even if a future parser allows them.
        if (!/^(?:https?:\/\/|mailto:)/i.test(url)) {
          toast.error("This link type is not supported.");
          return false;
        }
        void Linking.openURL(url).catch(() => toast.error("Unable to open this link."));
        return false;
      },
      [toast],
    );

    const copySource = useCallback(async () => {
      try {
        await copyText(text);
        toast.show("Message source copied", { variant: "success" });
      } catch {
        toast.error("Unable to copy the source.");
      }
    }, [text, toast]);

    return (
      <View
        style={{ minWidth: 0, width: "100%", paddingRight: 44, minHeight: 44 }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        <Markdown markdownit={markdown} style={styles} rules={rules} onLinkPress={onLinkPress}>
          {text}
        </Markdown>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy this message's source"
          onPress={copySource}
          style={({ pressed }) => ({
            position: "absolute",
            top: 0,
            right: 0,
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="Copy" size={14} color={colors.foregroundMuted} />
        </Pressable>
      </View>
    );
  },
  (previous, next) => {
    const a = previous.theme.colors;
    const b = next.theme.colors;
    return (
      previous.item.data.text === next.item.data.text &&
      previous.host.id === next.host.id &&
      previous.layout.compact === next.layout.compact &&
      previous.modules.math === next.modules.math &&
      previous.modules.mermaid === next.modules.mermaid &&
      previous.modules.fontScale === next.modules.fontScale &&
      a.surface0 === b.surface0 &&
      a.foreground === b.foreground &&
      a.foregroundMuted === b.foregroundMuted &&
      a.surface1 === b.surface1 &&
      a.surface2 === b.surface2 &&
      a.border === b.border &&
      a.accent === b.accent
    );
  },
);

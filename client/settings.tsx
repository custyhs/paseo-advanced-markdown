import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { Text } from "react-native";
import { runtimeStatus } from "../shared/rpc.js";
import {
  FONT_SCALES,
  MATH_SCALES,
  moduleSettings,
  type FontScale,
  type MathScale,
  type ModuleSettings,
} from "../shared/settings.js";
import { moduleState } from "./module-state.js";

const FONT_LABELS: Record<FontScale, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
};

export function SettingsScreen({ theme, host }: PluginSurfaceProps) {
  const settings = useSettings(moduleSettings);
  const status = useRpc(runtimeStatus);
  const runtime = useQuery({
    queryKey: ["advanced-markdown", "status", host.id],
    queryFn: () => status({}),
    staleTime: 10_000,
  });
  const colors = theme.colors;
  const values = settings.status === "ready" ? settings.values : null;
  useEffect(() => {
    if (values) moduleState.set(values);
  }, [values]);

  const update = useCallback(
    async (patch: Partial<ModuleSettings>) => {
      if (settings.status !== "ready") return;
      const next = { ...settings.values, ...patch };
      const saved = await settings.save(next, settings.revision);
      if (saved) moduleState.set(next);
    },
    [settings],
  );

  const muted = { color: colors.foregroundMuted, fontSize: 12, lineHeight: 18 };

  return (
    <>
      <SettingsSection title="Modules">
        <SettingsCard>
          {settings.status === "loading" ? (
            <SettingsRow label="Loading settings…" />
          ) : settings.status === "error" ? (
            <SettingsAction
              label="Settings unavailable"
              hint={settings.error}
              actionLabel="Reload"
              onPress={() => void settings.reload()}
            />
          ) : settings.status === "invalid" ? (
            <SettingsAction
              label="Stored settings are invalid"
              hint={settings.error}
              actionLabel="Reset"
              onPress={() => void settings.reset()}
            />
          ) : (
            <>
              <SettingsSwitch
                label="Math formulas"
                hint={
                  "$…$, \\(…\\), $$…$$, \\[…\\], and ```math fences render as images on this host."
                }
                value={settings.values.math}
                disabled={settings.saving}
                onValueChange={(math) => void update({ math })}
              />
              <SettingsSwitch
                label="Enhanced Mermaid viewer"
                hint="Off uses Paseo's diagram renderer, including beside formulas. On uses this plugin's image viewer and adds Mermaid-only messages to what it renders."
                value={settings.values.mermaid}
                disabled={settings.saving}
                onValueChange={(mermaid) => void update({ mermaid })}
              />
              <SettingsSwitch
                label="Enhanced code scrolling"
                hint="Off uses Paseo's syntax highlighting and copy controls. On uses plain text with horizontal dragging and text-selection controls, and adds code-only messages to what this plugin renders."
                value={settings.values.codeBlocks}
                disabled={settings.saving}
                onValueChange={(codeBlocks) => void update({ codeBlocks })}
              />
              <SettingsSwitch
                label="Tables"
                hint="Keep readable column widths and open tables in a viewer to copy Markdown or TSV. Off uses the basic table layout in messages this plugin renders. Oversized tables stay with Paseo."
                value={settings.values.tables}
                disabled={settings.saving}
                onValueChange={(tables) => void update({ tables })}
              />
              <SettingsSelect
                label="Plugin text size"
                hint="Changes plugin-rendered prose and enhanced code. Paseo-rendered code and diagrams keep Paseo's own sizing."
                value={settings.values.fontScale}
                options={FONT_SCALES.map((value) => ({ value, label: FONT_LABELS[value] }))}
                disabled={settings.saving}
                onValueChange={(fontScale) => void update({ fontScale: fontScale as FontScale })}
              />
              <SettingsSelect
                label="Formula size"
                hint="Changes math only. Clients connected to this host share this preference; each client fits formulas to its own available space."
                value={String(settings.values.mathScale)}
                options={MATH_SCALES.map((value) => ({
                  value: String(value),
                  label: `${value * 100}%${value === 1 ? " (default)" : ""}`,
                }))}
                disabled={settings.saving}
                onValueChange={(value) => void update({ mathScale: Number(value) as MathScale })}
              />
              <SettingsAction
                label="Reset formula size"
                hint="Restores 100% without changing text size or module switches. Inspector zoom is temporary and does not change this preference."
                actionLabel="Reset to 100%"
                disabled={settings.saving || settings.values.mathScale === 1}
                onPress={() => void update({ mathScale: 1 })}
              />
              {settings.saveError ? (
                <SettingsRow label="Save failed" error={settings.saveError} />
              ) : null}
            </>
          )}
        </SettingsCard>
        <Text style={muted}>
          These switches apply to this host only. New installations enable math and leave the
          optional Mermaid, code, and table enhancements off. Existing preferences are preserved.
          Reopen the conversation after changing which messages the plugin takes over. Each client
          fits content to its own available space.
        </Text>
      </SettingsSection>
      <SettingsSection title="Runtime on this host">
        <SettingsCard>
          <SettingsRow
            label="Plugin"
            hint={
              runtime.data
                ? `advanced-markdown ${runtime.data.plugin.version}`
                : runtime.isLoading
                  ? "Checking…"
                  : "Unavailable"
            }
          />
          <SettingsRow
            label="Math engine"
            hint={
              runtime.data
                ? `${runtime.data.math.engine} · ${runtime.data.math.cached} cached`
                : "—"
            }
          />
          <SettingsRow
            label="Mermaid runtime"
            hint={
              runtime.data
                ? runtime.data.mermaid.ready
                  ? `${runtime.data.mermaid.cli} · ${runtime.data.mermaid.browser ?? "browser"} · ${runtime.data.mermaid.cached} cached, ${runtime.data.mermaid.queued} queued`
                  : `Not ready: ${runtime.data.mermaid.message ?? "unknown reason"}`
                : runtime.error
                  ? `Status unavailable: ${runtime.error instanceof Error ? runtime.error.message : String(runtime.error)}`
                  : "—"
            }
            error={
              runtime.data && !runtime.data.mermaid.ready
                ? (runtime.data.mermaid.message ?? null)
                : null
            }
          />
          <SettingsRow label="Cache directory" hint={runtime.data?.mermaid.cacheRoot ?? "—"} />
          <SettingsAction
            label="Refresh status"
            actionLabel="Refresh"
            onPress={() => void runtime.refetch()}
          />
        </SettingsCard>
        <Text style={muted}>
          Formulas and enhanced Mermaid diagrams are rendered on the selected host by pinned local
          engines. Paseo renders other diagrams on the client. If the enhanced Mermaid runtime is
          not ready, run "npm run prepare-browser" in the plugin directory or reinstall the plugin
          so its preparation step runs again.
        </Text>
      </SettingsSection>
    </>
  );
}

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
import { FONT_SCALES, moduleSettings, type FontScale, type ModuleSettings } from "../shared/settings.js";
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
            <SettingsAction label="Settings unavailable" hint={settings.error} actionLabel="Reload" onPress={() => void settings.reload()} />
          ) : settings.status === "invalid" ? (
            <SettingsAction label="Stored settings are invalid" hint={settings.error} actionLabel="Reset" onPress={() => void settings.reset()} />
          ) : (
            <>
              <SettingsSwitch
                label="Math formulas"
                hint="$…$, \\(…\\), $$…$$, \\[…\\], and ```math fences render as images on this host."
                value={settings.values.math}
                disabled={settings.saving}
                onValueChange={(math) => void update({ math })}
              />
              <SettingsSwitch
                label="Mermaid diagrams"
                hint="```mermaid fences render as images through this plugin. Off leaves the fence as source in plugin items; Paseo's own Mermaid support is unaffected."
                value={settings.values.mermaid}
                disabled={settings.saving}
                onValueChange={(mermaid) => void update({ mermaid })}
              />
              <SettingsSelect
                label="Text size in plugin items"
                value={settings.values.fontScale}
                options={FONT_SCALES.map((value) => ({ value, label: FONT_LABELS[value] }))}
                disabled={settings.saving}
                onValueChange={(fontScale) => void update({ fontScale: fontScale as FontScale })}
              />
              {settings.saveError ? <SettingsRow label="Save failed" error={settings.saveError} /> : null}
            </>
          )}
        </SettingsCard>
        <Text style={muted}>
          These switches apply to this host only. Messages that contain enabled content are shown by this plugin; a message
          with every module off is left to Paseo's own renderer the next time it is displayed. Existing rows update after a
          plugin reload or when the conversation is reopened.
        </Text>
      </SettingsSection>
      <SettingsSection title="Runtime on this host">
        <SettingsCard>
          <SettingsRow label="Plugin" hint={runtime.data ? `advanced-markdown ${runtime.data.plugin.version}` : runtime.isLoading ? "Checking…" : "Unavailable"} />
          <SettingsRow label="Math engine" hint={runtime.data ? `${runtime.data.math.engine} · ${runtime.data.math.cached} cached` : "—"} />
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
            error={runtime.data && !runtime.data.mermaid.ready ? runtime.data.mermaid.message ?? null : null}
          />
          <SettingsRow label="Cache directory" hint={runtime.data?.mermaid.cacheRoot ?? "—"} />
          <SettingsAction label="Refresh status" actionLabel="Refresh" onPress={() => void runtime.refetch()} />
        </SettingsCard>
        <Text style={muted}>
          Formulas and diagrams are rendered on the selected host by pinned local engines. Message content never leaves the
          host. If the Mermaid runtime is not ready, run "npm run prepare-browser" in the plugin directory or reinstall the
          plugin so its preparation step runs again.
        </Text>
      </SettingsSection>
    </>
  );
}

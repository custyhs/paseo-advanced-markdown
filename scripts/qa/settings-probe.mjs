import { randomUUID } from "node:crypto";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
const [mode] = process.argv.slice(2);
const client = new DaemonClient({
  url: "ws://127.0.0.1:6790/ws",
  clientId: `qa-settings-${randomUUID()}`,
  clientType: "cli",
  appVersion: "0.8.0",
  reconnect: { enabled: false },
});
await client.connect();
try {
  const read = await client.invokePluginRpc("advanced-markdown", "settings.modules.read", {});
  console.log("read:", JSON.stringify(read));
  const values = {
    math: true,
    fontScale: "default",
    ...(read.status === "ready" ? read.values : {}),
  };
  if (mode === "math-off") Object.assign(values, { math: false });
  if (mode === "restore") Object.assign(values, { math: true, fontScale: "default" });
  if (mode === "large") Object.assign(values, { fontScale: "large" });
  if (mode) {
    const write = await client.invokePluginRpc("advanced-markdown", "settings.modules.write", {
      revision: read.revision,
      values,
    });
    console.log("write:", JSON.stringify(write));
  }
} finally {
  await client.close();
}

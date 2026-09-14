// QA helper: call the plugin's RPCs through a real daemon connection (the same
// plugin.rpc.invoke path the app uses) and record latency and payload sizes.
// node scripts/qa/rpc-probe.mjs --host 127.0.0.1:6790 [--plugin advanced-markdown] [--out .smoke/rpc-probe.json]
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}
const host = option("host", "127.0.0.1:6790");
const pluginId = option("plugin", "advanced-markdown");
const out = path.resolve(option("out", ".smoke/rpc-probe.json"));

const client = new DaemonClient({
  url: `ws://${host}/ws`,
  clientId: `qa-rpc-probe-${randomUUID()}`,
  clientType: "cli",
  appVersion: "0.8.0",
  reconnect: { enabled: false },
});
await client.connect();
const call = (method, input) => client.invokePluginRpc(pluginId, method, input);
const timed = async (label, method, input) => {
  const started = performance.now();
  const output = await call(method, input);
  const ms = Math.round(performance.now() - started);
  const png = output && output.ok ? output.png : null;
  return {
    label,
    ms,
    ok: output?.ok ?? null,
    reason: output?.reason,
    message: output?.message,
    base64Chars: png ? png.length : null,
    pngKiB: png ? Math.round((png.length * 3) / 4 / 1024) : null,
    width: output?.width,
    height: output?.height,
  };
};
function bigFlowchart(nodes) {
  const lines = ["flowchart TD"];
  for (let index = 0; index < nodes; index++) {
    lines.push(`  N${index}[节点 ${index} label ${index}] --> N${(index + 1) % nodes}`);
    if (index % 7 === 0) lines.push(`  N${index} --> N${(index * 3) % nodes}`);
  }
  return lines.join("\n");
}
const results = {};
try {
  results.status = await call(`${pluginId}.status`, {});
  results.math = [
    await timed("math cold", `${pluginId}.math.render`, { expression: "\\frac{a}{b} + \\sqrt{x}", display: true, color: "#e0e0e0" }),
    await timed("math warm", `${pluginId}.math.render`, { expression: "\\frac{a}{b} + \\sqrt{x}", display: true, color: "#e0e0e0" }),
    await timed("math new", `${pluginId}.math.render`, { expression: "\\sum_{i=1}^{n} i^2", display: false, color: "#e0e0e0" }),
    await timed("math invalid", `${pluginId}.math.render`, { expression: "\\unknownCmd{x}", display: false, color: "#e0e0e0" }),
  ];
  const small = "flowchart LR\n  A[开始] --> B{判断}\n  B -->|是| C[发布]";
  results.mermaid = [
    await timed("mermaid cold", `${pluginId}.mermaid.render`, { source: small, theme: "dark" }),
    await timed("mermaid warm", `${pluginId}.mermaid.render`, { source: small, theme: "dark" }),
    await timed("mermaid 60 nodes", `${pluginId}.mermaid.render`, { source: bigFlowchart(60), theme: "dark" }),
    await timed("mermaid 150 nodes", `${pluginId}.mermaid.render`, { source: bigFlowchart(150), theme: "dark" }),
    await timed("mermaid 400 nodes", `${pluginId}.mermaid.render`, { source: bigFlowchart(400), theme: "dark" }),
    await timed("mermaid invalid", `${pluginId}.mermaid.render`, { source: "notadiagram\n  A --> B", theme: "dark" }),
  ];
  // Concurrency: ten different diagrams at once exercise the queue (limit 8 waiting + 1 active).
  const burst = Array.from({ length: 10 }, (_, index) =>
    timed(`burst ${index}`, `${pluginId}.mermaid.render`, { source: `flowchart LR\n  A${index} --> B${index}[burst ${index}]`, theme: "default" }),
  );
  results.burst = await Promise.all(burst);
  results.burstSummary = {
    ok: results.burst.filter((entry) => entry.ok).length,
    busy: results.burst.filter((entry) => entry.reason === "busy").length,
    maxMs: Math.max(...results.burst.map((entry) => entry.ms)),
  };
  results.statusAfter = await call(`${pluginId}.status`, {});
  results.schemaRejection = await call(`${pluginId}.mermaid.render`, { source: "flowchart LR\n A-->B", theme: "neon" }).then(
    (value) => ({ accepted: true, value }),
    (error) => ({ accepted: false, error: String(error?.message ?? error).slice(0, 200) }),
  );
  results.unknownMethod = await call(`${pluginId}.nope`, {}).then(
    (value) => ({ accepted: true, value }),
    (error) => ({ accepted: false, error: String(error?.message ?? error).slice(0, 200) }),
  );
} finally {
  await client.close().catch(() => undefined);
}
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));

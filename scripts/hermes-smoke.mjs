// Evaluates the compiled client bundle in a real Hermes runtime (the React
// Native 0.81 revision), with and without the runtime class transform, and
// exercises registration, transformer projection, fallbacks, and cleanup.
// Adapted from paseo-math (Apache-2.0) scripts/hermes-smoke.mjs. React Native,
// React, and schema APIs are registration stubs: this does not verify native
// UI, clipboard, or image layout. Those need a device.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadCompiledPlugin } from "./smoke.mjs";

const hermes = process.env.HERMES_BIN;
if (!hermes) throw new Error("Set HERMES_BIN to the RN 0.81 Hermes executable");
const plugin = await loadCompiledPlugin();
const directory = await mkdtemp(path.join(os.tmpdir(), "paseo-advanced-markdown-hermes-"));
try {
  const source = `
function check(value, message) { if (!value) throw new Error(message); }
function stub() { return proxy; }
var proxy = new Proxy(stub, {get: function(target, key) {
  if (key === 'memo' || key === 'create' || key === 'forwardRef') return function(x) { return x; };
  if (key === 'OS') return 'android';
  if (key === 'select') return function(x) { return x.android || x.default; };
  if (key === 'processColor') return function() { return 0xff112233; };
  return proxy;
}});
var atob = function(input) {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var bits = 0, value = 0, output = '';
  for (var i = 0; i < input.length; i++) {
    var c = alphabet.indexOf(input[i]);
    if (c < 0) continue;
    value = (value << 6) | c; bits += 6;
    if (bits >= 8) { bits -= 8; output += String.fromCharCode((value >> bits) & 255); }
  }
  return output;
};
var allowed = ['react', 'react/jsx-runtime', 'react-native', 'zod', '@tanstack/react-query',
  '@getpaseo/plugin/client', '@getpaseo/plugin/client/react-native', '@getpaseo/plugin/client/ui', '@getpaseo/plugin'];
var zodStub = { z: proxy };
var sdkStub = {
  defineRpc: function(x) { return x; },
  defineSettings: function(x) { return x; },
  settingsRpc: function(id) { return { read: { name: 'settings.' + id + '.read' } }; },
};
var entry = (0, eval)(${JSON.stringify(plugin.bundles.clientBundle)})(function(name) {
  check(allowed.indexOf(name) !== -1, 'Unexpected module: ' + name);
  if (name === '@getpaseo/plugin') return sdkStub;
  if (name === 'zod') return zodStub;
  return proxy;
});
var transformers = [], renderers = [], screens = [], rpcs = [];
var cleanup = entry.default({
  addTimelineRenderer: function(x) { renderers.push(x); },
  addTimelineTransformer: function(x) { transformers.push(x); },
  addSettingsScreen: function(x) { screens.push(x); },
  rpc: function(contract) { rpcs.push(contract.name); return { then: function(f) { return { catch: function() {} }; } }; },
});
check(typeof cleanup === 'function', 'Missing cleanup');
check(renderers.length === 1 && transformers.length === 1 && screens.length === 1, 'Missing registrations');
check(rpcs.length === 1 && rpcs[0] === 'settings.modules.read', 'Settings read not requested');
var text = '&amp; **bold** $x^2$ and\\n\\n\`\`\`mermaid\\nflowchart LR\\n  A --> B\\n\`\`\`';
for (var n = 1; n <= text.length; n++) {
  transformers[0].transform({item: {type: 'assistant_message', text: text.slice(0, n)}, phase: 'complete'});
}
var result = transformers[0].transform({item: {type: 'assistant_message', text: text}, phase: 'complete'});
check(result && result.items[0].data.text === text, 'Projection failed');
check(!transformers[0].transform({item: {type: 'assistant_message', text: 'plain &amp; text'}, phase: 'complete'}), 'Plain text transformed');
check(!transformers[0].transform({item: {type: 'assistant_message', text: '\\x60$x$\\x60'}, phase: 'complete'}), 'Code transformed');
check(!transformers[0].transform({item: {type: 'assistant_message', text: '$x$ ![i](https://e/x.png)'}, phase: 'complete'}), 'Image item transformed');
cleanup();
print('Hermes evaluated client: setup, incremental math+mermaid projection, fallbacks, cleanup passed');
`;
  const filename = path.join(directory, "client.js");
  await writeFile(filename, source);
  // Run both with the Android runtime class transform enabled and disabled.
  for (const flags of [["-Xes6-class"], []]) {
    const result = spawnSync(hermes, [...flags, filename], { encoding: "utf8", timeout: 60_000 });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /cleanup passed/);
    console.log(`${flags.join(" ") || "(default flags)"}: ${result.stdout.trim()}`);
  }
} finally {
  await plugin.cleanup();
  await rm(directory, { recursive: true, force: true });
}

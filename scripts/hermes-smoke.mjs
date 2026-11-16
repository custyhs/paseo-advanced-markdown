// Evaluates the compiled client bundle in a real Hermes runtime (the React
// Native 0.81 revision), with and without the runtime class transform, and
// exercises registration, transformer projection, fallbacks, and cleanup.
// Adapted from paseo-math (Apache-2.0) scripts/hermes-smoke.mjs. React Native,
// React, and schema APIs are registration stubs: this does not verify native
// UI, clipboard, or image layout. Those need a device.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCompiledPlugin } from "./smoke.mjs";

// The env override wins; otherwise use the repo's own React Native Hermes.
// react-native ships the executing `hermes` VM for macOS only (linux64-bin
// holds just the `hermesc` compiler), so CI does not run this smoke.
const defaultHermes = fileURLToPath(
  new URL("../node_modules/react-native/sdks/hermesc/osx-bin/hermes", import.meta.url),
);
const hermes = process.env.HERMES_BIN ?? (existsSync(defaultHermes) ? defaultHermes : undefined);
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
  '@getpaseo/plugin/client', '@getpaseo/plugin/client/ui', '@getpaseo/plugin'];
// A faithful slice of zod: .default() values survive into parse, so
// DEFAULT_MODULE_SETTINGS is a real object with own keys, the way the SDK's
// host delivers it, instead of a Proxy the snapshot spread flattens away.
// Unknown chain calls (.min, .regex, .finite, ...) keep the field.
function zodField(defaultValue, hasDefault) {
  var field = {
    hasDefault: hasDefault,
    defaultValue: defaultValue,
    default: function(value) { return zodField(value, true); },
    parse: function(input) { return input === undefined ? defaultValue : input; },
  };
  field.safeParse = function(input) { return { success: true, data: field.parse(input) }; };
  var chained = new Proxy(field, { get: function(target, key) {
    if (key in target) return target[key];
    return function() { return chained; };
  }});
  return chained;
}
function zodObject(shape) {
  var schema = zodField(undefined, false);
  schema.parse = function(input) {
    var out = {};
    for (var key in shape) {
      var value = input === undefined || input === null ? undefined : input[key];
      if (value === undefined && shape[key].hasDefault) value = shape[key].defaultValue;
      if (value !== undefined) out[key] = value;
    }
    return out;
  };
  schema.safeParse = function(input) { return { success: true, data: schema.parse(input) }; };
  return schema;
}
var zodStub = { z: new Proxy({ object: zodObject }, { get: function(target, key) {
  if (key in target) return target[key];
  return function() { return zodField(undefined, false); };
}}) };
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
  addTimelineTransformer: function(x) {
    transformers.push(x);
    // The SDK returns a PluginCleanup that unregisters the contribution.
    return function() {
      var index = transformers.indexOf(x);
      if (index !== -1) transformers.splice(index, 1);
    };
  },
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
check(!transformers[0].transform({item: {type: 'assistant_message', text: '\\x60\\x60\\x60mermaid\\nflowchart LR\\n  A --> B\\n\\x60\\x60\\x60'}, phase: 'complete'}), 'Native Mermaid item transformed');
cleanup();
check(transformers.length === 0, 'Transformer not removed on cleanup');
print('Hermes evaluated client: setup, incremental math projection, native Mermaid passthrough, fallbacks, cleanup passed');
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

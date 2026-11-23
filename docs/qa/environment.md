# Verification environment

This plugin is verified against official Paseo releases only. Nothing here uses a
Paseo fork build as compatibility evidence.

## Isolated official daemon and web UI

Real-client checks run on an official `@getpaseo/cli` from npm with its own home and
port, so the production daemon on `127.0.0.1:6767` is never targeted or restarted.
The [fork-safe replies QA](fork-safe-replies.md) ran this way on 0.16.0 and 0.16.1.
The environment is disposable: build it for a QA pass and delete it afterward.

```bash
H=~/projects/paseo-harness-<version>
npm install --prefix "$H/npm" @getpaseo/cli@<version>
mkdir -p "$H/home"   # then write "$H/home/config.json", below
env -u PASEO_AGENT_ID -u PASEO_HOME "$H/npm/node_modules/.bin/paseo" daemon start --home "$H/home"
env -u PASEO_AGENT_ID -u PASEO_HOME "$H/npm/node_modules/.bin/paseo" --host 127.0.0.1:6792 plugin ls
env -u PASEO_AGENT_ID -u PASEO_HOME "$H/npm/node_modules/.bin/paseo" daemon stop --home "$H/home"
```

```json
{
  "version": 1,
  "daemon": { "listen": "127.0.0.1:6792", "relay": { "enabled": false } },
  "features": { "webUi": { "enabled": true } },
  "pluginsEnabled": true
}
```

- Unset `PASEO_AGENT_ID` and `PASEO_HOME` on every command. A Paseo-launched shell
  otherwise redirects them to the production daemon.
- From 0.16.0, `daemon start` takes no `--port`, `--web-ui` or `--no-relay` flags. It
  reads `config.json`, where `features.webUi` sits at the top level, not under `daemon`.
- Install the plugin with `paseo plugin install <checkout>`. A directory install runs in
  place and skips the manifest's build commands, so run `npm run build` first, and again
  after a version bump.
- Register a scratch git repository with `paseo workspace create` and use the `claude`
  and `codex` binaries the production daemon uses.
- The bundled web UI connects to the local daemon without pairing. It follows
  `navigator.language`; captures pin English by writing
  `localStorage["@paseo:app-settings"] = {"language":"en"}` and reloading. That also
  resets the default chat display (Collapse turns) to Full, so set `chatDisplay`
  explicitly when a capture needs the collapsed view.

The recorded runs used macOS arm64, Node v24.15.0 and headless Google Chrome 157.

## Not available on the maintainer's host

No Android SDK or emulator and no Xcode. Official iOS and Android clients are not
exercised; each QA record says what native evidence exists and what is still open.

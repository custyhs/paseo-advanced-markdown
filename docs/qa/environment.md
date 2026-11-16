# Verification environment

This plugin is verified against official Paseo releases only. Nothing here uses a
Paseo fork build as compatibility evidence.

## Official 0.8.0 daemon and web UI (isolated)

| Item | Value |
| --- | --- |
| Daemon | `@getpaseo/cli@0.8.0` from npm (`@getpaseo/server@0.8.0`), installed in `~/projects/paseo-harness-0.8.0/npm` |
| Version reported | `paseo --version` = 0.8.0; `daemon status` = 0.8.0 |
| Home | `~/projects/paseo-harness-0.8.0/home` (`--home`), `pluginsEnabled: true`, relay off |
| Listen | `127.0.0.1:6790` with `--web-ui` (bundled official browser web app served from the same origin) |
| Server id | `srv_cS2FIpy5eZub` (from `home/server-id`) |
| CLI targeting | every command uses `--host 127.0.0.1:6790`; `plugin ls` shows only this plugin |
| Production daemon | `127.0.0.1:6767` (desktop app, 0.8.0-beta.1) untouched; never restarted or targeted |
| Host machine | macOS arm64 (Darwin 25.6), Node v24.15.0, npm 11.12.1, Google Chrome 152 for captures |

Start and stop:

```bash
H=~/projects/paseo-harness-0.8.0
env -u PASEO_AGENT_ID -u PASEO_HOME "$H/npm/node_modules/.bin/paseo" daemon start --home "$H/home" --port 6790 --web-ui --no-relay
env -u PASEO_AGENT_ID -u PASEO_HOME "$H/npm/node_modules/.bin/paseo" --host 127.0.0.1:6790 plugin ls
env -u PASEO_AGENT_ID -u PASEO_HOME "$H/npm/node_modules/.bin/paseo" daemon stop --home "$H/home"
```

`PASEO_AGENT_ID` and `PASEO_HOME` are unset so a Paseo-launched shell cannot
redirect the commands to the production daemon.

## Official 0.16.0 daemon and web UI (isolated)

Built for the fork-safe replies QA ([fork-safe-replies.md](fork-safe-replies.md)).
Same rules as the 0.8.0 harness: isolated home, every command carries the
`env -u PASEO_AGENT_ID -u PASEO_HOME` prefix and targets this host only.

| Item | Value |
| --- | --- |
| Daemon | `@getpaseo/cli@0.16.0` from npm, installed in `~/projects/paseo-harness-0.16.0/npm` |
| Version reported | `paseo --version` = 0.16.0; `daemon status` = 0.16.0 |
| Home | `~/projects/paseo-harness-0.16.0/home` (`--home`), relay off |
| Listen | `127.0.0.1:6792`, bundled web UI on the same origin |
| Server id | `srv_E8ndEay2l_ZY` (from `home/server-id`) |
| Plugins | this repo's worktree and a copy of Better Paseo 1.6.0 at `~/projects/paseo-harness-0.16.0/better-paseo-src`, both installed with `paseo plugin install <directory>` |
| Workspace | scratch git repo `~/projects/paseo-harness-0.16.0/workspace`, registered with `paseo workspace create` |
| Providers | `claude` (`~/.local/bin/claude`) and `codex` (`/opt/homebrew/bin/codex`), the binaries the production daemon uses |
| Host machine | macOS arm64 (Darwin 25.6), Node v24.15.0, npm 11.12.1, Google Chrome 157 for captures |

Unlike 0.8.0, `daemon start` on 0.16.0 takes no `--port`, `--web-ui` or `--no-relay`
flags — it reads persistent configuration. Write `home/config.json` before the first
start (`features.webUi` sits at the top level, not under `daemon`):

```json
{
  "version": 1,
  "daemon": { "listen": "127.0.0.1:6792", "relay": { "enabled": false } },
  "features": { "webUi": { "enabled": true } },
  "pluginsEnabled": true
}
```

```bash
H=~/projects/paseo-harness-0.16.0
env -u PASEO_AGENT_ID -u PASEO_HOME "$H/npm/node_modules/.bin/paseo" daemon start --home "$H/home"
env -u PASEO_AGENT_ID -u PASEO_HOME "$H/npm/node_modules/.bin/paseo" --host 127.0.0.1:6792 plugin ls
env -u PASEO_AGENT_ID -u PASEO_HOME "$H/npm/node_modules/.bin/paseo" daemon stop --home "$H/home"
```

Directory plugin installs on 0.16.0 run the plugin in place and skip the manifest's
build commands, so build the worktree (`npm run build`) before installing it. The
bundled web UI connects to the local daemon without pairing. The app follows
`navigator.language`; captures pin English by writing
`localStorage["@paseo:app-settings"] = {"language":"en"}`, which also resets the
0.16.0 default chat display (Collapse turns) back to Full — set `chatDisplay`
explicitly when a capture needs the collapsed view.

## Official sources used by the smoke

| Item | Value |
| --- | --- |
| Compiler and manifest reader | shipped files inside `@getpaseo/server@0.8.0` (`dist/server/server/plugins/`) |
| App projection code | `getpaseo/paseo` commit `b8e24677e12b226c7c38c1c3a40649daa9f1152f` (tag `v0.8.0`), sparse checkout by `scripts/paseo-source.mjs` |
| Reference plugin | `q5m-ai/paseo-math` commit `3644aa73d40f2e4e51f7a4ef48b22b668db017d8` (Apache-2.0; see NOTICE) |
| Hermes runtime | `hermes` from `react-native@0.81.5/sdks/hermesc/osx-bin` (revision `e0fc67142ec0763c6b6153ca2bf96df815539782`) |

## Not available on this host

- No Android SDK or emulator and no Xcode (Command Line Tools only). Official
  iOS and Android clients are therefore not exercised here; see the QA log for
  what native evidence exists and what is still open.

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

# Changelog

## 0.2.0 (2026-11-02)

First public release.

- `trustedHosts` now defaults to the authorities DSH itself trusts (every `--trusted-host` value of `dsh web`, plus `DSH_WORKSPACE_RAIL_TRUSTED_HOSTS`) instead of a fixed host name. Loopback is always accepted.
- Browser tab: live title (unread count, working animation, last message) and a neutral pixel rail icon inlined into the bundle; Live or Off in rail Settings.
- Unread markers on chat, project and folder rows and on the collapsed rail icon.
- Recents ordered by the last completed turn, updated live.
- Projects are folders with their own `AGENTS.md` (instructions, project memory, answer from project files only), files linked by path or URL, a default model, archive and delete.
- `project_search` agent tool: BM25 over the project folder and linked files, with `file:line` hits.
- The pinned-sessions footer button of dsh-session-pin is hidden; the rail's Pinned section lists the same pins.

## 0.1.1

- One build runs on DSH 0.1.5 and DSH 0.2.x; the host picks its settings path by capability.
- Lossless JSON results for `project_search` on DSH 0.2.1.

## 0.1.0

- Rail panel: Pinned (with folders), Projects, virtualized Recents, graded search scoring.

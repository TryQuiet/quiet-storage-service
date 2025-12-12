# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## 1.0.0-alpha.41 (2025-12-12)

- Update handling of changelogs and publishing/deploys ([cc2ea16](https://github.com/TryQuiet/quiet-storage-service/commit/cc2ea16))

# quiet-storage-service

## unreleased

### Features

- Initial QSS setup ([#2757](https://github.com/TryQuiet/quiet/issues/2757))
- Setup sigchain/community storage ([#2758](https://github.com/TryQuiet/quiet/issues/2758))
- Add sigchain syncing via websocket ([#2759](https://github.com/TryQuiet/quiet/issues/2759))
- Setup OrbitDB log entry storage (e.g. messages) ([#2800](https://github.com/TryQuiet/quiet/issues/2800))
- Add OrbitDB log entry syncing from client to QSS ([#2804](https://github.com/TryQuiet/quiet/issues/2804))
- Reject adding a community with more than one user ("non-fresh" sigchains) ([#2906](https://github.com/TryQuiet/quiet/issues/2906))
- Add hcaptcha handler and require captcha verification for community creation on QSS ([#2908](https://github.com/TryQuiet/quiet/issues/2908))
- Limit usage of hcaptcha verification token to one community creation event ([#2908](https://github.com/TryQuiet/quiet/issues/2908))
- Fanout orbitdb log entries to connected clients on a given community ([#2805](https://github.com/TryQuiet/quiet/issues/2805))
- Restart service on deploy

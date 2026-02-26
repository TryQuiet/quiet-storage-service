# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## 1.0.0 (2026-02-26)

- Feat/2806 log sync catchup (#19) ([0d6dd9d](https://github.com/TryQuiet/quiet-storage-service/commit/0d6dd9d)), closes [#19](https://github.com/TryQuiet/quiet-storage-service/issues/19)
- Push notifications via Firebase API (#21) ([f37766c](https://github.com/TryQuiet/quiet-storage-service/commit/f37766c)), closes [#21](https://github.com/TryQuiet/quiet-storage-service/issues/21)
- Update app package CHANGELOG.md ([6bd683d](https://github.com/TryQuiet/quiet-storage-service/commit/6bd683d))
- feat(3058): Update auth module to use lockbox/self-assign changes (#22) ([2aaf17e](https://github.com/TryQuiet/quiet-storage-service/commit/2aaf17e)), closes [#22](https://github.com/TryQuiet/quiet-storage-service/issues/22)

## 1.0.0-alpha.42 (2025-12-22)

- chore(deploys): Improve deploy/versioning automation (#18) ([166998c](https://github.com/TryQuiet/quiet-storage-service/commit/166998c)), closes [#18](https://github.com/TryQuiet/quiet-storage-service/issues/18)

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

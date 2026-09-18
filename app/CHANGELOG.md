# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## 4.0.0 (2026-09-18)

- docs(changelog): drop mislinked issue refs from the device-linking entry
  ([97a4b46](https://github.com/TryQuiet/quiet-storage-service/commit/97a4b46)),
  closes [#51](https://github.com/TryQuiet/quiet-storage-service/issues/51)
  [#51](https://github.com/TryQuiet/quiet-storage-service/issues/51)
  [#20](https://github.com/TryQuiet/quiet-storage-service/issues/20)
  [#81](https://github.com/TryQuiet/quiet-storage-service/issues/81)
  [#115](https://github.com/TryQuiet/quiet-storage-service/issues/115)
  [#192](https://github.com/TryQuiet/quiet-storage-service/issues/192)
  [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
  [#51](https://github.com/TryQuiet/quiet-storage-service/issues/51)
  [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- Update app package CHANGELOG.md
  ([90ad0b1](https://github.com/TryQuiet/quiet-storage-service/commit/90ad0b1))

## 4.0.0-alpha.0 (2026-09-17)

- fix(bootstrap): keep the auth revision check quiet in deployed environments
  ([a6ec79c](https://github.com/TryQuiet/quiet-storage-service/commit/a6ec79c))
- fix(bootstrap): re-copy LFA packages when the auth pin changes
  ([5e80ba0](https://github.com/TryQuiet/quiet-storage-service/commit/5e80ba0))
- docs: document QSS alpha and production publishing (#59)
  ([b3dd8c1](https://github.com/TryQuiet/quiet-storage-service/commit/b3dd8c1)),
  closes [#59](https://github.com/TryQuiet/quiet-storage-service/issues/59)
  [#51](https://github.com/TryQuiet/quiet-storage-service/issues/51)
- Device Linking Compatability (#51)
  ([2e94ece](https://github.com/TryQuiet/quiet-storage-service/commit/2e94ece)),
  closes [#51](https://github.com/TryQuiet/quiet-storage-service/issues/51)
- Merge QSS 2.0.2 release metadata back into main (#60)
  ([eb7552d](https://github.com/TryQuiet/quiet-storage-service/commit/eb7552d)),
  closes [#60](https://github.com/TryQuiet/quiet-storage-service/issues/60)
- Update app package CHANGELOG.md
  ([716d2b1](https://github.com/TryQuiet/quiet-storage-service/commit/716d2b1))

## 3.0.0-alpha.0 (2026-09-15)

- Exercise QSS persistence with supported member admissions
  ([733d19f](https://github.com/TryQuiet/quiet-storage-service/commit/733d19f))
- Keep the reviewed auth pin during QSS bootstrap
  ([d615a78](https://github.com/TryQuiet/quiet-storage-service/commit/d615a78))
- Update app package CHANGELOG.md
  ([061b931](https://github.com/TryQuiet/quiet-storage-service/commit/061b931))
- Use protocol 4 removal policy for QSS sigchains
  ([48ceae9](https://github.com/TryQuiet/quiet-storage-service/commit/48ceae9))
- test: align admission regressions with durable proofs and invitation grants
  ([2dcee0f](https://github.com/TryQuiet/quiet-storage-service/commit/2dcee0f))
- test: include member role grant in QSS invitation fixture
  ([a4738ec](https://github.com/TryQuiet/quiet-storage-service/commit/a4738ec))
- test: wait for both clients to join the team room
  ([4227d34](https://github.com/TryQuiet/quiet-storage-service/commit/4227d34))
- fix: make captcha grants safe for retries and concurrent requests
  ([0584f38](https://github.com/TryQuiet/quiet-storage-service/commit/0584f38))

## <small>2.0.2 (2026-09-14)</small>

**Note:** Version bump only for package quiet-storage-service

## <small>2.0.1 (2026-09-14)</small>

- chore(release): publish v2.0.0
  ([067010c](https://github.com/TryQuiet/quiet-storage-service/commit/067010c))

**Note:** Version bump only for package quiet-storage-service

## 2.0.0 (2026-09-14)

- chore: align QSS with final Auth baseline
  ([1eabed0](https://github.com/TryQuiet/quiet-storage-service/commit/1eabed0))
- chore: compose QSS with Auth review head
  ([428048c](https://github.com/TryQuiet/quiet-storage-service/commit/428048c))
- chore: pin merged Auth audit baseline
  ([6cb5bcc](https://github.com/TryQuiet/quiet-storage-service/commit/6cb5bcc))
- chore: point auth submodule at the public repo URL
  ([78cfa2c](https://github.com/TryQuiet/quiet-storage-service/commit/78cfa2c))
- chore: Update deploy scripts to support Amazon Linux instances and the new
  prod environment (#43)
  ([a3495e5](https://github.com/TryQuiet/quiet-storage-service/commit/a3495e5)),
  closes [#43](https://github.com/TryQuiet/quiet-storage-service/issues/43)
- chore: update QSS to revised Auth review head
  ([ce8fcca](https://github.com/TryQuiet/quiet-storage-service/commit/ce8fcca))
- chore(3344): Update auth to enforce admin-only private channels (#47)
  ([2f6a212](https://github.com/TryQuiet/quiet-storage-service/commit/2f6a212)),
  closes [#47](https://github.com/TryQuiet/quiet-storage-service/issues/47)
- chore(ci): add organization secret migration workflow (#52)
  ([7794918](https://github.com/TryQuiet/quiet-storage-service/commit/7794918)),
  closes [#52](https://github.com/TryQuiet/quiet-storage-service/issues/52)
- chore(ci): remove organization secret migration workflow (#54)
  ([48ee149](https://github.com/TryQuiet/quiet-storage-service/commit/48ee149)),
  closes [#54](https://github.com/TryQuiet/quiet-storage-service/issues/54)
- chore(ci): use scoped QSS AWS secrets (#1)
  ([39905e9](https://github.com/TryQuiet/quiet-storage-service/commit/39905e9)),
  closes [#1](https://github.com/TryQuiet/quiet-storage-service/issues/1)
  [TryQuiet/quiet-storage-service#53](https://github.com/TryQuiet/quiet-storage-service/issues/53)
- chore(ci): use scoped QSS AWS secrets (#53)
  ([1ede4df](https://github.com/TryQuiet/quiet-storage-service/commit/1ede4df)),
  closes [#53](https://github.com/TryQuiet/quiet-storage-service/issues/53)
- chore(qss): re-pin auth to the audited durable-admission tip (#203)
  ([80f1538](https://github.com/TryQuiet/quiet-storage-service/commit/80f1538)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- chore(qss): re-pin auth to the reworded rejection contract (#203)
  ([ddceaa7](https://github.com/TryQuiet/quiet-storage-service/commit/ddceaa7)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- chore(qss): re-pin auth to the strict-rule-6 tip (#203)
  ([fb425b4](https://github.com/TryQuiet/quiet-storage-service/commit/fb425b4)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- test: exercise production websocket registrations
  ([884b938](https://github.com/TryQuiet/quiet-storage-service/commit/884b938))
- test(e2e): mint invited/invalid users with derived-userId order + fix
  GEN_PUB_KEYS assertion
  ([0c936e9](https://github.com/TryQuiet/quiet-storage-service/commit/0c936e9))
- test(qss): assert the recorded keyring digest against the row (#203)
  ([2ad6349](https://github.com/TryQuiet/quiet-storage-service/commit/2ad6349)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- test(security): close NSE auth acceptance gaps #115
  ([06b5d6c](https://github.com/TryQuiet/quiet-storage-service/commit/06b5d6c)),
  closes [#115](https://github.com/TryQuiet/quiet-storage-service/issues/115)
- test(security): cover NSE limiter windows #115
  ([1735c99](https://github.com/TryQuiet/quiet-storage-service/commit/1735c99)),
  closes [#115](https://github.com/TryQuiet/quiet-storage-service/issues/115)
- fix: Allow more fuzziness in team link timestamp validations and use updated
  logging (#27)
  ([2e41cc4](https://github.com/TryQuiet/quiet-storage-service/commit/2e41cc4)),
  closes [#27](https://github.com/TryQuiet/quiet-storage-service/issues/27)
- fix: bind auth sync to owning socket (#40)
  ([4ffc16b](https://github.com/TryQuiet/quiet-storage-service/commit/4ffc16b)),
  closes [#40](https://github.com/TryQuiet/quiet-storage-service/issues/40)
- fix: Ensure sigchain updates are propagated to postgres (#50)
  ([3a193cc](https://github.com/TryQuiet/quiet-storage-service/commit/3a193cc)),
  closes [#50](https://github.com/TryQuiet/quiet-storage-service/issues/50)
- fix: Handle auth errors on QSS (#25)
  ([b10f52a](https://github.com/TryQuiet/quiet-storage-service/commit/b10f52a)),
  closes [#25](https://github.com/TryQuiet/quiet-storage-service/issues/25)
- fix: harden websocket acknowledgement boundaries
  ([b054d19](https://github.com/TryQuiet/quiet-storage-service/commit/b054d19))
- fix: make QPS relay capability fail closed
  ([0a9dd45](https://github.com/TryQuiet/quiet-storage-service/commit/0a9dd45))
- fix(qss): add a durable per-team persistence path for sigchain state (#203)
  ([6563782](https://github.com/TryQuiet/quiet-storage-service/commit/6563782)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
  [#192](https://github.com/TryQuiet/quiet-storage-service/issues/192)
- fix(qss): bind the admission gate to the sigchain that admitted (#203)
  ([c991a30](https://github.com/TryQuiet/quiet-storage-service/commit/c991a30)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- fix(qss): bound the persistence work one invitation can cause (#203)
  ([cb66b8f](https://github.com/TryQuiet/quiet-storage-service/commit/cb66b8f)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- fix(qss): commit the graph and keyring of one instant (#203)
  ([656becc](https://github.com/TryQuiet/quiet-storage-service/commit/656becc)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- fix(qss): persist admission before releasing acceptance (#203)
  ([a18a66b](https://github.com/TryQuiet/quiet-storage-service/commit/a18a66b)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- fix(qss): roll back to durable state when an admission cannot be persisted
  (#203)
  ([1848da0](https://github.com/TryQuiet/quiet-storage-service/commit/1848da0)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- fix(security): bind QPS payloads to UCANs
  ([9dcb870](https://github.com/TryQuiet/quiet-storage-service/commit/9dcb870))
- fix(security): domain-separate NSE device proofs #115
  ([0a8568f](https://github.com/TryQuiet/quiet-storage-service/commit/0a8568f)),
  closes [#115](https://github.com/TryQuiet/quiet-storage-service/issues/115)
- fix(security): enforce canonical QPS requests
  ([d2b6d04](https://github.com/TryQuiet/quiet-storage-service/commit/d2b6d04))
- fix(security): harden NSE proof redemption limits #115
  ([abd3b9c](https://github.com/TryQuiet/quiet-storage-service/commit/abd3b9c)),
  closes [#115](https://github.com/TryQuiet/quiet-storage-service/issues/115)
- fix(security): isolate push provider credentials
  ([a2c0c27](https://github.com/TryQuiet/quiet-storage-service/commit/a2c0c27))
- fix(security): parse trusted proxy hops exactly #115
  ([14a40a0](https://github.com/TryQuiet/quiet-storage-service/commit/14a40a0)),
  closes [#115](https://github.com/TryQuiet/quiet-storage-service/issues/115)
- fix(security): remove unsupported proxy trust setting #115
  ([8c268f5](https://github.com/TryQuiet/quiet-storage-service/commit/8c268f5)),
  closes [#115](https://github.com/TryQuiet/quiet-storage-service/issues/115)
- fix(security): upgrade MikroORM past prototype pollution
  ([2cd3006](https://github.com/TryQuiet/quiet-storage-service/commit/2cd3006))
- docs(qss): name the joiner as the adversary of the durable-admission gate
  (#203)
  ([a69aeaf](https://github.com/TryQuiet/quiet-storage-service/commit/a69aeaf)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- docs(qss): state the invariant behind the durable-admission gate (#203)
  ([d2a5864](https://github.com/TryQuiet/quiet-storage-service/commit/d2a5864)),
  closes [#203](https://github.com/TryQuiet/quiet-storage-service/issues/203)
- 1.0.2 (#33)
  ([87c5922](https://github.com/TryQuiet/quiet-storage-service/commit/87c5922)),
  closes [#33](https://github.com/TryQuiet/quiet-storage-service/issues/33)
  [#34](https://github.com/TryQuiet/quiet-storage-service/issues/34)
- add a default title and body so that message is not treated as silent
  ([391802a](https://github.com/TryQuiet/quiet-storage-service/commit/391802a))
- Add index to log entry table for community ID + hashedDbId + receivedAt (#26)
  ([0b5402d](https://github.com/TryQuiet/quiet-storage-service/commit/0b5402d)),
  closes [#26](https://github.com/TryQuiet/quiet-storage-service/issues/26)
- Android Firebase Configuration (#31)
  ([49e0e3e](https://github.com/TryQuiet/quiet-storage-service/commit/49e0e3e)),
  closes [#31](https://github.com/TryQuiet/quiet-storage-service/issues/31)
- Batch push notifications (#23)
  ([a337f38](https://github.com/TryQuiet/quiet-storage-service/commit/a337f38)),
  closes [#23](https://github.com/TryQuiet/quiet-storage-service/issues/23)
- fix websocket connection rate map leak (#41)
  ([bfc8e5e](https://github.com/TryQuiet/quiet-storage-service/commit/bfc8e5e)),
  closes [#41](https://github.com/TryQuiet/quiet-storage-service/issues/41)
- NSE Sync Protocol (#30)
  ([aadb8b5](https://github.com/TryQuiet/quiet-storage-service/commit/aadb8b5)),
  closes [#30](https://github.com/TryQuiet/quiet-storage-service/issues/30)
- Remove Env Var Secret fallbacks (#44)
  ([fe26f66](https://github.com/TryQuiet/quiet-storage-service/commit/fe26f66)),
  closes [#44](https://github.com/TryQuiet/quiet-storage-service/issues/44)
- Require team-authenticated sockets for QPS push events (#42)
  ([718f760](https://github.com/TryQuiet/quiet-storage-service/commit/718f760)),
  closes [#42](https://github.com/TryQuiet/quiet-storage-service/issues/42)
- Secrets Management for Firebase (#32)
  ([74e1853](https://github.com/TryQuiet/quiet-storage-service/commit/74e1853)),
  closes [#32](https://github.com/TryQuiet/quiet-storage-service/issues/32)
- Test change: forgot to set the ruleset to active (#28)
  ([c026e9f](https://github.com/TryQuiet/quiet-storage-service/commit/c026e9f)),
  closes [#28](https://github.com/TryQuiet/quiet-storage-service/issues/28)
- Test commit: should be blocked by branch rules
  ([faa2b67](https://github.com/TryQuiet/quiet-storage-service/commit/faa2b67))
- Update app package CHANGELOG.md
  ([2e43e19](https://github.com/TryQuiet/quiet-storage-service/commit/2e43e19))
- Update auth (#37)
  ([63b00eb](https://github.com/TryQuiet/quiet-storage-service/commit/63b00eb)),
  closes [#37](https://github.com/TryQuiet/quiet-storage-service/issues/37)
- update for compatibility with new submodule bump
  ([c893055](https://github.com/TryQuiet/quiet-storage-service/commit/c893055))
- Update LFA submodule (#48)
  ([ce9b55b](https://github.com/TryQuiet/quiet-storage-service/commit/ce9b55b)),
  closes [#48](https://github.com/TryQuiet/quiet-storage-service/issues/48)
- Update logging for production (#38)
  ([cdeaf5d](https://github.com/TryQuiet/quiet-storage-service/commit/cdeaf5d)),
  closes [#38](https://github.com/TryQuiet/quiet-storage-service/issues/38)
- feat: adopt local-first-auth path A — self-certifying server identity
  ([6927bc8](https://github.com/TryQuiet/quiet-storage-service/commit/6927bc8)),
  closes [#81](https://github.com/TryQuiet/quiet-storage-service/issues/81)
  [#81](https://github.com/TryQuiet/quiet-storage-service/issues/81)
  [#81](https://github.com/TryQuiet/quiet-storage-service/issues/81)
- feat: Implement websocket rate limiting configuration and functionality (#45)
  ([52204c2](https://github.com/TryQuiet/quiet-storage-service/commit/52204c2)),
  closes [#45](https://github.com/TryQuiet/quiet-storage-service/issues/45)
- feat(3155): Update auth module to be compatible with private channels (#35)
  ([a5692b0](https://github.com/TryQuiet/quiet-storage-service/commit/a5692b0)),
  closes [#35](https://github.com/TryQuiet/quiet-storage-service/issues/35)
- release: 1.0.3 (#39)
  ([4295a31](https://github.com/TryQuiet/quiet-storage-service/commit/4295a31)),
  closes [#39](https://github.com/TryQuiet/quiet-storage-service/issues/39)
  [#36](https://github.com/TryQuiet/quiet-storage-service/issues/36)
- release: 1.1.1 (#49)
  ([b453160](https://github.com/TryQuiet/quiet-storage-service/commit/b453160)),
  closes [#49](https://github.com/TryQuiet/quiet-storage-service/issues/49)

## <small>1.1.1 (2026-06-27)</small>

- enable qps
  ([4e2338c](https://github.com/TryQuiet/quiet-storage-service/commit/4e2338c))
- Update app package CHANGELOG.md
  ([1af760d](https://github.com/TryQuiet/quiet-storage-service/commit/1af760d))

## 1.1.0 (2026-06-27)

- Update app package CHANGELOG.md
  ([16c04a8](https://github.com/TryQuiet/quiet-storage-service/commit/16c04a8))

## 1.1.0-alpha.0 (2026-06-26)

- chore: Update deploy scripts to support Amazon Linux instances and the new
  prod environment (#43)
  ([a3495e5](https://github.com/TryQuiet/quiet-storage-service/commit/a3495e5)),
  closes [#43](https://github.com/TryQuiet/quiet-storage-service/issues/43)
- feat: Implement websocket rate limiting configuration and functionality (#45)
  ([52204c2](https://github.com/TryQuiet/quiet-storage-service/commit/52204c2)),
  closes [#45](https://github.com/TryQuiet/quiet-storage-service/issues/45)
- feat(3155): Update auth module to be compatible with private channels (#35)
  ([a5692b0](https://github.com/TryQuiet/quiet-storage-service/commit/a5692b0)),
  closes [#35](https://github.com/TryQuiet/quiet-storage-service/issues/35)
- 1.0.2 (#33)
  ([87c5922](https://github.com/TryQuiet/quiet-storage-service/commit/87c5922)),
  closes [#33](https://github.com/TryQuiet/quiet-storage-service/issues/33)
  [#34](https://github.com/TryQuiet/quiet-storage-service/issues/34)
- add a default title and body so that message is not treated as silent
  ([391802a](https://github.com/TryQuiet/quiet-storage-service/commit/391802a))
- Add index to log entry table for community ID + hashedDbId + receivedAt (#26)
  ([0b5402d](https://github.com/TryQuiet/quiet-storage-service/commit/0b5402d)),
  closes [#26](https://github.com/TryQuiet/quiet-storage-service/issues/26)
- Android Firebase Configuration (#31)
  ([49e0e3e](https://github.com/TryQuiet/quiet-storage-service/commit/49e0e3e)),
  closes [#31](https://github.com/TryQuiet/quiet-storage-service/issues/31)
- Batch push notifications (#23)
  ([a337f38](https://github.com/TryQuiet/quiet-storage-service/commit/a337f38)),
  closes [#23](https://github.com/TryQuiet/quiet-storage-service/issues/23)
- fix websocket connection rate map leak (#41)
  ([bfc8e5e](https://github.com/TryQuiet/quiet-storage-service/commit/bfc8e5e)),
  closes [#41](https://github.com/TryQuiet/quiet-storage-service/issues/41)
- NSE Sync Protocol (#30)
  ([aadb8b5](https://github.com/TryQuiet/quiet-storage-service/commit/aadb8b5)),
  closes [#30](https://github.com/TryQuiet/quiet-storage-service/issues/30)
- Remove Env Var Secret fallbacks (#44)
  ([fe26f66](https://github.com/TryQuiet/quiet-storage-service/commit/fe26f66)),
  closes [#44](https://github.com/TryQuiet/quiet-storage-service/issues/44)
- Require team-authenticated sockets for QPS push events (#42)
  ([718f760](https://github.com/TryQuiet/quiet-storage-service/commit/718f760)),
  closes [#42](https://github.com/TryQuiet/quiet-storage-service/issues/42)
- Secrets Management for Firebase (#32)
  ([74e1853](https://github.com/TryQuiet/quiet-storage-service/commit/74e1853)),
  closes [#32](https://github.com/TryQuiet/quiet-storage-service/issues/32)
- Test change: forgot to set the ruleset to active (#28)
  ([c026e9f](https://github.com/TryQuiet/quiet-storage-service/commit/c026e9f)),
  closes [#28](https://github.com/TryQuiet/quiet-storage-service/issues/28)
- Test commit: should be blocked by branch rules
  ([faa2b67](https://github.com/TryQuiet/quiet-storage-service/commit/faa2b67))
- Update app package CHANGELOG.md
  ([2e43e19](https://github.com/TryQuiet/quiet-storage-service/commit/2e43e19))
- Update auth (#37)
  ([63b00eb](https://github.com/TryQuiet/quiet-storage-service/commit/63b00eb)),
  closes [#37](https://github.com/TryQuiet/quiet-storage-service/issues/37)
- Update logging for production (#38)
  ([cdeaf5d](https://github.com/TryQuiet/quiet-storage-service/commit/cdeaf5d)),
  closes [#38](https://github.com/TryQuiet/quiet-storage-service/issues/38)
- fix: Allow more fuzziness in team link timestamp validations and use updated
  logging (#27)
  ([2e41cc4](https://github.com/TryQuiet/quiet-storage-service/commit/2e41cc4)),
  closes [#27](https://github.com/TryQuiet/quiet-storage-service/issues/27)
- fix: bind auth sync to owning socket (#40)
  ([4ffc16b](https://github.com/TryQuiet/quiet-storage-service/commit/4ffc16b)),
  closes [#40](https://github.com/TryQuiet/quiet-storage-service/issues/40)
- fix: Handle auth errors on QSS (#25)
  ([b10f52a](https://github.com/TryQuiet/quiet-storage-service/commit/b10f52a)),
  closes [#25](https://github.com/TryQuiet/quiet-storage-service/issues/25)
- release: 1.0.3 (#39)
  ([4295a31](https://github.com/TryQuiet/quiet-storage-service/commit/4295a31)),
  closes [#39](https://github.com/TryQuiet/quiet-storage-service/issues/39)
  [#36](https://github.com/TryQuiet/quiet-storage-service/issues/36)

## <small>1.0.7 (2026-06-25)</small>

- Update app package CHANGELOG.md
  ([f087685](https://github.com/TryQuiet/quiet-storage-service/commit/f087685))

## <small>1.0.7-alpha.12 (2026-06-25)</small>

- Remove set -e because its throwing on grep not finding strings
  ([79dbf78](https://github.com/TryQuiet/quiet-storage-service/commit/79dbf78))
- Update app package CHANGELOG.md
  ([6b0dafd](https://github.com/TryQuiet/quiet-storage-service/commit/6b0dafd))

## <small>1.0.7-alpha.11 (2026-06-25)</small>

- Run on ApplicationStop
  ([a532214](https://github.com/TryQuiet/quiet-storage-service/commit/a532214))
- Update app package CHANGELOG.md
  ([7994380](https://github.com/TryQuiet/quiet-storage-service/commit/7994380))

## <small>1.0.7-alpha.10 (2026-06-25)</small>

- Try to fix error with pm2 on before install
  ([b3a73c4](https://github.com/TryQuiet/quiet-storage-service/commit/b3a73c4))
- Update action.yml
  ([3de3794](https://github.com/TryQuiet/quiet-storage-service/commit/3de3794))
- Update app package CHANGELOG.md
  ([8f8c7bf](https://github.com/TryQuiet/quiet-storage-service/commit/8f8c7bf))

## <small>1.0.7-alpha.9 (2026-06-25)</small>

- Add 'set -e' to deploy/AMI init scripts
  ([66b28bd](https://github.com/TryQuiet/quiet-storage-service/commit/66b28bd))
- Update app package CHANGELOG.md
  ([336d51a](https://github.com/TryQuiet/quiet-storage-service/commit/336d51a))
- Write versioned AMI setup scripts to S3
  ([15b1438](https://github.com/TryQuiet/quiet-storage-service/commit/15b1438))

## <small>1.0.7-alpha.8 (2026-06-25)</small>

- Set prod hostname
  ([af734b4](https://github.com/TryQuiet/quiet-storage-service/commit/af734b4))
- Try waiting for deploy to succeed
  ([851f2a2](https://github.com/TryQuiet/quiet-storage-service/commit/851f2a2))
- Update app package CHANGELOG.md
  ([de4ee5c](https://github.com/TryQuiet/quiet-storage-service/commit/de4ee5c))

## <small>1.0.7-alpha.7 (2026-06-25)</small>

- Remove permissions code
  ([1c1343a](https://github.com/TryQuiet/quiet-storage-service/commit/1c1343a))
- Update app package CHANGELOG.md
  ([7326642](https://github.com/TryQuiet/quiet-storage-service/commit/7326642))

## <small>1.0.7-alpha.6 (2026-06-25)</small>

- Add back AfterInstall
  ([a5e644d](https://github.com/TryQuiet/quiet-storage-service/commit/a5e644d))
- Update app package CHANGELOG.md
  ([544d010](https://github.com/TryQuiet/quiet-storage-service/commit/544d010))

## <small>1.0.7-alpha.5 (2026-06-25)</small>

- Update app package CHANGELOG.md
  ([376cd71](https://github.com/TryQuiet/quiet-storage-service/commit/376cd71))

## <small>1.0.7-alpha.4 (2026-06-25)</small>

- Fix permissions
  ([eed959e](https://github.com/TryQuiet/quiet-storage-service/commit/eed959e))
- Update app package CHANGELOG.md
  ([8e9dfc0](https://github.com/TryQuiet/quiet-storage-service/commit/8e9dfc0))

## <small>1.0.7-alpha.3 (2026-06-25)</small>

- Cleanup
  ([a00e819](https://github.com/TryQuiet/quiet-storage-service/commit/a00e819))
- Update app package CHANGELOG.md
  ([d60c91b](https://github.com/TryQuiet/quiet-storage-service/commit/d60c91b))

## <small>1.0.7-alpha.2 (2026-06-25)</small>

- Update app package CHANGELOG.md
  ([25ef66a](https://github.com/TryQuiet/quiet-storage-service/commit/25ef66a))
- Update BeforeInstall, apply dir ownership in appspec, skip AfterInstall script
  ([c8b4191](https://github.com/TryQuiet/quiet-storage-service/commit/c8b4191))

## <small>1.0.7-alpha.1 (2026-06-24)</small>

- Rename setup script
  ([a071f45](https://github.com/TryQuiet/quiet-storage-service/commit/a071f45))
- Update app package CHANGELOG.md
  ([a89961c](https://github.com/TryQuiet/quiet-storage-service/commit/a89961c))
- Write setup script to S3 during deploys
  ([ea78ea1](https://github.com/TryQuiet/quiet-storage-service/commit/ea78ea1))

## <small>1.0.7-alpha.0 (2026-06-24)</small>

- Add server init script and use different zip file names by environment
  ([5caf7d7](https://github.com/TryQuiet/quiet-storage-service/commit/5caf7d7))
- Clear dupe and commented out lines from app start script
  ([1cc30ad](https://github.com/TryQuiet/quiet-storage-service/commit/1cc30ad))
- Update app package CHANGELOG.md
  ([efd4052](https://github.com/TryQuiet/quiet-storage-service/commit/efd4052))

## <small>1.0.6 (2026-06-22)</small>

- Update app package CHANGELOG.md
  ([4af26c1](https://github.com/TryQuiet/quiet-storage-service/commit/4af26c1))
- Update prod RDS secret name
  ([b8c4f8f](https://github.com/TryQuiet/quiet-storage-service/commit/b8c4f8f))

## <small>1.0.5 (2026-06-22)</small>

- Fix prod release notification
  ([e05170d](https://github.com/TryQuiet/quiet-storage-service/commit/e05170d))
- Update app package CHANGELOG.md
  ([619f297](https://github.com/TryQuiet/quiet-storage-service/commit/619f297))

## <small>1.0.4 (2026-06-22)</small>

- Update app package CHANGELOG.md
  ([32fcf2c](https://github.com/TryQuiet/quiet-storage-service/commit/32fcf2c))

## <small>1.0.4-alpha.17 (2026-06-22)</small>

- Update app package CHANGELOG.md
  ([cffc4d3](https://github.com/TryQuiet/quiet-storage-service/commit/cffc4d3))
- Update production RDS env config
  ([c56571c](https://github.com/TryQuiet/quiet-storage-service/commit/c56571c))

## <small>1.0.4-alpha.16 (2026-06-22)</small>

- Cleanup and add logs to scripts
  ([00fe53f](https://github.com/TryQuiet/quiet-storage-service/commit/00fe53f))
- Update app package CHANGELOG.md
  ([d87fac9](https://github.com/TryQuiet/quiet-storage-service/commit/d87fac9))

## <small>1.0.4-alpha.15 (2026-06-22)</small>

- Move bootstrap and migration logic to app start script
  ([7c9c837](https://github.com/TryQuiet/quiet-storage-service/commit/7c9c837))
- Update app package CHANGELOG.md
  ([e5bce0e](https://github.com/TryQuiet/quiet-storage-service/commit/e5bce0e))

## <small>1.0.4-alpha.14 (2026-06-22)</small>

- Run AfterInstall as root to modify dir ownership
  ([288c51e](https://github.com/TryQuiet/quiet-storage-service/commit/288c51e))
- Update app package CHANGELOG.md
  ([102c40b](https://github.com/TryQuiet/quiet-storage-service/commit/102c40b))

## <small>1.0.4-alpha.13 (2026-06-22)</small>

- Pare down deploy scripts to work with new golden AMI
  ([314b245](https://github.com/TryQuiet/quiet-storage-service/commit/314b245))
- Update app package CHANGELOG.md
  ([f257a57](https://github.com/TryQuiet/quiet-storage-service/commit/f257a57))

## <small>1.0.4-alpha.12 (2026-06-19)</small>

- Gracefully stop the QSS process before install
  ([402a053](https://github.com/TryQuiet/quiet-storage-service/commit/402a053))
- Update app package CHANGELOG.md
  ([6e56f52](https://github.com/TryQuiet/quiet-storage-service/commit/6e56f52))

## <small>1.0.4-alpha.11 (2026-06-19)</small>

- Update app package CHANGELOG.md
  ([3f2ed66](https://github.com/TryQuiet/quiet-storage-service/commit/3f2ed66))

## <small>1.0.4-alpha.10 (2026-06-19)</small>

- Fix restart check of QSS service
  ([8923bfb](https://github.com/TryQuiet/quiet-storage-service/commit/8923bfb))
- Update app package CHANGELOG.md
  ([2753a85](https://github.com/TryQuiet/quiet-storage-service/commit/2753a85))

## <small>1.0.4-alpha.9 (2026-06-19)</small>

- Source correct bashrc
  ([4e22c4b](https://github.com/TryQuiet/quiet-storage-service/commit/4e22c4b))
- Update app package CHANGELOG.md
  ([9439913](https://github.com/TryQuiet/quiet-storage-service/commit/9439913))

## <small>1.0.4-alpha.8 (2026-06-19)</small>

- Add logs
  ([cca6cca](https://github.com/TryQuiet/quiet-storage-service/commit/cca6cca))
- Update app package CHANGELOG.md
  ([9d145d5](https://github.com/TryQuiet/quiet-storage-service/commit/9d145d5))
- Update application-start.sh
  ([64ee294](https://github.com/TryQuiet/quiet-storage-service/commit/64ee294))

## <small>1.0.4-alpha.7 (2026-06-18)</small>

- Fix pm2 check
  ([28f1735](https://github.com/TryQuiet/quiet-storage-service/commit/28f1735))
- Update app package CHANGELOG.md
  ([1455813](https://github.com/TryQuiet/quiet-storage-service/commit/1455813))

## <small>1.0.4-alpha.6 (2026-06-18)</small>

- Update app package CHANGELOG.md
  ([1877880](https://github.com/TryQuiet/quiet-storage-service/commit/1877880))
- Update auth to latest and sudo su
  ([e41f345](https://github.com/TryQuiet/quiet-storage-service/commit/e41f345))

## <small>1.0.4-alpha.5 (2026-06-18)</small>

- Fix scripts again
  ([6e2eeb5](https://github.com/TryQuiet/quiet-storage-service/commit/6e2eeb5))
- Update app package CHANGELOG.md
  ([2cea47e](https://github.com/TryQuiet/quiet-storage-service/commit/2cea47e))

## <small>1.0.4-alpha.4 (2026-06-18)</small>

- Ensure AWS CLI tools are installed
  ([abdc6ea](https://github.com/TryQuiet/quiet-storage-service/commit/abdc6ea))
- Skip using aws cli for environment name
  ([64f40f2](https://github.com/TryQuiet/quiet-storage-service/commit/64f40f2))
- Update app package CHANGELOG.md
  ([4557c28](https://github.com/TryQuiet/quiet-storage-service/commit/4557c28))

## <small>1.0.4-alpha.3 (2026-06-18)</small>

- More tweaks for amazon linux
  ([b4cef16](https://github.com/TryQuiet/quiet-storage-service/commit/b4cef16))
- Update app package CHANGELOG.md
  ([414dca5](https://github.com/TryQuiet/quiet-storage-service/commit/414dca5))

## <small>1.0.4-alpha.2 (2026-06-17)</small>

- More script updates
  ([d7acaa2](https://github.com/TryQuiet/quiet-storage-service/commit/d7acaa2))
- Update app package CHANGELOG.md
  ([8c62a89](https://github.com/TryQuiet/quiet-storage-service/commit/8c62a89))

## <small>1.0.4-alpha.1 (2026-06-17)</small>

- Update app package CHANGELOG.md
  ([43feb4d](https://github.com/TryQuiet/quiet-storage-service/commit/43feb4d))
- Update install scripts to work with amazon linux
  ([58dceac](https://github.com/TryQuiet/quiet-storage-service/commit/58dceac))

## <small>1.0.4-alpha.0 (2026-06-17)</small>

- release: 1.0.3 (#39)
  ([4295a31](https://github.com/TryQuiet/quiet-storage-service/commit/4295a31)),
  closes [#39](https://github.com/TryQuiet/quiet-storage-service/issues/39)
  [#36](https://github.com/TryQuiet/quiet-storage-service/issues/36)
- 1.0.2 (#33)
  ([87c5922](https://github.com/TryQuiet/quiet-storage-service/commit/87c5922)),
  closes [#33](https://github.com/TryQuiet/quiet-storage-service/issues/33)
  [#34](https://github.com/TryQuiet/quiet-storage-service/issues/34)
- add a default title and body so that message is not treated as silent
  ([391802a](https://github.com/TryQuiet/quiet-storage-service/commit/391802a))
- Add index to log entry table for community ID + hashedDbId + receivedAt (#26)
  ([0b5402d](https://github.com/TryQuiet/quiet-storage-service/commit/0b5402d)),
  closes [#26](https://github.com/TryQuiet/quiet-storage-service/issues/26)
- Android Firebase Configuration (#31)
  ([49e0e3e](https://github.com/TryQuiet/quiet-storage-service/commit/49e0e3e)),
  closes [#31](https://github.com/TryQuiet/quiet-storage-service/issues/31)
- Batch push notifications (#23)
  ([a337f38](https://github.com/TryQuiet/quiet-storage-service/commit/a337f38)),
  closes [#23](https://github.com/TryQuiet/quiet-storage-service/issues/23)
- NSE Sync Protocol (#30)
  ([aadb8b5](https://github.com/TryQuiet/quiet-storage-service/commit/aadb8b5)),
  closes [#30](https://github.com/TryQuiet/quiet-storage-service/issues/30)
- Secrets Management for Firebase (#32)
  ([74e1853](https://github.com/TryQuiet/quiet-storage-service/commit/74e1853)),
  closes [#32](https://github.com/TryQuiet/quiet-storage-service/issues/32)
- Test change: forgot to set the ruleset to active (#28)
  ([c026e9f](https://github.com/TryQuiet/quiet-storage-service/commit/c026e9f)),
  closes [#28](https://github.com/TryQuiet/quiet-storage-service/issues/28)
- Test commit: should be blocked by branch rules
  ([faa2b67](https://github.com/TryQuiet/quiet-storage-service/commit/faa2b67))
- Update app package CHANGELOG.md
  ([2e43e19](https://github.com/TryQuiet/quiet-storage-service/commit/2e43e19))
- Update auth (#37)
  ([63b00eb](https://github.com/TryQuiet/quiet-storage-service/commit/63b00eb)),
  closes [#37](https://github.com/TryQuiet/quiet-storage-service/issues/37)
- feat(3155): Update auth module to be compatible with private channels (#35)
  ([a5692b0](https://github.com/TryQuiet/quiet-storage-service/commit/a5692b0)),
  closes [#35](https://github.com/TryQuiet/quiet-storage-service/issues/35)
- fix: Allow more fuzziness in team link timestamp validations and use updated
  logging (#27)
  ([2e41cc4](https://github.com/TryQuiet/quiet-storage-service/commit/2e41cc4)),
  closes [#27](https://github.com/TryQuiet/quiet-storage-service/issues/27)
- fix: Handle auth errors on QSS (#25)
  ([b10f52a](https://github.com/TryQuiet/quiet-storage-service/commit/b10f52a)),
  closes [#25](https://github.com/TryQuiet/quiet-storage-service/issues/25)

## <small>1.0.3 (2026-06-17)</small>

- Update app package CHANGELOG.md
  ([a6c75a8](https://github.com/TryQuiet/quiet-storage-service/commit/a6c75a8))
- Update auth (#37)
  ([63b00eb](https://github.com/TryQuiet/quiet-storage-service/commit/63b00eb)),
  closes [#37](https://github.com/TryQuiet/quiet-storage-service/issues/37)
- feat(3155): Update auth module to be compatible with private channels (#35)
  ([a5692b0](https://github.com/TryQuiet/quiet-storage-service/commit/a5692b0)),
  closes [#35](https://github.com/TryQuiet/quiet-storage-service/issues/35)

## <small>1.0.3-alpha.2 (2026-06-02)</small>

- feat(3256) Update auth to make private channel operations admin-only (#36)
  ([4b0a6dd](https://github.com/TryQuiet/quiet-storage-service/commit/4b0a6dd)),
  closes [#36](https://github.com/TryQuiet/quiet-storage-service/issues/36)
- Update app package CHANGELOG.md
  ([f52db20](https://github.com/TryQuiet/quiet-storage-service/commit/f52db20))

## <small>1.0.3-alpha.1 (2026-05-29)</small>

- Add back notifications on CI deploy job
  ([00d806b](https://github.com/TryQuiet/quiet-storage-service/commit/00d806b))
- Update app package CHANGELOG.md
  ([cea852e](https://github.com/TryQuiet/quiet-storage-service/commit/cea852e))

## <small>1.0.3-alpha.0 (2026-05-29)</small>

- 1.0.2 (#33)
  ([87c5922](https://github.com/TryQuiet/quiet-storage-service/commit/87c5922)),
  closes [#33](https://github.com/TryQuiet/quiet-storage-service/issues/33)
  [#34](https://github.com/TryQuiet/quiet-storage-service/issues/34)
- add a default title and body so that message is not treated as silent
  ([391802a](https://github.com/TryQuiet/quiet-storage-service/commit/391802a))
- Add index to log entry table for community ID + hashedDbId + receivedAt (#26)
  ([0b5402d](https://github.com/TryQuiet/quiet-storage-service/commit/0b5402d)),
  closes [#26](https://github.com/TryQuiet/quiet-storage-service/issues/26)
- Android Firebase Configuration (#31)
  ([49e0e3e](https://github.com/TryQuiet/quiet-storage-service/commit/49e0e3e)),
  closes [#31](https://github.com/TryQuiet/quiet-storage-service/issues/31)
- Batch push notifications (#23)
  ([a337f38](https://github.com/TryQuiet/quiet-storage-service/commit/a337f38)),
  closes [#23](https://github.com/TryQuiet/quiet-storage-service/issues/23)
- NSE Sync Protocol (#30)
  ([aadb8b5](https://github.com/TryQuiet/quiet-storage-service/commit/aadb8b5)),
  closes [#30](https://github.com/TryQuiet/quiet-storage-service/issues/30)
- Secrets Management for Firebase (#32)
  ([74e1853](https://github.com/TryQuiet/quiet-storage-service/commit/74e1853)),
  closes [#32](https://github.com/TryQuiet/quiet-storage-service/issues/32)
- Test change: forgot to set the ruleset to active (#28)
  ([c026e9f](https://github.com/TryQuiet/quiet-storage-service/commit/c026e9f)),
  closes [#28](https://github.com/TryQuiet/quiet-storage-service/issues/28)
- Test commit: should be blocked by branch rules
  ([faa2b67](https://github.com/TryQuiet/quiet-storage-service/commit/faa2b67))
- Update app package CHANGELOG.md
  ([2e43e19](https://github.com/TryQuiet/quiet-storage-service/commit/2e43e19))
- fix: Allow more fuzziness in team link timestamp validations and use updated
  logging (#27)
  ([2e41cc4](https://github.com/TryQuiet/quiet-storage-service/commit/2e41cc4)),
  closes [#27](https://github.com/TryQuiet/quiet-storage-service/issues/27)
- fix: Handle auth errors on QSS (#25)
  ([b10f52a](https://github.com/TryQuiet/quiet-storage-service/commit/b10f52a)),
  closes [#25](https://github.com/TryQuiet/quiet-storage-service/issues/25)

## <small>1.0.2-alpha.13 (2026-05-04)</small>

- Configure QSS to use new domain (#34)
  ([3132f61](https://github.com/TryQuiet/quiet-storage-service/commit/3132f61)),
  closes [#34](https://github.com/TryQuiet/quiet-storage-service/issues/34)
- Update app package CHANGELOG.md
  ([c696bcf](https://github.com/TryQuiet/quiet-storage-service/commit/c696bcf))

## <small>1.0.2-alpha.12 (2026-05-01)</small>

- only reuse auth connection if it's with the same socket
  ([d0fccbf](https://github.com/TryQuiet/quiet-storage-service/commit/d0fccbf))
- Update app package CHANGELOG.md
  ([61a0cc1](https://github.com/TryQuiet/quiet-storage-service/commit/61a0cc1))
- update submodule pointer
  ([30e371f](https://github.com/TryQuiet/quiet-storage-service/commit/30e371f))

## <small>1.0.2-alpha.11 (2026-04-30)</small>

- feat: log current connected clients in websocket connection handler
  ([a004f58](https://github.com/TryQuiet/quiet-storage-service/commit/a004f58))
- add ws rate limiting
  ([6e53ca7](https://github.com/TryQuiet/quiet-storage-service/commit/6e53ca7))
- Update app package CHANGELOG.md
  ([8ae98f7](https://github.com/TryQuiet/quiet-storage-service/commit/8ae98f7))

## <small>1.0.2-alpha.10 (2026-04-30)</small>

- captcha logger naming fix
  ([08457f5](https://github.com/TryQuiet/quiet-storage-service/commit/08457f5))
- Update app package CHANGELOG.md
  ([611807b](https://github.com/TryQuiet/quiet-storage-service/commit/611807b))
- refactor: enhance websocket handlers with socket attribution management
  ([00e3f1a](https://github.com/TryQuiet/quiet-storage-service/commit/00e3f1a))

## <small>1.0.2-alpha.9 (2026-04-27)</small>

- Update app package CHANGELOG.md
  ([57d51e4](https://github.com/TryQuiet/quiet-storage-service/commit/57d51e4))
- Use a shared winston logger so that logs properly rotate
  ([fe881b5](https://github.com/TryQuiet/quiet-storage-service/commit/fe881b5))

## <small>1.0.2-alpha.8 (2026-04-23)</small>

- refactor: change log level from log to info for log entry addition
  ([e6f5b7d](https://github.com/TryQuiet/quiet-storage-service/commit/e6f5b7d))
- refactor: enhance log entry sync handling and improve transaction management
  ([f141fad](https://github.com/TryQuiet/quiet-storage-service/commit/f141fad))
- refactor: improve error handling for duplicate log entries and extract utility
  function
  ([cd2cfa9](https://github.com/TryQuiet/quiet-storage-service/commit/cd2cfa9))
- feat: add debug logging for log entries retrieval in NseAuthController
  ([87b221d](https://github.com/TryQuiet/quiet-storage-service/commit/87b221d))
- feat: add debug logging for nse log entries request and response handling
  ([0387d7c](https://github.com/TryQuiet/quiet-storage-service/commit/0387d7c))
- fix: harden log entry sync sequence allocation
  ([04d6d92](https://github.com/TryQuiet/quiet-storage-service/commit/04d6d92))
- refactor nse-auth module to generalized nse-module
  ([8804bd8](https://github.com/TryQuiet/quiet-storage-service/commit/8804bd8))
- stop logging headers
  ([77ceef9](https://github.com/TryQuiet/quiet-storage-service/commit/77ceef9))
- Update app package CHANGELOG.md
  ([2849e2c](https://github.com/TryQuiet/quiet-storage-service/commit/2849e2c))

## <small>1.0.2-alpha.7 (2026-04-21)</small>

- refactor: simplify secret key retrieval for secret env vars
  ([f1caae8](https://github.com/TryQuiet/quiet-storage-service/commit/f1caae8))
- Update app package CHANGELOG.md
  ([4ee8241](https://github.com/TryQuiet/quiet-storage-service/commit/4ee8241))

## <small>1.0.2-alpha.6 (2026-04-21)</small>

- Update app package CHANGELOG.md
  ([dbaaf07](https://github.com/TryQuiet/quiet-storage-service/commit/dbaaf07))
- use real captcha in dev server
  ([2fdc03c](https://github.com/TryQuiet/quiet-storage-service/commit/2fdc03c))

## <small>1.0.2-alpha.5 (2026-04-20)</small>

- fix matching
  ([1acaa0e](https://github.com/TryQuiet/quiet-storage-service/commit/1acaa0e))
- Update app package CHANGELOG.md
  ([727f9c9](https://github.com/TryQuiet/quiet-storage-service/commit/727f9c9))

## <small>1.0.2-alpha.4 (2026-04-20)</small>

- fix private key env scoped format
  ([98b2064](https://github.com/TryQuiet/quiet-storage-service/commit/98b2064))
- Update app package CHANGELOG.md
  ([eb1b822](https://github.com/TryQuiet/quiet-storage-service/commit/eb1b822))

## <small>1.0.2-alpha.3 (2026-04-20)</small>

- Update app package CHANGELOG.md
  ([dc544c4](https://github.com/TryQuiet/quiet-storage-service/commit/dc544c4))

## <small>1.0.2-alpha.2 (2026-04-20)</small>

- chore(release): publish v1.0.2-alpha.0
  ([4359b85](https://github.com/TryQuiet/quiet-storage-service/commit/4359b85))
- chore(release): publish v1.0.2-alpha.1
  ([3f6360d](https://github.com/TryQuiet/quiet-storage-service/commit/3f6360d))
- add a default title and body so that message is not treated as silent
  ([391802a](https://github.com/TryQuiet/quiet-storage-service/commit/391802a))
- Add index to log entry table for community ID + hashedDbId + receivedAt (#26)
  ([0b5402d](https://github.com/TryQuiet/quiet-storage-service/commit/0b5402d)),
  closes [#26](https://github.com/TryQuiet/quiet-storage-service/issues/26)
- Android Firebase Configuration (#31)
  ([49e0e3e](https://github.com/TryQuiet/quiet-storage-service/commit/49e0e3e)),
  closes [#31](https://github.com/TryQuiet/quiet-storage-service/issues/31)
- Batch push notifications (#23)
  ([a337f38](https://github.com/TryQuiet/quiet-storage-service/commit/a337f38)),
  closes [#23](https://github.com/TryQuiet/quiet-storage-service/issues/23)
- NSE Sync Protocol (#30)
  ([aadb8b5](https://github.com/TryQuiet/quiet-storage-service/commit/aadb8b5)),
  closes [#30](https://github.com/TryQuiet/quiet-storage-service/issues/30)
- Secrets Management for Firebase (#32)
  ([74e1853](https://github.com/TryQuiet/quiet-storage-service/commit/74e1853)),
  closes [#32](https://github.com/TryQuiet/quiet-storage-service/issues/32)
- Test change: forgot to set the ruleset to active (#28)
  ([c026e9f](https://github.com/TryQuiet/quiet-storage-service/commit/c026e9f)),
  closes [#28](https://github.com/TryQuiet/quiet-storage-service/issues/28)
- Test commit: should be blocked by branch rules
  ([faa2b67](https://github.com/TryQuiet/quiet-storage-service/commit/faa2b67))
- Update app package CHANGELOG.md
  ([8a76d2c](https://github.com/TryQuiet/quiet-storage-service/commit/8a76d2c))
- Update app package CHANGELOG.md
  ([2e43e19](https://github.com/TryQuiet/quiet-storage-service/commit/2e43e19))
- fix: Allow more fuzziness in team link timestamp validations and use updated
  logging (#27)
  ([2e41cc4](https://github.com/TryQuiet/quiet-storage-service/commit/2e41cc4)),
  closes [#27](https://github.com/TryQuiet/quiet-storage-service/issues/27)
- fix: Handle auth errors on QSS (#25)
  ([b10f52a](https://github.com/TryQuiet/quiet-storage-service/commit/b10f52a)),
  closes [#25](https://github.com/TryQuiet/quiet-storage-service/issues/25)

## <small>1.0.2-alpha.1 (2026-04-20)</small>

- add a default title and body so that message is not treated as silent
  ([391802a](https://github.com/TryQuiet/quiet-storage-service/commit/391802a))
- Add index to log entry table for community ID + hashedDbId + receivedAt (#26)
  ([0b5402d](https://github.com/TryQuiet/quiet-storage-service/commit/0b5402d)),
  closes [#26](https://github.com/TryQuiet/quiet-storage-service/issues/26)
- Android Firebase Configuration (#31)
  ([49e0e3e](https://github.com/TryQuiet/quiet-storage-service/commit/49e0e3e)),
  closes [#31](https://github.com/TryQuiet/quiet-storage-service/issues/31)
- Batch push notifications (#23)
  ([a337f38](https://github.com/TryQuiet/quiet-storage-service/commit/a337f38)),
  closes [#23](https://github.com/TryQuiet/quiet-storage-service/issues/23)
- NSE Sync Protocol (#30)
  ([aadb8b5](https://github.com/TryQuiet/quiet-storage-service/commit/aadb8b5)),
  closes [#30](https://github.com/TryQuiet/quiet-storage-service/issues/30)
- Secrets Management for Firebase (#32)
  ([74e1853](https://github.com/TryQuiet/quiet-storage-service/commit/74e1853)),
  closes [#32](https://github.com/TryQuiet/quiet-storage-service/issues/32)
- Test change: forgot to set the ruleset to active (#28)
  ([c026e9f](https://github.com/TryQuiet/quiet-storage-service/commit/c026e9f)),
  closes [#28](https://github.com/TryQuiet/quiet-storage-service/issues/28)
- Test commit: should be blocked by branch rules
  ([faa2b67](https://github.com/TryQuiet/quiet-storage-service/commit/faa2b67))
- Update app package CHANGELOG.md
  ([8a76d2c](https://github.com/TryQuiet/quiet-storage-service/commit/8a76d2c))
- Update app package CHANGELOG.md
  ([2e43e19](https://github.com/TryQuiet/quiet-storage-service/commit/2e43e19))
- chore(release): publish v1.0.2-alpha.0
  ([4359b85](https://github.com/TryQuiet/quiet-storage-service/commit/4359b85))
- fix: Allow more fuzziness in team link timestamp validations and use updated
  logging (#27)
  ([2e41cc4](https://github.com/TryQuiet/quiet-storage-service/commit/2e41cc4)),
  closes [#27](https://github.com/TryQuiet/quiet-storage-service/issues/27)
- fix: Handle auth errors on QSS (#25)
  ([b10f52a](https://github.com/TryQuiet/quiet-storage-service/commit/b10f52a)),
  closes [#25](https://github.com/TryQuiet/quiet-storage-service/issues/25)

## <small>1.0.2-alpha.0 (2026-04-20)</small>

- add a default title and body so that message is not treated as silent
  ([391802a](https://github.com/TryQuiet/quiet-storage-service/commit/391802a))
- Add index to log entry table for community ID + hashedDbId + receivedAt (#26)
  ([0b5402d](https://github.com/TryQuiet/quiet-storage-service/commit/0b5402d)),
  closes [#26](https://github.com/TryQuiet/quiet-storage-service/issues/26)
- Android Firebase Configuration (#31)
  ([49e0e3e](https://github.com/TryQuiet/quiet-storage-service/commit/49e0e3e)),
  closes [#31](https://github.com/TryQuiet/quiet-storage-service/issues/31)
- Batch push notifications (#23)
  ([a337f38](https://github.com/TryQuiet/quiet-storage-service/commit/a337f38)),
  closes [#23](https://github.com/TryQuiet/quiet-storage-service/issues/23)
- NSE Sync Protocol (#30)
  ([aadb8b5](https://github.com/TryQuiet/quiet-storage-service/commit/aadb8b5)),
  closes [#30](https://github.com/TryQuiet/quiet-storage-service/issues/30)
- Secrets Management for Firebase (#32)
  ([74e1853](https://github.com/TryQuiet/quiet-storage-service/commit/74e1853)),
  closes [#32](https://github.com/TryQuiet/quiet-storage-service/issues/32)
- Test change: forgot to set the ruleset to active (#28)
  ([c026e9f](https://github.com/TryQuiet/quiet-storage-service/commit/c026e9f)),
  closes [#28](https://github.com/TryQuiet/quiet-storage-service/issues/28)
- Test commit: should be blocked by branch rules
  ([faa2b67](https://github.com/TryQuiet/quiet-storage-service/commit/faa2b67))
- Update app package CHANGELOG.md
  ([2e43e19](https://github.com/TryQuiet/quiet-storage-service/commit/2e43e19))
- fix: Allow more fuzziness in team link timestamp validations and use updated
  logging (#27)
  ([2e41cc4](https://github.com/TryQuiet/quiet-storage-service/commit/2e41cc4)),
  closes [#27](https://github.com/TryQuiet/quiet-storage-service/issues/27)
- fix: Handle auth errors on QSS (#25)
  ([b10f52a](https://github.com/TryQuiet/quiet-storage-service/commit/b10f52a)),
  closes [#25](https://github.com/TryQuiet/quiet-storage-service/issues/25)

## <small>1.0.1-alpha.11 (2026-03-20)</small>

- fix: Handle auth errors on QSS (#25)
  ([b10f52a](https://github.com/TryQuiet/quiet-storage-service/commit/b10f52a)),
  closes [#25](https://github.com/TryQuiet/quiet-storage-service/issues/25)
- Allow more fuzziness in timestamp validations and use updated logging
  ([2d41414](https://github.com/TryQuiet/quiet-storage-service/commit/2d41414))
- Update app package CHANGELOG.md
  ([2e43e19](https://github.com/TryQuiet/quiet-storage-service/commit/2e43e19))
- Update auth
  ([875fcc0](https://github.com/TryQuiet/quiet-storage-service/commit/875fcc0))

## <small>1.0.1-alpha.10 (2026-03-09)</small>

- Update app package CHANGELOG.md
  ([fdca051](https://github.com/TryQuiet/quiet-storage-service/commit/fdca051))
- Update auth
  ([d4f4502](https://github.com/TryQuiet/quiet-storage-service/commit/d4f4502))

## <small>1.0.1-alpha.9 (2026-03-06)</small>

- Update app package CHANGELOG.md
  ([3f26d4c](https://github.com/TryQuiet/quiet-storage-service/commit/3f26d4c))
- Update auth
  ([a7ef9b0](https://github.com/TryQuiet/quiet-storage-service/commit/a7ef9b0))

## <small>1.0.1-alpha.8 (2026-03-06)</small>

- Update app package CHANGELOG.md
  ([f9c91ca](https://github.com/TryQuiet/quiet-storage-service/commit/f9c91ca))
- Update auth
  ([592baa7](https://github.com/TryQuiet/quiet-storage-service/commit/592baa7))
- Update auth
  ([d8cf375](https://github.com/TryQuiet/quiet-storage-service/commit/d8cf375))

## <small>1.0.1-alpha.7 (2026-03-06)</small>

- Update app package CHANGELOG.md
  ([5e46571](https://github.com/TryQuiet/quiet-storage-service/commit/5e46571))
- Update auth
  ([3c7181f](https://github.com/TryQuiet/quiet-storage-service/commit/3c7181f))

## <small>1.0.1-alpha.6 (2026-03-06)</small>

- Go back to main
  ([663ad5b](https://github.com/TryQuiet/quiet-storage-service/commit/663ad5b))
- Revert "Disconnect on errors and restart auth connection"
  ([ca4f8f9](https://github.com/TryQuiet/quiet-storage-service/commit/ca4f8f9))
- Update app package CHANGELOG.md
  ([7400a89](https://github.com/TryQuiet/quiet-storage-service/commit/7400a89))

## <small>1.0.1-alpha.5 (2026-03-06)</small>

- Disconnect on errors and restart auth connection
  ([c311552](https://github.com/TryQuiet/quiet-storage-service/commit/c311552))
- Update app package CHANGELOG.md
  ([294df06](https://github.com/TryQuiet/quiet-storage-service/commit/294df06))

## <small>1.0.1-alpha.4 (2026-03-06)</small>

- Update app package CHANGELOG.md
  ([dc832aa](https://github.com/TryQuiet/quiet-storage-service/commit/dc832aa))
- Update auth
  ([efec742](https://github.com/TryQuiet/quiet-storage-service/commit/efec742))

## <small>1.0.1-alpha.3 (2026-03-05)</small>

- Update app package CHANGELOG.md
  ([36b198b](https://github.com/TryQuiet/quiet-storage-service/commit/36b198b))
- Update auth
  ([349a940](https://github.com/TryQuiet/quiet-storage-service/commit/349a940))

## <small>1.0.1-alpha.2 (2026-03-05)</small>

- Update app package CHANGELOG.md
  ([cdbb281](https://github.com/TryQuiet/quiet-storage-service/commit/cdbb281))
- Update auth.connection.ts
  ([1fd26a9](https://github.com/TryQuiet/quiet-storage-service/commit/1fd26a9))

## <small>1.0.1-alpha.1 (2026-03-05)</small>

- Update app package CHANGELOG.md
  ([0c7b1fb](https://github.com/TryQuiet/quiet-storage-service/commit/0c7b1fb))
- Update auth.connection.ts
  ([9a1885a](https://github.com/TryQuiet/quiet-storage-service/commit/9a1885a))

## <small>1.0.1-alpha.0 (2026-03-05)</small>

- Update app package CHANGELOG.md
  ([2e43e19](https://github.com/TryQuiet/quiet-storage-service/commit/2e43e19))
- Update auth module
  ([79ff912](https://github.com/TryQuiet/quiet-storage-service/commit/79ff912))

## 1.0.0 (2026-02-26)

- Feat/2806 log sync catchup (#19)
  ([0d6dd9d](https://github.com/TryQuiet/quiet-storage-service/commit/0d6dd9d)),
  closes [#19](https://github.com/TryQuiet/quiet-storage-service/issues/19)
- Push notifications via Firebase API (#21)
  ([f37766c](https://github.com/TryQuiet/quiet-storage-service/commit/f37766c)),
  closes [#21](https://github.com/TryQuiet/quiet-storage-service/issues/21)
- Update app package CHANGELOG.md
  ([6bd683d](https://github.com/TryQuiet/quiet-storage-service/commit/6bd683d))
- feat(3058): Update auth module to use lockbox/self-assign changes (#22)
  ([2aaf17e](https://github.com/TryQuiet/quiet-storage-service/commit/2aaf17e)),
  closes [#22](https://github.com/TryQuiet/quiet-storage-service/issues/22)

## 1.0.0-alpha.42 (2025-12-22)

- chore(deploys): Improve deploy/versioning automation (#18)
  ([166998c](https://github.com/TryQuiet/quiet-storage-service/commit/166998c)),
  closes [#18](https://github.com/TryQuiet/quiet-storage-service/issues/18)

## 1.0.0-alpha.41 (2025-12-12)

- Update handling of changelogs and publishing/deploys
  ([cc2ea16](https://github.com/TryQuiet/quiet-storage-service/commit/cc2ea16))

# quiet-storage-service

## unreleased

### Features

- Initial QSS setup ([#2757](https://github.com/TryQuiet/quiet/issues/2757))
- Setup sigchain/community storage
  ([#2758](https://github.com/TryQuiet/quiet/issues/2758))
- Add sigchain syncing via websocket
  ([#2759](https://github.com/TryQuiet/quiet/issues/2759))
- Setup OrbitDB log entry storage (e.g. messages)
  ([#2800](https://github.com/TryQuiet/quiet/issues/2800))
- Add OrbitDB log entry syncing from client to QSS
  ([#2804](https://github.com/TryQuiet/quiet/issues/2804))
- Reject adding a community with more than one user ("non-fresh" sigchains)
  ([#2906](https://github.com/TryQuiet/quiet/issues/2906))
- Add hcaptcha handler and require captcha verification for community creation
  on QSS ([#2908](https://github.com/TryQuiet/quiet/issues/2908))
- Limit usage of hcaptcha verification token to one community creation event
  ([#2908](https://github.com/TryQuiet/quiet/issues/2908))
- Fanout orbitdb log entries to connected clients on a given community
  ([#2805](https://github.com/TryQuiet/quiet/issues/2805))
- Restart service on deploy

# Staging enrollment for Quiet notification CI

Public staging keeps its live hCaptcha configuration. The separate CI token
path accepts GitHub Actions identities only when all of these conditions hold:

- `CI_ENROLLMENT_ENABLED=true`, `ENV=development`, and
  `QSS_HOSTNAME=qss-dev.quiet-services.app`.
- GitHub's RS256 signature verifies against its fixed public JWKS endpoint.
  Issuer, staging audience, expiry, activation time and token age are checked.
- Repository `TryQuiet/quiet`, repository ID `438267145` and owner ID `59660937` match.
- The workflow is `mobile-notification-e2e.yml` or `mobile-notification-ios.yml`
  under `.github/workflows/`, executing from `refs/heads/develop`.
- The event is `push` or `workflow_dispatch`. PR and PR-target events are rejected.

The workflow requests audience
`https://qss-dev.quiet-services.app/ci-enrollment` and passes the identity as
`quiet-ci-oidc:<JWT>` through the existing enrollment-token message. QSS does not
send this token to hCaptcha. Ordinary tokens still go to hCaptcha unchanged.
The public site-key response advertises whether CI enrollment is configured;
this response alone does not authorize enrollment.

One PostgreSQL row atomically reserves each repository/run/attempt/job identity.
Different JWTs, reconnects, concurrent requests and other QSS instances cannot
grant that job additional communities. The socket's grant expires after five
minutes, permits key provisioning for one team, and permits one create request
for that same team. Normal community authentication and push delivery still apply.
Repeating the acknowledgement for a verified token does not renew a consumed grant.
Failed enrollment consumes the grant; a new workflow attempt gets a new identity.

The reservation contains a hash of run identifiers, not the token. Reservations
expire after a day, longer than the maximum duration of the trusted notification
jobs and token lifetime. Expired reservations are removed when another valid CI
identity enrolls. This expiry does not delete communities. The Quiet harness
creates fresh `ci-notif-…` communities; server-side community retention is unchanged.

## Rollout

1. Review and merge the QSS change; build and run its database-backed tests.
2. Publish a **prerelease** containing this revision through the existing
   [staging release process](PUBLISHING.md#publish-an-alpha-to-staging).
   A full release also deploys production and is unnecessary here.
3. Apply `Migration20260921163000` through the normal deployment migration hook.
   The committed development configuration enables the feature; production
   does not enable it and is rejected even if the flag is set accidentally.
4. Verify staging health and that `get-captcha-site-key` still returns its live
   site key plus the CI capability. Missing schema or database failures deny grants.
5. Run Quiet's notification workflows from `develop` with `id-token: write`.
   A maintainer may supply a reviewed candidate ref to the trusted workflow.
   PR-triggered jobs continue using local onboarding without staging access.
6. Confirm both real provider notification/tap journeys pass on each platform.

No new shared secret is required. Firebase and AWS provider credentials stay on
QSS. Disabling `CI_ENROLLMENT_ENABLED` rejects new CI identities while preserving
normal hCaptcha enrollment; existing grants expire within five minutes.

Tests use real signatures and a local HTTP JWKS server, real PostgreSQL unique
constraints with concurrent requests, and real Socket.IO enrollment handlers.
They cover untrusted claims and signatures, expiry, replay, production rejection,
team binding, consumed grants, and the ordinary hCaptcha path.

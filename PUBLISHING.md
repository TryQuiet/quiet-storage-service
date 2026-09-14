# Publishing QSS

Publishing instructions for the core team. QSS has its own versions and releases;
publishing a [Quiet client release](https://github.com/TryQuiet/quiet/blob/develop/PUBLISHING.md)
does not deploy the server.

## Release Flow

1. Select the QSS source revision required by the Quiet client release.
1. Prepare a QSS alpha and deploy it to staging.
1. QA tests creation, joining, and messaging with the intended clients.
1. Merge fixes into the release branch and back into `main` as needed.
1. Publish the approved production release and verify both deployments.

The existing release workflows behave as follows:

| GitHub release event       | Workflow                                                                            | Destination                                                     |
| -------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Prerelease (`prereleased`) | [Deploy to EC2 (Development)](.github/workflows/deploy_dev.yml)                     | Staging: `wss://qss-dev.quiet-services.app`                     |
| Full release (`released`)  | Development **and** [Deploy to EC2 (Production)](.github/workflows/deploy_prod.yml) | Staging **and** production: `wss://qss-prod.quiet-services.app` |

**To publish new code to staging only, publish a prerelease. A full release also
deploys production.** Branch pushes and tags alone do not trigger these release
workflows. The release's event and checked-out workflow determine the destination;
a branch named `staging` does not select it.

To redeploy an existing version to staging, follow [Retrying a Deployment](#retrying-a-deployment)
instead of creating another version. These workflows do not have a
`workflow_dispatch` trigger. If a separate manual workflow is used, record its
exact source SHA, recursive submodule revisions, and target environment.

## Branching Rules

1. Use `main` as the integration branch. Start a release from the reviewed QSS
   revision intended for the client; do not substitute the latest `main` for a
   client's pinned server revision without checking compatibility.
1. Name new release branches after the QSS production version, such as `2.1.0`.
   Use that branch for `2.1.0-alpha.0`, subsequent alphas, and `2.1.0`. Keep the
   `v` prefix for Git tags, such as `v2.1.0`.
1. Freeze features once the release branch is cut. Apply release fixes there and
   merge or cherry-pick them back to `main`. Retain release branches for hotfixes.
1. Choose QSS versions using [semantic versioning](https://semver.org/). A breaking
   server/client protocol or data change calls for a major version; the QSS number
   does not need to match Quiet's number.

Legacy branches may use client version names. For example, `release/9.0.0`
contains the QSS source selected for Quiet 9.0.2; QSS 2.0.2 was published from
that branch. The QSS `2.0.2` branch preserves that release line. Its tip can be
newer than the release tag because `postpublish` adds a changelog commit.

Create a new branch at the **currently checked-out, reviewed commit** with:

```bash
git status --short
git rev-parse HEAD
git switch -c 2.1.0
git push --set-upstream origin 2.1.0
```

`2.1.0` is an example throughout this guide: choose an unused version. This
command preserves the current commit; it does not find or update the release
source for you.

### Legacy Slash-Named Branches

[lerna.json](lerna.json) currently configures `allowBranch: ["*"]`. Lerna's glob
matches `2.1.0` but does not match a slash in `release/9.0.0`, so publishing from
that legacy branch fails with `ENOTALLOWED`. This is a name-matching restriction,
not a compatibility check. Prefer the version-number convention above. If you
deliberately publish from a legacy branch, allow its exact name:

```bash
git branch --show-current
GH_TOKEN="$(gh auth token)" pnpm run publish 2.1.0-alpha.0 --allow-branch release/9.0.0
```

Use the branch you actually reviewed in place of `release/9.0.0`. There is no
need to broaden the repository's Lerna configuration to publish this way.

## Preparing the Release Checkout

1. Inspect the intended Quiet release's `3rd-party/qss` gitlink. From a Quiet
   checkout, for example:

   ```bash
   git ls-tree '@quiet/desktop@9.0.2' 3rd-party/qss
   ```

   Quiet 9.0.2 pins `78cfa2ca22e605dfdfdd23265af90ce1976b430f`. Use the pin as the
   source baseline and review any additional QSS release changes. A matching
   branch name in public and private repositories does not prove matching code.

1. Clone the QSS release line. For the existing 2.0.2 line:

   ```bash
   git clone --branch 2.0.2 --recurse-submodules \
     https://github.com/TryQuiet/quiet-storage-service.git qss-release
   cd qss-release
   ```

   If already cloned, initialize submodules separately:

   ```bash
   git fetch origin --tags
   git switch 2.0.2
   git submodule sync --recursive
   git submodule update --init --recursive
   ```

   Substitute the intended release line when deploying newer code. Do not add
   `--remote`: that advances submodules instead of using the pinned commits.

1. Check [package.json](package.json) for the selected revision's tool versions.
   The current release setup uses Node `22.14.0`, npm `10.9.2`, and pnpm `10.6.0`.
   Select Node with your version manager, then install the matching tools:

   ```bash
   npm install --global npm@10.9.2 pnpm@10.6.0
   hash -r
   node --version
   npm --version
   pnpm --version
   ```

   If using Volta, enable its pnpm support (`VOLTA_FEATURE_PNPM=1`) and use
   `volta install` for these versions instead. The checkout's `volta` and
   `packageManager` fields are the source of truth.

1. Bootstrap the pinned source:

   ```bash
   pnpm run bootstrap -vmc
   git status --short
   git submodule status --recursive
   ```

   `-v` enables verbose output, `-m` skips pulling newer submodule commits, and
   `-c` copies auth packages into the build workspace. Initialize submodules
   before running it. Plain `bootstrap` pulls submodules with `--remote`, so use
   `-vmc` for a release. Prefer a fresh release checkout: the bootstrapper does
   not refresh auth package copies that already exist.

1. Review and commit intended changes before publishing. Start with a clean
   checkout, including submodules. Lerna creates a release commit and tag; the
   `postpublish` script also runs `git add .` before committing the copied
   changelog. Do not leave unrelated work in this checkout.
1. Authenticate Git and `gh` with credentials that can push commits and tags
   and create GitHub releases. Branch-push permission alone is insufficient.
   `GH_TOKEN="$(gh auth token)"` in the examples uses the active `gh` login.

### pnpm Setup Problems

`ERR_PNPM_UNSUPPORTED_ENGINE` means the active version does not satisfy the
checkout. Install the pinned version, rather than `pnpm@latest`.

If `pnpm i -g pnpm` reports `ERR_PNPM_NO_GLOBAL_BIN_DIR`, the npm installation
command above avoids pnpm's global-bin setup. If another pnpm still wins in
`PATH`, this explicit-version wrapper also supplies the right version to nested
bootstrap commands:

```bash
npm exec --yes --package=pnpm@10.6.0 -- pnpm run bootstrap -vmc
```

It can wrap publishing too; use this **instead of**, not after, the corresponding
publish command:

```bash
GH_TOKEN="$(gh auth token)" npm exec --yes --package=pnpm@10.6.0 -- \
  pnpm run publish 2.1.0-alpha.0
```

## Checklist Before Alpha Release

- [ ] The client compatibility target and QSS source revision are recorded.
- [ ] The release branch and recursive submodules contain the reviewed source.
- [ ] Build, unit tests, and E2E tests pass; release notes are prepared.
- [ ] The chosen QSS version and tag are unused.
- [ ] The release is a prerelease, targeting staging only.

Use the same local test commands as CI after `bootstrap -vmc`. These use the
test Docker services and avoid the plain bootstrap performed by `test`:

```bash
pnpm run run:app spinup:tests:ci
pnpm run run:app test:ci
pnpm run run:app test:e2e:ci
pnpm run run:app spindown:tests
```

Run `spindown:tests` even if a test fails. Do not use `start:dev` or `start:prod`
to prepare local tests: they connect to deployed services.

## Preparing a Release Candidate (Alpha)

1. Complete the checkout and alpha checklist. Check existing versions with
   `gh release list --repo TryQuiet/quiet-storage-service` and `git tag --list`.
   Check `lerna.json` and `app/package.json`; the root package's version can be
   stale and is not the version extracted by deployment.
1. Publish an unused alpha version from its release branch:

   ```bash
   GH_TOKEN="$(gh auth token)" pnpm run publish 2.1.0-alpha.0
   ```

   Review Lerna's proposed versions and accept its confirmation. This versions
   packages, creates and pushes a commit and `v2.1.0-alpha.0` tag, and creates a
   GitHub prerelease. Review the generated release notes.

1. Confirm **Deploy to EC2 (Development)** starts in [QSS Actions](https://github.com/TryQuiet/quiet-storage-service/actions)
   for the intended tag and SHA. Verify the release is marked as a prerelease.
   GitHub does not emit `prereleased` when publishing a prerelease from a draft;
   see the [release event rules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release).
1. Wait for GitHub Actions and CodeDeploy to succeed, then perform the
   [functional checks](#verifying-a-deployment) against staging.
1. Record the deployed tag, SHA, submodule revisions, workflow run, and CodeDeploy
   ID. Notify QA with the client version to test.

## Checklist Before Production Release

- [ ] QA approved the alpha with the intended Quiet clients.
- [ ] Release fixes are on the release branch and carried back to `main`.
- [ ] Release notes describe any breaking protocol or data changes.
- [ ] Database migrations and rollback compatibility have been reviewed.
- [ ] The production deployment group's configuration supports its instance count.
- [ ] Both staging and production may be updated by this full release.

## Preparing a Production Release

1. Publish the approved full version from the prepared release branch:

   ```bash
   GH_TOKEN="$(gh auth token)" pnpm run publish 2.1.0
   ```

1. Watch **both** Development and Production runs in QSS Actions. A Development
   success notification says nothing about the Production run's status. Wait for
   both workflows and their CodeDeploy deployments to finish.
1. Verify both endpoints and record each deployment separately. Make the server
   upgrade available before publishing clients that require it.

Deployments run database migrations; they do not reset QSS data. Replacing EC2
instances does not clear persistent community data or keys. Treat a data reset
as a separate operation. Redeploying an older tag does not undo migrations or
guarantee that the old code can read the current data.

## What the Deployment Does

The [deployment action](.github/actions/deploy/action.yml) builds QSS, writes
`aws-environment.txt`, uploads an AMI setup script and release bundle to S3,
creates a CodeDeploy deployment, and waits for its result. AWS region is
`us-east-1`; the application is `QSS`. Production uses deployment group
`QSSInstancesProd`. Check the environment's workflow and AWS deployment group
for current settings; `CODE_DEPLOY_GROUP_NAME_DEV` and
`CODE_DEPLOY_GROUP_NAME_PROD` select different groups.

Archives include the application, version, workflow SHA and environment:
`QSS_<version>_<sha>_<environment>.zip`. This revision identifies what was sent
to AWS more reliably than a branch tip or a notification timestamp.

[appspec.yml](appspec.yml) installs under `/home/qss-user/qss`.
[AfterInstall](aws/scripts/after-install.sh) rebuilds the deployed package.
[ApplicationStart](aws/scripts/application-start.sh) reads the environment file,
runs that environment's migrations, and starts or restarts the `QSS` PM2 process.
Both hooks currently have 300-second limits. Inspect the failed lifecycle event
before changing a timeout or assuming the runner is stuck.

### HalfAtATime Versus OneAtATime

`CodeDeployDefault.HalfAtATime` updates at most half the instances, rounded
down. `CodeDeployDefault.OneAtATime` updates one instance and supports an
environment containing just one. Blue/green replacement installation uses these
same rules. See [AWS's deployment configuration rules](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-configurations.html).

| Instances in the environment being updated | HalfAtATime batch | OneAtATime batch |
| ------------------------------------------ | ----------------- | ---------------- |
| 1                                          | 0: cannot start   | 1                |
| 2                                          | 1                 | 1                |
| 3                                          | 1                 | 1                |
| 9                                          | 4                 | 1                |

On September 14, 2026, QSS 2.0.2 production deployment `d-NB6J8NHPL` provisioned
one replacement instance but failed before installation. `HalfAtATime` required
one healthy instance and left zero eligible for update. The old instance still
served traffic; installation events were skipped. This was a deployment
configuration problem, not an application build or migration failure.

For this single-replacement layout, select `CodeDeployDefault.OneAtATime` on
the production deployment group and retry the same revision. The subsequent
2.0.2 deployment, `d-KE12U3IPL`, succeeded, and fresh Quiet 9.0.2 clients passed
creation, joining and messaging without Tor. In-place deployment on a single
instance can interrupt service; blue/green retains the old environment while
preparing the replacement, with traffic routing controlled separately.

### Retrying a Deployment

1. Inspect the failed environment's workflow log and the CodeDeploy lifecycle
   events. Copy the complete ID, such as `d-NB6J8NHPL`, without table borders or
   truncation. `InvalidDeploymentIdException` can result from a malformed copy.
1. For the single-instance error above, open **CodeDeploy → Applications → QSS →
   Deployment groups → QSSInstancesProd → Edit**, select
   `CodeDeployDefault.OneAtATime`, and save. The checked-in action does not pass a
   deployment-configuration override, so a new deployment uses the group's default.
1. Open the existing GitHub Actions run for the intended environment and choose
   **Re-run failed jobs**. For a successful run that needs redeploying, choose
   **Re-run all jobs** in that environment's run. This retains the release's SHA
   and ref; it does not deploy the current tip of its branch.
1. Follow the new CodeDeploy ID through completion and repeat functional checks.

For staging-only redeployment, rerun **Deploy to EC2 (Development)**. For example,
the [2.0.2 Development run](https://github.com/TryQuiet/quiet-storage-service/actions/runs/34897416556)
can redeploy that existing staging release without rerunning Production. Do not
publish a full release just to retry staging.

[GitHub permits reruns for 30 days after the initial run](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).
For an older revision, prepare a reviewed manual workflow with that exact SHA
and environment, or publish a new approved version through the normal flow.

If copying a deployment in the AWS console instead, keep the intended S3 revision
and explicitly select the corrected deployment configuration. Changing the group
does not modify an already-created deployment.

Do not rerun `pnpm run publish` or increment versions solely to retry AWS. If
publishing itself stopped partway through, inspect Git history, tags and the
GitHub release first. A tag may already exist even when a later step failed.
Do not move published tags to different code.

### Finding Slow Steps and Deployment History

Separate GitHub queue time, build/upload time, and the **Wait for CodeDeploy To
Succeed** step. On the successful 2.0.2 production retry, runner wait was about
4 seconds, build 42 seconds, upload 34 seconds, and CodeDeploy wait 17 minutes
54 seconds. Staging's CodeDeploy wait was about 20 minutes. Those delays were
on the AWS side; the GitHub logs alone do not identify which AWS phase dominated.

Use the CodeDeploy console to distinguish replacement provisioning,
installation hooks, traffic routing and old-instance termination. With AWS
read access, these commands show deployment status and revision details:

```bash
aws deploy get-deployment --region us-east-1 --deployment-id d-KE12U3IPL
aws deploy list-deployment-instances --region us-east-1 --deployment-id d-KE12U3IPL
```

Use actual job/deployment start and completion times, the S3 revision and the
environment. GitHub's `updated_at` can change on an old failed run without a new
deployment. Manually dispatched deployments may not appear in the release
workflow's history; record them with the same revision information.

## Verifying a Deployment

1. Check the intended environment's health:

   ```bash
   curl -fsS https://qss-dev.quiet-services.app/health
   # For production verification:
   curl -fsS https://qss-prod.quiet-services.app/health
   ```

   Expect HTTP 200, `status: ok`, and PostgreSQL `up`. QSS's public WSS endpoint
   uses TLS on port 443. ICMP `ping` may receive no replies even when HTTPS and
   WebSocket connections work; it is not a QSS health test.

1. Use two fresh profiles in the intended Quiet release, pointing to this QSS
   endpoint. Complete the real CAPTCHA, create a community, join it from the
   second client, and send fresh messages in both directions.
1. Disable Tor networking for the test so fallback cannot hide a QSS failure.
   Stop one client, send another message, stop the sender, then restart the
   recipient and verify stored delivery with the sender still offline.
1. Check existing communities too when the release promises compatibility.
   A healthy database and a connected WebSocket do not prove registration or
   messaging works. Record the tested client version alongside the QSS revision.

Before QSS 2.0.2, production accepted CAPTCHA but returned server keys without
the `serverId` and `identityKeys` fields required by Quiet 9.0.2. The client
rejected the response before registering the community, retried CAPTCHA, and
joiners received `not found`. The 2.0.2 deployment supplied the required fields
and passed the full desktop flow. This is why checking only `/health` is
insufficient.

### Confirming the Exact Source, Including Submodules

Record this from the release checkout and retain it with the deployment record:

```bash
git rev-parse HEAD
git submodule status --recursive
git status --short
git submodule foreach --recursive 'git status --short'
```

Submodule status should have no leading `-` (uninitialized), `+` (wrong commit),
or `U` (conflict). Compare against the **tag or SHA recorded by the successful
deployment**, not a branch name or today's branch tip. For a local comparison:

```bash
git fetch origin --tags
git rev-parse 'v2.0.2^{commit}'
git diff --stat v2.0.2 HEAD
git diff --submodule=log v2.0.2 HEAD
```

Matching parent commits pins matching recursive source when all submodules are
initialized cleanly. If public/private histories differ, compare parent trees
and each changed submodule's contents recursively. Do not call builds identical
just because the top-level application diff is empty: auth code, migrations,
lockfiles, environment files and deployment scripts matter too.

## Post-release Checklist

- [ ] Both intended GitHub Actions and CodeDeploy deployments succeeded.
- [ ] Required Quiet clients passed functional checks against each endpoint.
- [ ] Tag, source SHA, recursive submodule revisions and deployment IDs are recorded.
- [ ] Release notes and any compatibility requirements are published.
- [ ] Release fixes are carried back to `main`; the release branch is retained.

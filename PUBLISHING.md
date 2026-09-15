# Publishing QSS

QSS is versioned and deployed separately from [Quiet](https://github.com/TryQuiet/quiet/blob/develop/PUBLISHING.md).
Examples below use the `3.0.0` release line; choose an unused version when publishing.

## Branches and Compatibility

- Use bare version numbers for release branches, such as `3.0.0`. Alphas and the
  production release share that branch. Git tags have a `v` prefix.
- Start from the reviewed QSS revision required by the intended Quiet release.
  Check Quiet's `3rd-party/qss` and `3rd-party/auth` pins; do not assume the latest
  `main` is compatible. Use a major QSS version for breaking changes.
- Freeze features once the branch is cut. Merge release fixes back into `main`
  through a PR, and retain the release branch for hotfixes.

| Quiet client | QSS release line | Auth protocol |
| ------------ | ---------------- | ------------- |
| 9.0.2        | 2.0.2            | 3             |
| 10.0.0       | 3.0.0            | 4             |

Protocol 4 does not migrate protocol-3 communities. Quiet 10 starts fresh
communities; upgrading an endpoint to protocol 4 prevents Quiet 9 clients from
authenticating there. Plan a separate endpoint if both generations must remain
supported. See the [auth compatibility policy](https://github.com/TryQuiet/auth/blob/6f534c89bceb875e8c71997943e5e76e48ccbd88/docs/protocol-4-removal-policy.md#compatibility).

To create a new release branch at the currently reviewed commit:

```bash
git switch -c 3.0.0
git push --set-upstream origin 3.0.0
```

Skip this if the branch already exists. Bare version names work with the current
Lerna branch rule; names containing `/` do not.

## Prepare the Checkout

Install the tool versions in [package.json](package.json) using the
[README setup instructions](README.md#preparation). Authenticate Git and `gh`
with credentials that can push commits and tags and create GitHub releases.

Prefer a fresh release checkout:

```bash
git clone --branch 3.0.0 https://github.com/TryQuiet/quiet-storage-service.git qss-release
cd qss-release
git submodule sync --recursive
git submodule update --init --recursive
pnpm run bootstrap -vmc
git status --short
```

For an existing clone, fetch and check out the chosen release branch before the
submodule commands. Do not add `--remote`: use the pinned commits. Bootstrap's
`-vmc` enables verbose output, skips submodule pulls, and copies auth packages.
Previously copied auth packages are not refreshed automatically; use a fresh
checkout when changing auth revisions.

## Before Publishing

- [ ] The QSS and auth revisions are compatible with the intended Quiet clients.
- [ ] Build and [tests](README.md#test) pass; release notes describe breaking changes.
- [ ] Working tree and submodules are clean. The publish scripts stage changes,
      create commits and tags, and push them.
- [ ] The version is unused: check GitHub releases, Git tags, `lerna.json`, and
      `app/package.json`. The root package version can be stale.
- [ ] For production: QA approved the alpha, and data compatibility and migrations
      have been reviewed. Deployment does not reset data or provide an auth migration.

## Publish an Alpha to Staging

```bash
GH_TOKEN="$(gh auth token)" pnpm run publish 3.0.0-alpha.0
```

Review Lerna's version confirmation. It creates the release commit, tag, and
GitHub prerelease. Confirm **Deploy to EC2 (Development)** starts for the intended
tag and SHA in [QSS Actions](https://github.com/TryQuiet/quiet-storage-service/actions).
Wait for deployment success, then verify staging before handing the alpha to QA.

## Publish to Production

After QA approval, publish from the same release branch:

```bash
GH_TOKEN="$(gh auth token)" pnpm run publish 3.0.0
```

**A full release deploys both staging and production.** Wait for both workflows;
a Development success notification does not confirm Production succeeded.

| GitHub release event        | Workflow                                        | Endpoint                            |
| --------------------------- | ----------------------------------------------- | ----------------------------------- |
| `prereleased` or `released` | [Development](.github/workflows/deploy_dev.yml) | `wss://qss-dev.quiet-services.app`  |
| `released`                  | [Production](.github/workflows/deploy_prod.yml) | `wss://qss-prod.quiet-services.app` |

Branch pushes and tags alone do not deploy. For staging only, publish a prerelease
or rerun its Development workflow. See the [deployment action](.github/actions/deploy/action.yml)
and [CodeDeploy hooks](appspec.yml) for the AWS implementation.

## Verify and Finish

Check the intended endpoint; expect HTTP 200, `status: ok`, and PostgreSQL `up`:

```bash
curl -fsS https://qss-dev.quiet-services.app/health
# For production:
curl -fsS https://qss-prod.quiet-services.app/health
```

- [ ] GitHub Actions and AWS CodeDeploy succeeded for each intended environment.
- [ ] Two fresh profiles of the intended Quiet client pass CAPTCHA, community
      creation, joining, and messages in both directions with Tor networking disabled.
- [ ] Stored delivery works: stop the recipient, send a message, stop the sender,
      restart the recipient, and confirm receipt. Test existing communities when
      compatibility is promised. `/health` alone does not verify these operations.
- [ ] Record the client version, QSS tag/SHA, recursive submodule revisions,
      workflow run and CodeDeploy ID. Verify these against the deployed revision.
- [ ] Merge the release branch back into `main` through a PR, including the
      version and changelog commits added by publishing. Retain the release branch.

## Retry a Deployment

1. Open the failed environment's workflow and inspect its CodeDeploy deployment
   and lifecycle events in AWS (`us-east-1`, application `QSS`). A long **Wait for
   CodeDeploy To Succeed** step is waiting on AWS; inspect the lifecycle events
   to identify provisioning, installation, or traffic-routing delays.
1. For a single replacement instance, use `CodeDeployDefault.OneAtATime`.
   `HalfAtATime` rounds its update batch down to zero, so installation cannot
   start. This caused the initial QSS 2.0.2 production failure. Change the
   affected deployment group's configuration before retrying; see [AWS's rules](https://docs.aws.amazon.com/codedeploy/latest/userguide/deployment-configurations.html).
1. In the existing GitHub Actions run, choose **Re-run failed jobs**, or **Re-run
   all jobs** to redeploy a successful run. This uses the original SHA and tag.
   Select **Development** for staging only. Do not publish another version just
   to retry a deployment.
1. Follow the new CodeDeploy ID and repeat verification. If copying a deployment
   in AWS instead, retain the intended revision and select the corrected
   deployment configuration explicitly.

GitHub permits reruns for [30 days](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).
The checked-in release workflows have no manual trigger. For an older revision,
use a reviewed manual workflow or publish a new approved version. Redeploying
older code does not undo migrations or guarantee data compatibility.

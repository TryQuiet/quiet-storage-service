#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$script_dir/migrate-actions-secrets-to-organization.sh"
workflow="$script_dir/../workflows/migrate-actions-secrets-to-organization.yml"
test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT

mkdir -p "$test_dir/bin" "$test_dir/uploads"

cat >"$test_dir/bin/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

[[ "$1" == secret && "$2" == set ]]
secret_name="$3"
shift 3
printf '%s %s\n' "$secret_name" "$*" >>"$MIGRATION_TEST_CALLS"
cp /dev/stdin "$MIGRATION_TEST_UPLOADS/$secret_name"
EOF
chmod +x "$test_dir/bin/gh"

secret_names=(
  CODE_DEPLOY_APPLICATION_NAME
  CODE_DEPLOY_GROUP_NAME_DEV
  CODE_DEPLOY_GROUP_NAME_DEV_TEST
  CODE_DEPLOY_GROUP_NAME_PROD
  QSS_S3_CODE_DEPLOY_BUCKET
  S3_BUCKET_NAME
)

for secret_name in "${secret_names[@]}"; do
  export "$secret_name=value-for-$secret_name"
done

export GH_TOKEN=short-lived-upload-token
export MIGRATION_SOURCE_AWS_ACCESS_KEY_ID=qss-aws-access-key
export MIGRATION_SOURCE_AWS_SECRET_ACCESS_KEY=qss-aws-secret-key
export MIGRATION_ORGANIZATION=TryQuiet
export MIGRATION_REPOSITORIES=quiet-storage-service,quiet-storage-service-private
export MIGRATION_TEST_CALLS="$test_dir/calls"
export MIGRATION_TEST_UPLOADS="$test_dir/uploads"
export PATH="$test_dir/bin:$PATH"

"$script"

[[ "$(wc -l <"$MIGRATION_TEST_CALLS")" -eq 8 ]]
grep -Fxq 'QSS_AWS_ACCESS_KEY_ID --org TryQuiet --repos quiet-storage-service,quiet-storage-service-private --app actions' "$MIGRATION_TEST_CALLS"
grep -Fxq 'QSS_AWS_SECRET_ACCESS_KEY --org TryQuiet --repos quiet-storage-service,quiet-storage-service-private --app actions' "$MIGRATION_TEST_CALLS"
grep -Fxq 'S3_BUCKET_NAME --org TryQuiet --repos quiet-storage-service,quiet-storage-service-private --app actions' "$MIGRATION_TEST_CALLS"
[[ "$(<"$MIGRATION_TEST_UPLOADS/QSS_AWS_ACCESS_KEY_ID")" == qss-aws-access-key ]]
[[ "$(<"$MIGRATION_TEST_UPLOADS/QSS_AWS_SECRET_ACCESS_KEY")" == qss-aws-secret-key ]]
[[ ! -e "$MIGRATION_TEST_UPLOADS/AWS_ACCESS_KEY_ID" ]]
[[ ! -e "$MIGRATION_TEST_UPLOADS/AWS_SECRET_ACCESS_KEY" ]]
[[ ! -e "$MIGRATION_TEST_UPLOADS/ORG_SECRETS_MIGRATION_TOKEN" ]]

printf '%s\n' "${secret_names[@]}" AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY |
  sort >"$test_dir/expected-source-secrets"
sed -nE 's/^      [A-Z0-9_]+: \$\{\{ secrets\.([A-Z0-9_]+) \}\}$/\1/p' "$workflow" |
  sort >"$test_dir/workflow-source-secrets"
cmp "$test_dir/expected-source-secrets" "$test_dir/workflow-source-secrets"
grep -Fxq '      MIGRATION_ORGANIZATION: TryQuiet' "$workflow"
grep -Fxq '      MIGRATION_REPOSITORIES: quiet-storage-service,quiet-storage-service-private' "$workflow"
if grep -Eq 'inputs\.(organization|repositories)' "$workflow"; then
  echo 'Workflow target scope must not be configurable at run time' >&2
  exit 1
fi

rm -f "$MIGRATION_TEST_CALLS"
rm -rf "$MIGRATION_TEST_UPLOADS"
mkdir -p "$MIGRATION_TEST_UPLOADS"
unset CODE_DEPLOY_APPLICATION_NAME

if "$script" >"$test_dir/missing-secret.stdout" 2>"$test_dir/missing-secret.stderr"; then
  echo 'Expected migration to fail when a source secret is missing' >&2
  exit 1
fi

grep -Fq 'Source secrets are missing or empty: CODE_DEPLOY_APPLICATION_NAME' "$test_dir/missing-secret.stderr"
[[ ! -e "$MIGRATION_TEST_CALLS" ]]
[[ -z "$(find "$MIGRATION_TEST_UPLOADS" -type f -print -quit)" ]]

echo 'QSS secret migration tests passed'

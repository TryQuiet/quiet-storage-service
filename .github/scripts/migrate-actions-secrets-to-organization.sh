#!/usr/bin/env bash

set -euo pipefail

organization="${MIGRATION_ORGANIZATION:?MIGRATION_ORGANIZATION is required}"
repositories="${MIGRATION_REPOSITORIES:?MIGRATION_REPOSITORIES is required}"
: "${GH_TOKEN:?ORG_SECRETS_MIGRATION_TOKEN must be available through GH_TOKEN}"

if ! command -v gh >/dev/null 2>&1; then
  echo "::error::The GitHub CLI is required" >&2
  exit 1
fi

secret_mappings=(
  QSS_AWS_ACCESS_KEY_ID:MIGRATION_SOURCE_AWS_ACCESS_KEY_ID
  QSS_AWS_SECRET_ACCESS_KEY:MIGRATION_SOURCE_AWS_SECRET_ACCESS_KEY
  CODE_DEPLOY_APPLICATION_NAME:CODE_DEPLOY_APPLICATION_NAME
  CODE_DEPLOY_GROUP_NAME_DEV:CODE_DEPLOY_GROUP_NAME_DEV
  CODE_DEPLOY_GROUP_NAME_DEV_TEST:CODE_DEPLOY_GROUP_NAME_DEV_TEST
  CODE_DEPLOY_GROUP_NAME_PROD:CODE_DEPLOY_GROUP_NAME_PROD
  QSS_S3_CODE_DEPLOY_BUCKET:QSS_S3_CODE_DEPLOY_BUCKET
  S3_BUCKET_NAME:S3_BUCKET_NAME
)

missing_secrets=()
for mapping in "${secret_mappings[@]}"; do
  environment_name="${mapping#*:}"
  if [[ -z "${!environment_name-}" ]]; then
    missing_secrets+=("${mapping%%:*}")
  fi
done

if (( ${#missing_secrets[@]} > 0 )); then
  printf '::error::Source secrets are missing or empty: %s\n' "${missing_secrets[*]}" >&2
  exit 1
fi

for mapping in "${secret_mappings[@]}"; do
  secret_name="${mapping%%:*}"
  environment_name="${mapping#*:}"

  echo "Migrating $secret_name"
  printf '%s' "${!environment_name}" |
    gh secret set "$secret_name" \
      --org "$organization" \
      --repos "$repositories" \
      --app actions
done

echo "Migrated ${#secret_mappings[@]} secrets to $organization for: $repositories"

#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
workflow_dir="$script_dir/../workflows"
workflows=(
  "$workflow_dir/deploy_dev.yml"
  "$workflow_dir/deploy_prod.yml"
)

if grep -E 'secrets\.AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)' "${workflows[@]}"; then
  echo 'A QSS deployment still references an unscoped AWS organization secret name' >&2
  exit 1
fi

for workflow in "${workflows[@]}"; do
  [[ "$(grep -Fc 'secrets.QSS_AWS_ACCESS_KEY_ID' "$workflow")" -eq 1 ]]
  [[ "$(grep -Fc 'secrets.QSS_AWS_SECRET_ACCESS_KEY' "$workflow")" -eq 1 ]]
done

echo 'QSS deployment organization-secret scope test passed'

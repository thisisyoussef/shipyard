#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
app_root="${repo_root}/shipyard"

max_attempts="${RAILWAY_DEPLOY_MAX_ATTEMPTS:-3}"
base_retry_delay_seconds="${RAILWAY_DEPLOY_RETRY_DELAY_SECONDS:-15}"
transient_failure_pattern='DEADLINE_EXCEEDED|failed to pull/unpack image|failed to resolve reference|i/o timeout|dial tcp'
post_build_failure_pattern='Build time:|built in [0-9]'

cd "${app_root}"

run_deploy_attempt() {
  local attempt="$1"
  local log_file="$2"

  echo "Starting Railway deploy attempt ${attempt}/${max_attempts}..."

  set +e
  railway up . \
    --path-as-root \
    --ci \
    --verbose \
    --project "${RAILWAY_PROJECT_ID}" \
    --environment "${RAILWAY_ENVIRONMENT_ID}" \
    --service "${RAILWAY_SERVICE_ID}" \
    --message "GitHub Actions deploy ${GITHUB_SHA:-manual}" \
    2>&1 | tee "${log_file}"
  local exit_code=${PIPESTATUS[0]}
  set -e

  return "${exit_code}"
}

should_retry_failed_deploy() {
  local log_file="$1"

  if grep -Eiq "${transient_failure_pattern}" "${log_file}"; then
    return 0
  fi

  if grep -Eq "${post_build_failure_pattern}" "${log_file}"; then
    return 0
  fi

  return 1
}

attempt=1
while [ "${attempt}" -le "${max_attempts}" ]; do
  log_file="$(mktemp)"

  if run_deploy_attempt "${attempt}" "${log_file}"; then
    echo "Railway deploy succeeded on attempt ${attempt}/${max_attempts}."
    rm -f "${log_file}"
    exit 0
  else
    exit_code=$?
  fi

  if [ "${attempt}" -ge "${max_attempts}" ]; then
    echo "Railway deploy failed after ${attempt} attempt(s)." >&2
    rm -f "${log_file}"
    exit "${exit_code}"
  fi

  if ! should_retry_failed_deploy "${log_file}"; then
    echo "Railway deploy failed before a retriable post-build handoff; not retrying." >&2
    rm -f "${log_file}"
    exit "${exit_code}"
  fi

  retry_delay_seconds=$((base_retry_delay_seconds * attempt))
  echo "Railway deploy failed after a completed build or known transient handoff error. Retrying in ${retry_delay_seconds}s..." >&2
  rm -f "${log_file}"
  sleep "${retry_delay_seconds}"
  attempt=$((attempt + 1))
done

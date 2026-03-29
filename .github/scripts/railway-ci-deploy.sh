#!/usr/bin/env bash

set -euo pipefail

required_env_vars=(
  RAILWAY_SERVICE_ID
  RAILWAY_ENVIRONMENT_ID
  RAILWAY_IMAGE_REF
)

for required_env_var in "${required_env_vars[@]}"; do
  if [ -z "${!required_env_var:-}" ]; then
    echo "Missing required environment variable: ${required_env_var}" >&2
    exit 1
  fi
done

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for Railway deploy polling." >&2
  exit 1
fi

if ! command -v python >/dev/null 2>&1; then
  echo "python is required for Railway environment config updates." >&2
  exit 1
fi

deploy_wait_seconds="${RAILWAY_DEPLOY_WAIT_SECONDS:-600}"
deploy_poll_seconds="${RAILWAY_DEPLOY_POLL_SECONDS:-10}"
max_attempts="${RAILWAY_DEPLOY_MAX_ATTEMPTS:-3}"
base_retry_delay_seconds="${RAILWAY_DEPLOY_RETRY_DELAY_SECONDS:-15}"
transient_failure_pattern='DEADLINE_EXCEEDED|failed to pull/unpack image|failed to resolve reference|i/o timeout|dial tcp|Failed to create deployment\.'
log_fetch_attempts="${RAILWAY_DEPLOY_LOG_FETCH_ATTEMPTS:-5}"
log_fetch_delay_seconds="${RAILWAY_DEPLOY_LOG_FETCH_DELAY_SECONDS:-3}"

load_service_status() {
  railway service status \
    --json \
    --service "${RAILWAY_SERVICE_ID}" \
    --environment "${RAILWAY_ENVIRONMENT_ID}"
}

apply_image_config() {
  railway environment config \
    --environment "${RAILWAY_ENVIRONMENT_ID}" \
    --json |
    python -c '
import json
import sys

service_id = sys.argv[1]
image_ref = sys.argv[2]

config = json.load(sys.stdin)
services = config.setdefault("services", {})
service_config = services.setdefault(service_id, {})

service_config["source"] = {
    "image": image_ref,
}

deploy_config = service_config.setdefault("deploy", {})
deploy_config["startCommand"] = "node --env-file-if-exists=.env ./dist/bin/shipyard.js --ui"
deploy_config["healthcheckPath"] = "/api/health"
deploy_config["restartPolicyType"] = "ON_FAILURE"
deploy_config["restartPolicyMaxRetries"] = 10

json.dump(config, sys.stdout)
' "${RAILWAY_SERVICE_ID}" "${RAILWAY_IMAGE_REF}" |
    railway environment edit \
      --environment "${RAILWAY_ENVIRONMENT_ID}" \
      --message "GitHub Actions deploy ${GITHUB_SHA:-manual}" \
      --json
}

collect_failure_logs() {
  local deployment_id="$1"
  local deploy_log_path="$2"
  local build_log_path="$3"
  local fetch_attempt=1

  while [ "${fetch_attempt}" -le "${log_fetch_attempts}" ]; do
    : > "${deploy_log_path}"
    : > "${build_log_path}"

    railway logs "${deployment_id}" \
      --deployment \
      --lines 200 \
      --service "${RAILWAY_SERVICE_ID}" \
      --environment "${RAILWAY_ENVIRONMENT_ID}" |
      tee "${deploy_log_path}" >&2 || true

    railway logs "${deployment_id}" \
      --build \
      --lines 200 \
      --service "${RAILWAY_SERVICE_ID}" \
      --environment "${RAILWAY_ENVIRONMENT_ID}" |
      tee "${build_log_path}" >&2 || true

    if should_retry_failure "${deploy_log_path}" "${build_log_path}"; then
      break
    fi

    if [ "${fetch_attempt}" -lt "${log_fetch_attempts}" ]; then
      sleep "${log_fetch_delay_seconds}"
    fi

    fetch_attempt=$((fetch_attempt + 1))
  done
}

should_retry_failure() {
  local deploy_log_path="$1"
  local build_log_path="$2"

  grep -Eiq "${transient_failure_pattern}" "${deploy_log_path}" "${build_log_path}"
}

echo "Switching Railway service ${RAILWAY_SERVICE_ID} to image ${RAILWAY_IMAGE_REF}..."

attempt=1
while [ "${attempt}" -le "${max_attempts}" ]; do
  status_json="$(load_service_status)"
  previous_deployment_id="$(
    printf '%s' "${status_json}" | jq -r '.deploymentId // empty'
  )"

  apply_image_config

  deadline_seconds=$((SECONDS + deploy_wait_seconds))

  while [ "${SECONDS}" -lt "${deadline_seconds}" ]; do
    status_json="$(load_service_status)"
    current_deployment_id="$(
      printf '%s' "${status_json}" | jq -r '.deploymentId // empty'
    )"
    current_status="$(
      printf '%s' "${status_json}" | jq -r '.status // empty'
    )"

    echo "Railway status: ${current_status:-unknown} (${current_deployment_id:-none})"

    if [ -n "${current_deployment_id}" ] &&
      [ "${current_deployment_id}" != "${previous_deployment_id}" ]; then
      case "${current_status}" in
        SUCCESS)
          echo "Railway image deployment succeeded: ${current_deployment_id}"
          exit 0
          ;;
        FAILED|CRASHED|REMOVED)
          echo "Railway image deployment failed: ${current_deployment_id}" >&2
          deploy_log_path="$(mktemp)"
          build_log_path="$(mktemp)"
          collect_failure_logs "${current_deployment_id}" "${deploy_log_path}" "${build_log_path}"

          if [ "${attempt}" -lt "${max_attempts}" ] &&
            should_retry_failure "${deploy_log_path}" "${build_log_path}"; then
            retry_delay_seconds=$((base_retry_delay_seconds * attempt))
            echo "Railway deploy hit a transient image handoff failure. Retrying in ${retry_delay_seconds}s..." >&2
            rm -f "${deploy_log_path}" "${build_log_path}"
            sleep "${retry_delay_seconds}"
            attempt=$((attempt + 1))
            break
          fi

          rm -f "${deploy_log_path}" "${build_log_path}"
          exit 1
          ;;
      esac
    fi

    sleep "${deploy_poll_seconds}"
  done

  if [ "${attempt}" -gt "${max_attempts}" ]; then
    break
  fi

  if [ "${SECONDS}" -lt "${deadline_seconds}" ]; then
    continue
  fi

  echo "Timed out waiting for Railway to report a fresh deployment for ${RAILWAY_IMAGE_REF}." >&2

  latest_status_json="$(load_service_status)"
  latest_deployment_id="$(
    printf '%s' "${latest_status_json}" | jq -r '.deploymentId // empty'
  )"

  if [ -n "${latest_deployment_id}" ]; then
    deploy_log_path="$(mktemp)"
    build_log_path="$(mktemp)"
    collect_failure_logs "${latest_deployment_id}" "${deploy_log_path}" "${build_log_path}"

    if [ "${attempt}" -lt "${max_attempts}" ] &&
      should_retry_failure "${deploy_log_path}" "${build_log_path}"; then
      retry_delay_seconds=$((base_retry_delay_seconds * attempt))
      echo "Railway deploy timed out after a transient image handoff failure. Retrying in ${retry_delay_seconds}s..." >&2
      rm -f "${deploy_log_path}" "${build_log_path}"
      sleep "${retry_delay_seconds}"
      attempt=$((attempt + 1))
      continue
    fi

    rm -f "${deploy_log_path}" "${build_log_path}"
  fi

  exit 1
done

exit 1

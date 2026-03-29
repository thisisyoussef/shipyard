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

load_service_status() {
  railway service status \
    --json \
    --service "${RAILWAY_SERVICE_ID}" \
    --environment "${RAILWAY_ENVIRONMENT_ID}"
}

status_json="$(load_service_status)"
previous_deployment_id="$(
  printf '%s' "${status_json}" | jq -r '.deploymentId // empty'
)"

echo "Switching Railway service ${RAILWAY_SERVICE_ID} to image ${RAILWAY_IMAGE_REF}..."

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
        railway logs "${current_deployment_id}" \
          --deployment \
          --lines 200 \
          --service "${RAILWAY_SERVICE_ID}" \
          --environment "${RAILWAY_ENVIRONMENT_ID}" || true
        exit 1
        ;;
    esac
  fi

  sleep "${deploy_poll_seconds}"
done

echo "Timed out waiting for Railway to report a fresh deployment for ${RAILWAY_IMAGE_REF}." >&2

latest_status_json="$(load_service_status)"
latest_deployment_id="$(
  printf '%s' "${latest_status_json}" | jq -r '.deploymentId // empty'
)"

if [ -n "${latest_deployment_id}" ]; then
  railway logs "${latest_deployment_id}" \
    --deployment \
    --lines 200 \
    --service "${RAILWAY_SERVICE_ID}" \
    --environment "${RAILWAY_ENVIRONMENT_ID}" || true
fi

exit 1

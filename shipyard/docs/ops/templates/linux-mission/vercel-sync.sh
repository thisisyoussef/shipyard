#!/usr/bin/env bash
set -euo pipefail

: "${TARGET_DIR:?TARGET_DIR must be set in /etc/shipyard/shipyard.env}"
: "${VERCEL_TOKEN:?VERCEL_TOKEN must be set in /etc/shipyard/shipyard.env}"

TARGET_BUILD_COMMAND="${TARGET_BUILD_COMMAND:-npm run build}"
TARGET_BUILD_FALLBACK_COMMAND="${TARGET_BUILD_FALLBACK_COMMAND:-}"
TARGET_OUTPUT_DIR="${TARGET_OUTPUT_DIR:-dist}"
VERCEL_SYNC_STATE_DIR="${VERCEL_SYNC_STATE_DIR:-${TARGET_DIR}/.shipyard/vercel-sync}"

log() {
  printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "${VERCEL_SYNC_STATE_DIR}/vercel-sync.log"
}

ensure_vercel_link() {
  if [[ -n "${VERCEL_ORG_ID:-}" && -n "${VERCEL_PROJECT_ID:-}" ]]; then
    mkdir -p "${TARGET_DIR}/.vercel"
    cat > "${TARGET_DIR}/.vercel/project.json" <<EOF
{"orgId":"${VERCEL_ORG_ID}","projectId":"${VERCEL_PROJECT_ID}"}
EOF
  fi
}

run_build() {
  log "Running build command: ${TARGET_BUILD_COMMAND}"
  if bash -lc "cd '${TARGET_DIR}' && ${TARGET_BUILD_COMMAND}"; then
    return 0
  fi

  if [[ -z "${TARGET_BUILD_FALLBACK_COMMAND}" ]]; then
    return 1
  fi

  log "Primary build failed. Running fallback: ${TARGET_BUILD_FALLBACK_COMMAND}"
  bash -lc "cd '${TARGET_DIR}' && ${TARGET_BUILD_FALLBACK_COMMAND}"
}

resolve_output_path() {
  if [[ "${TARGET_OUTPUT_DIR}" = /* ]]; then
    printf '%s\n' "${TARGET_OUTPUT_DIR}"
  else
    printf '%s\n' "${TARGET_DIR}/${TARGET_OUTPUT_DIR}"
  fi
}

main() {
  mkdir -p "${VERCEL_SYNC_STATE_DIR}"
  ensure_vercel_link
  run_build

  local output_path
  output_path="$(resolve_output_path)"

  if [[ ! -d "${output_path}" ]]; then
    log "Output directory not found: ${output_path}"
    exit 1
  fi

  log "Deploying ${output_path} to Vercel."

  local deploy_output
  if ! deploy_output="$(bash -lc "cd '${TARGET_DIR}' && npx vercel deploy '${output_path}' --prod --yes --token '${VERCEL_TOKEN}'" 2>&1)"; then
    printf '%s\n' "${deploy_output}" > "${VERCEL_SYNC_STATE_DIR}/last-deploy-output.log"
    log "Vercel deploy failed."
    exit 1
  fi

  printf '%s\n' "${deploy_output}" > "${VERCEL_SYNC_STATE_DIR}/last-deploy-output.log"

  local deployment_candidate=""
  deployment_candidate="$(printf '%s\n' "${deploy_output}" | awk 'NF { last = $0 } END { print last }')"

  printf '%s\n' "${deployment_candidate}" > "${VERCEL_SYNC_STATE_DIR}/latest-deploy.txt"
  log "Vercel deploy completed: ${deployment_candidate}"
}

main "$@"

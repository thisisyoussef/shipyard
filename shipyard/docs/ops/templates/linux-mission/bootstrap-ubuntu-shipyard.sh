#!/usr/bin/env bash
set -euo pipefail

SHIPYARD_USER="${SHIPYARD_USER:-shipyard}"
SHIPYARD_REPO_URL="${SHIPYARD_REPO_URL:-https://github.com/thisisyoussef/shipyard.git}"
SHIPYARD_REPO_DIR="${SHIPYARD_REPO_DIR:-/srv/shipyard}"
SHIPYARD_WORKSPACE_DIR="${SHIPYARD_WORKSPACE_DIR:-/srv/workspace}"
SHIPYARD_BRANCH="${SHIPYARD_BRANCH:-main}"
NODE_MAJOR="${NODE_MAJOR:-22}"
INSTALL_PLAYWRIGHT_DEPS="${INSTALL_PLAYWRIGHT_DEPS:-0}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git gnupg rsync unzip build-essential caddy

if ! command -v node >/dev/null 2>&1 || ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit((major > 20 || (major === 20 && minor >= 19)) ? 0 : 1)'; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

corepack enable
corepack prepare pnpm@10.33.0 --activate

if ! id -u "${SHIPYARD_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${SHIPYARD_USER}"
fi

install -d -o "${SHIPYARD_USER}" -g "${SHIPYARD_USER}" "${SHIPYARD_REPO_DIR}" "${SHIPYARD_WORKSPACE_DIR}"
install -d -m 0750 /etc/shipyard

if [[ -d "${SHIPYARD_REPO_DIR}/.git" ]]; then
  runuser -u "${SHIPYARD_USER}" -- git -C "${SHIPYARD_REPO_DIR}" fetch --all --prune
  runuser -u "${SHIPYARD_USER}" -- git -C "${SHIPYARD_REPO_DIR}" switch "${SHIPYARD_BRANCH}"
  runuser -u "${SHIPYARD_USER}" -- git -C "${SHIPYARD_REPO_DIR}" pull --ff-only
elif [[ -z "$(find "${SHIPYARD_REPO_DIR}" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
  runuser -u "${SHIPYARD_USER}" -- git clone --branch "${SHIPYARD_BRANCH}" "${SHIPYARD_REPO_URL}" "${SHIPYARD_REPO_DIR}"
else
  echo "${SHIPYARD_REPO_DIR} exists but is not an empty git checkout."
  exit 1
fi

runuser -u "${SHIPYARD_USER}" -- bash -lc "cd '${SHIPYARD_REPO_DIR}/shipyard' && corepack pnpm install --frozen-lockfile && corepack pnpm build"

if [[ "${INSTALL_PLAYWRIGHT_DEPS}" == "1" ]]; then
  cd "${SHIPYARD_REPO_DIR}/shipyard"
  npx playwright install --with-deps chromium
fi

cat <<EOF
Bootstrap complete.

Repo checkout: ${SHIPYARD_REPO_DIR}
App working dir: ${SHIPYARD_REPO_DIR}/shipyard
Targets dir: ${SHIPYARD_WORKSPACE_DIR}
Next step: copy your target into ${SHIPYARD_WORKSPACE_DIR} and fill /etc/shipyard/shipyard.env.
EOF

#!/usr/bin/env bash
#
# One-shot provisioning for Secret Santa on Fedora (systemd + dnf).
# Run as root:   sudo bash deploy/setup.sh
# Idempotent-ish: re-run to update code and refresh services.
set -euo pipefail

APP_USER="secretsanta"
APP_HOME="/opt/secretsanta"
APP_DIR="${APP_HOME}/app"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $EUID -ne 0 ]]; then echo "Please run as root:  sudo bash deploy/setup.sh" >&2; exit 1; fi

echo "==> Installing packages"
dnf install -y nodejs gcc-c++ make python3 sqlite rsync

echo "==> Ensuring service user '${APP_USER}'"
id -u "${APP_USER}" &>/dev/null || useradd -r -m -d "${APP_HOME}" "${APP_USER}"

echo "==> Deploying code from ${SRC_DIR} to ${APP_DIR}"
mkdir -p "${APP_DIR}"
rsync -a --delete --exclude '.git' --exclude 'node_modules' --exclude '.env' \
  --exclude 'data.db*' --exclude 'backups' "${SRC_DIR}/" "${APP_DIR}/"
chown -R "${APP_USER}:${APP_USER}" "${APP_HOME}"

echo "==> Installing dependencies and building CSS"
cd "${APP_DIR}"
sudo -u "${APP_USER}" npm ci || sudo -u "${APP_USER}" npm install
sudo -u "${APP_USER}" npm run css:build

if [[ ! -f "${APP_DIR}/.env" ]]; then
  sudo -u "${APP_USER}" cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  NEW_ENV=1
fi

echo "==> Installing systemd units"
install -m0644 deploy/secretsanta.service        /etc/systemd/system/secretsanta.service
install -m0644 deploy/secretsanta-purge.service  /etc/systemd/system/secretsanta-purge.service
install -m0644 deploy/secretsanta-purge.timer    /etc/systemd/system/secretsanta-purge.timer
install -m0644 deploy/secretsanta-backup.service /etc/systemd/system/secretsanta-backup.service
install -m0644 deploy/secretsanta-backup.timer   /etc/systemd/system/secretsanta-backup.timer
systemctl daemon-reload
systemctl enable --now secretsanta-purge.timer secretsanta-backup.timer

if [[ "${NEW_ENV:-0}" == "1" ]]; then
  echo
  echo "  ⚠  Edit ${APP_DIR}/.env (ADMIN_EMAIL, SECRET, BASE_URL, APP_TZ, CF_ACCESS_*, RESEND_API_KEY),"
  echo "     then:  systemctl enable --now secretsanta"
else
  systemctl enable --now secretsanta
  systemctl restart secretsanta
fi

echo
echo "==> Done.  Status: systemctl status secretsanta --no-pager   Logs: journalctl -u secretsanta -f"
echo "    Next: add a Cloudflare Tunnel ingress for secretsanta.<domain> -> http://localhost:3001,"
echo "          and a Cloudflare Access app for /admin + /organiser (see deploy/cloudflared.md)."

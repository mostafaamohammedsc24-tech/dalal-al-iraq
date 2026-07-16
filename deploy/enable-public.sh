#!/usr/bin/env bash
set -euo pipefail

DOMAIN=${DOMAIN:-dalalaliraqnetwork.online}
REPO_DIR=${REPO_DIR:-/home/lofydono2002/Dalal Al Iraq/Dalal-al-iraq}
NGINX_SITE=/etc/nginx/sites-available/${DOMAIN}
NGINX_ENABLED=/etc/nginx/sites-enabled/${DOMAIN}

if [ "$EUID" -ne 0 ]; then
  echo "This script must be run as root or with sudo."
  exit 1
fi

if [ ! -d "$REPO_DIR" ]; then
  echo "Repository directory does not exist: $REPO_DIR"
  exit 1
fi

cp "$REPO_DIR/deploy/nginx.conf" "$NGINX_SITE"
ln -sf "$NGINX_SITE" "$NGINX_ENABLED"
nginx -t
systemctl reload nginx

echo "Nginx configured for $DOMAIN and reloaded."
